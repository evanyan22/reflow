// Run from ts/: npm run quickstart

import { Reflow } from '../src/index.js'

interface Message {
  role: string
  content: string
}

interface FakeResponse {
  stop_reason: string
  text: string
}

// --- Simulated provider, standing in for a real Anthropic/OpenAI call ---
let promptTooLongCallCount = 0
async function callTooLong(messages: Message[]): Promise<FakeResponse> {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  promptTooLongCallCount++
  if (totalChars > 500) {
    throw { status: 400, message: 'prompt is too long: exceeds maximum context length' }
  }
  return { stop_reason: 'end_turn', text: `handled ${messages.length} messages` }
}

let truncatedCallCount = 0
async function callTruncatesOnce(messages: Message[]): Promise<FakeResponse> {
  truncatedCallCount++
  if (truncatedCallCount === 1) {
    return { stop_reason: 'max_tokens', text: 'The answer starts here but cuts off ab' }
  }
  return { stop_reason: 'end_turn', text: 'The answer starts here and finishes properly.' }
}

// --- 1. Prompt-too-long recovery ---
const reflowForLength = new Reflow<Message[]>({
  onPromptTooLong: async (messages) => {
    // A real host would call ContextClip.recover() here. This stands in
    // for it: drop the oldest message and try again.
    return messages.slice(1)
  },
})

const longConversation: Message[] = Array.from({ length: 8 }, (_, i) => ({
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: 'x'.repeat(80),
}))

console.log('--- prompt-too-long recovery ---')
const lengthResult = await reflowForLength.call(callTooLong, longConversation)
console.log('recoveries:', lengthResult.recoveries)
console.log('result:', lengthResult.value)
console.log('provider called', promptTooLongCallCount, 'times')

// --- 2. Truncation recovery ---
const reflowForTruncation = new Reflow<Message[]>({
  onTruncated: async (messages, attempt) => {
    console.log(`  (truncated on attempt ${attempt}, asking for continuation)`)
    return [...messages, { role: 'user', content: 'continue' }]
  },
})

console.log('\n--- truncation recovery ---')
const truncationResult = await reflowForTruncation.call(callTruncatesOnce, [
  { role: 'user', content: 'Explain the plan.' },
])
console.log('recoveries:', truncationResult.recoveries)
console.log('truncated (final):', truncationResult.truncated)
console.log('result:', truncationResult.value)

// --- 3. Unrecognized error passes through untouched ---
const reflowPassthrough = new Reflow<Message[]>({})
console.log('\n--- unrecognized error passes through ---')
try {
  await reflowPassthrough.call(async () => {
    throw { status: 429, message: 'rate limited' }
  }, [])
} catch (error) {
  console.log('propagated as expected:', (error as { message: string }).message)
}
