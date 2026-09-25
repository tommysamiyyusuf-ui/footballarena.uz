"""Upload guards — the chat attachment field used to accept anything at all."""
from __future__ import annotations

import io

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from apps.common.validators import validate_attachment_file


def _png(name: str = "shot.png") -> SimpleUploadedFile:
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "green").save(buffer, format="PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def _pdf(name: str = "receipt.pdf", body: bytes = b"%PDF-1.4 minimal") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, body, content_type="application/pdf")


def test_image_attachment_is_accepted():
    validate_attachment_file(_png())


def test_pdf_attachment_is_accepted():
    validate_attachment_file(_pdf())


def test_executable_is_rejected():
    payload = SimpleUploadedFile("payload.exe", b"MZ\x90\x00", content_type="application/octet-stream")
    with pytest.raises(ValidationError):
        validate_attachment_file(payload)


def test_html_is_rejected():
    """Served back from our own origin, this would run as our own script."""
    page = SimpleUploadedFile(
        "note.html", b"<script>alert(1)</script>", content_type="text/html"
    )
    with pytest.raises(ValidationError):
        validate_attachment_file(page)


def test_svg_is_rejected():
    svg = SimpleUploadedFile(
        "logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        content_type="image/svg+xml",
    )
    with pytest.raises(ValidationError):
        validate_attachment_file(svg)


def test_renamed_file_pretending_to_be_a_pdf_is_rejected():
    with pytest.raises(ValidationError):
        validate_attachment_file(_pdf(body=b"MZ\x90\x00 not a pdf"))


def test_renamed_file_pretending_to_be_an_image_is_rejected():
    fake = SimpleUploadedFile("shot.png", b"not an image", content_type="image/png")
    with pytest.raises(ValidationError):
        validate_attachment_file(fake)


@override_settings(MAX_UPLOAD_SIZE_MB=1)
def test_oversized_attachment_is_rejected():
    big = SimpleUploadedFile(
        "big.pdf", b"%PDF-" + b"0" * (2 * 1024 * 1024), content_type="application/pdf"
    )
    with pytest.raises(ValidationError):
        validate_attachment_file(big)
