"""Phone OTP, password login, Telegram/Yandex sign-in and JWT behaviour."""
from __future__ import annotations

import hashlib
import hmac
import time as time_module

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.users.models import OTPCode, Role, User

pytestmark = pytest.mark.django_db


def _request_code(api, phone="+998911234567"):
    response = api.post("/api/auth/phone/request-otp/", {"phone": phone}, format="json")
    assert response.status_code == 200, response.data
    return response.data["debug_code"]


# --- OTP ---------------------------------------------------------------------

def test_otp_is_never_stored_in_plaintext(api):
    code = _request_code(api)
    otp = OTPCode.objects.latest("created_at")
    assert code not in otp.code_hash
    assert otp.code_hash == OTPCode.hash_code(code)
    assert len(otp.code_hash) == 64  # sha256 hex
    # There is no plaintext column at all.
    assert not hasattr(otp, "code")


def test_new_phone_requires_registration_then_gets_tokens(api):
    phone = "+998911234567"
    code = _request_code(api, phone)

    verify = api.post("/api/auth/phone/verify/",
                      {"phone": phone, "code": code}, format="json")
    assert verify.status_code == 200
    assert verify.data["registration_required"] is True
    token = verify.data["verification_token"]
    assert not User.objects.filter(phone=phone).exists()

    complete = api.post(
        "/api/auth/phone/complete/",
        {"verification_token": token, "first_name": "Aziz", "last_name": "Karimov"},
        format="json",
    )
    assert complete.status_code == 201
    assert complete.data["tokens"]["access"]
    user = User.objects.get(phone=phone)
    assert user.role == Role.USER
    assert user.get_full_name() == "Aziz Karimov"


def test_verification_token_cannot_be_replayed(api):
    phone = "+998911234567"
    code = _request_code(api, phone)
    token = api.post("/api/auth/phone/verify/",
                     {"phone": phone, "code": code},
                     format="json").data["verification_token"]

    first = api.post("/api/auth/phone/complete/",
                     {"verification_token": token, "first_name": "Aziz"}, format="json")
    assert first.status_code == 201

    replay = api.post("/api/auth/phone/complete/",
                      {"verification_token": token, "first_name": "Hacker"},
                      format="json")
    assert replay.status_code == 400


def test_existing_customer_signs_in_directly(api, customer):
    code = _request_code(api, customer.phone)
    response = api.post("/api/auth/phone/verify/",
                        {"phone": customer.phone, "code": code}, format="json")
    assert response.status_code == 200
    assert response.data["registration_required"] is False
    assert response.data["tokens"]["access"]
    assert response.data["user"]["role"] == Role.USER


def test_wrong_code_is_rejected(api):
    phone = "+998911234567"
    real = _request_code(api, phone)
    wrong = "000000" if real != "000000" else "111111"
    response = api.post("/api/auth/phone/verify/",
                        {"phone": phone, "code": wrong}, format="json")
    assert response.status_code == 400


def test_expired_code_is_rejected(api):
    phone = "+998911234567"
    code = _request_code(api, phone)
    otp = OTPCode.objects.latest("created_at")
    otp.expires_at = timezone.now() - timezone.timedelta(seconds=1)
    otp.save(update_fields=["expires_at"])

    response = api.post("/api/auth/phone/verify/",
                        {"phone": phone, "code": code}, format="json")
    assert response.status_code == 400


@override_settings(OTP_MAX_ATTEMPTS=3)
def test_attempt_limit_burns_the_code(api):
    phone = "+998911234567"
    code = _request_code(api, phone)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(3):
        api.post("/api/auth/phone/verify/", {"phone": phone, "code": wrong},
                 format="json")

    # Even the correct code no longer works once the attempt budget is spent.
    response = api.post("/api/auth/phone/verify/", {"phone": phone, "code": code},
                        format="json")
    assert response.status_code == 400


@override_settings(OTP_RESEND_COOLDOWN_SECONDS=60)
def test_resend_cooldown_is_enforced(api):
    phone = "+998911234567"
    _request_code(api, phone)
    second = api.post("/api/auth/phone/request-otp/", {"phone": phone}, format="json")
    assert second.status_code == 400
    assert "soniya" in str(second.data).lower() or second.data["code"]


def test_phone_is_normalised_to_e164(api):
    for raw in ["998911234567", "+998 91 123 45 67", "91 123 45 67"]:
        response = api.post("/api/auth/phone/request-otp/", {"phone": raw},
                            format="json")
        assert response.status_code in (200, 400)
        if response.status_code == 200:
            assert OTPCode.objects.latest("created_at").phone == "+998911234567"
            OTPCode.objects.all().delete()


def test_invalid_phone_is_rejected(api):
    response = api.post("/api/auth/phone/request-otp/", {"phone": "12345"},
                        format="json")
    assert response.status_code == 400


# --- Password login ----------------------------------------------------------

def test_owner_logs_in_with_username_and_password(api, owner):
    response = api.post("/api/auth/login/",
                        {"username": owner.username, "password": "Owner12345!"},
                        format="json")
    assert response.status_code == 200
    assert response.data["user"]["role"] == Role.OWNER


def test_admin_logs_in_with_email(api, admin_user):
    response = api.post("/api/auth/login/",
                        {"username": admin_user.email, "password": "Admin12345!"},
                        format="json")
    assert response.status_code == 200
    assert response.data["user"]["role"] == Role.ADMIN


def test_wrong_password_is_rejected(api, owner):
    response = api.post("/api/auth/login/",
                        {"username": owner.username, "password": "nope"}, format="json")
    assert response.status_code == 400


def test_customer_cannot_use_the_password_endpoint(api, customer):
    """Customers have no usable password — phone OTP is their only route."""
    response = api.post("/api/auth/login/",
                        {"username": customer.phone, "password": "anything"},
                        format="json")
    assert response.status_code == 400


def test_blocked_owner_cannot_log_in(api, owner):
    owner.block("Shartnoma buzilgan")
    response = api.post("/api/auth/login/",
                        {"username": owner.username, "password": "Owner12345!"},
                        format="json")
    assert response.status_code == 400


# --- JWT ---------------------------------------------------------------------

def test_blocking_a_user_invalidates_their_live_token(auth, customer):
    client = auth(customer)
    assert client.get("/api/users/me/").status_code == 200

    customer.block("Spam")
    assert client.get("/api/users/me/").status_code == 401


def test_anonymous_cannot_read_me(api):
    assert api.get("/api/users/me/").status_code == 401


def test_logout_blacklists_the_refresh_token(api, customer, auth):
    code = _request_code(api, customer.phone)
    tokens = api.post("/api/auth/phone/verify/",
                      {"phone": customer.phone, "code": code},
                      format="json").data["tokens"]

    client = auth(customer)
    assert client.post("/api/auth/logout/", {"refresh": tokens["refresh"]},
                       format="json").status_code == 205

    refreshed = api.post("/api/auth/token/refresh/", {"refresh": tokens["refresh"]},
                         format="json")
    assert refreshed.status_code == 401


def test_access_token_carries_the_role_claim(customer):
    from rest_framework_simplejwt.tokens import AccessToken

    from apps.users.services import issue_tokens

    token = AccessToken(issue_tokens(customer)["access"])
    assert token["role"] == Role.USER


# --- Telegram ----------------------------------------------------------------

TELEGRAM_TOKEN = "123456:TEST-BOT-TOKEN"


def _sign_telegram(payload: dict, bot_token: str = TELEGRAM_TOKEN) -> str:
    check_string = "\n".join(
        f"{key}={payload[key]}" for key in sorted(payload) if key != "hash"
    )
    secret = hashlib.sha256(bot_token.encode()).digest()
    return hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()


@override_settings(TELEGRAM_BOT_TOKEN=TELEGRAM_TOKEN)
def test_valid_telegram_signature_creates_a_user(api):
    payload = {
        "id": 555000111,
        "first_name": "Bek",
        "username": "bek_uz",
        "auth_date": int(time_module.time()),
    }
    payload["hash"] = _sign_telegram(payload)

    response = api.post("/api/auth/telegram/", payload, format="json")
    assert response.status_code == 200, response.data
    assert User.objects.filter(telegram_id=555000111).exists()


@override_settings(TELEGRAM_BOT_TOKEN=TELEGRAM_TOKEN)
def test_forged_telegram_signature_is_rejected(api):
    payload = {
        "id": 555000222,
        "first_name": "Fake",
        "auth_date": int(time_module.time()),
        "hash": "deadbeef" * 8,
    }
    response = api.post("/api/auth/telegram/", payload, format="json")
    assert response.status_code == 400
    assert not User.objects.filter(telegram_id=555000222).exists()


@override_settings(TELEGRAM_BOT_TOKEN=TELEGRAM_TOKEN, TELEGRAM_AUTH_MAX_AGE_SECONDS=60)
def test_stale_telegram_payload_is_rejected(api):
    payload = {
        "id": 555000333,
        "first_name": "Old",
        "auth_date": int(time_module.time()) - 3600,
    }
    payload["hash"] = _sign_telegram(payload)
    response = api.post("/api/auth/telegram/", payload, format="json")
    assert response.status_code == 400


# --- Yandex ID ---------------------------------------------------------------

YANDEX_CLIENT = "test-yandex-client"


class _YandexResponse:
    """Stand-in for the userinfo call, which is the only network hop."""

    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self) -> dict:
        return self._payload


@override_settings(YANDEX_OAUTH_CLIENT_ID=YANDEX_CLIENT)
def test_yandex_token_creates_a_user(api, monkeypatch):
    monkeypatch.setattr(
        "apps.users.services.requests.get",
        lambda *a, **kw: _YandexResponse(
            {
                "id": "9900001",
                "default_email": "Bek@Yandex.RU",
                "first_name": "Bek",
                "last_name": "Aliyev",
            }
        ),
    )

    response = api.post(
        "/api/auth/yandex/", {"access_token": "ya-token"}, format="json"
    )
    assert response.status_code == 200, response.data
    assert response.data["is_new_user"] is True

    user = User.objects.get(yandex_id="9900001")
    assert user.role == Role.USER
    assert user.is_verified
    # The address is stored lowercased, so a second provider can match on it.
    assert user.email == "bek@yandex.ru"


@override_settings(YANDEX_OAUTH_CLIENT_ID=YANDEX_CLIENT)
def test_yandex_links_to_an_existing_account_by_email(api, monkeypatch, customer):
    customer.email = "shared@yandex.ru"
    customer.save(update_fields=["email"])

    monkeypatch.setattr(
        "apps.users.services.requests.get",
        lambda *a, **kw: _YandexResponse(
            {"id": "9900002", "default_email": "shared@yandex.ru", "first_name": "X"}
        ),
    )

    response = api.post(
        "/api/auth/yandex/", {"access_token": "ya-token"}, format="json"
    )
    assert response.status_code == 200, response.data
    assert response.data["is_new_user"] is False

    customer.refresh_from_db()
    assert customer.yandex_id == "9900002"
    assert User.objects.filter(yandex_id="9900002").count() == 1


@override_settings(YANDEX_OAUTH_CLIENT_ID=YANDEX_CLIENT)
def test_rejected_yandex_token_creates_nothing(api, monkeypatch):
    monkeypatch.setattr(
        "apps.users.services.requests.get",
        lambda *a, **kw: _YandexResponse({"error": "invalid_token"}, status_code=401),
    )

    response = api.post(
        "/api/auth/yandex/", {"access_token": "stale"}, format="json"
    )
    assert response.status_code == 400
    assert not User.objects.filter(yandex_id__isnull=False).exists()


@override_settings(YANDEX_OAUTH_CLIENT_ID="")
def test_yandex_is_refused_when_not_configured(api):
    response = api.post(
        "/api/auth/yandex/", {"access_token": "ya-token"}, format="json"
    )
    assert response.status_code == 400


def test_yandex_requires_a_token_or_code(api):
    response = api.post("/api/auth/yandex/", {}, format="json")
    assert response.status_code == 400
