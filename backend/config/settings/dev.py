from .base import *  # noqa: F401,F403
from .base import env_bool

DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = ["*"]
OTP_DEBUG_RETURN_CODE = env_bool("OTP_DEBUG_RETURN_CODE", True)
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", True)

# Set REDIS_ENABLED=False to develop without a Redis server. Cache, WebSocket
# groups and Celery then run in-process. Production always uses real Redis:
# in-memory channel layers do not work across more than one worker.
if not env_bool("REDIS_ENABLED", True):
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

STORAGES = {  # noqa: F405
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
