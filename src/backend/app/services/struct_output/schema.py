"""Field-type vocabulary + runtime Pydantic model construction.

A definition's ``fields`` is a list of specs (stored as JSON on the registry row):

    {"name": "historical_prestige_score", "type": "score",
     "description": "1-10, 10 = legendary blue-blood, 1 = very poor"}
    {"name": "historical_prestige_tier", "type": "tier",
     "enum": ["legendary", "elite", "strong", "average", "weak", "poor"],
     "description": "..."}
    {"name": "historical_prestige_rationale", "type": "text",
     "description": "2-3 sentences justifying the score"}

``build_model`` turns that into a real Pydantic ``BaseModel`` subclass via
``create_model``, which pydantic-ai uses as the structured-output schema
(``Agent(..., output_type=Model)``). Field descriptions become the LLM-facing
field docs, so they matter — they're the per-field instructions.

The same vocabulary drives the SQL column type in ``table.py``; keep the two
mappings in sync (see ``SQL_TYPE`` there).
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, create_model

# Field-type vocabulary. Each entry maps a definition field "type" to the Python
# type used in the runtime Pydantic model. "score"/"tier" are the structured
# ranking primitives; the rest are general scalars for arbitrary definitions.
ScoreInt = Annotated[int, Field(ge=1, le=10)]  # 1-10, 10 = best

# Types that need no extra spec data.
_SCALARS: dict[str, type] = {
    "score": ScoreInt,
    "text": str,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
}

# Types that require enum values on the field spec.
_ENUM_TYPES = {"tier", "enum"}

FieldType = Literal["score", "tier", "enum", "text", "str", "int", "float", "bool"]


def _python_type(spec: dict) -> Any:
    """Resolve one field spec to a Python type for create_model."""
    ftype = spec["type"]
    if ftype in _ENUM_TYPES:
        values = spec.get("enum")
        if not values:
            raise ValueError(
                f"field {spec['name']!r}: type {ftype!r} requires non-empty 'enum'"
            )
        # Literal[...] is how pydantic-ai expresses a closed set to the LLM.
        return Literal[tuple(values)]  # type: ignore[valid-type]
    try:
        return _SCALARS[ftype]
    except KeyError:
        raise ValueError(f"field {spec['name']!r}: unknown type {ftype!r}")


def build_model(name: str, fields: list[dict]) -> type[BaseModel]:
    """Build a runtime Pydantic model from a definition's field specs.

    ``name`` becomes the model class name (PascalCase-ish is fine; it's only
    cosmetic). Every field is required — the LLM must produce all of them.
    """
    definitions: dict[str, Any] = {}
    for spec in fields:
        py_type = _python_type(spec)
        definitions[spec["name"]] = (
            py_type,
            Field(description=spec.get("description", "")),
        )
    model_name = "".join(p.capitalize() for p in name.split("_")) or "StructOutput"
    return create_model(model_name, **definitions)
