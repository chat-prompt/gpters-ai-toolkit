/**
 * add-files 명령어 - 플러그인에 파일 추가/업데이트
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/** add-files 명령어 옵션 */
export interface AddFilesOptions {
  /** 플러그인 ID */
  id: string
  /** 파일 경로 목록 (로컬 파일) */
  files: string[]
  /** 파일 타입 (script, reference, template, config) */
  type?: string
}

/**
 * add-files 명령어 실행
 *
 * @param opts - 파일 추가 옵션
 */
export async function runAddFiles(opts: AddFilesOptions): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const files = opts.files.map((filePath) => {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const file: Record<string, string> = { name: basename(filePath), content }
      if (opts.type) file.type = opts.type
      return file
    } catch {
      error(`Cannot read file: ${filePath}`)
    }
  })

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'add_files', arguments: { id: opts.id, files } },
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
