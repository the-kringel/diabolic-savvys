#!/usr/bin/env node
// Runs one savvy worker as a headless `claude -p` billed to API credit
// (SAVVY_API_KEY), and keeps .claude/api-workers/<id>.json current so the
// savvy-progress panel can draw it.
//
//   node api-worker.mjs --tier medium --title "Add retry" --brief-file brief.md
//          [--id <id>] [--cwd <dir>] [--permission-mode acceptEdits] [--max-budget-usd 5]
//
// Exit codes: 0 done, 1 failed, 2 bad usage / no key, 3 out of API credit.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const AGENTS = resolve(HERE, '../../agents')
const NO_CREDIT = /credit balance is too low|insufficient[_ ]credit|out of credits|billing/i
const MARKER_TTL_MS = 6 * 60 * 60 * 1000

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i]
  if (!k.startsWith('--')) continue
  const v = process.argv[i + 1]
  args[k.slice(2)] = v === undefined || v.startsWith('--') ? true : (i++, v)
}
const cwd = resolve(args.cwd ?? process.cwd())
const dir = join(cwd, '.claude', 'api-workers')
const marker = join(dir, '.no-credit')
mkdirSync(dir, { recursive: true })

if (args.check) {
  // `--check`: exit 0 when API workers may be used, 3 when credit ran out recently, 2 without a key.
  if (!process.env.SAVVY_API_KEY) process.exit(2)
  if (existsSync(marker) && Date.now() - Number(readFileSync(marker, 'utf8')) < MARKER_TTL_MS) process.exit(3)
  process.exit(0)
}

const tier = args.tier ?? 'medium'
const title = args.title
const brief = args['brief-file'] ? readFileSync(args['brief-file'], 'utf8') : args.brief
if (!title || !brief) {
  console.error('usage: api-worker.mjs --tier <tier> --title <title> --brief-file <file>')
  process.exit(2)
}
if (!process.env.SAVVY_API_KEY) {
  console.error('SAVVY_API_KEY is not set')
  process.exit(2)
}

// The tier's own agent file supplies model, effort and system prompt.
const agentFile = readFileSync(join(AGENTS, `savvy-${tier}.md`), 'utf8')
const [, front = '', body = ''] = agentFile.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/) ?? []
const field = name => front.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1].trim()
const model = args.model ?? field('model') ?? 'opus'
const effort = field('effort')

const id = args.id ?? `${tier}-${Date.now().toString(36)}`
const file = join(dir, `${id}.json`)
const row = {
  id,
  type: `savvy-${tier}`,
  description: title,
  model,
  effort,
  status: 'running',
  startedAt: Date.now(),
  tokens: 0,
  contextTokens: 0,
  costUsd: 0,
  steps: 0,
  stepNote: 'starting',
  pid: process.pid,
}
// On Windows the rename fails with EPERM / EBUSY while a reader (the agents panel,
// an antivirus scan) holds the status file open. Retry briefly, then write in place;
// a status row is never worth crashing the runner and losing the worker's report.
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const save = () => {
  row.updatedAt = Date.now()
  const json = JSON.stringify(row)
  try {
    writeFileSync(`${file}.tmp`, json)
    for (let i = 0; ; i++) {
      try {
        renameSync(`${file}.tmp`, file)
        return
      } catch (e) {
        if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e
        sleepSync(25 * (i + 1))
      }
    }
  } catch {
    try {
      writeFileSync(file, json)
    } catch {
      // skip this update; the next one will try again
    }
  }
}
save()

// The worker must be a plain API-key session: a parent session (the desktop app
// above all) sets ANTHROPIC_BASE_URL to its own subscription endpoint and its
// account and session ids, and a worker that inherits them is billed there.
const env = { ...process.env, ANTHROPIC_API_KEY: process.env.SAVVY_API_KEY }
for (const k of Object.keys(env)) {
  if (/^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN)$/.test(k)) delete env[k]
  else if (k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_CODE_PLUGIN_DIRS') delete env[k]
  else if (k.startsWith('CLAUDE_AGENT_SDK_')) delete env[k]
}
if (process.env.SAVVY_API_BASE_URL) env.ANTHROPIC_BASE_URL = process.env.SAVVY_API_BASE_URL
delete env.SAVVY_API_KEY

// The prompt goes by file: on Windows `claude` is a .cmd shim, spawned through
// cmd.exe, which cuts a multi-line argument short.
const promptFile = join(dir, `${id}.prompt.md`)
writeFileSync(promptFile, body.replace(/^- Progress reporting:.*$/m, ''))
const q = s => (process.platform === 'win32' ? `"${s}"` : s)

const cli = [
  '-p',
  '--output-format', 'stream-json',
  '--verbose',
  '--model', model,
  '--append-system-prompt-file', q(promptFile),
  '--permission-mode', args['permission-mode'] ?? 'acceptEdits',
]
if (effort) cli.push('--effort', effort)
if (args['max-budget-usd']) cli.push('--max-budget-usd', args['max-budget-usd'])

const child = spawn(process.env.SAVVY_CLAUDE_BIN ?? 'claude', cli, { cwd, env, shell: process.platform === 'win32' })
child.stdin.end(brief)

const short = s => String(s ?? '').replace(/\s+/g, ' ').slice(0, 60)
let finalText = ''
let errorText = ''
let stderrText = ''
let buf = ''
child.stdout.on('data', chunk => {
  buf += chunk
  let nl
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    if (!line) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.type === 'assistant' && ev.message) {
      const u = ev.message.usage
      if (u) {
        row.contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0)
        row.tokens += row.contextTokens
        row.steps++
      }
      for (const c of ev.message.content ?? []) {
        if (c.type === 'tool_use') {
          const inp = c.input ?? {}
          row.stepNote = `${c.name} ${short(inp.description ?? inp.file_path ?? inp.command ?? inp.pattern ?? '')}`.trim()
        } else if (c.type === 'text' && c.text.trim()) {
          row.stepNote = short(c.text)
        }
      }
      save()
    } else if (ev.type === 'result') {
      finalText = ev.result ?? ''
      if (typeof ev.total_cost_usd === 'number') row.costUsd = ev.total_cost_usd
      if (ev.is_error) errorText = finalText || ev.subtype || 'error'
    }
  }
})
child.stderr.on('data', chunk => { stderrText += chunk })

child.on('close', code => {
  row.endedAt = Date.now()
  const outOfCredit = NO_CREDIT.test(errorText) || NO_CREDIT.test(stderrText)
  if (outOfCredit) {
    row.status = 'failed'
    row.stepNote = 'out of API credit'
    writeFileSync(marker, String(Date.now()))
  } else {
    row.status = code === 0 && !errorText ? 'done' : 'failed'
    errorText ||= stderrText.trim()
    row.stepNote = row.status === 'done' ? 'finished' : short(errorText) || `exit ${code}`
  }
  save()
  process.stdout.write(finalText || errorText)
  process.stdout.write(`\n[api-worker ${id}: ${outOfCredit ? 'NO_CREDIT' : row.status}, $${row.costUsd.toFixed(2)}, ${Math.round((row.endedAt - row.startedAt) / 1000)}s]\n`)
  process.exit(outOfCredit ? 3 : row.status === 'done' ? 0 : 1)
})
