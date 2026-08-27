'use client'

/** AX 대시보드 — 스킬 사용량 안의 탐색·결과 분석 보기 */

import type { AxJourneyInsightsData, AxSkillOutcomeRow } from '@/lib/features/ax'
import type { AxPanelViewProps } from './types'
import { formatCount, formatDate } from '../format'

const TH = 'px-3 py-2.5 font-mono text-[11px] font-normal uppercase tracking-[0.14em] text-[var(--text-muted)]'
const TD = 'px-3 py-2.5'

/** 검색 품질과 로드 이후 결과 누락을 한 화면에 연결한다 */
export function JourneyInsightsPanel({ data, days }: AxPanelViewProps<AxJourneyInsightsData>) {
  const topZero = data.zeroResultQueries[0]
  const topUnreported = data.skillOutcomes.find((skill) => skill.unreportedPairs > 0)

  return (
    <div className="space-y-12">
      <div>
        <p className="max-w-4xl text-sm leading-relaxed text-[var(--text-secondary)]">
          검색 결과에 나온 후보를 에이전트가 상세 확인했는지, 확인한 뒤 적용 또는 미적용 판단을
          기록했는지 같은 세션×스킬을 따라갑니다. 검색에는 자동 검색 훅과 직접 실행한 MCP 검색이 모두 포함됩니다.
        </p>
        <p className="mt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
          최근 {days}일 · 검색은 요청 단위, 전환은 세션×스킬 단위
        </p>
        {days > 30 && (
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-[var(--text-muted)]">
            검색 요청·MCP 오류는 30일 보존 대상으로 설정된 감사 로그를 사용합니다. 정리 작업
            실행 상태에 따라 90일 구간이 불완전할 수 있으며, 현재 남아 있는 로그만 포함합니다.
          </p>
        )}
      </div>

      <MetricStrip data={data} />

      <JourneyGuide data={data} />

      <ExecutionSection data={data.execution} />

      <div className="grid gap-10 lg:grid-cols-2">
        <ZeroResultSection data={data} />
        <OutcomeSection data={data} />
      </div>

      {data.skillOutcomes.length > 0 && <OutcomeTable rows={data.skillOutcomes} />}

      <ReasonSection data={data} />

      <AlertSection topZero={topZero} topUnreported={topUnreported} />

      <MeasurementDefinitions />
    </div>
  )
}

/** 새 실행 결과 계약 — 적용 자기보고와 검증된 성공을 분리한다 */
function ExecutionSection({ data }: { data: AxJourneyInsightsData['execution'] }) {
  return (
    <section>
      <SectionTitle eyebrow="실행 결과 계측" title="실제 적용 시도 결과" />
      {data === null ? (
        <EmptyNote>아직 새 실행 결과 계약으로 보고된 시도가 없습니다. 기존 적용 기록을 성공률로 바꾸지 않습니다.</EmptyNote>
      ) : (
        <>
          <div className="mt-4 grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: '성공', value: data.success },
              { label: '부분 성공', value: data.partial },
              { label: '실패', value: data.failed },
              { label: '시도 중단', value: data.abandoned },
            ].map((item) => (
              <div key={item.label} className="bg-[var(--bg-primary)] p-5">
                <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                <p className="mt-2 font-mono text-xl tabular-nums text-[var(--text-primary)]">
                  {formatCount(item.value)}회
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            전체 {formatCount(data.attempts)}회 · 자기보고 성공률 {formatRate(data.selfReportedSuccessRate)} ·
            검증 결과가 있는 {formatCount(data.verifiedAttempts)}회 중 검증 성공률 {formatRate(data.verifiedSuccessRate)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
            검증 성공은 status=success이면서 테스트·명령·산출물·사용자 확인 결과가 통과한 경우만 셉니다.
            시도 중단은 성공률 분모에서 제외합니다.
          </p>

          <div className="mt-8">
            <SectionTitle eyebrow="계측 건강도" title="시작 보고와 완료 보고의 연결 상태" />
            <div className="mt-4 grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-3">
              {[
                { label: '시작이 관측된 시도', value: `${formatCount(data.startedAttempts)} / ${formatCount(data.attempts)}회`, note: '구형 완료 보고는 시작 미관측으로 남깁니다.' },
                { label: '진행 중', value: `${formatCount(data.inProgressAttempts)}회`, note: '시작 후 30분 이내이며 아직 완료되지 않음' },
                { label: '완료 보고 지연', value: `${formatCount(data.unreportedAttempts)}회`, note: '시작 후 30분이 지나도 완료 이벤트가 없음' },
                { label: '시작 없이 완료', value: `${formatCount(data.completionWithoutStart)}회`, note: '구형 클라이언트 또는 시작 훅 누락 후보' },
                { label: '버전 미기록', value: `${formatCount(data.missingVersion)}회`, note: 'SKILL.md 버전 또는 commit SHA 보완 필요' },
                { label: '검증 없는 완료', value: `${formatCount(data.unvalidatedCompleted)}회`, note: data.averageDurationSeconds === null ? '관측된 실행 시간 없음' : `시작·완료 연결 평균 ${formatDuration(data.averageDurationSeconds)}` },
              ].map((item) => (
                <div key={item.label} className="bg-[var(--bg-primary)] p-5">
                  <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
                  <p className="mt-2 font-mono text-xl tabular-nums text-[var(--text-primary)]">{item.value}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          {data.agents.length > 0 && (
            <div className="mt-8">
              <SectionTitle eyebrow="에이전트별 상세" title="어느 에이전트에서 실행과 보고가 막히는가" />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th className={`${TH} text-left`}>에이전트 ID</th>
                      <th className={`${TH} text-left`}>런타임</th>
                      <th className={`${TH} text-right`}>전체</th>
                      <th className={`${TH} text-right`}>완료</th>
                      <th className={`${TH} text-right`}>성공</th>
                      <th className={`${TH} text-right`}>부분/실패</th>
                      <th className={`${TH} text-right`}>진행 중</th>
                      <th className={`${TH} text-right`}>보고 지연</th>
                      <th className={`${TH} text-right`}>검증 성공률</th>
                      <th className={`${TH} text-right`}>최근 보고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {data.agents.map((row) => (
                      <tr key={`${row.runtime}:${row.agentId}`} className="transition-colors hover:bg-[var(--bg-secondary)]">
                        <td className={`${TD} font-mono text-xs text-[var(--text-primary)]`}>{row.agentId}</td>
                        <td className={`${TD} text-xs text-[var(--text-secondary)]`}>{row.runtime}</td>
                        <NumberCell value={row.attempts} />
                        <NumberCell value={row.completed} />
                        <NumberCell value={row.success} />
                        <NumberCell value={row.partial + row.failed} emphasize={row.partial + row.failed > 0} />
                        <NumberCell value={row.inProgress} />
                        <NumberCell value={row.unreported} emphasize={row.unreported > 0} />
                        <td className={`${TD} text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]`}>
                          {row.verifiedAttempts === 0 ? '미측정' : formatRate(row.verifiedSuccessRate)}
                        </td>
                        <td className={`${TD} text-right font-mono text-[11px] text-[var(--text-muted)]`}>
                          {formatDate(row.lastReportedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** 가장 먼저 볼 네 가지 비율 */
function MetricStrip({ data }: { data: AxJourneyInsightsData }) {
  const metrics = [
    {
      label: '결과가 기록된 검색',
      value: formatCount(data.exploration.observedSearches),
      unit: '건',
      note: data.exploration.unobservedSearches > 0
        ? `결과 배열 미기록 ${formatCount(data.exploration.unobservedSearches)}건 제외`
        : '검색 결과 목록까지 저장된 요청',
    },
    {
      label: '검색결과 0건 비율',
      value: formatRate(data.exploration.zeroResultRate),
      unit: '',
      note: `${formatCount(data.exploration.zeroResultSearches)} / ${formatCount(data.exploration.observedSearches)}건${data.exploration.sampleIsSignificant ? '' : ' · 표본 100건 미만'}`,
    },
    {
      label: '고유 후보 상세 확인율',
      value: formatRate(data.exploration.searchToLoadRate),
      unit: '',
      note: `고유 후보 ${formatCount(data.exploration.exposedPairs)}개 중 ${formatCount(data.exploration.loadedFromSearchPairs)}개`,
    },
    {
      label: '로드 후 적용 판단 기록률',
      value: formatRate(data.exploration.loadToDecisionRate),
      unit: '',
      note: `검색에서 이어진 상세 확인 ${formatCount(data.exploration.loadedFromSearchPairs)}개 중 ${formatCount(data.exploration.appliedFromSearchPairs + data.exploration.notAppliedFromSearchPairs)}개`,
    },
  ]

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 bg-[var(--bg-primary)] px-5 py-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {metric.label}
          </p>
          <p className="mt-2 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-2xl text-[var(--text-primary)]">{metric.value}</span>
            {metric.unit && <span className="text-xs text-[var(--text-muted)]">{metric.unit}</span>}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{metric.note}</p>
        </div>
      ))}
    </div>
  )
}

/** 동일한 세션×스킬을 검색 후보부터 적용 판단까지 연결한 엄격한 퍼널 */
function JourneyGuide({ data }: { data: AxJourneyInsightsData }) {
  const { exploration } = data
  // 개발 서버 HMR이나 롤링 배포 중 이전 응답이 잠시 남아도 패널 전체가 깨지지 않게 한다.
  const totalExposures = exploration.totalExposures ?? exploration.exposedPairs
  const decidedPairs = exploration.appliedFromSearchPairs + exploration.notAppliedFromSearchPairs
  const steps = [
    {
      number: '1',
      title: '고유 검색 후보',
      value: exploration.exposedPairs,
      rate: null,
      body: '검색 결과에 나온 후보를 세션×스킬 기준으로 중복 제거한 값입니다. 다음 단계의 상세 확인·적용 판단과 같은 단위로 비교합니다.',
    },
    {
      number: '2',
      title: '후보 상세 확인',
      value: exploration.loadedFromSearchPairs,
      rate: exploration.searchToLoadRate,
      body: '검색 요약이 관련 있어 보여 에이전트가 같은 세션에서 전체 스킬 지침을 불러온 경우입니다.',
    },
    {
      number: '3',
      title: '적용 판단 기록',
      value: decidedPairs,
      rate: exploration.loadToDecisionRate,
      body: '상세 확인한 후보에 대해 에이전트가 적용 또는 미적용을 명시한 경우입니다. 성공률은 아닙니다.',
    },
  ]

  return (
    <section>
      <SectionTitle eyebrow="동일 후보 퍼널" title="검색 후보 → 상세 확인 → 적용 판단 기록" />
      <p className="mt-2 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        반복 포함 검색 후보 총 노출 {formatCount(totalExposures)}회 · 세션×스킬 기준 고유 후보 {formatCount(exploration.exposedPairs)}개
      </p>
      <div className="mt-4 grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] lg:grid-cols-3">
        {steps.map((step) => (
          <div key={step.number} className="bg-[var(--bg-primary)] p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full border border-[var(--border-hover)] font-mono text-[11px] text-[var(--text-muted)]">
                {step.number}
              </span>
              <p className="text-sm text-[var(--text-primary)]">{step.title}</p>
            </div>
            <p className="mt-4 font-mono text-xl tabular-nums text-[var(--text-primary)]">
              {formatCount(step.value)}개
              {step.rate !== null && (
                <span className="ml-2 text-xs text-[var(--text-muted)]">직전 단계의 {formatRate(step.rate)}</span>
              )}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">{step.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
        세 단계는 모두 동일한 세션×스킬 후보를 시간 순서대로 연결합니다. 총 노출은 반복 추천 문제를
        보기 위한 보조값이고 전환율 분모에는 쓰지 않습니다. 검색결과 0건 비율은 후보가 생기기 전의
        검색 요청 품질 지표이므로 이 퍼널과 별도로 계산합니다.
      </p>
    </section>
  )
}

/** 검색 결과 배열이 비었던 검색어 우선순위 */
function ZeroResultSection({ data }: { data: AxJourneyInsightsData }) {
  return (
    <section>
      <SectionTitle eyebrow="검색 품질" title="결과가 없었던 검색어" />
      {data.zeroResultQueries.length === 0 ? (
        <EmptyNote>선택 기간에 결과가 0개였던 검색어가 없습니다.</EmptyNote>
      ) : (
        <ol className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {data.zeroResultQueries.map((row, index) => (
            <li key={`${row.text}:${index}`} className="flex items-center gap-4 py-3">
              <span className="w-5 shrink-0 text-right font-mono text-[11px] text-[var(--text-muted)]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]" title={row.text}>
                {row.text}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                {formatCount(row.count)}회
              </span>
              <span className="hidden shrink-0 font-mono text-[11px] text-[var(--text-muted)] sm:block">
                {formatDate(row.lastSeenAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** 검색과 무관한 직접 로드까지 포함한 전체 로드 건강도 */
function OutcomeSection({ data }: { data: AxJourneyInsightsData }) {
  const { outcomes } = data
  const segments = [
    { label: '적용 기록', value: outcomes.appliedPairs, color: 'bg-[var(--brand-primary)]' },
    { label: '미적용 기록', value: outcomes.notAppliedPairs, color: 'bg-[#8f6a5a]' },
    { label: '적용 여부 기록 없음', value: outcomes.unreportedPairs, color: 'bg-[var(--border-hover)]' },
  ]

  return (
    <section>
      <SectionTitle eyebrow="전체 로드 건강도 · 검색 외 직접 로드 포함" title="상세 확인 뒤 적용 판단 기록" />
      {outcomes.loadedPairs === 0 ? (
        <EmptyNote>선택 기간에 스킬 콘텐츠 로드가 없습니다.</EmptyNote>
      ) : (
        <>
          <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            {segments.map((segment) => (
              <span
                key={segment.label}
                className={segment.color}
                style={{ width: `${(segment.value / outcomes.loadedPairs) * 100}%` }}
                title={`${segment.label} ${formatCount(segment.value)}조합`}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {segments.map((segment) => (
              <div key={segment.label}>
                <p className="text-xs text-[var(--text-muted)]">{segment.label}</p>
                <p className="mt-1 font-mono text-lg tabular-nums text-[var(--text-primary)]">
                  {formatCount(segment.value)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
            적용 여부를 기록한 경우 중 적용 기록 비율은 {formatRate(outcomes.confirmedApplyRate)}입니다.
            위 퍼널과 달리 검색 없이 직접 상세를 불러온 경우도 포함합니다. 기록 없음은 실패가 아니라
            관측 공백이며, 적용했어도 보고 이벤트가 없으면 여기에 포함됩니다.
          </p>
        </>
      )}
    </section>
  )
}

/** 결과 누락이 많은 스킬을 관리 우선순위로 보여준다 */
function OutcomeTable({ rows }: { rows: AxSkillOutcomeRow[] }) {
  return (
    <section>
      <SectionTitle eyebrow="스킬 건강도 · 현재 가능한 프록시" title="적용 여부 기록이 부족한 스킬" />
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[var(--text-muted)]">
        검색 출발 여부와 무관한 전체 상세 로드 기준입니다. 같은 세션에서 같은 스킬을 여러 번
        로드해도 한 조합으로 셉니다. 자동 스킵은 실패로 간주하지 않고 적용 여부 기록 없음에 포함합니다.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className={`${TH} text-left`}>스킬</th>
              <th className={`${TH} text-right`}>로드 조합</th>
              <th className={`${TH} text-right`}>적용 기록</th>
              <th className={`${TH} text-right`}>미적용 기록</th>
              <th className={`${TH} text-right`}>기록 없음</th>
              <th className={`${TH} text-right`}>기록률</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => (
              <tr key={row.skillId} className="transition-colors hover:bg-[var(--bg-secondary)]">
                <td className={`${TD} text-[var(--text-primary)]`}>{row.name}</td>
                <NumberCell value={row.loadedPairs} />
                <NumberCell value={row.appliedPairs} />
                <NumberCell value={row.notAppliedPairs} />
                <NumberCell value={row.unreportedPairs} emphasize={row.unreportedPairs > 0} />
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-secondary)]`}>
                  {formatRate(row.outcomeCoverageRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** 검색 포기와 명시 미적용 사유를 분리한다 */
function ReasonSection({ data }: { data: AxJourneyInsightsData }) {
  return (
    <section>
      <SectionTitle eyebrow="개선 백로그 입력" title="반복되는 사유" />
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        후보 미확인 사유는 검색 훅이 제안한 후보의 상세 지침을 불러오지 않기로 한 에이전트가
        명시적으로 남긴 설명만 보여줍니다. 상세 확인하지 않은 모든 후보의 이유를 추정하지 않습니다. 동일 문구만 묶은
        1차 보기이며 자유 입력 원문이라 관리자에게만 보입니다.
      </p>
      <div className="mt-5 grid gap-8 lg:grid-cols-2">
        <PhraseList title="후보를 상세 확인하지 않은 명시 사유" rows={data.searchSkipReasons} />
        <PhraseList title="상세 확인 후 적용하지 않은 이유" rows={data.notAppliedReasons} />
      </div>
    </section>
  )
}

/** 현재 데이터로 바로 확인할 수 있는 운영 항목 */
function AlertSection({
  topZero,
  topUnreported,
}: {
  topZero: AxJourneyInsightsData['zeroResultQueries'][number] | undefined
  topUnreported: AxSkillOutcomeRow | undefined
}) {
  const alerts = [
    {
      label: '검색결과 0건 검색어 Top',
      status: topZero ? '확인 필요' : '이상 없음',
      body: topZero
        ? `“${topZero.text}” · ${formatCount(topZero.count)}회`
        : '선택 기간에 결과가 0개였던 검색어가 없습니다.',
      ready: true,
    },
    {
      label: '전체 상세 로드 후 적용 판단 기록 없음',
      status: topUnreported ? '확인 필요' : '이상 없음',
      body: topUnreported
        ? `${topUnreported.name} · ${formatCount(topUnreported.unreportedPairs)}조합`
        : '선택 기간에 적용 여부 기록이 없는 조합이 없습니다.',
      ready: true,
    },
  ]

  return (
    <section>
      <SectionTitle eyebrow="정기 확인" title="지금 확인할 항목" />
      <div className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-[var(--border-subtle)] lg:grid-cols-2">
        {alerts.map((alert) => (
          <div key={alert.label} className="bg-[var(--bg-primary)] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--text-primary)]">{alert.label}</p>
              <StatusBadge ready={alert.ready}>{alert.status}</StatusBadge>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--text-secondary)]">{alert.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 화면의 숫자를 성공률이나 설치율로 오해하지 않도록 정의를 가까이에 둔다 */
function MeasurementDefinitions() {
  const rows = [
    {
      label: '결과가 기록된 검색',
      meaning: 'semantic_search/search_plugins가 성공하고 결과 배열까지 저장된 호출입니다. 자동 검색 훅과 직접 검색을 구분하지 않습니다.',
    },
    {
      label: '검색결과 0건 비율',
      meaning: '검색 결과 배열이 0개였던 비율입니다. 결과가 하나라도 있으면 관련성이 낮아도 빈 결과로 세지 않습니다.',
    },
    {
      label: '검색 후보 총 노출',
      meaning: '검색 결과에 후보가 등장한 횟수입니다. 같은 세션에서 같은 후보가 반복 추천되면 각각 셉니다. 반복 추천 빈도를 보는 보조 지표이며 전환율 분모는 아닙니다.',
    },
    {
      label: '고유 후보 상세 확인율',
      meaning: '검색 결과의 이름·요약을 본 에이전트가 같은 세션에서 get_plugin_content로 전체 스킬 지침을 불러온 비율입니다. 세션×스킬 중복을 제거하며 사용자의 화면 클릭률·설치율·실행률이 아닙니다.',
    },
    {
      label: '로드 후 적용 판단 기록률',
      meaning: '검색 후보에서 이어진 상세 확인 중 같은 세션에서 적용 또는 미적용을 기록한 비율입니다. 앞 단계와 동일한 세션×스킬만 연결합니다.',
    },
    {
      label: '적용 기록',
      meaning: '에이전트가 로드한 스킬을 작업에 적용했다고 보고한 값입니다. 정답 여부나 사용자 만족을 판정하지 않습니다.',
    },
    {
      label: '적용 여부 기록 없음',
      meaning: '로드 뒤 적용 또는 미적용 이벤트가 기록되지 않은 상태입니다. 실패나 미적용 판정이 아니라 성공 여부를 알 수 없는 데이터 공백입니다.',
    },
    {
      label: '실행 성공',
      meaning: 'report_skill_execution에서 status=success로 보고한 시도입니다. 검증 성공률은 그중 테스트·명령·산출물·사용자 확인 결과가 실제로 통과한 시도만 따로 셉니다.',
    },
    {
      label: '완료 보고 지연',
      meaning: 'report_skill_execution_started 이후 30분이 지났지만 같은 attemptId의 완료 이벤트가 없는 시도입니다. 실패로 단정하지 않고 보고 훅·에이전트 종료·장시간 작업을 확인할 대상으로 표시합니다.',
    },
  ]

  return (
    <details className="border-t border-[var(--border-subtle)] pt-5">
      <summary className="cursor-pointer list-none text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
        지표 기준 보기
      </summary>
      <dl className="mt-4 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[170px_1fr] sm:gap-5">
            <dt className="text-xs font-medium text-[var(--text-primary)]">{row.label}</dt>
            <dd className="text-xs leading-relaxed text-[var(--text-muted)]">{row.meaning}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}초`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}분`
  return `${Math.round((minutes / 60) * 10) / 10}시간`
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{eyebrow}</p>
      <h3 className="mt-1 text-base font-medium text-[var(--text-primary)]">{title}</h3>
    </div>
  )
}

function PhraseList({ title, rows }: { title: string; rows: AxJourneyInsightsData['searchSkipReasons'] }) {
  return (
    <div>
      <p className="text-sm text-[var(--text-primary)]">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">기록된 사유가 없습니다.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
          {rows.map((row, index) => (
            <li key={`${row.text}:${index}`} className="flex items-start justify-between gap-4 py-3">
              <span className="text-xs leading-relaxed text-[var(--text-secondary)]" title={row.text}>{row.text}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)]">{formatCount(row.count)}회</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusBadge({ ready, children }: { ready: boolean; children: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 font-mono text-[10px] ${
      ready
        ? 'border-[var(--brand-primary)]/30 text-[var(--brand-primary)]'
        : 'border-[var(--border-hover)] text-[var(--text-muted)]'
    }`}>
      {children}
    </span>
  )
}

function EmptyNote({ children }: { children: string }) {
  return (
    <p className="mt-4 border-l-2 border-[var(--border-hover)] pl-4 text-sm text-[var(--text-secondary)]">
      {children}
    </p>
  )
}

function NumberCell({ value, emphasize = false }: { value: number; emphasize?: boolean }) {
  return (
    <td className={`${TD} text-right font-mono tabular-nums ${
      emphasize ? 'text-[var(--brand-primary)]' : value === 0 ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
    }`}>
      {formatCount(value)}
    </td>
  )
}

function formatRate(value: number | null): string {
  if (value === null) return '—'
  return `${value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`
}
