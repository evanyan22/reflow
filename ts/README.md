# Reflow (TypeScript)

See the [root README](../README.md) for the pitch, the prior-art table,
and the scope decisions. This file only covers what's specific to running
the code.

## Install

```bash
npm install
```

## Quickstart

```bash
npm run quickstart
```

```ts
import { Reflow } from './src/index.js'
import { ContextClipper } from 'contextclip'

const contextClip = new ContextClipper({ budgetTokens: 180000 })

const reflow = new Reflow<Message[]>({
  onPromptTooLong: async (messages) => (await contextClip.recover(messages)).messages,
  onMediaTooLarge: (messages) => stripLargeImages(messages),
  onTruncated: async (messages) => [...messages, { role: 'user', content: 'continue' }],
  maxTruncationRetries: 2,
})

const result = await reflow.call(
  (messages) => anthropic.messages.create({ model, messages, max_tokens: 4096 }),
  initialMessages,
)
// result.value        — the response
// result.recoveries   — ordered log of what happened, e.g. ['prompt_too_long']
// result.truncated    — true if still truncated after exhausting retries
```

## Test / build

```bash
npm test        # vitest
npm run build   # tsc -> dist/
```

## Status

Prompt-too-long recovery, media-too-large recovery, and bounded
truncation recovery are real and tested, with default classifiers for
common Anthropic/OpenAI-shaped errors. Not yet published to npm — the
bare `reflow` name has unrelated squats on both registries, so this
package publishes as `reflowkit` instead.
