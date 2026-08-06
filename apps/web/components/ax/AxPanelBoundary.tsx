'use client'

/**
 * AX 대시보드 — 패널 렌더 오류 격리
 *
 * 패널 데이터의 모양이 화면 코드와 어긋나면(배포 시점 차이 등) 렌더 도중 예외가 난다.
 * 경계가 없으면 그 예외가 React 트리 전체를 걷어내 멀쩡한 패널까지 함께 사라지므로,
 * 카드마다 이 경계를 씌워 오류를 그 카드 안에 가둔다.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * AxPanelBoundary props
 */
export interface AxPanelBoundaryProps {
  /** 이 값이 바뀌면 오류 상태를 지우고 다시 렌더를 시도한다 (기간 전환·재조회) */
  resetKey: string
  /** 오류 화면. 인자로 받은 함수를 부르면 경계가 초기화된다 */
  fallback: (reset: () => void) => ReactNode
  /** 오류를 가둘 대상 */
  children: ReactNode
}

/** 경계 내부 상태 */
interface AxPanelBoundaryState {
  /** 렌더 중 잡힌 오류. 정상이면 null */
  error: Error | null
}

/**
 * 패널 하나만 감싸는 오류 경계
 *
 * 오류 화면은 부모가 넘긴 `fallback`이 그린다 — 대시보드가 쓰는 안내·재시도 UI를
 * 그대로 재사용하려는 것이다.
 */
export class AxPanelBoundary extends Component<AxPanelBoundaryProps, AxPanelBoundaryState> {
  state: AxPanelBoundaryState = { error: null }

  /**
   * 렌더 예외를 오류 상태로 바꾼다
   *
   * @param error - 렌더 중 발생한 예외
   * @returns 갱신할 상태
   */
  static getDerivedStateFromError(error: Error): AxPanelBoundaryState {
    return { error }
  }

  /**
   * 어느 패널이 왜 깨졌는지 콘솔에 남긴다
   *
   * @param error - 렌더 중 발생한 예외
   * @param info - React가 준 컴포넌트 스택
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ax] 패널 렌더 실패 (${this.props.resetKey})`, error, info.componentStack)
  }

  /**
   * 조회 조건이 바뀌면 오류를 털고 새 데이터로 다시 그려 본다
   *
   * @param prevProps - 직전 props
   */
  componentDidUpdate(prevProps: AxPanelBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  /** 오류 상태 해제 — fallback의 재시도 버튼이 부른다 */
  private reset = () => {
    this.setState({ error: null })
  }

  /** @returns 오류가 없으면 children, 있으면 fallback */
  render() {
    if (this.state.error) return this.props.fallback(this.reset)
    return this.props.children
  }
}
