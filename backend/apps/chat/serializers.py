from rest_framework import serializers

from apps.chat.models import Conversation, Message
from apps.common.validators import validate_attachment_file


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ("id", "conversation", "sender", "sender_name", "text", "attachment",
                  "is_read", "read_at", "is_mine", "created_at")
        read_only_fields = ("id", "conversation", "sender", "is_read", "read_at",
                            "created_at")

    def get_sender_name(self, obj) -> str:
        return obj.sender.get_full_name() or "Foydalanuvchi"

    def get_is_mine(self, obj) -> bool:
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated
                    and obj.sender_id == request.user.id)


class ConversationSerializer(serializers.ModelSerializer):
    stadium_name = serializers.CharField(source="stadium.name", read_only=True)
    participant = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    booking_reference = serializers.CharField(source="booking.reference", read_only=True,
                                              default=None)

    class Meta:
        model = Conversation
        fields = ("id", "stadium", "stadium_name", "booking", "booking_reference",
                  "participant", "last_message_at", "last_message_preview",
                  "unread_count", "created_at")
        read_only_fields = fields

    def get_participant(self, obj) -> dict:
        request = self.context.get("request")
        other = obj.other_participant(request.user) if request else obj.owner
        avatar = None
        if other.avatar:
            avatar = (request.build_absolute_uri(other.avatar.url)
                      if request else other.avatar.url)
        return {
            "id": str(other.id),
            "full_name": other.get_full_name() or "Foydalanuvchi",
            "avatar": avatar,
            "role": other.role,
        }

    def get_unread_count(self, obj) -> int:
        request = self.context.get("request")
        return obj.unread_count_for(request.user) if request else 0


class StartConversationSerializer(serializers.Serializer):
    stadium_id = serializers.UUIDField()
    booking_id = serializers.UUIDField(required=False, allow_null=True)
    text = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class SendMessageSerializer(serializers.Serializer):
    """Body for POST /chat/conversations/<id>/send/ — the conversation is in the URL."""

    text = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    attachment = serializers.FileField(required=False, allow_null=True)

    def validate_attachment(self, value):
        if value is not None:
            # Without this the field accepts any file of any size — the only
            # upload path in the project that used to skip the checks.
            validate_attachment_file(value)
        return value

    def validate(self, attrs):
        if not (attrs.get("text") or "").strip() and not attrs.get("attachment"):
            raise serializers.ValidationError("Xabar matni yoki fayl yuboring.")
        return attrs
