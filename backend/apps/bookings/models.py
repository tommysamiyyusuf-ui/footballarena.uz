from __future__ import annotations

from decimal import Decimal

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel
from apps.stadiums.models import Stadium
from apps.users.models import User


class TsTzRange(models.Func):
    """`tstzrange(starts_at, ends_at, '[)')` — half-open so 10-12 and 12-14 fit."""

    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class BookingStatus(models.TextChoices):
    PENDING = "PENDING", "Awaiting owner approval"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected by owner"
    CANCELLED = "CANCELLED", "Cancelled"
    COMPLETED = "COMPLETED", "Completed"
    EXPIRED = "EXPIRED", "Expired without a decision"


# Statuses that still occupy the slot on the calendar.
BLOCKING_STATUSES = (BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.COMPLETED)


class BookingQuerySet(models.QuerySet):
    def blocking(self):
        return self.filter(status__in=BLOCKING_STATUSES)

    def with_relations(self):
        return self.select_related("user", "owner", "stadium").prefetch_related(
            "stadium__images"
        )

    def for_actor(self, user):
        """Scope the queryset to what this role is allowed to read."""
        if user.role == "ADMIN":
            return self
        if user.role == "OWNER":
            return self.filter(owner=user)
        return self.filter(user=user)


class Booking(BaseModel):
    """
    A time reservation on a stadium.

    Overlap safety is enforced at three levels:
      1. `unique_active_booking_slot` — a DB unique constraint that makes an exact
         duplicate slot impossible even under concurrency.
      2. `booking_no_overlap` — a PostgreSQL exclusion constraint over the
         [start, end) range, which rejects *partial* overlaps atomically.
      3. A `select_for_update` guard in the service layer that produces a friendly
         error message before the constraint fires.
    """

    reference = models.CharField(max_length=12, unique=True, editable=False, db_index=True)
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="bookings")
    owner = models.ForeignKey(User, on_delete=models.PROTECT, related_name="owned_bookings")
    stadium = models.ForeignKey(Stadium, on_delete=models.PROTECT, related_name="bookings")

    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    duration_hours = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])

    # Absolute instants derived from date+time; used for range checks and reporting.
    starts_at = models.DateTimeField(db_index=True)
    ends_at = models.DateTimeField(db_index=True)

    hourly_price = models.DecimalField(max_digits=12, decimal_places=2)
    total_price = models.DecimalField(max_digits=14, decimal_places=2)
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2,
                                             default=Decimal("0"))
    commission_amount = models.DecimalField(max_digits=14, decimal_places=2,
                                            default=Decimal("0"))
    owner_earning = models.DecimalField(max_digits=14, decimal_places=2,
                                        default=Decimal("0"))
    currency = models.CharField(max_length=3, default="UZS")

    status = models.CharField(
        max_length=9, choices=BookingStatus.choices,
        default=BookingStatus.PENDING, db_index=True
    )
    rejection_reason = models.CharField(max_length=255, blank=True)
    cancellation_reason = models.CharField(max_length=255, blank=True)
    cancelled_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="cancelled_bookings"
    )
    customer_note = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=13, blank=True)
    players_count = models.PositiveSmallIntegerField(null=True, blank=True)

    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    objects = BookingQuerySet.as_manager()

    class Meta:
        ordering = ("-date", "-start_time")
        indexes = [
            models.Index(fields=["stadium", "date", "status"]),
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["owner", "status", "-created_at"]),
            models.Index(fields=["status", "starts_at"]),
            models.Index(fields=["date", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(duration_hours__gte=1), name="booking_duration_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(total_price__gte=0), name="booking_total_non_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(ends_at__gt=models.F("starts_at")),
                name="booking_end_after_start",
            ),
            models.UniqueConstraint(
                fields=["stadium", "date", "start_time"],
                condition=models.Q(status__in=["PENDING", "APPROVED", "COMPLETED"]),
                name="unique_active_booking_slot",
            ),
            # Catches *partial* overlaps (10:00-12:00 vs 11:00-13:00), which the
            # unique constraint above cannot see because start_time differs.
            ExclusionConstraint(
                name="booking_no_overlap",
                expressions=[
                    (TsTzRange("starts_at", "ends_at", RangeBoundary()),
                     RangeOperators.OVERLAPS),
                    ("stadium", RangeOperators.EQUAL),
                ],
                condition=models.Q(status__in=["PENDING", "APPROVED", "COMPLETED"]),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.reference} — {self.stadium_id} {self.date} {self.start_time:%H:%M}"

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = self._generate_reference()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_reference() -> str:
        import secrets
        import string

        alphabet = string.ascii_uppercase + string.digits
        while True:
            reference = "FA" + "".join(secrets.choice(alphabet) for _ in range(8))
            if not Booking.objects.filter(reference=reference).exists():
                return reference

    @property
    def is_active(self) -> bool:
        return self.status in BLOCKING_STATUSES

    @property
    def is_past(self) -> bool:
        return self.ends_at <= timezone.now()

    @property
    def can_be_reviewed(self) -> bool:
        return self.status == BookingStatus.COMPLETED and not hasattr(self, "review")


class BookingStatusHistory(models.Model):
    """Append-only audit trail of every status transition on a booking."""

    id = models.BigAutoField(primary_key=True)
    booking = models.ForeignKey(
        Booking, on_delete=models.CASCADE, related_name="status_history"
    )
    from_status = models.CharField(max_length=9, blank=True)
    to_status = models.CharField(max_length=9)
    changed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["booking", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.booking_id}: {self.from_status} → {self.to_status}"
