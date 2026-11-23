export type Mode = 'normal' | 'conserve' | 'surplus' | 'blocked' | 'unknown'
export type Provider = 'claude' | 'gemini'
export type Kind = 'mechanical' | 'code' | 'design' | 'review' | 'hard' | 'media'

export type QuotaWindow = { remaining: number; resetAt: string | null; disabled: boolean }
export type Windows = { weekly: QuotaWindow | null; fiveHour: QuotaWindow | null }
export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }
export type GeminiReading = { windows: Windows | null; asOf: number | null; error?: string }

export type WindowView = { remainingPct: number; resetsAt: string | null; isDisabled: boolean }
export type PaceView = {
  mode: Mode
  reason: string
  waitUntil: string | null
  fiveHour: WindowView | null
  weekly: WindowView | null
}
export type Track = { provider: Provider; reason: string }
export type Report = {
  checkedAt: string
  claude: PaceView
  gemini: PaceView & {
    asOf: string | null
    isStale: boolean
    recommendations: Record<Kind, Record<'s' | 'm' | 'l', string | null>>
  }
  tracks: Record<Kind | 'test', Track>
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-limits': {
      report: Report | null
      isHidden: boolean
    }
  }
}
