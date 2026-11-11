import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRun, Flow, Panel, Phase, PlannedTask } from '../types'

const flow = atom({ plugin: 'savvy-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, [])
const panel = atom({ plugin: 'savvy-progress', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
const now = atom({ plugin: 'savvy-progress', key: 'now' } as const, 0)

const TOOL = 'mcp__savvy-progress__progress'
const STEP_TOOL = 'mcp__savvy-progress__step'
// Added to the end of each savvy worker's brief. Their system prompt words step
// reporting as a condition ("if the step tool appears among your tools") and they
// skip it even with the tool listed; the same request in the brief is followed.
const STEP_BRIEF = `

Progress reporting: before any other work, call \`${STEP_TOOL}\` with \`total\` (your plan in 3-8 steps) and \`done: 0\`; call it again with \`done\` and a few-word \`note\` as each step finishes. It only draws a progress bar.`
const PANE = 'savvy-agents'
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
const TIERS: readonly string[] = ['fable', 'heavy', 'careful', 'medium', 'light']
// The tools' schemas are advice to the model, not a check: what a call may ask
// the band and the panel to draw is bounded here.
const MAX_TASKS = 200
const MAX_AFTER = 20
const MAX_TITLE = 120
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Hebrew or Russian.

type Lang = 'en' | 'ru' | 'he'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    ctx: 'ctx',
    session: 'session',
    cantOpen: 'Open it from the sidebar: the app would not switch to it from here.',
    subagent: 'subagent',
    needsYou: 'needs you',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    ctx: 'ctx',
    session: 'сессия',
    cantOpen: 'Откройте её в боковой панели: приложение не переключилось на неё отсюда.',
    subagent: 'субагент',
    needsYou: 'ждёт вас',
    tier: { light: 'light', medium: 'medium', careful: 'careful', heavy: 'heavy', fable: 'fable', other: 'other' },
    effort: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
  },
  he: {
    pane: 'סוכנים',
    cost: 'עלות',
    tokens: 'טוקנים',
    time: 'זמן',
    collapse: 'כיווץ',
    expand: 'הרחבה',
    running: 'פועלים',
    finished: 'הסתיימו',
    planned: 'מתוכננים',
    empty: 'עדיין אין סוכנים.',
    round: 'סבב',
    failed: 'שגיאה',
    after: 'אחרי',
    tokensWord: 'טוקנים',
    agentsCount: 'סוכנים',
    isRunning: 'פועל',
    isFinished: 'הסתיים',
    isPlanned: 'מתוכנן',
    opened: 'חלונית הסוכנים נפתחה.',
    closed: 'חלונית הסוכנים נסגרה.',
    done: 'הושלם',
    plan: 'תכנון',
    design: 'עיצוב',
    tasks: 'משימות',
    review: 'בדיקה',
    busy: 'בעבודה',
    ctx: 'הקשר',
    session: 'סשן',
    cantOpen: 'פתחו אותו מהסרגל הצדדי: האפליקציה לא עברה אליו מכאן.',
    subagent: 'תת־סוכן',
    needsYou: 'ממתין לך',
    tier: { light: 'קל', medium: 'בינוני', careful: 'זהיר', heavy: 'כבד', fable: 'פייבל', other: 'אחר' },
    effort: { low: 'נמוך', medium: 'בינוני', high: 'גבוה', xhigh: 'גבוה מאוד', max: 'מקסימלי' },
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

// Hebrew draws every row mirrored: crab and title on the right, numbers on the left.
const isRtl = () => lang === 'he'

// Tier and effort words as shown; anything unknown shows as it came.
const tierWord = (tier: string): string => (tr().tier as Record<string, string>)[tier] ?? tier
const effortWord = (effort: string): string => (tr().effort as Record<string, string>)[effort] ?? effort

const isRussian = (v: unknown): boolean => typeof v === 'string' && /^(ru|russian|рус)/i.test(v.trim())
const isHebrew = (v: unknown): boolean => typeof v === 'string' && /^(he|iw|hebrew|עברית)/i.test(v.trim())
const langOf = (v: unknown): Lang => (isHebrew(v) ? 'he' : isRussian(v) ? 'ru' : 'en')

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ru' || option === 'he') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language)
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale)
}

const blank = (): Flow => ({
  title: 'savvy-flow',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && clip(input.title.trim(), MAX_TITLE) !== prev.title)

// Only a known tier is kept: the name is later a key into the tier tables.
const tierName = (v: string): string => {
  const t = v.replace(/^savvy-/, '').trim().toLowerCase()
  return TIERS.includes(t) ? t : ''
}

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .slice(0, MAX_TASKS)
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: tierName(t.tier ?? ''),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_AFTER),
    }))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const total = Math.min(MAX_TASKS, Math.max(0, Math.round(input.total ?? (input.tasks ? tasks.length : base.total))))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  return {
    ...base,
    title: clip(input.title?.trim() || base.title, MAX_TITLE),
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
  }
}

const label = (f: Flow): string => {
  const s = tr()
  if (f.isFinished) return s.done
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The whole row is one SVG: the desktop wraps sibling elements onto new lines,
// so title, bar, percent and the crab live in one drawing; only the count and
// the dismiss are Buttons beside it.
const H = 22
const BAR_H = 16
const CRAB_W = 26
// The crab's drawing grid is 30 units wide, props included.
const CRAB_BOX = 30
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// CJK, fullwidth forms and emoji advance about 1em; at 0.56em a Chinese title was sized at half its width and the bar drew over it.
// 中日韩文字、全角标点和 emoji 约占 1em；按 0.56em 算时中文标题宽度被低估近一半，进度条会压到标题上。
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF01-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  WIDE.test(ch) ? 1 : /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const rowSvg = (f: Flow, W: number, isWorking: boolean): string => {
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46 - CRAB_W)
  const color = f.isFinished ? DONE : ACCENT
  const y0 = (H - BAR_H) / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + f.running)) / f.total) : 0
  const dots: string[] = []
  // Positions are worked out left to right; right to left mirrors each box
  // inside the bar (`bx`) and across the row (`rx`). Text is never mirrored.
  const rtl = isRtl()
  const bx = (x: number, w: number): number => (rtl ? BAR_W - x - w : x)
  const rx = (x: number, w: number): number => (rtl ? W - x - w : x)

  // Dithered fill: sparse at the start, dense toward the head.
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) dots.push(`<rect class="t${Math.floor(noise(r, c) * 4)}" x="${bx(c * CELL + 1, 2)}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${bx(c * CELL + 1, 1.7)}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${bx(x, 1.5)}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }

  const text = label(f)
  const pillW = Math.round(18 + text.length * 6.6)
  const pillX = bx(Math.max(0, Math.min(BAR_W - pillW, fillW - pillW)), pillW)
  const percent = `${Math.round(ratio(f) * 100)}%`
  // `direction="rtl"` puts Hebrew words and numbers in reading order; `start` is then the right edge.
  const titleAt = rtl ? `x="${W - 16}" direction="rtl" text-anchor="start"` : 'x="16"'
  const percentAt = rtl ? `x="${CRAB_W + 6}" y="${H / 2 + 4.5}"` : `x="${W - CRAB_W - 6}" y="${H / 2 + 4.5}" text-anchor="end"`
  const crabW = CRAB_BOX * 0.8

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#8a8a8a}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
/* Pixels twinkle in four out-of-phase groups; a finished bar settles to a slow glow. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="${rtl ? W - 5 : 5}" cy="${H / 2}" r="4" fill="${color}"/>
<text class="t" ${titleAt} y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${rx(BAR_X, BAR_W)},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
<g fill="${color}">${dots.join('')}</g>
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
</g>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle"${rtl ? ' direction="rtl"' : ''} font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(text)}</text>
</g>
<text class="m" ${percentAt} font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${CRAB_CSS}${crab(rx(W - CRAB_W + 1, crabW), 0, 'plain', false, isWorking, 0.8, rtl)}
</svg>`
}

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  swarm: '#C8A24A',
  tester: '#A8323E',
  other: '#888780',
}

// What each savvy tier runs on, for planned tasks that have no run yet.
const colorOf = (tier: string): string => TIER_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, [model: string, effort: string]> = {
  fable: ['Fable', 'high'],
  heavy: ['Opus', 'xhigh'],
  careful: ['Opus', 'high'],
  medium: ['Opus', 'medium'],
  light: ['Opus', 'low'],
  swarm: ['Sonnet', 'medium'],
  tester: ['Sonnet', 'medium'],
}

// "Opus · xhigh", with the effort word in the panel's language; '' for an unknown tier.
const tierModel = (tier: string): string => {
  const m = TIER_MODEL[tier]
  return m ? `${m[0]} · ${effortWord(m[1])}` : ''
}

// "Opus 5.5 · low" for a run, or just the model when no effort was seen.
const runModel = (a: AgentRun): string =>
  (a.effort ? `${modelName(a.model)} · ${effortWord(a.effort)}` : modelName(a.model)) + (a.isApi ? ' · API' : '')

// USD per million tokens: input, output, cache read, cache write. The first row that
// matches a model id wins, so a release sits above its family.
// The engine reports tokens, not money, so the panel's cost is an estimate. It reports
// one cache-write count with no split by lifetime; writes are priced at the 1-hour
// rate (2x input), which is what Claude Code writes on a subscription.
type Price = [input: number, output: number, cacheRead: number, cacheWrite: number]

const PRICES: [RegExp, Price][] = [
  [/(fable|mythos)-5-1/, [10, 50, 0.25, 20]],
  [/fable|mythos/, [10, 50, 1, 20]],
  [/opus-5-5/, [4, 20, 0.2, 8]],
  [/opus/, [5, 25, 0.5, 10]],
  [/sonnet-5-5/, [2, 10, 0.1, 4]],
  [/sonnet-5/, [2, 10, 0.2, 4]],
  [/sonnet/, [3, 15, 0.3, 6]],
  [/haiku-5-5/, [0.1, 0.5, 0.01, 0.2]],
  [/haiku/, [1, 5, 0.1, 2]],
]

// Haiku 5.5 is priced by prompt length: a request whose prompt (input, cache reads and
// cache writes together) is over 100,000 tokens pays these prices instead.
const HAIKU_LONG_PROMPT = 100_000
const HAIKU_LONG: Price = [0.5, 2.5, 0.05, 1]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string, prompt: number): Price => {
  const id = model.toLowerCase()
  if (prompt > HAIKU_LONG_PROMPT && /haiku-5-5/.test(id)) return HAIKU_LONG
  return PRICES.find(([re]) => re.test(id))?.[1] ?? [4, 20, 0.2, 8]
}

// `isRequest` says the usage is one model request, which is what a prompt-length price
// is set by; a turn's sum is priced at the model's ordinary prices.
const costOf = (model: string, u: Usage, isRequest: boolean): number => {
  const prompt = isRequest ? (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) : 0
  const [i, o, r, w] = priceOf(model, prompt)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

// Haiku 4.5 and the Claude 3 models have a 200K window; the rest, Haiku 5.5 included, 1M.
const windowOf = (model: string): number => (/haiku-4|claude-3/i.test(model) ? 200_000 : 1_000_000)

// `savvy-careful`, or `savvy-flow:savvy-careful` when the agents ship in a plugin.
const tierOf = (type: string): string => {
  const bare = type.replace(/^[^:]*:/, '')
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  return Object.hasOwn(TIER_COLOR, t) && bare.startsWith('savvy-') ? t : 'other'
}

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

// What the bar draws: the flow as reported, corrected by the workers the panel sees.
// `running` is counted from the list, not from Agent calls in flight: a background
// worker's call returns at once, which left the bar at "0 running" while it worked.
// With no plan reported, the total is every worker seen plus planned ones not started.
const view = (f: Flow, list: AgentRun[]): Flow => {
  if (f.isFinished) return f
  const running = list.filter(a => a.status === 'running').length
  const phase = f.phase === 'plan' && running > 0 ? 'delegate' : f.phase
  if (f.total > 0) return { ...f, running, phase }
  const total = Math.min(MAX_TASKS, list.length + plannedOf(f, list).length)
  const done = list.filter(a => a.status === 'done').length
  return { ...f, running, phase, total, done }
}

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, time: list.length ? end - start : 0 }
}

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

// The pane's backdrop: a dotted grid as tall as the content laid over it; the
// row SVGs are transparent, so it shows through between their marks.
const GRID_STEP = 16
// A Text or Button row on the desktop is about 20px; the grid errs taller.
const LINE_H = 24
// The engine refuses an Svg taller than 4096px, so a long grid is stacked from
// tiles of at most this height; a multiple of GRID_STEP keeps the dots aligned.
const GRID_TILE = 4096
const gridTiles = (H: number) => Array.from({ length: Math.ceil(H / GRID_TILE) }, (_, i) => Math.min(GRID_TILE, H - i * GRID_TILE))
const gridSvg = (W: number, H: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.d{fill:#d9d8d4}@media (prefers-color-scheme: dark){.d{fill:#3a3a38}}</style>
<defs><pattern id="g" width="${GRID_STEP}" height="${GRID_STEP}" patternUnits="userSpaceOnUse"><circle class="d" cx="${GRID_STEP / 2}" cy="${GRID_STEP / 2}" r="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one Diablo 2 class per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}@keyframes blink{50%{opacity:.15}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .orb{animation:glow 1s ease-in-out infinite}
.c-fable.run .spk{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes glow{50%{opacity:.4}}
.c-heavy.run .it{transform-origin:30% 100%;animation:sway 1s ease-in-out infinite}
@keyframes sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
.c-careful.run .it{transform-origin:50% 100%;animation:slash .5s ease-in-out infinite}
@keyframes slash{50%{transform:rotate(30deg)}}
.c-medium.run .axe{transform-origin:50% 100%;animation:chop 1s ease-in-out infinite}
@keyframes chop{40%{transform:rotate(-35deg)}55%{transform:rotate(10deg)}70%{transform:rotate(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:100% 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(12deg) scaleX(.85)}}
.c-explore.run .it{transform-origin:70% 50%;animation:draw .5s ease-in-out infinite}
.c-explore.run .pony{transform-origin:100% 0;animation:swing .5s ease-in-out infinite}
@keyframes draw{50%{transform:rotate(-10deg)}}@keyframes swing{50%{transform:rotate(12deg)}}
.c-swarm.run .it{animation:thrust .5s ease-in-out infinite}
@keyframes thrust{50%{transform:translateY(-2px)}}
.c-tester.run .it{transform-origin:50% 100%;animation:tap 1s steps(1) infinite}
.c-tester.run .id{animation:blink 1s steps(1) infinite -.5s}
@keyframes tap{50%{transform:translateY(-1px)}}
.c-other.run .gl{animation:blink 1s steps(1) infinite}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

const COSTUMES: Record<string, (f: Fill, t: string) => void> = {
  // Fable: Sorceress in a bent wizard hat; floats instead of walking, the staff's orb
  // pulses and a sparkle blinks.
  fable: (f, t) => {
    f(26, 4, 1, 21, '#7A4A26'); f(26, 23, 1, 2, '#5A3519')
    crabBody(f, -4)
    stamp(
      f,
      4,
      0,
      [
        '.......pppp',
        '.....ppp.hpp',
        '....pp...hppp',
        '........hhpppd',
        '.......hhppspdd',
        '.......hhpsssdd',
        '......hhpppsppdd',
        '.....aaaaaaaaaaaa',
        '.....hhppppppppdd',
        'dppppppppppppppppppppd',
      ],
      { p: '#4A2C86', h: '#6A48B0', d: '#2F1A5C', s: '#F5C542', a: t },
    )
    f(25, 1, 3, 3, t, 'orb'); f(25, 1, 1, 1, '#fff', 'orb')
    stamp(f, 27, 5, ['.s.', 'sss', '.s.'], { s: '#F5C542' }, 'spk')
  },
  // Heavy: Druid in a wolf-pelt hood with antlers; the leafy staff sways.
  heavy: (f, t) => {
    crabBody(f)
    stamp(
      f,
      5,
      0,
      [
        '....b.b......b.b....',
        '....bbb......bbb....',
        '.g...b........b...g.',
        '.gg..b........b..gg.',
        '.gng.B........B.gng.',
        'ggnngBggggggggBgnngg',
        'gglgggglggggglggglgg',
        'gGgggGggggGgggggGggg',
        'GefeefeefaafeefeefeG',
        'gGGGGGGGGGGGGGGGGGGg',
        'gG................Gg',
        'gG................Gg',
        '.g................g.',
        '.g................g.',
      ],
      { g: '#7D6B58', G: '#5A4B3C', l: '#9E8B74', n: '#3F3128', b: '#EADFC4', B: '#C9B48A', e: '#3E8A3A', f: '#78C04E', a: t },
    )
    stamp(f, 24, 1, ['.f.f.', 'fefef', '.eWe.', 'f.W.f', '..W..'], { e: '#3E8A3A', f: '#78C04E', W: '#7A4A26' }, 'it')
    f(26, 6, 1, 5, '#7A4A26', 'it'); f(27, 10, 1, 4, '#7A4A26', 'it'); f(26, 13, 1, 9, '#7A4A26', 'it'); f(25, 21, 1, 4, '#7A4A26', 'it')
    f(26, 8, 1, 1, '#5A3519', 'it'); f(27, 11, 1, 1, '#5A3519', 'it'); f(26, 18, 1, 1, '#5A3519', 'it')
  },
  // Careful: Paladin in a great helm behind a kite shield; the sword swings.
  careful: (f, t) => {
    crabBody(f, -4)
    stamp(f, 8, 0, ['.....aaaa', '...aaaaaaa', '.aaaa.aaa', 'aa....gg'], { a: t, g: '#E0B23A' })
    stamp(
      f,
      6,
      4,
      [
        '....MLWWLLLLLM....',
        '..MLWLLLLLLLLLMD..',
        '.MLWLLLLLLLLLLLMD.',
        '.MLWLLLLMMLLLLLMD.',
        '.MLWLLLLMMLLLLLMD.',
        '.MLWLLLLMMLLLLLMD.',
        '.MLWLLLLMMLLLLLMD.',
        '.MLWLLLLMMLLLLLMD.',
        '.MKKKKKKMMKKKKKKD.',
        '.MKKKKKKMMKKKKKKD.',
        'DMMMMMMMMMMMMMMMMD',
      ],
      { W: '#F4F6F9', L: '#C8CDD6', M: '#8C939F', D: '#5B626E', K: '#16181C' },
    )
    stamp(
      f,
      0,
      10,
      ['MMMMMMM', 'MwwawwM', 'MwwawwM', 'MaaaaaM', 'MwwawwM', 'MwwawwM', '.MwawM.', '.MwawM.', '..MaM..', '..MMM..', '...M...'],
      { M: '#8C939F', w: '#FAFAF7', a: t },
    )
    stamp(f, 23, 0, ['..e...', '..es..', '..es..', '..es..', '..es..', '..es..', '..es..', 'gggggg', '..hh..', '..hh..'], { e: '#F4F6F9', s: '#A3ABB7', g: '#E0B23A', h: '#5A3519' }, 'it')
  },
  // Medium: Barbarian in a horned iron helm; the double axe chops.
  medium: (f, t) => {
    crabBody(f, -4)
    stamp(
      f,
      6,
      4,
      [
        '.....Iiiaaiik.....',
        '...IIiiiaaiiiik...',
        '..IIiiiiaaiiiiik..',
        '..IIiiiiaaiiiiik..',
        '..IIiiiiaaiiiiik..',
        '.krkkkkrkkrkkkkrk.',
        'uUuuUuuuUuuUuuuUuu',
        'U.u..U...u..U..u.U',
      ],
      { i: '#4A4E55', I: '#6F757E', k: '#2E3136', r: '#9AA0A8', a: t, u: '#7A5230', U: '#5C3C22' },
    )
    const horn = { v: '#EFE6CF', V: '#CDBF9E' }
    stamp(f, 3, 5, ['v....', 'vV...', '.vvV.', '..vvV'], horn)
    stamp(f, 22, 5, ['....v', '...Vv', '.Vvv.', 'Vvv..'], horn)
    f(27, 0, 1, 15, '#7A4A26', 'axe')
    stamp(f, 25, 0, ['E.h.E', 'EsdsE', 'EsdsE', 'E.h.E'], { E: '#E6EAF0', s: '#A9B0BA', d: '#6E7680', h: '#7A4A26' }, 'axe')
  },
  // Light: Assassin in a hood and mask; runs at double pace, the sash flutters, katar ready.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(
      f,
      6,
      3,
      [
        '.......PPPP',
        '.....RPPPPPPQ',
        '...RRPPPPPPPPPQ',
        '..RPPPPPPPPPPPPQ',
        '.RPPPPPPPPPPPPPPQ',
        'RPPPPPPPPPPPPPPPQ',
        'RPPPPPPPPPPPPPPPQ',
        'QPPPPPPPPPPPPPPPQ',
        'QQQQQQQQQQQQQQQQQ',
        'Q',
        'Q',
        'QCCCCCCCCCCCCCCCC',
        'QCCCCCCCCCCCCCCCC',
      ],
      { P: '#4A2B52', R: '#64407A', Q: '#2E1A35', C: '#3B3346' },
    )
    f(6, 10, 1, 2, t)
    stamp(f, 0, 9, ['..aaaa', 'aaaaaa', 'aa.aa.', 'a.....'], { a: t }, 'flag')
    f(23, 9, 5, 1, '#6E7680')
    f(23, 6, 1, 3, '#DDE2E8'); f(25, 3, 1, 6, '#DDE2E8'); f(27, 6, 1, 3, '#DDE2E8')
  },
  // Swarm: Desert Mercenary from Lut Gholein in a sand turban; hired by the
  // dozen, the spear thrusts.
  swarm: (f, t) => {
    crabBody(f, -4)
    stamp(
      f,
      7,
      4,
      [
        '.....ttttt.....',
        '...tttTTtttt...',
        '..tTTttttTTtt..',
        '.ttttTTttttTTt.',
        '.TTttttaaatttTT',
        'ttttttttttttttt',
      ],
      { t: '#E3D3AE', T: '#BFA97A', a: t },
    )
    stamp(f, 7, 14, ['rrrrrrrrrrrrrrrr', 'RRRRRRRRRRRRRRRR'], { r: '#2F7F86', R: '#1F5A60' })
    stamp(f, 26, 0, ['.e.', 'eEe', 'eEe', '.E.'], { e: '#E6EAF0', E: '#A9B0BA' }, 'it')
    f(27, 4, 1, 21, '#7A4A26', 'it'); f(26, 6, 3, 1, t, 'it')
  },
  // Tester: Deckard Cain, bald with a white beard and a crimson stole; the cane
  // taps and the Identify scroll glows while he inspects.
  tester: (f, t) => {
    crabBody(f, -4)
    stamp(
      f,
      7,
      5,
      [
        '.....sssss.....',
        '...sssssssss...',
        '..gsssssssssg..',
        '.ggssssssssssg.',
        'gggrrrrrrrrrggg',
      ],
      { s: '#E8C9A0', g: '#C9C6BF', r: '#8E2433' },
    )
    stamp(
      f,
      7,
      10,
      [
        'rr............rr',
        'rr............rr',
        'rr............rr',
        'Rr............rR',
        'RrwwwwwwwwwwwwrR',
        'R..wwWwwwwWww..R',
        'R...wwwwwwww...R',
        '.....wwWWww.....',
        '......wwww......',
        '.......ww.......',
      ],
      { r: '#8E2433', R: '#5E1620', w: '#F2EFE8', W: '#C9C6BF' },
    )
    stamp(f, 0, 11, ['pppp', 'paap', 'pppp', 'paap', 'pppp'], { p: '#E9DCB5', a: t }, 'id')
    stamp(f, 25, 3, ['WWW', 'W.W', '..W'], { W: '#7A4A26' }, 'it')
    f(27, 6, 1, 19, '#7A4A26', 'it'); f(27, 12, 1, 1, '#5A3519', 'it'); f(27, 19, 1, 1, '#5A3519', 'it')
  },
  // Explore: Amazon with a swinging ponytail; the recurve bow tilts as she draws.
  explore: (f, t) => {
    crabBody(f)
    stamp(
      f,
      6,
      5,
      [
        '....hyyyyyyyyY....',
        '..hhyyyyyyyyyyyY..',
        '.hyyyyyyyyyyyyyyY.',
        '.GGGGGGGaaGGGGGGG.',
        '.yyyyyyyyyyyyyyyy.',
        '.yYy.y......y.yYy.',
        '.Y..............Y.',
      ],
      { y: '#EBC45C', Y: '#C99B34', h: '#F6DC8C', G: '#3C8C40', a: t },
    )
    stamp(f, 1, 7, ['...yyG', '..yyy.', '.yyY..', '.yY...', 'yY....', 'y.....'], { y: '#EBC45C', Y: '#C99B34', G: '#3C8C40' }, 'pony')
    const bow = { b: '#8A5A2B', B: '#5E3A1A', s: '#CFC6B2' }
    stamp(
      f,
      24,
      4,
      [
        '.b...',
        'b....',
        'sb...',
        'sb...',
        's.b..',
        's.b..',
        's.b..',
        's..b.',
        's..b.',
        's..b.',
        's..BB',
        's..BB',
        's..BB',
        's..b.',
        's..b.',
        's..b.',
        's.b..',
        's.b..',
        's.b..',
        'sb...',
        'sb...',
        'b....',
        '.b...',
      ],
      bow,
      'it',
    )
  },
  // Other agents: Necromancer in a bone circlet and cowl; the skull wand's glow blinks.
  other: (f, t) => {
    crabBody(f, -4)
    stamp(
      f,
      6,
      4,
      [
        '.....CccccccC',
        '...CccccwwccccC',
        '..CwccwcwwcwccwC',
        '.CcwccwcwwcwccwcC',
        '.wwwwwwwaawwwwwww',
        'CcccccccccccccccC',
        'Ccc............cC',
        'Cc',
        'C',
      ],
      { c: '#1F2B23', C: '#3E5A47', w: '#E9E4D6', a: t },
    )
    f(26, 5, 1, 7, '#5A4636')
    stamp(f, 25, 2, ['www', 'kwk', '.w.'], { w: '#E9E4D6', k: '#1F2B23' })
    f(26, 1, 1, 1, '#39E36B', 'gl')
  },
  // The progress band's mascot stays undressed.
  plain: f => crabBody(f),
}

// Explore and other agents have no tier color; their costumes get their own accent.
const COSTUME_COLOR: Record<string, string> = { explore: '#C2477A', other: '#2AA5B5' }

const costumeOf = (type: string): string => (type === 'Explore' ? 'explore' : tierOf(type))

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own. `mirror` flips the crab inside its
// own box (x .. x + CRAB_BOX * scale) so it faces left.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE, mirror = false): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const draw = COSTUMES[costume] ?? ((g: Fill) => crabBody(g))
  draw(f, COSTUME_COLOR[costume] ?? colorOf(costume))
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  const place = mirror ? `translate(${x + CRAB_BOX * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  return `<g transform="${place}" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${costume}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}</g></g>`
}

const HAND = '#E0A030'

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'waiting') return `<circle class="live" cx="${x}" cy="${y}" r="4.5" fill="${HAND}"/>`
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

// Panel rows are laid out left to right; in Hebrew each box mirrors across the
// row (`mx`) and text hugs the mirrored side. `words` text may hold Hebrew and
// takes `direction="rtl"` (whose `start` is the right edge); numbers stay
// left to right so "≈$0.25" keeps its order.
const mx = (W: number, x: number, w = 0): number => (isRtl() ? W - x - w : x)

// Text that starts at x: left-aligned, or right-aligned at the mirrored x.
const startText = (W: number, x: number, y: number, words = true): string =>
  !isRtl()
    ? `x="${x}" y="${y}"`
    : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="start"' : ' text-anchor="end"'}`

// Text that ends at x: right-aligned, or left-aligned at the mirrored x.
const endText = (W: number, x: number, y: number, words = false): string =>
  !isRtl() ? `x="${x}" y="${y}" text-anchor="end"` : `x="${W - x}" y="${y}"${words ? ' direction="rtl" text-anchor="end"' : ''}`

const crabWidth = (scale: number): number => Math.round(CRAB_BOX * scale * 100) / 100

// A panel crab at x in a row of width W: on the mirrored side and facing left in Hebrew.
const rowCrab = (W: number, x: number, y: number, costume: string, dim = false, isWalking = false): string =>
  crab(mx(W, x, crabWidth(CRAB_SCALE)), y, costume, dim, isWalking, CRAB_SCALE, isRtl())

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CRAB_CSS}${body}</svg>`

// The pane's own title already says "Agents": the header names the flow, if any.
const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>): string => {
  const s = tr()
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = title ? 28 : 0
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${mx(W, i * (tw + gap), tw)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" ${startText(W, i * (tw + gap) + 9, top + 16)} font-family="${FONT}" font-size="11">${k}</text>
<text class="t" ${startText(W, i * (tw + gap) + 9, top + 33, false)} font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    headerHeight(title),
    `${title ? `<text class="t" ${startText(W, 0, 15)} font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W))}</text>` : ''}
${tile(0, s.cost, '≈' + fmtCost(t.cost))}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const headerHeight = (title: string): number => (title ? 72 : 44)

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

// A worker row's drawing. The title is not in it: the pane draws the title above it as
// a link or a button, since the desktop draws an Svg as an image that takes no click.
const ROW_H = 52

const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const s = tr()
  const tier = tierOf(a.type)
  const color = colorOf(tier)
  const ctx = ctxOf(a)
  const textW = W - 42 - 22
  const meta = [a.kind === 'session' ? s.session : s.subagent, runModel(a)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  const barW = textW
  const progress = progressOf(a)
  const stats = `${s.ctx} ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  const steps = a.isWaiting
    ? `✋ ${s.needsYou}${a.waitReason ? ': ' + a.waitReason : ''}`
    : a.stepTotal
      ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}`
      : a.stepNote ?? ''
  const stepsW = Math.max(0, barW - textWidth(stats, 11) - 12)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fillW = Math.round(barW * (progress ?? ctx / 100))
  return svg(
    W,
    ROW_H,
    `${rowCrab(W, 0, 10, costumeOf(a.type), false, a.status === 'running' && !a.isWaiting)}${a.isWaiting ? raisedHand(W) : ''}
<text ${startText(W, 42, 18)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tierWord(tier))}</tspan><tspan class="s">  ${xml(meta.join('  ·  '))}</tspan></text>
${steps && stepsW > 30 ? `<text class="t" ${startText(W, 42, 33)}${a.isWaiting ? ` fill="${HAND}" font-weight="600"` : ''} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(steps, 11, stepsW))}</text>` : ''}
<text class="s" ${endText(W, 42 + barW, 33, true)} font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="${mx(W, 42, barW)}" y="40" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="${mx(W, 42, fillW)}" y="40" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${color}"`}/>
${statusMark(mx(W, W - 8), 14, a.isWaiting ? 'waiting' : a.status, color)}
<line class="ln" x1="0" y1="${ROW_H - 0.5}" x2="${W}" y2="${ROW_H - 0.5}"/>`,
  )
}

// The worker's hand goes up over its hero while it waits for the person; it waves
// unless the person asked for reduced motion.
const raisedHand = (W: number): string =>
  `<style>@keyframes savvy-wave{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}.hand{transform-box:fill-box;transform-origin:50% 100%;animation:savvy-wave .9s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.hand{animation:none}}</style><text class="hand" ${startText(W, 22, 14, false)} font-size="15">✋</text>`

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const textW = W - 42 - 22
  const meta = [tierModel(tier)]
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${rowCrab(W, 0, 6, tier, true)}
<text class="s" ${startText(W, 42, 18)} font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text ${startText(W, 42, 34)} font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tierWord(tier))}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(mx(W, W - 8), 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    ...list.filter(a => a.status === 'running').map(a => ({ k: costumeOf(a.type), c: a.isWaiting ? HAND : colorOf(tierOf(a.type)), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(tierOf(a.type)), s: a.status, dim: false })),
    ...planned.map(p => ({ k: p.tier in TIER_COLOR ? p.tier : 'other', c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = icons.slice(0, fit)
  const more = icons.length - shown.length
  const body = shown
    .map((ic, i) => rowCrab(W, i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${mx(W, i * 36 + 32)}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" ${startText(W, x, 21, false)} font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" ${endText(W, W, 21)} font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
  return true
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  void $.ui.open({ id: PANE, title: tr().pane })
}

// Headless `claude -p` workers run by the savvy-api skill on API credit: they are
// outside this session, so their runner keeps a JSON file per run and the panel
// reads them as rows of their own.
const API_DIR = '.claude/api-workers'
const API_STALE_MS = 15 * 60 * 1000
const apiSeen = new Map<string, number>()

async function syncApiWorkers($: EngineInterface): Promise<void> {
  if (!(await $.fs.exists(API_DIR).catch(() => false))) return
  const entries = await $.fs.list(API_DIR).catch(() => [])
  const changed: AgentRun[] = []
  const at = await $.clock.now()
  for (const ent of entries) {
    if (ent.kind !== 'file' || !ent.name.endsWith('.json')) continue
    if (apiSeen.get(ent.name) === ent.mtimeMs) continue
    let w: Record<string, unknown>
    try {
      w = JSON.parse(String(await $.fs.read(`${API_DIR}/${ent.name}`)))
    } catch {
      continue // mid-write or not ours; the next tick reads it again
    }
    apiSeen.set(ent.name, ent.mtimeMs)
    const model = String(w.model ?? 'opus')
    const isStale = w.status === 'running' && at - Number(w.updatedAt ?? at) > API_STALE_MS
    changed.push({
      id: `api:${String(w.id)}`,
      type: String(w.type ?? 'savvy-medium'),
      description: String(w.description ?? '').slice(0, MAX_TITLE),
      model,
      effort: typeof w.effort === 'string' ? w.effort : undefined,
      status: isStale ? 'failed' : w.status === 'done' ? 'done' : w.status === 'failed' ? 'failed' : 'running',
      startedAt: Number(w.startedAt ?? at),
      endedAt: w.endedAt ? Number(w.endedAt) : isStale ? Number(w.updatedAt) : undefined,
      contextTokens: Number(w.contextTokens ?? 0),
      contextMax: windowOf(model),
      tokens: Number(w.tokens ?? 0),
      costUsd: Number(w.costUsd ?? 0),
      steps: Number(w.steps ?? 0),
      round: 1,
      stepNote: typeof w.stepNote === 'string' ? w.stepNote.slice(0, MAX_TITLE) : undefined,
      isApi: true,
    })
  }
  if (!changed.length) return
  const ids = new Set(changed.map(a => a.id))
  const isNew = changed.some(a => a.status === 'running')
  await update($, agents, list => [...list.filter(a => !ids.has(a.id)), ...changed].slice(-200))
  await update($, now, () => at)
  if (isNew) {
    const f = await read($, flow)
    await autoOpen($, f && !f.isFinished ? f.title : 'savvy-flow')
  }
}

// ---------------------------------------------------------------------------
// Side sessions (docs/SESSION-MODE.md). Every desktop session writes its own state
// to a file named after its app id (`local_…`, from CLAUDE_CODE_HOST_SESSION_ID);
// a session that started others with start_session reads theirs and draws them as
// workers. One file per session, so concurrent writers never overwrite each other.

type SessionState = 'running' | 'waiting' | 'idle'

type SessionStatus = {
  hostId: string
  state: SessionState
  reason?: string
  model?: string
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** The session that started this one, and the key its brief carried. */
  parentId?: string
  parentKey?: string
  updatedAt: number
}

// What the orchestrator kept of a brief it sent, under the key the brief carries.
type Brief = { title: string; model?: string; effort?: string }

const START_TOOL = 'mcp__ccd_session__start_session'
// Added to every brief this session sends: the side session reads its parent from it,
// whether it starts now, from a card the person clicks, or from "start it".
const PARENT_LINE = /\(savvy-progress: parent (local_[0-9a-f-]{36}) key ([a-z0-9]{4,16})\)/
const parentLine = (key: string): string => `\n\n(savvy-progress: parent ${hostId} key ${key})`
const HOST_ID = /local_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
// A running session rewrites its file at least this often, so a reader can tell it is alive.
const HEARTBEAT_MS = 5 * 60 * 1000

let relayDir = ''
let hostId = ''
let mine: Omit<SessionStatus, 'hostId' | 'updatedAt'> = { state: 'idle' }
let written = ''
let writtenAt = 0
const sessionSeen = new Map<string, number>()
// Status files of other sessions already read for a parent, by their mtime.
const seenFiles = new Map<string, number>()
let briefCount = 0

async function relayFolder($: EngineInterface): Promise<string> {
  if (relayDir) return relayDir
  const home = (await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '.'
  const conf = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`
  relayDir = `${conf.replace(/\\/g, '/')}/savvy-progress/sessions`
  return relayDir
}

// Writes this session's state when it changed, or for the heartbeat. A failed write
// (a locked file on Windows) is retried by the next change.
async function publish($: EngineInterface, state: SessionState, patch: Partial<typeof mine> = {}): Promise<void> {
  if (!hostId) return
  mine = { ...mine, ...patch, state, reason: state === 'waiting' ? patch.reason ?? mine.reason : undefined }
  const body = JSON.stringify(mine)
  const at = await $.clock.now()
  if (body === written && (state !== 'running' || at - writtenAt < HEARTBEAT_MS)) return
  try {
    const status: SessionStatus = { hostId, ...mine, updatedAt: at }
    await $.fs.write(`${await relayFolder($)}/${hostId}.json`, JSON.stringify(status))
    written = body
    writtenAt = at
  } catch {
    // Retried with the next change.
  }
}

// What a permission dialog asks, in one line: the tool and its command, file or URL.
const askedFor = (tool: string, input: unknown): string => {
  const i = (input ?? {}) as { command?: unknown; file_path?: unknown; url?: unknown }
  const what = [i.command, i.file_path, i.url].find(v => typeof v === 'string') as string | undefined
  return clip(`${tool.replace(/^mcp__/, '')}${what ? ': ' + what.replace(/\s+/g, ' ') : ''}`, MAX_TITLE)
}

// The hero follows model and effort, for sessions as for subagents.
const tierFor = (model: string, effort?: string): string => {
  const m = model.toLowerCase()
  if (/fable|mythos/.test(m)) return 'fable'
  if (/sonnet|haiku/.test(m)) return 'swarm'
  if (effort === 'low') return 'light'
  if (effort === 'high') return 'careful'
  if (effort === 'xhigh' || effort === 'max') return 'heavy'
  return 'medium'
}

// A start_session call that started a session now (an offer or a proposal starts none
// yet; those are found by their status file): its app id is in the result.
async function trackStarted($: EngineInterface, input: Record<string, unknown>, result: unknown, brief: Brief): Promise<void> {
  const text = JSON.stringify(result ?? '')
  const id = HOST_ID.exec(text)?.[0]
  if (!id || id === hostId) return
  // A proposal started by its id carries no title in the call; the result names it.
  const named = /Started session \\?"(.+?)\\?" \(session_id/.exec(text)?.[1]
  await addSession($, id, { ...brief, title: brief.title || named || String(input.name ?? '') })
}

// A side session becomes a worker row, its hero set by model and effort.
async function addSession($: EngineInterface, id: string, brief: Brief): Promise<void> {
  if ((await read($, agents)).some(a => a.id === id)) return
  const model = brief.model || (await $.session.model().catch(() => 'opus'))
  const effort = brief.effort
  const at = await $.clock.now()
  const run: AgentRun = {
    id,
    kind: 'session',
    type: `savvy-${tierFor(model, effort)}`,
    description: clip((brief.title || 'session').trim(), MAX_TITLE),
    model,
    effort,
    status: 'running',
    startedAt: at,
    contextTokens: 0,
    contextMax: windowOf(model),
    tokens: 0,
    costUsd: 0,
    steps: 0,
    round: 1,
    // The app's own link format, as list_sessions reports it.
    link: `claude://claude.ai/epitaxy/${id}`,
  }
  await update($, agents, list => [...list.filter(a => a.id !== id), run].slice(-200))
  await update($, flow, prev =>
    prev && !prev.isFinished ? { ...prev, phase: prev.phase === 'plan' ? 'delegate' : prev.phase } : { ...blank(), phase: 'delegate' },
  )
  await update($, now, () => at)
  const f = await read($, flow)
  await autoOpen($, f && !f.isFinished ? f.title : 'savvy-flow')
}

// Shows a side session in the app, as clicking its row in the sidebar would. A panel
// link cannot: the desktop draws only https links. The app's window tool can, for a
// session this one started; where it refuses, a toast says where to find it.
async function openSession($: EngineInterface, id: string): Promise<void> {
  for (const target of ['focus', 'split']) {
    try {
      const r = await $.mcp.call('ccd_window', 'open_session_in', { session_id: id, target })
      if (!r.isError) return
    } catch {
      // No window tool here (the terminal, an SDK host): try the next way, then the toast.
    }
  }
  void $.ui.toast(tr().cantOpen)
}

// Finds side sessions that name this one as their parent, however they were started
// (a card the person clicked never passes through start_session here).
async function discoverSessions($: EngineInterface): Promise<void> {
  if (!hostId) return
  const dir = await relayFolder($)
  const known = new Set((await read($, agents)).map(a => a.id))
  const entries = await $.fs.list(dir).catch(() => [])
  for (const ent of entries) {
    const id = ent.name.replace(/\.json$/, '')
    if (ent.kind !== 'file' || !HOST_ID.test(id) || id === hostId || known.has(id)) continue
    if (seenFiles.get(id) === ent.mtimeMs) continue
    seenFiles.set(id, ent.mtimeMs)
    let w: SessionStatus
    try {
      w = JSON.parse(String(await $.fs.read(`${dir}/${ent.name}`))) as SessionStatus
    } catch {
      seenFiles.delete(id) // mid-write; read it again next tick
      continue
    }
    if (w.parentId !== hostId) continue
    const brief = (w.parentKey ? ((await $.store.get(`brief:${w.parentKey}`)) as Brief | undefined) : undefined) ?? { title: '' }
    await addSession($, id, { ...brief, model: brief.model || w.model })
  }
}

// Reads the status file of each session this one started; a new wait raises a notification.
async function syncSessions($: EngineInterface): Promise<void> {
  await discoverSessions($)
  const tracked = (await read($, agents)).filter(a => a.kind === 'session')
  if (!tracked.length) return
  const dir = await relayFolder($)
  const changed = new Map<string, AgentRun>()
  const raised: AgentRun[] = []
  for (const a of tracked) {
    const path = `${dir}/${a.id}.json`
    const st = await $.fs.stat(path).catch(() => null)
    if (!st || sessionSeen.get(a.id) === st.mtimeMs) continue
    let w: SessionStatus
    try {
      w = JSON.parse(String(await $.fs.read(path))) as SessionStatus
    } catch {
      continue // mid-write; the next tick reads it again
    }
    sessionSeen.set(a.id, st.mtimeMs)
    const model = typeof w.model === 'string' && w.model ? w.model : a.model
    const isWaiting = w.state === 'waiting'
    const run: AgentRun = {
      ...a,
      model,
      type: `savvy-${tierFor(model, a.effort)}`,
      contextMax: windowOf(model),
      status: w.state === 'idle' ? 'done' : 'running',
      endedAt: w.state === 'idle' ? Number(w.updatedAt) : undefined,
      isWaiting,
      waitReason: isWaiting && typeof w.reason === 'string' ? clip(w.reason, MAX_TITLE) : undefined,
      stepDone: typeof w.stepDone === 'number' ? w.stepDone : a.stepDone,
      stepTotal: typeof w.stepTotal === 'number' ? w.stepTotal : a.stepTotal,
      stepNote: typeof w.stepNote === 'string' ? clip(w.stepNote, MAX_TITLE) : a.stepNote,
    }
    if (isWaiting && !a.isWaiting) raised.push(run)
    changed.set(a.id, run)
  }
  if (!changed.size) return
  const at = await $.clock.now()
  await update($, agents, list => list.map(a => changed.get(a.id) ?? a))
  await update($, now, () => at)
  for (const r of raised) {
    void $.ui.notify(`${r.description}: ${tr().needsYou}${r.waitReason ? ' · ' + r.waitReason : ''}`, { key: `savvy-wait-${r.id}` })
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    lang = await detectLang($, options.language)
    hostId = (await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')) ?? ''
    if (hostId) await publish($, 'idle', { model: await $.session.model().catch(() => undefined) })
    await $.tool.register({
      name: 'progress',
      description:
        'Report /savvy-flow progress to the progress bar above the prompt and the agents panel. ' +
        'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
        'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value. ' +
        'For the main session only: a call from a subagent is ignored (workers report with `step`).',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name of the overall task, a few words.' },
          total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
          done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
          phase: { type: 'string', enum: [...PHASES] },
          finished: { type: 'boolean', description: 'True once the flow is closed.' },
          tasks: {
            type: 'array',
            description:
              'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
                tier: { type: 'string', enum: [...TIERS] },
                after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
              },
              required: ['title', 'tier'],
            },
          },
        },
      },
    })
    await $.tool.register({
      name: 'step',
      description:
        'For savvy-flow workers: report progress on your own task to the agents panel. ' +
        'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
        'call it again as each step finishes. Cheap and silent: it only draws a bar.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
          total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
          note: { type: 'string', description: 'The step in progress, a few words.' },
        },
        required: ['done'],
      },
      // In every agent's tool list, not behind ToolSearch: workers do not go looking for it.
      isDeferred: false,
    })
    await $.command.register({
      name: 'agents-info',
      description: 'Show or hide the panel of subagents: running, finished and planned, with model, context, cost and time',
    })

    // Ticks the running agents' clocks; quiet when nothing runs. Every other
    // tick also picks up the API-credit workers the savvy-api runner writes.
    let tick = 0
    $.clock.every(1000, () => {
      void (async () => {
        if (tick++ % 2 === 0) {
          await syncApiWorkers($)
          await syncSessions($)
        }
        const list = await read($, agents)
        if (!list.some(a => a.status === 'running')) return
        const at = await $.clock.now()
        await update($, now, () => at)
      })()
    })
    return started
  })

  on('command.run', { command: 'agents-info' }, async ($, e) => {
    // `/agents-info open` opens the panel, or brings it forward from behind another tab, without toggling it.
    if ((e.args ?? '').trim() === 'open') {
      const at = await $.clock.now()
      await update($, now, () => at)
      await $.ui.open({ id: PANE, title: tr().pane })
      return { text: tr().opened }
    }
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    // The flow is the main session's: a call from a worker's loop carries its agentId
    // and changes nothing, or any subagent could rename, finish or reset the flow.
    if (e.agentId) return { result: 'ignored: only the main session reports the flow' }
    const input = e as unknown as ProgressInput
    const prev = await read($, flow)
    if (isNewFlow(prev, input) && input.title !== undefined) {
      // A new flow starts with a clean list; agents still running stay.
      await update($, agents, list => list.filter(a => a.status === 'running'))
    }
    const next = await update($, flow, p => merge(p, input))
    if (next && input.tasks?.length) await autoOpen($, next.title)
    return { result: `ok: ${label(next ?? blank())}` }
  })

  // A worker's own progress: the call runs in the worker's loop, so agentId names it.
  on('tool.call', { tool: STEP_TOOL }, async ($, e) => {
    const input = e as unknown as { done?: number; total?: number; note?: string }
    const agentId = e.agentId
    if (!agentId) {
      // A side session's own loop: its steps go to its status file for the orchestrator.
      if (!hostId) return { result: 'ignored: only subagents and side sessions report steps' }
      const total = Math.max(0, Math.round(input.total ?? mine.stepTotal ?? 0))
      const done = Math.max(0, Math.round(input.done ?? mine.stepDone ?? 0))
      await publish($, 'running', { stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined })
      return { result: 'ok' }
    }
    let matched = false
    await update($, agents, list =>
      list.map(a => {
        if (a.agentId !== agentId) return a
        matched = true
        const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
        const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
        return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
      }),
    )
    return { result: matched ? 'ok' : `ignored: no panel row for agent ${agentId}` }
  })

  // This session's own state, for an orchestrator that started it. Only the main loop
  // sets running and idle: a subagent's turn is not the session's.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      // A side session's first prompt holds its brief, and the brief its parent.
      const parent = mine.parentId ? null : PARENT_LINE.exec(e.text ?? '')
      await publish($, 'running', parent ? { parentId: parent[1], parentKey: parent[2] } : {})
    }
    return next(e)
  })

  // The hand goes up only when a person is asked: a permission dialog (an auto-mode
  // verdict raises none) or a question. A subagent's dialog waits for the person too.
  on('classic.PermissionRequest', async ($, e, next) => {
    await publish($, 'waiting', { reason: askedFor(e.tool_name, e.tool_input) })
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const question = (e as unknown as { questions?: { question?: string }[] }).questions?.[0]?.question
    await publish($, 'waiting', { reason: clip(question?.trim() || 'a question', MAX_TITLE) })
    try {
      return await next(e)
    } finally {
      await publish($, 'running')
    }
  })

  // A call that runs after a dialog means the person answered: the hand goes down.
  // In the main loop it also keeps a long turn's heartbeat.
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'AskUserQuestion' && (mine.state === 'waiting' || (!e.agentId && mine.state === 'running'))) {
      await publish($, 'running')
    }
    return next(e)
  })

  // Sessions this one starts become workers in the panel.
  on('tool.call', { tool: START_TOOL }, async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    if (e.agentId || !hostId) return next(e)
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const brief: Brief = { title: str(input.title) ?? '', model: str(input.model), effort: str(input.effort) }
    // A brief (not a start by proposal id, whose brief went out with the proposal)
    // carries this session's id and a key to what it kept of the brief.
    let call = e
    if (str(input.prompt)) {
      const key = `${(await $.clock.now()).toString(36)}${(briefCount++).toString(36)}`.slice(-12)
      await $.store.set(`brief:${key}`, brief)
      call = { ...e, prompt: `${String(input.prompt)}${parentLine(key)}` } as typeof e
    }
    const result = await next(call)
    await trackStarted($, input, result, brief)
    return result
  })

  // Safety net: worker launches move the faint layer even if the orchestrator forgets to report.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = String(e.subagent_type ?? '')
    if (!type.startsWith('savvy-')) return next(e)

    await update($, flow, prev => {
      const base = prev && !prev.isFinished ? { ...blank(), ...prev } : blank()
      return { ...base, running: base.running + 1, phase: base.phase === 'plan' ? 'delegate' : base.phase }
    })
    try {
      return await next(e)
    } finally {
      await update($, flow, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const isUnbriefed = e.subagentType.startsWith('savvy-') && !e.prompt.includes(STEP_TOOL)
    const started = await next(isUnbriefed ? { ...e, prompt: e.prompt + STEP_BRIEF } : e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    if (e.subagentType.startsWith('savvy-')) {
      const f = await read($, flow)
      await autoOpen($, f && !f.isFinished ? f.title : 'savvy-flow')
    } else if (options.autoOpen === 'any') {
      await autoOpen($, 'any-agent')
    }
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const agentId = e.agentId
    const usage = result.usage
    if (!agentId || !usage) return result

    const model = usage.model || e.model
    await update($, agents, list =>
      list.map((a): AgentRun =>
        a.agentId !== agentId
          ? a
          : {
              ...a,
              model,
              effort: typeof e.effort === 'string' ? e.effort : a.effort,
              status: 'running',
              endedAt: undefined,
              contextTokens:
                (usage.input_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0) +
                (usage.output_tokens || 0),
              contextMax: windowOf(model),
              tokens:
                a.tokens +
                (usage.input_tokens || 0) +
                (usage.output_tokens || 0) +
                (usage.cache_read_input_tokens || 0) +
                (usage.cache_creation_input_tokens || 0),
              costUsd: a.costUsd + costOf(model, usage, true),
              steps: a.steps + 1,
            },
      ),
    )
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map((a): AgentRun => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage, false),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
    } else {
      // The session's own turn ended: for an orchestrator that started it, it is idle.
      await publish($, 'idle')
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = await read($, flow)
    const p: Panel = await read($, panel)
    // A worker's title is what a click opens it by: a session in the app (its link),
    // a subagent's transcript (`$.ui.view`, which a person's press may ask for).
    // Hovering anywhere on a worker's row, its hero included, lights its title: the
    // row and the title share one hover group.
    const lit = (a: AgentRun) => ({ scope: `w-${a.id}`.slice(0, 64), color: ACCENT, bold: true })
    const titleOf = (a: AgentRun) => {
      const text = `${a.isWaiting ? '✋ ' : ''}${a.description || a.type}`
      if (a.kind === 'session') {
        return <Button key={`title-${a.id}`} label={text} plain hover={lit(a)} onPress={() => void openSession($, a.id)} />
      }
      const agentId = a.agentId
      if (agentId && !a.isApi) {
        return <Button key={`title-${a.id}`} label={text} plain hover={lit(a)} onPress={() => void $.ui.view({ agentId })} />
      }
      return (
        <Text key={`title-${a.id}`} bold wrap="truncate-end">
          {text}
        </Text>
      )
    }
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    const toggleCompact = (
      <Button
        key="compact"
        label={p.isCompact ? s.expand : s.collapse}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))}
      />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? (isRtl() ? '◂' : '▸') : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const isEmpty = list.length === 0 && planned.length === 0
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )

      // In Hebrew the column hugs the right edge: section heads and buttons right-aligned.
      const align = isRtl() ? 'flex-end' : undefined
      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1} alignItems={align}>
            <Svg source={compactSvg(W, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>
        )
      }
      const shownDone = p.isDoneCollapsed ? 0 : finished.length
      const lines = 1 + (isEmpty ? 1 : 0) + (running.length > 0 ? 1 : 0) + (finished.length > 0 ? 1 : 0) + (planned.length > 0 ? 1 : 0)
      const gridH = headerHeight(title) + lines * LINE_H + (running.length + shownDone) * (LINE_H + ROW_H) + planned.length * 46
      // One worker: its title (the click target) over its drawing; the whole row lights on hover.
      const workerRow = (a: AgentRun, state: string) => (
        <Box key={`row-${a.id}`} flexDirection="column" hover={{ scope: `w-${a.id}`.slice(0, 64) }}>
          {titleOf(a)}
          <Svg source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${state}`} width={W} height={ROW_H} />
        </Box>
      )
      return (
        <Box flexDirection="column">
          {/* The grid sizes the pane; the content is placed over it, as an
              absolute Box paints over the siblings before it. */}
          {gridTiles(gridH).map((tileH, i) => (
            <Svg key={`grid-${i}`} source={gridSvg(W, tileH)} alt="dotted grid" width={W} height={tileH} />
          ))}
          <Box flexDirection="column" position="absolute" top={0} left={0} right={0} alignItems={align}>
            <Svg source={headerSvg(W, title, t)} alt={title ? `${title}: ${summary}` : summary} width={W} height={headerHeight(title)} />
            {toggleCompact}
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
            {running.map(a => workerRow(a, a.isWaiting ? s.needsYou : s.isRunning))}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed &&
              finished.map(a => workerRow(a, s.isFinished))}
            {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
            {planned.map(pl => (
              <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} width={W} height={46} />
            ))}
          </Box>
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const tier = tierOf(a.type)
      const color = colorOf(tier)
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = runModel(a)
      const steps = a.isWaiting
        ? ''
        : a.stepTotal
          ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''} · `
          : a.stepNote
            ? `${a.stepNote} · `
            : ''
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            {titleOf(a)}
            <Text color={a.isWaiting ? HAND : a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>
              {a.isWaiting ? '✋' : STATUS_GLYPH[a.status]}
            </Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {tier === 'other' ? a.type : tierWord(tier)} · {a.kind === 'session' ? s.session : s.subagent} · {model}
            {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              {steps}{s.ctx} {ctx}% · {fmtTokens(a.contextTokens)} ≈{fmtCost(a.costUsd)} {fmtTime(elapsed(a, at))}
            </Text>
          </Text>
          {a.isWaiting && (
            <Text color={HAND} bold wrap="truncate-end">
              {'  '}✋ {s.needsYou}
              {a.waitReason ? `: ${a.waitReason}` : ''}
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            {title}
          </Text>
          {toggleCompact}
        </Box>
        <Text dimColor>
          ≈{fmtCost(t.cost)} · {fmtTokens(t.tokens)} {s.tokensWord} · {fmtTime(t.time)}
        </Text>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={colorOf(tierOf(a.type))}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
            {planned.map(pl => (
              <Text key={`plan-${pl.n}`} dimColor>
                ◷{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{s.running} · {running.length}</Text>}
            {running.map(row)}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(row)}
            {planned.length > 0 && <Text dimColor>{s.planned} · {planned.length}</Text>}
            {planned.map(pl => {
              const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
              return (
                <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
                  <Text dimColor wrap="truncate-end">
                    <Text color={colorOf(tier)}>▢</Text> {pl.n}. {pl.title} ◷
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {tierWord(tier)} · {tierModel(tier)}
                    {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const reported = await read($, flow)
    if (reported === null || e.props.hasSurvey) return next(e)
    // Draw this row with the other mods' bands beneath it. Claude Code's own placeholder ({ type: 'engine' }) is
    // never nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = view(reported, list)
    const crew = list.length + plannedOf(f, list).length
    const isWorking = list.some(a => a.status === 'running')
    const crewButton = (
      <Button key="savvy-agents" label={`×${crew}`} plain onPress={() => void togglePane($)} />
    )
    const percent = `${Math.round(ratio(f) * 100)}%`
    const dismiss = (
      <Button
        key="savvy-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, flow, () => null)}
      />
    )

    // The terminal's element table is completed with an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      // About 8 CSS px per reported column; the rest is the count, the dismiss
      // and their gaps. No floor above the slot: a row wider than it would wrap.
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 96))
      return (
        <Box flexDirection="column">
          <Box flexDirection={isRtl() ? 'row-reverse' : 'row'} alignItems="center" gap={1}>
            <Svg source={rowSvg(f, width, isWorking)} alt={`${f.title}: ${label(f)}, ${percent}`} width={width} height={H} />
            {crewButton}
            {dismiss}
          </Box>
          {below}
        </Box>
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const width = Math.max(6, Math.min(40, cols - titleW - 32))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Box width={titleW} flexShrink={0}>
            <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
            <Text wrap="truncate-end">{f.title}</Text>
          </Box>
          <Text color={f.isFinished ? DONE : ACCENT}>{barText(f, width)}</Text>
          <Text bold>{label(f)}</Text>
          <Text dimColor>{percent}</Text>
          <Text color={CLAY}>▣</Text>
          {crewButton}
          {dismiss}
        </Box>
        {below}
      </Box>
    )
  })
}
