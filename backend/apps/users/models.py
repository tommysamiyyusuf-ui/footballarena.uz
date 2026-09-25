from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel, TimeStampedModel
from apps.common.utils import normalize_phone
from apps.common.validators import phone_validator, username_validator


class Role(models.TextChoices):
    ADMIN = "ADMIN", "Administrator"
    OWNER = "OWNER", "Stadium owner"
    USER = "USER", "Customer"


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, *, phone=None, email=None, username=None, password=None, **extra):
        if not any([phone, email, username, extra.get("google_id"),
                    extra.get("yandex_id"), extra.get("telegram_id")]):
            raise ValueError(
                "A user requires at least one identifier "
                "(phone, email, username, google_id, yandex_id or telegram_id)."
            )
        user = self.model(
            phone=normalize_phone(phone) or None,
            email=self.normalize_email(email) if email else None,
            username=username or None,
            **extra,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def create_user(self, phone=None, email=None, username=None, password=None, **extra):
        extra.setdefault("role", Role.USER)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create(
            phone=phone, email=email, username=username, password=password, **extra
        )

    def create_owner(self, *, username, password, phone=None, email=None, **extra):
        extra.update(role=Role.OWNER, is_staff=False, is_superuser=False)
        return self._create(
            phone=phone, email=email, username=username, password=password, **extra
        )

    def create_superuser(self, username=None, email=None, password=None, **extra):
        extra.update(role=Role.ADMIN, is_staff=True, is_superuser=True, is_verified=True)
        return self._create(
            phone=extra.pop("phone", None),
            email=email,
            username=username,
            password=password,
            **extra,
        )


class User(AbstractBaseUser, PermissionsMixin, BaseModel):
    phone = models.CharField(
        max_length=13,
        unique=True,
        null=True,
        blank=True,
        validators=[phone_validator],
        db_index=True,
    )
    email = models.EmailField(unique=True, null=True, blank=True, db_index=True)
    username = models.CharField(
        max_length=32,
        unique=True,
        null=True,
        blank=True,
        validators=[username_validator],
        help_text="Used by owners and admins for password login.",
    )
    first_name = models.CharField(max_length=60, blank=True)
    last_name = models.CharField(max_length=60, blank=True)
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", null=True, blank=True)
    role = models.CharField(
        max_length=8, choices=Role.choices, default=Role.USER, db_index=True
    )
    google_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    yandex_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    telegram_id = models.BigIntegerField(unique=True, null=True, blank=True)
    telegram_username = models.CharField(max_length=64, blank=True)
    language = models.CharField(max_length=5, default="uz")
    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    is_blocked = models.BooleanField(default=False, db_index=True)
    blocked_reason = models.CharField(max_length=255, blank=True)
    blocked_at = models.DateTimeField(null=True, blank=True)
    is_staff = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    # Username is the credential for admins/owners. Customers authenticate by
    # phone/Google/Yandex/Telegram and simply leave it NULL (Postgres allows many
    # NULLs in a unique column).
    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["role", "is_blocked"]),
            models.Index(fields=["-created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(phone__isnull=False)
                | models.Q(email__isnull=False)
                | models.Q(username__isnull=False)
                | models.Q(google_id__isnull=False)
                | models.Q(yandex_id__isnull=False)
                | models.Q(telegram_id__isnull=False),
                name="user_has_identifier",
            )
        ]

    def __str__(self) -> str:
        return self.get_full_name() or self.phone or self.username or self.email or str(self.id)

    def save(self, *args, **kwargs):
        if self.phone:
            self.phone = normalize_phone(self.phone)
        for field in ("email", "username", "phone", "google_id", "yandex_id"):
            if getattr(self, field) == "":
                setattr(self, field, None)
        super().save(*args, **kwargs)

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name or self.get_full_name()

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_owner(self) -> bool:
        return self.role == Role.OWNER

    @property
    def is_customer(self) -> bool:
        return self.role == Role.USER

    def block(self, reason: str = "") -> None:
        self.is_blocked = True
        self.blocked_reason = reason
        self.blocked_at = timezone.now()
        self.save(update_fields=["is_blocked", "blocked_reason", "blocked_at", "updated_at"])

    def unblock(self) -> None:
        self.is_blocked = False
        self.blocked_reason = ""
        self.blocked_at = None
        self.save(update_fields=["is_blocked", "blocked_reason", "blocked_at", "updated_at"])


class UserProfile(TimeStampedModel):
    """Customer-facing extras kept off the hot auth table."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    birth_date = models.DateField(null=True, blank=True)
    city = models.CharField(max_length=80, blank=True)
    district = models.CharField(max_length=80, blank=True)
    default_latitude = models.FloatField(null=True, blank=True)
    default_longitude = models.FloatField(null=True, blank=True)
    notify_web = models.BooleanField(default=True)
    notify_email = models.BooleanField(default=False)
    notify_telegram = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"Profile of {self.user}"


class OwnerProfile(TimeStampedModel):
    """Business details for stadium owners; created by admins only."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="owner_profile")
    company_name = models.CharField(max_length=150, blank=True)
    contact_phone = models.CharField(max_length=13, blank=True, validators=[phone_validator])
    contact_email = models.EmailField(blank=True)
    telegram_contact = models.CharField(max_length=64, blank=True)
    tax_id = models.CharField(max_length=32, blank=True)
    payout_details = models.CharField(max_length=255, blank=True)
    commission_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Overrides the platform-wide commission when set.",
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_owners"
    )
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.company_name or str(self.user)


class OTPPurpose(models.TextChoices):
    LOGIN = "LOGIN", "Login / registration"
    PHONE_CHANGE = "PHONE_CHANGE", "Phone number change"


class OTPCode(TimeStampedModel):
    """
    One-time password for phone authentication.

    The plaintext code is never persisted — only an HMAC-SHA256 digest keyed with
    SECRET_KEY, so a database leak cannot be replayed.
    """

    id = models.BigAutoField(primary_key=True)
    phone = models.CharField(max_length=13, db_index=True, validators=[phone_validator])
    code_hash = models.CharField(max_length=64)
    purpose = models.CharField(max_length=16, choices=OTPPurpose.choices, default=OTPPurpose.LOGIN)
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    verification_token = models.CharField(max_length=64, blank=True, db_index=True)
    verification_token_expires_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["phone", "purpose", "-created_at"]),
            models.Index(fields=["phone", "is_used"]),
        ]

    def __str__(self) -> str:
        return f"OTP for {self.phone} ({'used' if self.is_used else 'active'})"

    @staticmethod
    def hash_code(code: str) -> str:
        return hmac.new(
            settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256
        ).hexdigest()

    @classmethod
    def generate_code(cls) -> str:
        upper = 10 ** settings.OTP_LENGTH
        return str(secrets.randbelow(upper)).zfill(settings.OTP_LENGTH)

    def check_code(self, code: str) -> bool:
        return hmac.compare_digest(self.code_hash, self.hash_code(code or ""))

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def seconds_left(self) -> int:
        return max(0, int((self.expires_at - timezone.now()).total_seconds()))

    def issue_verification_token(self) -> str:
        token = secrets.token_urlsafe(32)[:64]
        self.verification_token = token
        self.verification_token_expires_at = timezone.now() + timedelta(minutes=15)
        self.is_used = True
        self.save(
            update_fields=[
                "verification_token",
                "verification_token_expires_at",
                "is_used",
                "updated_at",
            ]
        )
        return token
