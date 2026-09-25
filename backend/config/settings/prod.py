from .base import *  # noqa: F401,F403
from .base import env, env_bool

DEBUG = False

# CORS wildcards are never allowed in production.
CORS_ALLOW_ALL_ORIGINS = False
OTP_DEBUG_RETURN_CODE = False

SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = int(env("SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# The schema is a complete map of the API — endpoints, parameters, enums. It is
# useful in development and pure reconnaissance once the host is public, so the
# browsable docs are locked to admins here rather than removed.
SPECTACULAR_SETTINGS = {  # noqa: F405
    **SPECTACULAR_SETTINGS,  # noqa: F405
    "SERVE_PERMISSIONS": ["apps.common.permissions.IsAdmin"],
}

if SECRET_KEY == "insecure-dev-key-change-me":  # noqa: F405
    raise RuntimeError("SECRET_KEY must be set in production.")
