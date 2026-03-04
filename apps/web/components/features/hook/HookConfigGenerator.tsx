/**
 * Hook configuration JSON generator component
 *
 * Interactive form for generating Claude Code hook settings.json
 * configurations with event selection, matcher options, and validation.
 */
'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { CopyButton } from '../../ui/CopyButton'
import type { HookEvent } from '@/lib/core/types'
import { HOOK_EVENTS } from '@/lib/core/types'

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

/** Hook configuration state */
interface HookConfig {
  /** Hook event type trigger */
  event: HookEvent
  /** Matcher pattern for the event */
  matcher: string
  /** Shell command to execute */
  command: string
  /** Execution timeout in milliseconds */
  timeout: number
  /** Whether hook blocks Claude execution */
  blocking: boolean
}

/** Form validation error messages */
interface ValidationErrors {
  /** Command input validation error */
  command?: string
  /** Matcher selection validation error */
  matcher?: string
}

/**
 * Hook configuration JSON generator
 *
 * Provides form UI for building hook configurations with:
 * - Event type selection with descriptions
 * - Dynamic matcher options based on event
 * - Command input with environment variable hints
 * - Live JSON preview with copy functionality
 */
export function HookConfigGenerator() {
  const t = useTranslations('detail.hookConfig')

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
      newErrors.command = t('errorCommand')
    }

    if (availableMatchers.length > 0 && !config.matcher.trim()) {
      newErrors.matcher = t('errorMatcher')
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
          <h2 className="text-xl font-medium text-[var(--text-primary)]">{t('title')}</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {t('subtitle')}
        </p>
      </div>

      {/* Configuration Form */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-6">{t('sectionTitle')}</h3>

        <div className="space-y-6">
          {/* Event Type Selection */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              {t('eventLabel')}
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
                {t('matcherLabel')}
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
                    placeholder={t('matcherPlaceholder')}
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
                  ? t('matcherHintTool')
                  : config.event === 'PreCompact'
                    ? t('matcherHintPreCompact')
                    : config.event === 'SessionStart'
                      ? t('matcherHintSessionStart')
                      : ''}
              </p>
            </div>
          )}

          {/* Command Input */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              {t('commandLabel')}
            </label>
            <textarea
              value={config.command}
              onChange={(e) => {
                setConfig({ ...config, command: e.target.value })
                setErrors({ ...errors, command: undefined })
              }}
              placeholder={t('commandPlaceholder')}
              rows={3}
              className={`w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--accent-cyan)] transition-colors resize-none ${
                errors.command ? 'border-red-500' : 'border-[var(--border-subtle)]'
              }`}
            />
            {errors.command && (
              <p className="mt-2 text-xs text-red-400">{errors.command}</p>
            )}
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {t('commandHint')}
            </p>
          </div>

          {/* Timeout Input */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              {t('timeoutLabel')}
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
              {t('timeoutHint')}
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
                <span className="text-[var(--text-primary)] font-medium">{t('blockingLabel')}</span>
                <p className="text-xs text-[var(--text-muted)]">
                  {t('blockingHint')}
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
            {t('generateButton')}
          </button>
        </div>
      </div>

      {/* Generated JSON Result */}
      <div id="hook-result" className="glass rounded-2xl p-6 glow-purple">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <h3 className="text-lg font-medium text-[var(--text-primary)]">{t('resultTitle')}</h3>
          </div>
          <div className="flex items-center gap-2">
            {copied && (
              <span className="text-xs text-green-400">{t('copiedLabel')}</span>
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
            <strong className="text-[var(--text-primary)]">{t('installTitle')}</strong>
          </p>
          <ol className="mt-2 text-sm text-[var(--text-muted)] list-decimal list-inside space-y-1">
            <li>
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">~/.claude/settings.json</code>{' '}
              {t('installStep1')}
            </li>
            <li>
              {t('installStep2Before')}{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">hooks</code>{' '}
              {t('installStep2After')}
            </li>
            <li>
              {t('installStep3Before')}{' '}
              <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">/config</code>
              {t('installStep3After')}
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
