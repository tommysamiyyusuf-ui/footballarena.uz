from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.stadiums.views import FavoriteViewSet

router = DefaultRouter()
router.register("", FavoriteViewSet, basename="favorite")

urlpatterns = [path("", include(router.urls))]
