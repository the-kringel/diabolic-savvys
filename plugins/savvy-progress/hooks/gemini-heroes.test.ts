import { expect, test } from 'claude-code/testing'
import { GEMINI_COLOR, GEMINI_HEROES, GEMINI_MODEL, GEMINI_TIERS, geminiWorkerType } from './gemini-heroes.mjs'

type Cell = { x: number; y: number; w: number; h: number }

const draw = (tier: string): Cell[] => {
  const cells: Cell[] = []
  const f = (x: number, y: number, w: number, h: number) => void cells.push({ x, y, w, h })
  const stamp = (fill: typeof f, x: number, y: number, rows: string[], map: Record<string, string>) =>
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && fill(x + dx, y + dy, 1, 1)))
  GEMINI_HEROES[tier]?.(f, GEMINI_COLOR[tier] ?? '', { crabBody: () => undefined, stamp })
  return cells
}

const MODELS: readonly (readonly [model: string, type: string])[] = [
  ['gemini-4-neon-xhigh', 'savvy-neon-xhigh'],
  ['gemini-4-hydrogen-low', 'savvy-hydrogen-low'],
  ['gemini-4-hydrogen-medium', 'savvy-hydrogen-medium'],
  ['gemini-4-hydrogen-high', 'savvy-hydrogen-high'],
  ['gemini-4-hydrogen-xhigh', 'savvy-hydrogen-xhigh'],
  ['gemini-4-argon-low', 'savvy-argon-low'],
  ['gemini-4-argon-medium', 'savvy-argon-medium'],
  ['gemini-4-argon-high', 'savvy-argon-high'],
  ['gemini-4-argon-xhigh', 'savvy-gemini'],
  ['gemini-3.8-flash-medium', 'savvy-gemini'],
]

for (const [model, type] of MODELS) {
  test(`${model} is dressed as ${type}`, () => {
    expect(geminiWorkerType(model)).toBe(type)
  })
}

for (const tier of GEMINI_TIERS) {
  test(`${tier} has a color, a model label and art inside the crab's grid`, () => {
    expect(GEMINI_COLOR[tier]).toBeDefined()
    expect(GEMINI_MODEL[tier]?.[0]).toMatch(/^Gemini (Neon|Hydrogen|Argon)$/)
    const cells = draw(tier)
    expect(cells.length).toBeGreaterThan(0)
    // The panel's drawing size is capped, so a costume stays a modest number of shapes.
    expect(cells.length).toBeLessThan(330)
    for (const c of cells) {
      expect(c.x >= 0 && c.y >= 0 && c.x + c.w <= 30 && c.y + c.h <= 28).toBe(true)
    }
  })
}
