"""Punto único de entrada a la bitácora: `record(...)`.

Solo se escribe desde aquí; la API expone la bitácora a solo lectura.
El registro vive en la misma transacción que la acción que describe para que
nada quede sin rastro si la acción se deshace — y viceversa.
"""

from apps.accounts.models import User

from .models import AuditLog

_LABELS = {
    "event": lambda obj: obj.title,
    "order": lambda obj: obj.code,
    "ticket": lambda obj: obj.code,
    "eventimage": lambda obj: obj.alt or "Imagen",
    "tickettype": lambda obj: obj.name,
    "guestcode": lambda obj: obj.code,
    "user": lambda obj: obj.full_name or obj.email,
    "organization": lambda obj: obj.name,
}


def record(
    *,
    actor: User | None,
    organization,
    action: str,
    target,
    reason: str = "",
    event=None,
    metadata: dict | None = None,
    **extra,
) -> AuditLog:
    """Registra una acción de control en la bitácora.

    `target` es el objeto sobre el que se actuó (evento, orden, entrada,
    imagen). `event` se denormaliza aparte para que la bitácora de un evento
    sea una sola consulta; si no se pasa y el objetivo es el propio evento o
    cuelga de uno, se infiere. `metadata` y `extra` se funden en un solo JSON
    (los kwargs sueltos evitan `{"metadata": {...}}` anidado por error).
    """
    model_name = target._meta.model_name if target is not None else ""
    label_fn = _LABELS.get(model_name)
    target_label = label_fn(target) if label_fn is not None else ""
    if event is None:
        from apps.events.models import Event

        if isinstance(target, Event):
            event = target
        else:
            event = getattr(target, "event", None)

    merged = dict(metadata or {})
    merged.update(extra)
    return AuditLog.objects.create(
        organization=organization,
        actor=actor,
        actor_email=actor.email if actor else "",
        action=action,
        target_type=model_name,
        target_id=target.pk if target is not None else None,
        target_label=str(target_label or "")[:150],
        event=event,
        reason=reason,
        metadata=merged,
    )