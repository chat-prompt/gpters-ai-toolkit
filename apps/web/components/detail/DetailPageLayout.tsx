/**
 * 상세 페이지 공통 레이아웃
 *
 * 헤더와 본문 폭만 책임진다. 예전에는 항목 종류마다 다른 색의 앰비언트 원을
 * 배경에 깔았는데, 장식이 내용보다 먼저 읽혀서 걷어냈다 — 종류 구분은
 * 머리글의 라벨이 맡는다.
 */
import { ReactNode } from 'react'
import { ServerHeader } from '../layout/ServerHeader'

/**
 * DetailPageLayout props
 */
interface DetailPageLayoutProps {
  /** 페이지 본문 */
  children: ReactNode
}

/**
 * 상세 페이지 레이아웃
 *
 * @param children - 페이지 본문
 *
 * @example
 * ```tsx
 * <DetailPageLayout>
 *   <ItemHero {...heroProps} />
 *   <ContentSection {...contentProps} />
 * </DetailPageLayout>
 * ```
 */
export async function DetailPageLayout({ children }: DetailPageLayoutProps) {
  return (
    <div className="page-shell">
      <ServerHeader />

      <main className="page-main">
        {/* 읽는 화면이라 본문 폭은 공통 최대치보다 좁게 잡는다 */}
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
