/**
 * Codex 플러그인 Vitest 설정
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
})
