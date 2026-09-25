from django.db.models import Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.bookings.models import Booking
from apps.chat.models import Conversation, Message
from apps.chat.serializers import (
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
    StartConversationSerializer,
)
from apps.chat.services import get_or_create_conversation, mark_conversation_read, post_message
from apps.common.exceptions import DomainError
from apps.common.permissions import IsActiveUser


@extend_schema(tags=["chat"])
class ConversationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          viewsets.GenericViewSet):
    permission_classes = [IsActiveUser]
    serializer_class = ConversationSerializer
    queryset = Conversation.objects.none()  # schema introspection only
    # Declared so @action(throttle_scope=...) is accepted as an initkwarg.
    throttle_scope = None

    def get_queryset(self):
        user = self.request.user
        return (
            Conversation.objects.filter(Q(customer=user) | Q(owner=user))
            .select_related("customer", "owner", "stadium", "booking")
            .prefetch_related("messages")
        )

    @extend_schema(summary="Open or reuse a conversation",
                   request=StartConversationSerializer)
    @action(detail=False, methods=["post"], url_path="start")
    def start(self, request):
        serializer = StartConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        booking = None
        if data.get("booking_id"):
            booking = get_object_or_404(
                Booking.objects.for_actor(request.user), pk=data["booking_id"]
            )

        if request.user.role == "OWNER":
            raise DomainError("Suhbatni mijoz boshlaydi.")

        conversation = get_or_create_conversation(
            customer=request.user, stadium_id=data["stadium_id"], booking=booking
        )
        if data.get("text"):
            post_message(conversation=conversation, sender=request.user,
                         text=data["text"])
        return Response(
            ConversationSerializer(conversation, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Messages in a conversation")
    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        conversation = self.get_object()
        mark_conversation_read(conversation, request.user)
        queryset = conversation.messages.select_related("sender").order_by("created_at")
        page = self.paginate_queryset(queryset)
        serializer = MessageSerializer(page, many=True, context={"request": request})
        return self.get_paginated_response(serializer.data)

    @extend_schema(summary="Send a message over HTTP (WebSocket is preferred)",
                   request=SendMessageSerializer)
    @action(detail=True, methods=["post"], url_path="send",
            throttle_scope="chat_message")
    def send(self, request, pk=None):
        conversation = self.get_object()
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = post_message(
            conversation=conversation,
            sender=request.user,
            text=(serializer.validated_data.get("text") or "").strip(),
            attachment=serializer.validated_data.get("attachment"),
        )

        # Mirror it onto the socket so connected clients update instantly.
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(
                f"chat_{conversation.id}",
                {
                    "type": "chat.message",
                    "payload": MessageSerializer(
                        message, context={"request": request}
                    ).data | {"id": str(message.id)},
                },
            )
        return Response(
            MessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(summary="Total unread messages across all conversations")
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = Message.objects.filter(
            Q(conversation__customer=request.user) | Q(conversation__owner=request.user),
            is_read=False,
        ).exclude(sender=request.user).count()
        return Response({"count": count})
