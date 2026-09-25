import uuid

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimeStampedModel):
    class Meta:
        abstract = True


class AuditLog(BaseModel):
    """Immutable record of privileged actions performed on the platform."""

    class Action(models.TextChoices):
        STADIUM_APPROVED = "STADIUM_APPROVED", "Stadium approved"
        STADIUM_REJECTED = "STADIUM_REJECTED", "Stadium rejected"
        STADIUM_BLOCKED = "STADIUM_BLOCKED", "Stadium blocked"
        STADIUM_CHANGES_REQUESTED = "STADIUM_CHANGES_REQUESTED", "Changes requested"
        USER_BLOCKED = "USER_BLOCKED", "User blocked"
        USER_UNBLOCKED = "USER_UNBLOCKED", "User unblocked"
        OWNER_CREATED = "OWNER_CREATED", "Owner created"
        OWNER_UPDATED = "OWNER_UPDATED", "Owner updated"
        OWNER_DELETED = "OWNER_DELETED", "Owner deleted"
        BOOKING_UPDATED = "BOOKING_UPDATED", "Booking updated"
        BOOKING_CANCELLED = "BOOKING_CANCELLED", "Booking cancelled"
        REVIEW_HIDDEN = "REVIEW_HIDDEN", "Review hidden"
        REVIEW_RESTORED = "REVIEW_RESTORED", "Review restored"
        SETTINGS_UPDATED = "SETTINGS_UPDATED", "Settings updated"

    actor = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=40, choices=Action.choices, db_index=True)
    target_type = models.CharField(max_length=60, blank=True)
    target_id = models.CharField(max_length=64, blank=True, db_index=True)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["action", "-created_at"]),
            models.Index(fields=["target_type", "target_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} by {self.actor_id} at {self.created_at:%Y-%m-%d %H:%M}"


class PlatformSetting(TimeStampedModel):
    """Singleton row holding admin-editable platform configuration."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    platform_name = models.CharField(max_length=120, default="Football Arena")
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    booking_cancel_window_hours = models.PositiveSmallIntegerField(default=3)
    booking_max_advance_days = models.PositiveSmallIntegerField(default=60)
    booking_min_duration_hours = models.PositiveSmallIntegerField(default=1)
    booking_max_duration_hours = models.PositiveSmallIntegerField(default=6)
    auto_approve_stadiums = models.BooleanField(default=False)
    notifications_email_enabled = models.BooleanField(default=False)
    notifications_telegram_enabled = models.BooleanField(default=False)
    support_phone = models.CharField(max_length=32, blank=True)
    support_email = models.EmailField(blank=True)
    support_telegram = models.CharField(max_length=64, blank=True)
    maintenance_mode = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Platform settings"
        verbose_name_plural = "Platform settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "PlatformSetting":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self) -> str:
        return self.platform_name
