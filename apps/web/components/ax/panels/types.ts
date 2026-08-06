/**
 * AX 대시보드 — 패널 화면 컴포넌트 공통 props
 */

/**
 * 패널 뷰 컴포넌트가 받는 props
 *
 * 데이터 타입은 컴포넌트마다 다르므로 제네릭으로 좁힌다.
 */
export interface AxPanelViewProps<T> {
  /** 패널 API가 내려준 데이터 (status가 ok일 때만 렌더된다) */
  data: T
  /** 현재 조회 기간(일) */
  days: number
}
