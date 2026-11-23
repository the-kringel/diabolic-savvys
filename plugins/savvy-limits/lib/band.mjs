// The telemetry band above the prompt, drawn as one SVG. Pure: no I/O, no Node APIs.

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"
const MONO = "ui-monospace,'Cascadia Mono',Consolas,Menlo,monospace"

export const WIDE_MIN = 640
const WIDE_H = 66
const NARROW_CELL_H = 48
const GAP = 6

// ink, background, border, bar: light theme, then dark.
const TOKENS = {
  n: [['#0b6b53', '#ebf7f3', '#8fd2be', '#0e8265'], ['#47e0ad', '#10241f', '#1e5746', '#2bc492']],
  s: [['#0c54a8', '#ecf4fd', '#8ebcf0', '#1668c4'], ['#6cb4ff', '#101e2e', '#234973', '#499bf2']],
  c: [['#8a4b00', '#fdf5e6', '#e4b56a', '#b86800'], ['#f7c24e', '#251d0e', '#5e471b', '#e3a82b']],
  b: [['#a61b1b', '#fdf0f0', '#e59a9a', '#c92a2a'], ['#ff8585', '#291416', '#6b292e', '#e55353']],
  u: [['#525964', '#f0efe9', '#cbc8bc', '#8c929c'], ['#a2abb8', '#1d2129', '#343b48', '#5b6472']],
}

const tokenCss = theme =>
  Object.entries(TOKENS)
    .map(([k, t]) => {
      const [ink, bg, border, bar] = t[theme]
      return `.i${k}{fill:${ink}}.g${k}{fill:${bg};stroke:${border}}.f${k}{fill:${bar}}`
    })
    .join('')

const CSS = `<style>
.pn{fill:#fff;stroke:#dedcd3}.tx{fill:#14161a}.mu{fill:#5a616c}.tr{fill:#eceae2}.tk{fill:#fff}.ht{stroke:#c92a2a}${tokenCss(0)}
@media (prefers-color-scheme: dark){.pn{fill:#15181e;stroke:#272d38}.tx{fill:#eef1f5}.mu{fill:#8b94a3}.tr{fill:#232833}.tk{fill:#15181e}.ht{stroke:#e55353}${tokenCss(1)}}
.num{font-variant-numeric:tabular-nums}
</style>`

const MODES = {
  normal: { k: 'n', word: 'HEALTHY', glyph: '✓', note: 'on pace' },
  surplus: { k: 's', word: 'USE FIRST', glyph: '▲', note: 'expires unused' },
  conserve: { k: 'c', word: 'CONSERVE', glyph: '!', note: 'save quota' },
  blocked: { k: 'b', word: 'BLOCKED', glyph: '✕', note: 'launches held' },
  unknown: { k: 'u', word: 'NO DATA', glyph: '?', note: 'no reading' },
}

const level = w => (!w ? 'u' : w.isDisabled || w.remainingPct <= 5 ? 'b' : w.remainingPct < 20 ? 'c' : 'n')
const pctText = w => (!w ? '–' : w.isDisabled ? 'OFF' : String(Math.round(w.remainingPct)))

export function countdown(iso, now) {
  if (!iso) return 'standby'
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60e3))
  if (min >= 1440) return `in ${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`
  return min >= 60 ? `in ${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `in ${min}m`
}

const r1 = n => Math.round(n * 10) / 10

function meter(x, y, w, win) {
  const h = 5
  const k = level(win)
  const pct = win && !win.isDisabled ? Math.max(0, Math.min(100, win.remainingPct)) : 0
  const fill = r1((w * pct) / 100)
  const ticks = [0.25, 0.5, 0.75].map(t => `<rect class="tk" x="${r1(x + w * t)}" y="${y}" width="1" height="${h}"/>`).join('')
  // A depleted track is hatched, so its state does not rest on color alone.
  const hatch = k === 'b' ? `<rect x="${r1(x + fill)}" y="${y}" width="${r1(w - fill)}" height="${h}" fill="url(#slh)"/>` : ''
  return `<rect class="tr" x="${x}" y="${y}" width="${w}" height="${h}"/>${hatch}<rect class="f${k}" x="${x}" y="${y}" width="${fill}" height="${h}"/>${ticks}`
}

function value(xEnd, y, win, size) {
  const t = pctText(win)
  const unit = win && !win.isDisabled ? `<tspan class="mu" font-size="${size - 3}" font-weight="500">%</tspan>` : ''
  return `<text class="tx num" x="${xEnd}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="${size}" font-weight="700">${t}${unit}</text>`
}

function head(x, y, w, name, dot, p, now) {
  const m = MODES[p.mode] ?? MODES.unknown
  const label = `${m.glyph} ${m.word}`
  const badgeX = x + 16 + name.length * 7.1 + 8
  const badgeW = Math.round(label.length * 5.7 + 11)
  const note = p.mode === 'blocked' && p.waitUntil ? `back ${countdown(p.waitUntil, now)}` : m.note
  const showNote = badgeX + badgeW + note.length * 5.6 + 10 < x + w
  return (
    `<rect x="${x}" y="${y - 8}" width="7" height="7" fill="${dot}"/>` +
    `<text class="tx" x="${x + 13}" y="${y}" font-family="${SANS}" font-size="12" font-weight="700">${name}</text>` +
    `<rect class="g${m.k}" x="${r1(badgeX) + 0.5}" y="${y - 11.5}" width="${badgeW}" height="15" rx="2"/>` +
    `<text class="i${m.k}" x="${r1(badgeX + 6)}" y="${y - 0.5}" font-family="${MONO}" font-size="9" font-weight="700" letter-spacing=".5">${label}</text>` +
    (showNote ? `<text class="mu" x="${x + w}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="10">${note}</text>` : '')
  )
}

const frame = (x, y, w, h, k) =>
  `<rect class="pn" x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="3"/><rect class="f${k}" x="${x}" y="${y}" width="3" height="${h}"/>`

function wideRow(x, y, w, tag, win, now) {
  const labelW = 22
  const valueW = 42
  const timeW = 66
  const barX = x + labelW
  const barW = Math.max(30, w - labelW - valueW - timeW)
  return (
    `<text class="mu" x="${x}" y="${y}" font-family="${MONO}" font-size="9.5" font-weight="700">${tag}</text>` +
    meter(barX, y - 6, barW, win) +
    value(x + labelW + barW + valueW - 3, y + 0.5, win, 13) +
    `<text class="tx num" x="${x + w}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="10" font-weight="600">${countdown(win?.resetsAt, now)}</text>`
  )
}

function wideCell(x, y, w, name, dot, p, now) {
  const m = MODES[p.mode] ?? MODES.unknown
  const inX = x + 12
  const inW = w - 22
  return (
    frame(x, y, w, WIDE_H, m.k) +
    head(inX, y + 18, inW, name, dot, p, now) +
    wideRow(inX, y + 38, inW, '5H', p.fiveHour, now) +
    wideRow(inX, y + 56, inW, 'WK', p.weekly, now)
  )
}

function narrowCell(x, y, w, name, dot, p, now) {
  const m = MODES[p.mode] ?? MODES.unknown
  const inX = x + 10
  const inW = w - 18
  const half = (inW - 12) / 2
  const mini = (mx, tag, win) => {
    const barX = mx + 18
    const barW = Math.max(14, Math.round(half - 18 - 34))
    return (
      `<text class="mu" x="${mx}" y="${y + 38}" font-family="${MONO}" font-size="9" font-weight="700">${tag}</text>` +
      meter(barX, y + 33, barW, win) +
      value(mx + half, y + 39, win, 12)
    )
  }
  return frame(x, y, w, NARROW_CELL_H, m.k) + head(inX, y + 17, inW, name, dot, p, now) + mini(inX, '5H', p.fiveHour) + mini(inX + half + 12, 'WK', p.weekly)
}

export const bandHeight = W => (W >= WIDE_MIN ? WIDE_H : NARROW_CELL_H * 2 + GAP)

export function bandSvg(report, W) {
  const now = Date.parse(report.checkedAt)
  const H = bandHeight(W)
  const claude = ['Claude', '#D97757', report.claude]
  const gemini = ['Gemini', '#4A89E8', report.gemini]
  let body
  if (W >= WIDE_MIN) {
    const cw = Math.floor((W - GAP) / 2)
    body = wideCell(0, 0, cw, ...claude, now) + wideCell(cw + GAP, 0, W - cw - GAP, ...gemini, now)
  } else {
    body = narrowCell(0, 0, W, ...claude, now) + narrowCell(0, NARROW_CELL_H + GAP, W, ...gemini, now)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CSS}` +
    `<defs><pattern id="slh" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="ht" x1="0" y1="0" x2="0" y2="4" stroke-width="1.4"/></pattern></defs>` +
    `${body}</svg>`
  )
}

export function bandAlt(report) {
  const part = (name, p) => `${name} ${p.mode}, 5-hour ${pctText(p.fiveHour)} percent left, weekly ${pctText(p.weekly)} percent left`
  return `${part('Claude', report.claude)}. ${part('Gemini', report.gemini)}.`
}
