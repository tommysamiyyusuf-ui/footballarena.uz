from __future__ import annotations

from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify

from apps.common.models import BaseModel, TimeStampedModel
from apps.common.validators import validate_latitude, validate_longitude
from apps.users.models import User


class FieldType(models.TextChoices):
    MINI = "MINI", "Mini football"
    F5 = "F5", "5x5"
    F7 = "F7", "7x7"
    F11 = "F11", "11x11"


class StadiumStatus(models.TextChoices):
    PENDING = "PENDING", "Pending approval"
    APPROVED = "APPROVED", "Approved"
    REJECTED = "REJECTED", "Rejected"
    BLOCKED = "BLOCKED", "Blocked by admin"


class Amenity(TimeStampedModel):
    """Catalogue of facilities a stadium can offer."""

    id = models.SmallAutoField(primary_key=True)
    code = models.SlugField(max_length=32, unique=True)
    name = models.CharField(max_length=64)
    name_uz = models.CharField(max_length=64, blank=True)
    icon = models.CharField(max_length=32, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("sort_order", "name")
        verbose_name_plural = "amenities"

    def __str__(self) -> str:
        return self.name


class StadiumQuerySet(models.QuerySet):
    def visible(self):
        """Only stadiums a customer is allowed to see and book."""
        return self.filter(status=StadiumStatus.APPROVED, is_active=True,
                           owner__is_blocked=False)

    def for_owner(self, owner):
        return self.filter(owner=owner)

    def with_relations(self):
        return self.select_related("owner", "owner__owner_profile").prefetch_related(
            "images", "amenities", "working_hours"
        )


class Stadium(BaseModel):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="stadiums")
    name = models.CharField(max_length=140, db_index=True)
    slug = models.SlugField(max_length=170, blank=True)
    description = models.TextField(blank=True)
    field_type = models.CharField(
        max_length=6, choices=FieldType.choices, default=FieldType.F5, db_index=True
    )
    capacity = models.PositiveSmallIntegerField(default=10)
    price_per_hour = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))]
    )

    country = models.CharField(max_length=60, default="Uzbekistan")
    city = models.CharField(max_length=80, db_index=True)
    district = models.CharField(max_length=80, blank=True, db_index=True)
    address = models.CharField(max_length=255)
    latitude = models.FloatField(validators=[validate_latitude])
    longitude = models.FloatField(validators=[validate_longitude])

    phone = models.CharField(max_length=13, blank=True)
    amenities = models.ManyToManyField(Amenity, blank=True, related_name="stadiums")

    status = models.CharField(
        max_length=8, choices=StadiumStatus.choices,
        default=StadiumStatus.PENDING, db_index=True
    )
    moderation_note = models.TextField(
        blank=True, help_text="Reason for rejection or requested changes."
    )
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reviewed_stadiums"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Owner-controlled availability switch, independent of admin moderation.
    is_active = models.BooleanField(default=True, db_index=True)

    rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("5"))],
    )
    review_count = models.PositiveIntegerField(default=0)
    booking_count = models.PositiveIntegerField(default=0)
    view_count = models.PositiveIntegerField(default=0)

    objects = StadiumQuerySet.as_manager()

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status", "is_active"]),
            models.Index(fields=["latitude", "longitude"]),
            models.Index(fields=["city", "district"]),
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["price_per_hour"]),
            models.Index(fields=["-rating"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price_per_hour__gte=0), name="stadium_price_non_negative"
            ),
            models.CheckConstraint(
                condition=models.Q(latitude__gte=-90) & models.Q(latitude__lte=90),
                name="stadium_latitude_range",
            ),
            models.CheckConstraint(
                condition=models.Q(longitude__gte=-180) & models.Q(longitude__lte=180),
                name="stadium_longitude_range",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:170] or "stadium"
        super().save(*args, **kwargs)

    @property
    def is_bookable(self) -> bool:
        return (
            self.status == StadiumStatus.APPROVED
            and self.is_active
            and not self.owner.is_blocked
        )

    @property
    def cover_image(self):
        return self.images.order_by("-is_cover", "sort_order").first()

    def recalculate_rating(self) -> None:
        from django.db.models import Avg, Count

        aggregate = self.reviews.filter(is_visible=True).aggregate(
            average=Avg("rating"), total=Count("id")
        )
        self.rating = round(aggregate["average"] or 0, 2)
        self.review_count = aggregate["total"] or 0
        self.save(update_fields=["rating", "review_count", "updated_at"])


class StadiumImage(BaseModel):
    stadium = models.ForeignKey(Stadium, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="stadiums/%Y/%m/")
    caption = models.CharField(max_length=140, blank=True)
    is_cover = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ("-is_cover", "sort_order", "created_at")
        indexes = [models.Index(fields=["stadium", "is_cover"])]

    def __str__(self) -> str:
        return f"Image of {self.stadium_id}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_cover:
            StadiumImage.objects.filter(stadium_id=self.stadium_id).exclude(
                pk=self.pk
            ).update(is_cover=False)


class StadiumWorkingHour(TimeStampedModel):
    """Opening hours per weekday. `open_time == close_time` is invalid."""

    class Weekday(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    id = models.BigAutoField(primary_key=True)
    stadium = models.ForeignKey(
        Stadium, on_delete=models.CASCADE, related_name="working_hours"
    )
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    open_time = models.TimeField(default="08:00")
    close_time = models.TimeField(default="23:00")
    is_closed = models.BooleanField(default=False)

    class Meta:
        ordering = ("weekday",)
        constraints = [
            models.UniqueConstraint(
                fields=["stadium", "weekday"], name="unique_working_hour_per_weekday"
            )
        ]

    def __str__(self) -> str:
        if self.is_closed:
            return f"{self.get_weekday_display()}: closed"
        return f"{self.get_weekday_display()}: {self.open_time:%H:%M}-{self.close_time:%H:%M}"


class StadiumBlackout(TimeStampedModel):
    """Ad-hoc unavailability window (maintenance, private event, holiday)."""

    id = models.BigAutoField(primary_key=True)
    stadium = models.ForeignKey(Stadium, on_delete=models.CASCADE, related_name="blackouts")
    date = models.DateField(db_index=True)
    start_time = models.TimeField(null=True, blank=True,
                                  help_text="Null blocks the whole day.")
    end_time = models.TimeField(null=True, blank=True)
    reason = models.CharField(max_length=160, blank=True)

    class Meta:
        ordering = ("date", "start_time")
        indexes = [models.Index(fields=["stadium", "date"])]

    def __str__(self) -> str:
        return f"Blackout {self.stadium_id} on {self.date}"


class Favorite(TimeStampedModel):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    stadium = models.ForeignKey(Stadium, on_delete=models.CASCADE, related_name="favorited_by")

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=["user", "stadium"], name="unique_user_favorite")
        ]
        indexes = [models.Index(fields=["user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.user_id} ♥ {self.stadium_id}"
