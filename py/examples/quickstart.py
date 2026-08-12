"""Run from py/: PYTHONPATH=src python3 examples/quickstart.py"""

import asyncio
from dataclasses import dataclass

from reflow import Reflow


@dataclass
class Message:
    role: str
    content: str


class FakeAPIError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# --- Simulated provider, standing in for a real Anthropic/OpenAI call ---
prompt_too_long_call_count = 0


async def call_too_long(messages: list[Message]) -> dict:
    global prompt_too_long_call_count
    total_chars = sum(len(m.content) for m in messages)
    prompt_too_long_call_count += 1
    if total_chars > 500:
        raise FakeAPIError(400, "prompt is too long: exceeds maximum context length")
    return {"stop_reason": "end_turn", "text": f"handled {len(messages)} messages"}


truncated_call_count = 0


async def call_truncates_once(_messages: list[Message]) -> dict:
    global truncated_call_count
    truncated_call_count += 1
    if truncated_call_count == 1:
        return {"stop_reason": "max_tokens", "text": "The answer starts here but cuts off ab"}
    return {"stop_reason": "end_turn", "text": "The answer starts here and finishes properly."}


async def main() -> None:
    # --- 1. Prompt-too-long recovery ---
    async def on_prompt_too_long(messages: list[Message]) -> list[Message]:
        # A real host would call ContextClip.recover() here. This stands
        # in for it: drop the oldest message and try again.
        return messages[1:]

    reflow_for_length = Reflow(on_prompt_too_long=on_prompt_too_long)

    long_conversation = [
        Message(role="user" if i % 2 == 0 else "assistant", content="x" * 80) for i in range(8)
    ]

    print("--- prompt-too-long recovery ---")
    length_result = await reflow_for_length.call(call_too_long, long_conversation)
    print("recoveries:", length_result.recoveries)
    print("result:", length_result.value)
    print("provider called", prompt_too_long_call_count, "times")

    # --- 2. Truncation recovery ---
    async def on_truncated(messages: list[Message], attempt: int) -> list[Message]:
        print(f"  (truncated on attempt {attempt}, asking for continuation)")
        return [*messages, Message(role="user", content="continue")]

    reflow_for_truncation = Reflow(on_truncated=on_truncated, max_truncation_retries=2)

    print("\n--- truncation recovery ---")
    truncation_result = await reflow_for_truncation.call(
        call_truncates_once, [Message(role="user", content="Explain the plan.")]
    )
    print("recoveries:", truncation_result.recoveries)
    print("truncated (final):", truncation_result.truncated)
    print("result:", truncation_result.value)

    # --- 3. Unrecognized error passes through untouched ---
    reflow_passthrough: Reflow = Reflow()
    print("\n--- unrecognized error passes through ---")

    async def always_rate_limited(_messages: list[Message]) -> dict:
        raise FakeAPIError(429, "rate limited")

    try:
        await reflow_passthrough.call(always_rate_limited, [])
    except FakeAPIError as error:
        print("propagated as expected:", error.message)


if __name__ == "__main__":
    asyncio.run(main())
