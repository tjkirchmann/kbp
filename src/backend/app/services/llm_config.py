"""OpenRouter/LLM settings: DB value (admin_config) with env fallback.

Mirrors admin_config.py getters (get_espn_rate_limit etc.): a DB override via
set_config wins, otherwise fall back to the env-loaded settings default. Lets the
default model, fallbacks, and reprompt budget be tuned from the admin panel with
no redeploy.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.admin_config import get_config

_API_KEY = "openrouter_api_key"
_DEFAULT_MODEL = "openrouter_default_model"
_MODEL_FALLBACKS = "openrouter_model_fallbacks"
_MAX_REPROMPTS = "openrouter_max_reprompts"

# A strong long-context model suited to document analysis. Overridable in admin
# (admin_config key openrouter_default_model) and per-call via the model arg.
_DEFAULT_MODEL_VALUE = "deepseek/deepseek-v4-pro"
_DEFAULT_MAX_REPROMPTS = 2


async def get_openrouter_api_key(db: AsyncSession) -> str:
    return await get_config(db, _API_KEY, default=settings.openrouter_api_key)


async def get_default_model(db: AsyncSession) -> str:
    return await get_config(db, _DEFAULT_MODEL, default=_DEFAULT_MODEL_VALUE)


async def get_model_fallbacks(db: AsyncSession) -> list[str]:
    """OpenRouter `models` fallback list. Comma-separated in config; [] if unset."""
    raw = await get_config(db, _MODEL_FALLBACKS, default="")
    return [m.strip() for m in raw.split(",") if m.strip()]


async def get_max_reprompts(db: AsyncSession) -> int:
    val = await get_config(db, _MAX_REPROMPTS, default=str(_DEFAULT_MAX_REPROMPTS))
    try:
        return max(0, int(val))
    except (ValueError, TypeError):
        return _DEFAULT_MAX_REPROMPTS
