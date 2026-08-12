import { defaultIsMediaTooLarge, defaultIsPromptTooLong, defaultIsTruncated } from './classifiers.js'
import type { RecoveryAction, ReflowOptions, ReflowResult } from './types.js'

/** Wraps a model API call with reactive recovery for the three cases no
 * major SDK handles automatically: a request rejected as too long, a
 * request rejected for oversized media, and a response cut off by
 * hitting the output token limit. Generic retry/backoff (429/5xx) is
 * deliberately out of scope — every SDK already does that. */
export class Reflow<TMessages> {
  private readonly onPromptTooLong?: ReflowOptions<TMessages>['onPromptTooLong']
  private readonly onMediaTooLarge?: ReflowOptions<TMessages>['onMediaTooLarge']
  private readonly onTruncated?: ReflowOptions<TMessages>['onTruncated']
  private readonly maxTruncationRetries: number
  private readonly maxRecoveryAttempts: number
  private readonly isPromptTooLong: (error: unknown) => boolean
  private readonly isMediaTooLarge: (error: unknown) => boolean
  private readonly isTruncated: (response: unknown) => boolean

  constructor(options: ReflowOptions<TMessages> = {}) {
    this.onPromptTooLong = options.onPromptTooLong
    this.onMediaTooLarge = options.onMediaTooLarge
    this.onTruncated = options.onTruncated
    this.maxTruncationRetries = options.maxTruncationRetries ?? 2
    this.maxRecoveryAttempts = options.maxRecoveryAttempts ?? 3
    this.isPromptTooLong = options.isPromptTooLong ?? defaultIsPromptTooLong
    this.isMediaTooLarge = options.isMediaTooLarge ?? defaultIsMediaTooLarge
    this.isTruncated = options.isTruncated ?? defaultIsTruncated
  }

  async call<T>(fn: (messages: TMessages) => Promise<T>, messages: TMessages): Promise<ReflowResult<T>> {
    let currentMessages = messages
    const recoveries: RecoveryAction[] = []
    let value: T

    // Stage 1: recover from prompt-too-long / media-too-large, capped so
    // a broken recovery hook can't loop forever burning API calls.
    let attempts = 0
    for (;;) {
      try {
        value = await fn(currentMessages)
        break
      } catch (error) {
        attempts++
        if (attempts > this.maxRecoveryAttempts) throw error

        if (this.isPromptTooLong(error) && this.onPromptTooLong) {
          currentMessages = await this.onPromptTooLong(currentMessages)
          recoveries.push('prompt_too_long')
          continue
        }
        if (this.isMediaTooLarge(error) && this.onMediaTooLarge) {
          currentMessages = await this.onMediaTooLarge(currentMessages)
          recoveries.push('media_too_large')
          continue
        }
        throw error
      }
    }

    // Stage 2: recover from output truncation, bounded.
    let truncated = this.isTruncated(value)
    let truncationAttempt = 0
    while (truncated && this.onTruncated && truncationAttempt < this.maxTruncationRetries) {
      const nextMessages = await this.onTruncated(currentMessages, truncationAttempt)
      if (nextMessages === undefined) break
      currentMessages = nextMessages
      value = await fn(currentMessages)
      recoveries.push('truncated_retry')
      truncated = this.isTruncated(value)
      truncationAttempt++
    }

    return { value, recoveries, truncated }
  }
}
