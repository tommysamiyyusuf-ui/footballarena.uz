import json

from django.http import HttpResponse


class BlockedUserMiddleware:
    """Deny API traffic from blocked accounts regardless of a valid token."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if (
            request.path.startswith("/api/")
            and user is not None
            and user.is_authenticated
            and getattr(user, "is_blocked", False)
        ):
            return HttpResponse(
                json.dumps(
                    {
                        "success": False,
                        "code": "account_blocked",
                        "message": "Hisobingiz bloklangan. Administrator bilan bog'laning.",
                        "errors": {},
                    }
                ),
                status=403,
                content_type="application/json",
            )
        return self.get_response(request)
