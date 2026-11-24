// Run with: node --test plugins/savvy-limits/bin/gemini-image.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildPrompt, classifyFailure, fallbackArgs, findImages, hasAlpha, outputPaths, parseCli, parseEnvelope, sniffType } from './gemini-image.mjs'

const PNG_RGBA = Buffer.from('89504e470d0a1a0a0000000d49484452000000100000001008060000001f', 'hex')
const PNG_RGB = Buffer.from('89504e470d0a1a0a0000000d494844520000001000000010080200000090', 'hex')
const JPG = Buffer.from('ffd8ffe000104a464946', 'hex')

test('parses flags and rejects bad ones', () => {
  const a = parseCli(['-p', 'fox', '-i', 'a.png', 'b.png', '-n', '2', '--aspect', 'wide', '-o', 'out/'])
  assert.deepEqual([a.prompt, a.inputs, a.n, a.aspect, a.output, a.fallback, a.retries], ['fox', ['a.png', 'b.png'], 2, 'wide', 'out/', 'auto', 2])
  assert.throws(() => parseCli(['-n', '1']), /prompt is required/)
  assert.throws(() => parseCli(['-p', 'x', '-n', '5']), /between 1 and 4/)
  assert.throws(() => parseCli(['-p', 'x', '--model', 'claude-opus-5-5-low']), /Gemini model/)
  assert.throws(() => parseCli(['-p', 'x', '--fallback', 'api']), /auto or none/)
  assert.throws(() => parseCli(['-p', 'x', '--retries', '9']), /between 0 and 5/)
})

test('prompt names reference images and forbids files and the terminal', () => {
  const p = buildPrompt(parseCli(['-p', 'make the sky purple', '-i', 'x.png']), ['input-1.png'])
  assert.match(p, /Image 1 is input-1\.png/)
  assert.match(p, /make the sky purple/)
  assert.match(p, /Never use the terminal/)
  assert.match(p, /never draw or substitute placeholder images/)
})

test('classifies the real Antigravity capacity error and other failures', () => {
  assert.equal(classifyFailure('transport error (Unavailable, HTTP 503): No capacity available for model gemini-3.1-flash-image on the server: UNAVAILABLE (code 503)'), 'capacity')
  assert.equal(classifyFailure('Your AI credits balance is too low to continue.'), 'quota')
  assert.equal(classifyFailure('Weekly quota exhausted'), 'quota')
  assert.equal(classifyFailure('You are not signed in. Run agy to sign in.'), 'login')
  assert.equal(classifyFailure('something odd'), 'failed')
})

test('sniffs real image types and alpha', () => {
  assert.equal(sniffType(JPG), 'jpg')
  assert.equal(sniffType(PNG_RGBA), 'png')
  assert.equal(sniffType(Buffer.from('RIFF0000WEBPVP8 ')), 'webp')
  assert.equal(sniffType(Buffer.from('hello')), null)
  assert.equal(hasAlpha(PNG_RGBA), true)
  assert.equal(hasAlpha(PNG_RGB), false)
  assert.equal(hasAlpha(JPG), false)
})

test('output paths keep the name but use the real extension', () => {
  const cwd = join(tmpdir(), 'proj')
  assert.deepEqual(outputPaths({ prompt: 'x', output: 'art/fox.png' }, ['jpg'], cwd), [join(cwd, 'art', 'fox.jpg')])
  assert.deepEqual(outputPaths({ prompt: 'x', output: 'art' }, ['jpg', 'png'], cwd).map(p => p.slice(-6)), ['-1.jpg', '-2.png'])
  assert.match(outputPaths({ prompt: 'Red Fox!' }, ['jpg'], cwd)[0], /generated-images[\\/]\d{8}-\d{6}-red-fox\.jpg$/)
})

test('finds only this run\'s images in the conversation folder', () => {
  const brain = mkdtempSync(join(tmpdir(), 'brain-'))
  const id = '70c95973-d319-4f6d-b723-91bb2dd8bb45'
  const dir = join(brain, id)
  mkdirSync(join(dir, '.system_generated'), { recursive: true })
  writeFileSync(join(dir, 'old.jpg'), JPG)
  const old = (Date.now() - 3600e3) / 1000
  utimesSync(join(dir, 'old.jpg'), old, old)
  writeFileSync(join(dir, 'new.jpg'), JPG)
  writeFileSync(join(dir, 'notes.md'), 'x')
  try {
    assert.deepEqual(findImages(id, Date.now() - 60e3, brain).map(f => f.slice(-7)), ['new.jpg'])
    assert.deepEqual(findImages('../etc', 0, brain), [])
  } finally {
    rmSync(brain, { recursive: true, force: true })
  }
})

test('reads the conversation id from the stream-json result', () => {
  const out = '{"event":"step_update"}\nnot json\n{"event":"result","result":{"status":"SUCCESS","conversation_id":"abc","response":"done"}}\n'
  const { envelope, conversationId } = parseEnvelope(out)
  assert.equal(conversationId, 'abc')
  assert.equal(envelope.response, 'done')
})

test('fallback maps to gpt-image flags', () => {
  const a = parseCli(['-p', 'fox', '-i', 'a.png', '--aspect', 'tall', '--transparent', '-o', 'x.png'])
  assert.deepEqual(fallbackArgs(a), ['-p', 'fox', '-n', '1', '-i', 'a.png', '-o', 'x.png', '--aspect', 'portrait', '--transparent'])
})
