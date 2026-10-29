import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: a savvy-api worker's status file becomes a panel row`, async ($, on) => {
    const clock = mock.clock(on, { now: Date.parse('2026-10-29T20:00:00Z') })
    const t0 = clock.now()
    let worker = {
      id: 'light-1', type: 'savvy-light', description: 'API mode smoke test', model: 'opus', effort: 'low',
      status: 'running', startedAt: t0, updatedAt: t0, tokens: 24000, contextTokens: 24000, costUsd: 0.07, steps: 1,
      stepNote: 'Bash wc -l README.md',
    }
    let mtime = 1
    on('fs.exists', async () => ({ value: true }) as never)
    on('fs.list', async () => ({ value: [{ name: 'light-1.json', kind: 'file', size: 1, mtimeMs: mtime, isLink: false }] }) as never)
    on('fs.read', async () => ({ value: JSON.stringify(worker) }) as never)
    const opened: string[] = []
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    mock.env(on, { LANG: 'en_US.UTF-8' })
    on('settings.read', async () => ({ value: {} }) as never)
    on('tool.register', async () => ({ value: {} }) as never)
    on('command.register', async () => ({ value: {} }) as never)
    on('session.start', async () => ({ cwd: '/repo' }) as never)
    await $.session.start({ source: 'startup', cwd: '/repo', surface, isInteractive: true } as never)
    await clock.advance(2000)

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })
    // The terminal draws rows as Text, the desktop as one Svg each, its words in `alt` and `source`.
    const shows = async (re: RegExp) =>
      (await ui.find({ text: re })) !== undefined ||
      (await ui.findAll({ type: 'Svg' })).some(el => re.test(`${el.props.alt} ${el.props.source}`))
    expect(opened).toContain('savvy-agents')
    expect(await shows(/API mode smoke test/)).toBe(true)
    expect(await shows(/· API/)).toBe(true)
    expect(await shows(/wc -l README\.md/)).toBe(true)

    // The runner rewrites the file when the worker finishes: the row follows.
    worker = { ...worker, status: 'done', endedAt: t0 + 14000, costUsd: 0.13, stepNote: 'finished' }
    mtime = 2
    await clock.advance(2000)
    expect(await ui.find({ text: /Finished · 1/ })).toBeDefined()
  })
}
