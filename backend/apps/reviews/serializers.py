from rest_framework import serializers

from apps.bookings.models import Booking, BookingStatus
from apps.reviews.models import Review


class ReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    user_avatar = serializers.SerializerMethodField()
    stadium_name = serializers.CharField(source="stadium.name", read_only=True)
    booking_reference = serializers.CharField(source="booking.reference", read_only=True)

    class Meta:
        model = Review
        fields = ("id", "booking", "booking_reference", "stadium", "stadium_name",
                  "user_name", "user_avatar", "rating", "comment", "owner_reply",
                  "owner_replied_at", "is_visible", "created_at")
        read_only_fields = ("id", "stadium", "owner_reply", "owner_replied_at",
                            "is_visible", "created_at")

    def get_user_name(self, obj) -> str:
        return obj.user.get_full_name() or "Foydalanuvchi"

    def get_user_avatar(self, obj) -> str | None:
        if not obj.user.avatar:
            return None
        request = self.context.get("request")
        return (request.build_absolute_uri(obj.user.avatar.url)
                if request else obj.user.avatar.url)


class ReviewCreateSerializer(serializers.ModelSerializer):
    booking = serializers.PrimaryKeyRelatedField(queryset=Booking.objects.all())

    class Meta:
        model = Review
        fields = ("booking", "rating", "comment")

    def validate_booking(self, booking):
        user = self.context["request"].user
        if booking.user_id != user.id:
            raise serializers.ValidationError("Bu bron sizga tegishli emas.")
        if booking.status != BookingStatus.COMPLETED:
            raise serializers.ValidationError(
                "Sharh faqat yakunlangan bron uchun qoldiriladi."
            )
        if Review.objects.filter(booking=booking).exists():
            raise serializers.ValidationError("Bu bron uchun sharh allaqachon qoldirilgan.")
        return booking

    def create(self, validated_data):
        booking = validated_data["booking"]
        review = Review.objects.create(
            booking=booking,
            stadium=booking.stadium,
            user=booking.user,
            rating=validated_data["rating"],
            comment=validated_data.get("comment", ""),
        )
        booking.stadium.recalculate_rating()
        return review


class ReviewReplySerializer(serializers.Serializer):
    reply = serializers.CharField(max_length=1000)


class ReviewModerationSerializer(serializers.Serializer):
    is_visible = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)
