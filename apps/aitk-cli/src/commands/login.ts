/**
 * login 명령어 - 브라우저 기반 인증 또는 수동 토큰 저장
 */

import { createServer } from 'node:http'
import { readConfig, writeConfig } from '../config.js'
import { info, error } from '../output.js'

/**
 * 사용 가능한 랜덤 포트에서 localhost 서버를 시작하고 토큰 수신 대기
 *
 * @param serverUrl - AI Toolkit 서버 URL
 * @returns 수신한 토큰
 */
function waitForToken(serverUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('로그인 타임아웃 (2분). 다시 시도하세요.'))
    }, 120_000)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`)
      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token')
        if (token) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body><h2>aitk 로그인 완료!</h2><p>이 창을 닫아도 됩니다.</p></body></html>')
          clearTimeout(timeout)
          server.close()
          resolve(token)
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('토큰이 없습니다.')
        }
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        clearTimeout(timeout)
        reject(new Error('서버 시작 실패'))
        return
      }

      const port = addr.port
      const loginUrl = `${serverUrl}/api/cli-token?port=${port}`

      info(`브라우저에서 로그인하세요: ${loginUrl}`)
      info('대기 중...')

      // 브라우저 열기 (macOS/Linux)
      const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
      import('node:child_process').then(({ exec }) => {
        exec(`${openCmd} "${loginUrl}"`)
      })
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/**
 * login 명령어 실행
 *
 * --token 있으면 수동 저장, 없으면 브라우저 인증 플로우 시작
 *
 * @param token - 수동 입력 토큰 (없으면 브라우저 인증)
 */
export async function runLogin(token?: string): Promise<void> {
  const config = readConfig()

  if (token) {
    // 수동 토큰 저장
    config.token = token
    writeConfig(config)
    info(`토큰 저장 완료: ${config.serverUrl}`)
    return
  }

  // 브라우저 기반 로그인
  try {
    const receivedToken = await waitForToken(config.serverUrl)
    config.token = receivedToken
    writeConfig(config)
    info(`로그인 성공! 토큰 저장 완료: ${config.serverUrl}`)
  } catch (err) {
    error(err instanceof Error ? err.message : '로그인 실패')
  }
}
