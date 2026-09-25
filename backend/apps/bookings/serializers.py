from __future__ import annotations

from datetime import datetime

from rest_framework import serializers

from apps.bookings.models import Booking, BookingStatus, BookingStatusHistory
from apps.stadiums.models import Stadium
from apps.users.serializers import PublicUserSerializer


class BookingStadiumSerializer(serializers.ModelSerializer):
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = Stadium
        fields = ("id", "name", "address", "city", "district", "latitude", "longitude",
                  "cover_image", "phone")

    def get_cover_image(self, obj) -> str | None:
        image = obj.cover_image
        if not image:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(image.image.url) if request else image.image.url


class BookingContactSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    phone = serializers.CharField(allow_null=True, allow_blank=True)
    avatar = serializers.CharField(allow_null=True)


class BookingListSerializer(serializers.ModelSerializer):
    stadium = BookingStadiumSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    can_cancel = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = (
            "id",
            "reference",
            "stadium",
            "date",
            "start_time",
            "end_time",
            "duration_hours",
            "starts_at",
            "ends_at",
            "hourly_price",
            "total_price",
            "currency",
            "status",
            "status_display",
            "rejection_reason",
            "cancellation_reason",
            "can_cancel",
            "can_review",
            "created_at",
        )
        read_only_fields = fields

    def get_can_cancel(self, obj) -> bool:
        return obj.status in {BookingStatus.PENDING, BookingStatus.APPROVED} and not obj.is_past

    def get_can_review(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.user_id == request.user.id and obj.can_be_reviewed


class BookingStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BookingStatusHistory
        fields = ("id", "from_status", "to_status", "note", "changed_by_name", "created_at")

    def get_changed_by_name(self, obj) -> str:
        return obj.changed_by.get_full_name() if obj.changed_by else "System"


class BookingDetailSerializer(BookingListSerializer):
    customer = serializers.SerializerMethodField()
    owner_contact = serializers.SerializerMethodField()
    status_history = BookingStatusHistorySerializer(many=True, read_only=True)
    conversation_id = serializers.SerializerMethodField()

    class Meta(BookingListSerializer.Meta):
        fields = BookingListSerializer.Meta.fields + (
            "customer",
            "owner_contact",
            "customer_note",
            "contact_phone",
            "players_count",
            "commission_percent",
            "commission_amount",
            "owner_earning",
            "approved_at",
            "rejected_at",
            "cancelled_at",
            "completed_at",
            "status_history",
            "conversation_id",
        )

    def _contact(self, user) -> dict:
        request = self.context.get("request")
        avatar = None
        if user.avatar:
            avatar = request.build_absolute_uri(user.avatar.url) if request else user.avatar.url
        return {
            "id": str(user.id),
            "full_name": user.get_full_name() or "Foydalanuvchi",
            "phone": user.phone or "",
            "avatar": avatar,
        }

    def get_customer(self, obj) -> dict:
        return self._contact(obj.user)

    def get_owner_contact(self, obj) -> dict:
        contact = self._contact(obj.owner)
        profile = getattr(obj.owner, "owner_profile", None)
        if profile:
            contact["phone"] = profile.contact_phone or contact["phone"]
            contact["company_name"] = profile.company_name
        return contact

    def get_conversation_id(self, obj) -> str | None:
        conversation = obj.conversations.first()
        return str(conversation.id) if conversation else None


class BookingCreateSerializer(serializers.Serializer):
    stadium_id = serializers.UUIDField()
    date = serializers.DateField()
    start_time = serializers.CharField(help_text="HH:MM, whole hours only.")
    duration_hours = serializers.IntegerField(min_value=1, max_value=12)
    customer_note = serializers.CharField(required=False, allow_blank=True, max_length=255)
    contact_phone = serializers.CharField(required=False, allow_blank=True, max_length=13)
    players_count = serializers.IntegerField(required=False, allow_null=True,
                                             min_value=1, max_value=50)

    def validate_start_time(self, value):
        for fmt in ("%H:%M", "%H:%M:%S"):
            try:
                return datetime.strptime(value, fmt).time()
            except ValueError:
                continue
        raise serializers.ValidationError("Vaqt formati noto'g'ri. Namuna: 18:00")


class BookingDecisionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class QuoteSerializer(serializers.Serializer):
    stadium_id = serializers.UUIDField()
    duration_hours = serializers.IntegerField(min_value=1, max_value=12)
