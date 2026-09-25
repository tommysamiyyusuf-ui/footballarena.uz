from __future__ import annotations

import math
import re
from datetime import date, datetime, time, timedelta

from django.utils import timezone

UZ_PHONE_RE = re.compile(r"^\+998\d{9}$")
EARTH_RADIUS_KM = 6371.0088


def normalize_phone(raw: str) -> str:
    """Normalize any Uzbek phone input to canonical +998XXXXXXXXX form."""
    if not raw:
        return ""
    digits = re.sub(r"\D", "", str(raw))
    if digits.startswith("998"):
        digits = digits[3:]
    elif digits.startswith("8") and len(digits) == 10:
        digits = digits[1:]
    digits = digits[-9:]
    return f"+998{digits}" if len(digits) == 9 else ""


def is_valid_uz_phone(raw: str) -> bool:
    return bool(UZ_PHONE_RE.match(raw or ""))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def bounding_box(lat: float, lon: float, radius_km: float) -> tuple[float, float, float, float]:
    """Cheap pre-filter box so the DB can use the lat/lon index before Haversine."""
    lat_delta = radius_km / 110.574
    cos_lat = max(math.cos(math.radians(lat)), 0.01)
    lon_delta = radius_km / (111.320 * cos_lat)
    return (
        max(lat - lat_delta, -90.0),
        min(lat + lat_delta, 90.0),
        max(lon - lon_delta, -180.0),
        min(lon + lon_delta, 180.0),
    )


def combine_date_time(day: date, moment: time) -> datetime:
    """Timezone-aware datetime in the active timezone."""
    naive = datetime.combine(day, moment)
    return timezone.make_aware(naive, timezone.get_current_timezone())


def end_datetime(day: date, start: time, duration_hours: int) -> datetime:
    return combine_date_time(day, start) + timedelta(hours=duration_hours)


def add_hours(moment: time, hours: int) -> time:
    """Add whole hours to a time, wrapping 24:00 to 00:00."""
    total = (moment.hour + hours) % 24
    return time(hour=total, minute=moment.minute)


def times_overlap(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    """Half-open interval overlap, treating 00:00 end as end-of-day."""
    a_end = 24 * 60 if end_a == time(0, 0) else end_a.hour * 60 + end_a.minute
    b_end = 24 * 60 if end_b == time(0, 0) else end_b.hour * 60 + end_b.minute
    a_start = start_a.hour * 60 + start_a.minute
    b_start = start_b.hour * 60 + start_b.minute
    return a_start < b_end and b_start < a_end


def client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def mask_phone(phone: str) -> str:
    if len(phone) < 6:
        return phone
    return f"{phone[:7]}***{phone[-2:]}"
