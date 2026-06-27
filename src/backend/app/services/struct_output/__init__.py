"""Structured-output primitives.

The reusable core behind every ``struct_output_{name}`` job. Generalizes:
build a Pydantic model from a registry row, ensure its data table exists, run the
LLM (pydantic-ai + OpenRouter), and upsert the result keyed on the source entity.

Modules:
  * ``schema``   — field-type vocabulary + ``build_model`` (runtime Pydantic).
  * ``table``    — ``ensure_output_table`` / ``upsert_output`` / target resolution.
  * ``runner``   — the pydantic-ai + OpenRouter call (the one LLM seam).
  * ``registry`` — load/list definitions, fetch source entity rows.
  * ``seeds``    — locked, code-tracked definitions (e.g. program_profile).
"""
