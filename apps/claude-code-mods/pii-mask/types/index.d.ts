export type Mode = 'strict' | 'secrets' | 'unknown'

declare module 'claude-code' {
  interface PluginState {
    'pii-mask': { mode: Mode }
  }
}
