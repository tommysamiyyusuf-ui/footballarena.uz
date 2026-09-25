from __future__ import annotations

from django.db.models import F
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
from apps.common.permissions import IsCustomer, IsOwner, IsStadiumOwnerOrAdmin
from apps.stadiums.filters import StadiumFilter
from apps.stadiums.models import (
    Amenity,
    Favorite,
    Stadium,
    StadiumBlackout,
    StadiumImage,
)
from apps.stadiums.serializers import (
    AmenitySerializer,
    AvailabilitySerializer,
    BlackoutSerializer,
    FavoriteSerializer,
    StadiumDetailSerializer,
    StadiumImageSerializer,
    StadiumListSerializer,
    StadiumWriteSerializer,
)
from apps.stadiums.services import (
    annotate_distance,
    build_availability,
    filter_by_radius,
    parse_date,
    search_queryset,
)


def _favorite_ids(request) -> set:
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return set()
    return set(
        Favorite.objects.filter(user=user).values_list("stadium_id", flat=True)
    )


@extend_schema(tags=["stadiums"])
class AmenityListView(ListAPIView):
    queryset = Amenity.objects.all()
    serializer_class = AmenitySerializer
    permission_classes = [AllowAny]
    pagination_class = None


@extend_schema(tags=["stadiums"])
class StadiumViewSet(viewsets.ModelViewSet):
    """
    Public catalogue plus owner-side management.

    Customers only ever see APPROVED + active stadiums whose owner is not blocked.
    Owners see their own stadiums in any status; admins see everything.
    """

    serializer_class = StadiumListSerializer
    filterset_class = StadiumFilter
    search_fields = ("name", "address", "city", "district")
    ordering_fields = ("price_per_hour", "rating", "created_at", "review_count")
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    lookup_field = "pk"

    def get_permissions(self):
        if self.action in {"list", "retrieve", "availability"}:
            return [AllowAny()]
        if self.action in {"create"}:
            return [IsOwner()]
        return [IsAuthenticated(), IsStadiumOwnerOrAdmin()]

    def get_queryset(self):
        base = Stadium.objects.with_relations()
        user = self.request.user
        mine = self.request.query_params.get("mine") == "true"

        if user.is_authenticated and user.role == "ADMIN":
            queryset = base
        elif user.is_authenticated and user.role == "OWNER":
            if mine or self.action not in {"list", "retrieve"}:
                queryset = base.for_owner(user)
            elif self.action == "retrieve":
                # The owner panel links straight to the detail page, and a
                # stadium still in moderation is not in the public queryset.
                queryset = (base.visible() | base.for_owner(user)).distinct()
            else:
                queryset = base.visible()
        else:
            queryset = base.visible()

        return search_queryset(queryset, self.request.query_params)

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return StadiumWriteSerializer
        if self.action == "retrieve":
            return StadiumDetailSerializer
        return StadiumListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["favorite_ids"] = _favorite_ids(self.request)
        return context

    @extend_schema(
        summary="List stadiums (map, cards, search)",
        parameters=[
            OpenApiParameter("lat", float, description="User latitude for distance sorting."),
            OpenApiParameter("lng", float, description="User longitude."),
            OpenApiParameter("radius", float, description="Radius filter in kilometres."),
            OpenApiParameter("search", str, description="Free-text query."),
            OpenApiParameter("min_price", float),
            OpenApiParameter("max_price", float),
            OpenApiParameter("min_rating", float),
            OpenApiParameter("field_type", str),
            OpenApiParameter("amenities", str, description="Comma separated amenity codes."),
            OpenApiParameter("mine", bool, description="Owner: only my stadiums."),
        ],
    )
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        params = request.query_params

        lat, lng = params.get("lat"), params.get("lng")
        if lat and lng:
            try:
                lat_f, lng_f = float(lat), float(lng)
            except ValueError as exc:
                raise DomainError("lat/lng noto'g'ri.") from exc

            radius = params.get("radius")
            if radius:
                try:
                    queryset = filter_by_radius(queryset, lat_f, lng_f, float(radius))
                except ValueError as exc:
                    raise DomainError("radius noto'g'ri.") from exc

            stadiums = annotate_distance(list(queryset), lat_f, lng_f)
            if radius:
                stadiums = [s for s in stadiums if s.distance_km <= float(radius)]
            stadiums.sort(key=lambda s: s.distance_km)

            page = self.paginate_queryset(stadiums)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        stadium = self.get_object()
        Stadium.objects.filter(pk=stadium.pk).update(view_count=F("view_count") + 1)
        serializer = self.get_serializer(stadium)
        return Response(serializer.data)

    def perform_destroy(self, instance):
        from apps.bookings.models import Booking

        if Booking.objects.blocking().filter(stadium=instance).exists():
            raise DomainError(
                "Faol bronlari bor stadionni o'chirib bo'lmaydi. Avval uni yoping."
            )
        instance.delete()

    @extend_schema(
        summary="Hourly availability for a given date",
        parameters=[OpenApiParameter("date", str, description="YYYY-MM-DD, defaults to today.")],
        responses={200: AvailabilitySerializer},
    )
    @action(detail=True, methods=["get"], permission_classes=[AllowAny])
    def availability(self, request, pk=None):
        stadium = self.get_object()
        day = parse_date(request.query_params.get("date"))
        return Response(AvailabilitySerializer(build_availability(stadium, day)).data)

    @extend_schema(summary="Upload additional gallery images")
    @action(detail=True, methods=["post"], permission_classes=[IsAuthenticated,
                                                              IsStadiumOwnerOrAdmin])
    def images(self, request, pk=None):
        stadium = self.get_object()
        files = request.FILES.getlist("images")
        if not files:
            raise DomainError("Rasm yuborilmadi.")
        from apps.common.validators import validate_image_file

        created = []
        offset = stadium.images.count()
        has_cover = stadium.images.filter(is_cover=True).exists()
        for index, file_obj in enumerate(files):
            validate_image_file(file_obj)
            created.append(
                StadiumImage.objects.create(
                    stadium=stadium,
                    image=file_obj,
                    sort_order=offset + index,
                    is_cover=(not has_cover and index == 0),
                )
            )
        return Response(
            StadiumImageSerializer(created, many=True, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Delete a gallery image",
                   parameters=[OpenApiParameter("image_id", OpenApiTypes.UUID,
                                                OpenApiParameter.PATH)])
    @action(detail=True, methods=["delete"], url_path="images/(?P<image_id>[^/.]+)",
            permission_classes=[IsAuthenticated, IsStadiumOwnerOrAdmin])
    def delete_image(self, request, pk=None, image_id=None):
        stadium = self.get_object()
        image = get_object_or_404(StadiumImage, pk=image_id, stadium=stadium)
        image.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(summary="Set a gallery image as the cover",
                   parameters=[OpenApiParameter("image_id", OpenApiTypes.UUID,
                                                OpenApiParameter.PATH)])
    @action(detail=True, methods=["post"], url_path="images/(?P<image_id>[^/.]+)/cover",
            permission_classes=[IsAuthenticated, IsStadiumOwnerOrAdmin])
    def set_cover(self, request, pk=None, image_id=None):
        stadium = self.get_object()
        image = get_object_or_404(StadiumImage, pk=image_id, stadium=stadium)
        image.is_cover = True
        image.save()
        return Response(StadiumImageSerializer(image, context={"request": request}).data)

    @extend_schema(summary="List or create blackout windows", request=BlackoutSerializer)
    @action(detail=True, methods=["get", "post"],
            permission_classes=[IsAuthenticated, IsStadiumOwnerOrAdmin])
    def blackouts(self, request, pk=None):
        stadium = self.get_object()
        if request.method == "GET":
            queryset = StadiumBlackout.objects.filter(stadium=stadium)
            return Response(BlackoutSerializer(queryset, many=True).data)
        serializer = BlackoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(stadium=stadium)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Delete a blackout window",
                   parameters=[OpenApiParameter("blackout_id", OpenApiTypes.UUID,
                                                OpenApiParameter.PATH)])
    @action(detail=True, methods=["delete"], url_path="blackouts/(?P<blackout_id>[^/.]+)",
            permission_classes=[IsAuthenticated, IsStadiumOwnerOrAdmin])
    def delete_blackout(self, request, pk=None, blackout_id=None):
        stadium = self.get_object()
        get_object_or_404(StadiumBlackout, pk=blackout_id, stadium=stadium).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["favorites"])
class FavoriteViewSet(viewsets.GenericViewSet):
    permission_classes = [IsCustomer]
    serializer_class = FavoriteSerializer
    queryset = Favorite.objects.none()  # schema introspection only

    def get_queryset(self):
        return (
            Favorite.objects.filter(user=self.request.user)
            .select_related("stadium")
            .prefetch_related("stadium__images", "stadium__amenities")
        )

    @extend_schema(summary="List favorite stadiums")
    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        serializer = self.get_serializer(page, many=True,
                                         context={"request": request,
                                                  "favorite_ids": _favorite_ids(request)})
        return self.get_paginated_response(serializer.data)

    @extend_schema(
        summary="Toggle a stadium favorite",
        request=None,
        parameters=[OpenApiParameter("stadium_id", OpenApiTypes.UUID,
                                     OpenApiParameter.PATH)],
        responses={200: dict, 201: dict},
    )
    @action(detail=False, methods=["post"], url_path="(?P<stadium_id>[^/.]+)/toggle")
    def toggle(self, request, stadium_id=None):
        stadium = get_object_or_404(Stadium.objects.visible(), pk=stadium_id)
        favorite = Favorite.objects.filter(user=request.user, stadium=stadium).first()
        if favorite:
            favorite.delete()
            return Response({"is_favorite": False})
        Favorite.objects.create(user=request.user, stadium=stadium)
        return Response({"is_favorite": True}, status=status.HTTP_201_CREATED)


@extend_schema(tags=["stadiums"])
class CityListView(APIView):
    """Cities and districts that actually have bookable stadiums."""

    permission_classes = [AllowAny]

    @extend_schema(summary="Available cities and districts", responses={200: dict})
    def get(self, request):
        rows = (
            Stadium.objects.visible()
            .values("city", "district")
            .order_by("city", "district")
            .distinct()
        )
        grouped: dict[str, list[str]] = {}
        for row in rows:
            grouped.setdefault(row["city"], [])
            if row["district"] and row["district"] not in grouped[row["city"]]:
                grouped[row["city"]].append(row["district"])
        return Response(
            [{"city": city, "districts": districts} for city, districts in grouped.items()]
        )
