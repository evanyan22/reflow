import { describe, expect, it } from 'vitest'
import { defaultIsMediaTooLarge, defaultIsPromptTooLong, defaultIsTruncated } from '../src/classifiers.js'

describe('defaultIsPromptTooLong', () => {
  it('matches an Anthropic-shaped too-long error', () => {
    expect(
      defaultIsPromptTooLong({ status: 400, message: 'prompt is too long: 250000 tokens' }),
    ).toBe(true)
  })

  it('matches an OpenAI-shaped context_length_exceeded error by code', () => {
    expect(
      defaultIsPromptTooLong({ status: 400, code: 'context_length_exceeded', message: 'nope' }),
    ).toBe(true)
  })

  it('matches an OpenAI-shaped message about maximum context length', () => {
    expect(
      defaultIsPromptTooLong({
        status: 400,
        message: "This model's maximum context length is 128000 tokens.",
      }),
    ).toBe(true)
  })

  it('does not match an unrelated 400 error', () => {
    expect(defaultIsPromptTooLong({ status: 400, message: 'invalid api key' })).toBe(false)
  })

  it('does not match a non-400/413 status', () => {
    expect(defaultIsPromptTooLong({ status: 429, message: 'prompt is too long' })).toBe(false)
  })
})

describe('defaultIsMediaTooLarge', () => {
  it('matches an oversized-image-shaped error', () => {
    expect(defaultIsMediaTooLarge({ status: 400, message: 'image exceeds size limit' })).toBe(true)
  })

  it('does not match a media-unrelated too-large error', () => {
    expect(defaultIsMediaTooLarge({ status: 400, message: 'prompt is too long' })).toBe(false)
  })
})

describe('defaultIsTruncated', () => {
  it('detects an Anthropic-shaped truncated response', () => {
    expect(defaultIsTruncated({ stop_reason: 'max_tokens' })).toBe(true)
  })

  it('detects an OpenAI-shaped truncated response', () => {
    expect(defaultIsTruncated({ choices: [{ finish_reason: 'length' }] })).toBe(true)
  })

  it('does not flag a normal completed response', () => {
    expect(defaultIsTruncated({ stop_reason: 'end_turn' })).toBe(false)
    expect(defaultIsTruncated({ choices: [{ finish_reason: 'stop' }] })).toBe(false)
  })
})
