"""Geo search and slot-availability computation."""
from __future__ import annotations

from datetime import date as date_cls, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.common.utils import bounding_box, haversine_km
from apps.stadiums.models import Stadium, StadiumBlackout, StadiumWorkingHour

SLOT_MINUTES = 60


def annotate_distance(
    stadiums: list[Stadium], lat: float, lon: float
) -> list[Stadium]:
    for stadium in stadiums:
        stadium.distance_km = haversine_km(lat, lon, stadium.latitude, stadium.longitude)
    return stadiums


def filter_by_radius(
    queryset: QuerySet[Stadium], lat: float, lon: float, radius_km: float
) -> QuerySet[Stadium]:
    """Index-friendly bounding-box pre-filter; exact Haversine happens in Python."""
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_km)
    return queryset.filter(
        latitude__gte=min_lat,
        latitude__lte=max_lat,
        longitude__gte=min_lon,
        longitude__lte=max_lon,
    )


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _time_from_minutes(total: int) -> time:
    total %= 24 * 60
    return time(hour=total // 60, minute=total % 60)


def get_working_hours(stadium: Stadium, day: date_cls) -> StadiumWorkingHour | None:
    weekday = day.weekday()
    for record in stadium.working_hours.all():
        if record.weekday == weekday:
            return record
    return None


def _blackout_intervals(stadium: Stadium, day: date_cls) -> list[tuple[int, int]]:
    intervals: list[tuple[int, int]] = []
    for blackout in StadiumBlackout.objects.filter(stadium=stadium, date=day):
        if blackout.start_time is None or blackout.end_time is None:
            return [(0, 24 * 60)]
        intervals.append((_minutes(blackout.start_time), _minutes(blackout.end_time)))
    return intervals


def _booked_intervals(stadium: Stadium, day: date_cls) -> list[tuple[int, int]]:
    from apps.bookings.models import Booking

    intervals = []
    rows = Booking.objects.blocking().filter(stadium=stadium, date=day).values_list(
        "start_time", "end_time"
    )
    for start, end in rows:
        end_minutes = 24 * 60 if end == time(0, 0) else _minutes(end)
        intervals.append((_minutes(start), end_minutes))
    return intervals


def _overlaps(start: int, end: int, intervals: list[tuple[int, int]]) -> bool:
    return any(start < other_end and other_start < end for other_start, other_end in intervals)


def build_availability(stadium: Stadium, day: date_cls) -> dict:
    """
    Compute the hourly slot grid for a single day.

    A slot is unavailable when it is already taken by a blocking booking, blacked
    out by the owner, or lies in the past.
    """
    working = get_working_hours(stadium, day)
    price = stadium.price_per_hour

    if working is None or working.is_closed or not stadium.is_bookable:
        reason = "closed" if (working is None or working.is_closed) else "unavailable"
        return {
            "date": day,
            "is_open": False,
            "open_time": None,
            "close_time": None,
            "price_per_hour": price,
            "slots": [],
            "reason": reason,
        }

    open_minutes = _minutes(working.open_time)
    close_minutes = _minutes(working.close_time)
    if close_minutes <= open_minutes:
        # Stadium closes after midnight — extend into the next day.
        close_minutes += 24 * 60

    booked = _booked_intervals(stadium, day)
    blackouts = _blackout_intervals(stadium, day)
    now = timezone.localtime()
    is_today = day == now.date()
    current_minutes = now.hour * 60 + now.minute

    slots = []
    cursor = open_minutes
    while cursor + SLOT_MINUTES <= close_minutes:
        slot_end = cursor + SLOT_MINUTES
        reason = ""
        available = True

        if is_today and cursor <= current_minutes:
            available, reason = False, "past"
        elif _overlaps(cursor, slot_end, booked):
            available, reason = False, "booked"
        elif _overlaps(cursor, slot_end, blackouts):
            available, reason = False, "blocked"

        slots.append(
            {
                "start_time": f"{_time_from_minutes(cursor):%H:%M}",
                "end_time": f"{_time_from_minutes(slot_end):%H:%M}",
                "is_available": available,
                "reason": reason,
                "price": price,
            }
        )
        cursor = slot_end

    return {
        "date": day,
        "is_open": True,
        "open_time": f"{working.open_time:%H:%M}",
        "close_time": f"{working.close_time:%H:%M}",
        "price_per_hour": price,
        "slots": slots,
        "reason": "",
    }


def suggest_alternatives(stadium: Stadium, day: date_cls, duration_hours: int,
                         limit: int = 5) -> list[dict]:
    """Contiguous free windows long enough for the requested duration."""
    availability = build_availability(stadium, day)
    slots = availability["slots"]
    suggestions: list[dict] = []

    # These go straight into the 409 body without a serializer, so the price is
    # formatted here to match the decimal-string form every other money field uses.
    total_price = f"{stadium.price_per_hour * duration_hours:.2f}"

    for index in range(len(slots) - duration_hours + 1):
        window = slots[index: index + duration_hours]
        if all(slot["is_available"] for slot in window):
            suggestions.append(
                {
                    "start_time": window[0]["start_time"],
                    "end_time": window[-1]["end_time"],
                    "total_price": total_price,
                }
            )
        if len(suggestions) >= limit:
            break
    return suggestions


def is_within_working_hours(stadium: Stadium, day: date_cls, start: time,
                            duration_hours: int) -> bool:
    working = get_working_hours(stadium, day)
    if working is None or working.is_closed:
        return False
    open_minutes = _minutes(working.open_time)
    close_minutes = _minutes(working.close_time)
    if close_minutes <= open_minutes:
        close_minutes += 24 * 60
    start_minutes = _minutes(start)
    if start_minutes < open_minutes:
        start_minutes += 24 * 60 if close_minutes > 24 * 60 else 0
    return open_minutes <= start_minutes and start_minutes + duration_hours * 60 <= close_minutes


def has_blackout(stadium: Stadium, day: date_cls, start: time, duration_hours: int) -> bool:
    start_minutes = _minutes(start)
    end_minutes = start_minutes + duration_hours * 60
    return _overlaps(start_minutes, end_minutes, _blackout_intervals(stadium, day))


def calculate_price(stadium: Stadium, duration_hours: int) -> Decimal:
    """Authoritative price. The client's figure is never trusted."""
    return (stadium.price_per_hour * Decimal(duration_hours)).quantize(Decimal("0.01"))


def upcoming_dates(days: int = 14) -> list[date_cls]:
    today = timezone.localdate()
    return [today + timedelta(days=offset) for offset in range(days)]


def search_queryset(base: QuerySet[Stadium], params) -> QuerySet[Stadium]:
    """Free-text search across name, address, city and district."""
    query = (params.get("search") or params.get("q") or "").strip()
    if not query:
        return base
    return base.filter(
        Q(name__icontains=query)
        | Q(address__icontains=query)
        | Q(city__icontains=query)
        | Q(district__icontains=query)
        | Q(description__icontains=query)
    )


def parse_date(value: str | None) -> date_cls:
    if not value:
        return timezone.localdate()
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        from apps.common.exceptions import DomainError

        raise DomainError("Sana formati noto'g'ri. Namuna: 2026-03-05") from exc
