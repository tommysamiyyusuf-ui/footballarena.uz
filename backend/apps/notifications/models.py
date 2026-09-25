from django.db import models

from apps.common.models import BaseModel
from apps.users.models import User


class NotificationType(models.TextChoices):
    BOOKING_CREATED = "BOOKING_CREATED", "New booking request"
    BOOKING_APPROVED = "BOOKING_APPROVED", "Booking approved"
    BOOKING_REJECTED = "BOOKING_REJECTED", "Booking rejected"
    BOOKING_CANCELLED = "BOOKING_CANCELLED", "Booking cancelled"
    BOOKING_COMPLETED = "BOOKING_COMPLETED", "Booking completed"
    BOOKING_REMINDER = "BOOKING_REMINDER", "Booking reminder"
    STADIUM_SUBMITTED = "STADIUM_SUBMITTED", "Stadium awaiting approval"
    STADIUM_APPROVED = "STADIUM_APPROVED", "Stadium approved"
    STADIUM_REJECTED = "STADIUM_REJECTED", "Stadium rejected"
    STADIUM_CHANGES_REQUESTED = "STADIUM_CHANGES_REQUESTED", "Stadium changes requested"
    NEW_MESSAGE = "NEW_MESSAGE", "New chat message"
    NEW_REVIEW = "NEW_REVIEW", "New review"
    PAYMENT_SUCCESS = "PAYMENT_SUCCESS", "Payment succeeded"
    PAYMENT_FAILED = "PAYMENT_FAILED", "Payment failed"
    ACCOUNT_BLOCKED = "ACCOUNT_BLOCKED", "Account blocked"
    SYSTEM = "SYSTEM", "System message"


class Channel(models.TextChoices):
    WEB = "WEB", "Web"
    EMAIL = "EMAIL", "Email"
    TELEGRAM = "TELEGRAM", "Telegram"
    SMS = "SMS", "SMS"


class Notification(BaseModel):
    recipient = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notifications"
    )
    type = models.CharField(max_length=32, choices=NotificationType.choices, db_index=True)
    title = models.CharField(max_length=160)
    message = models.TextField(blank=True)
    # Deep-link target for the SPA, e.g. {"booking_id": "...", "route": "/user/bookings/x"}
    payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
            models.Index(fields=["recipient", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.type} → {self.recipient_id}"


class NotificationDelivery(BaseModel):
    """
    Per-channel delivery attempt.

    Web notifications are delivered instantly over WebSocket; email/Telegram rows
    are picked up by Celery so external outages never block the request cycle.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"
        SKIPPED = "SKIPPED", "Skipped"

    notification = models.ForeignKey(
        Notification, on_delete=models.CASCADE, related_name="deliveries"
    )
    channel = models.CharField(max_length=8, choices=Channel.choices)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    error = models.CharField(max_length=255, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status", "channel"])]

    def __str__(self) -> str:
        return f"{self.channel}: {self.status}"
