import logging

from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class DomainError(APIException):
    """Base class for business-rule violations surfaced to the client."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Request could not be processed."
    default_code = "domain_error"


class SlotUnavailable(DomainError):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Bu vaqt allaqachon band qilingan."
    default_code = "slot_unavailable"


class StadiumNotBookable(DomainError):
    default_detail = "Stadion hozir bron qabul qilmayapti."
    default_code = "stadium_not_bookable"


class OTPExpired(DomainError):
    default_detail = "OTP muddati tugagan."
    default_code = "otp_expired"


class OTPInvalid(DomainError):
    default_detail = "Tasdiqlash kodi noto'g'ri."
    default_code = "otp_invalid"


def _flatten(detail):
    """Produce a single human-readable message from a DRF error structure."""
    if isinstance(detail, dict):
        for value in detail.values():
            message = _flatten(value)
            if message:
                return message
        return ""
    if isinstance(detail, (list, tuple)):
        for value in detail:
            message = _flatten(value)
            if message:
                return message
        return ""
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(detail=getattr(exc, "message_dict", None) or list(exc.messages))
    elif isinstance(exc, Http404):
        exc = APIException(detail="Resource not found.")
        exc.status_code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, PermissionDenied):
        exc = APIException(detail="Permission denied.")
        exc.status_code = status.HTTP_403_FORBIDDEN

    response = drf_exception_handler(exc, context)

    if response is None:
        if isinstance(exc, IntegrityError):
            logger.warning("Integrity error: %s", exc)
            return Response(
                {
                    "success": False,
                    "code": "integrity_error",
                    "message": "Ma'lumotlar yaxlitligi buzildi. Qaytadan urinib ko'ring.",
                    "errors": {},
                },
                status=status.HTTP_409_CONFLICT,
            )
        logger.exception("Unhandled server error", exc_info=exc)
        return Response(
            {
                "success": False,
                "code": "server_error",
                "message": "Kutilmagan xatolik yuz berdi.",
                "errors": {},
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    detail = response.data
    errors = detail if isinstance(detail, dict) else {}
    if isinstance(errors, dict) and "detail" in errors and len(errors) == 1:
        errors = {}

    response.data = {
        "success": False,
        "code": getattr(exc, "default_code", "error"),
        "message": _flatten(detail) or "Request failed.",
        "errors": errors,
    }
    return response
