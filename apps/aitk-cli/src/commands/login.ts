/**
 * login 명령어 - 브라우저 기반 인증 또는 수동 토큰 저장
 */

import { createServer } from 'node:http'
import { readConfig, writeConfig } from '../config.js'
import { info, error } from '../output.js'

/**
 * 로그인 결과 HTML 페이지 생성
 *
 * @param success - 성공 여부
 * @param message - 표시할 메시지
 * @returns HTML 문자열
 */
function renderPage(success: boolean, message: string): string {
  const icon = success
    ? '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
  const title = success ? 'aitk Login Complete' : 'Login Failed'
  const color = success ? '#00d4ff' : '#ff6b6b'

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0f;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e0e0e0;
      overflow: hidden;
    }
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.15;
      animation: float 8s ease-in-out infinite;
    }
    .orb-1 { width: 300px; height: 300px; background: #00d4ff; top: -10%; left: -5%; }
    .orb-2 { width: 300px; height: 300px; background: #a855f7; bottom: -10%; right: -5%; animation-delay: -3s; }
    .orb-3 { width: 250px; height: 250px; background: #22c55e; bottom: 10%; left: 30%; animation-delay: -5s; }
    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-20px) scale(1.05); }
    }
    .card {
      position: relative;
      z-index: 1;
      max-width: 400px;
      width: 90%;
      padding: 2.5rem;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(20px);
      text-align: center;
      animation: fadeUp 0.5s ease-out;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 80px; height: 80px;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      margin-bottom: 1.5rem;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      background: linear-gradient(135deg, ${color}, ${success ? '#a855f7' : '#ff9a6b'});
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.75rem;
    }
    p {
      font-size: 0.875rem;
      color: #888;
      line-height: 1.6;
    }
    .hint {
      margin-top: 1.5rem;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 0.75rem;
      color: #00d4ff;
    }
    .close-hint {
      margin-top: 1.25rem;
      font-size: 0.75rem;
      color: #555;
    }
  </style>
</head>
<body>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div style="height: 0.5rem"></div>
    ${success ? '<div class="hint">aitk search "keyword"</div>' : ''}
    <p class="close-hint">You can close this window</p>
  </div>
</body>
</html>`
}

/**
 * 사용 가능한 랜덤 포트에서 localhost 서버를 시작하고 토큰 수신 대기
 *
 * @param serverUrl - AI Toolkit 서버 URL
 * @returns 수신한 토큰
 */
/** 로그인 콜백 결과 */
interface LoginResult {
  /** 발급된 토큰 */
  token: string
  /** 로그인한 사용자 이메일 */
  email?: string
}

function waitForToken(serverUrl: string): Promise<LoginResult> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Login timeout (2 min). Please try again.'))
    }, 120_000)

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`)
      if (url.pathname === '/callback') {
        const token = url.searchParams.get('token')
        const email = url.searchParams.get('email')
        if (token) {
          const emailMsg = email ? `<br>Logged in as <strong>${email}</strong>` : ''
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderPage(true, `Token saved.${emailMsg}<br>You can now use aitk in your terminal.`))
          clearTimeout(timeout)
          server.close()
          resolve({ token, email: email ?? undefined })
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderPage(false, 'Token not received. Please try again.'))
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
        reject(new Error('Failed to start server'))
        return
      }

      const port = addr.port
      const loginUrl = `${serverUrl}/api/cli-token?port=${port}`

      info(`Open browser to login: ${loginUrl}`)
      info('Waiting...')

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
    info(`Token saved: ${config.serverUrl}`)
    return
  }

  // 브라우저 기반 로그인
  try {
    const result = await waitForToken(config.serverUrl)
    config.token = result.token
    writeConfig(config)
    const emailSuffix = result.email ? ` (${result.email})` : ''
    info(`Login successful!${emailSuffix} Token saved: ${config.serverUrl}`)
  } catch (err) {
    error(err instanceof Error ? err.message : 'Login failed')
  }
}
