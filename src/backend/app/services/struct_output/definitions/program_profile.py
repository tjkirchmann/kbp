"""Static structured-output definition: program profile.

Ranks every FBS program across 10 profile categories (score 1-10, tier, rationale)
plus an overall, generated off ``cfbd_teams``. This is a load-bearing, code-tracked
definition: the output schema is a real Pydantic model, the results table is a real
Alembic-migrated ORM model (``StructOutputProgramProfile``), and the schedule is
reconciled at worker boot from the ``cron`` class attr.

The 10 categories + tier vocabulary live here (moved from the old dynamic
``seeds.py``). Adding/removing/renaming a category means updating this file, the
``StructOutputProgramProfile`` ORM model, and adding a migration — the three must
stay in lockstep.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.models.cfbd import CfbdTeam
from app.models.struct_output_program_profile import StructOutputProgramProfile
from app.services.struct_output.base import StaticDefinition

# Tier vocabulary shared by every category (high → low). Kept as a runtime tuple
# for any future UI/validation; the ``Tier`` Literal below is the type the LLM
# must satisfy — the two must match.
_TIERS = ("legendary", "elite", "strong", "average", "weak", "poor")
Tier = Literal["legendary", "elite", "strong", "average", "weak", "poor"]

# (slug, human label, what the category measures) — the 10 profile categories.
# Drives both the prompt and the field naming; the ORM columns mirror the slugs.
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


class ProgramProfileOutput(BaseModel):
    """Typed LLM output for one program profile.

    Field names mirror ``StructOutputProgramProfile`` columns exactly (the runner
    upserts by ``setattr``), so the two must stay in lockstep.
    """

    # historical_prestige
    historical_prestige_score: int = Field(
        ge=1, le=10, description="Historical Prestige & Tradition: 1-10."
    )
    historical_prestige_tier: Tier = Field(
        description="Historical Prestige & Tradition: tier matching the score."
    )
    historical_prestige_rationale: str = Field(
        description="Historical Prestige & Tradition: 2-3 sentences justifying the score."
    )
    # stadium_atmosphere
    stadium_atmosphere_score: int = Field(
        ge=1, le=10, description="Stadium & Game-Day Atmosphere: 1-10."
    )
    stadium_atmosphere_tier: Tier = Field(
        description="Stadium & Game-Day Atmosphere: tier matching the score."
    )
    stadium_atmosphere_rationale: str = Field(
        description="Stadium & Game-Day Atmosphere: 2-3 sentences justifying the score."
    )
    # fanbase_passion
    fanbase_passion_score: int = Field(
        ge=1, le=10, description="Fan Base Size & Passion: 1-10."
    )
    fanbase_passion_tier: Tier = Field(
        description="Fan Base Size & Passion: tier matching the score."
    )
    fanbase_passion_rationale: str = Field(
        description="Fan Base Size & Passion: 2-3 sentences justifying the score."
    )
    # brand_marketability
    brand_marketability_score: int = Field(
        ge=1, le=10, description="Brand & Marketability: 1-10."
    )
    brand_marketability_tier: Tier = Field(
        description="Brand & Marketability: tier matching the score."
    )
    brand_marketability_rationale: str = Field(
        description="Brand & Marketability: 2-3 sentences justifying the score."
    )
    # facilities_resources
    facilities_resources_score: int = Field(
        ge=1, le=10, description="Facilities & Resources: 1-10."
    )
    facilities_resources_tier: Tier = Field(
        description="Facilities & Resources: tier matching the score."
    )
    facilities_resources_rationale: str = Field(
        description="Facilities & Resources: 2-3 sentences justifying the score."
    )
    # nfl_pipeline
    nfl_pipeline_score: int = Field(
        ge=1, le=10, description="NFL Pipeline & Player Development: 1-10."
    )
    nfl_pipeline_tier: Tier = Field(
        description="NFL Pipeline & Player Development: tier matching the score."
    )
    nfl_pipeline_rationale: str = Field(
        description="NFL Pipeline & Player Development: 2-3 sentences justifying the score."
    )
    # recruiting_nil
    recruiting_nil_score: int = Field(
        ge=1, le=10, description="Recruiting Power & NIL Infrastructure: 1-10."
    )
    recruiting_nil_tier: Tier = Field(
        description="Recruiting Power & NIL Infrastructure: tier matching the score."
    )
    recruiting_nil_rationale: str = Field(
        description="Recruiting Power & NIL Infrastructure: 2-3 sentences justifying the score."
    )
    # academic_profile
    academic_profile_score: int = Field(
        ge=1, le=10, description="Academic Profile & Institutional Strength: 1-10."
    )
    academic_profile_tier: Tier = Field(
        description="Academic Profile & Institutional Strength: tier matching the score."
    )
    academic_profile_rationale: str = Field(
        description="Academic Profile & Institutional Strength: 2-3 sentences justifying the score."
    )
    # conference_strength
    conference_strength_score: int = Field(
        ge=1, le=10, description="Conference Strength & Media Value: 1-10."
    )
    conference_strength_tier: Tier = Field(
        description="Conference Strength & Media Value: tier matching the score."
    )
    conference_strength_rationale: str = Field(
        description="Conference Strength & Media Value: 2-3 sentences justifying the score."
    )
    # rivalries_culture
    rivalries_culture_score: int = Field(
        ge=1, le=10, description="Rivalries & Cultural Footprint: 1-10."
    )
    rivalries_culture_tier: Tier = Field(
        description="Rivalries & Cultural Footprint: tier matching the score."
    )
    rivalries_culture_rationale: str = Field(
        description="Rivalries & Cultural Footprint: 2-3 sentences justifying the score."
    )
    # overall
    overall_score: int = Field(
        ge=1,
        le=10,
        description="Overall program profile, 1-10 (10 = legendary blue-blood), weighing all ten categories together.",
    )
    overall_rationale: str = Field(
        description="2-4 sentences summarizing the program's overall profile."
    )


def _build_prompt() -> str:
    """Render the prompt template (references {school}/{mascot}/{conference})."""
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


class ProgramProfileDefinition(StaticDefinition):
    """Generate a program profile for each FBS team."""

    name = "program_profile"
    output = ProgramProfileOutput
    output_orm = StructOutputProgramProfile
    source_model = CfbdTeam
    source_label_fields = ["school", "mascot", "conference"]
    cron = (
        "0 4 * * *"  # nightly 04:00 UTC; populate-only (scheduled runs never overwrite)
    )
    model = ""  # blank → settings.openrouter_default_model
    prompt_template = _build_prompt()

    def filter_source(self, stmt):
        # FBS only — the programs the pool actually cares about.
        return stmt.where(CfbdTeam.classification == "fbs")


# Singleton registered into base.STATIC by the definitions package on import.
PROGRAM_PROFILE = ProgramProfileDefinition()
