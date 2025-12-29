import type { ItemType } from '@/lib/core/types'
import type { TypeFilterConfig } from './types'

export const TYPE_CONFIG: Record<ItemType, TypeFilterConfig> = {
  skill: {
    label: 'SKILL',
    icon: '⚡',
    gradient: 'from-cyan-400 to-emerald-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(0,212,255,0.3)]',
  },
  agent: {
    label: 'AGENT',
    icon: '◈',
    gradient: 'from-purple-400 to-pink-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(168,85,247,0.3)]',
  },
  command: {
    label: 'COMMAND',
    icon: '▸',
    gradient: 'from-rose-400 to-red-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(251,113,133,0.3)]',
  },
  guide: {
    label: 'GUIDE',
    icon: '📚',
    gradient: 'from-emerald-400 to-teal-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]',
  },
  hook: {
    label: 'HOOK',
    icon: '🪝',
    gradient: 'from-orange-400 to-amber-400',
    glow: 'group-hover:shadow-[0_0_30px_rgba(251,146,60,0.3)]',
  },
}
