#!/usr/bin/env node
// Runs one Gemini worker through the official Antigravity CLI (agy), checks quota first,
// isolates edits in a git worktree (or runs in an existing --worktree / --in-place checkout),
// maps per-project profiles to scoped agy permission rules, logs streaming events, and keeps
// .claude/api-workers/<id>.json current so the savvy-progress panel can draw it.
// It never reads or reuses Antigravity login tokens and never uses --dangerously-skip-permissions.
//
//   node gemini-worker.mjs status
//   node gemini-worker.mjs run --title "Add retry" --kind code --size m --access write \
//        --brief-file brief.md [--cwd <repo>] [--model gemini-4-neon-high] \
//        [--profile <path|name|default>] [--allow-cmd <cmd> ...] [--deny-cmd <cmd> ...] \
//        [--read-path <path> ...] [--write-path <path> ...] [--allow-localhost] \
//        [--sandbox | --no-sandbox] [--command-timeout-min 25] [--timeout-min 60] \
//        [--worktree <path> | --in-place | --continue-from <id>] \
//        [--media-dir <folder>]
//   node gemini-worker.mjs resume <run-id> --brief-file followup.md [overrides...]
//   node gemini-worker.mjs diff <id>
//   node gemini-worker.mjs apply <id>
//   node gemini-worker.mjs discard <id>
//   node gemini-worker.mjs report
//
// Exit codes:
//   0 done, 1 failed/timeout, 2 bad usage/config, 3 quota blocked/exhausted,
//   4 all slots busy, 5 permission denied, 6 command failure.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assessPace, buildReport, parseGeminiUsage, routeGemini } from '../lib/capacity.mjs'
import {
  EXIT,
  buildExecutionConfig,
  buildPreamble,
  classifyRunOutcome,
  computeTurnUsage,
  loadProfile,
  parseCommandExitCode,
  parseWorkerCli,
  validateProfile,
} from '../lib/worker-config.mjs'

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

const print = value => console.log(JSON.stringify(value, null, 2))
const fail = (message, code = EXIT.usage, extra = {}) => {
  print({ ok: false, exitCode: code, error: message, ...extra })
  process.exitCode = code
}
const short = s => String(s ?? '').replace(/\s+/g, ' ').slice(0, 60)
const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const gitTry = (cwd, ...args) => {
  try {
    return git(cwd, ...args)
  } catch {
    return null
  }
}
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

function writeRunSettings(id, settings) {
  mkdirSync(RUNS, { recursive: true })
  const file = join(RUNS, `${id}.settings.json`)
  // Per-run settings file avoids races between parallel workers and leaves saved agy settings untouched.
  writeFileSync(file, JSON.stringify({ ...settings, useG1Credits: false }, null, 2))
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

function inspectGitState(dir) {
  const inside = gitTry(dir, 'rev-parse', '--is-inside-work-tree') === 'true'
  if (!inside) return { isGitRepo: false, repo: null, head: null, branch: null, inMerge: false, dirty: false }
  const repo = gitTry(dir, 'rev-parse', '--show-toplevel')
  const head = gitTry(dir, 'rev-parse', 'HEAD')
  const branch = gitTry(dir, 'rev-parse', '--abbrev-ref', 'HEAD')
  const gitDir = gitTry(dir, 'rev-parse', '--git-dir')
  const inMerge = Boolean(gitDir && existsSync(resolve(dir, gitDir, 'MERGE_HEAD')))
  const dirty = (gitTry(dir, 'status', '--porcelain') ?? '') !== ''
  return { isGitRepo: true, repo, head, branch, inMerge, dirty }
}

function worktreePatch(path, baseRef = 'HEAD') {
  git(path, 'add', '-A', '-N')
  return gitBytes(path, undefined, 'diff', '--binary', baseRef)
}

function createWorktree(repo, id, previous) {
  const top = previous?.worktree.repo ?? git(repo, 'rev-parse', '--show-toplevel')
  const dirty = git(top, 'status', '--porcelain', '--', '.', ':!.claude/api-workers') !== ''
  mkdirSync(WORKTREES, { recursive: true })
  const path = join(WORKTREES, id)
  const branch = `gemini/${id}`
  git(top, 'worktree', 'add', '-q', '-b', branch, path, previous?.worktree.branch ?? 'HEAD')
  if (previous) {
    // The earlier run's work (committed or uncommitted) becomes this branch's base.
    const baseRef = previous.worktree.initialHead ?? 'HEAD'
    const patch = worktreePatch(previous.worktree.path, baseRef)
    if (patch.length) {
      gitBytes(path, patch, 'apply', '--whitespace=nowarn')
      git(path, 'add', '-A')
      const tree = git(path, 'write-tree')
      const commit = git(
        path,
        '-c', 'user.name=savvy-limits',
        '-c', 'user.email=savvy-limits@localhost',
        'commit-tree', tree, '-p', 'HEAD', '-m', `Base from Gemini run ${previous.id}`,
      )
      git(path, 'update-ref', 'HEAD', commit)
    }
  }
  const initialHead = gitTry(path, 'rev-parse', 'HEAD')
  return {
    repo: top,
    path,
    branch,
    mode: 'managed',
    managed: true,
    initialHead,
    sourceHadUncommittedChanges: dirty,
  }
}

function attachExistingWorktree(targetDir, mode) {
  const abs = resolve(targetDir)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(`Worktree path does not exist or is not a directory: ${abs}`)
  }
  const state = inspectGitState(abs)
  return {
    repo: state.repo ?? abs,
    path: abs,
    branch: state.branch,
    mode,
    managed: false,
    initialHead: state.head,
    sourceHadUncommittedChanges: state.dirty,
    inMerge: state.inMerge,
    isGitRepo: state.isGitRepo,
  }
}

function collectCommits(dir, baseCommit, head) {
  if (!head) return []
  if (baseCommit && head === baseCommit) return []
  const range = baseCommit ? `${baseCommit}..${head}` : head
  const raw = gitTry(dir, 'log', '--reverse', '--format=%H\t%s', range)
  if (!raw) return []
  return raw.split(/\r?\n/).filter(Boolean).map(line => {
    const [hash, ...rest] = line.split('\t')
    return { hash, subject: rest.join('\t') }
  })
}

function worktreeChanges(path, { managed = true, baseCommit = null } = {}) {
  const state = inspectGitState(path)
  if (!state.isGitRepo) return { files: [], stat: '' }

  if (managed) {
    git(path, 'add', '-A', '-N')
    const ref = baseCommit ?? 'HEAD'
    const files = (gitTry(path, 'diff', '--name-only', ref) ?? '').split(/\r?\n/).filter(Boolean)
    const stat = gitTry(path, 'diff', '--stat', ref) ?? ''
    return { files, stat }
  }

  // Unmanaged checkout (--worktree / --in-place): never run `git add -A -N` because it mutates
  // the user's index and can interfere with staged changes or an active mid-merge state.
  const fileSet = new Set()
  const addLines = out => {
    for (const f of (out ?? '').split(/\r?\n/).filter(Boolean)) fileSet.add(f)
  }
  if (baseCommit && state.head && state.head !== baseCommit) {
    addLines(gitTry(path, 'diff', '--name-only', `${baseCommit}..${state.head}`))
  }
  addLines(gitTry(path, 'diff', '--name-only'))
  addLines(gitTry(path, 'diff', '--cached', '--name-only'))
  addLines(gitTry(path, 'ls-files', '--others', '--exclude-standard'))
  const stat = baseCommit
    ? (gitTry(path, 'diff', '--stat', baseCommit) ?? '')
    : (gitTry(path, 'diff', '--stat') ?? '')
  return { files: [...fileSet].sort(), stat }
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

function normalizeDeniedActions(envelopeDenied, toolDenied) {
  const out = []
  const seen = new Set()
  const push = item => {
    const key = `${item.action}|${item.target ?? ''}|${item.tool ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(item)
  }
  for (const d of envelopeDenied ?? []) {
    push({
      action: d.action ?? 'unknown',
      ...(d.display_name ? { displayName: d.display_name } : {}),
      ...(d.target ? { target: d.target } : {}),
    })
  }
  for (const d of toolDenied ?? []) push(d)
  return out
}

async function executeWorkerTurn({
  title,
  prompt,
  access,
  kind,
  size,
  requestedModel,
  cwd,
  mediaDir,
  profilePath,
  execConfig,
  worktree = null,
  worktreePlan = null,
  continuedFrom = null,
  resumedFrom = null,
  resumeConversationId = null,
  previousUsage = null,
}) {
  if (prompt.length > MAX_PROMPT_CHARS) {
    return fail(`Brief is too long (${prompt.length} chars). Reference files instead.`, EXIT.usage)
  }

  const before = await readQuota()
  const pace = assessPace(before)
  const routed = routeGemini(kind, size, pace)
  if (pace.mode === 'blocked') {
    return fail(pace.reason, EXIT.quota, { waitUntil: pace.waitUntil })
  }
  const model = requestedModel ?? routed

  const slot = acquireSlot()
  if (!slot) return fail(`All ${MAX_PARALLEL} Gemini slots are busy.`, EXIT.busy)

  const id = `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`
  mkdirSync(RUNS, { recursive: true })
  const eventLog = join(RUNS, `${id}.events.jsonl`)
  writeFileSync(eventLog, '')
  const settingsFile = writeRunSettings(id, execConfig.settings)

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
    stepNote: resumeConversationId ? 'resuming' : 'starting',
    pid: process.pid,
  }
  const panelCwd = worktree?.repo ?? worktreePlan?.panelCwd ?? cwd
  const save = rowWriter(panelCwd, row)
  save()
  // The panel marks a row with no update for 15 minutes as failed; a long build is not a failure.
  const heartbeat = setInterval(save, 30_000)

  try {
    if (!worktree && worktreePlan) {
      if (worktreePlan.mode === 'managed') {
        worktree = createWorktree(cwd, id, worktreePlan.previous)
      } else {
        worktree = attachExistingWorktree(worktreePlan.path, worktreePlan.mode)
      }
    }
    const runDir = worktree?.path ?? cwd
    const gitBefore = inspectGitState(runDir)
    const baseCommit = gitBefore.head

    const args = [
      '-p', prompt,
      '--model', model,
      '--mode', access === 'write' ? 'accept-edits' : 'plan',
      '--output-format', 'stream-json',
      '--print-timeout', `${execConfig.timeoutMin}m`,
      '--settings', settingsFile,
    ]
    if (execConfig.sandbox) args.push('--sandbox')
    if (resumeConversationId) args.push('--conversation', resumeConversationId)

    let envelope = null
    const commands = []
    const toolDenied = []
    const started = Date.now()
    const onLine = line => {
      try { appendFileSync(eventLog, `${line}\n`) } catch { /* best-effort log */ }
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
          const target = p.CommandLine
            ? String(p.CommandLine)
            : String(p.Path ?? p.TargetFile ?? p.Query ?? '').split(/[\\/]/).pop()
          row.stepNote = short(`${s.tool_name} ${target}`)
        } else if (s.state === 'DONE' && s.step_type === 'tool') {
          const ti = s.tool_info ?? {}
          const errMsg = ti.error?.message ?? ''
          if (/permission|denied|not allowed/i.test(errMsg)) {
            toolDenied.push({ action: s.tool_name ?? 'tool', tool: s.tool_name, reason: errMsg })
          }
          if (s.tool_name === 'run_command') {
            const exitCode = parseCommandExitCode(ti.output)
            const cmdOk = !ti.error && (exitCode === null || exitCode === 0)
            commands.push({
              command: String(ti.parameters?.CommandLine ?? ''),
              exitCode,
              ok: cmdOk,
              ...(errMsg ? { error: errMsg } : {}),
            })
          }
        }
        save()
      }
    }

    const res = await runAgy(args, { cwd: runDir, timeoutMs: execConfig.timeoutMin * 60e3 + 30e3, onLine })
    if (res.stderr.trim()) {
      try {
        appendFileSync(eventLog, `${JSON.stringify({ event: 'stderr', text: res.stderr })}\n`)
      } catch { /* best-effort log */ }
    }

    const deniedActions = normalizeDeniedActions(envelope?.denied_actions, toolDenied)
    const { status, ok, exitCode } = classifyRunOutcome({ res, envelope, deniedActions, commands })

    const gitAfter = inspectGitState(runDir)
    const head = gitAfter.head
    const commits = collectCommits(runDir, baseCommit, head)
    const commit = commits.length ? head : null
    const media = kind === 'media' && worktree ? collectMedia(envelope?.conversation_id, worktree.path, mediaDir) : []
    const changes = worktree
      ? worktreeChanges(worktree.path, { managed: worktree.managed, baseCommit })
      : null

    let after = null
    let quotaError = null
    try {
      after = await readQuota()
    } catch (err) {
      quotaError = err.message
    }
    const delta = w => (after ? before[w].remaining - after[w].remaining : null)
    const usage = envelope?.usage ?? null
    const turnUsage = computeTurnUsage(previousUsage, usage)

    const savedConfig = {
      allowCommands: execConfig.allowCommands,
      denyCommands: execConfig.denyCommands,
      readPaths: execConfig.readPaths,
      writePaths: execConfig.writePaths,
      allowLocalhost: execConfig.allowLocalhost,
      commandTimeoutMin: execConfig.commandTimeoutMin,
      timeoutMin: execConfig.timeoutMin,
      sandbox: execConfig.sandbox,
    }

    const record = {
      id,
      at: new Date(started).toISOString(),
      title,
      model,
      kind,
      size,
      access,
      paceMode: pace.mode,
      status,
      exitCode,
      cwd,
      profile: profilePath ?? null,
      continuedFrom,
      resumedFrom,
      conversationId: envelope?.conversation_id ?? resumeConversationId ?? null,
      durationSeconds: Math.round((Date.now() - started) / 1000),
      usage,
      turnUsage,
      quotaUsedPct: { weekly: delta('weekly'), fiveHour: delta('fiveHour') },
      baseCommit,
      head,
      commit,
      commits,
      deniedActions,
      commands: { total: commands.length, failed: commands.filter(c => !c.ok).length, runs: commands },
      eventLog,
    }

    appendFileSync(LEDGER, `${JSON.stringify(record)}\n`)
    writeFileSync(
      join(RUNS, `${id}.json`),
      JSON.stringify({ ...record, worktree, config: savedConfig, settingsFile, response: envelope?.response ?? null }, null, 2),
    )

    const warnings = [...execConfig.warnings]
    if (ok && access === 'write' && changes && changes.files.length === 0 && commits.length === 0) {
      warnings.push('Agent reported success but changed no files.')
    }
    // agy reports SUCCESS when the agent stops cleanly after every image call failed.
    if (kind === 'media' && access === 'write' && media.length === 0) {
      const capacity = /no capacity available|\bUNAVAILABLE\b|\b503\b/i.test(envelope?.response ?? '')
      warnings.push(
        capacity
          ? 'No images were generated: Gemini image capacity was unavailable (503). Retry later with gemini-image.mjs.'
          : 'No images were generated.',
      )
    }
    if (deniedActions.length) {
      warnings.push(`Denied actions: ${deniedActions.map(d => d.action).join(', ')}.`)
    }
    if (quotaError) warnings.push(`Could not read quota after the run: ${quotaError}`)
    if (!resumedFrom && worktree?.managed && worktree?.sourceHadUncommittedChanges) {
      warnings.push('Source repo had uncommitted changes that the fresh worktree does not include (use --worktree or --in-place to include them).')
    }
    if (gitBefore.inMerge) {
      warnings.push('Checkout was in a mid-merge state (MERGE_HEAD present) when the run started.')
    }

    row.status = ok ? 'done' : 'failed'
    row.endedAt = Date.now()
    row.tokens = turnUsage?.total_tokens ?? usage?.total_tokens ?? row.tokens
    row.stepNote = ok ? 'finished' : short(envelope?.error ?? status)

    let error
    if (!ok) {
      if (status === 'DENIED') {
        error = `Permission denied by agy in headless mode: ${deniedActions.map(d => d.action).join(', ')}. Add matching rules to the project profile.`
      } else if (status === 'COMMAND_FAILED') {
        const lastFail = [...commands].reverse().find(c => !c.ok)
        error = lastFail
          ? `Command failed (exit ${lastFail.exitCode ?? 'error'}): ${lastFail.command}`
          : 'One or more commands failed.'
      } else {
        error = envelope?.error ?? (res.stderr.trim().slice(0, 1000) || 'agy returned no result')
      }
    }

    print({
      ok,
      ...record,
      worktree: worktree && {
        path: worktree.path,
        branch: gitAfter.branch ?? worktree.branch,
        mode: worktree.mode,
        managed: worktree.managed,
        inMerge: gitAfter.inMerge,
      },
      changes,
      media,
      warnings,
      response: envelope?.response ?? null,
      error,
    })
    process.exitCode = exitCode
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

async function cmdStatus() {
  const windows = await readQuota()
  const report = buildReport({ rateLimits: [], gemini: { windows, asOf: Date.now() } })
  print({ ok: true, gemini: report.gemini })
}

async function cmdRun(v, cliOverrides) {
  const task = v['brief-file'] ? readFileSync(resolve(v['brief-file']), 'utf8') : v.brief
  if (!task?.trim()) return fail('Provide --brief-file <file> or --brief.', EXIT.usage)
  const title = v.title?.trim()
  if (!title) return fail('Provide --title, the task title from the plan.', EXIT.usage)
  const access = v.access ?? 'read'
  if (!['read', 'write'].includes(access)) return fail('--access must be read or write.', EXIT.usage)
  if (v.model && !/^gemini-/.test(v.model)) return fail('--model must be a Gemini model.', EXIT.usage)
  if (v['continue-from'] && access !== 'write') return fail('--continue-from needs --access write.', EXIT.usage)
  const previous = v['continue-from'] ? loadRun(v['continue-from']) : null
  if (previous && (!previous.worktree || !existsSync(previous.worktree.path))) {
    return fail(`Run ${previous.id} has no worktree to continue from.`, EXIT.usage)
  }
  const kind = v.kind ?? 'code'
  const size = v.size ?? 'm'
  const mediaDir = v['media-dir'] ?? 'generated-media'
  if (isAbsolute(mediaDir) || mediaDir.split(/[\\/]/).includes('..')) {
    return fail('--media-dir must be a folder inside the project.', EXIT.usage)
  }

  const cwd = resolve(v.cwd ?? process.cwd())
  const profileLookupDir = v.worktree ? resolve(v.worktree) : cwd
  const { path: profilePath, data: profile } = loadProfile(v.profile, profileLookupDir)
  const execConfig = buildExecutionConfig({ profile, cli: cliOverrides, access })

  const worktreeMode = v.worktree ? 'external' : v['in-place'] ? 'in-place' : 'managed'
  let worktreePlan = null
  if (access === 'write') {
    if (worktreeMode === 'external') {
      // Validate path upfront before quota/slot checks.
      const attached = attachExistingWorktree(v.worktree, 'external')
      worktreePlan = { mode: 'external', path: attached.path, panelCwd: attached.repo }
    } else if (worktreeMode === 'in-place') {
      const attached = attachExistingWorktree(cwd, 'in-place')
      worktreePlan = { mode: 'in-place', path: attached.path, panelCwd: attached.repo }
    } else {
      worktreePlan = { mode: 'managed', previous, panelCwd: cwd }
    }
  } else if (v.worktree) {
    // Allow --worktree on read runs to inspect a specific checkout directly.
    const attached = attachExistingWorktree(v.worktree, 'external')
    worktreePlan = { mode: 'external', path: attached.path, panelCwd: attached.repo }
  }

  const preamble = buildPreamble({ access, config: execConfig, worktreeMode })
  const prompt = `${preamble}\n\nTASK:\n${task}`

  return executeWorkerTurn({
    title,
    prompt,
    access,
    kind,
    size,
    requestedModel: v.model ?? null,
    cwd,
    mediaDir,
    profilePath,
    execConfig,
    worktreePlan,
    continuedFrom: previous?.id ?? null,
  })
}

async function cmdResume(runId, v, cliOverrides) {
  if (!runId) return fail('Usage: gemini-worker resume <run-id> --brief-file <file> | --brief <text>', EXIT.usage)
  const previous = loadRun(runId)
  if (!previous.conversationId) {
    return fail(`Run ${previous.id} has no conversationId to resume.`, EXIT.usage)
  }
  const followup = v['brief-file'] ? readFileSync(resolve(v['brief-file']), 'utf8') : v.brief
  if (!followup?.trim()) return fail('Provide --brief-file <file> or --brief for resume.', EXIT.usage)
  if (v.model && !/^gemini-/.test(v.model)) return fail('--model must be a Gemini model.', EXIT.usage)

  const targetDir = previous.worktree?.path ?? previous.cwd
  if (!targetDir || !existsSync(targetDir)) {
    return fail(`Working directory for run ${previous.id} no longer exists: ${targetDir}`, EXIT.failed)
  }

  const access = v.access ?? previous.access ?? 'write'
  if (!['read', 'write'].includes(access)) return fail('--access must be read or write.', EXIT.usage)
  const kind = v.kind ?? previous.kind ?? 'code'
  const size = v.size ?? previous.size ?? 'm'
  const title = v.title?.trim() || previous.title || `Resume ${previous.id}`
  const mediaDir = v['media-dir'] ?? 'generated-media'
  if (isAbsolute(mediaDir) || mediaDir.split(/[\\/]/).includes('..')) {
    return fail('--media-dir must be a folder inside the project.', EXIT.usage)
  }

  let profilePath = previous.profile ?? null
  let profile
  if (v.profile) {
    const loaded = loadProfile(v.profile, targetDir)
    profilePath = loaded.path
    profile = loaded.data
  } else if (profilePath && existsSync(profilePath)) {
    profile = loadProfile(profilePath, targetDir).data
  } else if (previous.config) {
    profile = validateProfile({
      allowCommands: previous.config.allowCommands,
      denyCommands: previous.config.denyCommands,
      readPaths: previous.config.readPaths,
      writePaths: previous.config.writePaths,
      allowLocalhost: previous.config.allowLocalhost,
      commandTimeoutMin: previous.config.commandTimeoutMin ?? undefined,
      timeoutMin: previous.config.timeoutMin ?? undefined,
      sandbox: previous.config.sandbox ?? undefined,
    })
  } else {
    profile = validateProfile({})
  }

  const execConfig = buildExecutionConfig({ profile, cli: cliOverrides, access })
  const worktree = previous.worktree ? { ...previous.worktree } : null

  return executeWorkerTurn({
    title,
    prompt: followup,
    access,
    kind,
    size,
    requestedModel: v.model ?? previous.model ?? null,
    cwd: previous.cwd ?? targetDir,
    mediaDir,
    profilePath,
    execConfig,
    worktree,
    resumedFrom: previous.id,
    resumeConversationId: previous.conversationId,
    previousUsage: previous.usage ?? null,
  })
}

function loadRun(id) {
  if (!/^[0-9]{14}-[0-9a-f]{6}$/.test(id ?? '')) throw new Error('Provide a valid run id.')
  const file = join(RUNS, `${id}.json`)
  if (!existsSync(file)) throw new Error(`No run ${id}.`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function cmdDiff(id) {
  const run = loadRun(id)
  if (!run.worktree || !existsSync(run.worktree.path)) return fail('This run has no worktree.', EXIT.usage)
  const baseRef = run.baseCommit ?? run.worktree.initialHead ?? 'HEAD'
  if (run.worktree.managed !== false) {
    git(run.worktree.path, 'add', '-A', '-N')
    console.log(git(run.worktree.path, 'diff', baseRef))
  } else {
    console.log(gitTry(run.worktree.path, 'diff', baseRef) ?? '')
  }
}

// Applies the run and any earlier runs it continues or resumes, oldest first, skipping already-applied ones.
function cmdApply(id) {
  const target = loadRun(id)
  if (!target.worktree) return fail('This run has no worktree.', EXIT.usage)
  if (target.worktree.managed === false) {
    return fail(
      `Run ${target.id} ran directly in ${target.worktree.path} (${target.worktree.mode}); its changes are already in that checkout.`,
      EXIT.usage,
    )
  }
  const chain = [target]
  while (chain[0].continuedFrom || chain[0].resumedFrom) {
    chain.unshift(loadRun(chain[0].continuedFrom ?? chain[0].resumedFrom))
  }
  const applied = []
  const appliedPaths = new Set()
  for (const run of chain) {
    if (run.appliedAt) continue
    if (!run.worktree || !existsSync(run.worktree.path)) {
      return fail(`Run ${run.id} has no worktree to apply.`, EXIT.failed, { applied })
    }
    if (!appliedPaths.has(run.worktree.path)) {
      const baseRef = run.baseCommit ?? run.worktree.initialHead ?? 'HEAD'
      const patch = worktreePatch(run.worktree.path, baseRef)
      if (patch.length) gitBytes(run.worktree.repo, patch, 'apply', '--whitespace=nowarn')
      appliedPaths.add(run.worktree.path)
    }
    run.appliedAt = new Date().toISOString()
    writeFileSync(join(RUNS, `${run.id}.json`), JSON.stringify(run, null, 2))
    applied.push(run.id)
  }
  print({ ok: true, applied, project: chain.at(-1).worktree?.repo })
}

function cmdDiscard(id) {
  const run = loadRun(id)
  if (!run.worktree) return fail('This run has no worktree.', EXIT.usage)
  if (run.worktree.managed === false) {
    return fail(
      `Refusing to discard unmanaged checkout ${run.worktree.path} (${run.worktree.mode}).`,
      EXIT.usage,
    )
  }
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
    const tokens = (r.turnUsage ?? r.usage)?.total_tokens ?? 0
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

async function main() {
  let parsed
  try {
    parsed = parseWorkerCli(process.argv.slice(2))
  } catch (err) {
    return fail(err.message, EXIT.usage)
  }

  const { command, arg, values, cliOverrides } = parsed
  const commands = {
    status: cmdStatus,
    run: () => cmdRun(values, cliOverrides),
    resume: () => cmdResume(arg, values, cliOverrides),
    diff: () => cmdDiff(arg),
    apply: () => cmdApply(arg),
    discard: () => cmdDiscard(arg),
    report: cmdReport,
  }

  if (!commands[command]) {
    return fail(`Usage: gemini-worker <${Object.keys(commands).join('|')}> [options]`, EXIT.usage)
  }
  try {
    await commands[command]()
  } catch (err) {
    const isUsage = /Profile|Unknown key|must be|Cannot |Refusing |Path "|Invalid allowHosts|Valid run id|Provide a valid run id/i.test(err.message ?? '')
    fail(err.stderr?.toString().trim() || err.message, isUsage ? EXIT.usage : EXIT.failed)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main()
}
