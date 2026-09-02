/**
 * AX 대시보드 — 패널 id와 화면 컴포넌트 매핑
 *
 * 서버 레지스트리에 패널을 추가하면 여기 등록하지 않아도 화면에는 뜬다.
 * 등록되지 않은 패널은 범용 렌더러가 데이터를 표로 보여준다.
 * 전용 화면이 필요해지면 그때 컴포넌트를 만들어 아래 맵에 한 줄 추가하면 된다.
 */

import type { ComponentType } from 'react'
import type { AxPanelViewProps } from './types'
import { OverviewPanel } from './OverviewPanel'
import { SkillEventSummary, SkillUsagePanel } from './SkillUsagePanel'
import { JourneyInsightsPanel } from './JourneyInsightsPanel'
import { SharedSkillsPanel } from './SharedSkillsPanel'
import { SkillDiffPanel } from './SkillDiffPanel'
import { VercelProjectsPanel } from './VercelProjectsPanel'
import { SubscriptionsPanel } from './SubscriptionsPanel'
import { ClientUsagePanel } from './ClientUsagePanel'
import { AgentActivityPanel } from './AgentActivityPanel'
import { FallbackPanel } from './FallbackPanel'

/**
 * 패널 화면 컴포넌트의 공통 타입
 *
 * 데이터 타입은 컴포넌트마다 다르므로 맵에서는 `never`로 두고,
 * 실제 좁히기는 각 컴포넌트가 자기 시그니처로 한다.
 */
export type AxPanelView = ComponentType<AxPanelViewProps<never>>

/** 전용 화면이 있는 패널 */
const AX_PANEL_VIEWS: Record<string, AxPanelView> = {
  overview: OverviewPanel,
  'skill-usage': SkillUsagePanel,
  'journey-insights': JourneyInsightsPanel,
  'shared-skills': SharedSkillsPanel,
  'skill-diff': SkillDiffPanel,
  'vercel-deployments': VercelProjectsPanel,
  subscriptions: SubscriptionsPanel,
  'client-usage': ClientUsagePanel,
  'agent-activity': AgentActivityPanel,
}

/**
 * 패널 id에 맞는 화면 컴포넌트를 돌려준다
 *
 * @param panelId - 패널 식별자
 * @returns 등록된 컴포넌트. 없으면 범용 폴백 렌더러
 */
export function getAxPanelView(panelId: string): AxPanelView {
  return AX_PANEL_VIEWS[panelId] ?? FallbackPanel
}

export {
  OverviewPanel,
  SkillEventSummary,
  SkillUsagePanel,
  JourneyInsightsPanel,
  SharedSkillsPanel,
  SkillDiffPanel,
  VercelProjectsPanel,
  SubscriptionsPanel,
  ClientUsagePanel,
  AgentActivityPanel,
  FallbackPanel,
}
export type { AxPanelViewProps }
