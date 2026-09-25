from django.db import models
from django.utils import timezone

from apps.bookings.models import Booking
from apps.common.models import BaseModel
from apps.stadiums.models import Stadium
from apps.users.models import User


class Conversation(BaseModel):
    """
    A private customer↔owner thread.

    A conversation is always anchored to a stadium, and optionally to a specific
    booking. Exactly two participants: the customer and the stadium owner.
    """

    customer = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="customer_conversations"
    )
    owner = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="owner_conversations"
    )
    stadium = models.ForeignKey(
        Stadium, on_delete=models.CASCADE, related_name="conversations"
    )
    booking = models.ForeignKey(
        Booking, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="conversations",
    )
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_message_preview = models.CharField(max_length=140, blank=True)
    is_archived = models.BooleanField(default=False)

    class Meta:
        ordering = ("-last_message_at", "-created_at")
        indexes = [
            models.Index(fields=["customer", "-last_message_at"]),
            models.Index(fields=["owner", "-last_message_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["customer", "stadium", "booking"],
                name="unique_conversation_per_booking",
            )
        ]

    def __str__(self) -> str:
        return f"Chat {self.customer_id} ↔ {self.owner_id} ({self.stadium_id})"

    def has_participant(self, user) -> bool:
        return user.id in {self.customer_id, self.owner_id}

    def other_participant(self, user):
        return self.owner if user.id == self.customer_id else self.customer

    def unread_count_for(self, user) -> int:
        return self.messages.filter(is_read=False).exclude(sender=user).count()


class Message(BaseModel):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    text = models.TextField(max_length=2000)
    attachment = models.FileField(upload_to="chat/%Y/%m/", null=True, blank=True)
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["conversation", "is_read"]),
        ]

    def __str__(self) -> str:
        return f"{self.sender_id}: {self.text[:32]}"

    def mark_read(self) -> None:
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at", "updated_at"])
