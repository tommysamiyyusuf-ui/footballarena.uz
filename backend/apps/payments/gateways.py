"""
Payment gateway abstraction.

The MVP ships with CASH (settled on site). Click / Payme / Uzum subclasses only
need `create_invoice` and `verify_callback` implemented — the booking flow calls
this interface and nothing else, so adding a provider never touches domain code.
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings

from apps.common.exceptions import DomainError


class BaseGateway:
    code: str = ""

    def create_invoice(self, payment) -> dict:
        """Return {"payment_url": ..., "transaction_id": ...} for redirect flows."""
        raise NotImplementedError

    def verify_callback(self, payload: dict) -> dict:
        """Validate a provider webhook and return a normalised result."""
        raise NotImplementedError


class CashGateway(BaseGateway):
    code = "CASH"

    def create_invoice(self, payment) -> dict:
        return {"payment_url": "", "transaction_id": f"cash-{payment.id}"}

    def verify_callback(self, payload: dict) -> dict:
        raise DomainError("Naqd to'lov uchun callback mavjud emas.")


class ClickGateway(BaseGateway):
    code = "CLICK"

    def __init__(self) -> None:
        self.secret = getattr(settings, "CLICK_SECRET", "")
        self.merchant_id = getattr(settings, "CLICK_MERCHANT_ID", "")
        self.service_id = getattr(settings, "CLICK_SERVICE_ID", "")

    def create_invoice(self, payment) -> dict:
        if not self.secret:
            raise DomainError("Click integratsiyasi sozlanmagan.")
        amount = Decimal(payment.amount)
        url = (
            "https://my.click.uz/services/pay"
            f"?service_id={self.service_id}"
            f"&merchant_id={self.merchant_id}"
            f"&amount={amount}"
            f"&transaction_param={payment.id}"
        )
        return {"payment_url": url, "transaction_id": ""}

    def verify_callback(self, payload: dict) -> dict:
        import hashlib

        if not self.secret:
            raise DomainError("Click integratsiyasi sozlanmagan.")
        expected = hashlib.md5(  # noqa: S324 - mandated by the Click spec
            (
                f"{payload.get('click_trans_id')}{self.service_id}{self.secret}"
                f"{payload.get('merchant_trans_id')}{payload.get('amount')}"
                f"{payload.get('action')}{payload.get('sign_time')}"
            ).encode()
        ).hexdigest()
        if expected != payload.get("sign_string"):
            raise DomainError("Click imzosi yaroqsiz.")
        return {
            "transaction_id": str(payload.get("click_trans_id")),
            "amount": Decimal(str(payload.get("amount", "0"))),
            "paid": str(payload.get("error", "0")) == "0",
        }


class PaymeGateway(BaseGateway):
    code = "PAYME"

    def __init__(self) -> None:
        self.secret = getattr(settings, "PAYME_SECRET", "")
        self.merchant_id = getattr(settings, "PAYME_MERCHANT_ID", "")

    def create_invoice(self, payment) -> dict:
        import base64

        if not self.merchant_id:
            raise DomainError("Payme integratsiyasi sozlanmagan.")
        # Payme expects tiyin (1 UZS = 100 tiyin).
        params = (
            f"m={self.merchant_id};ac.payment_id={payment.id};"
            f"a={int(Decimal(payment.amount) * 100)}"
        )
        encoded = base64.b64encode(params.encode()).decode()
        return {"payment_url": f"https://checkout.paycom.uz/{encoded}",
                "transaction_id": ""}

    def verify_callback(self, payload: dict) -> dict:
        raise DomainError("Payme JSON-RPC callback hali ulanmagan.")


class UzumGateway(BaseGateway):
    code = "UZUM"

    def create_invoice(self, payment) -> dict:
        raise DomainError("Uzum integratsiyasi hali ulanmagan.")

    def verify_callback(self, payload: dict) -> dict:
        raise DomainError("Uzum integratsiyasi hali ulanmagan.")


_GATEWAYS = {
    "CASH": CashGateway,
    "CLICK": ClickGateway,
    "PAYME": PaymeGateway,
    "UZUM": UzumGateway,
}


def get_gateway(provider: str) -> BaseGateway:
    gateway_cls = _GATEWAYS.get(provider.upper())
    if gateway_cls is None:
        raise DomainError(f"'{provider}' to'lov tizimi qo'llab-quvvatlanmaydi.")
    return gateway_cls()
