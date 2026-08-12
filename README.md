# Reflow

**Reactive recovery for the model call itself — compact and retry when a
request doesn't fit, strip and retry when media is too large, recover when
output gets cut off.**

Every major LLM SDK treats "prompt too long" and "output truncated" as
hard, non-retryable failures — by design, not oversight. Anthropic's SDK
explicitly retries only 408/409/429/5xx, never 400/413. OpenAI's does the
same, and there's an open, unresolved GitHub issue on their own repo asking
for exactly this. LiteLLM's "context window fallback" switches to a bigger
model rather than shrinking the request. LangChain has the individual
pieces — retry middleware, summarization middleware — but its own docs say
plainly they aren't combined.

The best production coding agents do this properly: drain staged context
first, summarize if that's not enough, retry. That machinery is internal,
not portable. Reflow extracts the pattern as a small wrapper around any
model API call.

> **Status: v1, in progress.** Prompt-too-long recovery, media-too-large
> recovery, and bounded truncation recovery all work end-to-end (see
> `ts/README.md`). Not yet published.

---

## Prior art — verified before building, not assumed

| Checked | Result |
|---|---|
| Anthropic SDK | Retries only 408/409/429/5xx — explicitly not 400/413 |
| OpenAI SDK | Same pattern; open unresolved GitHub issue requesting this exact feature |
| LiteLLM | "Context window fallback" = switch to a bigger model, not compact and retry |
| LangChain / LangGraph | Retry and summarization middleware exist separately; docs say not combined |

Second clean read of this kind this session, after ToolLane — nobody found
automatically compacts-and-retries a too-large request or recovers from
output truncation. Every SDK either hard-fails or leaves it to the
developer.

## How it works

```
 request rejected — too large      compacted, retried — fits
 212K tokens                 ──►   140K tokens
```

1. Run the call.
2. If it fails as too-large, hand the messages to a pluggable compaction
   hook and retry — capped so a broken hook can't loop forever.
3. If it fails on oversized media, hand it to a pluggable stripping hook
   and retry.
4. If the response comes back truncated, retry with recovery up to a
   configurable limit, then surface the best attempt, clearly flagged,
   rather than pretending it's complete.
5. Anything else — a real rate limit, an auth failure — passes through
   untouched. Reflow deliberately doesn't reimplement generic backoff;
   every SDK already does that.

## Why a separate package, not folded into ContextClip

They compose tightly (`onPromptTooLong` is often literally `ContextClip`'s
`recover()`) but are genuinely different in kind: ContextClip is a pure
function over a message array, no I/O, zero dependencies. Reflow wraps an
actual network call, classifies real error shapes, and manages retry
state. Different moments in the loop — proactive budget management before
a call vs. reactive recovery around one — and keeping them separate means
either can be adopted without the other, the same reasoning that kept
ToolLane separate from ActAuth.

## Scope (v1)

**In:**
- `call()` wrapper around any async model-call function
- Pluggable `onPromptTooLong` and `onMediaTooLarge` recovery hooks, capped
  retry attempts
- Truncation detection with bounded, escalating retry via `onTruncated`
- Default classifiers covering common Anthropic/OpenAI-shaped errors and
  responses, overridable
- Fail-loud default — no hook provided means the error propagates

**Out, for now:**
- Generic transient-error retry/backoff (429/5xx) — solved everywhere
  already
- Exhaustive provider coverage beyond Anthropic/OpenAI-shaped errors out
  of the box
- Any actual compaction or stripping implementation — host-provided, or
  composed from ContextClip

## Repo layout

```
ts/    TypeScript implementation — see ts/README.md
py/    Python implementation — see py/README.md
```

Both ported line-for-line, same behavior. `py/` and `ts/` started as
siblings from day one.

## License

MIT — see [LICENSE](LICENSE).
