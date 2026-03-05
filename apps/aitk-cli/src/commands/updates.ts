/**
 * updates 명령어 - 설치된 스킬 업데이트 확인
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, info, error } from '../output.js'

/**
 * 로컬에 설치된 스킬 목록 탐색
 *
 * @returns 설치된 스킬 ID와 버전 배열
 */
function detectInstallations(): { id: string; version: string }[] {
  const installations: { id: string; version: string }[] = []

  // .claude/skills/ 디렉토리에서 스킬 탐색
  const skillsDir = join(homedir(), '.claude', 'skills')
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const metaPath = join(skillsDir, entry.name, 'metadata.json')
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        if (meta.id && meta.version) {
          installations.push({ id: meta.id, version: meta.version })
        }
      } catch {
        // metadata.json이 없거나 파싱 실패 — 무시
      }
    }
  } catch {
    // .claude/skills/ 디렉토리가 없음 — 정상
  }

  return installations
}

/**
 * updates 명령어 실행
 */
export async function runUpdates(): Promise<void> {
  const token = resolveToken()
  const installations = detectInstallations()

  if (installations.length === 0) {
    info('No installed skills found.')
    jsonOut({ updates: [], message: 'No installed skills to check.' })
    return
  }

  info(`Checking updates for ${installations.length} installed skill(s)...`)

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'check_updates', arguments: { installations } },
    token
  )

  if (!result.ok) {
    if (result.status === 401) error(result.error!, 2)
    error(result.error!)
  }

  const content = (result.data as { content?: { text: string }[] })?.content
  if (content?.[0]?.text) {
    jsonOut(JSON.parse(content[0].text))
  } else {
    jsonOut(result.data)
  }
}
