/**
 * GPTers Analytics Worker로 이벤트를 전달하는 유틸리티
 *
 * @remarks
 * fire-and-forget 패턴으로 동작하며, 실패 시에도 기존 로직에 영향을 주지 않습니다.
 * GPTERS_ANALYTICS_URL 환경변수가 없으면 조용히 skip합니다.
 *
 * @packageDocumentation
 */

/**
 * gpters-analytics Worker로 이벤트를 전달합니다
 *
 * @remarks
 * - GPTERS_ANALYTICS_URL 환경변수가 없으면 조용히 skip
 * - fetch 실패 시 console.warn만 출력 (에러 throw 안 함)
 * - fire-and-forget: 응답을 기다리지 않음
 *
 * @param event - 이벤트 이름 (예: "toolkit_mcp_request")
 * @param properties - 이벤트 속성 (distinct_id 필수)
 */
export function forwardToAnalytics(
  event: string,
  properties: Record<string, unknown>
): void {
  const url = process.env.GPTERS_ANALYTICS_URL
  if (!url) return

  // fire-and-forget: Promise를 await하지 않음
  fetch(`${url}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      properties: {
        ...properties,
        source: 'toolkit',
      },
    }),
  }).catch((err) => {
    console.warn('[gpters-analytics] forward failed:', err)
  })
}
