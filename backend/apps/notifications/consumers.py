import json

from channels.generic.websocket import AsyncWebsocketConsumer

from apps.notifications.services import user_group


class NotificationConsumer(AsyncWebsocketConsumer):
    """Per-user realtime notification stream at ws://.../ws/notifications/?token=JWT."""

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.group_name = user_group(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Client-to-server traffic is limited to keep-alive pings.
        try:
            data = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            return
        if data.get("type") == "ping":
            await self.send(json.dumps({"type": "pong"}))

    async def notification_message(self, event):
        await self.send(json.dumps({"type": "notification", "data": event["payload"]}))
