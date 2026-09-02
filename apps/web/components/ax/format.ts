/**
 * AX 대시보드 — 화면 표시용 포매터
 *
 * 패널 컴포넌트들이 공통으로 쓰는 날짜·숫자·금액 표기.
 */

/** 값이 없을 때 표에 찍는 기호 */
const EMPTY = '—'

/**
 * 갱신 시각 표기 — 최근이면 상대시각, 오래됐으면 시:분
 *
 * @param iso - ISO 8601 시각 문자열
 * @returns "방금" / "12분 전" / "14:03" 중 하나. 파싱 불가면 빈 문자열
 */
export function formatUpdatedAt(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''

  const diffMinutes = Math.floor((Date.now() - time) / 60_000)
  if (diffMinutes < 1) return '방금'
  if (diffMinutes < 60) return `${diffMinutes}분 전`

  return new Date(time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

/**
 * 날짜 표기 (월/일)
 *
 * @param iso - ISO 8601 시각 문자열. null이면 빈 값 기호
 * @returns "8. 6." 형태의 짧은 날짜
 */
export function formatDate(iso: string | null): string {
  if (!iso) return EMPTY
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EMPTY
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

/**
 * 날짜+시각 표기
 *
 * @param iso - ISO 8601 시각 문자열. null이면 빈 값 기호
 * @returns "8. 6. 14:03" 형태
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return EMPTY
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EMPTY
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 통화별 금액 표기 — 환율 환산은 하지 않는다
 *
 * @param amount - 금액
 * @param currency - ISO 4217 통화 코드
 * @returns 통화 기호가 붙은 문자열. 알 수 없는 코드면 "1,000 XYZ" 형태로 폴백
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'KRW' || currency === 'JPY' ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount.toLocaleString('ko-KR')} ${currency}`
  }
}

/**
 * 통화별 합계를 한 줄 문자열로 (통화가 여러 개면 " · "로 잇는다)
 *
 * @param byCurrency - 통화 코드 → 금액
 * @returns "₩1,200,000 · US$340.00". 비어 있으면 빈 값 기호
 */
export function formatMoneyMap(byCurrency: Record<string, number>): string {
  const entries = Object.entries(byCurrency)
  if (entries.length === 0) return EMPTY
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(' · ')
}

/** 숫자 천 단위 구분 */
export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR')
}

/** 비율을 백분율로 믿고 읽을 수 있는 최소 분모. 그 미만은 분수와 참고 표시로 보여준다. */
export const RATE_MIN_SAMPLE = 10

/**
 * 분모 신뢰도를 함께 드러내는 비율 표기
 *
 * 분모가 없으면 0%로 꾸미지 않고 대시, 최소 표본 미만이면 백분율 대신 `n/d · 참고`,
 * 그 외에는 소수점 한 자리 백분율을 돌려준다.
 *
 * @param numerator - 분자
 * @param denominator - 분모
 * @param minSample - 백분율로 표시할 최소 분모 (기본 RATE_MIN_SAMPLE)
 * @returns 화면 표기 문자열
 */
export function formatSampledRate(
  numerator: number,
  denominator: number,
  minSample: number = RATE_MIN_SAMPLE
): string {
  if (denominator <= 0) return EMPTY
  if (denominator < minSample) {
    return `${formatCount(numerator)}/${formatCount(denominator)} · 참고`
  }
  const percentage = Math.round((numerator / denominator) * 1000) / 10
  return `${percentage.toLocaleString('ko-KR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

/**
 * 같은 차트 안의 최솟값~최댓값을 선명한 주황 농도 스케일로 바꾼다.
 * 배경색과 섞어 밝은·어두운 테마 모두에서 탁한 갈색으로 뭉개지지 않게 하고,
 * 제곱근 곡선으로 작은 값 사이의 차이도 사라지지 않게 한다.
 */
export function relativeActivityFill(value: number, min: number, max: number): string {
  if (value <= 0) return 'var(--border-subtle)'
  if (max <= min) return 'var(--accent-orange)'

  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)))
  const intensity = 30 + 70 * Math.sqrt(ratio)
  return `color-mix(in srgb, var(--accent-orange) ${intensity.toFixed(1)}%, var(--bg-tertiary))`
}

/**
 * 막대 차트 툴팁의 가로 기준점 — 가장자리 막대는 화면 밖으로 잘리지 않게 안쪽으로 붙인다.
 *
 * @param index - 막대 순서(0부터)
 * @param length - 전체 막대 수
 * @returns 왼쪽 끝은 `left-0`, 오른쪽 끝은 `right-0`, 가운데는 중앙 정렬 클래스
 */
export function tooltipAnchorClass(index: number, length: number): string {
  if (length <= 1) return 'left-0'
  if (index < length / 4) return 'left-0'
  if (index >= length * 3 / 4) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}
