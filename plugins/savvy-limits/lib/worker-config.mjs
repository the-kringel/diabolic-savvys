// Pure configuration, profile, permission-rule, and result-classification helpers
// for gemini-worker.mjs. Kept free of agy execution so it is fast to unit-test.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

export const EXIT = {
  ok: 0,
  failed: 1,
  usage: 2,
  quota: 3,
  blocked: 3,
  busy: 4,
  denied: 5,
  commandFailed: 6,
}

const PROFILE_KEYS = new Set([
  'allowCommands',
  'denyCommands',
  'readPaths',
  'writePaths',
  'allowLocalhost',
  'allowHosts',
  'commandTimeoutMin',
  'timeoutMin',
  'sandbox',
])

const REGEX_SPECIAL = /[.+?^${}()|[\]\\]/g
const WILDCARD_COMMAND_RE = /^(\*|\.\*|\.\+|\^\.\*\$?|\^\.\+\$?)$/
const HOST_RE = /^[a-z0-9.-]+(?::\d+)?$|^\[[0-9a-f:]+\](?::\d+)?$/i

export function expandEnvPath(raw, env = process.env, home = homedir()) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Path entries must be non-empty strings.')
  }
  const missing = []
  let out = raw.trim()
  if (out === '~' || /^~[\\/]/.test(out)) {
    out = home + out.slice(1)
  }
  const lookup = name => {
    if (Object.hasOwn(env, name) && env[name] !== undefined && env[name] !== '') return env[name]
    const lower = name.toLowerCase()
    for (const [k, v] of Object.entries(env)) {
      if (k.toLowerCase() === lower && v !== undefined && v !== '') return v
    }
    return undefined
  }
  out = out.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (full, name) => {
    const val = lookup(name)
    if (val === undefined) {
      missing.push(name)
      return full
    }
    return val
  })
  out = out.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (full, name) => {
    const val = lookup(name)
    if (val === undefined) {
      missing.push(name)
      return full
    }
    return val
  })
  return { path: out, missing }
}

// agy normalizes Windows paths by stripping drive letters (C:) and turning \ into /.
export function normalizeAgyPath(p) {
  const cleaned = String(p)
    .trim()
    .replace(/^[A-Za-z]:/, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
  return cleaned || '/'
}

function assertSafePathTarget(norm, raw) {
  if (!norm || norm === '/' || norm === '*' || norm === '/*') {
    throw new Error(`Path "${raw}" is too broad; specify a subdirectory instead of filesystem root or wildcard.`)
  }
}

function escapeRegexLiteral(s) {
  return s.replace(REGEX_SPECIAL, '\\$&')
}

function globToRegex(pattern, platform) {
  // Escape regex metacharacters except '*', turn '*' into '.*'.
  // On Windows, let '/' match both '/' and '\' so ./Tools/test.ps1* matches .\Tools\test.ps1 too.
  let out = ''
  for (const ch of pattern) {
    if (ch === '*') {
      out += '.*'
    } else if (platform === 'win32' && (ch === '/' || ch === '\\')) {
      out += '[\\\\/]'
    } else {
      out += escapeRegexLiteral(ch)
    }
  }
  return out
}

// Maps one human-friendly command entry (or raw command(...) / regex:... rule)
// into one or more agy permission rule strings.
export function compileCommandRules(entry, { allow = true, platform = process.platform } = {}) {
  if (typeof entry !== 'string' || !entry.trim()) {
    throw new Error('Command rules must be non-empty strings.')
  }
  const trimmed = entry.trim()
  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    throw new Error(`Command rule must be single-line: ${JSON.stringify(entry)}`)
  }

  // Raw agy command(...) rule
  const rawMatch = /^command\((.*)\)$/.exec(trimmed)
  if (rawMatch) {
    const inner = rawMatch[1].trim()
    if (!inner) throw new Error(`Empty command() rule: ${trimmed}`)
    const check = inner.startsWith('regex:') ? inner.slice('regex:'.length).trim() : inner
    if (allow && WILDCARD_COMMAND_RE.test(check)) {
      throw new Error(`Refusing blanket wildcard command rule "${trimmed}"; list specific commands instead.`)
    }
    return [`command(${inner})`]
  }

  // Explicit regex:... rule
  if (trimmed.startsWith('regex:')) {
    const pat = trimmed.slice('regex:'.length).trim()
    if (!pat) throw new Error(`Empty regex command rule: ${trimmed}`)
    if (allow && WILDCARD_COMMAND_RE.test(pat)) {
      throw new Error(`Refusing blanket wildcard command rule "${trimmed}"; list specific commands instead.`)
    }
    return [`command(regex:${pat})`]
  }

  if (allow && WILDCARD_COMMAND_RE.test(trimmed)) {
    throw new Error(`Refusing blanket wildcard command rule "${trimmed}"; list specific commands instead.`)
  }

  // Glob entry containing '*' (e.g. "./Tools/test.ps1*")
  if (trimmed.includes('*')) {
    const rx = globToRegex(trimmed, platform)
    return [`command(regex:${rx})`]
  }

  // Plain command prefix (e.g. "git commit", "powershell ./Tools/build.ps1", "npm test").
  // On Windows PowerShell, agy falls back to exact matching for multi-word commands unless
  // a regex: rule is present, so emit exact + prefix-with-args regex rules cleanly.
  const escaped = globToRegex(trimmed, platform)
  if (platform === 'win32') {
    return [`command(regex:${escaped})`, `command(regex:${escaped} .*)`]
  }
  return [`command(${trimmed})`, `command(regex:${escaped} .*)`]
}

export function resolveProfilePath(profileArg, cwd) {
  if (!profileArg?.trim()) return null
  const arg = profileArg.trim()
  if (arg === 'default') {
    const p = join(cwd, '.savvy', 'gemini.json')
    if (!existsSync(p)) throw new Error(`Default profile not found: ${p}`)
    return p
  }
  const hasSep = /[\\/]/.test(arg) || arg.endsWith('.json')
  const candidates = []
  if (isAbsolute(arg)) {
    candidates.push(arg)
  } else if (hasSep) {
    candidates.push(resolve(cwd, arg))
    candidates.push(resolve(arg))
  } else {
    candidates.push(join(cwd, '.savvy', `${arg}.json`))
    candidates.push(join(cwd, '.savvy', `gemini.${arg}.json`))
    candidates.push(resolve(cwd, arg))
  }
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(`Profile not found: ${arg} (checked ${candidates.join(', ')})`)
}

function asStringArray(val, name) {
  if (val === undefined) return []
  if (!Array.isArray(val) || !val.every(x => typeof x === 'string')) {
    throw new Error(`Profile field "${name}" must be an array of strings.`)
  }
  return val
}

function asPositiveNumber(val, name) {
  if (val === undefined || val === null) return null
  const n = Number(val)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`"${name}" must be a positive number.`)
  }
  return n
}

export function validateProfile(raw, source = 'profile') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${source} must be a JSON object.`)
  }
  for (const key of Object.keys(raw)) {
    if (!PROFILE_KEYS.has(key)) {
      throw new Error(`Unknown key "${key}" in ${source}. Allowed: ${[...PROFILE_KEYS].join(', ')}.`)
    }
  }
  if (raw.allowLocalhost !== undefined && typeof raw.allowLocalhost !== 'boolean') {
    throw new Error(`Profile field "allowLocalhost" must be a boolean.`)
  }
  if (raw.sandbox !== undefined && typeof raw.sandbox !== 'boolean') {
    throw new Error(`Profile field "sandbox" must be a boolean.`)
  }
  return {
    allowCommands: asStringArray(raw.allowCommands, 'allowCommands'),
    denyCommands: asStringArray(raw.denyCommands, 'denyCommands'),
    readPaths: asStringArray(raw.readPaths, 'readPaths'),
    writePaths: asStringArray(raw.writePaths, 'writePaths'),
    allowLocalhost: raw.allowLocalhost ?? false,
    allowHosts: asStringArray(raw.allowHosts, 'allowHosts'),
    commandTimeoutMin: asPositiveNumber(raw.commandTimeoutMin, 'commandTimeoutMin'),
    timeoutMin: asPositiveNumber(raw.timeoutMin, 'timeoutMin'),
    sandbox: raw.sandbox ?? null,
  }
}

export function loadProfile(profileArg, cwd) {
  const path = resolveProfilePath(profileArg, cwd)
  if (!path) return { path: null, data: validateProfile({}) }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`Failed to parse profile ${path}: ${err.message}`)
  }
  return { path, data: validateProfile(parsed, path) }
}

const dedupe = arr => [...new Set(arr)]

// Merges profile settings with CLI overrides and compiles agy settings.json + flags.
export function buildExecutionConfig({
  profile = validateProfile({}),
  cli = {},
  access = 'read',
  platform = process.platform,
  env = process.env,
  home = homedir(),
} = {}) {
  const warnings = []
  const allowCommands = access === 'write'
    ? dedupe([...profile.allowCommands, ...(cli.allowCommands ?? [])])
    : []
  const denyCommands = dedupe([...profile.denyCommands, ...(cli.denyCommands ?? [])])
  const readPaths = dedupe([...profile.readPaths, ...(cli.readPaths ?? [])])
  const writePaths = access === 'write'
    ? dedupe([...profile.writePaths, ...(cli.writePaths ?? [])])
    : []
  const allowLocalhost = Boolean(profile.allowLocalhost || cli.allowLocalhost)
  const allowHosts = dedupe([...profile.allowHosts, ...(cli.allowHosts ?? [])])

  const commandTimeoutMin = asPositiveNumber(cli.commandTimeoutMin ?? profile.commandTimeoutMin, 'command-timeout-min')
  const explicitTimeoutMin = asPositiveNumber(cli.timeoutMin ?? profile.timeoutMin, 'timeout-min')
  // Overall turn timeout must cover at least one full long command plus headroom.
  const defaultTimeout = commandTimeoutMin ? Math.max(20, commandTimeoutMin + 10) : 20
  const timeoutMin = Math.max(explicitTimeoutMin ?? defaultTimeout, commandTimeoutMin ?? 0)

  const allow = []
  const deny = []

  for (const cmd of allowCommands) {
    allow.push(...compileCommandRules(cmd, { allow: true, platform }))
  }
  for (const cmd of denyCommands) {
    deny.push(...compileCommandRules(cmd, { allow: false, platform }))
  }

  const expandedReadPaths = []
  for (const raw of readPaths) {
    const { path, missing } = expandEnvPath(raw, env, home)
    if (missing.length) {
      warnings.push(`Skipped readPath "${raw}": unset env var(s) ${missing.join(', ')}.`)
      continue
    }
    const norm = normalizeAgyPath(path)
    assertSafePathTarget(norm, raw)
    expandedReadPaths.push(path)
    allow.push(`read_file(${norm})`)
  }

  const expandedWritePaths = []
  for (const raw of writePaths) {
    const { path, missing } = expandEnvPath(raw, env, home)
    if (missing.length) {
      warnings.push(`Skipped writePath "${raw}": unset env var(s) ${missing.join(', ')}.`)
      continue
    }
    const norm = normalizeAgyPath(path)
    assertSafePathTarget(norm, raw)
    expandedWritePaths.push(path)
    allow.push(`write_file(${norm})`)
  }

  if (allowLocalhost) {
    allow.push('read_url(localhost)', 'read_url(127.0.0.1)')
  }
  for (const host of allowHosts) {
    const h = host.trim()
    if (!h || h === '*' || !HOST_RE.test(h)) {
      throw new Error(`Invalid allowHosts entry "${host}". Provide a hostname like "example.com".`)
    }
    allow.push(`read_url(${h})`)
  }

  const hasCommands = allowCommands.length > 0
  const hasExternalPaths = expandedReadPaths.length > 0 || expandedWritePaths.length > 0

  // Sandbox choice:
  // - Explicit CLI --sandbox / --no-sandbox wins, then profile.sandbox.
  // - When no commands are allowed, keep sandbox enabled (legacy safe default).
  // - On Windows when commands are allowed, default sandbox off because agy 1.5.16's
  //   headless Windows AppContainer sandbox exits child commands with 0xC0000142
  //   (STATUS_DLL_INIT_FAILED) and blocks localhost loopback; toolPermission: "request-review"
  //   + scoped permissions.allow/deny still strictly enforces the command allowlist.
  let sandbox
  if (typeof cli.sandbox === 'boolean') sandbox = cli.sandbox
  else if (typeof profile.sandbox === 'boolean') sandbox = profile.sandbox
  else sandbox = !(hasCommands && platform === 'win32')

  if (sandbox && hasCommands && platform === 'win32') {
    warnings.push('Windows headless --sandbox is enabled with command execution; agy 1.5.16 Windows AppContainer may fail child commands with -1073741502 (0xC0000142). Set "sandbox": false in the profile or pass --no-sandbox if commands fail.')
  }

  // Never enable paid AI credits, never use always-proceed / --dangerously-skip-permissions.
  const settings = {
    useG1Credits: false,
    toolPermission: 'request-review',
    enableTerminalSandbox: sandbox,
    ...(hasExternalPaths ? { allowNonWorkspaceAccess: true } : {}),
    ...(allow.length || deny.length
      ? {
          permissions: {
            ...(allow.length ? { allow: dedupe(allow) } : {}),
            ...(deny.length ? { deny: dedupe(deny) } : {}),
          },
        }
      : {}),
  }

  return {
    settings,
    sandbox,
    hasCommands,
    allowCommands,
    denyCommands,
    readPaths: expandedReadPaths,
    writePaths: expandedWritePaths,
    allowLocalhost,
    commandTimeoutMin,
    timeoutMin,
    warnings,
  }
}

export function buildPreamble({ access, config, worktreeMode }) {
  const NO_TERMINAL =
    'Never use the terminal or run_command tool, not even to list files, because terminal commands are denied here and will end your run. Use only the file read, search, and edit tools.'

  if (access === 'read') {
    const extra = config.readPaths.length
      ? ` You may read these extra paths outside the repo: ${config.readPaths.join(', ')}.`
      : ''
    return `You are a delegated read-only agent. Do not modify files. ${NO_TERMINAL}${extra} End with concrete findings and file:line references.`
  }

  const location =
    worktreeMode === 'external' || worktreeMode === 'in-place'
      ? 'You are a delegated agent working directly in an existing git checkout. Preserve unrelated uncommitted or mid-merge changes.'
      : 'You are a delegated agent in an isolated git worktree.'

  if (!config.hasCommands) {
    const extra = config.readPaths.length
      ? ` You may read these extra paths outside the repo: ${config.readPaths.join(', ')}.`
      : ''
    return `${location} Change only what the task needs. Do not touch anything outside this directory.${extra} ${NO_TERMINAL} The orchestrator will run builds and tests. End with: files changed, what still needs checking, and anything unfinished.`
  }

  const lines = [
    `${location} Change only what the task needs.`,
    `Scoped terminal commands are allowed via run_command: ${config.allowCommands.join(', ')}.`,
    'Do NOT run any command outside that allowlist (unlisted commands are auto-denied in headless mode and immediately abort your turn). Do not chain commands with &&, ;, or $(...) unless each command matches the allowlist; prefer one allowlisted command per run_command call.',
  ]
  if (config.readPaths.length) {
    lines.push(`Extra read-only paths allowed: ${config.readPaths.join(', ')}.`)
  }
  if (config.writePaths.length) {
    lines.push(`Extra writable cache paths allowed: ${config.writePaths.join(', ')}.`)
  }
  if (config.commandTimeoutMin) {
    lines.push(`Long build/test commands may take up to ${config.commandTimeoutMin} minutes; wait for them to finish instead of aborting early or polling in sleep loops.`)
  }
  lines.push('Run the required build/test commands, fix any errors you introduce, and commit if the task asks for it. End with: files changed, commands run and their outcomes, commit hash (if committed), and anything unfinished.')
  return lines.join(' ')
}

export function parseCommandExitCode(output) {
  const m = /Command exited with code (-?\d+)\./.exec(String(output ?? ''))
  return m ? Number(m[1]) : null
}

export function classifyRunOutcome({ res, envelope, deniedActions, commands }) {
  const said = [envelope?.error, envelope?.response, res.stderr].filter(Boolean).join('\n')
  const quotaHit = /credits balance|quota exhausted|usage limit|limit (reached|exceeded)|RESOURCE_EXHAUSTED|\b429\b/i.test(said)
  const timeoutHit = Boolean(
    res.timedOut ||
      /DEADLINE_EXCEEDED|"reason"\s*:\s*"print_timeout"|print timeout after/i.test(said),
  )

  const envStatus = envelope?.status ?? 'ERROR'
  const emptyResponse = !envelope?.response?.trim()
  const deniedList = deniedActions ?? []
  const failedCmds = (commands ?? []).filter(c => !c.ok)
  const lastCmd = (commands ?? []).at(-1) ?? null
  const allCmdsFailed = (commands ?? []).length > 0 && failedCmds.length === commands.length

  if (timeoutHit) {
    return { status: 'TIMEOUT', ok: false, exitCode: EXIT.failed }
  }
  if (quotaHit && envStatus !== 'SUCCESS') {
    return { status: 'QUOTA', ok: false, exitCode: EXIT.quota }
  }
  if (deniedList.length > 0 && (emptyResponse || envStatus !== 'SUCCESS')) {
    return { status: 'DENIED', ok: false, exitCode: EXIT.denied }
  }
  if (envStatus !== 'SUCCESS') {
    return {
      status: envStatus,
      ok: false,
      exitCode: failedCmds.length > 0 ? EXIT.commandFailed : EXIT.failed,
    }
  }
  if (allCmdsFailed || (lastCmd && !lastCmd.ok)) {
    return { status: 'COMMAND_FAILED', ok: false, exitCode: EXIT.commandFailed }
  }
  return { status: 'SUCCESS', ok: true, exitCode: EXIT.ok }
}

export function computeTurnUsage(prevUsage, currUsage) {
  if (!currUsage) return null
  if (!prevUsage) return { ...currUsage }
  const diff = key => Math.max(0, (currUsage[key] ?? 0) - (prevUsage[key] ?? 0))
  return {
    input_tokens: diff('input_tokens'),
    output_tokens: diff('output_tokens'),
    thinking_tokens: diff('thinking_tokens'),
    cache_read_tokens: diff('cache_read_tokens'),
    total_tokens: diff('total_tokens'),
  }
}

export function parseWorkerCli(argv) {
  if (argv.includes('--dangerously-skip-permissions')) {
    throw new Error('--dangerously-skip-permissions is forbidden. Use --profile or --allow-cmd with scoped command rules instead.')
  }
  const { values, positionals } = parseArgs({
    args: argv,
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
      'command-timeout-min': { type: 'string' },
      'continue-from': { type: 'string' },
      'media-dir': { type: 'string' },
      profile: { type: 'string' },
      worktree: { type: 'string' },
      'in-place': { type: 'boolean' },
      'allow-cmd': { type: 'string', multiple: true },
      'deny-cmd': { type: 'string', multiple: true },
      'read-path': { type: 'string', multiple: true },
      'write-path': { type: 'string', multiple: true },
      'allow-localhost': { type: 'boolean' },
      'allow-host': { type: 'string', multiple: true },
      sandbox: { type: 'boolean' },
      'no-sandbox': { type: 'boolean' },
    },
  })
  if (values.sandbox && values['no-sandbox']) {
    throw new Error('Cannot pass both --sandbox and --no-sandbox.')
  }
  if (values.worktree && values['in-place']) {
    throw new Error('Cannot combine --worktree and --in-place.')
  }
  if (values['continue-from'] && (values.worktree || values['in-place'])) {
    throw new Error('Cannot combine --continue-from with --worktree or --in-place.')
  }
  const sandbox = values.sandbox ? true : values['no-sandbox'] ? false : undefined
  const cliOverrides = {
    allowCommands: values['allow-cmd'] ?? [],
    denyCommands: values['deny-cmd'] ?? [],
    readPaths: values['read-path'] ?? [],
    writePaths: values['write-path'] ?? [],
    allowLocalhost: Boolean(values['allow-localhost']),
    allowHosts: values['allow-host'] ?? [],
    commandTimeoutMin: values['command-timeout-min'] !== undefined ? Number(values['command-timeout-min']) : undefined,
    timeoutMin: values['timeout-min'] !== undefined ? Number(values['timeout-min']) : undefined,
    sandbox,
  }
  return { command: positionals[0], arg: positionals[1], values, positionals, cliOverrides }
}
