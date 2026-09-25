from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.chat.views import ConversationViewSet

router = DefaultRouter()
router.register("", ConversationViewSet, basename="conversation")

urlpatterns = [path("", include(router.urls))]
