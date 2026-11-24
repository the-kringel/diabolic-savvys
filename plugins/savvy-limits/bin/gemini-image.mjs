#!/usr/bin/env node
// Generate or edit images with Gemini's image model (Nano Banana 2) through the official
// Antigravity CLI (agy), using the user's Google AI Pro or Ultra login. No API key needed.
// Node built-ins only, so the same file also works as a standalone ~/.claude skill.
//
// agy runs in a throwaway folder with a cheap driver model, so a request costs a few
// thousand tokens instead of a full worker run. Antigravity's image-generator subagent
// saves images to the conversation's artifacts; this script copies them to --output.
//
//   node gemini-image.mjs -p "a red fox in snow, watercolor" -o fox.png
//   node gemini-image.mjs -p "make the sky purple" -i photo.png -o photo_purple.png
//   node gemini-image.mjs -p "three icon variations" -n 3 -o icons/ --fallback none
//
// When Gemini has no image capacity (HTTP 503), it waits and retries (--retries, default 2,
// --retry-wait seconds, default 120). If that still fails, or quota is used up, it runs the
// gpt-image skill instead when that skill is installed and signed in (--fallback auto).
//
// Exit codes: 0 saved, 1 failed, 2 bad usage or setup, 3 Gemini quota used up,
// 5 Gemini image capacity unavailable. 3 and 5 only when no fallback produced an image.
// It never reads or reuses Antigravity login tokens and forces paid AI credits off.
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readSync, closeSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const EXIT = { ok: 0, failed: 1, usage: 2, quota: 3, capacity: 5 }
export const DEFAULT_MODEL = 'gemini-4-hydrogen-low'
const ASPECTS = {
  square: 'square 1:1',
  landscape: 'landscape 3:2',
  portrait: 'portrait 2:3',
  wide: 'widescreen 16:9',
  tall: 'tall 9:16',
}
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i
const MAX_BYTES = 20 * 1024 * 1024
const BRAIN = () => join(process.env.AGY_HOME || join(homedir(), '.gemini', 'antigravity-cli'), 'brain')
const GPT_IMAGE = () => process.env.GPT_IMAGE_SCRIPT || join(homedir(), '.claude', 'skills', 'gpt-image', 'scripts', 'gpt_image.mjs')

const HELP = `Usage: node gemini-image.mjs -p PROMPT [-i IMG ...] [-o FILE|DIR] [-n 1-4]
       [--aspect square|landscape|portrait|wide|tall] [--transparent]
       [--model ${DEFAULT_MODEL}] [--timeout SECONDS] [--retries 0-5] [--retry-wait SECONDS]
       [--fallback auto|none] [--dry-run]`

export function parseCli(argv) {
  const a = { n: 1, inputs: [], timeout: 600, transparent: false, dryRun: false, fallback: 'auto', model: DEFAULT_MODEL, retries: 2, retryWait: 120 }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${k}`)
      return argv[++i]
    }
    switch (k) {
      case '-p': case '--prompt': a.prompt = next(); break
      case '-o': case '--output': a.output = next(); break
      case '-n': a.n = Number.parseInt(next(), 10); break
      case '--aspect': a.aspect = next(); break
      case '--model': a.model = next(); break
      case '--timeout': a.timeout = Number.parseInt(next(), 10); break
      case '--fallback': a.fallback = next(); break
      case '--retries': a.retries = Number.parseInt(next(), 10); break
      case '--retry-wait': a.retryWait = Number.parseInt(next(), 10); break
      case '--transparent': a.transparent = true; break
      case '--dry-run': a.dryRun = true; break
      case '-i': case '--input':
        while (i + 1 < argv.length && !argv[i + 1].startsWith('-')) a.inputs.push(argv[++i])
        break
      case '-h': case '--help': a.help = true; break
      default: throw new Error(`unknown argument: ${k}`)
    }
  }
  if (a.help) return a
  if (!a.prompt?.trim()) throw new Error('--prompt is required')
  if (!(a.n >= 1 && a.n <= 4)) throw new Error('-n must be between 1 and 4')
  if (a.aspect && !ASPECTS[a.aspect]) throw new Error(`--aspect must be one of ${Object.keys(ASPECTS).join(', ')}`)
  if (!/^gemini-/.test(a.model)) throw new Error('--model must be a Gemini model')
  if (!['auto', 'none'].includes(a.fallback)) throw new Error('--fallback must be auto or none')
  if (!(a.timeout >= 30)) throw new Error('--timeout must be at least 30 seconds')
  if (!(a.retries >= 0 && a.retries <= 5)) throw new Error('--retries must be between 0 and 5')
  if (!(a.retryWait >= 0)) throw new Error('--retry-wait must be 0 or more seconds')
  return a
}

export function buildPrompt(a, inputNames = []) {
  const L = [`Generate ${a.n} image${a.n > 1 ? 's (separate variations)' : ''} with your image generation tool (the image-generator subagent).`]
  if (inputNames.length) {
    L.push(`${inputNames.length} reference image(s) are in the workspace root: ${inputNames.map((f, i) => `Image ${i + 1} is ${f}`).join(', ')}. ` +
      'Pass them to the image generator and use them as the request says (edit, reference or style). Change only what the request asks for and keep everything else the same.')
  }
  if (a.aspect) L.push(`Aspect ratio: ${ASPECTS[a.aspect]}.`)
  if (a.transparent) L.push('Use a transparent background if the image tool supports it; otherwise use a plain solid white background.')
  L.push('', 'Request:', a.prompt.trim(), '',
    'Rules: only generate the image(s). Never use the terminal or run_command tool, because terminal commands are denied here and will end your run. ' +
    'Do not create, edit or copy any files yourself, and never draw or substitute placeholder images. Do not ask questions. ' +
    'If image generation fails, stop at once and reply with the exact error text. ' +
    'When done, reply with the absolute path of each image, one per line.')
  return L.join('\n')
}

// Classifies a failed run from everything agy said, so the caller can wait, fall back or report.
export function classifyFailure(text) {
  const t = String(text ?? '')
  if (/no capacity available|\bUNAVAILABLE\b|\b503\b|overloaded|try again later/i.test(t)) return 'capacity'
  if (/credits balance|quota|usage limit|limit (reached|exceeded)|RESOURCE_EXHAUSTED|\b429\b/i.test(t)) return 'quota'
  if (/not (signed|logged) in|sign in|log in|unauthenticated|\b401\b/i.test(t)) return 'login'
  if (/safety|policy|cannot (help|create|generate)|refus/i.test(t)) return 'refused'
  return 'failed'
}

// Real type from the file's first bytes: a .png name can hold JPEG data.
export function sniffType(head) {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg'
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

// PNG colour types 4 and 6 carry alpha. JPEG never does.
export function hasAlpha(head) {
  return sniffType(head) === 'png' && head.length >= 26 && (head[25] === 4 || head[25] === 6)
}

function readHead(file, n = 32) {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(n)
    const got = readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, got)
  } finally {
    closeSync(fd)
  }
}

function slugify(t, n = 40) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n).replace(/-+$/, '') || 'image'
}

function stamp() {
  const d = new Date()
  const p = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// Output paths keep the requested name but take the image's real extension.
export function outputPaths(a, types, cwd = process.cwd()) {
  let stem = null
  let parent
  if (a.output) {
    const o = resolve(cwd, a.output.replace(/^~(?=$|[\\/])/, homedir()))
    if (IMAGE_EXT.test(extname(o))) {
      stem = basename(o, extname(o))
      parent = dirname(o)
    } else parent = o
  } else parent = resolve(cwd, 'generated-images')
  stem ??= `${stamp()}-${slugify(a.prompt)}`
  return types.map((t, i) => join(parent, `${types.length === 1 ? stem : `${stem}-${i + 1}`}.${t}`))
}

// Images agy saved for this conversation, oldest first. Subagents save into the main
// conversation's folder, and only files written during this run count.
export function findImages(conversationId, since, brain = BRAIN()) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId ?? '')) return []
  const dir = join(brain, conversationId)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && IMAGE_EXT.test(e.name))
    .map(e => join(dir, e.name))
    .map(f => ({ f, s: statSync(f) }))
    .filter(({ s }) => s.mtimeMs >= since - 2000 && s.size > 0 && s.size <= MAX_BYTES)
    .sort((x, y) => x.s.mtimeMs - y.s.mtimeMs)
    .map(({ f }) => f)
}

function agyPath() {
  if (process.env.AGY_PATH) return process.env.AGY_PATH
  const local = process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe')
  return local && existsSync(local) ? local : 'agy'
}

function run(exe, args, { cwd, timeoutMs }) {
  return new Promise(done => {
    let child
    try {
      child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      return done({ code: null, stdout: '', stderr: '', spawnError: err })
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeoutMs)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', err => { clearTimeout(timer); done({ code: null, stdout, stderr, spawnError: err }) })
    child.on('close', code => { clearTimeout(timer); done({ code, stdout, stderr, timedOut }) })
  })
}

// The stream-json envelope agy prints last, with status, response, error and conversation id.
export function parseEnvelope(stdout) {
  let envelope = null
  let conversationId = null
  for (const line of String(stdout).split(/\r?\n/)) {
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.event === 'result') envelope = ev.result ?? null
    conversationId ??= ev.conversation_id ?? ev.result?.conversation_id ?? null
  }
  return { envelope, conversationId: envelope?.conversation_id ?? conversationId }
}

async function viaGemini(a) {
  const work = mkdtempSync(join(tmpdir(), 'gemini-image-'))
  try {
    const names = a.inputs.map((f, i) => `input-${i + 1}${extname(f).toLowerCase() || '.png'}`)
    a.inputs.forEach((f, i) => copyFileSync(f, join(work, names[i])))
    // Passed per run, so paid AI credits stay off without changing saved Antigravity settings.
    const settings = join(work, '.guard-settings.json')
    writeFileSync(settings, JSON.stringify({ useG1Credits: false }))
    const started = Date.now()
    const res = await run(agyPath(), [
      '-p', buildPrompt(a, names),
      '--model', a.model,
      '--mode', 'accept-edits',
      '--output-format', 'stream-json',
      '--print-timeout', `${Math.ceil(a.timeout / 60)}m`,
      '--settings', settings,
      '--sandbox',
    ], { cwd: work, timeoutMs: a.timeout * 1000 + 15_000 })
    if (res.spawnError) {
      return { ok: false, reason: 'setup', error: `Antigravity CLI (agy) not found or not runnable: ${res.spawnError.message}. Install it and sign in with your Google account.` }
    }
    const { envelope, conversationId } = parseEnvelope(res.stdout)
    const images = findImages(conversationId, started)
    const said = [envelope?.error, envelope?.response, res.stderr].filter(Boolean).join('\n')
    if (images.length) {
      return { ok: true, images, conversationId, usage: envelope?.usage ?? null, message: envelope?.response?.trim().slice(-500) ?? null }
    }
    const reason = res.timedOut ? 'timeout' : classifyFailure(said)
    return { ok: false, reason, conversationId, error: said.trim().slice(-1200) || `agy exited with code ${res.code} and no result` }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// gpt-image takes the same core flags; aspects it lacks map to the nearest one it has.
export function fallbackArgs(a) {
  const aspect = { square: 'square', landscape: 'landscape', portrait: 'portrait', wide: 'landscape', tall: 'portrait' }[a.aspect]
  const args = ['-p', a.prompt, '-n', String(a.n)]
  if (a.inputs.length) args.push('-i', ...a.inputs)
  if (a.output) args.push('-o', a.output)
  if (aspect) args.push('--aspect', aspect)
  if (a.transparent) args.push('--transparent')
  return args
}

async function viaGptImage(a) {
  const script = GPT_IMAGE()
  if (!existsSync(script)) return { ok: false, error: `gpt-image skill not installed (${script})` }
  const res = await run(process.execPath, [script, ...fallbackArgs(a)], { cwd: process.cwd(), timeoutMs: 900_000 })
  try {
    const out = JSON.parse(res.stdout)
    if (res.code === 0 && out.saved?.length) return { ok: true, saved: out.saved, message: out.codex_message ?? null }
  } catch { /* fall through */ }
  return { ok: false, error: (res.stderr || res.stdout || `exit ${res.code}`).trim().slice(-800) }
}

async function main() {
  let a
  try {
    a = parseCli(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`ERROR: ${err.message}\n${HELP}\n`)
    return EXIT.usage
  }
  if (a.help) { console.log(HELP); return EXIT.ok }
  a.inputs = a.inputs.map(f => resolve(f))
  for (const f of a.inputs) {
    if (!existsSync(f)) { process.stderr.write(`ERROR: input not found: ${f}\n`); return EXIT.usage }
  }
  if (a.dryRun) { console.log(buildPrompt(a, a.inputs.map((f, i) => `input-${i + 1}${extname(f).toLowerCase()}`))); return EXIT.ok }

  let g = await viaGemini(a)
  const attempts = [g.ok ? 'ok' : g.reason]
  // Capacity outages are often brief; agy already retries within a run, so wait between runs.
  for (let i = 0; !g.ok && g.reason === 'capacity' && i < a.retries; i++) {
    process.stderr.write(`Gemini image capacity unavailable; retrying in ${a.retryWait}s (${i + 1}/${a.retries}).
`)
    await new Promise(r => setTimeout(r, a.retryWait * 1000))
    g = await viaGemini(a)
    attempts.push(g.ok ? 'ok' : g.reason)
  }
  if (g.ok) {
    const picked = g.images.slice(-a.n)
    const types = picked.map(f => sniffType(readHead(f)) ?? 'png')
    const outs = outputPaths(a, types)
    mkdirSync(dirname(outs[0]), { recursive: true })
    picked.forEach((src, i) => copyFileSync(src, outs[i]))
    const warnings = []
    if (a.output && IMAGE_EXT.test(a.output) && !outs[0].toLowerCase().endsWith(extname(a.output).toLowerCase().replace('jpeg', 'jpg'))) {
      warnings.push(`Gemini returned ${types[0].toUpperCase()}, so the file was saved as .${types[0]}.`)
    }
    if (a.transparent && !picked.some(f => hasAlpha(readHead(f)))) warnings.push('The image has no transparency. Use gpt-image for a transparent PNG.')
    if (picked.length < a.n) warnings.push(`Asked for ${a.n} images, got ${picked.length}.`)
    console.log(JSON.stringify({ ok: true, provider: 'gemini', model: 'Nano Banana 2', driver: a.model, saved: outs, requested: a.n, attempts, warnings, conversation_id: g.conversationId, usage: g.usage, gemini_message: g.message }, null, 2))
    return EXIT.ok
  }

  const fallbackable = ['capacity', 'quota', 'timeout'].includes(g.reason)
  if (fallbackable && a.fallback === 'auto') {
    process.stderr.write(`Gemini image generation failed (${g.reason}); trying gpt-image.\n`)
    const f = await viaGptImage(a)
    if (f.ok) {
      console.log(JSON.stringify({ ok: true, provider: 'gpt-image', saved: f.saved, requested: a.n, gemini_failure: { reason: g.reason, attempts, error: g.error }, gpt_message: f.message }, null, 2))
      return EXIT.ok
    }
    g.fallbackError = f.error
  }
  console.log(JSON.stringify({ ok: false, provider: 'gemini', reason: g.reason, attempts, error: g.error, fallback_error: g.fallbackError, conversation_id: g.conversationId ?? null }, null, 2))
  return { capacity: EXIT.capacity, quota: EXIT.quota, setup: EXIT.usage, login: EXIT.usage }[g.reason] ?? EXIT.failed
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(code => { process.exitCode = code }, err => {
    process.stderr.write(`ERROR: ${err.stack || err}\n`)
    process.exitCode = EXIT.failed
  })
}
