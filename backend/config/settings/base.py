"""
Base Django settings for the Football Arena platform.

Environment-driven. Never hardcode secrets here.
"""
from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
PROJECT_ROOT = BASE_DIR.parent

load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BASE_DIR / ".env")


def env(key: str, default: str | None = None) -> str | None:
    """
    A blank value counts as absent.

    `.env.example` ships placeholders like `JWT_SIGNING_KEY=`, and a literal ""
    reaching a setting that needs a real value (the JWT signing key, for one)
    fails far away from the cause.
    """
    value = os.environ.get(key)
    return default if value is None or not value.strip() else value


def env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(key: str, default: str = "") -> list[str]:
    raw = os.environ.get(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0,backend")

AUTH_USER_MODEL = "users.User"
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = True

DJANGO_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Needed for the btree_gist exclusion constraint that blocks overlapping bookings.
    "django.contrib.postgres",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "channels",
]

LOCAL_APPS = [
    "apps.common",
    "apps.users",
    "apps.stadiums",
    "apps.bookings",
    "apps.reviews",
    "apps.notifications",
    "apps.chat",
    "apps.payments",
    "apps.analytics",
    "apps.admin_panel",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.common.middleware.BlockedUserMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL = env("DATABASE_URL", "postgres://arena:arena@localhost:5432/arena")
DATABASES = {
    "default": dj_database_url.parse(
        DATABASE_URL,
        conn_max_age=int(env("DB_CONN_MAX_AGE", "60")),
        conn_health_checks=True,
    )
}

# ---------------------------------------------------------------------------
# Cache / Channels / Celery
# ---------------------------------------------------------------------------
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
    }
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {"hosts": [REDIS_URL]},
    }
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", REDIS_URL)
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "Asia/Tashkent"
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)

# ---------------------------------------------------------------------------
# Password / auth validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
     "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

# ---------------------------------------------------------------------------
# I18N
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "uz"
TIME_ZONE = "Asia/Tashkent"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static / media
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

CLOUDINARY_URL = env("CLOUDINARY_URL", "")
if CLOUDINARY_URL:
    INSTALLED_APPS += ["cloudinary", "cloudinary_storage"]
    STORAGES["default"] = {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage"
    }

MAX_UPLOAD_SIZE_MB = int(env("MAX_UPLOAD_SIZE_MB", "8"))
ALLOWED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"]
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.users.authentication.ArenaJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "otp_request": env("THROTTLE_OTP_REQUEST", "5/hour"),
        "otp_verify": env("THROTTLE_OTP_VERIFY", "10/hour"),
        "login": env("THROTTLE_LOGIN", "10/hour"),
        "booking_create": env("THROTTLE_BOOKING_CREATE", "30/hour"),
        "chat_message": env("THROTTLE_CHAT_MESSAGE", "120/minute"),
        "anon": env("THROTTLE_ANON", "120/minute"),
        "user": env("THROTTLE_USER", "1000/hour"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(env("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(env("JWT_REFRESH_DAYS", "14"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env("JWT_SIGNING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "TOKEN_OBTAIN_SERIALIZER": "apps.users.serializers.ArenaTokenObtainPairSerializer",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Football Arena API",
    "DESCRIPTION": "Stadium rental & booking platform for Uzbekistan.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api",
    "SORT_OPERATIONS": False,
    # `status` is reused by several models — name the enums explicitly so the
    # generated client has readable types instead of StatusA3bEnum.
    "ENUM_NAME_OVERRIDES": {
        "BookingStatusEnum": "apps.bookings.models.BookingStatus.choices",
        "StadiumStatusEnum": "apps.stadiums.models.StadiumStatus.choices",
        "PaymentStatusEnum": "apps.payments.models.PaymentStatus.choices",
        "RoleEnum": "apps.users.models.Role.choices",
        "FieldTypeEnum": "apps.stadiums.models.FieldType.choices",
    },
}

# ---------------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env_list(
    "CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)

# ---------------------------------------------------------------------------
# Platform / integrations
# ---------------------------------------------------------------------------
PLATFORM_NAME = env("PLATFORM_NAME", "Football Arena")
PLATFORM_COMMISSION_PERCENT = env("PLATFORM_COMMISSION_PERCENT", "10")
DEFAULT_CURRENCY = env("DEFAULT_CURRENCY", "UZS")

OTP_LENGTH = int(env("OTP_LENGTH", "6"))
OTP_TTL_SECONDS = int(env("OTP_TTL_SECONDS", "180"))
OTP_RESEND_COOLDOWN_SECONDS = int(env("OTP_RESEND_COOLDOWN_SECONDS", "60"))
OTP_MAX_ATTEMPTS = int(env("OTP_MAX_ATTEMPTS", "5"))
OTP_MAX_PER_PHONE_PER_HOUR = int(env("OTP_MAX_PER_PHONE_PER_HOUR", "5"))
OTP_DEBUG_RETURN_CODE = env_bool("OTP_DEBUG_RETURN_CODE", False)

SMS_PROVIDER = env("SMS_PROVIDER", "console")
SMS_API_KEY = env("SMS_API_KEY", "")
SMS_API_URL = env("SMS_API_URL", "")
SMS_SENDER = env("SMS_SENDER", "4546")

GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = env("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = env("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth/google")

YANDEX_OAUTH_CLIENT_ID = env("YANDEX_OAUTH_CLIENT_ID", "")
YANDEX_OAUTH_CLIENT_SECRET = env("YANDEX_OAUTH_CLIENT_SECRET", "")
YANDEX_OAUTH_REDIRECT_URI = env(
    "YANDEX_OAUTH_REDIRECT_URI", "http://localhost:5173/auth/yandex"
)

TELEGRAM_BOT_TOKEN = env("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = env("TELEGRAM_BOT_USERNAME", "")
TELEGRAM_AUTH_MAX_AGE_SECONDS = int(env("TELEGRAM_AUTH_MAX_AGE_SECONDS", "86400"))

YANDEX_MAPS_API_KEY = env("YANDEX_MAPS_API_KEY", "")

EMAIL_BACKEND = env(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = env("EMAIL_HOST", "")
EMAIL_PORT = int(env("EMAIL_PORT", "587"))
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "Football Arena <noreply@arena.uz>")

FRONTEND_URL = env("FRONTEND_URL", "http://localhost:5173")

BOOKING_MIN_DURATION_HOURS = int(env("BOOKING_MIN_DURATION_HOURS", "1"))
BOOKING_MAX_DURATION_HOURS = int(env("BOOKING_MAX_DURATION_HOURS", "6"))
BOOKING_MAX_ADVANCE_DAYS = int(env("BOOKING_MAX_ADVANCE_DAYS", "60"))
BOOKING_CANCEL_WINDOW_HOURS = int(env("BOOKING_CANCEL_WINDOW_HOURS", "3"))

# ---------------------------------------------------------------------------
# Security headers (tightened further in prod.py)
# ---------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False
SESSION_COOKIE_SAMESITE = "Lax"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "[{asctime}] {levelname} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.db.backends": {"level": "WARNING", "handlers": ["console"], "propagate": False},
    },
}
