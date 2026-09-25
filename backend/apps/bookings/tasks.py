import logging

from celery import shared_task
from django.utils import timezone

from apps.bookings.models import Booking, BookingStatus, BookingStatusHistory

logger = logging.getLogger(__name__)


@shared_task(name="apps.bookings.tasks.expire_stale_bookings")
def expire_stale_bookings() -> int:
    """PENDING bookings whose start time has passed are auto-expired."""
    now = timezone.now()
    stale = Booking.objects.filter(status=BookingStatus.PENDING, starts_at__lte=now)
    count = 0
    for booking in stale.iterator():
        booking.status = BookingStatus.EXPIRED
        booking.save(update_fields=["status", "updated_at"])
        BookingStatusHistory.objects.create(
            booking=booking,
            from_status=BookingStatus.PENDING,
            to_status=BookingStatus.EXPIRED,
            note="Tasdiqlanmagani uchun avtomatik bekor qilindi.",
        )
        count += 1
    if count:
        logger.info("Expired %s stale bookings", count)
    return count


@shared_task(name="apps.bookings.tasks.complete_finished_bookings")
def complete_finished_bookings() -> int:
    """APPROVED bookings whose end time has passed become COMPLETED."""
    now = timezone.now()
    finished = Booking.objects.filter(status=BookingStatus.APPROVED, ends_at__lte=now)
    count = 0
    for booking in finished.iterator():
        booking.status = BookingStatus.COMPLETED
        booking.completed_at = now
        booking.save(update_fields=["status", "completed_at", "updated_at"])
        BookingStatusHistory.objects.create(
            booking=booking,
            from_status=BookingStatus.APPROVED,
            to_status=BookingStatus.COMPLETED,
            note="O'yin yakunlandi.",
        )
        count += 1
    if count:
        logger.info("Completed %s bookings", count)
    return count


@shared_task(name="apps.bookings.tasks.send_booking_reminders")
def send_booking_reminders(hours_ahead: int = 3) -> int:
    """Remind customers a few hours before kickoff."""
    from datetime import timedelta

    from apps.notifications.services import notify

    now = timezone.now()
    window_start = now + timedelta(hours=hours_ahead)
    window_end = window_start + timedelta(minutes=30)

    upcoming = Booking.objects.filter(
        status=BookingStatus.APPROVED, starts_at__gte=window_start, starts_at__lt=window_end
    ).select_related("user", "stadium")

    count = 0
    for booking in upcoming.iterator():
        notify(
            recipient=booking.user,
            type="BOOKING_REMINDER",
            title="O'yin yaqinlashmoqda",
            message=(
                f"{booking.stadium.name} — bugun {booking.start_time:%H:%M} da "
                f"broningiz bor."
            ),
            payload={"booking_id": str(booking.id),
                     "route": f"/user/bookings/{booking.id}"},
        )
        count += 1
    return count
