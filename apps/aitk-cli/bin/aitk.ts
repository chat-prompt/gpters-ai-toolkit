#!/usr/bin/env node

/**
 * aitk CLI 진입점 - GPTers AI Toolkit MCP fallback CLI
 */

import { runSearch } from '../src/commands/search.js'
import { runGet } from '../src/commands/get.js'
import { runDeploy } from '../src/commands/deploy.js'
import { runUpdates } from '../src/commands/updates.js'
import { runReportSession } from '../src/commands/report-session.js'
import { runReportSkip } from '../src/commands/report-skip.js'
import { runReportOutcome } from '../src/commands/report-outcome.js'
import { runLogin } from '../src/commands/login.js'
import { error, info } from '../src/output.js'

/** 버전 (빌드 시 치환) */
const VERSION = '0.1.0'

/**
 * 명명된 인자 파싱 (--key value 또는 --key=value)
 *
 * @param args - process.argv 슬라이스
 * @returns 파싱된 키-값 맵과 위치 인자 배열
 */
function parseArgs(args: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=')
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1)
      } else {
        const next = args[i + 1]
        if (next && !next.startsWith('--')) {
          flags[arg.slice(2)] = next
          i++
        } else {
          flags[arg.slice(2)] = 'true'
        }
      }
    } else {
      positional.push(arg)
    }
  }

  return { flags, positional }
}

const HELP = `aitk - GPTers AI Toolkit CLI

Usage:
  aitk search <query> [--type skill] [--limit 5] [--context "작업 맥락"]
  aitk get <id>
  aitk deploy --id <slug> --type skill --name <name> --content <@file|text>
  aitk updates
  aitk report-session --count <N> [--version <ver>]
  aitk report-skip --query <query> --reason <reason> [--result-ids id1,id2]
  aitk report-outcome --skill-id <id> --applied true|false --summary <text>
  aitk login --token <token>
  aitk --version | --help

Commands:
  search          팀 스킬/에이전트/커맨드 검색
  get             플러그인 상세 조회
  deploy          스킬/에이전트/커맨드 배포
  updates         설치된 스킬 업데이트 확인
  report-session  세션 이벤트 보고 (hook용)
  report-skip     스킬 검색 스킵 사유 보고
  report-outcome  스킬 적용 결과 보고
  login           인증 토큰 저장

Output:
  stdout: JSON (AI 파싱용)
  stderr: 진행 상태/에러 (사람용)
  exit 0: 성공, 1: 에러, 2: 인증 필요`

/**
 * CLI 메인 실행 함수
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    info(HELP)
    process.exit(0)
  }

  if (args[0] === '--version' || args[0] === '-v') {
    info(`aitk v${VERSION}`)
    process.exit(0)
  }

  const command = args[0]
  const { flags, positional } = parseArgs(args.slice(1))

  switch (command) {
    case 'search': {
      const query = positional[0] ?? flags['query']
      if (!query) error('검색어를 지정하세요: aitk search <query>')
      await runSearch({
        query,
        type: flags['type'],
        limit: flags['limit'] ? parseInt(flags['limit'], 10) : undefined,
        context: flags['context'],
      })
      break
    }

    case 'get': {
      const id = positional[0] ?? flags['id']
      if (!id) error('플러그인 ID를 지정하세요: aitk get <id>')
      await runGet(id)
      break
    }

    case 'deploy': {
      if (!flags['id']) error('--id 필수: aitk deploy --id <slug> --type skill --name <name> --content <text|@file>')
      if (!flags['type']) error('--type 필수')
      if (!flags['name']) error('--name 필수')
      if (!flags['content']) error('--content 필수')
      await runDeploy({
        id: flags['id'],
        type: flags['type'],
        name: flags['name'],
        content: flags['content'],
        description: flags['description'],
        tags: flags['tags'],
      })
      break
    }

    case 'updates': {
      await runUpdates()
      break
    }

    case 'report-session': {
      const count = parseInt(flags['count'] ?? '0', 10)
      if (!count) error('--count 필수: aitk report-session --count <N>')
      await runReportSession({
        count,
        version: flags['version'],
      })
      break
    }

    case 'report-skip': {
      const query = flags['query']
      const reason = flags['reason']
      if (!query) error('--query 필수: aitk report-skip --query <query> --reason <reason>')
      if (!reason) error('--reason 필수: aitk report-skip --query <query> --reason <reason>')
      await runReportSkip({
        query,
        resultIds: flags['result-ids'],
        reason,
      })
      break
    }

    case 'report-outcome': {
      const skillId = flags['skill-id']
      const summary = flags['summary']
      if (!skillId) error('--skill-id 필수: aitk report-outcome --skill-id <id> --applied true|false --summary <text>')
      if (!summary) error('--summary 필수')
      await runReportOutcome({
        skillId,
        applied: flags['applied'] === 'true',
        summary,
      })
      break
    }

    case 'login': {
      await runLogin(flags['token'])
      break
    }

    default:
      error(`알 수 없는 명령어: ${command}\n${HELP}`)
  }
}

main().catch((err) => {
  error(err instanceof Error ? err.message : String(err))
})
