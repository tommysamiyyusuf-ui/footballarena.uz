from __future__ import annotations

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bookings.models import Booking, BookingStatus
from apps.bookings.serializers import (
    BookingCreateSerializer,
    BookingDecisionSerializer,
    BookingDetailSerializer,
    BookingListSerializer,
    QuoteSerializer,
)
from apps.bookings.services import (
    alternatives_for,
    approve_booking,
    cancel_booking,
    create_booking,
    quote,
    reject_booking,
)
from apps.common.exceptions import DomainError, SlotUnavailable
from apps.common.permissions import IsActiveUser, IsAdminOrOwner, IsCustomer
from apps.stadiums.models import Stadium


@extend_schema(tags=["bookings"])
class BookingViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Bookings, scoped by role:
      * customer — their own bookings
      * owner    — bookings on their stadiums
      * admin    — everything
    """

    permission_classes = [IsActiveUser]
    serializer_class = BookingListSerializer
    queryset = Booking.objects.none()  # schema introspection only

    def get_queryset(self):
        queryset = (
            Booking.objects.with_relations()
            .for_actor(self.request.user)
            .prefetch_related("status_history", "conversations")
        )
        params = self.request.query_params

        status_param = params.get("status")
        if status_param:
            statuses = [s.strip().upper() for s in status_param.split(",") if s.strip()]
            queryset = queryset.filter(status__in=statuses)

        scope = params.get("scope")
        now = timezone.now()
        if scope == "upcoming":
            queryset = queryset.filter(
                ends_at__gte=now,
                status__in=[BookingStatus.PENDING, BookingStatus.APPROVED],
            ).order_by("starts_at")
        elif scope == "past":
            queryset = queryset.filter(ends_at__lt=now)

        if params.get("stadium"):
            queryset = queryset.filter(stadium_id=params["stadium"])
        if params.get("date"):
            queryset = queryset.filter(date=params["date"])
        if params.get("date_from"):
            queryset = queryset.filter(date__gte=params["date_from"])
        if params.get("date_to"):
            queryset = queryset.filter(date__lte=params["date_to"])
        if params.get("search"):
            from django.db.models import Q

            term = params["search"]
            queryset = queryset.filter(
                Q(reference__icontains=term)
                | Q(stadium__name__icontains=term)
                | Q(user__first_name__icontains=term)
                | Q(user__last_name__icontains=term)
                | Q(user__phone__icontains=term)
            )
        return queryset

    def get_serializer_class(self):
        return BookingDetailSerializer if self.action == "retrieve" else BookingListSerializer

    @extend_schema(
        summary="List bookings",
        parameters=[
            OpenApiParameter("status", str, description="Comma separated statuses."),
            OpenApiParameter("scope", str, description="upcoming | past"),
            OpenApiParameter("stadium", str),
            OpenApiParameter("date_from", str),
            OpenApiParameter("date_to", str),
            OpenApiParameter("search", str),
        ],
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(summary="Create a booking request", request=BookingCreateSerializer,
                   responses={201: BookingDetailSerializer})
    @action(detail=False, methods=["post"], permission_classes=[IsCustomer])
    def create_booking(self, request):
        serializer = BookingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            booking = create_booking(
                user=request.user,
                stadium_id=data["stadium_id"],
                day=data["date"],
                start=data["start_time"],
                duration_hours=data["duration_hours"],
                customer_note=data.get("customer_note", ""),
                contact_phone=data.get("contact_phone", ""),
                players_count=data.get("players_count"),
            )
        except SlotUnavailable as exc:
            stadium = Stadium.objects.filter(pk=data["stadium_id"]).first()
            alternatives = (
                alternatives_for(stadium, data["date"], data["duration_hours"])
                if stadium else []
            )
            return Response(
                {
                    "success": False,
                    "code": "slot_unavailable",
                    "message": str(exc.detail),
                    "errors": {},
                    "alternatives": alternatives,
                },
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            BookingDetailSerializer(booking, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Owner approves a booking",
                   responses={200: BookingDetailSerializer})
    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrOwner])
    def approve(self, request, pk=None):
        booking = approve_booking(pk, request.user)
        return Response(BookingDetailSerializer(booking, context={"request": request}).data)

    @extend_schema(summary="Owner rejects a booking", request=BookingDecisionSerializer,
                   responses={200: BookingDetailSerializer})
    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrOwner])
    def reject(self, request, pk=None):
        serializer = BookingDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "")
        booking = reject_booking(pk, request.user, reason)
        return Response(BookingDetailSerializer(booking, context={"request": request}).data)

    @extend_schema(summary="Cancel a booking", request=BookingDecisionSerializer,
                   responses={200: BookingDetailSerializer})
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = BookingDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Ensure the actor is allowed to even see this booking before mutating it.
        get_object_or_404(Booking.objects.for_actor(request.user), pk=pk)
        booking = cancel_booking(pk, request.user,
                                 serializer.validated_data.get("reason", ""))
        return Response(BookingDetailSerializer(booking, context={"request": request}).data)


@extend_schema(tags=["bookings"])
class BookingQuoteView(APIView):
    """Authoritative price calculation — the frontend mirrors it, never defines it."""

    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Price quote for a duration", request=QuoteSerializer,
                   responses={200: dict})
    def post(self, request):
        serializer = QuoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stadium = Stadium.objects.filter(pk=serializer.validated_data["stadium_id"]).first()
        if stadium is None:
            raise DomainError("Stadion topilmadi.")
        return Response(quote(stadium, serializer.validated_data["duration_hours"]))
