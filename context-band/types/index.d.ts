export type Row = { name: string; tokens: number }

export type Snapshot = {
  model: string
  tokens: number | null
  window: number
  percent: number | null
  input: number | null
  output: number | null
  cacheRead: number | null
  cacheWrite: number | null
  costUsd: number | null
  limits: { kind: string; percentUsed: number; resetsAt: string | null }[]
  rows: Row[]
  free: number | null
  compactAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-band': { snapshot: Snapshot | null; isExpanded: boolean; isHidden: boolean }
  }
}
