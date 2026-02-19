#!/usr/bin/env node

/**
 * Codex 플러그인 CLI 진입점
 *
 * 사용법: npx @gpters-internal/codex-plugin setup [--project|--user] [--force]
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSetup, printSummary } from '../src/setup.js'
import type { Scope } from '../src/paths.js'

const args = process.argv.slice(2)

const command = args[0]

if (!command || command === 'setup') {
  const scope: Scope | undefined = args.includes('--project')
    ? 'project'
    : args.includes('--user')
      ? 'user'
      : undefined

  const force = args.includes('--force')

  const binDir = fileURLToPath(new URL('.', import.meta.url))
  const packageRoot = join(binDir, '..')
  const skillsSourceDir = join(packageRoot, 'skills')
  const templatesDir = join(packageRoot, 'templates')

  const result = await runSetup({
    scope,
    force,
    skillsSourceDir,
    templatesDir,
  })

  printSummary(result)
} else if (command === '--help' || command === '-h') {
  console.log(`
GPTers Codex Plugin

사용법:
  npx @gpters-internal/codex-plugin setup [옵션]

옵션:
  --project    프로젝트 레벨 설치 (.agents/skills/gpters/)
  --user       사용자 전역 설치 (~/.agents/skills/gpters/)
  --force      기존 파일 덮어쓰기
  -h, --help   도움말 표시

설치 내용:
  1. 스킬 파일 (.agents/skills/gpters/)
     - skill-suggest: 팀 스킬 자동 검색
     - commit: 상세 커밋 메시지 생성
     - prd-review: PRD 심층 인터뷰 및 스펙 작성
  2. MCP 서버 설정 (~/.codex/config.toml)
  3. AGENTS.md 템플릿 (선택)
`)
} else {
  console.error(`알 수 없는 명령어: ${command}`)
  console.error('사용법: npx @gpters-internal/codex-plugin setup [--project|--user] [--force]')
  process.exit(1)
}
