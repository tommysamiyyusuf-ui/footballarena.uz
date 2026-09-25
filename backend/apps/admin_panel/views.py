from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.admin_panel.serializers import (
    AdminBookingSerializer,
    AdminOwnerSerializer,
    AdminUserSerializer,
    BlockSerializer,
    OwnerCreateSerializer,
    OwnerUpdateSerializer,
)
from apps.analytics.services import (
    REVENUE_STATUSES,
    booking_counters,
    daily_series,
    growth_series,
    monthly_series,
    popular_hours,
    revenue_summary,
    stadium_performance,
)
from apps.bookings.models import Booking, BookingStatus
from apps.common.exceptions import DomainError
from apps.common.models import AuditLog, PlatformSetting
from apps.common.pagination import LargePagination
from apps.common.permissions import IsAdmin
from apps.common.serializers import AuditLogSerializer, PlatformSettingSerializer
from apps.common.services import record_audit
from apps.reviews.models import Review
from apps.reviews.serializers import ReviewSerializer
from apps.stadiums.models import Stadium, StadiumStatus
from apps.stadiums.serializers import ModerationSerializer, StadiumDetailSerializer
from apps.users.models import Role, User

MONEY = DecimalField(max_digits=18, decimal_places=2)


@extend_schema(tags=["admin"])
class AdminDashboardView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(summary="Platform-wide dashboard", responses={200: dict})
    def get(self, request):
        today = timezone.localdate()
        bookings = Booking.objects.all()
        earning = bookings.filter(status__in=REVENUE_STATUSES)

        totals = earning.aggregate(
            gross=Coalesce(Sum("total_price"), Value(Decimal("0")), output_field=MONEY),
            commission=Coalesce(Sum("commission_amount"), Value(Decimal("0")),
                                output_field=MONEY),
            owner_net=Coalesce(Sum("owner_earning"), Value(Decimal("0")),
                               output_field=MONEY),
        )

        return Response(
            {
                "users": {
                    "total": User.objects.filter(role=Role.USER).count(),
                    "blocked": User.objects.filter(role=Role.USER, is_blocked=True).count(),
                    "new_today": User.objects.filter(role=Role.USER,
                                                     created_at__date=today).count(),
                },
                "owners": {
                    "total": User.objects.filter(role=Role.OWNER).count(),
                    "blocked": User.objects.filter(role=Role.OWNER,
                                                   is_blocked=True).count(),
                },
                "stadiums": {
                    "total": Stadium.objects.count(),
                    "approved": Stadium.objects.filter(
                        status=StadiumStatus.APPROVED).count(),
                    "pending": Stadium.objects.filter(
                        status=StadiumStatus.PENDING).count(),
                    "rejected": Stadium.objects.filter(
                        status=StadiumStatus.REJECTED).count(),
                    "blocked": Stadium.objects.filter(
                        status=StadiumStatus.BLOCKED).count(),
                },
                "bookings": booking_counters(bookings),
                "revenue": {
                    "gross": totals["gross"],
                    "platform_commission": totals["commission"],
                    "owner_net": totals["owner_net"],
                    "today": earning.filter(date=today).aggregate(
                        total=Coalesce(Sum("total_price"), Value(Decimal("0")),
                                       output_field=MONEY)
                    )["total"],
                },
                "reviews": {
                    "total": Review.objects.count(),
                    "hidden": Review.objects.filter(is_visible=False).count(),
                },
                "pending_stadiums": StadiumDetailSerializer(
                    Stadium.objects.filter(status=StadiumStatus.PENDING)
                    .with_relations().order_by("created_at")[:5],
                    many=True, context={"request": request},
                ).data,
            }
        )


@extend_schema(tags=["admin"])
class AdminStatisticsView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(
        summary="Platform growth and revenue charts",
        parameters=[OpenApiParameter("days", int)],
        responses={200: dict},
    )
    def get(self, request):
        try:
            days = min(max(int(request.query_params.get("days", 30)), 7), 365)
        except ValueError:
            days = 30

        bookings = Booking.objects.all()
        return Response(
            {
                "revenue": revenue_summary(bookings),
                "daily": daily_series(bookings, days),
                "monthly": monthly_series(bookings),
                "popular_hours": popular_hours(bookings),
                "stadium_performance": stadium_performance(bookings, limit=10),
                "user_growth": growth_series(User, days),
                "stadium_growth": growth_series(Stadium, days),
                "booking_growth": growth_series(Booking, days),
            }
        )


@extend_schema(tags=["admin"])
class AdminUserViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                       viewsets.GenericViewSet):
    permission_classes = [IsAdmin]
    serializer_class = AdminUserSerializer
    pagination_class = LargePagination

    def get_queryset(self):
        queryset = User.objects.filter(role=Role.USER).annotate(
            booking_count=Count("bookings", distinct=True),
            completed_bookings=Count(
                "bookings", filter=Q(bookings__status=BookingStatus.COMPLETED),
                distinct=True,
            ),
            total_spent=Coalesce(
                Sum("bookings__total_price",
                    filter=Q(bookings__status__in=REVENUE_STATUSES)),
                Value(Decimal("0")), output_field=MONEY,
            ),
        )
        params = self.request.query_params
        if params.get("search"):
            term = params["search"]
            queryset = queryset.filter(
                Q(first_name__icontains=term) | Q(last_name__icontains=term)
                | Q(phone__icontains=term) | Q(email__icontains=term)
                | Q(telegram_username__icontains=term)
            )
        if params.get("status") == "blocked":
            queryset = queryset.filter(is_blocked=True)
        elif params.get("status") == "active":
            queryset = queryset.filter(is_blocked=False)
        return queryset.order_by("-created_at")

    @extend_schema(summary="Block a customer", request=BlockSerializer)
    @action(detail=True, methods=["post"])
    def block(self, request, pk=None):
        user = self.get_object()
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "")
        user.block(reason)
        record_audit(actor=request.user, action=AuditLog.Action.USER_BLOCKED,
                     target=user, description=reason, request=request)
        return Response({"success": True, "is_blocked": True})

    @extend_schema(summary="Unblock a customer", request=None)
    @action(detail=True, methods=["post"])
    def unblock(self, request, pk=None):
        user = self.get_object()
        user.unblock()
        record_audit(actor=request.user, action=AuditLog.Action.USER_UNBLOCKED,
                     target=user, request=request)
        return Response({"success": True, "is_blocked": False})

    @extend_schema(summary="Bookings made by this customer")
    @action(detail=True, methods=["get"])
    def bookings(self, request, pk=None):
        user = self.get_object()
        queryset = Booking.objects.filter(user=user).select_related("stadium", "owner")
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(AdminBookingSerializer(page, many=True).data)


@extend_schema(tags=["admin"])
class AdminOwnerViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAdmin]
    serializer_class = AdminOwnerSerializer
    pagination_class = LargePagination

    def get_queryset(self):
        queryset = User.objects.filter(role=Role.OWNER).select_related(
            "owner_profile"
        ).annotate(
            stadium_count=Count("stadiums", distinct=True),
            booking_count=Count("owned_bookings", distinct=True),
            completed_bookings=Count(
                "owned_bookings",
                filter=Q(owned_bookings__status=BookingStatus.COMPLETED), distinct=True,
            ),
            total_revenue=Coalesce(
                Sum("owned_bookings__total_price",
                    filter=Q(owned_bookings__status__in=REVENUE_STATUSES)),
                Value(Decimal("0")), output_field=MONEY,
            ),
            total_spent=Value(Decimal("0"), output_field=MONEY),
        )
        params = self.request.query_params
        if params.get("search"):
            term = params["search"]
            queryset = queryset.filter(
                Q(first_name__icontains=term) | Q(last_name__icontains=term)
                | Q(username__icontains=term) | Q(phone__icontains=term)
                | Q(owner_profile__company_name__icontains=term)
            )
        if params.get("status") == "blocked":
            queryset = queryset.filter(is_blocked=True)
        elif params.get("status") == "active":
            queryset = queryset.filter(is_blocked=False)
        return queryset.order_by("-created_at")

    @extend_schema(summary="Create an owner account", request=OwnerCreateSerializer,
                   responses={201: AdminOwnerSerializer})
    def create(self, request):
        serializer = OwnerCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        owner = serializer.save()
        record_audit(actor=request.user, action=AuditLog.Action.OWNER_CREATED,
                     target=owner, description=f"Owner {owner.username} created",
                     request=request)
        return Response(
            AdminOwnerSerializer(self.get_queryset().get(pk=owner.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Update an owner account", request=OwnerUpdateSerializer)
    def partial_update(self, request, pk=None):
        owner = get_object_or_404(User.objects.filter(role=Role.OWNER), pk=pk)
        serializer = OwnerUpdateSerializer(owner, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record_audit(actor=request.user, action=AuditLog.Action.OWNER_UPDATED,
                     target=owner, request=request)
        return Response(AdminOwnerSerializer(self.get_queryset().get(pk=owner.pk)).data)

    def perform_destroy(self, instance):
        if Booking.objects.blocking().filter(owner=instance).exists():
            raise DomainError(
                "Faol bronlari bor arendatorni o'chirib bo'lmaydi. Uni bloklang."
            )
        record_audit(actor=self.request.user, action=AuditLog.Action.OWNER_DELETED,
                     target=instance, description=f"Owner {instance.username} deleted",
                     request=self.request)
        instance.delete()

    @extend_schema(summary="Block an owner (their stadiums stop accepting bookings)",
                   request=BlockSerializer)
    @action(detail=True, methods=["post"])
    def block(self, request, pk=None):
        owner = self.get_object()
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        owner.block(serializer.validated_data.get("reason", ""))
        record_audit(actor=request.user, action=AuditLog.Action.USER_BLOCKED,
                     target=owner, description=serializer.validated_data.get("reason", ""),
                     request=request)
        return Response({"success": True, "is_blocked": True})

    @extend_schema(summary="Unblock an owner", request=None)
    @action(detail=True, methods=["post"])
    def unblock(self, request, pk=None):
        owner = self.get_object()
        owner.unblock()
        record_audit(actor=request.user, action=AuditLog.Action.USER_UNBLOCKED,
                     target=owner, request=request)
        return Response({"success": True, "is_blocked": False})

    @extend_schema(summary="Revenue and booking statistics for one owner")
    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        owner = get_object_or_404(User.objects.filter(role=Role.OWNER), pk=pk)
        bookings = Booking.objects.filter(owner=owner)
        return Response(
            {
                "revenue": revenue_summary(bookings),
                "counters": booking_counters(bookings),
                "daily": daily_series(bookings, 30),
                "stadium_performance": stadium_performance(bookings),
            }
        )


@extend_schema(tags=["admin"])
class AdminStadiumViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          viewsets.GenericViewSet):
    permission_classes = [IsAdmin]
    serializer_class = StadiumDetailSerializer
    pagination_class = LargePagination

    def get_queryset(self):
        queryset = Stadium.objects.with_relations()
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"].upper())
        if params.get("owner"):
            queryset = queryset.filter(owner_id=params["owner"])
        if params.get("search"):
            term = params["search"]
            queryset = queryset.filter(
                Q(name__icontains=term) | Q(city__icontains=term)
                | Q(district__icontains=term) | Q(address__icontains=term)
            )
        return queryset.order_by("-created_at")

    @extend_schema(summary="Stadiums awaiting moderation")
    @action(detail=False, methods=["get"])
    def pending(self, request):
        queryset = self.get_queryset().filter(status=StadiumStatus.PENDING).order_by(
            "created_at"
        )
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(
            StadiumDetailSerializer(page, many=True, context={"request": request}).data
        )

    @extend_schema(summary="Approve / reject / block a stadium",
                   request=ModerationSerializer,
                   responses={200: StadiumDetailSerializer})
    @action(detail=True, methods=["post"])
    def moderate(self, request, pk=None):
        stadium = self.get_object()
        serializer = ModerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data["action"]
        note = serializer.validated_data.get("note", "")

        mapping = {
            "APPROVE": (StadiumStatus.APPROVED, AuditLog.Action.STADIUM_APPROVED,
                        "STADIUM_APPROVED", "Stadioningiz tasdiqlandi"),
            "REJECT": (StadiumStatus.REJECTED, AuditLog.Action.STADIUM_REJECTED,
                       "STADIUM_REJECTED", "Stadioningiz rad etildi"),
            "REQUEST_CHANGES": (StadiumStatus.PENDING,
                                AuditLog.Action.STADIUM_CHANGES_REQUESTED,
                                "STADIUM_CHANGES_REQUESTED",
                                "Stadion bo'yicha o'zgartirish talab qilinadi"),
            "BLOCK": (StadiumStatus.BLOCKED, AuditLog.Action.STADIUM_BLOCKED,
                      "STADIUM_REJECTED", "Stadioningiz bloklandi"),
        }
        new_status, audit_action, notification_type, title = mapping[decision]

        stadium.status = new_status
        stadium.moderation_note = note
        stadium.reviewed_by = request.user
        stadium.reviewed_at = timezone.now()
        stadium.save(update_fields=["status", "moderation_note", "reviewed_by",
                                    "reviewed_at", "updated_at"])

        record_audit(actor=request.user, action=audit_action, target=stadium,
                     description=note, request=request)

        from apps.notifications.services import notify

        notify(
            recipient=stadium.owner,
            type=notification_type,
            title=title,
            message=f"{stadium.name}. {note}".strip(),
            payload={"stadium_id": str(stadium.id),
                     "route": f"/owner/stadiums/{stadium.id}/edit"},
        )
        return Response(
            StadiumDetailSerializer(stadium, context={"request": request}).data
        )


@extend_schema(tags=["admin"])
class AdminBookingListView(ListAPIView):
    permission_classes = [IsAdmin]
    serializer_class = AdminBookingSerializer
    pagination_class = LargePagination

    @extend_schema(
        summary="All bookings across the platform",
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("stadium", str),
            OpenApiParameter("owner", str),
            OpenApiParameter("user", str),
            OpenApiParameter("date_from", str),
            OpenApiParameter("date_to", str),
            OpenApiParameter("search", str),
        ],
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        queryset = Booking.objects.select_related("stadium", "user", "owner")
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status__in=[s.strip().upper()
                                                   for s in params["status"].split(",")])
        for key, field in (("stadium", "stadium_id"), ("owner", "owner_id"),
                           ("user", "user_id")):
            if params.get(key):
                queryset = queryset.filter(**{field: params[key]})
        if params.get("date_from"):
            queryset = queryset.filter(date__gte=params["date_from"])
        if params.get("date_to"):
            queryset = queryset.filter(date__lte=params["date_to"])
        if params.get("search"):
            term = params["search"]
            queryset = queryset.filter(
                Q(reference__icontains=term) | Q(stadium__name__icontains=term)
                | Q(user__first_name__icontains=term) | Q(user__last_name__icontains=term)
                | Q(user__phone__icontains=term)
            )
        return queryset.order_by("-created_at")


@extend_schema(tags=["admin"])
class AdminFinanceView(APIView):
    permission_classes = [IsAdmin]

    @extend_schema(
        summary="Finance overview with commission breakdown",
        parameters=[OpenApiParameter("date_from", str), OpenApiParameter("date_to", str)],
        responses={200: dict},
    )
    def get(self, request):
        queryset = Booking.objects.filter(status__in=REVENUE_STATUSES)
        params = request.query_params
        if params.get("date_from"):
            queryset = queryset.filter(date__gte=params["date_from"])
        if params.get("date_to"):
            queryset = queryset.filter(date__lte=params["date_to"])

        totals = queryset.aggregate(
            gross=Coalesce(Sum("total_price"), Value(Decimal("0")), output_field=MONEY),
            commission=Coalesce(Sum("commission_amount"), Value(Decimal("0")),
                                output_field=MONEY),
            owner_net=Coalesce(Sum("owner_earning"), Value(Decimal("0")),
                               output_field=MONEY),
            bookings=Count("id"),
        )

        by_owner = (
            queryset.values("owner_id", "owner__first_name", "owner__last_name",
                            "owner__username")
            .annotate(
                gross=Coalesce(Sum("total_price"), Value(Decimal("0")),
                               output_field=MONEY),
                commission=Coalesce(Sum("commission_amount"), Value(Decimal("0")),
                                    output_field=MONEY),
                net=Coalesce(Sum("owner_earning"), Value(Decimal("0")),
                             output_field=MONEY),
                bookings=Count("id"),
            )
            .order_by("-gross")
        )

        return Response(
            {
                "totals": totals,
                "revenue": revenue_summary(Booking.objects.all()),
                "daily": daily_series(Booking.objects.all(), 30),
                "monthly": monthly_series(Booking.objects.all()),
                "by_owner": [
                    {
                        "owner_id": str(row["owner_id"]),
                        "owner_name": (
                            f"{row['owner__first_name']} {row['owner__last_name']}".strip()
                            or row["owner__username"] or ""
                        ),
                        "gross": row["gross"],
                        "commission": row["commission"],
                        "net": row["net"],
                        "bookings": row["bookings"],
                    }
                    for row in by_owner
                ],
            }
        )


@extend_schema(tags=["admin"])
class AdminReviewViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAdmin]
    serializer_class = ReviewSerializer
    pagination_class = LargePagination

    def get_queryset(self):
        queryset = Review.objects.select_related("user", "stadium", "booking")
        params = self.request.query_params
        if params.get("visible") == "false":
            queryset = queryset.filter(is_visible=False)
        elif params.get("visible") == "true":
            queryset = queryset.filter(is_visible=True)
        if params.get("stadium"):
            queryset = queryset.filter(stadium_id=params["stadium"])
        if params.get("rating"):
            queryset = queryset.filter(rating=params["rating"])
        return queryset.order_by("-created_at")

    @extend_schema(summary="Hide a review", request=BlockSerializer)
    @action(detail=True, methods=["post"])
    def hide(self, request, pk=None):
        review = self.get_object()
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review.is_visible = False
        review.hidden_reason = serializer.validated_data.get("reason", "")
        review.save(update_fields=["is_visible", "hidden_reason", "updated_at"])
        review.stadium.recalculate_rating()
        record_audit(actor=request.user, action=AuditLog.Action.REVIEW_HIDDEN,
                     target=review, description=review.hidden_reason, request=request)
        return Response(ReviewSerializer(review, context={"request": request}).data)

    @extend_schema(summary="Restore a hidden review", request=None)
    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        review = self.get_object()
        review.is_visible = True
        review.hidden_reason = ""
        review.save(update_fields=["is_visible", "hidden_reason", "updated_at"])
        review.stadium.recalculate_rating()
        record_audit(actor=request.user, action=AuditLog.Action.REVIEW_RESTORED,
                     target=review, request=request)
        return Response(ReviewSerializer(review, context={"request": request}).data)


@extend_schema(tags=["admin"])
class AdminSettingsView(RetrieveUpdateAPIView):
    permission_classes = [IsAdmin]
    serializer_class = PlatformSettingSerializer

    def get_object(self):
        return PlatformSetting.load()

    def perform_update(self, serializer):
        serializer.save()
        record_audit(actor=self.request.user, action=AuditLog.Action.SETTINGS_UPDATED,
                     description="Platform settings updated",
                     metadata=serializer.validated_data and
                     {k: str(v) for k, v in serializer.validated_data.items()},
                     request=self.request)


@extend_schema(tags=["admin"])
class AdminAuditLogView(ListAPIView):
    permission_classes = [IsAdmin]
    serializer_class = AuditLogSerializer
    pagination_class = LargePagination

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor")
        params = self.request.query_params
        if params.get("action"):
            queryset = queryset.filter(action=params["action"])
        if params.get("actor"):
            queryset = queryset.filter(actor_id=params["actor"])
        if params.get("days"):
            try:
                since = timezone.now() - timedelta(days=int(params["days"]))
                queryset = queryset.filter(created_at__gte=since)
            except ValueError:
                pass
        return queryset
