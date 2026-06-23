from datetime import datetime

from sqlalchemy import Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EntityTag(Base):
    """A free-text tag applied to an arbitrary entity.

    Polymorphic by (entity_type, entity_id): no FK, no shared tag catalog —
    each application stores its own name string. For sync tasks:
    entity_type='sync_task', entity_id=<task_name>. Tag color is not stored;
    it is derived from `name` at serialization time (see app.services.tags).
    """

    __tablename__ = "entity_tags"
    __table_args__ = (
        # No duplicate tag on a single entity (case-sensitive).
        UniqueConstraint(
            "entity_type", "entity_id", "name", name="uq_entity_tags_type_id_name"
        ),
        # Applied-tags lookup for one entity.
        Index("ix_entity_tags_type_id", "entity_type", "entity_id"),
        # Distinct-names-by-type scan that powers tag suggestions.
        Index("ix_entity_tags_type_name", "entity_type", "name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
