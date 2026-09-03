/**
 * AX Dashboard — KST 하루 경계와 일별 시리즈 공용 헬퍼
 *
 * 사람 단위 지표("어느 날 몇 명이 움직였나", "하루 중 언제 움직이나")를 UTC 경계로 자르면
 * KST 00~09시 활동이 전날 막대로 넘어가 화면의 날짜 라벨과 실제 근무일이 어긋난다.
 * 요약 패널과 장기 활동(잔디) 패널이 같은 경계를 쓰도록 여기서 한 번만 정의한다.
 */

/** KST(UTC+9) 오프셋 */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** KST 기준 하루의 시작(= KST 자정에 해당하는 UTC 시각)으로 내린다 */
export function startOfKstDay(date: Date): Date {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS)
  const floor = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  return new Date(floor - KST_OFFSET_MS)
}

/** KST 기준 날짜 키 (YYYY-MM-DD) */
export function kstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** count 계열 컬럼을 숫자로 (bigint가 문자열로 오는 드라이버 대비) */
export function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * 활동이 없는 날을 0으로 채워 연속된 일별 축을 만든다 (KST 날짜 기준)
 *
 * @param counts - KST 날짜 → 값
 * @param from - 구간 시작 (KST 자정에 해당하는 UTC 시각)
 * @param to - 구간 끝
 * @returns 구간 내 모든 KST 날짜가 채워진 [날짜, 값] 배열
 */
export function fillDailySeries(
  counts: Map<string, number>,
  from: Date,
  to: Date
): Array<{ date: string; value: number }> {
  const filled: Array<{ date: string; value: number }> = []

  for (let time = startOfKstDay(from).getTime(); time <= to.getTime(); time += 24 * 60 * 60 * 1000) {
    const key = kstDateKey(new Date(time))
    filled.push({ date: key, value: counts.get(key) ?? 0 })
  }

  return filled
}
