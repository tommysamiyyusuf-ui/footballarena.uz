from decimal import Decimal

from django.db import models

from apps.bookings.models import Booking
from apps.common.models import BaseModel
from apps.users.models import User


class PaymentProvider(models.TextChoices):
    CASH = "CASH", "Cash on site"
    CLICK = "CLICK", "Click"
    PAYME = "PAYME", "Payme"
    UZUM = "UZUM", "Uzum Bank"


class PaymentStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PAID = "PAID", "Paid"
    FAILED = "FAILED", "Failed"
    REFUNDED = "REFUNDED", "Refunded"
    CANCELLED = "CANCELLED", "Cancelled"


class Payment(BaseModel):
    """
    Payment record for a booking.

    Payments are optional in the MVP (CASH settles on site), but the model and
    the provider gateway interface are production-shaped so Click/Payme/Uzum can
    be plugged in without touching the booking flow.
    """

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="payments")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="UZS")
    provider = models.CharField(
        max_length=8, choices=PaymentProvider.choices, default=PaymentProvider.CASH
    )
    status = models.CharField(
        max_length=9, choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING, db_index=True
    )
    transaction_id = models.CharField(max_length=128, blank=True, db_index=True)
    provider_payload = models.JSONField(default=dict, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["booking", "status"]),
            models.Index(fields=["provider", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "transaction_id"],
                condition=~models.Q(transaction_id=""),
                name="unique_provider_transaction",
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gte=0), name="payment_amount_non_negative"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.provider} {self.amount} {self.currency} ({self.status})"


class Payout(BaseModel):
    """Settlement of platform-collected money back to a stadium owner."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PAID = "PAID", "Paid"
        FAILED = "FAILED", "Failed"

    owner = models.ForeignKey(User, on_delete=models.PROTECT, related_name="payouts")
    period_start = models.DateField()
    period_end = models.DateField()
    gross_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0"))
    commission_amount = models.DecimalField(max_digits=16, decimal_places=2,
                                            default=Decimal("0"))
    net_amount = models.DecimalField(max_digits=16, decimal_places=2, default=Decimal("0"))
    currency = models.CharField(max_length=3, default="UZS")
    status = models.CharField(max_length=7, choices=Status.choices, default=Status.PENDING)
    note = models.CharField(max_length=255, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-period_end",)
        indexes = [models.Index(fields=["owner", "-period_end"])]

    def __str__(self) -> str:
        return f"Payout {self.owner_id} {self.period_start}..{self.period_end}"
