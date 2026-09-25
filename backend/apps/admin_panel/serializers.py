from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from apps.users.models import OwnerProfile, Role, User, UserProfile


class AdminUserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    booking_count = serializers.IntegerField(read_only=True)
    completed_bookings = serializers.IntegerField(read_only=True)
    total_spent = serializers.DecimalField(max_digits=16, decimal_places=2,
                                           read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "first_name", "last_name", "phone", "email",
                  "username", "telegram_username", "avatar", "role", "is_active",
                  "is_verified", "is_blocked", "blocked_reason", "last_seen_at",
                  "created_at", "booking_count", "completed_bookings", "total_spent")
        read_only_fields = fields


class AdminOwnerSerializer(AdminUserSerializer):
    company_name = serializers.CharField(source="owner_profile.company_name",
                                         read_only=True, default="")
    contact_phone = serializers.CharField(source="owner_profile.contact_phone",
                                          read_only=True, default="")
    commission_percent = serializers.DecimalField(
        source="owner_profile.commission_percent", max_digits=5, decimal_places=2,
        read_only=True, allow_null=True
    )
    stadium_count = serializers.IntegerField(read_only=True)
    total_revenue = serializers.DecimalField(max_digits=16, decimal_places=2,
                                             read_only=True)

    class Meta(AdminUserSerializer.Meta):
        fields = AdminUserSerializer.Meta.fields + (
            "company_name", "contact_phone", "commission_percent",
            "stadium_count", "total_revenue",
        )
        read_only_fields = fields


class OwnerCreateSerializer(serializers.Serializer):
    """Owners exist only because an admin created them — there is no self sign-up."""

    first_name = serializers.CharField(max_length=60)
    last_name = serializers.CharField(max_length=60, allow_blank=True, required=False)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)
    username = serializers.RegexField(r"^[a-zA-Z0-9_.-]{4,32}$")
    password = serializers.CharField(min_length=8, write_only=True)
    company_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    tax_id = serializers.CharField(max_length=32, required=False, allow_blank=True)
    commission_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_phone(self, value):
        from apps.common.utils import normalize_phone

        phone = normalize_phone(value)
        if not phone:
            raise serializers.ValidationError("Telefon raqam noto'g'ri.")
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError("Bu raqam allaqachon ro'yxatdan o'tgan.")
        return phone

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Bu login band.")
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError("Bu email band.")
        return value.lower() if value else None

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_commission_percent(self, value):
        if value is not None and not (0 <= value <= 50):
            raise serializers.ValidationError("Komissiya 0-50% oralig'ida bo'lsin.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        profile_fields = {
            "company_name": validated_data.pop("company_name", ""),
            "tax_id": validated_data.pop("tax_id", ""),
            "commission_percent": validated_data.pop("commission_percent", None),
            "notes": validated_data.pop("notes", ""),
        }
        password = validated_data.pop("password")
        owner = User.objects.create_owner(
            username=validated_data["username"],
            password=password,
            phone=validated_data["phone"],
            email=validated_data.get("email"),
            first_name=validated_data["first_name"],
            last_name=validated_data.get("last_name", ""),
            is_verified=True,
        )
        UserProfile.objects.create(user=owner)
        OwnerProfile.objects.create(
            user=owner,
            contact_phone=owner.phone or "",
            contact_email=owner.email or "",
            created_by=self.context["request"].user,
            **profile_fields,
        )
        return owner


class OwnerUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=60, required=False)
    last_name = serializers.CharField(max_length=60, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, write_only=True, required=False)
    company_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    tax_id = serializers.CharField(max_length=32, required=False, allow_blank=True)
    payout_details = serializers.CharField(max_length=255, required=False, allow_blank=True)
    commission_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_password(self, value):
        validate_password(value)
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        profile_keys = {"company_name", "contact_phone", "tax_id", "payout_details",
                        "commission_percent", "notes"}
        profile_data = {k: v for k, v in validated_data.items() if k in profile_keys}
        user_data = {k: v for k, v in validated_data.items() if k not in profile_keys}

        for field, value in user_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()

        if profile_data:
            profile, _ = OwnerProfile.objects.get_or_create(user=instance)
            for field, value in profile_data.items():
                setattr(profile, field, value)
            profile.save()
        return instance


class BlockSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)


class AdminBookingSerializer(serializers.Serializer):
    """Flat projection tuned for the admin bookings table."""

    id = serializers.UUIDField()
    reference = serializers.CharField()
    status = serializers.CharField()
    date = serializers.DateField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    duration_hours = serializers.IntegerField()
    total_price = serializers.DecimalField(max_digits=14, decimal_places=2)
    commission_amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    owner_earning = serializers.DecimalField(max_digits=14, decimal_places=2)
    currency = serializers.CharField()
    created_at = serializers.DateTimeField()
    stadium_name = serializers.CharField(source="stadium.name")
    stadium_id = serializers.UUIDField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.CharField(source="user.phone", allow_null=True)
    owner_name = serializers.SerializerMethodField()

    def get_customer_name(self, obj) -> str:
        return obj.user.get_full_name() or "Mijoz"

    def get_owner_name(self, obj) -> str:
        return obj.owner.get_full_name() or obj.owner.username or ""


class AdminRoleFilterSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices, required=False)
