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
