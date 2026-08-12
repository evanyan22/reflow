from __future__ import annotations

from typing import Any, Optional


def _get(obj: Any, key: str) -> Any:
    """Works whether the error/response is a dict (raw JSON) or an
    object with attributes (an SDK exception/model)."""
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _message_of(error: Any) -> str:
    message = _get(error, "message")
    if message is None:
        return str(error).lower()
    return str(message).lower()


def _code_of(error: Any) -> str:
    code = _get(error, "code")
    return str(code).lower() if code is not None else ""


def _status_of(error: Any) -> Optional[int]:
    status = _get(error, "status")
    if status is None:
        return None
    try:
        return int(status)
    except (TypeError, ValueError):
        return None


_TOO_LONG_PATTERNS = [
    "prompt is too long",
    "too many tokens",
    "maximum context length",
    "context_length_exceeded",
    "input length",
    "exceeds the maximum",
]


def default_is_prompt_too_long(error: Any) -> bool:
    """Heuristic default covering Anthropic- and OpenAI-shaped errors.
    Deliberately not exhaustive — override for other providers or
    stricter matching. Duck-typed on purpose, so this package never
    depends on either SDK."""
    status = _status_of(error)
    if status not in (400, 413):
        return False
    if _code_of(error) == "context_length_exceeded":
        return True
    message = _message_of(error)
    return any(pattern in message for pattern in _TOO_LONG_PATTERNS)


_MEDIA_PATTERNS = ["image", "media", "file size", "attachment"]
_SIZE_PATTERNS = ["too large", "exceeds", "size limit", "too big"]


def default_is_media_too_large(error: Any) -> bool:
    status = _status_of(error)
    if status not in (400, 413):
        return False
    message = _message_of(error)
    mentions_media = any(pattern in message for pattern in _MEDIA_PATTERNS)
    mentions_size = any(pattern in message for pattern in _SIZE_PATTERNS)
    return mentions_media and mentions_size


def default_is_truncated(response: Any) -> bool:
    if response is None:
        return False

    if _get(response, "stop_reason") == "max_tokens":  # Anthropic
        return True

    choices = _get(response, "choices")
    if choices:
        finish_reason = _get(choices[0], "finish_reason")
        if finish_reason == "length":  # OpenAI
            return True

    return False
