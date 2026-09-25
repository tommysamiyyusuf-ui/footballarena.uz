"""drf-spectacular glue so the custom auth class documents itself correctly."""
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class ArenaJWTScheme(OpenApiAuthenticationExtension):
    target_class = "apps.users.authentication.ArenaJWTAuthentication"
    name = "jwtAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Send `Authorization: Bearer <access token>`.",
        }
