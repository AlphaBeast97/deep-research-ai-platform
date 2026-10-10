import OpenAI from 'openai'
import config from './config.js'

// Local servers (Ollama, LM Studio, vLLM) don't require a key, but the SDK
// rejects an empty string — so send a placeholder when none is set. Presence of
// credentials is validated at startup (see index.js), so there is no mock
// fallback to worry about here.
const client = new OpenAI({
  apiKey: config.llm.apiKey || 'not-needed',
  // Any OpenAI-compatible provider works: Groq, OpenRouter, Together, etc.
  ...(config.llm.baseUrl ? { baseURL: config.llm.baseUrl } : {}),
})

/**
 * Ask the model for a JSON object and parse it. Uses OpenAI's JSON response
 * format so we never have to wrestle markdown code fences.
 */
export async function chatJSON({ system, user, model, temperature = 0.2 }) {
  const completion = await client.chat.completions.create({
    model: model || config.llm.model,
    temperature,
    // Not every OpenAI-compatible server implements json_object; when it's
    // disabled the prompt still asks for JSON and we salvage it below.
    ...(config.llm.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const text = completion.choices[0]?.message?.content || '{}'
  try {
    return { data: JSON.parse(text), usage: completion.usage }
  } catch {
    // Occasionally the model wraps JSON in prose — salvage the first object.
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Model did not return valid JSON')
    return { data: JSON.parse(match[0]), usage: completion.usage }
  }
}

/**
 * Stream a text completion token-by-token. `onToken` is invoked for each
 * delta so the caller can forward it over SSE immediately.
 */
export async function chatStream({ system, user, model, temperature = 0.4, onToken }) {
  const stream = await client.chat.completions.create({
    model: model || config.llm.smartModel,
    temperature,
    stream: true,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  let text = ''
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content
    if (delta) {
      text += delta
      if (onToken) onToken(delta)
    }
  }
  return text
}

/** Non-streaming completion, used for post-synthesis polish passes. */
export async function chat({ system, user, model, temperature = 0.3 }) {
  const completion = await client.chat.completions.create({
    model: model || config.llm.smartModel,
    temperature,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return {
    text: completion.choices[0]?.message?.content || '',
    usage: completion.usage,
  }
}
