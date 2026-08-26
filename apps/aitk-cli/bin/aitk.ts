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
import { runReportExecution, runReportExecutionStart } from '../src/commands/report-execution.js'
import { runUsageReport } from '../src/commands/usage-report.js'
import { runAgentTelemetryCollect } from '../src/commands/agent-telemetry.js'
import { runLogin } from '../src/commands/login.js'
import { runDeviceLogin } from '../src/commands/device-login.js'
import { runConfig } from '../src/commands/config.js'
import { runWhoami } from '../src/commands/whoami.js'
import { runUndeploy } from '../src/commands/undeploy.js'
import { runAddFiles } from '../src/commands/add-files.js'
import { runRemoveFiles } from '../src/commands/remove-files.js'
import { runUpgrade } from '../src/commands/upgrade.js'
import { error, info } from '../src/output.js'
import pkg from '../package.json' with { type: 'json' }

/** 버전 — package.json 하나만 고치면 되도록 여기서 읽는다 (하드코딩하면 배포본이 거짓 버전을 답한다) */
const VERSION = pkg.version

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
  aitk deploy --id <slug> --type <type> --name <name> --content <@file|text>
              [--description <d>] [--tags a,b] [--changelog <text>] [--platforms claude_code,codex]
              (new skills require --description & --tags; updates require --changelog)
  aitk upgrade
  aitk updates
  aitk config [list|get|set] [key] [value]
  aitk report-session --count <N> [--version <ver>]
  aitk report-skip --query <query> --reason <reason> [--result-ids id1,id2]
  aitk report-outcome --skill-id <id> --applied true|false --summary <text>
  aitk report-execution-start --skill-id <id> --agent <runtime> --agent-id <id> [options]
  aitk report-execution --skill-id <id> --status <status> --agent <runtime> --agent-id <id> [options]
  aitk usage report [--days 7] [--dry-run]
  aitk agent-telemetry collect --agent <id> [--days 7] [--dry-run]
  aitk undeploy <id>
  aitk add-files --id <id> <file1> [file2...] [--type script|reference|template|config]
  aitk remove-files --id <id> --files <name1,name2>
  aitk login [--token <token>] [--device]
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
  add-files       Add files to a plugin
  remove-files    Remove files from a plugin
  report-session  Report session event (for hooks)
  report-skip     Report skill search skip reason
  report-outcome  Report skill application outcome
  report-execution-start Report actual skill application start
  report-execution Report validated skill execution outcome
  usage           Report local Claude Code / Codex token usage
  agent-telemetry Collect PII-free OpenClaw agent delta usage
  login           Save auth token (browser, --device, or --token)
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

  New skills also require --description and --tags.
  Updating an existing skill requires --changelog.

Options:
  --description <d>       Item description (required for new skills)
  --tags <t1,t2>          Comma-separated tags (required for new skills)
  --platforms <p1,p2>     Comma-separated platforms (claude_code,opencode,codex,cursor)
  --changelog <text>      Change summary (required when updating an existing skill)

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
  'report-execution-start': `aitk report-execution-start - Report actual skill application start

Usage: aitk report-execution-start --skill-id <id> --agent <runtime> --agent-id <stable-id> [options]

Options:
  --source <source>             aitk|bbopters-shared (default: aitk)
  --attempt-id <uuid>           Stable attempt identifier (generated if omitted)
  --event-id <uuid>             Idempotency identifier (generated if omitted)
  --skill-version <version>     SKILL.md version or commit SHA`,
  'report-execution': `aitk report-execution - Report validated skill execution

Usage: aitk report-execution --skill-id <id> --status success|partial|failed|abandoned --agent claude-code|codex|openclaw|test-agent --agent-id <stable-id> [options]

Options:
  --source <source>             aitk|bbopters-shared (default: aitk)
  --agent-id <stable-id>        Stable bot identifier shared with the start report
  --attempt-id <uuid>          Stable attempt identifier (generated if omitted)
  --event-id <uuid>            Idempotency identifier (generated if omitted)
  --skill-version <version>    SKILL.md version or commit SHA
  --failure-stage <stage>      load|instruction|dependency|execution|validation
  --error-code <code>          Short machine-readable error code
  --validation-method <method> test|command|artifact|user_confirmation|none
  --validation-passed <bool>   true|false when validation method is not none
  --validation-summary <text>  Short redacted summary; never send raw output
  --user-accepted <bool>       true|false when observable`,

  usage: `aitk usage - Report local Claude Code / Codex token usage

Usage: aitk usage report [--days <N>] [--dry-run]

Aggregates token counts from local transcripts (~/.claude/projects,
~/.codex/sessions) and reports them to the team dashboard.
Only aggregate numbers and the plan name leave your machine —
never conversation content, file paths, or credentials.

Options:
  --days <N>         Aggregation window in days (default: 7, max: 90)
  --dry-run          Print the aggregate without sending it

Examples:
  aitk usage report
  aitk usage report --days 30 --dry-run`,

  'agent-telemetry': `aitk agent-telemetry - Collect PII-free agent usage

Usage: aitk agent-telemetry collect --agent <id> [options]

Required:
  --agent <id>                 Stable agent ID (for example bbodoong)

Options:
  --source <source>            openclaw|claude-code (default: openclaw)
  --sessions-dir <path>        Transcript directory (required for claude-code)
  --checkpoint-dir <path>      Per-agent checkpoint directory
  --collector-id <id>          Stable collector identity (generated if omitted)
  --days <N>                   First-run backfill window (default: 7, max: 90)
  --category <category>        Allowlisted task category (default: unclassified)
  --server-url <url>           AI Toolkit server URL
  --openclaw-version <version> Runtime version label (default: unknown)
  --claude-cli-version <ver>   Claude CLI version label (default: unknown)
  --dry-run                    Print only aggregate data; never write checkpoint or send

Authentication:
  Set AX_AGENT_TELEMETRY_TOKEN in the environment. Tokens are not accepted as CLI flags.

Examples:
  aitk agent-telemetry collect --agent bbodoong --days 7 --dry-run
  aitk agent-telemetry collect --agent bbodoong --category qa-verify`,

  login: `aitk login - Authenticate with AI Toolkit

Usage: aitk login [--token <token>] [--device]

Options:
  --token <token>    Manually save a token (skips browser flow)
  --device           Use Device Flow for headless/server environments

Without options, opens browser for Google OAuth login.
With --device, shows a code to enter on another device (phone/PC).`,

  whoami: `aitk whoami - Show current authenticated user

Usage: aitk whoami

Displays the email, name, and organization of the currently authenticated user.`,

  undeploy: `aitk undeploy - Remove a deployed skill (owner only)

Usage: aitk undeploy <id>

Arguments:
  id                 Plugin ID to remove

Examples:
  aitk undeploy my-old-skill`,

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

  // Targeted error for commands removed in v0.5.0 (EDU-7987)
  const REMOVED_COMMANDS = new Set(['suggest', 'suggestions', 'resolve'])
  if (REMOVED_COMMANDS.has(command)) {
    error(`Command "${command}" was removed in v0.5.0. The suggest feature was retired (EDU-7987). Edit skills directly via "aitk deploy" or the web UI.`, 1)
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
        changelog: flags['changelog'],
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

    case 'report-execution-start': {
      const skillId = flags['skill-id']
      const agent = flags['agent']
      const agentId = flags['agent-id']
      if (!skillId) error('--skill-id required')
      if (!agentId) error('--agent-id required')
      if (!['claude-code', 'codex', 'openclaw', 'test-agent'].includes(agent ?? '')) {
        error('--agent must be claude-code|codex|openclaw|test-agent')
      }
      const source = flags['source'] ?? 'aitk'
      if (!['aitk', 'bbopters-shared'].includes(source)) error('--source must be aitk|bbopters-shared')
      await runReportExecutionStart({
        skillId,
        agent: agent as 'claude-code' | 'codex' | 'openclaw' | 'test-agent',
        agentId,
        source: source as 'aitk' | 'bbopters-shared',
        attemptId: flags['attempt-id'],
        eventId: flags['event-id'],
        skillVersion: flags['skill-version'],
      })
      break
    }

    case 'report-execution': {
      const skillId = flags['skill-id']
      const status = flags['status']
      const agent = flags['agent']
      const agentId = flags['agent-id']
      if (!skillId) error('--skill-id required')
      if (!agentId) error('--agent-id required')
      if (!['success', 'partial', 'failed', 'abandoned'].includes(status ?? '')) {
        error('--status must be success|partial|failed|abandoned')
      }
      if (!['claude-code', 'codex', 'openclaw', 'test-agent'].includes(agent ?? '')) {
        error('--agent must be claude-code|codex|openclaw|test-agent')
      }
      const source = flags['source'] ?? 'aitk'
      if (!['aitk', 'bbopters-shared'].includes(source)) {
        error('--source must be aitk|bbopters-shared')
      }
      const bool = (value: string | undefined): boolean | undefined =>
        value === undefined ? undefined : value === 'true' ? true : value === 'false' ? false : undefined
      await runReportExecution({
        skillId,
        status: status as 'success' | 'partial' | 'failed' | 'abandoned',
        agent: agent as 'claude-code' | 'codex' | 'openclaw' | 'test-agent',
        agentId,
        source: source as 'aitk' | 'bbopters-shared',
        attemptId: flags['attempt-id'],
        eventId: flags['event-id'],
        skillVersion: flags['skill-version'],
        failureStage: flags['failure-stage'] as 'load' | 'instruction' | 'dependency' | 'execution' | 'validation' | undefined,
        errorCode: flags['error-code'],
        validationMethod: flags['validation-method'] as 'test' | 'command' | 'artifact' | 'user_confirmation' | 'none' | undefined,
        validationPassed: bool(flags['validation-passed']),
        validationSummary: flags['validation-summary'],
        userAccepted: bool(flags['user-accepted']),
      })
      break
    }

    case 'usage': {
      const sub = positional[0]
      if (sub !== 'report') {
        error(`Unknown subcommand: aitk usage ${sub ?? ''}\nUsage: aitk usage report [--days N] [--dry-run]`)
      }
      await runUsageReport({
        days: flags['days'] ? parseInt(flags['days'], 10) : 7,
        dryRun: flags['dry-run'] === 'true',
      })
      break
    }

    case 'agent-telemetry': {
      const sub = positional[0]
      if (sub !== 'collect') {
        error(`Unknown subcommand: aitk agent-telemetry ${sub ?? ''}\nUsage: aitk agent-telemetry collect --agent <id> [--dry-run]`)
      }
      if (!flags['agent']) error('--agent required: aitk agent-telemetry collect --agent <id>')
      await runAgentTelemetryCollect({
        agentId: flags['agent'],
        source: flags['source'],
        days: flags['days'] ? parseInt(flags['days'], 10) : 7,
        dryRun: flags['dry-run'] === 'true',
        collectorVersion: VERSION,
        sessionsDir: flags['sessions-dir'],
        checkpointDir: flags['checkpoint-dir'],
        collectorInstanceId: flags['collector-id'],
        category: flags['category'],
        serverUrl: flags['server-url'],
        openclawVersion: flags['openclaw-version'],
        claudeCliVersion: flags['claude-cli-version'],
      })
      break
    }

    case 'login': {
      if (flags['device'] === 'true') {
        await runDeviceLogin()
      } else {
        await runLogin(flags['token'])
      }
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
