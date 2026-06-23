import hashlib
import json
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sync import SyncSnapshot


def compute_content_hash(hash_fields: dict) -> bytes:
    return hashlib.sha256(
        json.dumps(hash_fields, sort_keys=True, default=str).encode()
    ).digest()


async def record_snapshot(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: str,
    payload: dict,
    hash_fields: dict,
    source: str,
) -> bool:
    """Insert a snapshot if content differs from the latest snapshot for this entity.

    Returns True if the row was inserted (i.e. the meaningful fields changed
    since the prior snapshot), False if the latest snapshot already matches.
    Empty hash_fields skips snapshotting entirely (returns False).

    A flapping value A -> B -> A records both flips: each insert is gated only
    by the immediately-preceding snapshot, not by all-time history.
    """
    if not hash_fields:
        return False

    content_hash = compute_content_hash(hash_fields)
    result = await db.execute(
        select(SyncSnapshot.content_hash)
        .where(
            SyncSnapshot.entity_type == entity_type,
            SyncSnapshot.entity_id == entity_id,
        )
        .order_by(SyncSnapshot.captured_at.desc())
        .limit(1)
    )
    if result.scalar() == content_hash:
        return False

    db.add(
        SyncSnapshot(
            entity_type=entity_type,
            entity_id=entity_id,
            captured_at=datetime.utcnow(),
            content_hash=content_hash,
            payload=payload,
            source=source,
        )
    )
    return True
