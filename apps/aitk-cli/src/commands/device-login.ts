/**
 * device-login 명령어 - 브라우저 없는 환경에서 Device Flow 인증
 *
 * RFC 8628 기반. 다른 기기(폰/PC)에서 코드를 입력해 인증합니다.
 */

import { readConfig, writeConfig } from '../config.js'
import { info, error } from '../output.js'

/** Device code 응답 타입 */
interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

/** Token polling 응답 타입 */
interface TokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
  interval?: number
}

/**
 * Device Flow 로그인 실행
 *
 * 1. 서버에서 device code + user code 발급
 * 2. 사용자에게 URL과 코드 표시
 * 3. 주기적으로 서버에 polling하여 승인 대기
 * 4. 승인 시 토큰 저장
 */
export async function runDeviceLogin(): Promise<void> {
  const config = readConfig()
  const serverUrl = config.serverUrl

  // Step 1: Device code 요청
  info('🔐 Requesting device code...')

  let deviceResp: Response
  try {
    deviceResp = await fetch(`${serverUrl}/api/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  } catch (err) {
    error(`Failed to connect to ${serverUrl}. Check your network or serverUrl config.`)
  }

  if (!deviceResp!.ok) {
    const text = await deviceResp!.text().catch(() => '')
    error(`Server error (${deviceResp!.status}): ${text}`)
  }

  const data = await deviceResp!.json() as DeviceCodeResponse

  // Step 2: 사용자에게 안내
  info('')
  info('🔗 Open this URL on any device:')
  info(`   ${data.verification_uri}`)
  info('')
  info(`📝 Code: ${data.user_code}`)
  info('')
  info('⏳ Waiting for authorization...')

  // Step 3: Polling
  let interval = data.interval * 1000
  const deadline = Date.now() + data.expires_in * 1000

  while (Date.now() < deadline) {
    await sleep(interval)

    let pollResp: Response
    try {
      pollResp = await fetch(`${serverUrl}/api/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: data.device_code,
          client_id: 'aitk-cli',
        }),
      })
    } catch {
      // Network error — retry
      continue
    }

    const result = await pollResp.json().catch(() => ({})) as TokenResponse

    if (pollResp.ok && result.access_token) {
      // 성공: 토큰 저장
      config.token = result.access_token
      writeConfig(config)
      info('✅ Login successful! Token saved.')
      return
    }

    // Error 처리
    switch (result.error) {
      case 'authorization_pending':
        // 아직 승인 안 됨 — 계속 대기
        break

      case 'slow_down':
        // Polling 속도 줄이기
        if (result.interval) {
          interval = result.interval * 1000
        } else {
          interval += 5000
        }
        break

      case 'access_denied':
        error('❌ Authorization was denied.')
        break // error() calls process.exit

      case 'expired_token':
        error('⏰ Device code expired. Run "aitk login --device" again.')
        break

      default:
        error(`Login failed: ${result.error_description || result.error || 'Unknown error'}`)
    }
  }

  error('⏰ Timed out waiting for authorization. Run "aitk login --device" again.')
}

/**
 * Promise 기반 sleep
 *
 * @param ms - 대기 시간 (밀리초)
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
