"""Global tagging: free-text tags applied to arbitrary entities.

Polymorphic by (entity_type, entity_id) — no shared catalog. Tag color is not
stored: it is derived deterministically from the name here and returned to the
frontend as a CSS class so the same name always renders the same color.
"""
import zlib

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entity_tag import EntityTag

# Entity types allowed to carry tags. Add a line here per new taggable entity.
ALLOWED_ENTITY_TYPES: frozenset[str] = frozenset({"sync_task"})

# The 6 .tag-* classes defined in src/frontend/src/index.css. Order is the hash
# bucket order — reordering changes existing tags' colors.
TAG_COLORS: tuple[str, ...] = (
    "tag-blue",
    "tag-teal",
    "tag-purple",
    "tag-amber",
    "tag-green",
    "tag-rose",
)

MAX_TAG_LEN = 50


def tag_color(name: str) -> str:
    """Map a tag name to one of the 6 CSS classes, stably.

    Uses crc32 (process- and platform-stable), not builtin hash() which is
    salted per process. Casefolds so 'Bug' and 'bug' share a color.
    """
    key = name.strip().casefold().encode("utf-8")
    return TAG_COLORS[zlib.crc32(key) % len(TAG_COLORS)]


def normalize_tag_name(raw: str) -> str:
    """Trim and validate a tag name. Case is preserved.

    Raises ValueError on invalid input; callers translate to HTTP 400.
    """
    name = raw.strip()
    if not name:
        raise ValueError("Tag name cannot be empty")
    if len(name) > MAX_TAG_LEN:
        raise ValueError(f"Tag name exceeds {MAX_TAG_LEN} characters")
    return name


def validate_entity_type(entity_type: str) -> None:
    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise ValueError(f"Unknown entity_type {entity_type!r}")


async def list_tags(db: AsyncSession, entity_type: str, entity_id: str) -> list[EntityTag]:
    rows = (await db.execute(
        select(EntityTag)
        .where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id)
        .order_by(EntityTag.name)
    )).scalars().all()
    return list(rows)


async def add_tag(db: AsyncSession, entity_type: str, entity_id: str, name: str) -> None:
    """Idempotent apply: insert, ignore if (type, id, name) already present."""
    stmt = pg_insert(EntityTag).values(
        entity_type=entity_type, entity_id=entity_id, name=name,
    ).on_conflict_do_nothing(constraint="uq_entity_tags_type_id_name")
    await db.execute(stmt)
    await db.commit()


async def remove_tag(db: AsyncSession, entity_type: str, entity_id: str, name: str) -> None:
    await db.execute(
        delete(EntityTag).where(
            EntityTag.entity_type == entity_type,
            EntityTag.entity_id == entity_id,
            EntityTag.name == name,
        )
    )
    await db.commit()


async def suggest_tags(db: AsyncSession, entity_type: str, entity_id: str) -> list[str]:
    """Distinct names used anywhere in this entity_type, minus those already
    applied to this specific entity, alphabetical."""
    applied = (
        select(EntityTag.name)
        .where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id)
    )
    rows = (await db.execute(
        select(EntityTag.name)
        .where(EntityTag.entity_type == entity_type, EntityTag.name.notin_(applied))
        .distinct()
        .order_by(EntityTag.name)
    )).scalars().all()
    return list(rows)
