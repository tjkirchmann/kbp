"""Internal OpenRouter structured-output client (private to the ai_call task).

NOT a public entry point — nothing outside app.tasks should import this. It wraps
the openai SDK pointed at OpenRouter and owns the structure-validation reprompt
loop. Structured output is the only mode: the caller supplies a JSON schema; we
validate the model's output ourselves (strict enforcement is model-dependent, so
app-side validation is the real guarantee) and reprompt on failure with the exact
validation error appended, up to max_reprompts.
"""
import json
import logging
from dataclasses import dataclass

import openai
from jsonschema import Draft202012Validator
from jsonschema import ValidationError as JsonSchemaValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.event_logger import log_event
from app.services import llm_config
from app.services.llm.errors import LLMError, LLMStructureError, classify

logger = logging.getLogger(__name__)


@dataclass
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class StructuredResult:
    data: dict
    model: str
    usage: Usage
    reprompts_used: int
    raw_id: str | None


def _repair_message(raw_text: str, error: str) -> dict:
    return {
        "role": "user",
        "content": (
            "Your previous response did not match the required JSON schema and could "
            f"not be used. The validation error was:\n\n{error}\n\nReturn ONLY corrected "
            "JSON that conforms to the schema. Do not include any prose or code fences."
        ),
    }


def _validate(content: str, validator: Draft202012Validator) -> dict:
    """Parse content as JSON and validate against the schema. Raises ValueError."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"output was not valid JSON: {exc}")
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    if errors:
        first = errors[0]
        loc = "/".join(str(p) for p in first.path) or "<root>"
        raise ValueError(f"schema violation at {loc}: {first.message}")
    return data


async def run_structured(
    db: AsyncSession,
    *,
    messages: list[dict],
    schema: dict,
    schema_name: str,
    model: str | None = None,
    max_reprompts: int | None = None,
    temperature: float = 0,
) -> StructuredResult:
    api_key = await llm_config.get_openrouter_api_key(db)
    model = model or await llm_config.get_default_model(db)
    fallbacks = await llm_config.get_model_fallbacks(db)
    if max_reprompts is None:
        max_reprompts = await llm_config.get_max_reprompts(db)

    client = openai.AsyncOpenAI(api_key=api_key, base_url=settings.openrouter_base_url)
    validator = Draft202012Validator(schema)
    response_format = {
        "type": "json_schema",
        "json_schema": {"name": schema_name, "strict": True, "schema": schema},
    }
    extra_body = {"provider": {"require_parameters": True}}
    if fallbacks:
        extra_body["models"] = fallbacks

    convo = list(messages)
    usage = Usage()
    last_raw = ""
    await log_event(db, "openrouter", "start", {"model": model, "schema": schema_name})
    await db.commit()

    for attempt in range(max_reprompts + 1):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=convo,
                response_format=response_format,
                extra_body=extra_body,
                temperature=temperature,
            )
        except openai.OpenAIError as exc:
            err = classify(exc)
            await log_event(db, "openrouter", "transport_error",
                            {"model": model, "error": str(err), "type": type(err).__name__})
            await db.commit()
            raise err

        choice = resp.choices[0]
        last_raw = choice.message.content or ""
        if resp.usage is not None:
            usage.prompt_tokens += resp.usage.prompt_tokens or 0
            usage.completion_tokens += resp.usage.completion_tokens or 0
            usage.total_tokens += resp.usage.total_tokens or 0

        try:
            data = _validate(last_raw, validator)
        except ValueError as verr:
            if attempt < max_reprompts:
                await log_event(db, "openrouter", "reprompt",
                                {"model": model, "attempt": attempt + 1, "error": str(verr)})
                await db.commit()
                convo.append({"role": "assistant", "content": last_raw})
                convo.append(_repair_message(last_raw, str(verr)))
                continue
            await log_event(db, "openrouter", "structure_failed",
                            {"model": model, "error": str(verr), "reprompts": attempt})
            await db.commit()
            raise LLMStructureError(
                f"output failed validation after {attempt} reprompt(s): {verr}",
                raw=last_raw,
            )

        await log_event(db, "openrouter", "success",
                        {"model": model, "reprompts": attempt, "total_tokens": usage.total_tokens})
        await db.commit()
        return StructuredResult(
            data=data, model=model, usage=usage, reprompts_used=attempt, raw_id=resp.id,
        )

    # Unreachable: the loop returns or raises on every path.
    raise LLMStructureError("exhausted reprompts without a result", raw=last_raw)
