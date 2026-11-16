import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { AgentRun, Flow, Panel } from '../types'

// The agents pane after the engine lost it (the session resumed in a new process, the
// plugins reloaded, the hooks worker respawned, the app switched away and back): the
// session's state still holds the flow and the workers, and the pane is opened and
// drawn from it at once, not at the next `progress` or `step` call.

const PLUGIN = 'savvy-progress'
const PANE = 'savvy-agents'
const HOST = 'local_b9f6dc8a-d0ab-4fdd-a609-846bff1ef252'
const AT = Date.parse('2026-11-16T12:00:00Z')
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

// A long orchestrator session: 14 planned tasks, 7 accepted, 8 finished subagents, 4 side sessions.
const flow: Flow = {
  title: 'Kullerwelt 1.2',
  total: 14,
  done: 7,
  running: 0,
  phase: 'delegate',
  isFinished: false,
  tasks: Array.from({ length: 14 }, (_, i) => ({ title: `Task ${i + 1}`, tier: i % 2 ? 'medium' : 'careful', after: i ? [i] : [] })),
}
const run = (i: number, more: Partial<AgentRun> = {}): AgentRun => ({
  id: `a${i}`,
  agentId: `a${i}`,
  type: 'savvy-medium',
  description: `Task ${i + 1}`,
  model: 'claude-opus-5-5',
  status: 'done',
  startedAt: AT - 600_000,
  endedAt: AT - 60_000,
  contextTokens: 120_000,
  contextMax: 200_000,
  tokens: 900_000,
  costUsd: 3.2,
  steps: 40,
  round: 1,
  ...more,
})
const agents: AgentRun[] = [
  ...Array.from({ length: 8 }, (_, i) => run(i)),
  ...Array.from({ length: 4 }, (_, i) =>
    run(8 + i, { id: `local_0000000${i}-e133-4607-9a12-362cd1d5cd65`, agentId: undefined, kind: 'session', description: `route-${i}` }),
  ),
]
// What 1.5.0 wrote: no `isOpen`, the automatic open remembered by the flow's title.
const openedBy150: Panel = { isCompact: false, isDoneCollapsed: false, autoOpenedFor: 'Kullerwelt 1.2' }

// The engine beneath, with the session's state as an earlier process left it.
function engine(on: On, seeded: { flow: Flow | null; agents: AgentRun[]; panel: Panel }) {
  const clock = mock.clock(on, { now: AT })
  mock.env(on, { LANG: 'en_US.UTF-8', USERPROFILE: 'C:\\Users\\me', CLAUDE_CODE_HOST_SESSION_ID: HOST })
  const state = new Map<string, { value: unknown; version: number }>(Object.entries(seeded).map(([key, value]) => [key, { value, version: 1 }]))
  on('state.get', async (_$, e) => ({ value: state.get((e as unknown as { key: string }).key) ?? { value: undefined, version: 0 } }) as never)
  on('state.set', async (_$, e) => {
    const { key, value } = e as unknown as { key: string; value: unknown }
    const version = (state.get(key)?.version ?? 0) + 1
    state.set(key, { value, version })
    return { value: { isSet: true, version } } as never
  })
  const opens: string[] = []
  let invalidated = 0
  on('ui.open', async (_$, e) => {
    opens.push((e as unknown as { id: string }).id)
    return { value: { isPlaced: true } } as never
  })
  on('ui.invalidate', async () => {
    invalidated++
    return { value: undefined } as never
  })
  // What the engine lists as open: nothing, until a test says the pane is up.
  const up = { isUp: false }
  on('ui.panes', async () => ({ value: up.isUp ? [{ id: PANE, title: 'Agents', isShown: true, isFocused: false, isPlaced: true }] : [] }) as never)
  on('ui.close', async () => {
    up.isUp = false
    return { value: undefined } as never
  })
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('session.attach', async (_$, e) => ({ clientId: (e as unknown as { clientId: string }).clientId }) as never)
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.model', async () => ({ value: 'claude-opus-5-5' }) as never)
  on('store.get', async () => ({ value: undefined }) as never)
  on('store.set', async () => ({ value: undefined }) as never)
  on('tool.register', async () => ({ value: undefined }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  const written = new Map<string, string>()
  on('fs.write', async (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string }
    written.set(path.split('\\').join('/'), text)
    return { value: undefined } as never
  })
  on('fs.exists', async () => ({ value: false }) as never)
  on('fs.list', async () => ({ value: [] }) as never)
  on('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  return { clock, opens, up, written, panel: () => state.get('panel')?.value as Panel, invalidated: () => invalidated }
}

const start = ($: Engine) => $.session.start({ source: 'resume', cwd: '/repo', surface: 'desktop', isInteractive: true } as never)

test('a session that starts with a flow in its state opens the pane and draws it, with no tool call', async ($, on) => {
  const { opens, invalidated } = engine(on, { flow, agents, panel: openedBy150 })
  await start($)
  expect(opens).toEqual([PANE])
  expect(invalidated()).toBeGreaterThan(0)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: PANE, props: pane })
    expect(await ui.find({ key: 'title-a0' })).toBeTruthy()
    expect(await ui.find({ key: 'title-local_00000003-e133-4607-9a12-362cd1d5cd65' })).toBeTruthy()
    expect(await ui.find({ key: 'done' })).toBeTruthy()
    await ui.unmount()
  }
})

test('the app attaching again (switched back to the session) opens and redraws the pane', async ($, on) => {
  const { opens } = engine(on, { flow, agents, panel: openedBy150 })
  await start($)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  expect(opens).toEqual([PANE, PANE])
})

test('a pane the engine dropped while the session ran is opened again by the timer', async ($, on) => {
  const { clock, opens } = engine(on, { flow, agents, panel: openedBy150 })
  await start($)
  await clock.advance(10_500)
  expect(opens.length).toBe(2)
  // A drawing that keeps failing is not reopened for ever.
  await clock.advance(120_000)
  expect(opens.length).toBe(6)
})

test('a pane the person closed with /agents-info stays closed', async ($, on) => {
  const { clock, opens, up, panel } = engine(on, { flow, agents, panel: openedBy150 })
  await start($)
  up.isUp = true
  await $.command.run({ command: 'agents-info', args: '' } as never)
  expect(up.isUp).toBe(false)
  expect(panel().isOpen).toBe(false)

  await start($)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as never)
  await clock.advance(30_000)
  expect(opens).toEqual([PANE])
})

test('with nothing to show, no pane is opened', async ($, on) => {
  const { opens } = engine(on, { flow: null, agents: [], panel: openedBy150 })
  await start($)
  expect(opens).toEqual([])
})

test('a pane that was never opened is not opened', async ($, on) => {
  const { clock, opens } = engine(on, { flow, agents, panel: { isCompact: false, isDoneCollapsed: false, autoOpenedFor: '' } })
  await start($)
  await clock.advance(30_000)
  expect(opens).toEqual([])
})

test('a long session draws eight heroes and the rest as text, and the pane log says what was drawn', async ($, on) => {
  const { clock, written } = engine(on, { flow, agents, panel: openedBy150 })
  await start($)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: PANE, props: pane })
  const sources = (await ui.findAll({ type: 'Svg' })).map(x => String((x.props as { source?: string }).source ?? ''))
  // Twelve workers and seven planned tasks: every title is there, the drawing well under the 240 KB of a hero each.
  expect(await ui.find({ key: 'title-a0' })).toBeTruthy()
  expect(sources.reduce((sum, x) => sum + x.length, 0)).toBeLessThan(140_000)
  await ui.unmount()

  await clock.advance(1100)
  const log = [...written].find(([path]) => path.endsWith(`/savvy-progress/pane-log/${HOST}.jsonl`))?.[1] ?? ''
  const lines = log.trim().split('\n').map(line => JSON.parse(line) as { what: string; why?: string; isPlaced?: boolean; heroes?: number })
  expect(lines.find(x => x.what === 'open')).toMatchObject({ why: 'start', isPlaced: true })
  expect(lines.find(x => x.what === 'draw')).toMatchObject({ heroes: 8 })
})
