from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, List, Literal, TypeVar

RecoveryAction = Literal["prompt_too_long", "media_too_large", "truncated_retry"]

T = TypeVar("T")


@dataclass
class ReflowResult(Generic[T]):
    value: T
    # Ordered log of what happened, empty if the first attempt just worked.
    recoveries: List[RecoveryAction]
    # True if the final result is still truncated after exhausting
    # retries (or if no on_truncated hook was provided at all).
    truncated: bool
