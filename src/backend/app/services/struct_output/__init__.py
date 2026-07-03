"""Structured-output primitives.

The reusable core behind every ``struct_output_{name}`` job, in two tiers: static
(code-tracked; real Pydantic model + migrated ORM table) and dynamic (built from
a registry row at runtime). Both run the LLM via pydantic-ai + OpenRouter and
upsert the result keyed on the source entity.

Modules:
  * ``base``     — the ``BaseDefinition`` seam: ``StaticDefinition`` (code) and
                   ``DynamicDefinition`` (registry row) + the combined resolver.
  * ``schema``   — field-type vocabulary + ``build_model`` (runtime Pydantic).
  * ``table``    — ``ensure_output_table`` / ``upsert_output`` / target resolution.
  * ``runner``   — the pydantic-ai + OpenRouter call (the one LLM seam).
  * ``registry`` — load/list definitions, fetch source entity rows.
  * ``definitions`` — static, code-tracked definitions (e.g. program_profile).
"""
