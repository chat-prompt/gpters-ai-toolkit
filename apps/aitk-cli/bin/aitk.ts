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
import { runConfig } from '../src/commands/config.js'
import { error, info } from '../src/output.js'

/** 버전 */
const VERSION = '0.2.2'

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
  aitk search <query> [--type skill] [--limit 5] [--context "context"]
  aitk get <id>
  aitk deploy --id <slug> --type skill --name <name> --content <@file|text>
  aitk updates
  aitk config [list|get|set] [key] [value]
  aitk report-session --count <N> [--version <ver>]
  aitk report-skip --query <query> --reason <reason> [--result-ids id1,id2]
  aitk report-outcome --skill-id <id> --applied true|false --summary <text>
  aitk login --token <token>
  aitk --version | --help

Commands:
  search          Search team skills, agents, and commands
  get             Get plugin details by ID
  deploy          Deploy a skill, agent, or command
  updates         Check for installed skill updates
  config          View or change settings (searchMethod, serverUrl)
  report-session  Report session event (for hooks)
  report-skip     Report skill search skip reason
  report-outcome  Report skill application outcome
  login           Save auth token

Output:
  stdout: JSON (for AI parsing)
  stderr: Status/errors (for humans)
  exit 0: success, 1: error, 2: auth required`

/** Subcommand help texts */
const SUBCOMMAND_HELP: Record<string, string> = {
  search: `aitk search - Search team skills, agents, and commands

Usage: aitk search <query> [options]

Arguments:
  query              Search query (keywords)

Options:
  --type <type>      Filter by item type (skill, agent, command, guide)
  --limit <n>        Max results to return (default: 5)
  --context <text>   Task context for better relevance

Examples:
  aitk search "code review"
  aitk search "database" --type skill --limit 3
  aitk search "slack bot" --context "airtable integration"`,

  get: `aitk get - Get plugin details by ID

Usage: aitk get <id>

Arguments:
  id                 Plugin ID to retrieve

Examples:
  aitk get code-reviewer
  aitk get data-source-reference`,

  deploy: `aitk deploy - Deploy a skill, agent, or command

Usage: aitk deploy --id <slug> --type <type> --name <name> --content <content> [options]

Required:
  --id <slug>        Unique English slug ID
  --type <type>      Item type (skill, agent, command)
  --name <name>      Display name
  --content <text>   Content text or @filepath to read from file

Options:
  --description <d>  Item description
  --tags <t1,t2>     Comma-separated tags

Examples:
  aitk deploy --id my-skill --type skill --name "My Skill" --content @skill.md
  aitk deploy --id helper --type agent --name Helper --content "..." --tags "util,dev"`,

  updates: `aitk updates - Check for installed skill updates

Usage: aitk updates`,

  config: `aitk config - View or change settings

Usage: aitk config [subcommand] [key] [value]

Subcommands:
  list               Show all settings (default)
  get <key>          Get a specific setting
  set <key> <value>  Change a setting

Available keys:
  searchMethod       Skill search method: auto | mcp | cli (default: auto)
  serverUrl          API server URL

Examples:
  aitk config
  aitk config get searchMethod
  aitk config set searchMethod cli`,

  'report-session': `aitk report-session - Report session event (for hooks)

Usage: aitk report-session --count <N> [--version <ver>]

Required:
  --count <N>        Prompt count for the session

Options:
  --version <ver>    Plugin version`,

  'report-skip': `aitk report-skip - Report skill search skip reason

Usage: aitk report-skip --query <query> --reason <reason> [--result-ids id1,id2]

Required:
  --query <query>    Search query that was skipped
  --reason <reason>  Reason for skipping

Options:
  --result-ids <ids> Comma-separated result IDs`,

  'report-outcome': `aitk report-outcome - Report skill application outcome

Usage: aitk report-outcome --skill-id <id> --applied true|false --summary <text>

Required:
  --skill-id <id>    Skill ID that was loaded
  --applied <bool>   Whether the skill was actually applied (true/false)
  --summary <text>   One-line outcome summary`,

  login: `aitk login - Authenticate with AI Toolkit

Usage: aitk login [--token <token>]

Options:
  --token <token>    Manually save a token (skips browser flow)

Without --token, opens browser for Google OAuth login.`,
}

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

  // Subcommand --help
  if (flags['help'] === 'true' || flags['h'] === 'true') {
    const helpText = SUBCOMMAND_HELP[command]
    if (helpText) {
      info(helpText)
      process.exit(0)
    }
  }

  switch (command) {
    case 'search': {
      const query = positional[0] ?? flags['query']
      if (!query) error('Query required: aitk search <query>')
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
      if (!id) error('Plugin ID required: aitk get <id>')
      await runGet(id)
      break
    }

    case 'deploy': {
      if (!flags['id']) error('--id required: aitk deploy --id <slug> --type skill --name <name> --content <text|@file>')
      if (!flags['type']) error('--type required')
      if (!flags['name']) error('--name required')
      if (!flags['content']) error('--content required')
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
      if (!count) error('--count required: aitk report-session --count <N>')
      await runReportSession({
        count,
        version: flags['version'],
      })
      break
    }

    case 'report-skip': {
      const query = flags['query']
      const reason = flags['reason']
      if (!query) error('--query required: aitk report-skip --query <query> --reason <reason>')
      if (!reason) error('--reason required: aitk report-skip --query <query> --reason <reason>')
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
      if (!skillId) error('--skill-id required: aitk report-outcome --skill-id <id> --applied true|false --summary <text>')
      if (!summary) error('--summary required')
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

    case 'config': {
      const sub = positional[0]
      const configArgs = positional.slice(1)
      runConfig(sub, configArgs)
      break
    }

    default:
      error(`Unknown command: ${command}\n${HELP}`)
  }
}

main().catch((err) => {
  error(err instanceof Error ? err.message : String(err))
})
