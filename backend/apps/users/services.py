"""Authentication domain services — kept out of views on purpose."""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.exceptions import DomainError, OTPExpired, OTPInvalid
from apps.common.utils import normalize_phone
from apps.users.models import OTPCode, OTPPurpose, Role, User, UserProfile
from apps.users.sms import SMSError, send_sms

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
def issue_tokens(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["phone"] = user.phone or ""
    access = refresh.access_token
    access["role"] = user.role
    access["phone"] = user.phone or ""
    return {"access": str(access), "refresh": str(refresh)}


# ---------------------------------------------------------------------------
# Phone OTP
# ---------------------------------------------------------------------------
class OTPThrottled(DomainError):
    default_code = "otp_throttled"
    default_detail = "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring."


def request_otp(phone_raw: str, *, purpose: str = OTPPurpose.LOGIN, ip: str | None = None) -> dict:
    phone = normalize_phone(phone_raw)
    if not phone:
        raise DomainError("Telefon raqam noto'g'ri.")

    existing_user = User.objects.filter(phone=phone).first()
    if existing_user and existing_user.is_blocked:
        raise DomainError("Hisobingiz bloklangan. Administrator bilan bog'laning.")
    if existing_user and existing_user.role != Role.USER:
        raise DomainError("Bu raqam login/parol orqali kirish uchun mo'ljallangan.")

    now = timezone.now()

    # Resend cooldown.
    last = OTPCode.objects.filter(phone=phone, purpose=purpose).order_by("-created_at").first()
    if last:
        elapsed = (now - last.created_at).total_seconds()
        if elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
            raise OTPThrottled(
                f"Yangi kod {int(settings.OTP_RESEND_COOLDOWN_SECONDS - elapsed)} "
                "soniyadan so'ng yuborilishi mumkin."
            )

    # Hourly quota per phone number.
    recent_count = OTPCode.objects.filter(
        phone=phone, created_at__gte=now - timedelta(hours=1)
    ).count()
    if recent_count >= settings.OTP_MAX_PER_PHONE_PER_HOUR:
        raise OTPThrottled("Soatlik SMS limiti tugadi. Keyinroq urinib ko'ring.")

    # Invalidate any still-active codes for this phone/purpose.
    OTPCode.objects.filter(phone=phone, purpose=purpose, is_used=False).update(is_used=True)

    code = OTPCode.generate_code()
    otp = OTPCode.objects.create(
        phone=phone,
        code_hash=OTPCode.hash_code(code),
        purpose=purpose,
        expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
        ip_address=ip,
    )

    message = f"{settings.PLATFORM_NAME}: tasdiqlash kodingiz {code}. Kodni hech kimga bermang."
    try:
        send_sms(phone, message)
    except SMSError as exc:
        logger.error("Failed to deliver OTP to %s: %s", phone, exc)
        if not settings.OTP_DEBUG_RETURN_CODE:
            otp.delete()
            raise DomainError("SMS yuborishda xatolik. Keyinroq urinib ko'ring.") from exc

    payload = {
        "phone": phone,
        "expires_in": settings.OTP_TTL_SECONDS,
        "resend_after": settings.OTP_RESEND_COOLDOWN_SECONDS,
        "is_registered": existing_user is not None,
    }
    if settings.OTP_DEBUG_RETURN_CODE:
        # Development convenience only; forced off in production settings.
        payload["debug_code"] = code
    return payload


def verify_otp(phone_raw: str, code: str, *, purpose: str = OTPPurpose.LOGIN) -> OTPCode:
    phone = normalize_phone(phone_raw)
    if not phone:
        raise DomainError("Telefon raqam noto'g'ri.")

    otp = (
        OTPCode.objects.filter(phone=phone, purpose=purpose, is_used=False)
        .order_by("-created_at")
        .first()
    )
    if otp is None:
        raise OTPInvalid("Tasdiqlash kodi topilmadi. Yangi kod so'rang.")
    if otp.is_expired:
        otp.is_used = True
        otp.save(update_fields=["is_used", "updated_at"])
        raise OTPExpired()
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        otp.is_used = True
        otp.save(update_fields=["is_used", "updated_at"])
        raise OTPThrottled("Urinishlar soni tugadi. Yangi kod so'rang.")

    if not otp.check_code(code):
        otp.attempts += 1
        otp.save(update_fields=["attempts", "updated_at"])
        remaining = settings.OTP_MAX_ATTEMPTS - otp.attempts
        raise OTPInvalid(f"Kod noto'g'ri. Yana {max(remaining, 0)} ta urinish qoldi.")

    return otp


@transaction.atomic
def login_or_register_by_phone(otp: OTPCode) -> tuple[User, bool]:
    """Return (user, created). Called only after a successful OTP check."""
    user = User.objects.select_for_update().filter(phone=otp.phone).first()
    created = False
    if user is None:
        user = User.objects.create_user(phone=otp.phone, role=Role.USER, is_verified=True)
        UserProfile.objects.create(user=user)
        created = True
    elif not user.is_verified:
        user.is_verified = True
        user.save(update_fields=["is_verified", "updated_at"])

    if user.is_blocked:
        raise DomainError("Hisobingiz bloklangan. Administrator bilan bog'laning.")

    otp.is_used = True
    otp.save(update_fields=["is_used", "updated_at"])
    return user, created


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _exchange_google_code(code: str, redirect_uri: str | None) -> str:
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise DomainError("Google login sozlanmagan.")
    try:
        response = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri or settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise DomainError("Google bilan bog'lanib bo'lmadi.") from exc
    if response.status_code >= 400:
        logger.warning("Google code exchange failed: %s", response.text[:300])
        raise DomainError("Google avtorizatsiyasi muvaffaqiyatsiz tugadi.")
    id_token = response.json().get("id_token")
    if not id_token:
        raise DomainError("Google javobida id_token yo'q.")
    return id_token


def verify_google_id_token(id_token: str) -> dict:
    """Validate the token with Google and assert it was issued for our client."""
    if not settings.GOOGLE_CLIENT_ID:
        raise DomainError("Google login sozlanmagan.")
    try:
        response = requests.get(GOOGLE_TOKENINFO_URL, params={"id_token": id_token}, timeout=10)
    except requests.RequestException as exc:
        raise DomainError("Google bilan bog'lanib bo'lmadi.") from exc
    if response.status_code >= 400:
        raise DomainError("Google tokeni yaroqsiz.")

    data = response.json()
    if data.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise DomainError("Google tokeni boshqa ilova uchun berilgan.")
    if data.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise DomainError("Google tokeni ishonchsiz manbadan.")
    if str(data.get("email_verified", "false")).lower() not in {"true", "1"}:
        raise DomainError("Google email tasdiqlanmagan.")
    return data


@transaction.atomic
def login_or_register_with_google(*, id_token: str = "", code: str = "",
                                  redirect_uri: str | None = None) -> tuple[User, bool]:
    if not id_token:
        if not code:
            raise DomainError("Google id_token yoki code kerak.")
        id_token = _exchange_google_code(code, redirect_uri)

    claims = verify_google_id_token(id_token)
    google_id = claims.get("sub")
    email = (claims.get("email") or "").lower() or None
    if not google_id:
        raise DomainError("Google identifikatori topilmadi.")

    user = User.objects.select_for_update().filter(google_id=google_id).first()
    created = False
    if user is None and email:
        user = User.objects.select_for_update().filter(email=email).first()
        if user is not None:
            user.google_id = google_id
            user.save(update_fields=["google_id", "updated_at"])

    if user is None:
        user = User.objects.create_user(
            email=email,
            role=Role.USER,
            google_id=google_id,
            first_name=(claims.get("given_name") or "")[:60],
            last_name=(claims.get("family_name") or "")[:60],
            is_verified=True,
        )
        UserProfile.objects.create(user=user)
        created = True

    if user.is_blocked:
        raise DomainError("Hisobingiz bloklangan. Administrator bilan bog'laning.")
    return user, created


# ---------------------------------------------------------------------------
# Yandex ID (OAuth 2.0)
# ---------------------------------------------------------------------------
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_USERINFO_URL = "https://login.yandex.ru/info"


def _exchange_yandex_code(code: str, redirect_uri: str | None) -> str:
    if not settings.YANDEX_OAUTH_CLIENT_ID or not settings.YANDEX_OAUTH_CLIENT_SECRET:
        raise DomainError("Yandex login sozlanmagan.")
    try:
        response = requests.post(
            YANDEX_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.YANDEX_OAUTH_CLIENT_ID,
                "client_secret": settings.YANDEX_OAUTH_CLIENT_SECRET,
                "redirect_uri": redirect_uri or settings.YANDEX_OAUTH_REDIRECT_URI,
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        raise DomainError("Yandex bilan bog'lanib bo'lmadi.") from exc
    if response.status_code >= 400:
        logger.warning("Yandex code exchange failed: %s", response.text[:300])
        raise DomainError("Yandex avtorizatsiyasi muvaffaqiyatsiz tugadi.")
    access_token = response.json().get("access_token")
    if not access_token:
        raise DomainError("Yandex javobida access_token yo'q.")
    return access_token


def fetch_yandex_profile(access_token: str) -> dict:
    """
    Read the account behind an access token.

    Yandex has no id_token to verify offline: the token itself is the proof, so
    the only way to learn who it belongs to — and that it is still valid — is to
    spend it against the userinfo endpoint.
    """
    if not settings.YANDEX_OAUTH_CLIENT_ID:
        raise DomainError("Yandex login sozlanmagan.")
    try:
        response = requests.get(
            YANDEX_USERINFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
            timeout=10,
        )
    except requests.RequestException as exc:
        raise DomainError("Yandex bilan bog'lanib bo'lmadi.") from exc
    if response.status_code == 401:
        raise DomainError("Yandex tokeni yaroqsiz yoki muddati tugagan.")
    if response.status_code >= 400:
        logger.warning("Yandex userinfo failed: %s", response.text[:300])
        raise DomainError("Yandex profilini o'qib bo'lmadi.")

    data = response.json()
    if not data.get("id"):
        raise DomainError("Yandex identifikatori topilmadi.")
    return data


@transaction.atomic
def login_or_register_with_yandex(*, access_token: str = "", code: str = "",
                                  redirect_uri: str | None = None) -> tuple[User, bool]:
    if not access_token:
        if not code:
            raise DomainError("Yandex access_token yoki code kerak.")
        access_token = _exchange_yandex_code(code, redirect_uri)

    profile = fetch_yandex_profile(access_token)
    yandex_id = str(profile["id"])
    # `default_email` is absent when the account has no confirmed address, and
    # `emails` may still carry one; either way the address is optional here.
    email = (profile.get("default_email")
             or next(iter(profile.get("emails") or []), "")).lower() or None

    user = User.objects.select_for_update().filter(yandex_id=yandex_id).first()
    created = False
    if user is None and email:
        # Same person arriving through a second provider: attach rather than
        # create a duplicate account, exactly as the Google flow does.
        user = User.objects.select_for_update().filter(email=email).first()
        if user is not None:
            user.yandex_id = yandex_id
            user.save(update_fields=["yandex_id", "updated_at"])

    if user is None:
        user = User.objects.create_user(
            email=email,
            role=Role.USER,
            yandex_id=yandex_id,
            first_name=(profile.get("first_name") or "")[:60],
            last_name=(profile.get("last_name") or "")[:60],
            is_verified=True,
        )
        UserProfile.objects.create(user=user)
        created = True

    if user.is_blocked:
        raise DomainError("Hisobingiz bloklangan. Administrator bilan bog'laning.")
    return user, created


# ---------------------------------------------------------------------------
# Telegram Login Widget
# ---------------------------------------------------------------------------
def verify_telegram_payload(payload: dict) -> dict:
    """
    Validate the Telegram Login Widget signature.

    Algorithm per Telegram docs: secret = SHA256(bot_token); the hash is an
    HMAC-SHA256 of the sorted "key=value" data-check-string.
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        raise DomainError("Telegram login sozlanmagan.")

    data = {k: v for k, v in payload.items() if v is not None and k != "hash"}
    received_hash = payload.get("hash") or ""
    if not received_hash:
        raise DomainError("Telegram imzosi topilmadi.")

    check_string = "\n".join(f"{key}={data[key]}" for key in sorted(data))
    secret_key = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
    expected = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, received_hash):
        raise DomainError("Telegram imzosi yaroqsiz.")

    try:
        auth_date = int(data.get("auth_date", 0))
    except (TypeError, ValueError) as exc:
        raise DomainError("Telegram auth_date yaroqsiz.") from exc

    age = timezone.now().timestamp() - auth_date
    if age > settings.TELEGRAM_AUTH_MAX_AGE_SECONDS:
        raise DomainError("Telegram avtorizatsiyasi muddati tugagan.")
    return data


@transaction.atomic
def login_or_register_with_telegram(payload: dict) -> tuple[User, bool]:
    data = verify_telegram_payload(payload)
    telegram_id = int(data["id"])

    user = User.objects.select_for_update().filter(telegram_id=telegram_id).first()
    created = False
    if user is None:
        user = User.objects.create_user(
            role=Role.USER,
            telegram_id=telegram_id,
            telegram_username=(data.get("username") or "")[:64],
            first_name=(data.get("first_name") or "")[:60],
            last_name=(data.get("last_name") or "")[:60],
            is_verified=True,
        )
        UserProfile.objects.create(user=user)
        created = True
    elif data.get("username") and user.telegram_username != data["username"]:
        user.telegram_username = data["username"][:64]
        user.save(update_fields=["telegram_username", "updated_at"])

    if user.is_blocked:
        raise DomainError("Hisobingiz bloklangan. Administrator bilan bog'laning.")
    return user, created
