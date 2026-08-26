/**
 * AX Dashboard — 패널 레지스트리
 *
 * 지표를 추가하려면:
 * 1. 이 디렉터리에 패널 모듈 하나를 만들고 `AxPanel`을 export 한다
 * 2. 아래 AX_PANELS 배열에 한 줄 추가한다
 * 3. (선택) 전용 화면이 필요하면 apps/web/components/ax/panels 에 컴포넌트를 등록한다
 *    — 등록하지 않아도 기본 렌더러가 데이터를 표로 보여준다
 *
 * B2B 성과·B2C 성과·Rona 성과처럼 회사 전체 지표로 넓힐 때도 같은 절차다.
 */

import type { AxPanel, AxPanelMeta } from './types'
import type { AxViewer } from './access'
import { canViewPanel } from './access'
import { overviewPanel } from './overview'
import { skillUsagePanel } from './skills'
import { sharedSkillsPanel } from './shared-skills'
import { skillDiffPanel } from './skill-diff'
import { vercelDeploymentsPanel } from './vercel'
import { subscriptionsPanel } from './subscriptions'
import { clientUsagePanel } from './usage'
import { agentActivityPanel } from './agent-activity'

/** 등록된 패널 — 배열 순서가 화면 표시 순서다 */
export const AX_PANELS: AxPanel[] = [
  overviewPanel,
  skillUsagePanel,
  sharedSkillsPanel,
  skillDiffPanel,
  clientUsagePanel,
  agentActivityPanel,
  subscriptionsPanel,
  vercelDeploymentsPanel,
]

/** id로 패널 찾기 */
export function getAxPanel(id: string): AxPanel | undefined {
  return AX_PANELS.find((panel) => panel.meta.id === id)
}

/** 뷰어가 볼 수 있는 패널 메타 목록 */
export function listAxPanels(viewer: AxViewer): AxPanelMeta[] {
  return AX_PANELS
    .filter((panel) => canViewPanel(viewer, panel.meta.visibility))
    .map((panel) => panel.meta)
}
