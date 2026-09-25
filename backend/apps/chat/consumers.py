import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from apps.chat.models import Conversation
from apps.chat.services import mark_conversation_read, post_message


class ChatConsumer(AsyncWebsocketConsumer):
    """
    Realtime thread at ws://.../ws/chat/<conversation_id>/?token=JWT

    Authorisation is checked on connect: only the two participants of the
    conversation may join the group.
    """

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.conversation_id = str(self.scope["url_route"]["kwargs"]["conversation_id"])
        conversation = await self._load_conversation(self.conversation_id, user)
        if conversation is None:
            await self.close(code=4403)
            return

        self.group_name = f"chat_{self.conversation_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self._mark_read(self.conversation_id, user)

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        user = self.scope["user"]
        try:
            data = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            await self._error("Xabar formati noto'g'ri.")
            return

        action = data.get("type", "message")

        if action == "ping":
            await self.send(json.dumps({"type": "pong"}))
            return

        if action == "read":
            await self._mark_read(self.conversation_id, user)
            await self.channel_layer.group_send(
                self.group_name, {"type": "chat.read", "reader_id": str(user.id)}
            )
            return

        if action == "typing":
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "chat.typing", "user_id": str(user.id),
                 "name": user.get_full_name()},
            )
            return

        text = (data.get("text") or "").strip()
        if not text:
            await self._error("Xabar bo'sh.")
            return
        if len(text) > 2000:
            await self._error("Xabar juda uzun.")
            return

        payload = await self._persist(self.conversation_id, user, text)
        if payload is None:
            await self._error("Xabarni yuborib bo'lmadi.")
            return

        await self.channel_layer.group_send(
            self.group_name, {"type": "chat.message", "payload": payload}
        )

    async def chat_message(self, event):
        await self.send(json.dumps({"type": "message", "data": event["payload"]}))

    async def chat_typing(self, event):
        await self.send(json.dumps({"type": "typing", "user_id": event["user_id"],
                                    "name": event["name"]}))

    async def chat_read(self, event):
        await self.send(json.dumps({"type": "read", "reader_id": event["reader_id"]}))

    async def _error(self, message: str):
        await self.send(json.dumps({"type": "error", "message": message}))

    @database_sync_to_async
    def _load_conversation(self, conversation_id, user):
        conversation = Conversation.objects.filter(pk=conversation_id).first()
        if conversation is None or not conversation.has_participant(user):
            return None
        return conversation

    @database_sync_to_async
    def _mark_read(self, conversation_id, user):
        conversation = Conversation.objects.filter(pk=conversation_id).first()
        if conversation and conversation.has_participant(user):
            mark_conversation_read(conversation, user)

    @database_sync_to_async
    def _persist(self, conversation_id, user, text):
        conversation = Conversation.objects.filter(pk=conversation_id).first()
        if conversation is None or not conversation.has_participant(user):
            return None
        message = post_message(conversation=conversation, sender=user, text=text)
        return {
            "id": str(message.id),
            "conversation": str(conversation.id),
            "sender": str(message.sender_id),
            "sender_name": message.sender.get_full_name() or "Foydalanuvchi",
            "text": message.text,
            "is_read": message.is_read,
            "created_at": message.created_at.isoformat(),
        }
