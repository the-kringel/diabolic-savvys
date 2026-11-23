import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { bandAlt, bandHeight, bandSvg } from '../lib/band.mjs'
import { buildReport, parseGeminiUsage } from '../lib/capacity.mjs'
import type { GeminiReading, PaceView, RateLimit, Report, WindowView } from '../types'

const TOOL = 'mcp__savvy-limits__limits'
const STORE_KEY = 'gemini'
const TICK_MS = 60_000
// An idle session stops asking Google for quota.
const ACTIVE_MS = 30 * 60_000

const report = atom({ plugin: 'savvy-limits', key: 'report' } as const, null)
const isHidden = atom({ plugin: 'savvy-limits', key: 'isHidden' } as const, false)

const GOOD = '#2F9E6E'
const WARN = '#C98A1B'
const BAD = '#D14B3D'
const MODE_WORD: Record<string, string> = { conserve: 'low', surplus: 'use first', blocked: 'blocked', unknown: 'no data' }

let rateLimits: readonly RateLimit[] = []
let gemini: GeminiReading | null = null
let refreshing: Promise<void> | null = null
let activeAt = 0
let pollMs: number | null = 5 * 60_000

const levelColor = (w: WindowView | null): string | undefined => {
  if (!w) return undefined
  if (w.isDisabled || w.remainingPct <= 5) return BAD
  return w.remainingPct < 20 ? WARN : GOOD
}

const pct = (w: WindowView | null): string => (!w ? '–' : w.isDisabled ? 'off' : `${Math.round(w.remainingPct)}%`)

const meterText = (w: WindowView | null): string => {
  const on = w && !w.isDisabled ? Math.round((w.remainingPct / 100) * 8) : 0
  return '▰'.repeat(on) + '▱'.repeat(8 - on)
}

const resetIn = (iso: string | null | undefined, now: number): string => {
  if (!iso) return 'not started'
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000))
  if (min >= 1440) return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`
}

const describe = (r: Report, now: number): string => {
  const line = (name: string, p: PaceView) =>
    `${name}: ${p.mode}. 5h ${pct(p.fiveHour)} left (resets ${resetIn(p.fiveHour?.resetsAt, now)}), week ${pct(p.weekly)} left (resets ${resetIn(p.weekly?.resetsAt, now)}). ${p.reason}`
  const tracks = Object.entries(r.tracks)
    .map(([kind, t]) => `${kind} → ${t.provider}`)
    .join(', ')
  return `${line('Claude', r.claude)}\n${line('Gemini', r.gemini)}\nTracks: ${tracks}`
}

async function publish($: EngineInterface): Promise<Report> {
  const next = buildReport({ rateLimits, gemini, now: await $.clock.now() })
  await update($, report, () => next)
  return next
}

async function readClaude($: EngineInterface): Promise<void> {
  const usage = await $.session.usage().catch(() => null)
  if (usage) rateLimits = usage.rateLimits
}

async function agyPath($: EngineInterface): Promise<string> {
  const custom = await $.env.get('AGY_PATH')
  if (custom) return custom
  const base = await $.env.get('LOCALAPPDATA')
  const local = base ? `${base}\\agy\\bin\\agy.exe` : ''
  return local && (await $.fs.exists(local).catch(() => false)) ? local : 'agy'
}

// Only the official agy CLI is called; Antigravity's login tokens are never read.
async function readGemini($: EngineInterface): Promise<void> {
  try {
    const argv = [await agyPath($), '-p', '/usage', '--print-timeout', '30s']
    const { stdout } = await $.process.run(argv, { timeoutMs: 45_000 })
    gemini = { windows: parseGeminiUsage(stdout), asOf: await $.clock.now() }
    await $.store.set(STORE_KEY, gemini)
  } catch (err) {
    const error = err instanceof Error && /quota/.test(err.message) ? err.message : 'Could not run the agy CLI. Is it installed and signed in?'
    gemini = { windows: gemini?.windows ?? null, asOf: gemini?.asOf ?? null, error }
  }
}

// Readings are shared through the store, so several open sessions make one request per interval.
async function refreshGemini($: EngineInterface, force = false): Promise<void> {
  const kept = (await $.store.get(STORE_KEY).catch(() => undefined)) as GeminiReading | undefined
  if (kept?.windows && (kept.asOf ?? 0) > (gemini?.asOf ?? 0)) gemini = kept
  const at = await $.clock.now()
  if (force || (pollMs !== null && at - (gemini?.asOf ?? 0) >= pollMs)) {
    refreshing ??= readGemini($).finally(() => {
      refreshing = null
    })
    await refreshing
  }
  await publish($)
}

async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  if (at - activeAt < ACTIVE_MS) await refreshGemini($)
  else await publish($)
}

export const register: Register = (on, options) => {
  const minutes = Number(options.geminiPollMinutes ?? 5)
  pollMs = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await readClaude($)
    await $.tool.register({
      name: 'limits',
      description:
        "Read Claude Code and Gemini 5-hour and weekly limits, each provider's pace mode (normal, conserve, surplus, blocked, unknown), " +
        'the recommended provider per work track, and Gemini models by kind and size. ' +
        'Call it before planning delegated work and again before each new wave. Pass refresh: true for a fresh Gemini reading.',
      inputSchema: {
        type: 'object',
        properties: {
          refresh: { type: 'boolean', description: 'Read Gemini quota now instead of using the last reading.' },
        },
      },
    })
    await $.command.register({
      name: 'limits',
      description: 'Show Claude and Gemini 5-hour and weekly limits. Arguments: refresh, hide, show',
    })
    await publish($)
    void refreshGemini($).catch(() => undefined)
    $.clock.every(TICK_MS, () => {
      void tick($).catch(() => undefined)
    })
    return started
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      rateLimits = e.rateLimits
      await publish($)
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Tracking must never hold up a prompt.
    activeAt = await $.clock.now().catch(() => activeAt)
    void refreshGemini($).catch(() => undefined)
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as { refresh?: boolean }
    try {
      await readClaude($)
      await refreshGemini($, input.refresh === true)
      const current = await publish($)
      const geminiWorker = `${$.plugin.root}/bin/gemini-worker.mjs`.replaceAll('\\', '/')
      return { result: JSON.stringify({ ...current, geminiWorker }) }
    } catch (err) {
      return { result: `Could not read limits: ${err instanceof Error ? err.message : String(err)}` }
    }
  })

  on('command.run', { command: 'limits' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      return { text: arg === 'hide' ? 'Limits row hidden.' : 'Limits row shown.' }
    }
    await readClaude($)
    await refreshGemini($, arg === 'refresh')
    const current = await publish($)
    return { text: describe(current, await $.clock.now()) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, report)
    if (!r || e.props.hasSurvey || (await read($, isHidden))) return next(e)
    // Keep other mods' bands beneath this one. Claude Code's own placeholder is never
    // nested: the desktop drops a band that nests it.
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    // The terminal's element table has an `Svg` that draws nothing: test the surface too.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(260, Math.min(1400, (e.props.bodyColumns || 100) * 8 - 32))
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={bandSvg(r, width)} alt={bandAlt(r)} width={width} height={bandHeight(width)} />
          {below}
        </Box>
      )
    }

    const provider = (name: string, p: PaceView) => {
      const word = MODE_WORD[p.mode]
      return (
        <Box key={name} flexDirection="row" marginRight={2}>
          <Text bold>{name} </Text>
          <Text dimColor>5h </Text>
          <Text color={levelColor(p.fiveHour)}>{meterText(p.fiveHour)} {pct(p.fiveHour)}</Text>
          <Text dimColor> · wk </Text>
          <Text color={levelColor(p.weekly)}>{meterText(p.weekly)} {pct(p.weekly)}</Text>
          {word ? (
            <Text color={p.mode === 'blocked' ? BAD : p.mode === 'conserve' ? WARN : undefined} dimColor={p.mode === 'unknown'}>
              {' '}
              {word}
            </Text>
          ) : null}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {provider('Claude', r.claude)}
          {provider('Gemini', r.gemini)}
        </Box>
        {below}
      </Box>
    )
  })
}
