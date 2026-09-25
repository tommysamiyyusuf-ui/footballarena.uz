from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.admin_panel.views import (
    AdminAuditLogView,
    AdminBookingListView,
    AdminDashboardView,
    AdminFinanceView,
    AdminOwnerViewSet,
    AdminReviewViewSet,
    AdminSettingsView,
    AdminStadiumViewSet,
    AdminStatisticsView,
    AdminUserViewSet,
)

router = DefaultRouter()
router.register("users", AdminUserViewSet, basename="admin-user")
router.register("owners", AdminOwnerViewSet, basename="admin-owner")
router.register("stadiums", AdminStadiumViewSet, basename="admin-stadium")
router.register("reviews", AdminReviewViewSet, basename="admin-review")

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("statistics/", AdminStatisticsView.as_view(), name="admin-statistics"),
    path("bookings/", AdminBookingListView.as_view(), name="admin-bookings"),
    path("finance/", AdminFinanceView.as_view(), name="admin-finance"),
    path("settings/", AdminSettingsView.as_view(), name="admin-settings"),
    path("audit-logs/", AdminAuditLogView.as_view(), name="admin-audit-logs"),
    path("", include(router.urls)),
]
