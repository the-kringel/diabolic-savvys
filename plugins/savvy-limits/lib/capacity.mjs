// Pure capacity logic shared by the mod and the Gemini worker: no I/O, no Node APIs.

export const PERIOD_MS = { weekly: 7 * 24 * 3600e3, fiveHour: 5 * 3600e3 }

// A Gemini reading older than this is not trusted for routing.
export const STALE_MS = 30 * 60e3

export const LIMITS = {
  floorFiveHour: 5, // stop launching at or below this % remaining
  floorWeekly: 3,
  conserveFiveHour: 20,
  conserveWeekly: 15,
  overPace: 0.15, // weekly used fraction may lead elapsed fraction by this much
  surplusFiveHourMinutes: 60, // "use it or lose it" window before a 5h reset
  surplusFiveHourRemaining: 40,
  surplusWeeklyLead: 0.05,
  surplusWeeklyHours: 12,
  surplusWeeklyRemaining: 25,
  claudeReserveFiveHour: 40, // % of Claude's five-hour quota kept for orchestration and review
}

// Ordered cheapest to strongest. Starting heuristics: Google publishes no per-model
// quota costs, so the worker's ledger measures them over time. Argon is left out: it
// trails Neon on Terminal-Bench 4.1, so it runs only when a task names it with --model.
export const LADDERS = {
  mechanical: ['gemini-3.8-flash-medium', 'gemini-4-hydrogen-low', 'gemini-4-hydrogen-medium', 'gemini-4-hydrogen-high'],
  code: ['gemini-4-hydrogen-medium', 'gemini-4-neon-low', 'gemini-4-neon-medium', 'gemini-4-neon-high', 'gemini-4-neon-xhigh'],
  design: ['gemini-4-neon-low', 'gemini-4-neon-medium', 'gemini-4-neon-high', 'gemini-4-neon-xhigh'],
  review: ['gemini-4-hydrogen-high', 'gemini-4-neon-medium', 'gemini-4-neon-high', 'gemini-4-neon-xhigh'],
  hard: ['gemini-4-neon-high', 'gemini-4-neon-xhigh'],
  media: ['gemini-4-hydrogen-medium', 'gemini-4-neon-medium', 'gemini-4-neon-high', 'gemini-4-neon-xhigh'],
}

export const KINDS = Object.keys(LADDERS)
const SIZES = ['s', 'm', 'l']
const BASE_RUNG = { s: 1, m: 2, l: 3 }
const SHIFT = { conserve: -1, normal: 0, surplus: 1 }
const GROUPS = { 'Gemini Models': 'gemini' }
const WINDOWS = { 'Weekly Limit Remaining': 'weekly', 'Five Hour Limit Remaining': 'fiveHour' }

// Parses `agy -p /usage`: tab-separated group, window, value, reset time.
export function parseGeminiUsage(text) {
  const found = {}
  for (const line of String(text).split(/\r?\n/)) {
    const [groupName, windowName, value, resetAt] = line.split('\t').map(s => s?.trim())
    const win = WINDOWS[windowName]
    if (GROUPS[groupName] !== 'gemini' || !win) continue
    const pct = /^(\d+(?:\.\d+)?)%$/.exec(value ?? '')
    found[win] = pct
      ? { remaining: Number(pct[1]), resetAt: resetAt || null, disabled: false }
      : { remaining: 0, resetAt: resetAt || null, disabled: true }
  }
  if (!found.weekly || !found.fiveHour) {
    throw new Error('Could not read Gemini quota from `agy -p /usage`. The output format may have changed.')
  }
  return found
}

// Claude Code reports percent used per window; absent windows stay absent.
export function claudeWindows(rateLimits) {
  const toWindow = kind => {
    const r = (rateLimits ?? []).find(x => x.kind === kind)
    if (!r) return null
    return { remaining: Math.max(0, Math.min(100, 100 - r.percentUsed)), resetAt: r.resetsAt ?? null, disabled: false }
  }
  const weekly = toWindow('seven_day')
  const fiveHour = toWindow('five_hour')
  return weekly || fiveHour ? { weekly, fiveHour } : null
}

export function windowState(win, periodMs, now = Date.now()) {
  const resetMs = win.resetAt ? Date.parse(win.resetAt) : NaN
  const hasReset = Number.isFinite(resetMs)
  // A reading from before its reset describes a window that is gone.
  const remaining = !win.disabled && hasReset && resetMs <= now ? 100 : win.remaining
  const msToReset = hasReset ? Math.max(0, resetMs - now) : null
  // At 100% the window has not started; agy then reports a floating reset of now + period.
  const started = !win.disabled && remaining < 100 && msToReset !== null
  const elapsed = started ? Math.min(1, Math.max(0, 1 - msToReset / periodMs)) : 0
  return { ...win, remaining, started, msToReset, elapsed, used: 1 - remaining / 100 }
}

const FULL = { remaining: 100, resetAt: null, disabled: false }

export function assessPace(windows, now = Date.now(), limits = LIMITS) {
  if (!windows) return { mode: 'unknown', reason: 'No reading yet.', waitUntil: null, weekly: null, fiveHour: null, weeklyLead: 0 }
  const weekly = windowState(windows.weekly ?? FULL, PERIOD_MS.weekly, now)
  const fiveHour = windowState(windows.fiveHour ?? FULL, PERIOD_MS.fiveHour, now)
  const lead = weekly.elapsed - weekly.used // positive means under-used
  const result = (mode, reason, waitUntil = null) => ({
    mode,
    reason,
    waitUntil,
    weekly: windows.weekly ? weekly : null,
    fiveHour: windows.fiveHour ? fiveHour : null,
    weeklyLead: lead,
  })

  const blockers = []
  if (weekly.disabled || weekly.remaining <= limits.floorWeekly) blockers.push(weekly)
  if (fiveHour.disabled || fiveHour.remaining <= limits.floorFiveHour) blockers.push(fiveHour)
  if (blockers.length) {
    const waitUntil = blockers.map(w => w.resetAt).filter(Boolean).sort().at(-1) ?? null
    return result('blocked', 'Quota is at its safety floor.', waitUntil)
  }
  if (weekly.remaining < limits.conserveWeekly) return result('conserve', 'Weekly quota is low.')
  if (fiveHour.remaining < limits.conserveFiveHour) return result('conserve', 'Five-hour quota is low.')
  if (weekly.started && -lead > limits.overPace) return result('conserve', 'Weekly usage is ahead of pace.')

  const fiveHourExpiring =
    fiveHour.started &&
    fiveHour.msToReset <= limits.surplusFiveHourMinutes * 60e3 &&
    fiveHour.remaining >= limits.surplusFiveHourRemaining &&
    lead >= limits.surplusWeeklyLead
  if (fiveHourExpiring) return result('surplus', 'Five-hour quota will expire unused soon.')

  const weeklyExpiring =
    weekly.started &&
    weekly.msToReset <= limits.surplusWeeklyHours * 3600e3 &&
    weekly.remaining >= limits.surplusWeeklyRemaining &&
    fiveHour.remaining >= limits.conserveFiveHour
  if (weeklyExpiring) return result('surplus', 'Weekly quota will expire unused soon.')

  return result('normal', 'Quota is on pace.')
}

export function routeGemini(kind, size, pace) {
  const ladder = LADDERS[kind]
  if (!ladder) throw new Error(`Unknown kind "${kind}". Use: ${KINDS.join(', ')}`)
  if (!(size in BASE_RUNG)) throw new Error(`Unknown size "${size}". Use: s, m, l`)
  if (!(pace.mode in SHIFT)) return null
  return ladder[Math.min(ladder.length - 1, Math.max(0, BASE_RUNG[size] + SHIFT[pace.mode]))]
}

const usable = pace => pace.mode !== 'blocked' && pace.mode !== 'unknown'
// The provider each track suits when capacity does not decide. Gemini workers have no
// terminal, so code that should be run while it is written starts on Claude.
const TRACK_FIT = { mechanical: 'gemini', code: 'claude', design: 'gemini', review: 'gemini', hard: 'claude' }

function pickProvider(kind, claude, gemini) {
  // Claude has no image generation and no video or audio input, so quota cannot move this.
  if (kind === 'media') return ['gemini', usable(gemini) ? 'Claude cannot generate images or read video and audio.' : 'Needs Gemini, which is unavailable right now.']
  if (!usable(gemini)) return ['claude', gemini.mode === 'blocked' ? 'Gemini is at its limit.' : 'Gemini quota is unavailable.']
  if (claude.mode === 'blocked') return ['gemini', 'Claude is at its limit.']
  if (kind === 'hard') return ['claude', 'Hard judgment stays on Claude.']

  const belowReserve = (claude.fiveHour?.remaining ?? 100) < LIMITS.claudeReserveFiveHour
  const claudeLow = claude.mode === 'conserve' || belowReserve
  const geminiLow = gemini.mode === 'conserve'
  if (claudeLow && !geminiLow) {
    return ['gemini', belowReserve ? "Keeps Claude's five-hour reserve for orchestration and review." : 'Claude quota is low.']
  }
  if (geminiLow && !claudeLow) return ['claude', 'Gemini quota is low.']
  if (!claudeLow && claude.mode === 'surplus' && gemini.mode !== 'surplus') return ['claude', 'Claude quota would expire unused.']
  if (gemini.mode === 'surplus' && claude.mode !== 'surplus') return ['gemini', 'Gemini quota would expire unused.']
  return TRACK_FIT[kind] === 'claude'
    ? ['claude', 'Code that should be run stays on Claude.']
    : ['gemini', 'Saves Claude quota for orchestration and review.']
}

export function allocate(claude, gemini) {
  const tracks = {}
  for (const kind of KINDS) {
    const [provider, reason] = pickProvider(kind, claude, gemini)
    tracks[kind] = { provider, reason }
  }
  // Gemini workers run without a terminal, so anything that must execute stays on Claude.
  tracks.test = { provider: 'claude', reason: 'Testing needs a terminal, which Gemini workers do not have.' }
  return tracks
}

const view = w => (w ? { remainingPct: w.disabled ? 0 : Math.round(w.remaining * 10) / 10, resetsAt: w.started ? w.resetAt : null, isDisabled: w.disabled } : null)

const paceView = pace => ({
  mode: pace.mode,
  reason: pace.reason,
  waitUntil: pace.waitUntil,
  fiveHour: view(pace.fiveHour),
  weekly: view(pace.weekly),
})

export function buildReport({ rateLimits, gemini, now = Date.now() }) {
  const claudePace = assessPace(claudeWindows(rateLimits), now)
  let geminiPace = assessPace(gemini?.windows ?? null, now)
  const isStale = Boolean(gemini?.windows && gemini.asOf && now - gemini.asOf > STALE_MS)
  if (gemini?.error && !gemini.windows) geminiPace = { ...geminiPace, reason: gemini.error }
  const routable = isStale ? { ...geminiPace, mode: 'unknown', reason: 'The Gemini reading is out of date.' } : geminiPace

  const recommendations = {}
  for (const kind of KINDS) {
    recommendations[kind] = Object.fromEntries(SIZES.map(size => [size, routeGemini(kind, size, routable)]))
  }
  return {
    checkedAt: new Date(now).toISOString(),
    claude: paceView(claudePace),
    gemini: { ...paceView(routable), asOf: gemini?.asOf ? new Date(gemini.asOf).toISOString() : null, isStale, recommendations },
    tracks: allocate(claudePace, routable),
  }
}
