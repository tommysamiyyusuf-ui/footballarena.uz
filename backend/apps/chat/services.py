from __future__ import annotations

from django.db import transaction

from apps.chat.models import Conversation, Message
from apps.common.exceptions import DomainError
from apps.stadiums.models import Stadium


@transaction.atomic
def get_or_create_conversation(*, customer, stadium_id, booking=None) -> Conversation:
    """
    Open (or reuse) the private thread between a customer and a stadium owner.

    A customer may only start a chat about a stadium they can actually see.
    """
    stadium = Stadium.objects.select_related("owner").filter(pk=stadium_id).first()
    if stadium is None:
        raise DomainError("Stadion topilmadi.")
    if not stadium.is_bookable and booking is None:
        raise DomainError("Bu stadion bilan hozir suhbat ochib bo'lmaydi.")
    if stadium.owner_id == customer.id:
        raise DomainError("O'zingiz bilan suhbat ocha olmaysiz.")

    if booking is not None and (booking.user_id != customer.id
                                or booking.stadium_id != stadium.id):
        raise DomainError("Bu bron sizga tegishli emas.")

    conversation, _ = Conversation.objects.get_or_create(
        customer=customer,
        stadium=stadium,
        booking=booking,
        defaults={"owner": stadium.owner},
    )
    return conversation


@transaction.atomic
def post_message(*, conversation: Conversation, sender, text: str,
                 attachment=None) -> Message:
    if not conversation.has_participant(sender):
        raise DomainError("Bu suhbatga kirish huquqingiz yo'q.")
    text = (text or "").strip()
    if not text and attachment is None:
        raise DomainError("Xabar bo'sh bo'lishi mumkin emas.")

    message = Message.objects.create(
        conversation=conversation, sender=sender, text=text[:2000], attachment=attachment
    )
    conversation.last_message_at = message.created_at
    conversation.last_message_preview = (text or "Fayl")[:140]
    conversation.save(update_fields=["last_message_at", "last_message_preview",
                                     "updated_at"])

    recipient = conversation.other_participant(sender)
    transaction.on_commit(lambda: _notify_new_message(conversation, message, recipient))
    return message


def _notify_new_message(conversation: Conversation, message: Message, recipient) -> None:
    from apps.notifications.services import notify

    route = ("/owner/chat" if recipient.id == conversation.owner_id else "/user/chat")
    notify(
        recipient=recipient,
        type="NEW_MESSAGE",
        title=f"{message.sender.get_full_name() or 'Foydalanuvchi'} xabar yubordi",
        message=message.text[:140],
        payload={"conversation_id": str(conversation.id),
                 "route": f"{route}?c={conversation.id}"},
    )


def mark_conversation_read(conversation: Conversation, reader) -> int:
    from django.utils import timezone

    return conversation.messages.filter(is_read=False).exclude(sender=reader).update(
        is_read=True, read_at=timezone.now()
    )
