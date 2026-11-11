import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// Side sessions (docs/SESSION-MODE.md): each session writes its state to a file of its
// own; the session that started it reads that file and draws it as a worker.

const PLUGIN = 'savvy-progress'
const CHILD = 'local_014da006-e133-4607-9a12-362cd1d5cd65'
const DIR = 'C:/Users/me/.claude/savvy-progress/sessions'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

type Status = { hostId: string; state: string; reason?: string; stepDone?: number; stepTotal?: number; updatedAt: number }

let kept = new Map<string, unknown>()

const base = (on: On, env: Record<string, string>, store: Record<string, unknown> = {}) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-11T12:00:00Z') })
  mock.env(on, { LANG: 'en_US.UTF-8', USERPROFILE: 'C:\\Users\\me', ...env })
  on('settings.read', async () => ({ value: {} }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  on('session.model', async () => ({ value: 'claude-opus-5-5' }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  // The plugin's store, in memory, readable by the test.
  kept = new Map(Object.entries(store))
  on('store.get', async (_$, e) => ({ value: kept.get((e as unknown as { key: string }).key) }) as never)
  on('store.set', async (_$, e) => {
    const { key, value } = e as unknown as { key: string; value: unknown }
    kept.set(key, value)
    return { value: undefined } as never
  })
  on('store.delete', async (_$, e) => {
    kept.delete((e as unknown as { key: string }).key)
    return { value: undefined } as never
  })
  on('store.keys', async () => ({ value: [...kept.keys()] }) as never)
  on('tool.register', async () => ({ value: undefined }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  on('classic.PermissionRequest', async () => ({}) as never)
  return clock
}

const start = ($: Engine) => $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)

// The side session: what it writes to its own file as it works.
async function child($: Engine, on: On) {
  base(on, { CLAUDE_CODE_HOST_SESSION_ID: CHILD })
  const files = new Map<string, Status>()
  on('fs.write', async (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string }
    files.set(path, JSON.parse(text) as Status)
    return { value: undefined } as never
  })
  on('turn.start', async () => ({ turnId: 't1' }) as never)
  on('turn.complete', async () => ({ text: '' }) as never)
  on('ui.notify', async () => ({ value: {} }) as never)
  on('tool.call', async () => ({ result: 'ok' }) as never)
  await start($)
  // The engine writes the path in the platform's own separators.
  return () => [...files].find(([path]) => path.split('\\').join('/') === `${DIR}/${CHILD}.json`)?.[1]
}

test('a side session publishes running, a raised hand for a permission dialog, and idle', async ($, on) => {
  const status = await child($, on)
  expect(status()?.state).toBe('idle')

  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  expect(status()?.state).toBe('running')

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } } as never)
  expect(status()).toMatchObject({ state: 'waiting', reason: 'Bash: git push origin main' })

  // The approved call runs: the hand goes down.
  await $.tool.call({ tool: 'Bash', command: 'git push origin main' } as never)
  expect(status()?.state).toBe('running')
  expect(status()?.reason).toBeUndefined()

  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', text: 'done' } as never)
  expect(status()?.state).toBe('idle')
})

test('a side session reports its own steps through the step tool', async ($, on) => {
  const status = await child($, on)
  const r = await $.tool.call({ tool: 'mcp__savvy-progress__step', done: 1, total: 4, note: 'balance pass' } as never)
  expect(r).toMatchObject({ result: 'ok' })
  expect(status()).toMatchObject({ stepDone: 1, stepTotal: 4 })
})

test('a session outside the desktop app writes no status file', async ($, on) => {
  base(on, {})
  let writes = 0
  on('fs.write', async () => {
    writes++
    return { value: undefined } as never
  })
  await start($)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'ls' } } as never)
  expect(writes).toBe(0)
})

// The orchestrator: a started session becomes a worker with its hero, label and link,
// and its file raises the hand.
test('a started session is a worker; its waiting file raises the hand in the panel', async ($, on) => {
  const clock = base(on, { CLAUDE_CODE_HOST_SESSION_ID: 'local_b9f6dc8a-d0ab-4fdd-a609-846bff1ef252' })
  on('fs.write', async () => ({ value: undefined }) as never)
  const waiting: Status = { hostId: CHILD, state: 'waiting', reason: 'Bash: npm publish', updatedAt: Date.parse('2026-11-11T12:00:05Z') }
  on('fs.stat', async () => ({ value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } }) as never)
  on('fs.read', async () => ({ value: JSON.stringify(waiting) }) as never)
  on('fs.exists', async () => ({ value: false }) as never)
  const notified: string[] = []
  on('ui.notify', async (_$, e) => {
    notified.push((e as unknown as { text: string }).text)
    return { value: {} } as never
  })
  on('tool.call', async () => ({ result: `Started session "Ring IV balance" (session_id: ${CHILD}, name: r4-bal).` }) as never)
  await start($)

  await $.tool.call({
    tool: 'mcp__ccd_session__start_session',
    initiation: 'user_asked',
    title: 'Ring IV balance',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    prompt: 'p',
  } as never)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect((await ui.find({ key: `title-${CHILD}` }))?.props.label).toBe('Ring IV balance')
  // Sonnet is the Mercenary's tier, labelled as a session; its title is a button that opens it.
  expect(await ui.find({ type: 'Text', text: /swarm · Sonnet 5\.5 · low · session/ })).toBeTruthy()
  expect((await ui.find({ key: `title-${CHILD}` }))?.props.label).toBe('Ring IV balance')

  // The clock's tick reads the child's file.
  await clock.advance(2100)
  expect(await ui.find({ type: 'Text', text: /needs you: Bash: npm publish/ })).toBeTruthy()
  expect(notified).toEqual(['Ring IV balance: needs you · Bash: npm publish'])
  await ui.unmount()
})

test('a proposal started by its id takes its title from the result', async ($, on) => {
  base(on, { CLAUDE_CODE_HOST_SESSION_ID: 'local_b9f6dc8a-d0ab-4fdd-a609-846bff1ef252' })
  on('fs.write', async () => ({ value: undefined }) as never)
  on('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  on('tool.call', async () => ({ result: `Started session "Hand test: one permission prompt" (session_id: ${CHILD}, name: hand-test).` }) as never)
  await start($)
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', proposal_id: 'task_6713f11a' } as never)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect((await ui.find({ key: `title-${CHILD}` }))?.props.label).toBe('Hand test: one permission prompt')
  await ui.unmount()
})

const PARENT = 'local_b9f6dc8a-d0ab-4fdd-a609-846bff1ef252'

test('the orchestrator is asked to end each brief with its parent line, and the call is never rewritten', async ($, on) => {
  base(on, { CLAUDE_CODE_HOST_SESSION_ID: PARENT })
  on('fs.write', async () => ({ value: undefined }) as never)
  on('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }] }) as never)
  const sent: string[] = []
  on('tool.call', async (_$, e) => {
    sent.push(String((e as unknown as { prompt?: string }).prompt ?? ''))
    return { result: 'Proposed as task_1 (a card the user can start).' } as never
  })
  await start($)

  const composed = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['desktop'], tools: [], outputStyle: null, traits: [] } as never)
  const section = composed.sections.find(x => x.id === 'savvy-progress:sessions')
  expect(section?.scope).toBe('session')
  expect(section?.text).toContain(`(savvy-progress: parent ${PARENT} key <key>)`)
  expect(section?.text).toContain('mcp__savvy-progress__step')

  // Auto mode reviews the call as written: it reaches the engine unchanged, and the
  // brief's key is kept for the card's session to be named by.
  const prompt = `Balance ring IV.\n\n(savvy-progress: parent ${PARENT} key ring4bal)`
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', initiation: 'own_initiative', title: 'Ring IV balance', model: 'claude-sonnet-5-5', prompt } as never)
  expect(sent).toEqual([prompt])
  expect(kept.get('brief:ring4bal')).toEqual({ title: 'Ring IV balance', model: 'claude-sonnet-5-5' })
})

test('a side session reads its parent from the brief on its first turn', async ($, on) => {
  const status = await child($, on)
  await $.turn.start({ turnId: 't1', text: `Background ...
Task: go

(savvy-progress: parent ${PARENT} key abc123)` } as never)
  expect(status()).toMatchObject({ state: 'running', parentId: PARENT, parentKey: 'abc123' })
})

test('a session started from a card is found by its parent and named from the kept brief', async ($, on) => {
  const clock = base(on, { CLAUDE_CODE_HOST_SESSION_ID: PARENT }, { 'brief:k1': { title: 'Hand test', model: 'claude-sonnet-5-5', effort: 'low' } })
  on('fs.write', async () => ({ value: undefined }) as never)
  const file = { hostId: CHILD, state: 'waiting', reason: 'Bash: node -e', parentId: PARENT, parentKey: 'k1', model: 'claude-sonnet-5-5', costUsd: 1.5, tokens: 42000, contextTokens: 30000, updatedAt: Date.parse('2026-11-11T12:00:03Z') }
  on('fs.list', async () => ({ value: [{ name: `${CHILD}.json`, kind: 'file', size: 1, mtimeMs: 5, isLink: false }] }) as never)
  on('fs.stat', async () => ({ value: { kind: 'file', size: 1, mtimeMs: 5, isLink: false } }) as never)
  on('fs.read', async () => ({ value: JSON.stringify(file) }) as never)
  on('fs.exists', async () => ({ value: false }) as never)
  on('ui.notify', async () => ({ value: {} }) as never)
  await start($)

  await clock.advance(2100)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect((await ui.find({ key: `title-${CHILD}` }))?.props.label).toBe('✋ Hand test')
  await clock.advance(2100)
  expect(await ui.find({ type: 'Text', text: /needs you: Bash: node -e/ })).toBeTruthy()
  // Its usage, from its own file: cost and tokens on its row.
  expect(await ui.find({ type: 'Text', text: /≈\$1\.50/ })).toBeTruthy()
  await ui.unmount()
})

// The worker's title is its click target; the row around it lights on hover.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a subagent's title opens its transcript, a session's title opens the session`, async ($, on) => {
    base(on, { CLAUDE_CODE_HOST_SESSION_ID: PARENT })
    on('fs.write', async () => ({ value: undefined }) as never)
    on('fs.stat', async () => {
      throw new Error('ENOENT')
    })
    on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a7' }) as never)
    on('tool.call', async () => ({ result: `Started session "Ring IV balance" (session_id: ${CHILD}, name: r4).` }) as never)
    const opened: unknown[] = []
    on('mcp.call', async (_$, e) => {
      opened.push(e)
      return { value: { content: [{ type: 'text', text: 'Opened' }], isError: false } } as never
    })
    const viewed: unknown[] = []
    on('ui.view', async (_$, e) => {
      viewed.push(e)
      return { value: {} } as never
    })
    await start($)
    await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Fix the parser', subagentType: 'savvy-medium', provider: 'engine', parentModel: 'claude-opus-5-5', background: true, fork: false } as never)
    await $.tool.call({ tool: 'mcp__ccd_session__start_session', initiation: 'user_asked', title: 'Ring IV balance', prompt: 'p' } as never)

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })
    await ui.press({ key: `title-${CHILD}` })
    expect(opened).toMatchObject([{ server: 'ccd_window', tool: 'open_session_in', args: { session_id: CHILD, target: 'focus' } }])
    await ui.press({ key: 'title-a7' })
    expect(viewed).toEqual([{ agentId: 'a7' }])
    await ui.unmount()
  })
}

// Smaller panel items: time left, a stall warning, and a side session's usage.
async function panelWith($: Engine, on: On) {
  const clock = base(on, { CLAUDE_CODE_HOST_SESSION_ID: PARENT })
  on('fs.write', async () => ({ value: undefined }) as never)
  on('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  on('fs.exists', async () => ({ value: false }) as never)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }) as never)
  await start($)
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Fix the parser', subagentType: 'savvy-medium', provider: 'engine', parentModel: 'claude-opus-5-5', background: true, fork: false } as never)
  const shows = async (text: RegExp) => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
    const found = await ui.find({ type: 'Text', text })
    await ui.unmount()
    return Boolean(found)
  }
  return { clock, shows }
}

test('a worker that reports steps gets an estimate of the time left', async ($, on) => {
  const { clock, shows } = await panelWith($, on)
  // One step of four took two minutes: three more, about six minutes.
  await clock.advance(2 * 60_000)
  await $.tool.call({ tool: 'mcp__savvy-progress__step', done: 1, total: 4, note: 'parse', agentId: 'a1' } as never)
  expect(await shows(/~6 min left/)).toBe(true)
})

test('a running worker with no progress for over ten minutes gets a warning', async ($, on) => {
  const { clock, shows } = await panelWith($, on)
  await clock.advance(9 * 60_000)
  expect(await shows(/no progress for/)).toBe(false)
  await clock.advance(3 * 60_000)
  expect(await shows(/⚠ no progress for 12 min/)).toBe(true)
  // A step report is progress: the warning goes.
  await $.tool.call({ tool: 'mcp__savvy-progress__step', done: 1, total: 3, agentId: 'a1' } as never)
  expect(await shows(/no progress for/)).toBe(false)
})

test('a side session publishes what it has used, its subagents included', async ($, on) => {
  on('turn.step', async function* () {
    return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never
  })
  const status = await child($, on)
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _ of stream) void _
  // Usage alone is written at most every 15 s; the turn's end writes it with the new state.
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', text: 'done' } as never)
  // 1M input at $4 and 1M output at $20.
  expect(status()).toMatchObject({ state: 'idle', costUsd: 24, tokens: 2e6, contextTokens: 2e6 })
})

test('a Sonnet session planned as a tester is Deckard Cain, not a Mercenary', async ($, on) => {
  base(on, { CLAUDE_CODE_HOST_SESSION_ID: PARENT })
  on('fs.write', async () => ({ value: undefined }) as never)
  on('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  on('tool.call', async () => ({ result: `Started session "Test the parser" (session_id: ${CHILD}, name: t).` }) as never)
  await start($)
  await $.tool.call({ tool: 'mcp__savvy-progress__progress', title: 'Parser', phase: 'delegate', tasks: [{ title: 'Test the parser', tier: 'tester' }] } as never)
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', initiation: 'user_asked', title: 'Test the parser', model: 'claude-sonnet-5-5', effort: 'medium', prompt: 'p' } as never)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'savvy-agents', props: pane })
  expect(await ui.find({ type: 'Text', text: /tester · Sonnet 5\.5 · medium · session/ })).toBeTruthy()
  await ui.unmount()
})
