from __future__ import annotations

import os

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator

phone_validator = RegexValidator(
    regex=r"^\+998\d{9}$",
    message="Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak.",
)

username_validator = RegexValidator(
    regex=r"^[a-zA-Z0-9_.-]{4,32}$",
    message="Login 4-32 belgidan iborat bo'lib, harf, raqam, _ . - dan tashkil topsin.",
)


def validate_image_file(file_obj) -> None:
    """Reject oversized files and non-image extensions/content types."""
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_obj.size > max_bytes:
        raise ValidationError(
            f"Fayl hajmi {settings.MAX_UPLOAD_SIZE_MB} MB dan oshmasligi kerak."
        )

    ext = os.path.splitext(file_obj.name)[1].lower().lstrip(".")
    if ext not in settings.ALLOWED_IMAGE_EXTENSIONS:
        allowed = ", ".join(settings.ALLOWED_IMAGE_EXTENSIONS)
        raise ValidationError(f"Faqat quyidagi formatlar ruxsat etilgan: {allowed}.")

    content_type = getattr(file_obj, "content_type", "")
    if content_type and not content_type.startswith("image/"):
        raise ValidationError("Yuklangan fayl rasm emas.")

    # Verify the payload really is a decodable image, not just a renamed file.
    try:
        from PIL import Image

        position = file_obj.tell()
        file_obj.seek(0)
        Image.open(file_obj).verify()
        file_obj.seek(position)
    except ImportError:  # pragma: no cover - Pillow is a hard dependency
        return
    except Exception as exc:  # noqa: BLE001
        raise ValidationError("Rasm faylini o'qib bo'lmadi.") from exc


def validate_attachment_file(file_obj) -> None:
    """
    Guard for chat attachments.

    Images go through the full picture check; PDFs are allowed because owners
    and customers trade receipts. Everything else is refused outright — an open
    upload field on a shared origin is how a chat turns into a file-hosting
    service, and an .html or .svg served back from our own domain would run as
    our own scripts.
    """
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file_obj.size > max_bytes:
        raise ValidationError(
            f"Fayl hajmi {settings.MAX_UPLOAD_SIZE_MB} MB dan oshmasligi kerak."
        )

    ext = os.path.splitext(file_obj.name)[1].lower().lstrip(".")
    if ext in settings.ALLOWED_IMAGE_EXTENSIONS:
        validate_image_file(file_obj)
        return

    if ext != "pdf":
        allowed = ", ".join([*settings.ALLOWED_IMAGE_EXTENSIONS, "pdf"])
        raise ValidationError(f"Faqat quyidagi formatlar ruxsat etilgan: {allowed}.")

    content_type = getattr(file_obj, "content_type", "")
    if content_type and content_type != "application/pdf":
        raise ValidationError("Yuklangan fayl PDF emas.")

    # A PDF always starts with %PDF-; the extension alone proves nothing.
    position = file_obj.tell()
    file_obj.seek(0)
    header = file_obj.read(5)
    file_obj.seek(position)
    if header != b"%PDF-":
        raise ValidationError("Yuklangan fayl PDF emas.")


def validate_latitude(value: float) -> None:
    if value is None or not (-90 <= float(value) <= 90):
        raise ValidationError("Latitude -90 va 90 orasida bo'lishi kerak.")


def validate_longitude(value: float) -> None:
    if value is None or not (-180 <= float(value) <= 180):
        raise ValidationError("Longitude -180 va 180 orasida bo'lishi kerak.")
