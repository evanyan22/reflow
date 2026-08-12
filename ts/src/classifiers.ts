/** Heuristic defaults covering Anthropic- and OpenAI-shaped errors and
 * responses. Deliberately not exhaustive — override via ReflowOptions
 * for other providers or stricter matching. Duck-typed on purpose, so
 * this package never depends on either SDK. */

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message).toLowerCase()
  }
  return ''
}

function codeOf(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code).toLowerCase()
  }
  return ''
}

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    return Number.isNaN(status) ? undefined : status
  }
  return undefined
}

const TOO_LONG_PATTERNS = [
  'prompt is too long',
  'too many tokens',
  'maximum context length',
  'context_length_exceeded',
  'input length',
  'exceeds the maximum',
]

export function defaultIsPromptTooLong(error: unknown): boolean {
  const status = statusOf(error)
  if (status !== 400 && status !== 413) return false
  if (codeOf(error) === 'context_length_exceeded') return true
  const message = messageOf(error)
  return TOO_LONG_PATTERNS.some((pattern) => message.includes(pattern))
}

const MEDIA_PATTERNS = ['image', 'media', 'file size', 'attachment']
const SIZE_PATTERNS = ['too large', 'exceeds', 'size limit', 'too big']

export function defaultIsMediaTooLarge(error: unknown): boolean {
  const status = statusOf(error)
  if (status !== 400 && status !== 413) return false
  const message = messageOf(error)
  const mentionsMedia = MEDIA_PATTERNS.some((pattern) => message.includes(pattern))
  const mentionsSize = SIZE_PATTERNS.some((pattern) => message.includes(pattern))
  return mentionsMedia && mentionsSize
}

export function defaultIsTruncated(response: unknown): boolean {
  if (!response || typeof response !== 'object') return false
  const r = response as Record<string, unknown>

  if (r.stop_reason === 'max_tokens') return true // Anthropic

  const choices = r.choices
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const choice = choices[0] as Record<string, unknown>
    if (choice.finish_reason === 'length') return true // OpenAI
  }

  return false
}
