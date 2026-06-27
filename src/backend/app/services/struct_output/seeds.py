"""Locked, code-tracked structured-output definitions.

These are the load-bearing definitions we may code off of. They live here (in
version control) and are seeded into the registry as ``locked`` rows that the API
won't delete or edit away. Seeding is idempotent (upsert by name) and runs at
worker boot — so deploying reconciles the registry the way the CFBD schedules
reconcile on boot.

This is the "hard delete from disk" target: removing a locked definition means
deleting its entry here (a later phase wires that to the admin UI).

The pet example: ``program_profile`` — ranks every FBS program across 10 profile
categories (score 1-10, tier, rationale) plus an overall, off ``cfbd_teams``.
"""

import logging

from app.core.database import TaskSessionLocal as SessionLocal
from app.models.struct_output import StructOutputDefinition

logger = logging.getLogger(__name__)

# Tier vocabulary shared by every category (high → low).
_TIERS = ["legendary", "elite", "strong", "average", "weak", "poor"]

# (slug, human label, what the category measures) — your 10 categories.
PROGRAM_PROFILE_CATEGORIES: list[tuple[str, str, str]] = [
    (
        "historical_prestige",
        "Historical Prestige & Tradition",
        "National titles, all-time wins, legendary coaches/players, and overall "
        "blue-blood status.",
    ),
    (
        "stadium_atmosphere",
        "Stadium & Game-Day Atmosphere",
        "Capacity, attendance, crowd intensity, and the overall experience of "
        "attending a game.",
    ),
    (
        "fanbase_passion",
        "Fan Base Size & Passion",
        "Geographic reach, loyalty, traveling support, and national following.",
    ),
    (
        "brand_marketability",
        "Brand & Marketability",
        "National recognition, media presence, merchandise sales, and cultural "
        "cachet beyond football.",
    ),
    (
        "facilities_resources",
        "Facilities & Resources",
        "Training complexes, weight rooms, locker rooms, and overall capital "
        "investment in the program.",
    ),
    (
        "nfl_pipeline",
        "NFL Pipeline & Player Development",
        "Draft picks produced, pro success rate, and reputation for developing "
        "talent.",
    ),
    (
        "recruiting_nil",
        "Recruiting Power & NIL Infrastructure",
        "Ability to land top recruits, collective strength, and donor/booster "
        "support.",
    ),
    (
        "academic_profile",
        "Academic Profile & Institutional Strength",
        "University ranking, graduation rates, and academic reputation of the "
        "school itself.",
    ),
    (
        "conference_strength",
        "Conference Strength & Media Value",
        "Quality of the league, TV revenue share, and exposure from broadcast "
        "deals.",
    ),
    (
        "rivalries_culture",
        "Rivalries & Cultural Footprint",
        "Marquee rivalry games, traditions, pageantry, and the program's place in "
        "regional/national identity.",
    ),
]


def _program_profile_fields() -> list[dict]:
    """Three fields per category (score/tier/rationale) + an overall pair."""
    fields: list[dict] = []
    for slug, label, desc in PROGRAM_PROFILE_CATEGORIES:
        fields.append(
            {
                "name": f"{slug}_score",
                "type": "score",
                "description": f"{label}: 1-10 (10 = legendary, 1 = very poor). {desc}",
            }
        )
        fields.append(
            {
                "name": f"{slug}_tier",
                "type": "tier",
                "enum": _TIERS,
                "description": f"{label}: tier label matching the score.",
            }
        )
        fields.append(
            {
                "name": f"{slug}_rationale",
                "type": "text",
                "description": f"{label}: 2-3 sentences justifying the score.",
            }
        )
    fields.append(
        {
            "name": "overall_score",
            "type": "score",
            "description": "Overall program profile, 1-10 (10 = legendary blue-blood), "
            "weighing all ten categories together.",
        }
    )
    fields.append(
        {
            "name": "overall_rationale",
            "type": "text",
            "description": "2-4 sentences summarizing the program's overall profile.",
        }
    )
    return fields


def _program_profile_prompt() -> str:
    cats = "\n".join(
        f"- {label}: {desc}" for _slug, label, desc in PROGRAM_PROFILE_CATEGORIES
    )
    return (
        "You are a college football analyst. Rank the program **{school}** "
        "(mascot: {mascot}, conference: {conference}) across these ten profile "
        "categories. Rank by overall program PROFILE — historical and structural "
        "standing — NOT by this year's on-field results.\n\n"
        f"{cats}\n\n"
        "For each category give a score from 1 to 10 (10 = legendary, 1 = very "
        "poor), a matching tier, and a 2-3 sentence rationale. Then give an "
        "overall score and rationale weighing all ten together. Be calibrated: "
        "reserve 9-10 for true blue-bloods and use the full range."
    )


# name -> definition kwargs. Add new locked definitions here.
def _definitions() -> dict[str, dict]:
    return {
        "program_profile": {
            "source_table": "cfbd_teams",
            "source_pk": "id",
            "source_label_fields": ["school", "mascot", "conference"],
            # FBS only — the programs the pool actually cares about.
            "source_filter": "classification = 'fbs'",
            "fields": _program_profile_fields(),
            "prompt_template": _program_profile_prompt(),
            "model": "",  # blank → settings.openrouter_default_model
            "cron": "0 4 * * *",  # nightly 04:00 UTC; populate-only
            "enabled": True,
            "locked": True,
        },
    }


async def seed_struct_output_definitions() -> None:
    """Idempotently upsert all locked definitions. Locked + load-bearing fields
    are kept authoritative from code; runtime-tunable knobs are left alone if the
    row already exists (so an admin could later adjust model/cron without the
    seed clobbering them — Phase 1 simply (re)asserts the locked shape)."""
    defs = _definitions()
    async with SessionLocal() as db:
        for name, kw in defs.items():
            existing = await db.get(StructOutputDefinition, name)
            if existing is None:
                db.add(StructOutputDefinition(name=name, **kw))
                logger.info("Seeded struct-output definition %s", name)
            else:
                # Re-assert the locked, load-bearing shape (schema/prompt/source);
                # leave operational knobs (model/cron/enabled) as-is if changed.
                existing.source_table = kw["source_table"]
                existing.source_pk = kw["source_pk"]
                existing.source_label_fields = kw["source_label_fields"]
                existing.source_filter = kw["source_filter"]
                existing.fields = kw["fields"]
                existing.prompt_template = kw["prompt_template"]
                existing.locked = True
                logger.info("Re-asserted struct-output definition %s", name)
        await db.commit()
