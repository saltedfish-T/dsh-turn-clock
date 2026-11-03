/**
 * Host half of dsh-turn-clock.
 *
 * Registers one `turnClock` projection unit: a pure fold of `turn/start`
 * boundaries and the first human prompt of each turn, kept as epoch-ms start
 * times and the boundary's seq for jumping. The whole-log outline reaches the
 * Client already computed, so the right Sidebar can date every turn of a
 * Session without holding its events.
 *
 * @module dsh-turn-clock
 */

/**
 * Prompt preview budget. Sized for the widest row the panel can show (two
 * lines at a wide sidebar); narrower panes clamp further in CSS. Keeping it
 * bounded matters: the whole turn array is re-published on every change, so
 * this multiplies by the session's turn count.
 */
const PROMPT_LIMIT = 120

/**
 * The projection registry validates unit state and wire values through these
 * schemas. Both are internal folds of already-typed Session events, so a
 * pass-through keeps the seam's call shape without a runtime dependency.
 */
const PASSTHROUGH = Object.freeze({
  parse: (value) => value,
  safeParse: (value) => ({ success: true, data: value }),
})

/**
 * Space-join text blocks, collapse whitespace, and cap with an ellipsis.
 * @param content - message content blocks.
 * @param limit - maximum preview length.
 * @returns the normalized preview, or `''` when the message carries no text.
 */
function preview(content, limit) {
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const block of content) {
    if (block === null || typeof block !== 'object' || block.type !== 'text') continue
    if (typeof block.text !== 'string') continue
    const chunk = block.text.length > limit * 2 ? block.text.slice(0, limit * 2) : block.text
    text += text === '' ? chunk : ` ${chunk}`
    if (text.length >= limit * 2) break
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 1).trimEnd()}…`
}

/** The `turnClock` unit: one entry per started turn, ascending. */
const turnClockDefinition = {
  key: 'turnClock',
  stateVersion: 2,
  stateSchema: PASSTHROUGH,
  init: () => ({ turns: [] }),
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start': {
        const last = state.turns.at(-1)
        if (last !== undefined && event.data.turn <= last.turn) return state
        return {
          turns: [...state.turns, { turn: event.data.turn, t: event.time, s: event.seq, p: '' }],
        }
      }
      case 'user/message': {
        if (event.data.source === undefined || event.data.source.kind !== 'user') return state
        const last = state.turns.at(-1)
        if (last === undefined || last.p !== '') return state
        const prompt = preview(event.data.content, PROMPT_LIMIT)
        if (prompt === '') return state
        return {
          turns: [...state.turns.slice(0, -1), { ...last, p: prompt }],
        }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: PASSTHROUGH,
    view: (state) => state,
  },
}

/** The projection registry is this plugin's whole capability. */
export const inject = ['sessionProjections']

/**
 * Register the unit; the registration rides this plugin's fiber.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx) {
  ctx.sessionProjections.register(turnClockDefinition)
}
