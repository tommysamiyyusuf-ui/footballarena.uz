from __future__ import annotations

from apps.common.models import AuditLog
from apps.common.utils import client_ip


def record_audit(
    *,
    actor,
    action: str,
    target=None,
    description: str = "",
    metadata: dict | None = None,
    request=None,
) -> AuditLog:
    """Persist a privileged action for later admin review."""
    return AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=target.__class__.__name__ if target is not None else "",
        target_id=str(getattr(target, "pk", "")) if target is not None else "",
        description=description,
        metadata=metadata or {},
        ip_address=client_ip(request) if request is not None else None,
    )
