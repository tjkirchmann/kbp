"""The LLM seam: pydantic-ai + OpenRouter structured output.

This is the *only* place that talks to the model. Everything (Temporal activity,
future webhook, manual trigger) calls ``generate``. It speaks the
``BaseDefinition`` seam — it doesn't care whether a definition is static (a real
Pydantic model) or dynamic (one built from a registry row); it just asks the
definition for its output model and rendered prompt. Model choice comes from the
definition's ``effective_model()``.

``generate(defn, entity)`` builds the pydantic-ai agent with the definition's
output model as ``output_type``, renders the prompt against the entity's label
fields, runs the agent, and returns the validated output as a dict ready for
``defn.upsert``. A template/field mismatch (an unknown placeholder) raises loudly
from ``BaseDefinition.render_prompt``.
"""

import logging

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from app.core.config import settings
from app.services.struct_output.base import BaseDefinition

logger = logging.getLogger(__name__)


def _build_agent(defn: BaseDefinition) -> tuple[Agent, str]:
    if not settings.openrouter_api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set; structured-output runner cannot call the model"
        )
    model_name = defn.effective_model()
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=settings.openrouter_api_key),
    )
    return Agent(model, output_type=defn.output_model()), model_name


async def generate(defn: BaseDefinition, entity: dict) -> tuple[dict, str]:
    """Run the LLM for one entity. Returns (output_dict, model_name).

    ``entity`` is the source row dict (pk + label fields). The returned dict has
    exactly the definition's output field names as keys.
    """
    agent, model_name = _build_agent(defn)
    prompt = defn.render_prompt(entity)
    result = await agent.run(prompt)
    logger.info(
        "struct_output.generate name=%s model=%s", defn.name, model_name
    )
    return result.output.model_dump(), model_name
