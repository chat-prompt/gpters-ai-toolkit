/**
 * 카탈로그 항목 유형별 표시 설정
 *
 * 유형 구분은 라벨 하나로만 한다 — 예전에는 유형마다 이모지·그라디언트·
 * 네온 글로우를 달았는데, 카드 열두 장이 늘어서면 장식이 제목보다 먼저 읽혔다.
 */
import type { ItemType } from '@/lib/core/types'
import type { TypeFilterConfig } from './types'

/** 항목 유형 → 표시 설정 */
export const TYPE_CONFIG: Record<ItemType, TypeFilterConfig> = {
  skill: { label: 'SKILL' },
  agent: { label: 'AGENT' },
  command: { label: 'COMMAND' },
  guide: { label: 'GUIDE' },
  hook: { label: 'HOOK' },
  package: { label: 'PACKAGE' },
}
