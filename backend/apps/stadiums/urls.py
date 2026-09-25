from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.stadiums.views import AmenityListView, CityListView, StadiumViewSet

router = DefaultRouter()
router.register("", StadiumViewSet, basename="stadium")

urlpatterns = [
    path("amenities/", AmenityListView.as_view(), name="amenity-list"),
    path("cities/", CityListView.as_view(), name="city-list"),
    path("", include(router.urls)),
]
