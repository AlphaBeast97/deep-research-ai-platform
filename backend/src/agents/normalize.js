/**
 * Coercions shared by the agents that read model JSON.
 *
 * Every agent asks the model for a strict shape, but models occasionally return
 * `null`, a number, or a nested object where a string was requested. Each agent
 * normalises its own output through these helpers so a stray type can never leak
 * into a prompt or a persisted record. Kept in one place because four agents
 * would otherwise carry their own copy.
 */

/** Trim a value expected to be a string; anything else becomes `''`. */
export const asText = (value) => (typeof value === 'string' ? value.trim() : '')

/** An array of trimmed, non-empty strings (or `[]` for a non-array). */
export const asStrings = (value) =>
  Array.isArray(value) ? value.map(asText).filter(Boolean) : []
