'use client'

import { useState, useMemo } from 'react'
import { CopyButton } from './CopyButton'
import type { HookEvent } from '@/lib/types'
import { HOOK_EVENTS } from '@/lib/types'

// All tool names for PreToolUse/PostToolUse/PermissionRequest matchers
const TOOL_MATCHERS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'Task',
  'TodoRead',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
]

interface HookConfig {
  event: HookEvent
  matcher: string
  command: string
  timeout: number
  blocking: boolean
}

interface ValidationErrors {
  command?: string
  matcher?: string
}

export function HookConfigGenerator() {
  const [config, setConfig] = useState<HookConfig>({
    event: 'PreCompact',
    matcher: 'auto',
    command: '',
    timeout: 30000,
    blocking: true,
  })
  const [copied, setCopied] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors>({})

  const hookEvents = Object.keys(HOOK_EVENTS) as HookEvent[]

  // Get available matchers for the selected event
  const availableMatchers = useMemo(() => {
    const eventInfo = HOOK_EVENTS[config.event]
    if (config.event === 'PreToolUse' || config.event === 'PostToolUse' || config.event === 'PermissionRequest') {
      return TOOL_MATCHERS
    }
    return eventInfo.matchers
  }, [config.event])

  // Validate inputs
  const validate = (): boolean => {
    const newErrors: ValidationErrors = {}

    if (!config.command.trim()) {
      newErrors.command = '실행할 명령어를 입력하세요'
    }

    if (availableMatchers.length > 0 && !config.matcher.trim()) {
      newErrors.matcher = 'Matcher를 선택하거나 입력하세요'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Generate JSON config
  const generatedJson = useMemo(() => {
    const hookEntry: Record<string, unknown> = {
      type: 'command',
      command: config.command || 'your-command-here',
      timeout: config.timeout,
      blocking: config.blocking,
    }

    // Build the structure based on whether matcher is needed
    let eventConfig: unknown[]

    if (availableMatchers.length === 0) {
      // Events without matchers (Notification, UserPromptSubmit, Stop, SubagentStop, SessionEnd)
      eventConfig = [hookEntry]
    } else {
      // Events with matchers
      eventConfig = [
        {
          matcher: config.matcher || 'auto',
          hooks: [hookEntry],
        },
      ]
    }

    return {
      hooks: {
        [config.event]: eventConfig,
      },
    }
  }, [config, availableMatchers])

  const jsonString = JSON.stringify(generatedJson, null, 2)

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerate = () => {
    if (validate()) {
      // Scroll to result
      document.getElementById('hook-result')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6 glow-cyan">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🪝</span>
          <h2 className="text-xl font-medium text-[var(--text-primary)]">Hook 설정 JSON 생성기</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Claude Code settings.json에 추가할 Hook 설정을 쉽게 생성할 수 있습니다.
        </p>
      </div>

      {/* Configuration Form */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-6">설정</h3>

        <div className="space-y-6">
          {/* Event Type Selection */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Hook 이벤트
            </label>
            <select
              value={config.event}
              onChange={(e) => {
                const newEvent = e.target.value as HookEvent
                const newEventInfo = HOOK_EVENTS[newEvent]
                // Reset matcher when changing event type
                setConfig({
                  ...config,
                  event: newEvent,
                  matcher: newEventInfo.matchers[0] || '',
                })
                setErrors({})
              }}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors"
            >
              {hookEvents.map((event) => (
                <option key={event} value={event}>
                  {HOOK_EVENTS[event].label} ({event})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {HOOK_EVENTS[config.event].description}
            </p>
          </div>

          {/* Matcher Selection */}
          {availableMatchers.length > 0 && (
            <div>
              <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Matcher
              </label>
              {availableMatchers.length <= 5 ? (
                // Button group for small number of options
                <div className="flex flex-wrap gap-2">
                  {availableMatchers.map((matcher) => (
                    <button
                      key={matcher}
                      type="button"
                      onClick={() => {
                        setConfig({ ...config, matcher })
                        setErrors({ ...errors, matcher: undefined })
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                        config.matcher === matcher
                          ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {matcher}
                    </button>
                  ))}
                </div>
              ) : (
                // Combobox for many options (tool names)
                <div className="space-y-2">
                  <input
                    type="text"
                    list="matcher-options"
                    value={config.matcher}
                    onChange={(e) => {
                      setConfig({ ...config, matcher: e.target.value })
                      setErrors({ ...errors, matcher: undefined })
                    }}
                    placeholder="도구 이름을 입력하거나 선택하세요"
                    className={`w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors ${
                      errors.matcher ? 'border-red-500' : 'border-[var(--border-subtle)]'
                    }`}
                  />
                  <datalist id="matcher-options">
                    {availableMatchers.map((matcher) => (
                      <option key={matcher} value={matcher} />
                    ))}
                  </datalist>
                </div>
              )}
              {errors.matcher && (
                <p className="mt-2 text-xs text-red-400">{errors.matcher}</p>
              )}
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {config.event === 'PreToolUse' || config.event === 'PostToolUse' || config.event === 'PermissionRequest'
                  ? '특정 도구에만 Hook을 적용하려면 도구 이름을 입력하세요. 여러 도구 타입은 여러 Hook을 추가해야 합니다.'
                  : config.event === 'PreCompact'
                    ? 'auto: 자동 Compaction, manual: 수동 Compaction (/compact 명령)'
                    : config.event === 'SessionStart'
                      ? 'startup: 새 세션, resume: 기존 세션 재개, clear: /clear 후, compact: /compact 후'
                      : ''}
              </p>
            </div>
          )}

          {/* Command Input */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              실행 명령어
            </label>
            <textarea
              value={config.command}
              onChange={(e) => {
                setConfig({ ...config, command: e.target.value })
                setErrors({ ...errors, command: undefined })
              }}
              placeholder="예: /path/to/script.sh $CLAUDE_SESSION_ID"
              rows={3}
              className={`w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--accent-cyan)] transition-colors resize-none ${
                errors.command ? 'border-red-500' : 'border-[var(--border-subtle)]'
              }`}
            />
            {errors.command && (
              <p className="mt-2 text-xs text-red-400">{errors.command}</p>
            )}
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              환경변수: $CLAUDE_SESSION_ID, $CLAUDE_PROJECT_DIR 등을 사용할 수 있습니다.
            </p>
          </div>

          {/* Timeout Input */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              타임아웃 (ms)
            </label>
            <input
              type="number"
              value={config.timeout}
              onChange={(e) => setConfig({ ...config, timeout: Math.max(0, parseInt(e.target.value) || 0) })}
              min={0}
              step={1000}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)] transition-colors"
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              명령어 실행 제한 시간. 기본값은 30000ms (30초)입니다.
            </p>
          </div>

          {/* Blocking Checkbox */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.blocking}
                onChange={(e) => setConfig({ ...config, blocking: e.target.checked })}
                className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)] accent-[var(--accent-cyan)]"
              />
              <div>
                <span className="text-[var(--text-primary)] font-medium">Blocking</span>
                <p className="text-xs text-[var(--text-muted)]">
                  체크 시 Hook 완료까지 Claude가 대기합니다. 해제 시 비동기로 실행됩니다.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Generate Button */}
        <div className="mt-8">
          <button
            onClick={handleGenerate}
            className="w-full px-6 py-3 rounded-xl bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity"
          >
            JSON 생성
          </button>
        </div>
      </div>

      {/* Generated JSON Result */}
      <div id="hook-result" className="glass rounded-2xl p-6 glow-purple">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <h3 className="text-lg font-medium text-[var(--text-primary)]">생성된 JSON</h3>
          </div>
          <div className="flex items-center gap-2">
            {copied && (
              <span className="text-xs text-green-400">복사됨!</span>
            )}
            <CopyButton text={jsonString} onCopy={handleCopy} />
          </div>
        </div>

        <div className="bg-[var(--bg-primary)] rounded-xl p-4 overflow-x-auto">
          <pre className="text-sm font-mono text-[var(--accent-purple)] whitespace-pre">
            {jsonString}
          </pre>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-muted)]">
            <strong className="text-[var(--text-primary)]">설치 방법:</strong>
          </p>
          <ol className="mt-2 text-sm text-[var(--text-muted)] list-decimal list-inside space-y-1">
            <li>
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">~/.claude/settings.json</code> 파일을 엽니다
            </li>
            <li>
              기존 <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">hooks</code> 객체에 위 설정을 병합하거나, 없으면 새로 추가합니다
            </li>
            <li>Claude Code를 재시작하거나 <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">/config</code>로 확인합니다</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
