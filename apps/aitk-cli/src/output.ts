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
 * 에러 메시지를 stderr로 출력하고 프로세스 종료
 *
 * @param msg - 에러 메시지
 * @param exitCode - 종료 코드 (기본 1, 인증 에러 2)
 */
export function error(msg: string, exitCode = 1): never {
  process.stderr.write(`error: ${msg}\n`)
  process.exit(exitCode)
}
