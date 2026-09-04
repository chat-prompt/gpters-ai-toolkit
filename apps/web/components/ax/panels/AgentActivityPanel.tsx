'use client'

/** AX 대시보드 — 에이전트 활동 패널 본문 */

import { useMemo, useState } from 'react'
import type {
  AxAgentActivityAgentRow,
  AxAgentActivityData,
  AxAgentEfficiency,
  AxAgentReporterRow,
  AxAgentSourceCoverageRow,
  AxAgentTelemetrySource,
  AxAgentTokenUsage,
} from '@/lib/features/ax'
import { RATE_MIN_SAMPLE, formatCount, formatDateTime, formatSampledRate, relativeActivityFill } from '../format'
import type { AxPanelViewProps } from './types'
import {
  DefinitionRows,
  EMPTY_NOTE,
  EmptyNote,
  META_LINE,
  SectionHeader,
  Stat,
  StatGrid,
  TD as BASE_TD,
  TH,
} from './primitives'

const SOURCE_LABELS: Record<AxAgentTelemetrySource, string> = {
  openclaw: 'OpenClaw',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
}

const STATUS_LABELS: Record<AxAgentSourceCoverageRow['status'], string> = {
  reporting: '수집 중',
  stale: '지연',
  installed: '설치됨·대기',
  missing: '미보고',
  unsupported: '어댑터 필요',
  alternate: 'Claude로 대체',
}

const TD = `${BASE_TD} text-sm`

type ActivityScope = AxAgentActivityData | AxAgentActivityAgentRow

/** 효율 필드가 없는 구형 응답(세션 캐시)도 화면이 깨지지 않게 빈 값으로 읽는다 */
const EMPTY_EFFICIENCY: AxAgentEfficiency = {
  tokensPerVerifiedSuccess: null,
  failingTools: [],
  failingSkills: [],
  skillLoadTotals: { loaded: 0, failed: 0, interrupted: 0 },
}

function efficiencyOf(scope: ActivityScope): AxAgentEfficiency {
  return scope.efficiency ?? EMPTY_EFFICIENCY
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

/**
 * 검증 성공 1건당 처리 토큰 표기 — 성공이 최소 표본 미만이면 나눈 값 대신 `총량 / n건 · 참고`로 적는다.
 * 검증 성공 1~2건으로 나눈 값은 그 자체로 그럴듯해 보여서 더 위험하다.
 */
function formatTokensPerSuccess(totalTokens: number, successes: number, perSuccess: number | null): string {
  if (successes <= 0 || perSuccess === null) return '—'
  if (successes < RATE_MIN_SAMPLE) return `${formatTokens(totalTokens)} / ${formatCount(successes)}건 · 참고`
  return formatTokens(perSuccess)
}


function processedTokens(usage: AxAgentTokenUsage): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens +
    (usage.thinkingTokensRelation === 'separate-from-output' ? usage.thinkingTokens : 0)
}

/**
 * 에이전트 활동 패널 화면 — 에이전트를 골라 토큰·도구·스킬·검증된 실행 결과와 수집 건강도를 본다.
 *
 * @param data - 에이전트 활동 집계
 * @param days - 조회 기간(일)
 * @param selection - 대시보드가 기억하는 선택 에이전트 ID ('all'이면 전체)
 * @param onSelectionChange - 선택이 바뀔 때 대시보드에 알린다
 */
export function AgentActivityPanel({
  data,
  days,
  selection,
  onSelectionChange,
}: AxPanelViewProps<AxAgentActivityData>) {
  const [localSelection, setLocalSelection] = useState<string>('all')
  const selectedAgentId = selection ?? localSelection
  const selectAgent = (agentId: string) => {
    if (onSelectionChange) onSelectionChange(agentId)
    else setLocalSelection(agentId)
  }
  const selectedAgent = selectedAgentId === 'all'
    ? null
    : data.agents.find((agent) => agent.agentId === selectedAgentId) ?? null
  const activeAgentId = selectedAgent?.agentId ?? 'all'
  const scope: ActivityScope = selectedAgent ?? data
  const reporters = activeAgentId === 'all'
    ? data.reporters
    : data.reporters.filter((row) => row.agentId === activeAgentId)
  const coverage = activeAgentId === 'all'
    ? data.sourceCoverage
    : data.sourceCoverage.filter((row) => reporters.some((reporter) => reporter.source === row.source))
  const latestCollectedAt = reporters.reduce<string | null>((latest, reporter) => {
    if (!reporter.lastCollectedAt) return latest
    return !latest || reporter.lastCollectedAt > latest ? reporter.lastCollectedAt : latest
  }, null)

  // 위계: 수집이 끊겼으면 아래 숫자가 전부 하한선이므로 가장 먼저 보이고, 그다음 규모 → 효율 → 분모(실행 결과) →
  // 구성 상세 → 운영(소스·수집기) 순서다. 새 지표를 붙이기만 하지 않고 운영 정보는 아래로 내렸다.
  return (
    <div className="space-y-10">
      <AgentSelector
        agents={data.agents}
        reporters={data.reporters}
        value={activeAgentId}
        onChange={selectAgent}
      />

      <CollectionGaps reporters={reporters} />

      <section aria-labelledby="agent-summary-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {/* 에이전트 ID는 식별자라 대소문자를 바꾸지 않는다 */}
            <p
              id="agent-summary-title"
              translate="no"
              className={`max-w-[24rem] truncate font-mono text-[11px] tracking-[0.14em] text-[var(--text-muted)] ${
                activeAgentId === 'all' ? 'uppercase' : ''
              }`}
            >
              {activeAgentId === 'all' ? '전체 에이전트' : activeAgentId}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              최근 {days}일 · {latestCollectedAt
                ? `마지막 수집 ${formatDateTime(latestCollectedAt)}`
                : '설치됨 · 첫 수집 대기'} · {formatCount(scope.collection.batches)}개 배치
            </p>
          </div>
          <p className={META_LINE}>
            전체 집계 구간 {formatDateTime(data.windowStart)} – {formatDateTime(data.windowEnd)}
          </p>
        </div>
        <div className="mt-4">
          <StatGrid columns={4}>
          <Metric
            label="처리 토큰"
            value={formatTokens(scope.totalProcessedTokens)}
            hint="추론 토큰 중복 제외"
            explanation="입력·출력·캐시 생성·캐시 읽기를 합친 값입니다. 추론 토큰이 출력에 포함된 소스에서는 다시 더하지 않습니다."
          />
          <Metric
            label="턴 / 세션"
            value={`${formatCount(scope.turns)} / ${formatCount(scope.sessions)}`}
            explanation="턴은 에이전트 응답 단위, 세션은 연속된 작업 대화 단위입니다. 소스별 기록 구조에 따라 같은 업무가 여러 턴일 수 있습니다."
          />
          <Metric
            label="도구 호출"
            value={formatCount(scope.toolCalls)}
            hint={`실패 ${formatCount(scope.toolFailures)}건`}
            explanation="쉘·파일 읽기·편집·검색처럼 런타임이 기록한 도구 호출입니다. OpenClaw 요약 소스처럼 도구를 제공하지 않는 소스는 포함되지 않습니다. 실패율은 아래 효율 칸에 있습니다."
          />
          <Metric
            label="수집 레코드"
            value={formatCount(scope.collection.recordsRead)}
            hint={`파싱 실패 ${formatCount(scope.collection.parseFailures)}`}
            explanation="수집기가 원본 로그에서 확인한 레코드 수입니다. 활동량 자체가 아니라 수집 건강도를 확인하는 운영 지표입니다."
          />
          </StatGrid>
        </div>
      </section>

      <EfficiencySection scope={scope} available={data.verifiedExecutionsAvailable} />

      <SkillImpactSummary scope={scope} available={data.verifiedExecutionsAvailable} />

      <ExecutionSection scope={scope} available={data.verifiedExecutionsAvailable} />

      {activeAgentId === 'all' && (
        <AgentEfficiencyTable
          agents={data.agents}
          available={data.verifiedExecutionsAvailable}
          onSelectAgent={selectAgent}
        />
      )}

      <TokenBreakdown usage={scope.totalUsage} />

      {/* 두 표의 1위 막대가 한 줄로 이어져 보이지 않게 가운데 구분선을 둔다 */}
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-0">
        <div className="lg:pr-10">
        <RankTable
          title="도구 호출·실패"
          rows={scope.tools.map((row) => ({
            name: row.name,
            value: formatCount(row.calls),
            hint: `실패 ${formatSampledRate(row.failures, row.calls)}`,
            magnitude: row.calls,
          }))}
        />
        </div>
        <div className="lg:border-l lg:border-[var(--border-subtle)] lg:pl-10">
        <SkillLoadSection scope={scope} />
        </div>
      </div>

      {/* 긴 목록(도구 호출·스킬 로드)끼리, 짧은 목록(실패 도구·모델)끼리 짝지어 한쪽만 길게 비지 않게 한다 */}
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-0">
        <div className="lg:pr-10">
        <RankTable
          title="실패가 많은 도구"
          empty={scope.toolCalls > 0
            ? '선택 기간에 관측된 도구 실패가 없습니다.'
            : '이 수집 소스에서 도구 호출이 관측되지 않았습니다.'}
          rows={efficiencyOf(scope).failingTools.map((row) => ({
            name: row.name,
            value: `${formatCount(row.failures)}건`,
            hint: `${formatSampledRate(row.failures, row.calls)} · 호출 ${formatCount(row.calls)}`,
            magnitude: row.failures,
          }))}
        />
        </div>
        <div className="lg:border-l lg:border-[var(--border-subtle)] lg:pl-10">
        <RankTable
          title="모델별 처리 토큰"
          rows={scope.models.map((row) => ({
            name: row.model,
            value: formatTokens(row.processedTokens),
            hint: `${formatCount(row.turns)}턴`,
            magnitude: row.processedTokens,
          }))}
        />
        </div>
      </div>

      <section>
        <SectionTitle
          title={activeAgentId === 'all' ? '소스 커버리지' : '이 에이전트의 수집 소스'}
          hint={activeAgentId === 'all'
            ? '보이지 않는 소스를 0으로 오해하지 않습니다'
            : '표시되지 않은 소스는 이 에이전트에서 아직 관측되지 않았습니다'}
        />
        <div className="mt-3 grid border-t border-[var(--border-subtle)] md:grid-cols-2 md:gap-x-10">
          {coverage.map((row) => (
            <SourceCard
              key={row.source}
              coverage={row}
              reporter={reporters.find((reporter) => reporter.source === row.source)}
              scoped={activeAgentId !== 'all'}
            />
          ))}
        </div>
      </section>

      {activeAgentId === 'all' && data.insights.length > 0 && <Insights insights={data.insights} />}
      {activeAgentId !== 'all' && <AgentNotices reporters={reporters} scope={scope} />}

      <ReporterSection
        reporters={reporters}
        showAgentLinks={activeAgentId === 'all'}
        onSelectAgent={selectAgent}
      />
    </div>
  )
}

/**
 * 수집이 끊긴 수집기만 이름과 마지막 정상 보고 시각을 앞에 세운다.
 * 아래 `수집기 상태` 표는 전체 목록이고, 여기는 "지금 숫자를 믿어도 되는가"만 답한다. 문제가 없으면 아무것도 그리지 않는다.
 */
function CollectionGaps({ reporters }: { reporters: AxAgentReporterRow[] }) {
  const gaps = reporters.filter((row) => row.freshness !== 'fresh' || row.healthStatus === 'blocked')
  if (gaps.length === 0) return null
  return (
    <section aria-labelledby="collection-gaps-title">
      <SectionHeader
        id="collection-gaps-title"
        label="수집 끊김"
        aside={`${formatCount(gaps.length)}개 수집기`}
        description="아래 수치는 이 수집기의 마지막 정상 보고까지만 반영합니다. 빠진 구간은 0이 아니라 미관측입니다."
      />
      <DefinitionRows
        rows={gaps.map((row) => {
          const lastHealthy = row.lastHealthyAt ?? null
          const status = row.healthStatus === 'blocked'
            ? `수집 차단 · 경고 ${formatCount(row.healthWarnings.length)}건`
            : row.freshness === 'waiting'
              ? '설치됐지만 아직 첫 배치가 없습니다'
              : `${formatCount(row.freshnessHours ?? 0)}시간째 새 배치 없음`
          const detail = lastHealthy
            ? `마지막 정상 보고 ${formatDateTime(lastHealthy)} · ${status}`
            : row.lastCollectedAt
              ? `정상 보고 기록 없음 · 마지막 배치 ${formatDateTime(row.lastCollectedAt)} · ${status}`
              : status
          return {
            title: row.agentId,
            badge: SOURCE_LABELS[row.source],
            detail,
            warning: row.freshness === 'stale' || row.healthStatus === 'blocked',
          }
        })}
      />
    </section>
  )
}

/**
 * 효율 — 검증 성공 1건에 든 토큰과 세 가지 실패 신호. 비율마다 분모를 힌트에 함께 적는다.
 * 비용은 넣지 않는다 (모델 가격표·구독 대표성 미확보).
 */
function EfficiencySection({ scope, available }: { scope: ActivityScope; available: boolean }) {
  const execution = scope.verifiedExecutions
  const efficiency = efficiencyOf(scope)
  const verifiedSuccesses = execution.verifiedSuccesses ?? 0
  const verifiedAttempts = execution.verifiedAttempts ?? 0
  const skillTotals = efficiency.skillLoadTotals
  const skillDenominator = skillTotals.loaded + skillTotals.failed + skillTotals.interrupted
  const unavailableHint = '실행 결과 계측 준비 중'
  return (
    <section>
      <SectionTitle title="효율" hint="비율은 분모와 함께 · 비용은 표시하지 않습니다" />
      <div className="mt-4">
        <StatGrid columns={4}>
        <Metric
          label="검증 성공 1건당 처리 토큰"
          value={available
            ? formatTokensPerSuccess(scope.totalProcessedTokens, verifiedSuccesses, efficiency.tokensPerVerifiedSuccess)
            : '미관측'}
          hint={!available
            ? unavailableHint
            : verifiedSuccesses === 0
              ? '검증 성공 0건'
              : verifiedSuccesses < RATE_MIN_SAMPLE
                ? `검증 성공 ${formatCount(verifiedSuccesses)}건 · 표본 ${RATE_MIN_SAMPLE}건 미만`
                : `검증 성공 ${formatCount(verifiedSuccesses)}건`}
          explanation={`기간 내 총 처리 토큰을 success이면서 검증을 통과한 실행 건수로 나눈 값입니다. 스킬 실행에 쓴 토큰만 골라낸 것이 아니라 에이전트 전체 처리량을 검증된 성과 단위로 정규화한 값이며, 검증 성공이 ${RATE_MIN_SAMPLE}건 미만이면 나눈 값 대신 총량과 건수를 참고로 보여줍니다.`}
        />
        <Metric
          label="검증 성공률"
          value={available ? formatSampledRate(verifiedSuccesses, verifiedAttempts) : '미관측'}
          hint={!available
            ? unavailableHint
            : verifiedAttempts === 0
              ? '검증 결과가 기록된 완료 시도 없음'
              : `${formatCount(verifiedSuccesses)} / ${formatCount(verifiedAttempts)}건`}
          explanation="탐색·결과 분석과 같은 정의입니다. success·partial·failed로 끝났고 검증 결과가 기록된 시도를 분모로, success이면서 검증을 통과한 시도를 분자로 삼습니다. 실행 보고에는 모델이 없어 모델별 성공률은 계산하지 않습니다."
        />
        <Metric
          label="도구 실패율"
          value={formatSampledRate(scope.toolFailures, scope.toolCalls)}
          hint={scope.toolCalls > 0
            ? `실패 ${formatCount(scope.toolFailures)} / 호출 ${formatCount(scope.toolCalls)}`
            : '도구 호출 미관측'}
          explanation="런타임이 실패로 기록한 도구 결과의 비율입니다. Hermes의 실패 판정은 아직 실제 실패 사례로 검증되지 않아 0이 실제 0건이 아닐 수 있습니다."
        />
        <Metric
          label="스킬 로드 실패율"
          value={scope.skillLoadsObserved ? formatSampledRate(skillTotals.failed + skillTotals.interrupted, skillDenominator) : '미관측'}
          hint={!scope.skillLoadsObserved
            ? '스킬 신호 없는 소스'
            : skillDenominator === 0
              ? '관측된 스킬 로드 없음'
              : `실패 ${formatCount(skillTotals.failed)} / 로드 ${formatCount(skillDenominator)}`}
          explanation="텔레메트리가 관측한 스킬 로드 시도 중 실패로 끝난 비율입니다. 중단(interrupted)은 계약에 있지만 현재 수집기가 기록하지 않아 0을 중단 없음으로 읽지 않습니다."
        />
        </StatGrid>
      </div>
    </section>
  )
}

/**
 * 에이전트별 효율 비교 표 — 전체 보기에서만 그린다.
 * 표를 화면 끝까지 늘리면 이름과 숫자 사이가 멀어져 행을 눈으로 잇기 어려우므로 최대 폭을 둔다.
 */
function AgentEfficiencyTable({
  agents,
  available,
  onSelectAgent,
}: {
  agents: AxAgentActivityAgentRow[]
  available: boolean
  onSelectAgent: (agentId: string) => void
}) {
  if (agents.length === 0) return null
  const cell = (value: string) => (available ? value : '미관측')
  return (
    <section>
      <SectionTitle title="에이전트별 효율" hint="같은 정의를 에이전트 단위로 나눈 값" />
      <div className="mt-3 max-w-[64rem] overflow-x-auto">
        <table className="w-full min-w-[44rem]">
          <thead><tr className="border-b border-[var(--border-subtle)]">
            <th scope="col" className={`text-left ${TH}`}>에이전트</th>
            <th scope="col" className={`text-right ${TH}`}>처리 토큰</th>
            <th scope="col" className={`text-right ${TH}`}>검증 성공 / 시도</th>
            <th scope="col" className={`text-right ${TH}`}>검증 성공률</th>
            <th scope="col" className={`text-right ${TH}`}>토큰 / 검증 성공</th>
            <th scope="col" className={`text-right ${TH}`}>도구 실패율</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {agents.map((agent) => {
              const execution = agent.verifiedExecutions
              const successes = execution.verifiedSuccesses ?? 0
              const attempts = execution.verifiedAttempts ?? 0
              const efficiency = efficiencyOf(agent)
              return (
                <tr key={agent.agentId} className="transition-colors hover:bg-[var(--bg-secondary)]">
                  <th scope="row" className={`${TD} text-left font-mono font-normal text-[var(--text-primary)]`}>
                    <button
                      type="button"
                      translate="no"
                      className="rounded-sm underline decoration-[var(--border-hover)] underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)]"
                      onClick={() => onSelectAgent(agent.agentId)}
                    >
                      {agent.agentId}
                    </button>
                  </th>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>{formatTokens(agent.totalProcessedTokens)}</td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                    {cell(`${formatCount(successes)} / ${formatCount(attempts)}`)}
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                    {cell(formatSampledRate(successes, attempts))}
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                    {cell(formatTokensPerSuccess(agent.totalProcessedTokens, successes, efficiency.tokensPerVerifiedSuccess))}
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                    {formatSampledRate(agent.toolFailures, agent.toolCalls)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 관측된 스킬 로드 순위와, 실패·중단이 있는 스킬만 따로 모은 목록 */
function SkillLoadSection({ scope }: { scope: ActivityScope }) {
  const failing = efficiencyOf(scope).failingSkills
  return (
    <div className="space-y-6">
      <RankTable
        title="관측된 스킬 로드"
        empty={scope.skillLoadsObserved
          ? '선택 기간에 관측된 스킬 로드가 없습니다.'
          : '이 수집 소스는 스킬 로드 신호를 제공하지 않아 미관측입니다.'}
        rows={scope.skills.map((row) => ({
          name: row.skillId,
          value: formatCount(row.loaded),
          hint: `실패 ${formatCount(row.failed)}${row.interrupted > 0 ? ` · 중단 ${formatCount(row.interrupted)}` : ''}`,
          magnitude: row.loaded,
        }))}
      />
      {scope.skillLoadsObserved && (
        <div>
          <SectionTitle title="실패·중단이 있는 스킬" hint={`${formatCount(failing.length)}개`} />
          {failing.length === 0 ? (
            <EmptyNote>선택 기간에 실패나 중단으로 끝난 스킬 로드가 없습니다.</EmptyNote>
          ) : (
            <div className="mt-3 divide-y divide-[var(--border-subtle)]">
              {failing.map((row) => {
                const total = row.loaded + row.failed + row.interrupted
                return (
                  <div key={row.skillId} className="grid grid-cols-[minmax(0,58%)_auto] items-center gap-4 py-2.5">
                    <p translate="no" className="truncate px-3 font-mono text-sm text-[var(--text-primary)]">{row.skillId}</p>
                    <p className="text-right font-mono text-sm tabular-nums text-[var(--accent-orange)]">
                      {formatSampledRate(row.failed + row.interrupted, total)}
                      <span className={`ml-2 ${META_LINE}`}>실패 {formatCount(row.failed)}{row.interrupted > 0 ? ` · 중단 ${formatCount(row.interrupted)}` : ''} / {formatCount(total)}</span>
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** 스킬을 얼마나 다양하게 불렀고, 그중 검증 완료까지 이어진 흐름이 얼마나 되는지 보여준다. */
function SkillImpactSummary({ scope, available }: { scope: ActivityScope; available: boolean }) {
  const execution = scope.verifiedExecutions
  // 실행 결과 테이블이 없으면 0이 아니라 미관측이다.
  const unavailableHint = '실행 결과 계측 준비 중'
  // 분모가 작으면 백분율 대신 분수와 참고 표시로 보여준다.
  const conversion = available
    ? formatSampledRate(execution.linkedVerifiedSuccesses, execution.linkedLoads)
    : '미관측'
  const conversionHint = !available
    ? unavailableHint
    : execution.linkedLoads === 0
      ? '연결 가능한 로드 없음'
      : execution.linkedLoads < RATE_MIN_SAMPLE
        ? `표본 ${RATE_MIN_SAMPLE}회 미만`
        : `${formatCount(execution.linkedVerifiedSuccesses)} / ${formatCount(execution.linkedLoads)}회`

  return (
    <section>
      <SectionTitle title="스킬 활용" hint="관측 범위가 다른 신호를 0으로 합치지 않습니다" />
      <div className="mt-4">
        <StatGrid columns={4}>
        <Metric
          label="고유 로드 스킬"
          value={scope.skillLoadsObserved ? `${formatCount(scope.uniqueLoadedSkills)}개` : '미관측'}
          explanation="에이전트 텔레메트리에서 실제 로드가 관측된 서로 다른 스킬 수입니다. Codex처럼 이 신호를 제공하지 않는 소스는 0으로 표시하지 않습니다."
        />
        <Metric
          label="검증 완료 스킬"
          value={available ? `${formatCount(execution.verifiedSkills)}개` : '미관측'}
          hint={available ? `실행 시도 고유 ${formatCount(execution.uniqueSkills)}개` : unavailableHint}
          explanation="서버에 success와 검증 통과가 함께 보고된 서로 다른 스킬 수입니다. 단순 로드와 구분합니다."
        />
        <Metric
          label="선행 로드 연결"
          value={available ? `${formatCount(execution.linkedLoads)}회` : '미관측'}
          hint={available ? `전체 실행 ${formatCount(execution.attempts)}회 중` : unavailableHint}
          explanation="서버 여정 기록에서 같은 journey 또는 session의 앞선 스킬 로드와 연결할 수 있는 실행 수입니다. 텔레메트리의 로드 관측 여부와는 별도 신호입니다."
        />
        <Metric
          label="로드→검증 성공"
          value={conversion}
          hint={conversionHint}
          explanation={`앞선 로드와 연결된 실행을 분모로 삼아 성공이면서 검증을 통과한 비율입니다. 미연결 실행은 분모에서 제외하고, 분모가 ${RATE_MIN_SAMPLE}회 미만이면 백분율 대신 분수를 참고 수치로 보여줍니다.`}
        />
        </StatGrid>
      </div>
    </section>
  )
}

function AgentSelector({
  agents,
  reporters,
  value,
  onChange,
}: {
  agents: AxAgentActivityAgentRow[]
  reporters: AxAgentReporterRow[]
  value: string
  onChange: (agentId: string) => void
}) {
  return (
    <section aria-labelledby="agent-filter-title">
      <SectionHeader
        id="agent-filter-title"
        label="에이전트별 보기"
        aside={`${formatCount(agents.length)}개 에이전트 · ${formatCount(reporters.length)}개 수집기`}
        description="선택하면 아래 모든 사용량과 실행 결과가 해당 에이전트 기준으로 바뀝니다."
      />
      {/* 스크롤 컨테이너가 포커스 링을 잘라내지 않게 안쪽 여백을 두고 바깥 여백으로 상쇄한다 */}
      <div className="-mx-1 mt-2 flex max-w-full gap-2 overflow-x-auto p-1" role="group" aria-label="에이전트 선택">
        <AgentButton label="전체" detail={`${formatCount(agents.length)}개`} active={value === 'all'} onClick={() => onChange('all')} />
        {agents.map((agent) => {
          const agentReporters = reporters.filter((row) => row.agentId === agent.agentId)
          const unhealthy = agentReporters.some((row) => row.freshness === 'stale' || row.healthStatus === 'blocked')
          const waiting = agentReporters.length > 0 && agentReporters.every((row) => row.freshness === 'waiting')
          return (
            <AgentButton
              key={agent.agentId}
              label={agent.agentId}
              detail={waiting ? '첫 수집 대기' : unhealthy ? '확인 필요' : `${formatCount(agentReporters.length)}개 소스`}
              active={value === agent.agentId}
              warning={unhealthy}
              onClick={() => onChange(agent.agentId)}
            />
          )
        })}
      </div>
    </section>
  )
}

function AgentButton({
  label,
  detail,
  active,
  warning = false,
  onClick,
}: {
  label: string
  detail: string
  active: boolean
  warning?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-primary)] ${active
        ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]'
        : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--border-hover)]'}`}
    >
      <span className="block max-w-[16rem] truncate font-mono text-xs" translate="no">{label}</span>
      <span className={`mt-0.5 block text-[11px] ${active ? 'opacity-65' : warning ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>{detail}</span>
    </button>
  )
}

function TokenBreakdown({ usage }: { usage: AxAgentTokenUsage }) {
  const rows = [
    { label: '입력', value: usage.inputTokens },
    { label: '출력', value: usage.outputTokens },
    { label: '캐시 생성', value: usage.cacheCreationInputTokens },
    { label: '캐시 읽기', value: usage.cacheReadInputTokens },
    { label: '추론', value: usage.thinkingTokens },
  ]
  const max = Math.max(1, ...rows.map((row) => row.value))
  const positive = rows.map((row) => row.value).filter((value) => value > 0)
  const min = positive.length > 0 ? Math.min(...positive) : max
  const relation = usage.thinkingTokensRelation === 'included-in-output'
    ? '추론 토큰은 출력에 포함'
    : usage.thinkingTokensRelation === 'separate-from-output'
      ? '추론 토큰은 출력과 별도'
      : '추론 토큰 포함 관계 미확정'
  return (
    <section>
      <SectionTitle title="토큰 구성" hint={`${relation} · 합계 ${formatTokens(processedTokens(usage))}`} />
      <div
        className="mt-4 grid gap-x-8 gap-y-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))' }}
      >
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <p className="text-xs text-[var(--text-secondary)]">{row.label}</p>
            <p className="mt-2 font-mono text-xl tabular-nums text-[var(--text-primary)]">{formatTokens(row.value)}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
              <span
                aria-hidden
                className="block h-full rounded-full"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  background: relativeActivityFill(row.value, min, max),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SourceCard({
  coverage,
  reporter,
  scoped,
}: {
  coverage: AxAgentSourceCoverageRow
  reporter?: AxAgentReporterRow
  scoped: boolean
}) {
  return (
    <div className="border-b border-[var(--border-subtle)] py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-primary)]">{SOURCE_LABELS[coverage.source]}</p>
        {scoped && reporter
          ? <CollectorStatus freshness={reporter.freshness} health={reporter.healthStatus} warnings={reporter.healthWarnings.length} />
          : <Status status={coverage.status} />}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{coverage.note}</p>
      <p className={`mt-2 ${META_LINE}`}>
        토큰 <Capability supported={coverage.capabilities.usage} /> · 도구 <Capability supported={coverage.capabilities.tools} /> · 스킬 <Capability supported={coverage.capabilities.skills} />
        {(reporter?.lastCollectedAt ?? coverage.lastCollectedAt) ? ` · ${formatDateTime(reporter?.lastCollectedAt ?? coverage.lastCollectedAt!)}` : ''}
      </p>
    </div>
  )
}

/** 소스가 신호를 제공하는지 — 스크린리더에는 글리프 대신 말로 읽힌다 */
function Capability({ supported }: { supported: boolean }) {
  return <span role="img" aria-label={supported ? '지원' : '미지원'}>{supported ? '✓' : '–'}</span>
}

function Insights({ insights }: { insights: AxAgentActivityData['insights'] }) {
  return (
    <section>
      <SectionTitle title="지금 할 수 있는 개선" hint="수집값에서 자동으로 찾은 우선순위" />
      <DefinitionRows
        rows={insights.map((insight) => ({
          title: insight.title,
          detail: insight.detail,
          warning: insight.severity === 'warning',
        }))}
      />
    </section>
  )
}

function AgentNotices({ reporters, scope }: { reporters: AxAgentReporterRow[]; scope: ActivityScope }) {
  const notices = useMemo(() => {
    const rows: Array<{ title: string; detail: string; warning: boolean }> = []
    const stale = reporters.filter((row) => row.freshness === 'stale')
    const blocked = reporters.filter((row) => row.healthStatus === 'blocked')
    const waiting = reporters.filter((row) => row.freshness === 'waiting')
    if (blocked.length > 0) rows.push({ title: '수집 차단', detail: `${blocked.length}개 소스가 수집기 경고로 차단됐습니다.`, warning: true })
    if (stale.length > 0) rows.push({ title: '수집 지연', detail: `${stale.length}개 소스가 예정된 두 번의 주기 안에 보고하지 않았습니다.`, warning: true })
    if (waiting.length > 0) rows.push({ title: '첫 수집 대기', detail: `${waiting.length}개 소스가 설치됐지만 아직 첫 배치를 보내지 않았습니다.`, warning: false })
    if (scope.toolCalls >= 10 && scope.toolFailures / scope.toolCalls >= 0.05) {
      rows.push({ title: `도구 실패 ${formatSampledRate(scope.toolFailures, scope.toolCalls)}`, detail: '반복되는 권한·입력·재시도 문제를 점검할 만합니다.', warning: true })
    }
    return rows
  }, [reporters, scope.toolCalls, scope.toolFailures])
  if (notices.length === 0) return null
  return (
    <section>
      <SectionTitle title="이 에이전트에서 확인할 점" hint="선택한 에이전트의 수집·실패 신호" />
      <DefinitionRows rows={notices} />
    </section>
  )
}

function ReporterSection({
  reporters,
  showAgentLinks,
  onSelectAgent,
}: {
  reporters: AxAgentReporterRow[]
  showAgentLinks: boolean
  onSelectAgent: (agentId: string) => void
}) {
  return (
    <section>
      <SectionTitle title="수집기 상태" hint="에이전트 ID와 소스마다 별도 체크포인트를 사용합니다" />
      <div className="mt-3 grid gap-3 md:hidden">
        {reporters.map((row) => (
          <div key={`${row.agentId}-${row.source}`} className="rounded-xl border border-[var(--border-subtle)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                {showAgentLinks ? (
                  <button type="button" className="font-mono text-sm text-[var(--text-primary)] underline decoration-[var(--border-hover)] underline-offset-4 hover:decoration-current" onClick={() => onSelectAgent(row.agentId)}>
                    {row.agentId}
                  </button>
                ) : <p className="font-mono text-sm text-[var(--text-primary)]">{row.agentId}</p>}
                <p className="mt-1 text-xs text-[var(--text-muted)]">{SOURCE_LABELS[row.source]} · {row.managed ? '자동' : '기존 방식'}</p>
              </div>
              <CollectorStatus freshness={row.freshness} health={row.healthStatus} warnings={row.healthWarnings.length} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border-subtle)] pt-3 text-right">
              <SmallStat label="수집 경과" value={row.freshnessHours === null ? '대기' : `${row.freshnessHours}h`} />
              <SmallStat label="턴" value={formatCount(row.turns)} />
              <SmallStat label="처리 토큰" value={formatTokens(processedTokens(row.usage))} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px]">
          <thead><tr className="border-b border-[var(--border-subtle)]">
            <th className={`text-left ${TH}`}>에이전트</th>
            <th className={`text-left ${TH}`}>소스</th>
            <th className={`text-left ${TH}`}>상태</th>
            <th className={`text-right ${TH}`}>수집 경과</th>
            <th className={`text-right ${TH}`}>턴</th>
            <th className={`text-right ${TH}`}>처리 토큰</th>
            <th className={`text-right ${TH}`}>도구 실패</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {reporters.map((row) => (
              <tr key={`${row.agentId}-${row.source}`} className="transition-colors hover:bg-[var(--bg-secondary)]">
                <td className={`${TD} font-mono text-[var(--text-primary)]`}>
                  {showAgentLinks ? (
                    <button type="button" className="underline decoration-[var(--border-hover)] underline-offset-4 hover:decoration-current" onClick={() => onSelectAgent(row.agentId)}>{row.agentId}</button>
                  ) : row.agentId}
                </td>
                <td className={`${TD} text-[var(--text-secondary)]`}>
                  {SOURCE_LABELS[row.source]}
                  <span className="ml-2 font-mono text-[11px] text-[var(--text-muted)]">{row.managed ? '자동' : '기존 방식'}</span>
                </td>
                <td className={TD}><CollectorStatus freshness={row.freshness} health={row.healthStatus} warnings={row.healthWarnings.length} /></td>
                <td className={`${TD} text-right font-mono ${row.freshness === 'stale' || row.healthStatus === 'blocked' ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`}>
                  {row.freshnessHours === null ? '첫 수집 대기' : `${row.freshnessHours}시간`}
                </td>
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>{formatCount(row.turns)}</td>
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>{formatTokens(processedTokens(row.usage))}</td>
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>{formatSampledRate(row.toolFailures, row.toolCalls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-[var(--text-muted)]">{label}</p><p className="mt-1 font-mono text-xs text-[var(--text-primary)]">{value}</p></div>
}

/** 수집 batch의 관측치와 서버의 검증된 실행 결과를 분리해 보여준다. */
function ExecutionSection({ scope, available }: { scope: ActivityScope; available: boolean }) {
  const execution = scope.verifiedExecutions
  const observed = scope.observedExecutionReports.reduce((sum, row) => sum + row.count, 0)
  // 실행 결과 테이블이 없으면 네 칸 모두 0이 아니라 미관측으로 남긴다.
  const count = (value: number) => (available ? formatCount(value) : '미관측')
  const pair = (left: number, right: number) => (available ? `${formatCount(left)} / ${formatCount(right)}` : '미관측')
  return (
    <section>
      <SectionTitle title="검증된 스킬 실행 결과" hint="자동 사용량과 명시적 스킬 실행 보고를 합산하지 않습니다" />
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
        수집 로그에서 관측한 작업 종료 {formatCount(observed)}건은 런타임 안정성 대조용입니다.
        아래 수치는 서버에 명시적으로 보고된 스킬 실행 결과만 셉니다.
      </p>
      <div className="mt-4">
        <StatGrid columns={4}>
        <Metric label="전체 시도" value={count(execution.attempts)} hint={available ? `검증 근거 ${formatCount(execution.withEvidence)}` : '실행 결과 계측 준비 중'} explanation="스킬 실행 시작이 서버에 보고된 고유 시도 수입니다. 검증 근거는 테스트·명령·산출물·사용자 확인 결과가 함께 보고된 시도입니다." />
        <Metric label="성공" value={count(execution.success)} explanation="에이전트가 완료 상태를 success로 보고한 시도입니다. 검증 근거가 있는 성공과는 구분해서 봅니다." />
        <Metric label="부분 / 실패" value={pair(execution.partial, execution.failed)} explanation="일부만 완료한 partial과 명시적으로 실패를 보고한 failed 시도입니다." />
        <Metric label="진행 / 중단" value={pair(execution.running, execution.abandoned)} explanation="아직 완료 보고가 없는 진행 중 시도와 일정 시간 뒤에도 완료되지 않은 중단 시도입니다." />
        </StatGrid>
      </div>
    </section>
  )
}

/** 공통 Stat에 위임 — 힌트는 항상 보이는 보조 수치, 설명은 호버·포커스 때만 보인다 */
function Metric({
  label,
  value,
  hint,
  explanation,
}: {
  label: string
  value: string
  hint?: string
  explanation?: string
}) {
  return <Stat label={label} value={value} hint={hint} description={explanation} />
}


/** 섹션 머리 — 공통 모노 라벨과 오른쪽 보조 문구 */
function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return <SectionHeader label={title} aside={hint} />
}

function Status({ status }: { status: AxAgentSourceCoverageRow['status'] }) {
  const active = status === 'reporting'
  return (
    <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-medium ${active ? 'bg-[var(--bg-tertiary)] text-[var(--brand-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function CollectorStatus({
  freshness,
  health,
  warnings,
}: {
  freshness: 'fresh' | 'stale' | 'waiting'
  health: 'healthy' | 'blocked' | 'unknown'
  warnings: number
}) {
  const label = health === 'blocked'
    ? '수집 차단'
    : freshness === 'waiting'
      ? '첫 수집 대기'
      : freshness === 'stale'
        ? '수집 지연'
        : health === 'healthy'
          ? '정상'
          : '수집 중'
  const warning = health === 'blocked' || freshness === 'stale'
  return (
    <span className={`rounded-full bg-[var(--bg-tertiary)] px-2.5 py-1 font-mono text-[11px] font-medium ${warning ? 'text-[var(--accent-orange)]' : 'text-[var(--text-muted)]'}`}>
      {label}{warnings > 0 ? ` · 경고 ${warnings}` : ''}
    </span>
  )
}

function RankTable({
  title,
  rows,
  empty = '아직 관측된 항목이 없습니다.',
}: {
  title: string
  rows: Array<{ name: string; value: string; hint: string; magnitude: number }>
  empty?: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.magnitude))
  const positive = rows.map((row) => row.magnitude).filter((value) => value > 0)
  const min = positive.length > 0 ? Math.min(...positive) : max
  return (
    <section>
      <SectionTitle title={title} hint={`상위 ${formatCount(rows.length)}개`} />
      {rows.length === 0 ? (
        <p className={`mt-3 ${EMPTY_NOTE}`}>{empty}</p>
      ) : (
        <div className="mt-3 divide-y divide-[var(--border-subtle)]">
          {rows.map((row) => (
            <div key={row.name} className="grid grid-cols-[minmax(0,58%)_auto] items-center gap-4 py-2.5">
              {/* 스킬별 실제 적용 표처럼 이름 칸 안에만 활동 농도 막대를 깐다 */}
              <div className="relative min-w-0 py-1">
                <span
                  aria-hidden
                  className="ax-activity-mark absolute inset-y-0 left-0"
                  data-activity-fill={relativeActivityFill(row.magnitude, min, max)}
                  style={{
                    width: `${(row.magnitude / max) * 100}%`,
                    background: relativeActivityFill(row.magnitude, min, max),
                  }}
                />
                <p className="relative truncate px-3 font-mono text-sm text-[var(--text-primary)]">{row.name}</p>
              </div>
              <p className="text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">
                {row.value} <span className={`ml-2 ${META_LINE}`}>{row.hint}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
