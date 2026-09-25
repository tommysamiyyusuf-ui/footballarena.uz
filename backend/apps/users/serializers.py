from __future__ import annotations

from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.common.utils import normalize_phone
from apps.common.validators import validate_image_file
from apps.users.models import OwnerProfile, Role, User, UserProfile


class PublicUserSerializer(serializers.ModelSerializer):
    """Minimal projection safe to expose to other participants (chat, bookings)."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ("id", "full_name", "first_name", "last_name", "avatar", "role")
        read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = (
            "birth_date",
            "city",
            "district",
            "default_latitude",
            "default_longitude",
            "notify_web",
            "notify_email",
            "notify_telegram",
        )


class OwnerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = OwnerProfile
        fields = (
            "company_name",
            "contact_phone",
            "contact_email",
            "telegram_contact",
            "tax_id",
            "payout_details",
            "commission_percent",
        )
        read_only_fields = ("commission_percent",)


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    profile = UserProfileSerializer(read_only=True)
    owner_profile = OwnerProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "phone",
            "email",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "avatar",
            "role",
            "language",
            "telegram_username",
            "is_verified",
            "is_blocked",
            "created_at",
            "profile",
            "owner_profile",
        )
        read_only_fields = (
            "id", "phone", "username", "role", "is_verified", "is_blocked", "created_at",
        )


class UpdateMeSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(required=False)

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "avatar", "language", "profile")

    def validate_avatar(self, value):
        if value:
            validate_image_file(value)
        return value

    def validate_email(self, value):
        if not value:
            return None
        value = value.lower()
        qs = User.objects.filter(email=value).exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bu email allaqachon band.")
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if profile_data:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            for field, value in profile_data.items():
                setattr(profile, field, value)
            profile.save()
        return instance


# ---------------------------------------------------------------------------
# Auth request/response payloads
# ---------------------------------------------------------------------------
class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        raw = super().to_internal_value(data)
        phone = normalize_phone(raw)
        if not phone:
            raise serializers.ValidationError(
                "Telefon raqam noto'g'ri. Namuna: +998 90 123 45 67"
            )
        return phone


class RequestOTPSerializer(serializers.Serializer):
    phone = PhoneField(max_length=20)


class VerifyOTPSerializer(serializers.Serializer):
    phone = PhoneField(max_length=20)
    code = serializers.RegexField(r"^\d{4,8}$", help_text="The SMS code.")


class CompleteRegistrationSerializer(serializers.Serializer):
    """Used right after OTP verification when the account is brand new."""

    verification_token = serializers.CharField(max_length=64)
    first_name = serializers.CharField(max_length=60)
    last_name = serializers.CharField(max_length=60, allow_blank=True, required=False)
    avatar = serializers.ImageField(required=False, allow_null=True)

    def validate_avatar(self, value):
        if value:
            validate_image_file(value)
        return value


class GoogleAuthSerializer(serializers.Serializer):
    id_token = serializers.CharField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, allow_blank=True)
    redirect_uri = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("id_token") and not attrs.get("code"):
            raise serializers.ValidationError("id_token yoki code yuborilishi shart.")
        return attrs


class YandexAuthSerializer(serializers.Serializer):
    access_token = serializers.CharField(required=False, allow_blank=True)
    code = serializers.CharField(required=False, allow_blank=True)
    redirect_uri = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("access_token") and not attrs.get("code"):
            raise serializers.ValidationError(
                "access_token yoki code yuborilishi shart."
            )
        return attrs


class TelegramAuthSerializer(serializers.Serializer):
    id = serializers.CharField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True)
    photo_url = serializers.CharField(required=False, allow_blank=True)
    auth_date = serializers.CharField()
    hash = serializers.CharField()


class PasswordLoginSerializer(serializers.Serializer):
    """Login for ADMIN and OWNER accounts."""

    username = serializers.CharField(max_length=64)
    password = serializers.CharField(max_length=128, write_only=True,
                                     style={"input_type": "password"})

    def validate(self, attrs):
        request = self.context.get("request")
        username = attrs["username"].strip()
        user = authenticate(request, username=username, password=attrs["password"])

        if user is None:
            # Allow admins/owners to sign in with their e-mail as well.
            candidate = User.objects.filter(email=username.lower()).first()
            if candidate and candidate.username:
                user = authenticate(
                    request, username=candidate.username, password=attrs["password"]
                )

        if user is None:
            raise serializers.ValidationError("Login yoki parol noto'g'ri.")
        if user.role == Role.USER:
            raise serializers.ValidationError(
                "Bu hisob telefon raqam orqali kirishi kerak."
            )
        if user.is_blocked:
            raise serializers.ValidationError("Hisobingiz bloklangan.")
        if not user.is_active:
            raise serializers.ValidationError("Hisobingiz faol emas.")

        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Joriy parol noto'g'ri.")
        return value

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password

        validate_password(value, self.context["request"].user)
        return value


class ArenaTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role/phone claims so the SPA can route without an extra request."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["phone"] = user.phone or ""
        return token
