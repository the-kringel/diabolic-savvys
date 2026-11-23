export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** A headless worker on API credit, read from .claude/api-workers by the savvy-api skill. */
  isApi?: boolean
  /** A Gemini worker run by savvy-limits; it writes the same status file as an API worker. */
  isGemini?: boolean
  /** A side session this session started with start_session; `id` is its app id (`local_…`). */
  kind?: 'session'
  /** The session waits for the person: a permission dialog or a question. */
  isWaiting?: boolean
  waitReason?: string
  /** Opens the session in the app. */
  link?: string
  /** The last sign of progress: a model request, a step report, a status file write. */
  activeAt?: number
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
  /** The pane is wanted: opened, and not closed by the person or the plugin since. Absent in state from before 1.5.1. */
  isOpen?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
    }
  }
}
