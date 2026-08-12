import { describe, expect, it } from 'vitest'
import { Reflow } from '../src/reflow.js'

function tooLongError() {
  return { status: 400, message: 'prompt is too long: exceeds maximum context length' }
}

describe('Reflow.call', () => {
  it('returns the value unchanged when the call succeeds immediately', async () => {
    const reflow = new Reflow<string[]>({})
    const result = await reflow.call(async () => 'ok', [])
    expect(result).toEqual({ value: 'ok', recoveries: [], truncated: false })
  })

  it('recovers from a prompt-too-long error via the provided hook', async () => {
    let calls = 0
    const reflow = new Reflow<string[]>({
      onPromptTooLong: async (messages) => messages.slice(1),
    })
    const result = await reflow.call(async (messages) => {
      calls++
      if (messages.length > 1) throw tooLongError()
      return `fine with ${messages.length}`
    }, ['a', 'b', 'c'])

    expect(calls).toBe(3)
    expect(result.recoveries).toEqual(['prompt_too_long', 'prompt_too_long'])
    expect(result.value).toBe('fine with 1')
  })

  it('propagates a prompt-too-long error when no hook is provided', async () => {
    const reflow = new Reflow<string[]>({})
    await expect(reflow.call(async () => { throw tooLongError() }, [])).rejects.toEqual(
      tooLongError(),
    )
  })

  it('propagates an unrecognized error even when hooks are provided', async () => {
    const reflow = new Reflow<string[]>({ onPromptTooLong: async (m) => m })
    const authError = { status: 401, message: 'invalid api key' }
    await expect(reflow.call(async () => { throw authError }, [])).rejects.toEqual(authError)
  })

  it('gives up after maxRecoveryAttempts and throws the last error', async () => {
    const reflow = new Reflow<string[]>({
      onPromptTooLong: async (messages) => messages, // never actually fixes anything
      maxRecoveryAttempts: 2,
    })
    let calls = 0
    await expect(
      reflow.call(async () => {
        calls++
        throw tooLongError()
      }, ['x']),
    ).rejects.toEqual(tooLongError())
    expect(calls).toBe(3) // initial + 2 retries
  })

  it('retries a truncated response via onTruncated up to the configured limit', async () => {
    let calls = 0
    const reflow = new Reflow<string[]>({
      onTruncated: async (messages) => [...messages, 'continue'],
      maxTruncationRetries: 2,
    })
    const result = await reflow.call(async () => {
      calls++
      return calls < 3 ? { stop_reason: 'max_tokens' } : { stop_reason: 'end_turn', text: 'done' }
    }, [])

    expect(calls).toBe(3)
    expect(result.recoveries).toEqual(['truncated_retry', 'truncated_retry'])
    expect(result.truncated).toBe(false)
  })

  it('stops retrying and flags truncated when onTruncated returns undefined', async () => {
    const reflow = new Reflow<string[]>({
      onTruncated: async () => undefined,
    })
    const result = await reflow.call(async () => ({ stop_reason: 'max_tokens' }), [])
    expect(result.recoveries).toEqual([])
    expect(result.truncated).toBe(true)
  })

  it('flags truncated without retrying when no onTruncated hook is provided', async () => {
    const reflow = new Reflow<string[]>({})
    const result = await reflow.call(async () => ({ stop_reason: 'max_tokens' }), [])
    expect(result.truncated).toBe(true)
    expect(result.recoveries).toEqual([])
  })
})
