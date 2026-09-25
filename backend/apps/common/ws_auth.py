"""JWT authentication for Django Channels WebSocket connections."""
from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from channels.sessions import CookieMiddleware, SessionMiddleware
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _resolve_user(token: str):
    from django.contrib.auth import get_user_model
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        access = AccessToken(token)
        user_id = access["user_id"]
    except (TokenError, KeyError):
        return AnonymousUser()

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except (User.DoesNotExist, ValueError, TypeError):
        return AnonymousUser()

    if not user.is_active or user.is_blocked:
        return AnonymousUser()
    return user


class JWTAuthMiddleware(BaseMiddleware):
    """Reads the JWT from ?token=... or the Sec-WebSocket-Protocol header."""

    async def __call__(self, scope, receive, send):
        token = ""
        query = parse_qs(scope.get("query_string", b"").decode())
        if query.get("token"):
            token = query["token"][0]

        if not token:
            for name, value in scope.get("headers", []):
                if name == b"authorization":
                    raw = value.decode()
                    if raw.lower().startswith("bearer "):
                        token = raw[7:]
                    break

        scope["user"] = await _resolve_user(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):  # noqa: N802 - Channels naming convention
    return CookieMiddleware(SessionMiddleware(JWTAuthMiddleware(inner)))
