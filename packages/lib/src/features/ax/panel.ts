/**
 * AX Dashboard — 패널 결과 헬퍼
 *
 * 모든 패널이 같은 모양의 결과를 돌려주도록 강제하는 얇은 래퍼.
 */

import type { AxPanelHighlight, AxPanelMeta, AxPanelResult } from './types'

/**
 * 정상 결과
 *
 * @param highlights - 화면 맨 위 요약 밴드에 올릴 수치 (선택)
 */
export function panelOk<T>(
  meta: AxPanelMeta,
  data: T,
  highlights?: AxPanelHighlight[]
): AxPanelResult<T> {
  return { meta, status: 'ok', data, highlights, generatedAt: new Date().toISOString() }
}

/** 데이터 소스 미설정 (환경변수 누락 등) — 오류가 아니라 안내 상태 */
export function panelNotConfigured<T>(meta: AxPanelMeta, message: string): AxPanelResult<T> {
  return { meta, status: 'not_configured', message, data: null, generatedAt: new Date().toISOString() }
}

/** 조회 실패 */
export function panelError<T>(meta: AxPanelMeta, message: string): AxPanelResult<T> {
  return { meta, status: 'error', message, data: null, generatedAt: new Date().toISOString() }
}
