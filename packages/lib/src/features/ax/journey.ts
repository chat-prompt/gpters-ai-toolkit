/** 탐색·로드·실행을 연결하는 개인정보 비포함 식별자 계약 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type JourneyIdValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

/**
 * journeyId는 인증정보가 아닌 UUID다. 없으면 기존 클라이언트 호출로 보고 null을 허용한다.
 */
export function validateOptionalJourneyId(value: unknown): JourneyIdValidation {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  if (typeof value !== 'string' || !UUID.test(value)) {
    return { ok: false, error: 'journeyId must be a UUID when provided' }
  }
  return { ok: true, value: value.toLowerCase() }
}
