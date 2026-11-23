import type { GeminiReading, Kind, Mode, QuotaWindow, RateLimit, Report, Track, Windows } from '../types/index'

export const PERIOD_MS: { weekly: number; fiveHour: number }
export const STALE_MS: number
export const LIMITS: Record<string, number>
export const LADDERS: Record<Kind, string[]>
export const KINDS: Kind[]
export function parseGeminiUsage(text: string): Windows
export function claudeWindows(rateLimits: readonly RateLimit[] | undefined): Windows | null
export function windowState(win: QuotaWindow, periodMs: number, now?: number): QuotaWindow & {
  started: boolean
  msToReset: number | null
  elapsed: number
  used: number
}
export function assessPace(windows: Windows | null, now?: number, limits?: Record<string, number>): {
  mode: Mode
  reason: string
  waitUntil: string | null
  weekly: unknown
  fiveHour: unknown
  weeklyLead: number
}
export function routeGemini(kind: string, size: string, pace: { mode: Mode }): string | null
export function allocate(claude: { mode: Mode; fiveHour?: { remaining: number } | null }, gemini: { mode: Mode }): Record<Kind | 'test', Track>
export function buildReport(input: { rateLimits: readonly RateLimit[] | undefined; gemini: GeminiReading | null; now?: number }): Report
