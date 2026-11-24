// Run with: node --test plugins/savvy-limits/bin/gemini-worker.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  EXIT,
  buildExecutionConfig,
  buildPreamble,
  classifyRunOutcome,
  compileCommandRules,
  computeTurnUsage,
  expandEnvPath,
  loadProfile,
  normalizeAgyPath,
  parseCommandExitCode,
  parseWorkerCli,
  resolveProfilePath,
  validateProfile,
} from '../lib/worker-config.mjs'

const WORKER = resolve(import.meta.dirname, 'gemini-worker.mjs')

test('parses CLI arguments and enforces safety / mutual-exclusion constraints', () => {
  const r = parseWorkerCli([
    'run',
    '--title', 'Fix collision',
    '--access', 'write',
    '--profile', '.savvy/gemini.json',
    '--allow-cmd', 'git status',
    '--allow-cmd', 'node test.mjs',
    '--read-path', 'C:/UE/Source',
    '--write-path', '%LOCALAPPDATA%/UBT',
    '--allow-localhost',
    '--command-timeout-min', '25',
    '--timeout-min', '60',
    '--in-place',
  ])
  assert.equal(r.command, 'run')
  assert.equal(r.values.title, 'Fix collision')
  assert.equal(r.values['in-place'], true)
  assert.deepEqual(r.cliOverrides.allowCommands, ['git status', 'node test.mjs'])
  assert.deepEqual(r.cliOverrides.readPaths, ['C:/UE/Source'])
  assert.deepEqual(r.cliOverrides.writePaths, ['%LOCALAPPDATA%/UBT'])
  assert.equal(r.cliOverrides.allowLocalhost, true)
  assert.equal(r.cliOverrides.commandTimeoutMin, 25)
  assert.equal(r.cliOverrides.timeoutMin, 60)

  const res = parseWorkerCli(['resume', '20261124201714-c94ca9', '--brief-file', 'followup.md', '--no-sandbox'])
  assert.equal(res.command, 'resume')
  assert.equal(res.arg, '20261124201714-c94ca9')
  assert.equal(res.cliOverrides.sandbox, false)

  assert.throws(() => parseWorkerCli(['run', '--dangerously-skip-permissions']), /forbidden/)
  assert.throws(() => parseWorkerCli(['run', '--worktree', 'a', '--in-place']), /Cannot combine --worktree and --in-place/)
  assert.throws(() => parseWorkerCli(['run', '--continue-from', '20261124201714-c94ca9', '--in-place']), /Cannot combine --continue-from/)
  assert.throws(() => parseWorkerCli(['run', '--sandbox', '--no-sandbox']), /Cannot pass both --sandbox and --no-sandbox/)
})

test('expands Windows %VAR%, ${VAR}, and ~ paths and normalizes for agy', () => {
  const env = { LOCALAPPDATA: 'C:\\Users\\nick\\AppData\\Local', UE_ROOT: 'D:/Epic/UE_5.8' }
  const a = expandEnvPath('%LOCALAPPDATA%/UnrealBuildTool', env, 'C:\\Users\\nick')
  assert.deepEqual(a, { path: 'C:\\Users\\nick\\AppData\\Local/UnrealBuildTool', missing: [] })
  assert.equal(normalizeAgyPath(a.path), '/Users/nick/AppData/Local/UnrealBuildTool')

  const b = expandEnvPath('${UE_ROOT}/Engine/Source/', env, '/home/nick')
  assert.equal(normalizeAgyPath(b.path), '/Epic/UE_5.8/Engine/Source')

  const c = expandEnvPath('~/cache/ubt', env, '/home/nick')
  assert.equal(normalizeAgyPath(c.path), '/home/nick/cache/ubt')

  const missing = expandEnvPath('%DOES_NOT_EXIST%/foo', env, '/home/nick')
  assert.deepEqual(missing.missing, ['DOES_NOT_EXIST'])
})

test('compiles scoped command rules for Windows and POSIX and blocks blanket wildcards', () => {
  assert.deepEqual(
    compileCommandRules('powershell ./Tools/build.ps1', { platform: 'win32' }),
    [
      'command(regex:powershell \\.[\\\\/]Tools[\\\\/]build\\.ps1)',
      'command(regex:powershell \\.[\\\\/]Tools[\\\\/]build\\.ps1 .*)',
    ],
  )
  assert.deepEqual(
    compileCommandRules('./Tools/test.ps1*', { platform: 'win32' }),
    ['command(regex:\\.[\\\\/]Tools[\\\\/]test\\.ps1.*)'],
  )
  assert.deepEqual(
    compileCommandRules('git commit', { platform: 'linux' }),
    ['command(git commit)', 'command(regex:git commit .*)'],
  )
  assert.deepEqual(
    compileCommandRules('regex:git (status|diff|log).*', { platform: 'win32' }),
    ['command(regex:git (status|diff|log).*)'],
  )
  assert.deepEqual(
    compileCommandRules('command(npm test)', { platform: 'linux' }),
    ['command(npm test)'],
  )

  for (const bad of ['*', '.*', 'command(*)', 'regex:.*', 'regex:.+', 'command(regex:.*)']) {
    assert.throws(() => compileCommandRules(bad, { allow: true }), /blanket wildcard/)
  }
})

test('loads, validates, and resolves per-project profiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'savvy-prof-'))
  try {
    mkdirSync(join(dir, '.savvy'), { recursive: true })
    const profPath = join(dir, '.savvy', 'gemini.json')
    writeFileSync(profPath, JSON.stringify({
      allowCommands: ['powershell ./Tools/build.ps1', './Tools/test.ps1*', 'git add', 'git commit'],
      denyCommands: ['git push'],
      readPaths: ['C:/Program Files/Epic Games/UE_5.8/Engine/Source'],
      writePaths: ['%LOCALAPPDATA%/UnrealBuildTool', '%LOCALAPPDATA%/UnrealEngine'],
      allowLocalhost: true,
      commandTimeoutMin: 25,
      timeoutMin: 60,
    }))

    assert.equal(resolveProfilePath('default', dir), profPath)
    assert.equal(resolveProfilePath('.savvy/gemini.json', dir), profPath)
    assert.equal(resolveProfilePath('gemini', dir), profPath)

    const loaded = loadProfile('default', dir)
    assert.equal(loaded.path, profPath)
    assert.equal(loaded.data.commandTimeoutMin, 25)
    assert.equal(loaded.data.allowLocalhost, true)

    assert.throws(() => resolveProfilePath('missing', dir), /Profile not found/)
    assert.throws(() => validateProfile({ unknownField: 1 }), /Unknown key/)
    assert.throws(() => validateProfile({ allowCommands: 'git status' }), /array of strings/)
    assert.throws(() => validateProfile({ commandTimeoutMin: 0 }), /positive number/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('builds agy settings from profile + CLI overrides and enforces read-only isolation', () => {
  const profile = validateProfile({
    allowCommands: ['./Tools/test.ps1*', 'git commit'],
    denyCommands: ['git push'],
    readPaths: ['C:/Program Files/Epic Games/UE_5.8/Engine/Source'],
    writePaths: ['%LOCALAPPDATA%/UnrealBuildTool'],
    allowLocalhost: true,
    commandTimeoutMin: 25,
  })
  const env = { LOCALAPPDATA: 'C:\\Users\\nick\\AppData\\Local' }

  // Write run on Windows: commands + writePaths + readPaths + localhost + sandbox default off on win32
  const w = buildExecutionConfig({ profile, access: 'write', platform: 'win32', env })
  assert.equal(w.settings.useG1Credits, false)
  assert.equal(w.settings.toolPermission, 'request-review')
  assert.equal(w.settings.allowNonWorkspaceAccess, true)
  assert.equal(w.sandbox, false)
  assert.equal(w.timeoutMin, 35) // commandTimeoutMin (25) + 10m headroom
  assert.ok(w.settings.permissions.allow.includes('read_file(/Program Files/Epic Games/UE_5.8/Engine/Source)'))
  assert.ok(w.settings.permissions.allow.includes('write_file(/Users/nick/AppData/Local/UnrealBuildTool)'))
  assert.ok(w.settings.permissions.allow.includes('read_url(localhost)'))
  assert.ok(w.settings.permissions.allow.includes('read_url(127.0.0.1)'))
  assert.ok(w.settings.permissions.deny.some(r => r.includes('git push')))

  // Write run on Linux: sandbox defaults to true
  const linux = buildExecutionConfig({ profile, access: 'write', platform: 'linux', env })
  assert.equal(linux.sandbox, true)
  assert.equal(linux.settings.enableTerminalSandbox, true)

  // Read run: strips writePaths and allowCommands, keeps readPaths!
  const r = buildExecutionConfig({ profile, access: 'read', platform: 'win32', env })
  assert.equal(r.hasCommands, false)
  assert.equal(r.sandbox, true)
  assert.ok(r.settings.permissions.allow.includes('read_file(/Program Files/Epic Games/UE_5.8/Engine/Source)'))
  assert.ok(!r.settings.permissions.allow.some(x => x.startsWith('write_file(') || x.startsWith('command(')))

  // Rejects overly broad paths
  assert.throws(
    () => buildExecutionConfig({ profile: validateProfile({ readPaths: ['C:/'] }), access: 'read', env }),
    /too broad/,
  )
})

test('preamble reflects no-terminal vs scoped-command mode and checkout mode', () => {
  const noCmd = buildExecutionConfig({ access: 'write', platform: 'win32' })
  const p1 = buildPreamble({ access: 'write', config: noCmd, worktreeMode: 'managed' })
  assert.match(p1, /Never use the terminal/)
  assert.match(p1, /isolated git worktree/)

  const withCmd = buildExecutionConfig({
    profile: validateProfile({ allowCommands: ['npm test', 'git commit'], commandTimeoutMin: 25 }),
    access: 'write',
    platform: 'win32',
  })
  const p2 = buildPreamble({ access: 'write', config: withCmd, worktreeMode: 'external' })
  assert.match(p2, /existing git checkout/)
  assert.match(p2, /npm test, git commit/)
  assert.match(p2, /up to 25 minutes/)
  assert.doesNotMatch(p2, /Never use the terminal/)
})

test('parses command exit codes and classifies outcomes into distinct exit codes', () => {
  assert.equal(parseCommandExitCode('Command exited with code 0.\n\nOK'), 0)
  assert.equal(parseCommandExitCode('Command exited with code 1.\n\nFAIL'), 1)
  assert.equal(parseCommandExitCode('Command exited with code -1073741502.'), -1073741502)
  assert.equal(parseCommandExitCode('no code here'), null)

  // Self-healed test failure (failed then passed) -> SUCCESS (0)
  assert.deepEqual(
    classifyRunOutcome({
      res: { timedOut: false, stderr: '' },
      envelope: { status: 'SUCCESS', response: 'Fixed and committed.' },
      deniedActions: [],
      commands: [
        { command: 'npm test', exitCode: 1, ok: false },
        { command: 'npm test', exitCode: 0, ok: true },
        { command: 'git commit -m fix', exitCode: 0, ok: true },
      ],
    }),
    { status: 'SUCCESS', ok: true, exitCode: EXIT.ok },
  )

  // Permission denied -> DENIED (5)
  assert.deepEqual(
    classifyRunOutcome({
      res: { timedOut: false, stderr: '' },
      envelope: { status: 'SUCCESS', response: '' },
      deniedActions: [{ action: 'command' }],
      commands: [],
    }),
    { status: 'DENIED', ok: false, exitCode: EXIT.denied },
  )

  // Unrecovered command failure -> COMMAND_FAILED (6)
  assert.deepEqual(
    classifyRunOutcome({
      res: { timedOut: false, stderr: '' },
      envelope: { status: 'SUCCESS', response: 'Tests still fail.' },
      deniedActions: [],
      commands: [{ command: 'npm test', exitCode: 1, ok: false }],
    }),
    { status: 'COMMAND_FAILED', ok: false, exitCode: EXIT.commandFailed },
  )

  // Mid-run quota error -> QUOTA (3)
  assert.deepEqual(
    classifyRunOutcome({
      res: { timedOut: false, stderr: 'Weekly quota exhausted' },
      envelope: { status: 'ERROR', error: 'quota exhausted' },
      deniedActions: [],
      commands: [],
    }),
    { status: 'QUOTA', ok: false, exitCode: EXIT.quota },
  )

  // Print timeout -> TIMEOUT (1)
  assert.deepEqual(
    classifyRunOutcome({
      res: { timedOut: true, stderr: '' },
      envelope: null,
      deniedActions: [],
      commands: [],
    }),
    { status: 'TIMEOUT', ok: false, exitCode: EXIT.failed },
  )
})

test('computes per-turn usage delta for resumed conversations', () => {
  const delta = computeTurnUsage(
    { input_tokens: 1000, output_tokens: 200, thinking_tokens: 50, cache_read_tokens: 500, total_tokens: 1200 },
    { input_tokens: 1400, output_tokens: 350, thinking_tokens: 90, cache_read_tokens: 1300, total_tokens: 1750 },
  )
  assert.deepEqual(delta, {
    input_tokens: 400,
    output_tokens: 150,
    thinking_tokens: 40,
    cache_read_tokens: 800,
    total_tokens: 550,
  })
})

test('CLI smoke checks: rejects forbidden flags, missing profiles, and unmanaged discard/apply', () => {
  const home = mkdtempSync(join(tmpdir(), 'savvy-home-'))
  const repo = mkdtempSync(join(tmpdir(), 'savvy-repo-'))
  try {
    execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' })
    const runCli = args =>
      spawnSync(process.execPath, [WORKER, ...args], {
        env: { ...process.env, SAVVY_LIMITS_HOME: home },
        encoding: 'utf8',
      })

    const badPerm = runCli(['run', '--title', 't', '--brief', 'x', '--dangerously-skip-permissions'])
    assert.equal(badPerm.status, EXIT.usage)
    assert.match(badPerm.stdout, /forbidden/)

    const badProf = runCli(['run', '--title', 't', '--brief', 'x', '--cwd', repo, '--profile', 'nope'])
    assert.equal(badProf.status, EXIT.usage)
    assert.match(badProf.stdout, /Profile not found/)

    // Seed an unmanaged run record and verify discard & apply refuse safely
    mkdirSync(join(home, 'runs'), { recursive: true })
    const fakeId = '20261124120000-abcdef'
    writeFileSync(join(home, 'runs', `${fakeId}.json`), JSON.stringify({
      id: fakeId,
      worktree: { repo, path: repo, branch: 'main', mode: 'in-place', managed: false },
    }))
    const disc = runCli(['discard', fakeId])
    assert.equal(disc.status, EXIT.usage)
    assert.match(disc.stdout, /Refusing to discard unmanaged checkout/)

    const app = runCli(['apply', fakeId])
    assert.equal(app.status, EXIT.usage)
    assert.match(app.stdout, /already in that checkout/)

    // Resume without conversationId fails cleanly
    const resNoConv = runCli(['resume', fakeId, '--brief', 'next'])
    assert.equal(resNoConv.status, EXIT.usage)
    assert.match(resNoConv.stdout, /no conversationId/)
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(repo, { recursive: true, force: true })
  }
})
