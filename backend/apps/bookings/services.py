"""
Booking domain services.

Every rule that matters — pricing, availability, overlap prevention, state
transitions — lives here, not in views, and is re-verified server side.
"""
from __future__ import annotations

import logging
from datetime import date as date_cls, time, timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.bookings.models import (
    BLOCKING_STATUSES,
    Booking,
    BookingStatus,
    BookingStatusHistory,
)
from apps.common.exceptions import DomainError, SlotUnavailable, StadiumNotBookable
from apps.common.models import PlatformSetting
from apps.common.utils import combine_date_time
from apps.stadiums.models import Stadium
from apps.stadiums.services import (
    calculate_price,
    has_blackout,
    is_within_working_hours,
    suggest_alternatives,
)

logger = logging.getLogger(__name__)


def _end_time(start: time, duration_hours: int) -> time:
    total = (start.hour + duration_hours) % 24
    return time(hour=total, minute=start.minute)


def _commission_for(stadium: Stadium, settings_row: PlatformSetting) -> Decimal:
    profile = getattr(stadium.owner, "owner_profile", None)
    if profile and profile.commission_percent is not None:
        return Decimal(profile.commission_percent)
    return Decimal(settings_row.commission_percent)


def validate_booking_window(stadium: Stadium, day: date_cls, start: time,
                            duration_hours: int, config: PlatformSetting) -> None:
    if not stadium.is_bookable:
        raise StadiumNotBookable(
            "Bu stadion hozircha bron qabul qilmayapti."
        )

    if not (config.booking_min_duration_hours <= duration_hours
            <= config.booking_max_duration_hours):
        raise DomainError(
            f"Davomiylik {config.booking_min_duration_hours}-"
            f"{config.booking_max_duration_hours} soat oralig'ida bo'lishi kerak."
        )

    today = timezone.localdate()
    if day < today:
        raise DomainError("O'tgan sanaga bron qilib bo'lmaydi.")
    if day > today + timedelta(days=config.booking_max_advance_days):
        raise DomainError(
            f"Bron faqat {config.booking_max_advance_days} kun oldindan qilinadi."
        )

    starts_at = combine_date_time(day, start)
    if starts_at <= timezone.now():
        raise DomainError("O'tgan vaqtga bron qilib bo'lmaydi.")

    if start.minute != 0:
        raise DomainError("Bron faqat butun soatdan boshlanadi.")

    if not is_within_working_hours(stadium, day, start, duration_hours):
        raise DomainError("Tanlangan vaqt stadion ish vaqtidan tashqarida.")

    if has_blackout(stadium, day, start, duration_hours):
        raise SlotUnavailable("Bu vaqtda stadion texnik sabablarga ko'ra yopiq.")


def find_conflicts(stadium: Stadium, day: date_cls, start: time, duration_hours: int,
                   *, exclude_booking_id=None, lock: bool = False):
    """
    Bookings that overlap the requested window.

    Overlap test on minute offsets: existing.start < new.end AND new.start < existing.end.
    """
    start_minutes = start.hour * 60 + start.minute
    end_minutes = start_minutes + duration_hours * 60

    queryset = Booking.objects.filter(
        stadium=stadium, date=day, status__in=BLOCKING_STATUSES
    )
    if exclude_booking_id:
        queryset = queryset.exclude(pk=exclude_booking_id)
    if lock:
        # Serialise concurrent attempts on the same stadium/day.
        queryset = queryset.select_for_update()

    conflicts = []
    for booking in queryset:
        other_start = booking.start_time.hour * 60 + booking.start_time.minute
        other_end = other_start + booking.duration_hours * 60
        if start_minutes < other_end and other_start < end_minutes:
            conflicts.append(booking)
    return conflicts


@transaction.atomic
def create_booking(
    *,
    user,
    stadium_id,
    day: date_cls,
    start: time,
    duration_hours: int,
    customer_note: str = "",
    contact_phone: str = "",
    players_count: int | None = None,
) -> Booking:
    """
    Create a PENDING booking.

    Concurrency strategy:
      1. `select_for_update` on the stadium row serialises simultaneous requests
         for the same stadium, so two racing transactions cannot both read an
         empty calendar.
      2. The overlap scan then runs inside that lock.
      3. The `unique_active_booking_slot` DB constraint is the final backstop —
         if it ever fires we translate it into a 409 rather than a 500.
    """
    try:
        stadium = (
            # `of=("self",)` locks only the stadium row. Without it Postgres
            # refuses the statement outright, because `owner_profile` is a
            # nullable one-to-one and therefore joined with a LEFT OUTER JOIN.
            Stadium.objects.select_for_update(of=("self",))
            .select_related("owner", "owner__owner_profile")
            .get(pk=stadium_id)
        )
    except Stadium.DoesNotExist as exc:
        raise DomainError("Stadion topilmadi.") from exc

    config = PlatformSetting.load()
    validate_booking_window(stadium, day, start, duration_hours, config)

    conflicts = find_conflicts(stadium, day, start, duration_hours, lock=True)
    if conflicts:
        raise SlotUnavailable(
            "Bu vaqt allaqachon band qilingan. Boshqa vaqtni tanlang."
        )

    # A customer cannot double-book themselves across stadiums at the same time.
    starts_at = combine_date_time(day, start)
    ends_at = starts_at + timedelta(hours=duration_hours)
    personal_clash = Booking.objects.filter(
        user=user, status__in=BLOCKING_STATUSES
    ).filter(Q(starts_at__lt=ends_at) & Q(ends_at__gt=starts_at)).exists()
    if personal_clash:
        raise SlotUnavailable("Sizda shu vaqtga boshqa bron mavjud.")

    total_price = calculate_price(stadium, duration_hours)
    commission_percent = _commission_for(stadium, config)
    commission_amount = (total_price * commission_percent / Decimal("100")).quantize(
        Decimal("0.01")
    )

    try:
        booking = Booking.objects.create(
            user=user,
            owner=stadium.owner,
            stadium=stadium,
            date=day,
            start_time=start,
            end_time=_end_time(start, duration_hours),
            duration_hours=duration_hours,
            starts_at=starts_at,
            ends_at=ends_at,
            hourly_price=stadium.price_per_hour,
            total_price=total_price,
            commission_percent=commission_percent,
            commission_amount=commission_amount,
            owner_earning=total_price - commission_amount,
            status=BookingStatus.PENDING,
            customer_note=customer_note[:255],
            contact_phone=contact_phone or (user.phone or ""),
            players_count=players_count,
        )
    except IntegrityError as exc:
        logger.info("Booking slot constraint hit for stadium %s: %s", stadium_id, exc)
        raise SlotUnavailable() from exc

    _record_transition(booking, "", BookingStatus.PENDING, user, "Bron yaratildi")
    Stadium.objects.filter(pk=stadium.pk).update(booking_count=stadium.booking_count + 1)

    transaction.on_commit(lambda: _notify_created(booking))
    return booking


def _record_transition(booking: Booking, from_status: str, to_status: str,
                       actor, note: str = "") -> None:
    BookingStatusHistory.objects.create(
        booking=booking,
        from_status=from_status,
        to_status=to_status,
        changed_by=actor if getattr(actor, "is_authenticated", False) else None,
        note=note[:255],
    )


def _notify_created(booking: Booking) -> None:
    from apps.notifications.services import notify

    notify(
        recipient=booking.owner,
        type="BOOKING_CREATED",
        title="Yangi bron so'rovi",
        message=(
            f"{booking.user.get_full_name() or 'Mijoz'} — {booking.stadium.name}, "
            f"{booking.date:%d.%m.%Y} {booking.start_time:%H:%M}-{booking.end_time:%H:%M}"
        ),
        payload={"booking_id": str(booking.id), "reference": booking.reference,
                 "route": f"/owner/bookings/{booking.id}"},
    )


@transaction.atomic
def approve_booking(booking_id, actor) -> Booking:
    booking = Booking.objects.select_for_update().select_related(
        "stadium", "user", "owner"
    ).get(pk=booking_id)

    if actor.role == "OWNER" and booking.owner_id != actor.id:
        raise DomainError("Bu bron sizga tegishli emas.")
    if booking.status != BookingStatus.PENDING:
        raise DomainError("Faqat kutilayotgan bronni tasdiqlash mumkin.")
    if booking.ends_at <= timezone.now():
        raise DomainError("Bu bron vaqti allaqachon o'tib ketgan.")

    # Defensive re-check: another booking could have been approved meanwhile.
    conflicts = find_conflicts(
        booking.stadium, booking.date, booking.start_time, booking.duration_hours,
        exclude_booking_id=booking.id, lock=True,
    )
    if any(c.status == BookingStatus.APPROVED for c in conflicts):
        raise SlotUnavailable("Bu vaqtga boshqa bron allaqachon tasdiqlangan.")

    booking.status = BookingStatus.APPROVED
    booking.approved_at = timezone.now()
    booking.save(update_fields=["status", "approved_at", "updated_at"])
    _record_transition(booking, BookingStatus.PENDING, BookingStatus.APPROVED, actor)

    transaction.on_commit(lambda: _notify_status(booking, "BOOKING_APPROVED",
                                                 "Broningiz tasdiqlandi"))
    return booking


@transaction.atomic
def reject_booking(booking_id, actor, reason: str) -> Booking:
    booking = Booking.objects.select_for_update().select_related(
        "stadium", "user", "owner"
    ).get(pk=booking_id)

    if actor.role == "OWNER" and booking.owner_id != actor.id:
        raise DomainError("Bu bron sizga tegishli emas.")
    if booking.status != BookingStatus.PENDING:
        raise DomainError("Faqat kutilayotgan bronni rad etish mumkin.")
    if not reason.strip():
        raise DomainError("Rad etish sababini yozing.")

    booking.status = BookingStatus.REJECTED
    booking.rejection_reason = reason.strip()[:255]
    booking.rejected_at = timezone.now()
    booking.save(update_fields=["status", "rejection_reason", "rejected_at", "updated_at"])
    _record_transition(booking, BookingStatus.PENDING, BookingStatus.REJECTED, actor, reason)

    transaction.on_commit(
        lambda: _notify_status(booking, "BOOKING_REJECTED", "Broningiz rad etildi",
                               extra=booking.rejection_reason)
    )
    return booking


@transaction.atomic
def cancel_booking(booking_id, actor, reason: str = "") -> Booking:
    booking = Booking.objects.select_for_update().select_related(
        "stadium", "user", "owner"
    ).get(pk=booking_id)

    is_customer = booking.user_id == actor.id
    is_owner = booking.owner_id == actor.id
    if not (is_customer or is_owner or actor.role == "ADMIN"):
        raise DomainError("Bu bronni bekor qilish huquqingiz yo'q.")
    if booking.status not in {BookingStatus.PENDING, BookingStatus.APPROVED}:
        raise DomainError("Bu bronni bekor qilib bo'lmaydi.")

    config = PlatformSetting.load()
    if is_customer and actor.role != "ADMIN":
        deadline = booking.starts_at - timedelta(hours=config.booking_cancel_window_hours)
        if timezone.now() > deadline:
            raise DomainError(
                f"Bronni boshlanishiga {config.booking_cancel_window_hours} soatdan "
                "kam qolganda bekor qilib bo'lmaydi."
            )

    previous = booking.status
    booking.status = BookingStatus.CANCELLED
    booking.cancellation_reason = reason.strip()[:255]
    booking.cancelled_by = actor
    booking.cancelled_at = timezone.now()
    booking.save(update_fields=["status", "cancellation_reason", "cancelled_by",
                                "cancelled_at", "updated_at"])
    _record_transition(booking, previous, BookingStatus.CANCELLED, actor, reason)

    # The slot becomes free again the moment the status leaves BLOCKING_STATUSES.
    recipient = booking.owner if is_customer else booking.user
    transaction.on_commit(
        lambda: _notify_status(booking, "BOOKING_CANCELLED", "Bron bekor qilindi",
                               extra=booking.cancellation_reason, recipient=recipient)
    )
    return booking


def _notify_status(booking: Booking, notification_type: str, title: str,
                   extra: str = "", recipient=None) -> None:
    from apps.notifications.services import notify

    target = recipient or booking.user
    message = (
        f"{booking.stadium.name} — {booking.date:%d.%m.%Y} "
        f"{booking.start_time:%H:%M}-{booking.end_time:%H:%M}"
    )
    if extra:
        message = f"{message}. {extra}"

    route = ("/owner/bookings" if target.id == booking.owner_id
             else f"/user/bookings/{booking.id}")
    notify(
        recipient=target,
        type=notification_type,
        title=title,
        message=message,
        payload={"booking_id": str(booking.id), "reference": booking.reference,
                 "route": route},
    )


def alternatives_for(stadium: Stadium, day: date_cls, duration_hours: int) -> list[dict]:
    return suggest_alternatives(stadium, day, duration_hours)


def quote(stadium: Stadium, duration_hours: int) -> dict:
    """Server-side price quote so the UI and the backend can never disagree."""
    config = PlatformSetting.load()
    total = calculate_price(stadium, duration_hours)
    commission_percent = _commission_for(stadium, config)
    commission = (total * commission_percent / Decimal("100")).quantize(Decimal("0.01"))
    return {
        "hourly_price": stadium.price_per_hour,
        "duration_hours": duration_hours,
        "total_price": total,
        "commission_percent": commission_percent,
        "commission_amount": commission,
        "owner_earning": total - commission,
        "currency": "UZS",
    }
