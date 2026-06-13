"""Typed LLM errors + translation from the openai SDK.

Callers (tasks) never import openai.* — they catch these. `.retriable` decides the
*transport* retry axis: a retriable error is re-raised so Procrastinate re-runs the
whole task; a non-retriable one is terminal. LLMStructureError is special: it drives
the in-task *reprompt* loop and only becomes terminal after the reprompt budget is
spent (see openrouter.run_structured).
"""
import openai


class LLMError(Exception):
    retriable: bool = False

    def __init__(self, message: str):
        super().__init__(message)


class LLMRateLimitError(LLMError):
    retriable = True


class LLMTimeoutError(LLMError):
    retriable = True


class LLMProviderError(LLMError):
    """5xx / connection / unknown upstream failure."""

    retriable = True


class LLMAuthError(LLMError):
    retriable = False


class LLMContextLengthError(LLMError):
    """Input too long for the model — caller must chunk; retrying won't help."""

    retriable = False


class LLMStructureError(LLMError):
    """Model output failed JSON/schema validation.

    Handled inside the reprompt loop; raised as terminal only once max_reprompts is
    exhausted, carrying the last raw text for debugging.
    """

    retriable = False

    def __init__(self, message: str, *, raw: str | None = None):
        super().__init__(message)
        self.raw = raw


def classify(exc: Exception) -> LLMError:
    """Translate an openai SDK exception into a typed LLMError."""
    if isinstance(exc, openai.RateLimitError):
        return LLMRateLimitError(f"rate limited: {exc}")
    if isinstance(exc, (openai.APITimeoutError, openai.APIConnectionError)):
        return LLMTimeoutError(f"timeout/connection: {exc}")
    if isinstance(exc, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return LLMAuthError(f"auth: {exc}")
    if isinstance(exc, openai.BadRequestError):
        # OpenRouter signals over-context via a 400; detect by message.
        msg = str(exc).lower()
        if "context" in msg or "maximum context" in msg or "too long" in msg:
            return LLMContextLengthError(f"context length: {exc}")
        return LLMProviderError(f"bad request: {exc}")
    if isinstance(exc, openai.APIStatusError):
        status = getattr(exc, "status_code", None)
        if status is not None and 500 <= status < 600:
            return LLMProviderError(f"server error {status}: {exc}")
        return LLMProviderError(f"status error {status}: {exc}")
    if isinstance(exc, openai.OpenAIError):
        return LLMProviderError(f"openai error: {exc}")
    return LLMProviderError(f"unexpected: {exc}")
