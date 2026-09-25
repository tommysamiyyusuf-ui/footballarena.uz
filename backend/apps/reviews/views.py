from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.common.exceptions import DomainError
from apps.common.permissions import IsActiveUser, IsCustomer
from apps.reviews.models import Review
from apps.reviews.serializers import (
    ReviewCreateSerializer,
    ReviewReplySerializer,
    ReviewSerializer,
)


@extend_schema(tags=["reviews"])
class ReviewViewSet(mixins.ListModelMixin, mixins.CreateModelMixin,
                    mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ReviewSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [AllowAny()]
        if self.action == "create":
            return [IsCustomer()]
        return [IsActiveUser()]

    def get_queryset(self):
        queryset = Review.objects.select_related("user", "stadium", "booking")
        user = self.request.user

        if not (user.is_authenticated and user.role == "ADMIN"):
            queryset = queryset.filter(is_visible=True)

        params = self.request.query_params
        if params.get("stadium"):
            queryset = queryset.filter(stadium_id=params["stadium"])
        if params.get("mine") == "true" and user.is_authenticated:
            queryset = queryset.filter(user=user)
        if params.get("owner") == "true" and user.is_authenticated:
            queryset = queryset.filter(stadium__owner=user)
        if params.get("rating"):
            queryset = queryset.filter(rating=params["rating"])
        return queryset

    def get_serializer_class(self):
        return ReviewCreateSerializer if self.action == "create" else ReviewSerializer

    @extend_schema(
        summary="List reviews",
        parameters=[
            OpenApiParameter("stadium", str),
            OpenApiParameter("mine", bool),
            OpenApiParameter("owner", bool, description="Owner: reviews on my stadiums."),
        ],
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(summary="Leave a review for a completed booking",
                   request=ReviewCreateSerializer, responses={201: ReviewSerializer})
    def create(self, request, *args, **kwargs):
        serializer = ReviewCreateSerializer(data=request.data,
                                            context={"request": request})
        serializer.is_valid(raise_exception=True)
        review = serializer.save()

        from apps.notifications.services import notify

        notify(
            recipient=review.stadium.owner,
            type="NEW_REVIEW",
            title="Yangi sharh",
            message=f"{review.stadium.name} — {review.rating}★",
            payload={"stadium_id": str(review.stadium_id), "route": "/owner/reviews"},
        )
        return Response(
            ReviewSerializer(review, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Owner replies to a review", request=ReviewReplySerializer)
    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        review = self.get_object()
        if request.user.role != "ADMIN" and review.stadium.owner_id != request.user.id:
            raise DomainError("Faqat stadion egasi javob bera oladi.")

        serializer = ReviewReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review.owner_reply = serializer.validated_data["reply"]
        review.owner_replied_at = timezone.now()
        review.save(update_fields=["owner_reply", "owner_replied_at", "updated_at"])
        return Response(ReviewSerializer(review, context={"request": request}).data)
