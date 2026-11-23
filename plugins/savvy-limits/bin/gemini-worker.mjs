#!/usr/bin/env node
// Runs one Gemini worker through the official Antigravity CLI (agy), checks quota first,
// isolates edits in a git worktree, and keeps .claude/api-workers/<id>.json current so
// the savvy-progress panel can draw it. It never reads or reuses Antigravity login tokens.
//
//   node gemini-worker.mjs status
//   node gemini-worker.mjs run --title "Add retry" --kind code --size m --access write \
//        --brief-file brief.md [--cwd <repo>] [--model gemini-4-neon-high] [--timeout-min 20]
//        [--continue-from <id>]    build on an earlier run's unapplied or applied changes
//        [--media-dir <folder>]    where a --kind media run saves images (default generated-media)
//   node gemini-worker.mjs diff <id>
//   node gemini-worker.mjs apply <id>      apply the run, and any runs it continues, to the project
//   node gemini-worker.mjs discard <id>
//   node gemini-worker.mjs report
//
// Exit codes: 0 done, 1 failed, 2 bad usage, 3 quota blocked, 4 all slots busy.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { assessPace, buildReport, parseGeminiUsage, routeGemini } from '../lib/capacity.mjs'

const EXIT = { ok: 0, failed: 1, usage: 2, blocked: 3, busy: 4 }
const STATE = process.env.SAVVY_LIMITS_HOME || join(homedir(), '.claude', 'savvy-limits')
const LEDGER = join(STATE, 'ledger.jsonl')
const RUNS = join(STATE, 'runs')
const WORKTREES = join(STATE, 'worktrees')
const MAX_PARALLEL = Number(process.env.SAVVY_GEMINI_MAX_PARALLEL || 2)
const MAX_PROMPT_CHARS = 24000
const MIN_MEASURED_PCT = 5
const MEDIA_FILE = /\.(png|jpe?g|webp|gif)$/i
const MAX_MEDIA_FILES = 8
const MAX_MEDIA_BYTES = 20 * 1024 * 1024

// Headless agy ends the turn when a terminal command is denied, so workers use file
// tools. The orchestrator runs builds and tests in the worktree afterward.
const NO_TERMINAL =
  'Never use the terminal or run_command tool, not even to list files, because terminal commands are denied here and will end your run. Use only the file read, search, and edit tools.'
const PREAMBLE = {
  read: `You are a delegated read-only agent. Do not modify files. ${NO_TERMINAL} End with concrete findings and file:line references.`,
  write: `You are a delegated agent in an isolated git worktree. Change only what the task needs. Do not touch anything outside this directory. ${NO_TERMINAL} The orchestrator will run builds and tests. End with: files changed, what still needs checking, and anything unfinished.`,
}

const print = value => console.log(JSON.stringify(value, null, 2))
const fail = (message, code = EXIT.usage, extra = {}) => {
  print({ ok: false, error: message, ...extra })
  process.exitCode = code
}
const short = s => String(s ?? '').replace(/\s+/g, ' ').slice(0, 60)
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
// Patches stay bytes: a text round trip or a shell redirect can corrupt them.
const gitBytes = (cwd, input, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })

function agyPath() {
  if (process.env.AGY_PATH) return process.env.AGY_PATH
  const local = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
  return local && existsSync(local) ? local : 'agy'
}

function runAgy(args, { cwd, timeoutMs, onLine } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(agyPath(), args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let buf = ''
    let timedOut = false
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill() }, timeoutMs) : null
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (!onLine) return
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) onLine(line)
      }
    })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', err => { if (timer) clearTimeout(timer); reject(err) })
    child.on('close', code => {
      if (timer) clearTimeout(timer)
      if (onLine && buf.trim()) onLine(buf.trim())
      done({ code, stdout, stderr, timedOut })
    })
  })
}

async function readQuota(attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise(r => setTimeout(r, 2000))
    const { stdout, stderr } = await runAgy(['-p', '/usage', '--print-timeout', '30s'], { timeoutMs: 45000 })
    try {
      return parseGeminiUsage(stdout)
    } catch (err) {
      lastError = new Error(`${err.message}${stderr ? ` agy said: ${stderr.trim().slice(0, 300)}` : ''}`)
    }
  }
  throw lastError
}

function guardSettings() {
  mkdirSync(STATE, { recursive: true })
  const file = join(STATE, 'guard-settings.json')
  // Passed per run, so paid AI credits stay off without changing saved Antigravity settings.
  writeFileSync(file, JSON.stringify({ useG1Credits: false }))
  return file
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function acquireSlot() {
  const dir = join(STATE, 'slots')
  mkdirSync(dir, { recursive: true })
  for (let i = 1; i <= MAX_PARALLEL; i++) {
    const file = join(dir, `slot-${i}`)
    if (existsSync(file)) {
      const pid = Number(readFileSync(file, 'utf8'))
      if (pid && pidAlive(pid)) continue
      try { unlinkSync(file) } catch { continue }
    }
    try {
      writeFileSync(file, String(process.pid), { flag: 'wx' })
      return file
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }
  return null
}

// The panel row. On Windows a rename fails while a reader holds the file: retry, then
// write in place, and never let a status row crash the worker.
function rowWriter(cwd, row) {
  const dir = join(cwd, '.claude', 'api-workers')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${row.id}.json`)
  const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  return () => {
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
          sleep(25 * (i + 1))
        }
      }
    } catch {
      try { writeFileSync(file, json) } catch { /* the next update tries again */ }
    }
  }
}

function worktreePatch(path) {
  git(path, 'add', '-A', '-N')
  return gitBytes(path, undefined, 'diff', '--binary', 'HEAD')
}

function createWorktree(repo, id, previous) {
  const top = previous?.worktree.repo ?? git(repo, 'rev-parse', '--show-toplevel')
  const dirty = git(top, 'status', '--porcelain') !== ''
  mkdirSync(WORKTREES, { recursive: true })
  const path = join(WORKTREES, id)
  const branch = `gemini/${id}`
  git(top, 'worktree', 'add', '-q', '-b', branch, path, previous?.worktree.branch ?? 'HEAD')
  if (previous) {
    // The earlier run's work becomes this branch's base, so this run's diff is only its own.
    const patch = worktreePatch(previous.worktree.path)
    if (patch.length) {
      gitBytes(path, patch, 'apply', '--whitespace=nowarn')
      git(path, 'add', '-A')
      const tree = git(path, 'write-tree')
      const commit = git(path, '-c', 'user.name=savvy-limits', '-c', 'user.email=savvy-limits@localhost', 'commit-tree', tree, '-p', 'HEAD', '-m', `Base from Gemini run ${previous.id}`)
      git(path, 'update-ref', 'HEAD', commit)
    }
  }
  return { repo: top, path, branch, sourceHadUncommittedChanges: dirty }
}

function worktreeChanges(path) {
  git(path, 'add', '-A', '-N')
  const files = git(path, 'diff', '--name-only', 'HEAD').split(/\r?\n/).filter(Boolean)
  return { files, stat: git(path, 'diff', '--stat', 'HEAD') }
}

// agy saves generated images to the conversation's artifacts, outside the worktree. Copy
// them in so they show in the run's diff and go through review like any other change.
function collectMedia(conversationId, worktreePath, mediaDir) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId ?? '')) return []
  const source = join(homedir(), '.gemini', 'antigravity-cli', 'brain', conversationId)
  if (!existsSync(source)) return []
  const saved = []
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (saved.length >= MAX_MEDIA_FILES) break
    if (!entry.isFile() || !MEDIA_FILE.test(entry.name)) continue
    const from = join(source, entry.name)
    if (statSync(from).size > MAX_MEDIA_BYTES) continue
    const name = entry.name.replace(/[^\w.-]/g, '_')
    mkdirSync(resolve(worktreePath, mediaDir), { recursive: true })
    copyFileSync(from, resolve(worktreePath, mediaDir, name))
    saved.push(`${mediaDir.replace(/\\/g, '/').replace(/\/$/, '')}/${name}`)
  }
  return saved
}

async function cmdStatus() {
  const windows = await readQuota()
  const report = buildReport({ rateLimits: [], gemini: { windows, asOf: Date.now() } })
  print({ ok: true, gemini: report.gemini })
}

async function cmdRun(v) {
  const task = v['brief-file'] ? readFileSync(resolve(v['brief-file']), 'utf8') : v.brief
  if (!task?.trim()) return fail('Provide --brief-file <file> or --brief.')
  const title = v.title?.trim()
  if (!title) return fail('Provide --title, the task title from the plan.')
  const access = v.access ?? 'read'
  if (!Object.hasOwn(PREAMBLE, access)) return fail('--access must be read or write.')
  if (v.model && !/^gemini-/.test(v.model)) return fail('--model must be a Gemini model.')
  if (v['continue-from'] && access !== 'write') return fail('--continue-from needs --access write.')
  const previous = v['continue-from'] ? loadRun(v['continue-from']) : null
  if (previous && (!previous.worktree || !existsSync(previous.worktree.path))) {
    return fail(`Run ${previous.id} has no worktree to continue from.`)
  }
  const kind = v.kind ?? 'code'
  const size = v.size ?? 'm'
  const mediaDir = v['media-dir'] ?? 'generated-media'
  if (isAbsolute(mediaDir) || mediaDir.split(/[\\/]/).includes('..')) return fail('--media-dir must be a folder inside the project.')
  const prompt = `${PREAMBLE[access]}\n\nTASK:\n${task}`
  if (prompt.length > MAX_PROMPT_CHARS) return fail(`Brief is too long (${prompt.length} chars). Reference files instead.`)

  const cwd = resolve(v.cwd ?? process.cwd())
  const before = await readQuota()
  const pace = assessPace(before)
  const routed = routeGemini(kind, size, pace)
  if (pace.mode === 'blocked') return fail(pace.reason, EXIT.blocked, { waitUntil: pace.waitUntil })
  const model = v.model ?? routed

  const slot = acquireSlot()
  if (!slot) return fail(`All ${MAX_PARALLEL} Gemini slots are busy.`, EXIT.busy)

  const id = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`
  const row = {
    id: `gemini-${id}`,
    type: 'savvy-gemini',
    provider: 'gemini',
    description: title,
    model,
    status: 'running',
    startedAt: Date.now(),
    tokens: 0,
    contextTokens: 0,
    costUsd: 0,
    steps: 0,
    stepNote: 'starting',
    pid: process.pid,
  }
  const save = rowWriter(cwd, row)
  save()
  // The panel marks a row with no update for 15 minutes as failed; a long model step is not a failure.
  const heartbeat = setInterval(save, 30_000)

  let worktree = null
  try {
    if (access === 'write') worktree = createWorktree(cwd, id, previous)
    const minutes = Number(v['timeout-min'] ?? 20)
    const args = [
      '-p', prompt,
      '--model', model,
      '--mode', access === 'write' ? 'accept-edits' : 'plan',
      '--output-format', 'stream-json',
      '--print-timeout', `${minutes}m`,
      '--settings', guardSettings(),
      '--sandbox',
    ]

    let envelope = null
    const started = Date.now()
    const onLine = line => {
      let ev
      try { ev = JSON.parse(line) } catch { return }
      if (ev.event === 'result') {
        envelope = ev.result
      } else if (ev.event === 'step_update') {
        const s = ev.step_update ?? {}
        if (s.usage) {
          row.contextTokens = (s.usage.input_tokens || 0) + (s.usage.cache_read_tokens || 0)
          row.tokens += s.usage.total_tokens || 0
          row.steps++
        }
        if (s.state === 'ACTIVE' && s.tool_name) {
          const p = s.tool_info?.parameters ?? {}
          row.stepNote = short(`${s.tool_name} ${String(p.Path ?? p.TargetFile ?? p.Query ?? '').split(/[\\/]/).pop()}`)
        }
        save()
      }
    }
    const res = await runAgy(args, { cwd: worktree?.path ?? cwd, timeoutMs: minutes * 60e3 + 15e3, onLine })

    const denied = envelope?.denied_actions ?? []
    const stoppedByDenial = envelope?.status === 'SUCCESS' && denied.length > 0 && !envelope.response?.trim()
    const status = res.timedOut ? 'TIMEOUT' : stoppedByDenial ? 'DENIED' : (envelope?.status ?? 'ERROR')
    const media = kind === 'media' && worktree ? collectMedia(envelope?.conversation_id, worktree.path, mediaDir) : []
    const changes = worktree ? worktreeChanges(worktree.path) : null
    let after = null
    let quotaError = null
    try {
      after = await readQuota()
    } catch (err) {
      quotaError = err.message
    }
    const delta = w => (after ? before[w].remaining - after[w].remaining : null)

    const record = {
      id,
      at: new Date(started).toISOString(),
      model,
      kind,
      size,
      access,
      paceMode: pace.mode,
      status,
      continuedFrom: previous?.id ?? null,
      conversationId: envelope?.conversation_id ?? null,
      durationSeconds: Math.round((Date.now() - started) / 1000),
      usage: envelope?.usage ?? null,
      quotaUsedPct: { weekly: delta('weekly'), fiveHour: delta('fiveHour') },
    }
    mkdirSync(RUNS, { recursive: true })
    appendFileSync(LEDGER, `${JSON.stringify(record)}\n`)
    writeFileSync(join(RUNS, `${id}.json`), JSON.stringify({ ...record, worktree, response: envelope?.response ?? null }, null, 2))

    const ok = status === 'SUCCESS'
    const warnings = []
    if (ok && access === 'write' && changes.files.length === 0) warnings.push('Agent reported success but changed no files.')
    if (denied.length) warnings.push(`Denied actions: ${denied.map(d => d.action).join(', ')}.`)
    if (quotaError) warnings.push(`Could not read quota after the run: ${quotaError}`)
    if (worktree?.sourceHadUncommittedChanges) warnings.push('Source repo had uncommitted changes that the worktree does not include.')

    row.status = ok ? 'done' : 'failed'
    row.endedAt = Date.now()
    row.tokens = envelope?.usage?.total_tokens ?? row.tokens
    row.stepNote = ok ? 'finished' : short(envelope?.error ?? status)
    print({
      ok,
      ...record,
      worktree: worktree && { path: worktree.path, branch: worktree.branch },
      changes,
      media,
      warnings,
      response: envelope?.response ?? null,
      error: ok ? undefined : envelope?.error ?? (res.stderr.trim().slice(0, 1000) || 'agy returned no result'),
    })
    process.exitCode = ok ? EXIT.ok : EXIT.failed
  } catch (err) {
    row.status = 'failed'
    row.endedAt = Date.now()
    row.stepNote = short(err.message)
    throw err
  } finally {
    clearInterval(heartbeat)
    save()
    unlinkSync(slot)
  }
}

function loadRun(id) {
  if (!/^[0-9]{14}-[0-9a-f]{6}$/.test(id ?? '')) throw new Error('Provide a valid run id.')
  const file = join(RUNS, `${id}.json`)
  if (!existsSync(file)) throw new Error(`No run ${id}.`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function cmdDiff(id) {
  const run = loadRun(id)
  if (!run.worktree || !existsSync(run.worktree.path)) return fail('This run has no worktree.')
  git(run.worktree.path, 'add', '-A', '-N')
  console.log(git(run.worktree.path, 'diff', 'HEAD'))
}

// Applies the run and the runs it continues, oldest first, skipping any already applied.
function cmdApply(id) {
  const chain = [loadRun(id)]
  while (chain[0].continuedFrom) chain.unshift(loadRun(chain[0].continuedFrom))
  const applied = []
  for (const run of chain) {
    if (run.appliedAt) continue
    if (!run.worktree || !existsSync(run.worktree.path)) return fail(`Run ${run.id} has no worktree to apply.`, EXIT.failed, { applied })
    const patch = worktreePatch(run.worktree.path)
    if (patch.length) gitBytes(run.worktree.repo, patch, 'apply', '--whitespace=nowarn')
    run.appliedAt = new Date().toISOString()
    writeFileSync(join(RUNS, `${run.id}.json`), JSON.stringify(run, null, 2))
    applied.push(run.id)
  }
  print({ ok: true, applied, project: chain.at(-1).worktree?.repo })
}

function cmdDiscard(id) {
  const run = loadRun(id)
  if (!run.worktree) return fail('This run has no worktree.')
  git(run.worktree.repo, 'worktree', 'remove', '--force', run.worktree.path)
  git(run.worktree.repo, 'branch', '-D', run.worktree.branch)
  print({ ok: true, discarded: id })
}

function cmdReport() {
  const rows = existsSync(LEDGER)
    ? readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l))
    : []
  const byModel = {}
  for (const r of rows) {
    const m = (byModel[r.model] ??= { runs: 0, succeeded: 0, totalTokens: 0, measuredTokens: 0, weeklyPct: 0, fiveHourPct: 0 })
    m.runs++
    if (r.status === 'SUCCESS') m.succeeded++
    const tokens = r.usage?.total_tokens ?? 0
    m.totalTokens += tokens
    if (r.quotaUsedPct?.fiveHour != null && r.quotaUsedPct?.weekly != null) {
      m.measuredTokens += tokens
      m.weeklyPct += r.quotaUsedPct.weekly
      m.fiveHourPct += r.quotaUsedPct.fiveHour
    }
  }
  for (const m of Object.values(byModel)) {
    // /usage is whole-percent and can lag between reads, so small samples are noise.
    const enough = m.measuredTokens > 0 && m.fiveHourPct >= MIN_MEASURED_PCT
    m.fiveHourPctPerMillionTokens = enough ? +((m.fiveHourPct / m.measuredTokens) * 1e6).toFixed(2) : null
    m.rateConfidence = enough ? 'measured' : 'insufficient data'
  }
  print({ ok: true, runs: rows.length, byModel })
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' },
    brief: { type: 'string' },
    'brief-file': { type: 'string' },
    kind: { type: 'string' },
    size: { type: 'string' },
    model: { type: 'string' },
    access: { type: 'string' },
    cwd: { type: 'string' },
    'timeout-min': { type: 'string' },
    'continue-from': { type: 'string' },
    'media-dir': { type: 'string' },
  },
})

const [command, arg] = positionals
const commands = {
  status: cmdStatus,
  run: () => cmdRun(values),
  diff: () => cmdDiff(arg),
  apply: () => cmdApply(arg),
  discard: () => cmdDiscard(arg),
  report: cmdReport,
}

if (!commands[command]) {
  fail(`Usage: gemini-worker <${Object.keys(commands).join('|')}> [options]`)
} else {
  try {
    await commands[command]()
  } catch (err) {
    fail(err.stderr?.toString().trim() || err.message, EXIT.failed)
  }
}
