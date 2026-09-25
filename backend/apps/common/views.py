from django.conf import settings
from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.models import PlatformSetting


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(summary="Liveness/readiness probe", responses={200: dict})
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            database_ok = True
        except Exception:  # noqa: BLE001
            database_ok = False
        status_code = 200 if database_ok else 503
        return Response({"status": "ok" if database_ok else "degraded",
                         "database": database_ok}, status=status_code)


class PublicConfigView(APIView):
    """Non-secret configuration the SPA needs at boot time."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(summary="Public platform configuration", responses={200: dict})
    def get(self, request):
        config = PlatformSetting.load()
        return Response(
            {
                "platform_name": config.platform_name,
                "currency": settings.DEFAULT_CURRENCY,
                "maintenance_mode": config.maintenance_mode,
                "booking": {
                    "min_duration_hours": config.booking_min_duration_hours,
                    "max_duration_hours": config.booking_max_duration_hours,
                    "max_advance_days": config.booking_max_advance_days,
                    "cancel_window_hours": config.booking_cancel_window_hours,
                },
                "auth": {
                    "google_enabled": bool(settings.GOOGLE_CLIENT_ID),
                    "google_client_id": settings.GOOGLE_CLIENT_ID,
                    "yandex_enabled": bool(settings.YANDEX_OAUTH_CLIENT_ID),
                    "yandex_client_id": settings.YANDEX_OAUTH_CLIENT_ID,
                    "telegram_enabled": bool(settings.TELEGRAM_BOT_TOKEN),
                    "telegram_bot_username": settings.TELEGRAM_BOT_USERNAME,
                },
                "maps": {
                    # Yandex JS API keys are public by design and domain-restricted.
                    "yandex_api_key": settings.YANDEX_MAPS_API_KEY,
                },
                "otp": {
                    "length": settings.OTP_LENGTH,
                    "ttl_seconds": settings.OTP_TTL_SECONDS,
                    "resend_cooldown_seconds": settings.OTP_RESEND_COOLDOWN_SECONDS,
                },
                "support": {
                    "phone": config.support_phone,
                    "email": config.support_email,
                    "telegram": config.support_telegram,
                },
            }
        )
