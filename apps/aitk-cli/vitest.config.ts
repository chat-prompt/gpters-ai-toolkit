import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    // 사용 보고 테스트가 실제 홈의 계정 키 상태 파일을 쓰지 않게 한다
    env: { AITK_USAGE_ACCOUNT_STATE: join(tmpdir(), `aitk-test-account-keys-${process.pid}.json`) },
  },
})
