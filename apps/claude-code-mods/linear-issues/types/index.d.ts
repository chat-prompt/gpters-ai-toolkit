export type Issue = { id: string; title: string; status: string; statusType: string; project: string | null; url: string }

declare module 'claude-code' {
  interface PluginState {
    'linear-issues': { issues: Issue[]; error: string | null; updatedAt: number | null }
  }
}
