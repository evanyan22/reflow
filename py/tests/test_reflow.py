import asyncio

import pytest

from reflow.reflow import Reflow


class FakeAPIError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def too_long_error() -> FakeAPIError:
    return FakeAPIError(400, "prompt is too long: exceeds maximum context length")


def test_returns_value_unchanged_when_call_succeeds_immediately():
    async def fn(_messages):
        return "ok"

    reflow = Reflow()
    result = asyncio.run(reflow.call(fn, []))
    assert result.value == "ok"
    assert result.recoveries == []
    assert result.truncated is False


def test_recovers_from_prompt_too_long_via_provided_hook():
    calls = 0

    async def fn(messages):
        nonlocal calls
        calls += 1
        if len(messages) > 1:
            raise too_long_error()
        return f"fine with {len(messages)}"

    async def on_prompt_too_long(messages):
        return messages[1:]

    reflow = Reflow(on_prompt_too_long=on_prompt_too_long)
    result = asyncio.run(reflow.call(fn, ["a", "b", "c"]))

    assert calls == 3
    assert result.recoveries == ["prompt_too_long", "prompt_too_long"]
    assert result.value == "fine with 1"


def test_propagates_prompt_too_long_error_when_no_hook_provided():
    async def fn(_messages):
        raise too_long_error()

    reflow = Reflow()
    with pytest.raises(FakeAPIError):
        asyncio.run(reflow.call(fn, []))


def test_propagates_unrecognized_error_even_when_hooks_provided():
    async def fn(_messages):
        raise FakeAPIError(401, "invalid api key")

    async def on_prompt_too_long(messages):
        return messages

    reflow = Reflow(on_prompt_too_long=on_prompt_too_long)
    with pytest.raises(FakeAPIError):
        asyncio.run(reflow.call(fn, []))


def test_gives_up_after_max_recovery_attempts_and_raises_last_error():
    calls = 0

    async def fn(_messages):
        nonlocal calls
        calls += 1
        raise too_long_error()

    async def on_prompt_too_long(messages):  # never actually fixes anything
        return messages

    reflow = Reflow(on_prompt_too_long=on_prompt_too_long, max_recovery_attempts=2)
    with pytest.raises(FakeAPIError):
        asyncio.run(reflow.call(fn, ["x"]))
    assert calls == 3  # initial + 2 retries


def test_retries_truncated_response_via_on_truncated_up_to_limit():
    calls = 0

    async def fn(_messages):
        nonlocal calls
        calls += 1
        if calls < 3:
            return {"stop_reason": "max_tokens"}
        return {"stop_reason": "end_turn", "text": "done"}

    async def on_truncated(messages, _attempt):
        return [*messages, "continue"]

    reflow = Reflow(on_truncated=on_truncated, max_truncation_retries=2)
    result = asyncio.run(reflow.call(fn, []))

    assert calls == 3
    assert result.recoveries == ["truncated_retry", "truncated_retry"]
    assert result.truncated is False


def test_stops_retrying_and_flags_truncated_when_on_truncated_returns_none():
    async def fn(_messages):
        return {"stop_reason": "max_tokens"}

    async def on_truncated(_messages, _attempt):
        return None

    reflow = Reflow(on_truncated=on_truncated)
    result = asyncio.run(reflow.call(fn, []))
    assert result.recoveries == []
    assert result.truncated is True


def test_flags_truncated_without_retrying_when_no_hook_provided():
    async def fn(_messages):
        return {"stop_reason": "max_tokens"}

    reflow = Reflow()
    result = asyncio.run(reflow.call(fn, []))
    assert result.truncated is True
    assert result.recoveries == []
