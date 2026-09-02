'use client'

/** AX 대시보드 — 에이전트 활동 패널 본문 */

import { useMemo, useState } from 'react'
import type {
  AxAgentActivityAgentRow,
  AxAgentActivityData,
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

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
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

  return (
    <div className="space-y-10">
      <AgentSelector
        agents={data.agents}
        reporters={data.reporters}
        value={activeAgentId}
        onChange={selectAgent}
      />

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
            hint={`실패 ${formatSampledRate(scope.toolFailures, scope.toolCalls)}`}
            explanation="쉘·파일 읽기·편집·검색처럼 런타임이 기록한 도구 호출입니다. OpenClaw 요약 소스처럼 도구를 제공하지 않는 소스는 포함되지 않습니다."
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

      <SkillImpactSummary scope={scope} available={data.verifiedExecutionsAvailable} />

      <TokenBreakdown usage={scope.totalUsage} />

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

      <div className="grid gap-10 lg:grid-cols-2">
        <RankTable
          title="모델별 처리 토큰"
          rows={scope.models.map((row) => ({
            name: row.model,
            value: formatTokens(row.processedTokens),
            hint: `${formatCount(row.turns)}턴`,
            magnitude: row.processedTokens,
          }))}
        />
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

      <RankTable
        title="관측된 스킬 로드"
        empty={scope.skillLoadsObserved
          ? '선택 기간에 관측된 스킬 로드가 없습니다.'
          : '이 수집 소스는 스킬 로드 신호를 제공하지 않아 미관측입니다.'}
        rows={scope.skills.map((row) => ({
          name: row.skillId,
          value: formatCount(row.loaded),
          hint: `실패 ${formatCount(row.failed)} · 중단 ${formatCount(row.interrupted)}`,
          magnitude: row.loaded,
        }))}
      />

      <ExecutionSection scope={scope} available={data.verifiedExecutionsAvailable} />
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
          explanation="에이전트 텔레메트리에서 실제 로드가 관측된 서로 다른 스킬 수입니다. Hermes·Codex처럼 이 신호를 제공하지 않는 소스는 0으로 표시하지 않습니다."
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

/** 공통 Stat에 위임 — 힌트는 보조 문구, 설명은 `?`로 접힌다 */
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
  return <Stat label={label} value={value} note={hint} help={explanation} />
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
