/**
 * 출력 유틸리티 - stdout=JSON(AI용), stderr=사람용 메시지
 */

/**
 * JSON 데이터를 stdout으로 출력 (AI 파싱용)
 *
 * @param data - JSON으로 직렬화할 데이터
 */
export function jsonOut(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

/**
 * 정보 메시지를 stderr로 출력 (사람용)
 *
 * @param msg - 표시할 메시지
 */
export function info(msg: string): void {
  process.stderr.write(msg + '\n')
}

/**
 * API 응답에서 배열 데이터를 추출
 *
 * 지원 구조: 배열, { data: [...] }, { data: { plugins: [...] } }, { success, data: { plugins: [...] } }
 *
 * @param data - API 응답 데이터
 * @returns 추출된 배열
 */
export function extractArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (obj.data && typeof obj.data === 'object') {
      const inner = obj.data as Record<string, unknown>
      if (Array.isArray(inner)) return inner
      if (Array.isArray(inner.plugins)) return inner.plugins
    }
  }
  return []
}

/**
 * API 응답에서 단일 객체 데이터를 추출
 *
 * 지원 구조: 객체, { data: {...} }, { success, data: {...} }
 *
 * @param data - API 응답 데이터
 * @returns 추출된 객체
 */
export function extractObject(data: unknown): unknown {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if ('success' in obj && 'data' in obj) return obj.data
    if ('data' in obj) return obj.data
  }
  return data
}

/**
 * 에러 메시지를 stderr로 출력하고 프로세스 종료
 *
 * @param msg - 에러 메시지
 * @param exitCode - 종료 코드 (기본 1, 인증 에러 2)
 */
export function error(msg: string, exitCode = 1): never {
  process.stderr.write(`error: ${msg}\n`)
  process.exit(exitCode)
}
