# Reflow (Python)

Ported line-for-line from the TypeScript implementation. See the
[root README](../README.md) for the pitch, the prior-art table, and the
scope decisions — this file only covers what's specific to running the
Python code.

## Install

```bash
pip install -e ".[dev]"
```

## Quickstart

```bash
PYTHONPATH=src python3 examples/quickstart.py
```

```python
from reflow import Reflow

async def on_prompt_too_long(messages):
    return (await context_clip.recover(messages)).messages

reflow = Reflow(
    on_prompt_too_long=on_prompt_too_long,
    on_media_too_large=lambda messages: strip_large_images(messages),
    on_truncated=lambda messages, attempt: [*messages, continue_message],
    max_truncation_retries=2,
)

result = await reflow.call(
    lambda messages: anthropic.messages.create(model=model, messages=messages, max_tokens=4096),
    initial_messages,
)
# result.value        — the response
# result.recoveries   — ordered log of what happened, e.g. ["prompt_too_long"]
# result.truncated    — True if still truncated after exhausting retries
```

## Test

```bash
pytest
```

## Status

Prompt-too-long recovery, media-too-large recovery, and bounded
truncation recovery are real and tested, with default classifiers for
common Anthropic/OpenAI-shaped errors. Published as
[`reflowkit`](https://pypi.org/project/reflowkit/) on PyPI — the bare
`reflow` name is taken by an unrelated abandoned package.
