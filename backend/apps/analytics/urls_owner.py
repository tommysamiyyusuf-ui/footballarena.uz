from django.urls import path

from apps.analytics.views import (
    OwnerCalendarView,
    OwnerDashboardView,
    OwnerStatisticsView,
)

urlpatterns = [
    path("dashboard/", OwnerDashboardView.as_view(), name="owner-dashboard"),
    path("statistics/", OwnerStatisticsView.as_view(), name="owner-statistics"),
    path("calendar/", OwnerCalendarView.as_view(), name="owner-calendar"),
]
