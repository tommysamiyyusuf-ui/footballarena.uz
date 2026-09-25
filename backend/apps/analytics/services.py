"""Aggregation helpers shared by the owner and admin dashboards."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Avg, Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncDate, TruncMonth
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus

# Only these statuses represent money that was actually earned.
REVENUE_STATUSES = (BookingStatus.APPROVED, BookingStatus.COMPLETED)

MONEY = DecimalField(max_digits=18, decimal_places=2)


def _sum(queryset, field: str) -> Decimal:
    return queryset.aggregate(
        total=Coalesce(Sum(field), Value(Decimal("0")), output_field=MONEY)
    )["total"]


def revenue_summary(bookings) -> dict:
    """Revenue rolled up over today / week / month / year / all-time."""
    today = timezone.localdate()
    earning = bookings.filter(status__in=REVENUE_STATUSES)

    windows = {
        "today": earning.filter(date=today),
        "week": earning.filter(date__gte=today - timedelta(days=today.weekday())),
        "month": earning.filter(date__year=today.year, date__month=today.month),
        "year": earning.filter(date__year=today.year),
        "total": earning,
    }
    return {
        key: {
            "gross": _sum(queryset, "total_price"),
            "commission": _sum(queryset, "commission_amount"),
            "net": _sum(queryset, "owner_earning"),
            "bookings": queryset.count(),
        }
        for key, queryset in windows.items()
    }


def booking_counters(bookings) -> dict:
    today = timezone.localdate()
    counts = bookings.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status=BookingStatus.PENDING)),
        approved=Count("id", filter=Q(status=BookingStatus.APPROVED)),
        completed=Count("id", filter=Q(status=BookingStatus.COMPLETED)),
        cancelled=Count("id", filter=Q(status=BookingStatus.CANCELLED)),
        rejected=Count("id", filter=Q(status=BookingStatus.REJECTED)),
        expired=Count("id", filter=Q(status=BookingStatus.EXPIRED)),
    )
    counts["today"] = bookings.filter(date=today).count()
    counts["upcoming"] = bookings.filter(
        starts_at__gte=timezone.now(), status__in=REVENUE_STATUSES
    ).count()
    return counts


def daily_series(bookings, days: int = 30) -> list[dict]:
    """Revenue and booking volume per day, zero-filled for missing dates."""
    start = timezone.localdate() - timedelta(days=days - 1)
    rows = (
        bookings.filter(date__gte=start, status__in=REVENUE_STATUSES)
        .annotate(day=TruncDate("date"))
        .values("day")
        .annotate(revenue=Coalesce(Sum("total_price"), Value(Decimal("0")),
                                   output_field=MONEY),
                  bookings=Count("id"))
        .order_by("day")
    )
    by_day = {row["day"]: row for row in rows}
    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        row = by_day.get(day)
        series.append(
            {
                "date": day.isoformat(),
                "revenue": row["revenue"] if row else Decimal("0"),
                "bookings": row["bookings"] if row else 0,
            }
        )
    return series


def monthly_series(bookings, months: int = 12) -> list[dict]:
    today = timezone.localdate()
    start = (today.replace(day=1) - timedelta(days=31 * (months - 1))).replace(day=1)
    rows = (
        bookings.filter(date__gte=start, status__in=REVENUE_STATUSES)
        .annotate(month=TruncMonth("date"))
        .values("month")
        .annotate(revenue=Coalesce(Sum("total_price"), Value(Decimal("0")),
                                   output_field=MONEY),
                  bookings=Count("id"))
        .order_by("month")
    )
    return [
        {"month": row["month"].strftime("%Y-%m"), "revenue": row["revenue"],
         "bookings": row["bookings"]}
        for row in rows
    ]


def popular_hours(bookings) -> list[dict]:
    rows = (
        bookings.filter(status__in=REVENUE_STATUSES)
        .values("start_time")
        .annotate(bookings=Count("id"))
        .order_by("start_time")
    )
    buckets: dict[int, int] = {}
    for row in rows:
        buckets[row["start_time"].hour] = buckets.get(row["start_time"].hour, 0) + row["bookings"]
    return [{"hour": f"{hour:02d}:00", "bookings": count}
            for hour, count in sorted(buckets.items())]


def weekday_distribution(bookings) -> list[dict]:
    names = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma",
             "Shanba", "Yakshanba"]
    buckets = {index: 0 for index in range(7)}
    for booking_date in bookings.filter(status__in=REVENUE_STATUSES).values_list(
        "date", flat=True
    ):
        buckets[booking_date.weekday()] += 1
    return [{"weekday": names[index], "bookings": count}
            for index, count in buckets.items()]


def stadium_performance(bookings, limit: int = 10) -> list[dict]:
    rows = (
        bookings.filter(status__in=REVENUE_STATUSES)
        .values("stadium_id", "stadium__name")
        .annotate(
            revenue=Coalesce(Sum("total_price"), Value(Decimal("0")), output_field=MONEY),
            bookings=Count("id"),
            average_rating=Avg("stadium__rating"),
        )
        .order_by("-revenue")[:limit]
    )
    return [
        {
            "stadium_id": str(row["stadium_id"]),
            "name": row["stadium__name"],
            "revenue": row["revenue"],
            "bookings": row["bookings"],
            "rating": round(row["average_rating"] or 0, 2),
        }
        for row in rows
    ]


def growth_series(model, days: int = 30, date_field: str = "created_at") -> list[dict]:
    """New rows per day — used for the user/stadium growth charts."""
    start = timezone.now() - timedelta(days=days - 1)
    rows = (
        model.objects.filter(**{f"{date_field}__gte": start})
        .annotate(day=TruncDate(date_field))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )
    by_day = {row["day"]: row["count"] for row in rows}
    first_day: date = start.date()
    return [
        {"date": (first_day + timedelta(days=offset)).isoformat(),
         "count": by_day.get(first_day + timedelta(days=offset), 0)}
        for offset in range(days)
    ]


def owner_bookings(owner):
    return Booking.objects.filter(owner=owner)


def occupancy_rate(bookings, stadium_count: int, days: int = 30) -> float:
    """Booked hours / theoretically available hours, assuming a 15h trading day."""
    if stadium_count == 0:
        return 0.0
    start = timezone.localdate() - timedelta(days=days - 1)
    booked_hours = bookings.filter(
        date__gte=start, status__in=REVENUE_STATUSES
    ).aggregate(total=Coalesce(Sum(F("duration_hours")), Value(0)))["total"]
    capacity_hours = stadium_count * days * 15
    return round(min(booked_hours / capacity_hours * 100, 100), 1) if capacity_hours else 0.0
