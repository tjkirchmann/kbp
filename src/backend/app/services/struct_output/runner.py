"""The LLM seam: pydantic-ai + OpenRouter structured output.

This is the *only* place that talks to the model. Everything (Temporal activity,
future webhook, manual trigger) calls ``generate``. Swapping providers or models
is contained here + the registry row's ``model`` field.

``generate(defn, entity)`` builds the runtime Pydantic model from the field spec,
renders the prompt template against the entity's label fields, runs the agent
with that model as ``output_type``, and returns the validated output as a dict
ready for ``table.upsert_output``.

Prompt template uses ``str.format`` with the entity dict, so a template can
reference ``{school}``, ``{conference}`` etc. (the definition's
``source_label_fields``). Unknown placeholders raise — a template/field mismatch
should fail loudly.
"""

import logging

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from app.core.config import settings
from app.models.struct_output import StructOutputDefinition
from app.services.struct_output.schema import build_model

logger = logging.getLogger(__name__)


def _model_name(defn: StructOutputDefinition) -> str:
    return (defn.model or "").strip() or settings.openrouter_default_model


def _build_agent(defn: StructOutputDefinition) -> tuple[Agent, str]:
    if not settings.openrouter_api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set; structured-output runner cannot call the model"
        )
    model_name = _model_name(defn)
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=settings.openrouter_api_key),
    )
    output_model = build_model(defn.name, defn.fields)
    return Agent(model, output_type=output_model), model_name


def _render_prompt(defn: StructOutputDefinition, entity: dict) -> str:
    try:
        return defn.prompt_template.format(**entity)
    except KeyError as e:
        raise ValueError(
            f"prompt_template references {e} not in source_label_fields {list(entity)}"
        )


async def generate(defn: StructOutputDefinition, entity: dict) -> tuple[dict, str]:
    """Run the LLM for one entity. Returns (output_dict, model_name).

    ``entity`` is the source row dict (pk + label fields). The returned dict has
    exactly the definition's output field names as keys.
    """
    agent, model_name = _build_agent(defn)
    prompt = _render_prompt(defn, entity)
    result = await agent.run(prompt)
    logger.info(
        "struct_output.generate name=%s model=%s entity=%s",
        defn.name,
        model_name,
        entity.get(defn.source_pk),
    )
    return result.output.model_dump(), model_name
