export type RecoveryAction = 'prompt_too_long' | 'media_too_large' | 'truncated_retry'

export interface ReflowResult<T> {
  value: T
  /** Ordered log of what happened, empty if the first attempt just worked. */
  recoveries: RecoveryAction[]
  /** True if the final result is still truncated after exhausting retries
   * (or if no onTruncated hook was provided at all). */
  truncated: boolean
}

export interface ReflowOptions<TMessages> {
  /** Called when a request is rejected as too large. Return a smaller
   * message list to retry with. No default — an unhandled too-long
   * error propagates rather than being guessed at. */
  onPromptTooLong?: (messages: TMessages) => TMessages | Promise<TMessages>
  /** Called when a request is rejected for oversized media. Same
   * fail-loud default as onPromptTooLong. */
  onMediaTooLarge?: (messages: TMessages) => TMessages | Promise<TMessages>
  /** Called when a response comes back truncated. Return adjusted
   * messages to retry with, or undefined to stop and accept the
   * truncated result. */
  onTruncated?: (
    messages: TMessages,
    attempt: number,
  ) => TMessages | undefined | Promise<TMessages | undefined>
  /** Cap on truncation-recovery attempts. Default 2. */
  maxTruncationRetries?: number
  /** Cap on prompt-too-long/media-too-large recovery attempts combined —
   * a safety limit so a broken recovery hook can't loop forever burning
   * API calls. Default 3. */
  maxRecoveryAttempts?: number
  /** Override the default Anthropic/OpenAI-shaped error classifier. */
  isPromptTooLong?: (error: unknown) => boolean
  isMediaTooLarge?: (error: unknown) => boolean
  isTruncated?: (response: unknown) => boolean
}
