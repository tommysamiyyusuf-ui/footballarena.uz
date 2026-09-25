import os

from .base import *  # noqa: F401,F403

DEBUG = False
OTP_DEBUG_RETURN_CODE = True
CELERY_TASK_ALWAYS_EAGER = True

DATABASES = {  # noqa: F405
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("TEST_DB_NAME", "arena_test"),
        "USER": os.environ.get("TEST_DB_USER", "arena"),
        "PASSWORD": os.environ.get("TEST_DB_PASSWORD", "arena"),
        "HOST": os.environ.get("TEST_DB_HOST", "localhost"),
        "PORT": os.environ.get("TEST_DB_PORT", "5432"),
    }
}

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}  # noqa: F405

# Throttle counters live in the cache, which survives between tests inside one
# process — leaving the production rates on would make unrelated tests fail in
# whatever order pytest happens to run them. Tests that care about throttling
# re-enable a rate explicitly with @override_settings.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": dict.fromkeys(
        REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], None  # noqa: F405
    ),
}

CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}  # noqa: F405
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # noqa: F405
SMS_PROVIDER = "console"

STORAGES = {  # noqa: F405
    "default": {"BACKEND": "django.core.files.storage.InMemoryStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
