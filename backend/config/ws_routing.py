from django.urls import path

from apps.chat.consumers import ChatConsumer
from apps.notifications.consumers import NotificationConsumer

websocket_urlpatterns = [
    path("ws/chat/<uuid:conversation_id>/", ChatConsumer.as_asgi()),
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]
