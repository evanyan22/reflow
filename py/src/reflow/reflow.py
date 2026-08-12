from __future__ import annotations

from typing import Any, Awaitable, Callable, Generic, List, Optional, TypeVar

from .classifiers import default_is_media_too_large, default_is_prompt_too_long, default_is_truncated
from .types import RecoveryAction, ReflowResult

TMessages = TypeVar("TMessages")
T = TypeVar("T")


class Reflow(Generic[TMessages]):
    """Wraps a model API call with reactive recovery for the three cases
    no major SDK handles automatically: a request rejected as too long,
    a request rejected for oversized media, and a response cut off by
    hitting the output token limit. Generic retry/backoff (429/5xx) is
    deliberately out of scope — every SDK already does that."""

    def __init__(
        self,
        on_prompt_too_long: Optional[Callable[[TMessages], Awaitable[TMessages]]] = None,
        on_media_too_large: Optional[Callable[[TMessages], Awaitable[TMessages]]] = None,
        on_truncated: Optional[
            Callable[[TMessages, int], Awaitable[Optional[TMessages]]]
        ] = None,
        max_truncation_retries: int = 2,
        max_recovery_attempts: int = 3,
        is_prompt_too_long: Optional[Callable[[Any], bool]] = None,
        is_media_too_large: Optional[Callable[[Any], bool]] = None,
        is_truncated: Optional[Callable[[Any], bool]] = None,
    ):
        self.on_prompt_too_long = on_prompt_too_long
        self.on_media_too_large = on_media_too_large
        self.on_truncated = on_truncated
        self.max_truncation_retries = max_truncation_retries
        self.max_recovery_attempts = max_recovery_attempts
        self.is_prompt_too_long = is_prompt_too_long or default_is_prompt_too_long
        self.is_media_too_large = is_media_too_large or default_is_media_too_large
        self.is_truncated = is_truncated or default_is_truncated

    async def call(
        self,
        fn: Callable[[TMessages], Awaitable[T]],
        messages: TMessages,
    ) -> ReflowResult[T]:
        current_messages = messages
        recoveries: List[RecoveryAction] = []

        # Stage 1: recover from prompt-too-long / media-too-large, capped
        # so a broken recovery hook can't loop forever burning API calls.
        attempts = 0
        while True:
            try:
                value = await fn(current_messages)
                break
            except Exception as error:
                attempts += 1
                if attempts > self.max_recovery_attempts:
                    raise

                if self.is_prompt_too_long(error) and self.on_prompt_too_long:
                    current_messages = await self.on_prompt_too_long(current_messages)
                    recoveries.append("prompt_too_long")
                    continue
                if self.is_media_too_large(error) and self.on_media_too_large:
                    current_messages = await self.on_media_too_large(current_messages)
                    recoveries.append("media_too_large")
                    continue
                raise

        # Stage 2: recover from output truncation, bounded.
        truncated = self.is_truncated(value)
        truncation_attempt = 0
        while truncated and self.on_truncated and truncation_attempt < self.max_truncation_retries:
            next_messages = await self.on_truncated(current_messages, truncation_attempt)
            if next_messages is None:
                break
            current_messages = next_messages
            value = await fn(current_messages)
            recoveries.append("truncated_retry")
            truncated = self.is_truncated(value)
            truncation_attempt += 1

        return ReflowResult(value=value, recoveries=recoveries, truncated=truncated)
