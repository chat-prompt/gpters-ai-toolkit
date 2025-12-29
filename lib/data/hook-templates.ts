import type { HookEvent } from '../core/types'

// Hook template categories
export type HookTemplateCategory =
  | 'session'      // 세션 관리 (SessionStart, PreCompact)
  | 'tool'         // 도구 사용 (PreToolUse, PostToolUse)
  | 'notification' // 알림/로깅
  | 'security'     // 보안/검증

export interface HookTemplate {
  id: string
  name: string
  description: string
  category: HookTemplateCategory
  hookEvent: HookEvent
  hookMatcher?: string
  hookCommand: string
  hookTimeout?: number
  hookBlocking?: boolean
  usageExample?: string
  tags?: string[]
}

export const HOOK_TEMPLATE_CATEGORIES: Record<HookTemplateCategory, { label: string; emoji: string; description: string; color: string }> = {
  session: {
    label: '세션 관리',
    emoji: '🔄',
    description: '세션 시작, 재개, Compaction 등 세션 라이프사이클 관련 Hook',
    color: 'cyan',
  },
  tool: {
    label: '도구 사용',
    emoji: '🔧',
    description: '도구 실행 전후 검증, 로깅, 수정 등 도구 관련 Hook',
    color: 'purple',
  },
  notification: {
    label: '알림/로깅',
    emoji: '📢',
    description: '알림 전송, 로깅, 모니터링 등 알림 관련 Hook',
    color: 'yellow',
  },
  security: {
    label: '보안/검증',
    emoji: '🛡️',
    description: '보안 검사, 권한 검증, 입력 검증 등 보안 관련 Hook',
    color: 'red',
  },
}

export const HOOK_TEMPLATES: HookTemplate[] = [
  // ============================================
  // Session Management Templates
  // ============================================
  {
    id: 'session-welcome',
    name: '세션 시작 알림',
    description: '새 세션이 시작될 때 환영 메시지를 표시하고 프로젝트 컨텍스트를 로드합니다.',
    category: 'session',
    hookEvent: 'SessionStart',
    hookMatcher: 'startup',
    hookCommand: 'echo "=== Claude Code Session Started ===" && echo "Project: $CLAUDE_PROJECT_DIR" && echo "Session: $CLAUDE_SESSION_ID"',
    hookTimeout: 5000,
    hookBlocking: false,
    usageExample: `# 세션 시작 시 프로젝트 정보 출력
# $CLAUDE_PROJECT_DIR: 현재 프로젝트 디렉토리
# $CLAUDE_SESSION_ID: 현재 세션 ID`,
    tags: ['세션', '알림', '시작'],
  },
  {
    id: 'session-resume-context',
    name: '세션 재개 컨텍스트 로드',
    description: '세션 재개 시 이전 작업 컨텍스트를 자동으로 로드합니다.',
    category: 'session',
    hookEvent: 'SessionStart',
    hookMatcher: 'resume',
    hookCommand: 'cat "$CLAUDE_PROJECT_DIR/.claude/context.md" 2>/dev/null || echo "No previous context found"',
    hookTimeout: 5000,
    hookBlocking: true,
    usageExample: `# 세션 재개 시 컨텍스트 파일 로드
# .claude/context.md 파일에 작업 컨텍스트 저장 권장`,
    tags: ['세션', '재개', '컨텍스트'],
  },
  {
    id: 'session-load-env',
    name: '환경 변수 로드',
    description: '세션 시작 시 프로젝트별 환경 변수를 로드합니다.',
    category: 'session',
    hookEvent: 'SessionStart',
    hookMatcher: 'startup',
    hookCommand: 'test -f "$CLAUDE_PROJECT_DIR/.claude/env.sh" && source "$CLAUDE_PROJECT_DIR/.claude/env.sh" && echo "Environment loaded" || echo "No env file found"',
    hookTimeout: 5000,
    hookBlocking: true,
    usageExample: `# .claude/env.sh 파일 예시:
# export API_URL="https://api.example.com"
# export DEBUG_MODE="true"`,
    tags: ['세션', '환경변수', '설정'],
  },
  {
    id: 'precompact-backup',
    name: 'Compaction 전 백업',
    description: 'Compaction 전에 현재 대화 내용을 백업합니다.',
    category: 'session',
    hookEvent: 'PreCompact',
    hookMatcher: 'auto',
    hookCommand: 'mkdir -p "$CLAUDE_PROJECT_DIR/.claude/backups" && echo "Backup created at $(date)" > "$CLAUDE_PROJECT_DIR/.claude/backups/compact-$(date +%Y%m%d-%H%M%S).log"',
    hookTimeout: 10000,
    hookBlocking: true,
    usageExample: `# 자동 Compaction 전 백업 생성
# .claude/backups/ 디렉토리에 타임스탬프 파일 생성`,
    tags: ['세션', 'Compaction', '백업'],
  },
  {
    id: 'precompact-summary',
    name: 'Compaction 전 요약 저장',
    description: 'Compaction 전에 세션 요약을 저장합니다.',
    category: 'session',
    hookEvent: 'PreCompact',
    hookMatcher: 'manual',
    hookCommand: 'echo "Session summary saved at $(date)" >> "$CLAUDE_PROJECT_DIR/.claude/session-summary.md"',
    hookTimeout: 5000,
    hookBlocking: true,
    usageExample: `# /compact 명령 실행 전 세션 요약 저장
# 수동 Compaction 시에만 동작`,
    tags: ['세션', 'Compaction', '요약'],
  },

  // ============================================
  // Tool Use Templates
  // ============================================
  {
    id: 'pretool-bash-log',
    name: 'Bash 명령 로깅',
    description: 'Bash 명령 실행 전 명령어를 로그 파일에 기록합니다.',
    category: 'tool',
    hookEvent: 'PreToolUse',
    hookMatcher: 'Bash',
    hookCommand: 'echo "[$(date +%Y-%m-%d\\ %H:%M:%S)] Bash command: $CLAUDE_TOOL_INPUT" >> "$CLAUDE_PROJECT_DIR/.claude/command-log.txt"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# 모든 Bash 명령을 로그 파일에 기록
# $CLAUDE_TOOL_INPUT: 실행되는 명령어 내용`,
    tags: ['도구', 'Bash', '로깅'],
  },
  {
    id: 'pretool-write-backup',
    name: '파일 쓰기 전 백업',
    description: '파일 쓰기 전 기존 파일을 백업합니다.',
    category: 'tool',
    hookEvent: 'PreToolUse',
    hookMatcher: 'Write',
    hookCommand: 'echo "File write operation logged at $(date)"',
    hookTimeout: 5000,
    hookBlocking: false,
    usageExample: `# Write 도구 사용 전 알림
# 실제 백업 로직은 필요에 따라 커스터마이즈`,
    tags: ['도구', 'Write', '백업'],
  },
  {
    id: 'posttool-edit-verify',
    name: '파일 편집 후 검증',
    description: '파일 편집 후 구문 오류 등을 검증합니다.',
    category: 'tool',
    hookEvent: 'PostToolUse',
    hookMatcher: 'Edit',
    hookCommand: 'echo "Edit completed - consider running linter"',
    hookTimeout: 10000,
    hookBlocking: false,
    usageExample: `# Edit 도구 사용 후 알림
# 실제 검증 로직: eslint, prettier 등 연동 가능`,
    tags: ['도구', 'Edit', '검증'],
  },
  {
    id: 'posttool-bash-notify',
    name: 'Bash 실행 완료 알림',
    description: 'Bash 명령 실행 완료 시 알림을 전송합니다.',
    category: 'tool',
    hookEvent: 'PostToolUse',
    hookMatcher: 'Bash',
    hookCommand: 'echo "Bash command completed at $(date)"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# Bash 명령 완료 후 알림
# macOS: osascript로 알림 표시 가능
# Linux: notify-send 사용 가능`,
    tags: ['도구', 'Bash', '알림'],
  },
  {
    id: 'pretool-task-log',
    name: 'Task 실행 로깅',
    description: 'Task 도구 실행 전 로그를 기록합니다.',
    category: 'tool',
    hookEvent: 'PreToolUse',
    hookMatcher: 'Task',
    hookCommand: 'echo "[$(date)] Task initiated" >> "$CLAUDE_PROJECT_DIR/.claude/task-log.txt"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# Task 도구 (서브에이전트) 실행 로깅
# 복잡한 작업 추적에 유용`,
    tags: ['도구', 'Task', '로깅'],
  },

  // ============================================
  // Notification Templates
  // ============================================
  {
    id: 'notify-desktop-macos',
    name: 'macOS 데스크톱 알림',
    description: 'macOS에서 데스크톱 알림을 표시합니다.',
    category: 'notification',
    hookEvent: 'Notification',
    hookCommand: 'osascript -e \'display notification "Claude Code Notification" with title "Claude Code"\'',
    hookTimeout: 5000,
    hookBlocking: false,
    usageExample: `# macOS 전용 데스크톱 알림
# osascript를 사용하여 시스템 알림 표시`,
    tags: ['알림', 'macOS', '데스크톱'],
  },
  {
    id: 'notify-desktop-linux',
    name: 'Linux 데스크톱 알림',
    description: 'Linux에서 데스크톱 알림을 표시합니다.',
    category: 'notification',
    hookEvent: 'Notification',
    hookCommand: 'notify-send "Claude Code" "Notification from Claude Code"',
    hookTimeout: 5000,
    hookBlocking: false,
    usageExample: `# Linux 데스크톱 알림
# notify-send 패키지 필요 (libnotify)`,
    tags: ['알림', 'Linux', '데스크톱'],
  },
  {
    id: 'notify-slack-webhook',
    name: 'Slack 웹훅 알림',
    description: 'Slack 채널에 알림을 전송합니다.',
    category: 'notification',
    hookEvent: 'Notification',
    hookCommand: 'curl -X POST -H "Content-type: application/json" --data \'{"text":"Claude Code notification"}\' "$SLACK_WEBHOOK_URL" 2>/dev/null || echo "Slack webhook failed"',
    hookTimeout: 10000,
    hookBlocking: false,
    usageExample: `# Slack 웹훅 알림
# 환경변수 SLACK_WEBHOOK_URL 설정 필요
# Slack App에서 Incoming Webhook URL 생성`,
    tags: ['알림', 'Slack', '웹훅'],
  },
  {
    id: 'notify-sound',
    name: '소리 알림',
    description: '작업 완료 시 소리 알림을 재생합니다.',
    category: 'notification',
    hookEvent: 'Stop',
    hookCommand: 'afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || echo "Sound notification"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# macOS 시스템 사운드 재생
# 다른 사운드: Ping.aiff, Pop.aiff, Purr.aiff 등`,
    tags: ['알림', '소리', 'macOS'],
  },
  {
    id: 'notify-log-file',
    name: '파일 로깅',
    description: '모든 알림을 로그 파일에 기록합니다.',
    category: 'notification',
    hookEvent: 'Notification',
    hookCommand: 'echo "[$(date +%Y-%m-%d\\ %H:%M:%S)] Notification received" >> "$CLAUDE_PROJECT_DIR/.claude/notifications.log"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# 알림 로그 파일 기록
# .claude/notifications.log에 타임스탬프와 함께 저장`,
    tags: ['알림', '로깅', '파일'],
  },

  // ============================================
  // Security/Validation Templates
  // ============================================
  {
    id: 'security-bash-validate',
    name: 'Bash 명령 검증',
    description: '위험한 Bash 명령을 사전에 차단합니다.',
    category: 'security',
    hookEvent: 'PreToolUse',
    hookMatcher: 'Bash',
    hookCommand: 'echo "$CLAUDE_TOOL_INPUT" | grep -qE "(rm\\s+-rf\\s+/|dd\\s+if=|mkfs\\.|:(){:|fork\\s*bomb)" && exit 1 || exit 0',
    hookTimeout: 3000,
    hookBlocking: true,
    usageExample: `# 위험한 명령 패턴 차단
# rm -rf /, dd if=, mkfs., 포크 폭탄 등 차단
# exit 1: 명령 실행 차단, exit 0: 허용`,
    tags: ['보안', 'Bash', '검증'],
  },
  {
    id: 'security-path-validate',
    name: '경로 검증',
    description: '민감한 경로에 대한 접근을 제한합니다.',
    category: 'security',
    hookEvent: 'PreToolUse',
    hookMatcher: 'Read',
    hookCommand: 'echo "$CLAUDE_TOOL_INPUT" | grep -qE "(\\.env|\\.ssh|credentials|secret)" && echo "Warning: Sensitive file access" || exit 0',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# 민감한 파일 접근 경고
# .env, .ssh, credentials 등 파일 접근 시 경고
# 차단하려면 exit 1 사용`,
    tags: ['보안', '경로', '검증'],
  },
  {
    id: 'security-write-protect',
    name: '쓰기 보호',
    description: '특정 파일이나 디렉토리에 대한 쓰기를 방지합니다.',
    category: 'security',
    hookEvent: 'PreToolUse',
    hookMatcher: 'Write',
    hookCommand: 'echo "$CLAUDE_TOOL_INPUT" | grep -qE "(package-lock\\.json|yarn\\.lock|\\.git/)" && exit 1 || exit 0',
    hookTimeout: 3000,
    hookBlocking: true,
    usageExample: `# 락 파일 및 .git 디렉토리 수정 방지
# exit 1로 쓰기 작업 차단`,
    tags: ['보안', 'Write', '보호'],
  },
  {
    id: 'security-prompt-sanitize',
    name: '프롬프트 검증',
    description: '사용자 프롬프트에서 위험한 패턴을 검출합니다.',
    category: 'security',
    hookEvent: 'UserPromptSubmit',
    hookCommand: 'echo "Prompt submitted at $(date)" >> "$CLAUDE_PROJECT_DIR/.claude/prompt-log.txt"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# 프롬프트 제출 로깅
# 감사 추적 및 보안 분석에 활용`,
    tags: ['보안', '프롬프트', '검증'],
  },
  {
    id: 'security-permission-audit',
    name: '권한 요청 감사',
    description: '권한 요청을 로그에 기록하여 감사 추적합니다.',
    category: 'security',
    hookEvent: 'PermissionRequest',
    hookMatcher: 'Bash',
    hookCommand: 'echo "[$(date)] Permission requested for Bash command" >> "$CLAUDE_PROJECT_DIR/.claude/permission-audit.log"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# Bash 권한 요청 감사 로그
# 모든 권한 요청을 파일에 기록`,
    tags: ['보안', '권한', '감사'],
  },
  {
    id: 'security-network-monitor',
    name: '네트워크 요청 모니터링',
    description: 'WebFetch 도구 사용을 모니터링합니다.',
    category: 'security',
    hookEvent: 'PreToolUse',
    hookMatcher: 'WebFetch',
    hookCommand: 'echo "[$(date)] WebFetch request" >> "$CLAUDE_PROJECT_DIR/.claude/network-log.txt"',
    hookTimeout: 3000,
    hookBlocking: false,
    usageExample: `# 외부 네트워크 요청 모니터링
# WebFetch 사용 시 로깅`,
    tags: ['보안', '네트워크', '모니터링'],
  },
]

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: HookTemplateCategory): HookTemplate[] {
  return HOOK_TEMPLATES.filter(t => t.category === category)
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): HookTemplate | undefined {
  return HOOK_TEMPLATES.find(t => t.id === id)
}

/**
 * Search templates by keyword
 */
export function searchTemplates(keyword: string): HookTemplate[] {
  const lowerKeyword = keyword.toLowerCase()
  return HOOK_TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(lowerKeyword) ||
    t.description.toLowerCase().includes(lowerKeyword) ||
    t.tags?.some(tag => tag.toLowerCase().includes(lowerKeyword))
  )
}

/**
 * Get all unique tags from templates
 */
export function getAllTemplateTags(): string[] {
  const tags = new Set<string>()
  HOOK_TEMPLATES.forEach(t => {
    t.tags?.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort()
}

/**
 * Generate JSON config from template
 */
export function generateConfigFromTemplate(template: HookTemplate): object {
  const hookConfig: Record<string, unknown> = {
    type: 'command',
    command: template.hookCommand,
  }

  if (template.hookTimeout) {
    hookConfig.timeout = template.hookTimeout
  }

  if (template.hookBlocking === false) {
    hookConfig.blocking = false
  }

  // Check if this event type uses matchers
  const eventsWithoutMatcher: HookEvent[] = ['Notification', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'SessionEnd']
  const usesMatcher = !eventsWithoutMatcher.includes(template.hookEvent)

  let eventConfig: unknown[]

  if (usesMatcher && template.hookMatcher) {
    eventConfig = [
      {
        matcher: template.hookMatcher,
        hooks: [hookConfig],
      },
    ]
  } else {
    eventConfig = [hookConfig]
  }

  return {
    hooks: {
      [template.hookEvent]: eventConfig,
    },
  }
}
