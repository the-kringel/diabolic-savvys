import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-limits'
const NOW = Date.parse('2026-11-23T20:00:00Z')
const iso = (hours: number) => new Date(NOW + hours * 3600e3).toISOString()
const USAGE =
  `Gemini Models\tWeekly Limit Remaining\t98%\t${iso(160)}\n` +
  `Gemini Models\tFive Hour Limit Remaining\t95%\t${iso(4)}\n`

const setup = async ($: never, on: never, agy: () => { exitCode: number; stdout: string; stderr: string }) => {
  const anyOn = on as (...a: unknown[]) => void
  const clock = mock.clock(on, { now: NOW })
  const calls: string[][] = []
  mock.env(on, { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' })
  anyOn('fs.exists', async () => ({ value: true }))
  anyOn('tool.register', async () => ({ value: {} }))
  anyOn('command.register', async () => ({ value: {} }))
  anyOn('store.get', async () => ({ value: undefined }))
  anyOn('store.set', async () => ({ value: undefined }))
  anyOn('session.usage', async () => ({
    value: {
      startedAt: NOW,
      context: {},
      rateLimits: [
        { kind: 'five_hour', percentUsed: 13, resetsAt: iso(4.4) },
        { kind: 'seven_day', percentUsed: 35, resetsAt: iso(100) },
      ],
    },
  }))
  anyOn('process.run', async (_$: unknown, e: { argv: string[] }) => {
    calls.push([...e.argv])
    return { value: { ...agy(), isStdoutTruncated: false, isStderrTruncated: false } }
  })
  anyOn('session.start', async () => ({ cwd: '/repo' }))
  await ($ as { session: { start: (i: unknown) => Promise<unknown> } }).session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(1)
  return { clock, calls }
}

test('the row shows both providers, percent left', async ($, on) => {
  await setup($ as never, on as never, () => ({ exitCode: 0, stdout: USAGE, stderr: '' }))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect(await ui.find({ text: /Claude/ })).toBeDefined()
  expect(await ui.find({ text: /87%/ })).toBeDefined()
  expect(await ui.find({ text: /Gemini/ })).toBeDefined()
  expect(await ui.find({ text: /95%/ })).toBeDefined()
})

test('the tool returns limits, tracks and the worker path', async ($, on) => {
  const { calls } = await setup($ as never, on as never, () => ({ exitCode: 0, stdout: USAGE, stderr: '' }))
  const out = await $.tool.call({ tool: 'mcp__savvy-limits__limits', refresh: true } as never)
  const r = JSON.parse(String((out as { result: unknown }).result))
  expect(r.claude.fiveHour.remainingPct).toBe(87)
  expect(r.gemini.weekly.remainingPct).toBe(98)
  expect(r.tracks.test.provider).toBe('claude')
  expect(r.geminiWorker).toContain('/bin/gemini-worker.mjs')
  expect(calls.every(c => c.includes('/usage') && !c.includes('--dangerously-skip-permissions'))).toBe(true)
})

test('without agy, Claude is still tracked and work stays on Claude', async ($, on) => {
  await setup($ as never, on as never, () => ({ exitCode: 1, stdout: 'not signed in', stderr: '' }))
  const out = await $.tool.call({ tool: 'mcp__savvy-limits__limits', refresh: true } as never)
  const r = JSON.parse(String((out as { result: unknown }).result))
  expect(r.claude.mode).not.toBe('unknown')
  expect(r.gemini.mode).toBe('unknown')
  expect(r.tracks.code.provider).toBe('claude')
})
