/**
 * 대용량 JSONL 트랜스크립트 스캐너
 *
 * ~/.claude/projects는 GB 단위로 자란다. 전부 파싱하면 명령 하나가 분 단위로 늘어지므로
 * 두 단계로 거른다 — 파일 mtime으로 파일째 건너뛰고, 남은 줄도 문자열 포함 검사로
 * 먼저 걸러 JSON.parse 횟수를 줄인다. 파일 전체를 메모리에 올리지 않고 줄 단위로 읽는다.
 */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

/**
 * 집계 구간 안의 줄을 가질 수 있는 .jsonl 파일만 골라낸다
 *
 * 마지막 수정이 구간 시작보다 이른 파일은 구간 안의 줄을 가질 수 없으므로 열지 않는다.
 *
 * @param root - 탐색 시작 디렉터리
 * @param modifiedAfter - 이 시각 이전에 마지막 수정된 파일은 제외
 * @param matchFileName - 파일명 필터. 기본은 모든 .jsonl 허용
 * @returns 절대 경로 목록. 디렉터리가 없으면 빈 배열
 */
export async function findJsonlFiles(
  root: string,
  modifiedAfter: Date,
  matchFileName: (fileName: string) => boolean = () => true
): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(root, { recursive: true })
  } catch {
    // 그 도구를 안 쓰는 머신이면 디렉터리가 아예 없다 — 오류가 아니다
    return []
  }

  const cutoff = modifiedAfter.getTime()
  const files: string[] = []

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const fileName = entry.slice(entry.lastIndexOf('/') + 1)
    if (!matchFileName(fileName)) continue

    const path = join(root, entry)
    try {
      const info = await stat(path)
      if (info.isFile() && info.mtimeMs >= cutoff) files.push(path)
    } catch {
      // 스캔 도중 지워진 파일
    }
  }

  return files
}

/**
 * JSONL 파일을 줄 단위로 훑는다
 *
 * @param filePath - 읽을 파일
 * @param hint - 이 검사를 통과한 줄만 파싱한다 (JSON.parse 회피용 사전 필터)
 * @param onEntry - 파싱된 줄마다 호출
 */
export async function scanJsonl(
  filePath: string,
  hint: (line: string) => boolean,
  onEntry: (entry: Record<string, unknown>) => void
): Promise<void> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' })
  const lines = createInterface({ input: stream, crlfDelay: Infinity })

  try {
    for await (const line of lines) {
      if (!hint(line)) continue
      try {
        const parsed = JSON.parse(line) as unknown
        if (parsed && typeof parsed === 'object') onEntry(parsed as Record<string, unknown>)
      } catch {
        // 세션이 살아 있는 동안 마지막 줄이 미완성일 수 있다
      }
    }
  } finally {
    lines.close()
    stream.destroy()
  }
}

/**
 * 토큰 수 필드를 0 이상의 정수로 정규화한다
 *
 * 수신 계약이 정수만 받으므로 값이 없거나 이상하면 0으로 떨어뜨린다.
 *
 * @param value - 트랜스크립트에서 읽은 원시 값
 * @returns 0 이상의 정수
 */
export function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}
