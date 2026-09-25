from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.bookings.views import BookingQuoteView, BookingViewSet

router = DefaultRouter()
router.register("", BookingViewSet, basename="booking")

urlpatterns = [
    path("quote/", BookingQuoteView.as_view(), name="booking-quote"),
    path("", include(router.urls)),
]
