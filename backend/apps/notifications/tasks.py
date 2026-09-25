import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications.models import Channel, NotificationDelivery

logger = logging.getLogger(__name__)


def _send_telegram(chat_id: int, text: str) -> None:
    import requests

    if not settings.TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")
    response = requests.post(
        f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=10,
    )
    response.raise_for_status()


@shared_task(name="apps.notifications.tasks.dispatch_pending_deliveries", max_retries=3)
def dispatch_pending_deliveries(notification_id: str) -> int:
    deliveries = NotificationDelivery.objects.filter(
        notification_id=notification_id, status=NotificationDelivery.Status.PENDING
    ).select_related("notification", "notification__recipient")

    sent = 0
    for delivery in deliveries:
        notification = delivery.notification
        recipient = notification.recipient
        body = f"{notification.title}\n\n{notification.message}"
        try:
            if delivery.channel == Channel.EMAIL:
                send_mail(
                    subject=notification.title,
                    message=notification.message,
                    from_email=None,
                    recipient_list=[recipient.email],
                    fail_silently=False,
                )
            elif delivery.channel == Channel.TELEGRAM:
                _send_telegram(recipient.telegram_id, body)
            else:
                delivery.status = NotificationDelivery.Status.SKIPPED
                delivery.save(update_fields=["status", "updated_at"])
                continue

            delivery.status = NotificationDelivery.Status.SENT
            delivery.sent_at = timezone.now()
            delivery.save(update_fields=["status", "sent_at", "updated_at"])
            sent += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Delivery %s failed: %s", delivery.id, exc)
            delivery.status = NotificationDelivery.Status.FAILED
            delivery.error = str(exc)[:255]
            delivery.save(update_fields=["status", "error", "updated_at"])
    return sent
