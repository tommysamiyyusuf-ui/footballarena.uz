from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.services import (
    booking_counters,
    daily_series,
    monthly_series,
    occupancy_rate,
    owner_bookings,
    popular_hours,
    revenue_summary,
    stadium_performance,
    weekday_distribution,
)
from apps.bookings.models import Booking, BookingStatus
from apps.bookings.serializers import BookingListSerializer
from apps.common.permissions import IsOwner
from apps.reviews.models import Review
from apps.stadiums.models import Stadium, StadiumStatus


@extend_schema(tags=["owner"])
class OwnerDashboardView(APIView):
    permission_classes = [IsOwner]

    @extend_schema(summary="Owner dashboard summary", responses={200: dict})
    def get(self, request):
        owner = request.user
        bookings = owner_bookings(owner)
        stadiums = Stadium.objects.for_owner(owner)
        today = timezone.localdate()

        revenue = revenue_summary(bookings)
        counters = booking_counters(bookings)

        recent = (
            bookings.with_relations()
            .filter(status=BookingStatus.PENDING)
            .order_by("starts_at")[:5]
        )
        upcoming = (
            bookings.with_relations()
            .filter(status=BookingStatus.APPROVED, starts_at__gte=timezone.now())
            .order_by("starts_at")[:5]
        )

        return Response(
            {
                "stadiums": {
                    "total": stadiums.count(),
                    "approved": stadiums.filter(status=StadiumStatus.APPROVED).count(),
                    "pending": stadiums.filter(status=StadiumStatus.PENDING).count(),
                    "rejected": stadiums.filter(status=StadiumStatus.REJECTED).count(),
                    "inactive": stadiums.filter(is_active=False).count(),
                },
                "bookings": counters,
                "today_bookings": bookings.filter(date=today).count(),
                "revenue": revenue,
                "rating": {
                    "average": round(
                        sum(float(s.rating) for s in stadiums) / stadiums.count(), 2
                    ) if stadiums.count() else 0,
                    "reviews": Review.objects.filter(stadium__owner=owner,
                                                     is_visible=True).count(),
                },
                "occupancy_rate": occupancy_rate(bookings, stadiums.count()),
                "pending_requests": BookingListSerializer(
                    recent, many=True, context={"request": request}
                ).data,
                "upcoming_bookings": BookingListSerializer(
                    upcoming, many=True, context={"request": request}
                ).data,
            }
        )


@extend_schema(tags=["owner"])
class OwnerStatisticsView(APIView):
    permission_classes = [IsOwner]

    @extend_schema(
        summary="Owner analytics charts",
        parameters=[
            OpenApiParameter("days", int, description="Daily series length, default 30."),
            OpenApiParameter("stadium", str, description="Restrict to one stadium."),
        ],
        responses={200: dict},
    )
    def get(self, request):
        owner = request.user
        bookings = owner_bookings(owner)
        if request.query_params.get("stadium"):
            bookings = bookings.filter(stadium_id=request.query_params["stadium"])

        try:
            days = min(max(int(request.query_params.get("days", 30)), 7), 365)
        except ValueError:
            days = 30

        return Response(
            {
                "revenue": revenue_summary(bookings),
                "counters": booking_counters(bookings),
                "daily": daily_series(bookings, days),
                "monthly": monthly_series(bookings),
                "popular_hours": popular_hours(bookings),
                "weekdays": weekday_distribution(bookings),
                "stadium_performance": stadium_performance(bookings),
            }
        )


@extend_schema(tags=["owner"])
class OwnerCalendarView(APIView):
    """Month view of every booking on the owner's stadiums."""

    permission_classes = [IsOwner]

    @extend_schema(
        summary="Bookings for a calendar month",
        parameters=[
            OpenApiParameter("year", int),
            OpenApiParameter("month", int),
            OpenApiParameter("stadium", str),
        ],
        responses={200: dict},
    )
    def get(self, request):
        today = timezone.localdate()
        try:
            year = int(request.query_params.get("year", today.year))
            month = int(request.query_params.get("month", today.month))
        except ValueError:
            year, month = today.year, today.month

        queryset = Booking.objects.filter(
            owner=request.user, date__year=year, date__month=month
        ).select_related("stadium", "user").order_by("date", "start_time")

        if request.query_params.get("stadium"):
            queryset = queryset.filter(stadium_id=request.query_params["stadium"])

        days: dict[str, list] = {}
        for booking in queryset:
            days.setdefault(booking.date.isoformat(), []).append(
                {
                    "id": str(booking.id),
                    "reference": booking.reference,
                    "stadium": booking.stadium.name,
                    "stadium_id": str(booking.stadium_id),
                    "customer": booking.user.get_full_name() or "Mijoz",
                    "start_time": booking.start_time.strftime("%H:%M"),
                    "end_time": booking.end_time.strftime("%H:%M"),
                    "duration_hours": booking.duration_hours,
                    "total_price": booking.total_price,
                    "status": booking.status,
                }
            )
        return Response({"year": year, "month": month, "days": days})
