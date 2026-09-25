"""
Pluggable SMS gateway.

`SMS_PROVIDER=console` is the development default and only logs the message.
Swap in a real provider by setting SMS_PROVIDER + SMS_API_KEY + SMS_API_URL —
no application code changes required.
"""
from __future__ import annotations

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class SMSError(Exception):
    pass


class BaseSMSProvider:
    def send(self, phone: str, text: str) -> bool:  # pragma: no cover - interface
        raise NotImplementedError


class ConsoleSMSProvider(BaseSMSProvider):
    def send(self, phone: str, text: str) -> bool:
        logger.info("[SMS:console] to=%s text=%s", phone, text)
        return True


class EskizSMSProvider(BaseSMSProvider):
    """Eskiz.uz — the most widely used Uzbek SMS gateway."""

    def __init__(self) -> None:
        self.url = settings.SMS_API_URL or "https://notify.eskiz.uz/api/message/sms/send"
        self.token = settings.SMS_API_KEY
        self.sender = settings.SMS_SENDER

    def send(self, phone: str, text: str) -> bool:
        if not self.token:
            raise SMSError("SMS_API_KEY is not configured.")
        try:
            response = requests.post(
                self.url,
                headers={"Authorization": f"Bearer {self.token}"},
                data={
                    "mobile_phone": phone.lstrip("+"),
                    "message": text,
                    "from": self.sender,
                },
                timeout=10,
            )
        except requests.RequestException as exc:
            raise SMSError(f"SMS gateway unreachable: {exc}") from exc
        if response.status_code >= 400:
            raise SMSError(f"SMS gateway error {response.status_code}: {response.text[:200]}")
        return True


class PlayMobileSMSProvider(BaseSMSProvider):
    """Play Mobile (playmobile.uz) XML/JSON gateway."""

    def __init__(self) -> None:
        self.url = settings.SMS_API_URL or "https://send.smsxabar.uz/broker-api/send"
        self.token = settings.SMS_API_KEY
        self.sender = settings.SMS_SENDER

    def send(self, phone: str, text: str) -> bool:
        if not self.token:
            raise SMSError("SMS_API_KEY is not configured.")
        payload = {
            "messages": [
                {
                    "recipient": phone.lstrip("+"),
                    "message-id": f"arena-{abs(hash((phone, text))) % 10**9}",
                    "sms": {"originator": self.sender, "content": {"text": text}},
                }
            ]
        }
        try:
            response = requests.post(
                self.url,
                json=payload,
                headers={"Authorization": f"Basic {self.token}"},
                timeout=10,
            )
        except requests.RequestException as exc:
            raise SMSError(f"SMS gateway unreachable: {exc}") from exc
        if response.status_code >= 400:
            raise SMSError(f"SMS gateway error {response.status_code}: {response.text[:200]}")
        return True


_PROVIDERS = {
    "console": ConsoleSMSProvider,
    "eskiz": EskizSMSProvider,
    "playmobile": PlayMobileSMSProvider,
}


def get_sms_provider() -> BaseSMSProvider:
    provider_cls = _PROVIDERS.get(settings.SMS_PROVIDER.lower())
    if provider_cls is None:
        raise SMSError(f"Unknown SMS_PROVIDER '{settings.SMS_PROVIDER}'.")
    return provider_cls()


def send_sms(phone: str, text: str) -> bool:
    return get_sms_provider().send(phone, text)
