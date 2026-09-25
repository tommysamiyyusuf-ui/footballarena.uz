from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from apps.notifications.models import Channel, Notification, NotificationDelivery

logger = logging.getLogger(__name__)


def user_group(user_id) -> str:
    return f"notifications_{user_id}"


def push_to_socket(notification: Notification) -> None:
    """Best-effort realtime delivery; never let a broker hiccup break a request."""
    try:
        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            user_group(notification.recipient_id),
            {
                "type": "notification.message",
                "payload": {
                    "id": str(notification.id),
                    "type": notification.type,
                    "title": notification.title,
                    "message": notification.message,
                    "payload": notification.payload,
                    "is_read": notification.is_read,
                    "created_at": notification.created_at.isoformat(),
                },
            },
        )
    except Exception:  # noqa: BLE001
        logger.warning("WebSocket notification push failed", exc_info=True)


def notify(*, recipient, type: str, title: str, message: str = "",
           payload: dict | None = None) -> Notification:
    """
    Create a notification and fan it out.

    WEB is delivered immediately over the channel layer. EMAIL/TELEGRAM rows are
    queued as NotificationDelivery records and handled asynchronously by Celery,
    so an external outage can never block the HTTP request.
    """
    notification = Notification.objects.create(
        recipient=recipient,
        type=type,
        title=title,
        message=message,
        payload=payload or {},
    )

    NotificationDelivery.objects.create(
        notification=notification,
        channel=Channel.WEB,
        status=NotificationDelivery.Status.SENT,
    )
    push_to_socket(notification)

    profile = getattr(recipient, "profile", None)
    from apps.common.models import PlatformSetting

    config = PlatformSetting.load()

    if config.notifications_email_enabled and recipient.email and (
        profile is None or profile.notify_email
    ):
        NotificationDelivery.objects.create(notification=notification, channel=Channel.EMAIL)
    if config.notifications_telegram_enabled and recipient.telegram_id and (
        profile is None or profile.notify_telegram
    ):
        NotificationDelivery.objects.create(notification=notification,
                                            channel=Channel.TELEGRAM)

    if NotificationDelivery.objects.filter(
        notification=notification, status=NotificationDelivery.Status.PENDING
    ).exists():
        from apps.notifications.tasks import dispatch_pending_deliveries

        transaction.on_commit(
            lambda: dispatch_pending_deliveries.delay(str(notification.id))
        )

    return notification


def notify_admins(*, type: str, title: str, message: str = "",
                  payload: dict | None = None) -> None:
    from apps.users.models import Role, User

    for admin in User.objects.filter(role=Role.ADMIN, is_blocked=False):
        notify(recipient=admin, type=type, title=title, message=message, payload=payload)
