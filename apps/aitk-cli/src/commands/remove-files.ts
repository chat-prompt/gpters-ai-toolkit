/**
 * remove-files 명령어 - 플러그인에서 파일 삭제
 */

import { jsonRpcCall } from '../client.js'
import { resolveToken } from '../auth.js'
import { jsonOut, error } from '../output.js'

/** remove-files 명령어 옵션 */
export interface RemoveFilesOptions {
  /** 플러그인 ID */
  id: string
  /** 삭제할 파일 이름 목록 */
  fileNames: string[]
}

/**
 * remove-files 명령어 실행
 *
 * @param opts - 파일 삭제 옵션
 */
export async function runRemoveFiles(opts: RemoveFilesOptions): Promise<void> {
  const token = resolveToken()
  if (!token) error('Auth required. Run "aitk login" first.', 2)

  const result = await jsonRpcCall(
    'tools/call',
    { name: 'remove_files', arguments: { id: opts.id, fileNames: opts.fileNames } },
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
