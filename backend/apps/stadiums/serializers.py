from __future__ import annotations

from django.db import transaction
from rest_framework import serializers

from apps.common.validators import validate_image_file, validate_latitude, validate_longitude
from apps.stadiums.models import (
    Amenity,
    Favorite,
    Stadium,
    StadiumBlackout,
    StadiumImage,
    StadiumStatus,
    StadiumWorkingHour,
)
from apps.users.serializers import PublicUserSerializer


class AmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Amenity
        fields = ("id", "code", "name", "name_uz", "icon")


class StadiumImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = StadiumImage
        fields = ("id", "image", "caption", "is_cover", "sort_order")


class WorkingHourSerializer(serializers.ModelSerializer):
    weekday_name = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = StadiumWorkingHour
        fields = ("weekday", "weekday_name", "open_time", "close_time", "is_closed")

    def validate(self, attrs):
        if not attrs.get("is_closed") and attrs.get("open_time") == attrs.get("close_time"):
            raise serializers.ValidationError(
                "Ochilish va yopilish vaqti bir xil bo'lishi mumkin emas."
            )
        return attrs


class BlackoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = StadiumBlackout
        fields = ("id", "date", "start_time", "end_time", "reason")

    def validate(self, attrs):
        start, end = attrs.get("start_time"), attrs.get("end_time")
        if bool(start) != bool(end):
            raise serializers.ValidationError(
                "Vaqt oralig'i uchun boshlanish va tugash vaqti birga kiritilsin."
            )
        if start and end and start >= end:
            raise serializers.ValidationError("Tugash vaqti boshlanishdan keyin bo'lishi kerak.")
        return attrs


class OwnerContactSerializer(serializers.Serializer):
    """Owner contact details exposed on the stadium page."""

    id = serializers.UUIDField()
    full_name = serializers.CharField()
    avatar = serializers.ImageField(allow_null=True)
    phone = serializers.CharField(allow_null=True)
    company_name = serializers.CharField(allow_blank=True)


class StadiumListSerializer(serializers.ModelSerializer):
    """Compact projection for map markers, cards and search results."""

    cover_image = serializers.SerializerMethodField()
    field_type_display = serializers.CharField(source="get_field_type_display", read_only=True)
    distance_km = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    amenity_codes = serializers.SerializerMethodField()

    class Meta:
        model = Stadium
        fields = (
            "id",
            "name",
            "slug",
            "city",
            "district",
            "address",
            "latitude",
            "longitude",
            "field_type",
            "field_type_display",
            "price_per_hour",
            "rating",
            "review_count",
            "cover_image",
            "distance_km",
            "is_favorite",
            "amenity_codes",
            "is_active",
            "status",
        )

    def get_cover_image(self, obj) -> str | None:
        image = obj.cover_image
        if not image:
            return None
        request = self.context.get("request")
        url = image.image.url
        return request.build_absolute_uri(url) if request else url

    def get_distance_km(self, obj) -> float | None:
        value = getattr(obj, "distance_km", None)
        return round(value, 2) if value is not None else None

    def get_is_favorite(self, obj) -> bool:
        favorites = self.context.get("favorite_ids")
        return obj.id in favorites if favorites is not None else False

    def get_amenity_codes(self, obj) -> list[str]:
        return [amenity.code for amenity in obj.amenities.all()]


class StadiumDetailSerializer(StadiumListSerializer):
    images = StadiumImageSerializer(many=True, read_only=True)
    amenities = AmenitySerializer(many=True, read_only=True)
    working_hours = WorkingHourSerializer(many=True, read_only=True)
    owner = serializers.SerializerMethodField()

    class Meta(StadiumListSerializer.Meta):
        fields = StadiumListSerializer.Meta.fields + (
            "description",
            "capacity",
            "country",
            "phone",
            "images",
            "amenities",
            "working_hours",
            "owner",
            "booking_count",
            "moderation_note",
            "created_at",
        )

    def get_owner(self, obj) -> dict:
        profile = getattr(obj.owner, "owner_profile", None)
        request = self.context.get("request")
        avatar = None
        if obj.owner.avatar:
            avatar = request.build_absolute_uri(obj.owner.avatar.url) if request \
                else obj.owner.avatar.url
        return {
            "id": str(obj.owner_id),
            "full_name": obj.owner.get_full_name() or "Arendator",
            "avatar": avatar,
            "phone": (profile.contact_phone if profile and profile.contact_phone
                      else obj.owner.phone),
            "company_name": profile.company_name if profile else "",
        }


class StadiumWriteSerializer(serializers.ModelSerializer):
    """Create/update payload used by owners (and admins acting on their behalf)."""

    amenity_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Amenity.objects.all(), source="amenities", required=False
    )
    working_hours = WorkingHourSerializer(many=True, required=False)
    uploaded_images = serializers.ListField(
        child=serializers.ImageField(), write_only=True, required=False, max_length=12
    )

    class Meta:
        model = Stadium
        fields = (
            "id",
            "name",
            "description",
            "field_type",
            "capacity",
            "price_per_hour",
            "country",
            "city",
            "district",
            "address",
            "latitude",
            "longitude",
            "phone",
            "is_active",
            "amenity_ids",
            "working_hours",
            "uploaded_images",
            "status",
            "moderation_note",
        )
        read_only_fields = ("id", "status", "moderation_note")

    def validate_price_per_hour(self, value):
        if value <= 0:
            raise serializers.ValidationError("Narx 0 dan katta bo'lishi kerak.")
        if value > 100_000_000:
            raise serializers.ValidationError("Narx juda katta.")
        return value

    def validate_latitude(self, value):
        validate_latitude(value)
        return value

    def validate_longitude(self, value):
        validate_longitude(value)
        return value

    def validate_uploaded_images(self, files):
        for file_obj in files:
            validate_image_file(file_obj)
        return files

    def validate_working_hours(self, value):
        weekdays = [item["weekday"] for item in value]
        if len(weekdays) != len(set(weekdays)):
            raise serializers.ValidationError("Har bir kun uchun faqat bitta yozuv bo'lsin.")
        return value

    def _sync_working_hours(self, stadium, hours):
        StadiumWorkingHour.objects.filter(stadium=stadium).delete()
        StadiumWorkingHour.objects.bulk_create(
            [StadiumWorkingHour(stadium=stadium, **item) for item in hours]
        )

    def _save_images(self, stadium, files):
        has_cover = stadium.images.filter(is_cover=True).exists()
        offset = stadium.images.count()
        for index, file_obj in enumerate(files):
            StadiumImage.objects.create(
                stadium=stadium,
                image=file_obj,
                sort_order=offset + index,
                is_cover=(not has_cover and index == 0),
            )

    @transaction.atomic
    def create(self, validated_data):
        hours = validated_data.pop("working_hours", None)
        images = validated_data.pop("uploaded_images", [])
        amenities = validated_data.pop("amenities", [])

        owner = self.context["request"].user
        stadium = Stadium.objects.create(owner=owner, status=StadiumStatus.PENDING,
                                         **validated_data)
        if amenities:
            stadium.amenities.set(amenities)
        self._sync_working_hours(stadium, hours if hours is not None
                                 else _default_working_hours())
        if images:
            self._save_images(stadium, images)
        return stadium

    @transaction.atomic
    def update(self, instance, validated_data):
        hours = validated_data.pop("working_hours", None)
        images = validated_data.pop("uploaded_images", [])
        amenities = validated_data.pop("amenities", None)

        # Editing a rejected stadium re-enters moderation.
        significant = {"name", "description", "address", "latitude", "longitude",
                       "price_per_hour", "field_type"}
        if instance.status == StadiumStatus.REJECTED and significant & set(validated_data):
            instance.status = StadiumStatus.PENDING
            instance.moderation_note = ""

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if amenities is not None:
            instance.amenities.set(amenities)
        if hours is not None:
            self._sync_working_hours(instance, hours)
        if images:
            self._save_images(instance, images)
        return instance


def _default_working_hours() -> list[dict]:
    from datetime import time

    return [
        {"weekday": day, "open_time": time(8, 0), "close_time": time(23, 0),
         "is_closed": False}
        for day in range(7)
    ]


class FavoriteSerializer(serializers.ModelSerializer):
    stadium = StadiumListSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ("id", "stadium", "created_at")


class TimeSlotSerializer(serializers.Serializer):
    start_time = serializers.CharField()
    end_time = serializers.CharField()
    is_available = serializers.BooleanField()
    reason = serializers.CharField(allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2)


class AvailabilitySerializer(serializers.Serializer):
    date = serializers.DateField()
    is_open = serializers.BooleanField()
    open_time = serializers.CharField(allow_null=True)
    close_time = serializers.CharField(allow_null=True)
    price_per_hour = serializers.DecimalField(max_digits=12, decimal_places=2)
    slots = TimeSlotSerializer(many=True)


class ModerationSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["APPROVE", "REJECT", "REQUEST_CHANGES", "BLOCK"])
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)

    def validate(self, attrs):
        if attrs["action"] in {"REJECT", "REQUEST_CHANGES", "BLOCK"} and not attrs.get("note"):
            raise serializers.ValidationError({"note": "Sabab ko'rsatilishi shart."})
        return attrs


class PublicOwnerSerializer(PublicUserSerializer):
    pass
