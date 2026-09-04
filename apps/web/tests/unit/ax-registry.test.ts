/**
 * AX 대시보드 패널 레지스트리 테스트
 *
 * 패널을 추가할 때 지켜야 할 계약을 강제한다.
 * 새 패널이 이 테스트를 깨면, 테스트가 아니라 패널 정의를 고쳐야 한다.
 */

import { describe, it, expect } from 'vitest'
import { AX_PANELS, getAxPanel, listAxPanels } from '@gpters/lib/features'
import type { AxViewer } from '@gpters/lib/features'

const orgViewer: AxViewer = { canAccess: true, isAdmin: false }
const adminViewer: AxViewer = { canAccess: true, isAdmin: true }
const blockedViewer: AxViewer = { canAccess: false, isAdmin: false, reason: 'unauthenticated' }

describe('AX 패널 레지스트리', () => {
  it('패널이 하나 이상 등록돼 있다', () => {
    expect(AX_PANELS.length).toBeGreaterThan(0)
  })

  it('모든 패널 id가 고유하다', () => {
    const ids = AX_PANELS.map((panel) => panel.meta.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('보조 보기의 parentId는 등록된 최상위 패널을 가리킨다', () => {
    const byId = new Map(AX_PANELS.map((panel) => [panel.meta.id, panel.meta]))
    for (const panel of AX_PANELS) {
      if (!panel.meta.parentId) continue
      const parent = byId.get(panel.meta.parentId)
      expect(parent, `${panel.meta.id} parent`).toBeDefined()
      expect(parent?.parentId, `${panel.meta.id} parent nesting`).toBeUndefined()
    }
  })

  it('화면 정보 구조를 네 업무 영역으로 유지한다', () => {
    const metas = AX_PANELS.map((panel) => panel.meta)
    // 숨김 패널은 탭이 아니다
    expect(metas.filter((meta) => meta.hidden).map((meta) => meta.id)).toEqual(['activity-grass'])
    expect(metas.filter((meta) => !meta.parentId && !meta.hidden).map((meta) => meta.title)).toEqual([
      '요약', '스킬', '클라이언트', '배포 사이트',
    ])
    expect(metas.filter((meta) => meta.parentId === 'skill-usage').map((meta) => meta.id)).toEqual([
      'skill-opportunities', 'skill-retention', 'journey-insights', 'agent-activity', 'shared-skills',
      'skill-diff', 'skill-duplicates',
    ])
    expect(metas.filter((meta) => meta.parentId === 'client-usage').map((meta) => meta.id)).toEqual([
      'subscriptions',
    ])
  })

  it('모든 패널이 메타데이터를 빠짐없이 채운다', () => {
    for (const panel of AX_PANELS) {
      expect(panel.meta.id, '패널 id').toMatch(/^[a-z][a-z0-9-]*$/)
      expect(panel.meta.title.trim(), `${panel.meta.id} title`).not.toBe('')
      expect(panel.meta.description.trim(), `${panel.meta.id} description`).not.toBe('')
      expect(panel.meta.source.trim(), `${panel.meta.id} source`).not.toBe('')
      expect(['org', 'admin'], `${panel.meta.id} visibility`).toContain(panel.meta.visibility)
      expect(typeof panel.load, `${panel.meta.id} load`).toBe('function')
    }
  })

  it('사용자 대면 문구에 내부 개발 토큰이 없다', () => {
    // 티켓번호·코드 심볼은 화면에 나가면 안 된다
    for (const panel of AX_PANELS) {
      const copy = `${panel.meta.title} ${panel.meta.description}`
      expect(copy, `${panel.meta.id} 카피`).not.toMatch(/DEV-\d+/)
      expect(copy, `${panel.meta.id} 카피`).not.toMatch(/§/)
    }
  })

  it('getAxPanel이 id로 패널을 찾고, 없으면 undefined를 준다', () => {
    const first = AX_PANELS[0]
    expect(getAxPanel(first.meta.id)).toBe(first)
    expect(getAxPanel('존재하지-않는-패널')).toBeUndefined()
  })

  it('일반 구성원에게는 admin 전용 패널이 목록에 없다', () => {
    const visible = listAxPanels(orgViewer)
    expect(visible.every((meta) => meta.visibility === 'org')).toBe(true)
  })

  it('관리자에게는 모든 패널이 보인다', () => {
    expect(listAxPanels(adminViewer)).toHaveLength(AX_PANELS.length)
  })

  it('접근 권한이 없으면 목록이 비어 있다', () => {
    expect(listAxPanels(blockedViewer)).toHaveLength(0)
  })
})
