// Run with: node --test plugins/savvy-limits/lib/capacity.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KINDS, LADDERS, PERIOD_MS, allocate, assessPace, buildReport, claudeWindows, parseGeminiUsage, routeGemini, windowState } from './capacity.mjs'

const NOW = Date.parse('2026-11-23T20:00:00Z')
const H = 3600e3
const iso = ms => new Date(NOW + ms).toISOString()
const win = (remaining, hours) => ({ remaining, resetAt: iso(hours * H), disabled: false })
const windows = (weekly, weeklyH, fiveHour, fiveH) => ({ weekly: win(weekly, weeklyH), fiveHour: win(fiveHour, fiveH) })

test('parses real agy usage output, including a disabled window', () => {
  const q = parseGeminiUsage(
    'Gemini Models\tWeekly Limit Remaining\t100%\t2026-11-30T20:16:15Z\r\n' +
      'Gemini Models\tFive Hour Limit Remaining\t87%\t2026-11-24T01:16:15Z\n' +
      'Claude and GPT models\tWeekly Limit Remaining\t0%\t2026-11-28T12:13:55Z\n' +
      'Claude and GPT models\tFive Hour Limit Remaining\tdisabled\n',
  )
  assert.equal(q.weekly.remaining, 100)
  assert.equal(q.fiveHour.remaining, 87)
  assert.throws(() => parseGeminiUsage('Please sign in'), /Could not read Gemini quota/)
})

test('reads Claude rate limits as percent remaining', () => {
  const w = claudeWindows([
    { kind: 'five_hour', percentUsed: 13, resetsAt: iso(4 * H) },
    { kind: 'seven_day', percentUsed: 35.5, resetsAt: iso(11 * H) },
    { kind: 'spend_limit', percentUsed: 90 },
  ])
  assert.equal(w.fiveHour.remaining, 87)
  assert.equal(w.weekly.remaining, 64.5)
  assert.equal(claudeWindows([]), null)
})

test('a 100% window is not started, and a past reset restores the window', () => {
  assert.equal(windowState(win(100, 1), PERIOD_MS.fiveHour, NOW).started, false)
  const past = windowState(win(4, -1), PERIOD_MS.fiveHour, NOW)
  assert.equal(past.remaining, 100)
  assert.equal(past.started, false)
})

test('pace: blocked, conserve, surplus and normal', () => {
  const blocked = assessPace(windows(2, 48, 4, 2), NOW)
  assert.equal(blocked.mode, 'blocked')
  assert.equal(blocked.waitUntil, iso(48 * H))
  assert.equal(assessPace(windows(50, 144, 80, 3), NOW).mode, 'conserve')
  assert.equal(assessPace(windows(70, 72, 60, 0.5), NOW).mode, 'surplus')
  assert.equal(assessPace(windows(100, 168, 100, 0.5), NOW).mode, 'normal')
  assert.equal(assessPace(null, NOW).mode, 'unknown')
})

test('the real Claude reading from this build counts as expiring weekly quota', () => {
  const w = claudeWindows([
    { kind: 'five_hour', percentUsed: 13, resetsAt: iso(4.4 * H) },
    { kind: 'seven_day', percentUsed: 35, resetsAt: iso(11.3 * H) },
  ])
  assert.equal(assessPace(w, NOW).mode, 'surplus')
})

test('routing shifts with pace and stays inside the ladder', () => {
  assert.equal(routeGemini('code', 'm', { mode: 'normal' }), 'gemini-4-neon-medium')
  assert.equal(routeGemini('code', 'm', { mode: 'conserve' }), 'gemini-4-neon-low')
  assert.equal(routeGemini('code', 'm', { mode: 'surplus' }), 'gemini-4-neon-high')
  assert.equal(routeGemini('hard', 'l', { mode: 'surplus' }), 'gemini-4-neon-xhigh')
  assert.equal(routeGemini('code', 'm', { mode: 'blocked' }), null)
  assert.equal(routeGemini('code', 'm', { mode: 'unknown' }), null)
  assert.throws(() => routeGemini('nope', 'm', { mode: 'normal' }), /Unknown kind/)
})

test('allocation balances providers and keeps testing on Claude', () => {
  const by = (c, g) => allocate({ mode: c }, { mode: g })
  assert.equal(by('normal', 'normal').code.provider, 'claude')
  assert.equal(by('normal', 'normal').mechanical.provider, 'gemini')
  assert.equal(by('normal', 'normal').design.provider, 'gemini')
  assert.equal(by('normal', 'normal').review.provider, 'gemini')
  assert.equal(by('normal', 'normal').hard.provider, 'claude')
  assert.equal(by('surplus', 'normal').mechanical.provider, 'claude')
  assert.equal(by('normal', 'surplus').code.provider, 'gemini')
  assert.equal(by('normal', 'surplus').hard.provider, 'claude')
  assert.equal(by('conserve', 'normal').code.provider, 'gemini')
  assert.equal(by('conserve', 'normal').hard.provider, 'claude')
  assert.equal(by('normal', 'conserve').design.provider, 'claude')
  assert.equal(by('blocked', 'normal').code.provider, 'gemini')
  assert.equal(by('blocked', 'normal').hard.provider, 'gemini')
  assert.equal(by('normal', 'blocked').design.provider, 'claude')
  assert.equal(by('normal', 'unknown').code.provider, 'claude')
  for (const [c, g] of [['normal', 'surplus'], ['conserve', 'normal'], ['blocked', 'normal']]) {
    assert.equal(by(c, g).test.provider, 'claude')
  }
})

test("expiring Claude quota never spends its five-hour reserve", () => {
  const claude = remaining => ({ mode: 'surplus', fiveHour: { remaining } })
  const below = allocate(claude(34), { mode: 'normal' })
  for (const kind of ['mechanical', 'code', 'design', 'review']) assert.equal(below[kind].provider, 'gemini')
  assert.equal(below.hard.provider, 'claude')
  assert.equal(below.test.provider, 'claude')
  assert.equal(allocate(claude(40), { mode: 'normal' }).mechanical.provider, 'claude')
  // With both providers low, each track goes where it fits.
  const bothLow = allocate(claude(34), { mode: 'conserve' })
  assert.equal(bothLow.code.provider, 'claude')
  assert.equal(bothLow.mechanical.provider, 'gemini')
})

test('routing never picks Flash, and Argon runs only when a task names it', () => {
  assert.equal(Object.values(LADDERS).flat().some(model => /flash|argon/.test(model)), false)
  for (const kind of KINDS) {
    for (const size of ['s', 'm', 'l']) {
      for (const mode of ['conserve', 'normal', 'surplus']) assert.doesNotMatch(routeGemini(kind, size, { mode }), /flash|argon/)
    }
  }
})

test('media work stays on Gemini, whatever the quota', () => {
  assert.equal(allocate({ mode: 'surplus' }, { mode: 'normal' }).media.provider, 'gemini')
  assert.equal(allocate({ mode: 'normal' }, { mode: 'conserve' }).media.provider, 'gemini')
  const blocked = allocate({ mode: 'normal' }, { mode: 'blocked' }).media
  assert.equal(blocked.provider, 'gemini')
  assert.match(blocked.reason, /unavailable/)
  assert.equal(routeGemini('media', 's', { mode: 'normal' }), 'gemini-4-neon-medium')
})

test('a stale Gemini reading is never routed to', () => {
  const r = buildReport({
    rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: iso(3 * H) }, { kind: 'seven_day', percentUsed: 20, resetsAt: iso(100 * H) }],
    gemini: { windows: windows(90, 100, 90, 3), asOf: NOW - 31 * 60e3 },
    now: NOW,
  })
  assert.equal(r.gemini.isStale, true)
  assert.equal(r.gemini.mode, 'unknown')
  assert.equal(r.gemini.recommendations.code.m, null)
  assert.equal(r.tracks.code.provider, 'claude')
})
