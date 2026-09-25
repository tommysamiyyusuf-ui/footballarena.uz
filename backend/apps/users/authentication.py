from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class ArenaJWTAuthentication(JWTAuthentication):
    """JWT auth that additionally refuses blocked accounts on every request."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if user.is_blocked:
            raise AuthenticationFailed(
                "Hisobingiz bloklangan. Administrator bilan bog'laning.",
                code="account_blocked",
            )
        return user
