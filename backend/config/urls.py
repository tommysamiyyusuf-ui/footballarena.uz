from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from apps.common.views import HealthCheckView, PublicConfigView

api_patterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("config/", PublicConfigView.as_view(), name="public-config"),
    path("auth/", include("apps.users.urls.auth")),
    path("users/", include("apps.users.urls.users")),
    path("stadiums/", include("apps.stadiums.urls")),
    path("bookings/", include("apps.bookings.urls")),
    path("reviews/", include("apps.reviews.urls")),
    path("favorites/", include("apps.stadiums.urls_favorites")),
    path("notifications/", include("apps.notifications.urls")),
    path("chat/", include("apps.chat.urls")),
    path("payments/", include("apps.payments.urls")),
    path("owner/", include("apps.analytics.urls_owner")),
    path("admin-panel/", include("apps.admin_panel.urls")),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include((api_patterns, "api"))),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
