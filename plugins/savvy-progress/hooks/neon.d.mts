type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void
type Kit = {
  crabBody: (f: Fill, armFront?: number, armCls?: string) => void
  stamp: (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string) => void
}

export const NEON_TIERS: string[]
export const NEON_COLOR: Record<string, string>
export const NEON: Record<string, (f: Fill, t: string, kit: Kit) => void>
export const NEON_CSS: string
export function geminiWorkerType(model: string): string
