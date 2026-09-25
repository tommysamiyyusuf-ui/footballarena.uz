from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.bookings.models import Booking
from apps.common.models import BaseModel
from apps.stadiums.models import Stadium
from apps.users.models import User


class Review(BaseModel):
    """
    One review per completed booking.

    The OneToOne link to Booking is what enforces "only after a real completed
    booking, and only once" at the database level.
    """

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="review")
    stadium = models.ForeignKey(Stadium, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True, max_length=1000)
    owner_reply = models.TextField(blank=True, max_length=1000)
    owner_replied_at = models.DateTimeField(null=True, blank=True)
    is_visible = models.BooleanField(default=True, db_index=True)
    hidden_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["stadium", "is_visible", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name="review_rating_range",
            )
        ]

    def __str__(self) -> str:
        return f"{self.rating}★ for {self.stadium_id} by {self.user_id}"
