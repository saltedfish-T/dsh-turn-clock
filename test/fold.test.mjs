// Drives the turnClock projection unit with synthetic Session events.
import assert from 'node:assert/strict'
import { apply, inject } from '../index.js'

const registered = []
apply({ sessionProjections: { register: (definition) => registered.push(definition) } })

assert.deepEqual(inject, ['sessionProjections'], 'declares the projection registry')
assert.equal(registered.length, 1, 'registers exactly one unit')
const unit = registered[0]

assert.equal(unit.key, 'turnClock')
assert.equal(typeof unit.stateVersion, 'number')
assert.equal(typeof unit.init, 'function')
assert.equal(typeof unit.wire.view, 'function')
assert.equal(typeof unit.stateSchema.parse, 'function')
assert.equal(typeof unit.wire.viewSchema.parse, 'function')

let state = unit.init({}, 0)
assert.deepEqual(state, { turns: [] })

const T0 = 1730580000000
const ev = (type, data, seq, time) => ({ type, data, seq, time })

// 1. A turn boundary anchors an entry with the event's own time and seq.
state = unit.apply(state, ev('turn/start', { turn: 1 }, 3, T0))
assert.deepEqual(state.turns, [{ turn: 1, t: T0, s: 3, p: '' }])

// 2. The first human prompt fills the preview, with whitespace collapsed.
state = unit.apply(
  state,
  ev('user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '  帮 我\n看看   这个  ' }] }, 4, T0 + 1000),
)
assert.equal(state.turns[0].p, '帮 我 看看 这个')

// 3. An injected (non-human) user message never leaks into the preview.
const beforeInjected = state
state = unit.apply(
  state,
  ev('user/message', { role: 'user', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: '注入的上下文' }] }, 5, T0 + 2000),
)
assert.equal(state, beforeInjected, 'ignored events keep the state reference')

// 4. A second human message in the same turn keeps the first preview.
const beforeSecond = state
state = unit.apply(
  state,
  ev('user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '继续' }] }, 6, T0 + 3000),
)
assert.equal(state, beforeSecond)

// 5. A non-text user message leaves the preview empty but still shaped correctly.
state = unit.apply(state, ev('turn/start', { turn: 2 }, 9, T0 + 60000))
state = unit.apply(state, ev('user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'image' }] }, 10, T0 + 61000))
assert.deepEqual(state.turns.map((t) => [t.turn, t.t, t.s]), [
  [1, T0, 3],
  [2, T0 + 60000, 9],
])
assert.equal(state.turns[1].p, '')

// 6. A repeated or stale turn boundary is ignored (whole-log order preserved).
const beforeRepeat = state
state = unit.apply(state, ev('turn/start', { turn: 2 }, 11, T0 + 62000))
assert.equal(state, beforeRepeat)

// 7. Unrelated events are no-ops.
const beforeOther = state
state = unit.apply(state, ev('turn/end', { turn: 2, reason: { kind: 'completed' } }, 12, T0 + 63000))
assert.equal(state, beforeOther)
state = unit.apply(state, ev('tool/call', { turn: 2, step: 1, callId: 'c', name: 'read', arguments: '{}' }, 13, T0 + 64000))
assert.equal(state, beforeOther)

// 8. The wire view is the unit state itself, so unchanged folds publish nothing.
assert.equal(unit.wire.view(state), state)

// 9. A long prompt is clipped to the preview budget with a trailing ellipsis.
let long = unit.init({}, 0)
long = unit.apply(long, ev('turn/start', { turn: 1 }, 1, T0))
long = unit.apply(long, ev('user/message', { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '长'.repeat(400) }] }, 2, T0))
assert.ok(long.turns[0].p.length <= 120, 'preview respects the budget')
assert.ok(long.turns[0].p.endsWith('…'), 'clipped preview is marked')

// 10. The wire value survives a JSON round trip (it must stay plain JSON).
const roundTripped = JSON.parse(JSON.stringify(unit.wire.view(state)))
assert.deepEqual(roundTripped, state)

console.log('turn-clock host fold: 10 checks passed')
