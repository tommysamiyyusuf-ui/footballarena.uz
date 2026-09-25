from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.users.models import OTPCode


@shared_task(name="apps.users.tasks.purge_expired_otps")
def purge_expired_otps() -> int:
    """Drop OTP rows older than a day; they are useless and privacy-sensitive."""
    cutoff = timezone.now() - timedelta(days=1)
    deleted, _ = OTPCode.objects.filter(created_at__lt=cutoff).delete()
    return deleted


@shared_task(name="apps.users.tasks.send_sms_async")
def send_sms_async(phone: str, text: str) -> bool:
    from apps.users.sms import send_sms

    return send_sms(phone, text)
