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
import { runWhoami } from '../src/commands/whoami.js'
import { runUndeploy } from '../src/commands/undeploy.js'
import { runSuggest } from '../src/commands/suggest.js'
import { runSuggestions } from '../src/commands/suggestions.js'
import { runResolve } from '../src/commands/resolve.js'
import { runAddFiles } from '../src/commands/add-files.js'
import { runRemoveFiles } from '../src/commands/remove-files.js'
import { runUpgrade } from '../src/commands/upgrade.js'
import { error, info } from '../src/output.js'

/** 버전 */
const VERSION = '0.3.11'

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
  aitk deploy --id <slug> --type skill --name <name> --content <@file|text> [--platforms claude_code,codex]
  aitk upgrade
  aitk updates
  aitk config [list|get|set] [key] [value]
  aitk report-session --count <N> [--version <ver>]
  aitk report-skip --query <query> --reason <reason> [--result-ids id1,id2]
  aitk report-outcome --skill-id <id> --applied true|false --summary <text>
  aitk undeploy <id>
  aitk suggest --plugin-id <id> --title <title> --description <desc> [--diff <diff>]
  aitk suggestions [--plugin-id <id>] [--status pending|accepted|rejected] [--limit N]
  aitk resolve --suggestion-id <id> --action accept|reject [--comment <text>]
  aitk add-files --id <id> <file1> [file2...] [--type script|reference|template|config]
  aitk remove-files --id <id> --files <name1,name2>
  aitk login --token <token>
  aitk whoami
  aitk --version | --help

Commands:
  search          Search team skills, agents, and commands
  get             Get plugin details by ID
  upgrade         Upgrade all GPTers plugins (Claude Code, OpenCode, Codex)
  deploy          Deploy a skill, agent, or command
  undeploy        Remove a deployed skill (owner only)
  updates         Check for installed skill updates
  config          View or change settings (searchMethod, serverUrl)
  suggest         Suggest improvement for another's plugin
  suggestions     List improvement suggestions
  resolve         Accept or reject a suggestion
  add-files       Add files to a plugin
  remove-files    Remove files from a plugin
  report-session  Report session event (for hooks)
  report-skip     Report skill search skip reason
  report-outcome  Report skill application outcome
  login           Save auth token
  whoami          Show current authenticated user

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
  --description <d>       Item description
  --tags <t1,t2>          Comma-separated tags
  --platforms <p1,p2>     Comma-separated platforms (claude_code,opencode,codex,cursor)

Examples:
  aitk deploy --id my-skill --type skill --name "My Skill" --content @skill.md
  aitk deploy --id helper --type agent --name Helper --content "..." --tags "util,dev"
  aitk deploy --id codex-tool --type skill --name "Codex Tool" --content @skill.md --platforms codex`,

  upgrade: `aitk upgrade - Upgrade all GPTers plugins

Usage: aitk upgrade

Checks versions and updates all GPTers plugins at once:
  - Claude Code: marketplace plugin update
  - OpenCode: migrate @gpters-internal/opencode → @gpters/opencode
  - Codex: migrate @gpters-internal/codex → @gpters/codex-plugin

Also migrates from old @gpters-internal/* private packages to public @gpters/* packages.`,

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

  whoami: `aitk whoami - Show current authenticated user

Usage: aitk whoami

Displays the email, name, and organization of the currently authenticated user.`,

  undeploy: `aitk undeploy - Remove a deployed skill (owner only)

Usage: aitk undeploy <id>

Arguments:
  id                 Plugin ID to remove

Examples:
  aitk undeploy my-old-skill`,

  suggest: `aitk suggest - Suggest improvement for another's plugin

Usage: aitk suggest --plugin-id <id> --title <title> --description <desc> [options]

Required:
  --plugin-id <id>   Target plugin ID
  --title <title>    Suggestion title
  --description <d>  Detailed description

Options:
  --diff <text>      Code/content diff

Examples:
  aitk suggest --plugin-id code-reviewer --title "Add security check" --description "Add OWASP top 10 checks"`,

  suggestions: `aitk suggestions - List improvement suggestions

Usage: aitk suggestions [options]

Options:
  --plugin-id <id>   Filter by plugin ID
  --status <s>       Filter: pending, accepted, rejected, all (default: all)
  --limit <n>        Max results (default: 20)

Examples:
  aitk suggestions
  aitk suggestions --plugin-id my-skill --status pending`,

  resolve: `aitk resolve - Accept or reject a suggestion

Usage: aitk resolve --suggestion-id <id> --action accept|reject [options]

Required:
  --suggestion-id <id>  Suggestion ID (from "aitk suggestions")
  --action <action>     accept or reject

Options:
  --comment <text>      Response comment

Examples:
  aitk resolve --suggestion-id abc123 --action accept --comment "Great idea!"
  aitk resolve --suggestion-id abc123 --action reject --comment "Doesn't fit current design"`,

  'add-files': `aitk add-files - Add files to a plugin

Usage: aitk add-files --id <id> <file1> [file2...] [options]

Required:
  --id <id>            Plugin ID
  <files>              One or more local file paths

Options:
  --type <type>        File type: script, reference, template, config

Examples:
  aitk add-files --id my-skill scripts/run.mjs references/guide.md
  aitk add-files --id my-skill config.json --type config`,

  'remove-files': `aitk remove-files - Remove files from a plugin

Usage: aitk remove-files --id <id> --files <name1,name2>

Required:
  --id <id>            Plugin ID
  --files <names>      Comma-separated file names to remove

Examples:
  aitk remove-files --id my-skill --files "scripts/old.mjs,references/deprecated.md"`,
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
        platforms: flags['platforms'],
      })
      break
    }

    case 'upgrade': {
      runUpgrade()
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

    case 'whoami': {
      await runWhoami()
      break
    }

    case 'undeploy': {
      const id = positional[0] ?? flags['id']
      if (!id) error('Plugin ID required: aitk undeploy <id>')
      await runUndeploy(id)
      break
    }

    case 'suggest': {
      const pluginId = flags['plugin-id']
      const title = flags['title']
      const description = flags['description']
      if (!pluginId) error('--plugin-id required: aitk suggest --plugin-id <id> --title <title> --description <desc>')
      if (!title) error('--title required')
      if (!description) error('--description required')
      await runSuggest({ pluginId, title, description, diff: flags['diff'] })
      break
    }

    case 'suggestions': {
      await runSuggestions({
        pluginId: flags['plugin-id'],
        status: flags['status'],
        limit: flags['limit'] ? parseInt(flags['limit'], 10) : undefined,
      })
      break
    }

    case 'resolve': {
      const suggestionId = flags['suggestion-id']
      const action = flags['action']
      if (!suggestionId) error('--suggestion-id required: aitk resolve --suggestion-id <id> --action accept|reject')
      if (!action) error('--action required (accept or reject)')
      await runResolve({ suggestionId, action, comment: flags['comment'] })
      break
    }

    case 'add-files': {
      const id = flags['id']
      if (!id) error('--id required: aitk add-files --id <plugin-id> <file1> [file2...]')
      if (positional.length === 0) error('At least one file path required')
      await runAddFiles({ id, files: positional, type: flags['type'] })
      break
    }

    case 'remove-files': {
      const id = flags['id']
      const fileNames = flags['files']
      if (!id) error('--id required: aitk remove-files --id <plugin-id> --files <name1,name2>')
      if (!fileNames) error('--files required (comma-separated file names)')
      await runRemoveFiles({ id, fileNames: fileNames.split(',').map((f) => f.trim()) })
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
