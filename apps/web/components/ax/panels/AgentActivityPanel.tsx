/** AX 대시보드 — 에이전트 활동 패널 본문 */

import type {
  AxAgentActivityData,
  AxAgentSourceCoverageRow,
  AxAgentTelemetrySource,
} from '@/lib/features/ax'
import { formatCount, formatDateTime } from '../format'
import type { AxPanelViewProps } from './types'

const SOURCE_LABELS: Record<AxAgentTelemetrySource, string> = {
  openclaw: 'OpenClaw',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
}

const STATUS_LABELS: Record<AxAgentSourceCoverageRow['status'], string> = {
  reporting: '수집 중',
  stale: '지연',
  missing: '미보고',
  unsupported: '어댑터 필요',
  alternate: 'Claude로 대체',
}

const TH = 'px-3 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-[var(--text-muted)]'
const TD = 'px-3 py-3 text-sm'

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
  return String(value)
}

function rate(failures: number, calls: number): string {
  return calls > 0 ? `${Math.round((failures / calls) * 1000) / 10}%` : '0%'
}

export function AgentActivityPanel({ data, days }: AxPanelViewProps<AxAgentActivityData>) {
  return (
    <div className="space-y-10">
      <div>
        <p className="font-mono text-[11px] text-[var(--text-muted)]">
          최근 {days}일 · 마지막 수집 {formatDateTime(data.syncedAt)} · {formatCount(data.collection.batches)}개 배치
        </p>
        <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">
          실제 집계 {formatDateTime(data.windowStart)} – {formatDateTime(data.windowEnd)}
        </p>
        <div className="mt-3 grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="처리 토큰" value={formatTokens(data.totalProcessedTokens)} hint="추론 토큰 중복 제외" />
          <Metric label="턴 / 세션" value={`${formatCount(data.turns)} / ${formatCount(data.sessions)}`} />
          <Metric label="도구 호출" value={formatCount(data.toolCalls)} hint={`실패 ${rate(data.toolFailures, data.toolCalls)}`} />
          <Metric label="수집 레코드" value={formatCount(data.collection.recordsRead)} hint={`파싱 실패 ${formatCount(data.collection.parseFailures)}`} />
        </div>
      </div>

      <section>
        <SectionTitle title="소스 커버리지" hint="보이지 않는 소스를 0으로 오해하지 않습니다" />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {data.sourceCoverage.map((row) => (
            <div key={row.source} className="rounded-xl border border-[var(--border-subtle)] px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">{SOURCE_LABELS[row.source]}</p>
                <Status status={row.status} />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{row.note}</p>
              <p className="mt-3 font-mono text-[10px] text-[var(--text-muted)]">
                토큰 {row.capabilities.usage ? '✓' : '–'} · 도구 {row.capabilities.tools ? '✓' : '–'} · 스킬 {row.capabilities.skills ? '✓' : '–'}
                {row.lastCollectedAt ? ` · ${formatDateTime(row.lastCollectedAt)}` : ''}
              </p>
            </div>
          ))}
        </div>
      </section>

      {data.insights.length > 0 && (
        <section>
          <SectionTitle title="지금 할 수 있는 개선" hint="수집값에서 자동으로 찾은 우선순위" />
          <div className="mt-3 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            {data.insights.map((insight, index) => (
              <div key={`${insight.title}-${index}`} className="grid gap-1 py-4 md:grid-cols-[9rem_1fr] md:gap-5">
                <p className={`text-sm ${insight.severity === 'warning' ? 'text-[var(--accent-orange)]' : 'text-[var(--text-primary)]'}`}>
                  {insight.title}
                </p>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{insight.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle title="수집기 상태" hint="에이전트 ID와 소스마다 별도 체크포인트를 사용합니다" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr className="border-b border-[var(--border-subtle)]">
              <th className={`text-left ${TH}`}>에이전트</th>
              <th className={`text-left ${TH}`}>소스</th>
              <th className={`text-right ${TH}`}>수집 경과</th>
              <th className={`text-right ${TH}`}>턴</th>
              <th className={`text-right ${TH}`}>처리 토큰</th>
              <th className={`text-right ${TH}`}>도구 실패</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.reporters.map((row) => (
                <tr key={`${row.agentId}-${row.source}`}>
                  <td className={`${TD} font-mono text-[var(--text-primary)]`}>{row.agentId}</td>
                  <td className={`${TD} text-[var(--text-secondary)]`}>{SOURCE_LABELS[row.source]}</td>
                  <td className={`${TD} text-right font-mono ${row.freshness === 'stale' ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'}`}>
                    {row.freshnessHours}시간
                  </td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>{formatCount(row.turns)}</td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-primary)]`}>{formatTokens(
                    row.usage.inputTokens + row.usage.outputTokens + row.usage.cacheCreationInputTokens + row.usage.cacheReadInputTokens +
                    (row.usage.thinkingTokensRelation === 'separate-from-output' ? row.usage.thinkingTokens : 0)
                  )}</td>
                  <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>{rate(row.toolFailures, row.toolCalls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <RankTable
          title="모델별 처리 토큰"
          rows={data.models.map((row) => ({ name: row.model, value: formatTokens(row.processedTokens), hint: `${formatCount(row.turns)}턴` }))}
        />
        <RankTable
          title="도구 호출·실패"
          rows={data.tools.map((row) => ({ name: row.name, value: formatCount(row.calls), hint: `실패 ${row.failureRate}%` }))}
        />
      </div>

      {data.skills.length > 0 && (
        <RankTable
          title="스킬 로드"
          rows={data.skills.map((row) => ({ name: row.skillId, value: formatCount(row.loaded), hint: `실패 ${formatCount(row.failed)} · 중단 ${formatCount(row.interrupted)}` }))}
        />
      )}

      <ExecutionSection data={data} />
    </div>
  )
}

/** 수집 batch의 관측치와 서버의 검증된 실행 결과를 분리해 보여준다. */
function ExecutionSection({ data }: { data: AxAgentActivityData }) {
  const execution = data.verifiedExecutions
  const observed = data.observedExecutionReports.reduce((sum, row) => sum + row.count, 0)
  return (
    <section>
      <SectionTitle title="검증된 스킬 실행 결과" hint="자동 사용량과 명시적 스킬 실행 보고를 합산하지 않습니다" />
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
        수집 로그에서 관측한 작업 종료 {formatCount(observed)}건은 런타임 안정성 대조용입니다.
        아래 수치는 서버에 명시적으로 보고된 스킬 실행 결과만 셉니다.
      </p>
      <div className="mt-3 grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="전체 시도" value={formatCount(execution.attempts)} hint={`검증 근거 ${formatCount(execution.withEvidence)}`} />
        <Metric label="성공" value={formatCount(execution.success)} />
        <Metric label="부분 / 실패" value={`${formatCount(execution.partial)} / ${formatCount(execution.failed)}`} />
        <Metric label="진행 / 중단" value={`${formatCount(execution.running)} / ${formatCount(execution.abandoned)}`} />
      </div>
    </section>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-[var(--bg-primary)] px-5 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 font-mono text-xl tabular-nums text-[var(--text-primary)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  )
}

function Status({ status }: { status: AxAgentSourceCoverageRow['status'] }) {
  const active = status === 'reporting'
  return (
    <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${active ? 'bg-[var(--bg-tertiary)] text-[var(--brand-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function RankTable({ title, rows }: { title: string; rows: Array<{ name: string; value: string; hint: string }> }) {
  return (
    <section>
      <SectionTitle title={title} hint={`상위 ${formatCount(rows.length)}개`} />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">아직 관측된 항목이 없습니다.</p>
      ) : (
        <div className="mt-3 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {rows.map((row) => (
            <div key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
              <p className="truncate font-mono text-[13px] text-[var(--text-primary)]">{row.name}</p>
              <p className="text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">
                {row.value} <span className="ml-2 text-[10px] text-[var(--text-muted)]">{row.hint}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
