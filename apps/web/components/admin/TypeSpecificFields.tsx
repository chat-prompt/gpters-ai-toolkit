/**
 * Type-specific form fields component
 *
 * Renders dynamic form fields based on catalog item type,
 * including difficulty, tools, agent settings, command options, and hook configuration.
 */
'use client'

import { useTranslations } from 'next-intl'
import { CLAUDE_TOOLS, AGENT_MODELS, AGENT_PERMISSION_MODES, TYPE_CONFIG } from '@/lib/data/type-config'
import type { ItemType, AgentModel, AgentPermissionMode, Difficulty, HookEvent } from '@/lib/core/types'
import { DIFFICULTY_LABELS, HOOK_EVENTS } from '@/lib/core/types'

/** Props for TypeSpecificFields component */
interface TypeSpecificFieldsProps {
  type: ItemType
  values: {
    difficulty: Difficulty | ''
    estimatedTime: string
    allowedTools: string
    agentModel: AgentModel | ''
    agentPermissionMode: AgentPermissionMode | ''
    agentSkills: string
    commandArgumentHint: string
    commandDisableModelInvocation: boolean
    // Hook fields
    hookEvent: HookEvent | ''
    hookMatcher: string
    hookCommand: string
    hookTimeout: number | ''
    hookBlocking: boolean
  }
  /** Callback for field value changes */
  onChange: (field: string, value: string | boolean | number) => void
}

/** 선택형 필드(칩·버튼)의 공통 상태 클래스 — 선택 시 테두리+글자로만 표시한다 */
const chipClass = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
    active
      ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
      : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
  }`

/** 폼 입력 공통 클래스 */
const inputClass =
  'w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--border-hover)] transition-colors'

/** 폼 라벨 공통 클래스 */
const labelClass = 'block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3'

/**
 * Dynamic form fields for type-specific catalog item properties
 *
 * Renders appropriate fields based on item type:
 * - skill: difficulty, allowed tools
 * - agent: model, permission mode, skills, allowed tools
 * - command: argument hint, disable model invocation
 * - hook: event, matcher, command, timeout, blocking
 * - guide: difficulty, estimated time
 */
export function TypeSpecificFields({ type, values, onChange }: TypeSpecificFieldsProps) {
  const t = useTranslations('admin.typeSpecificFields')
  const config = TYPE_CONFIG[type]
  const { fields } = config

  // Parse current allowed tools
  const currentTools = values.allowedTools
    ? values.allowedTools.split(',').map((t) => t.trim()).filter(Boolean)
    : []

  const handleToolToggle = (tool: string) => {
    const newTools = currentTools.includes(tool)
      ? currentTools.filter((t) => t !== tool)
      : [...currentTools, tool]
    onChange('allowedTools', newTools.join(', '))
  }

  return (
    <div className="space-y-6">
      {/* Difficulty - for skill, guide */}
      {fields.showDifficulty && (
        <div>
          <label className={labelClass}>Difficulty</label>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange('difficulty', values.difficulty === d ? '' : d)}
                className={chipClass(values.difficulty === d)}
              >
                {DIFFICULTY_LABELS[d].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Estimated Time - for guide */}
      {fields.showEstimatedTime && (
        <div>
          <label className={labelClass}>{t('estimatedTime')}</label>
          <input
            type="text"
            value={values.estimatedTime}
            onChange={(e) => onChange('estimatedTime', e.target.value)}
            placeholder={t('estimatedTimePlaceholder')}
            className={`${inputClass} max-w-xs`}
          />
        </div>
      )}

      {/* Allowed Tools - for skill, agent, command */}
      {fields.showAllowedTools && (
        <div>
          <label className={labelClass}>Allowed Tools</label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {type === 'agent' ? t('agentToolsHint') : t('featureToolsHint')}
            {' '}{t('toolsEmpty')}
          </p>
          <div className="flex flex-wrap gap-2">
            {CLAUDE_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => handleToolToggle(tool)}
                className={chipClass(currentTools.includes(tool))}
              >
                {tool}
              </button>
            ))}
          </div>
          {currentTools.length > 0 && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]">
              <code className="text-xs text-[var(--text-secondary)] font-mono">
                allowed-tools: {currentTools.join(', ')}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Agent-specific fields */}
      {fields.showAgentFields && (
        <>
          {/* Agent Model */}
          <div>
            <label className={labelClass}>Model</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(AGENT_MODELS) as AgentModel[]).map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => onChange('agentModel', values.agentModel === model ? '' : model)}
                  className={`px-4 py-3 rounded-lg text-left border transition-colors ${
                    values.agentModel === model
                      ? 'border-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">{AGENT_MODELS[model].label}</div>
                  <div className="text-xs mt-0.5 text-[var(--text-muted)]">
                    {AGENT_MODELS[model].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Permission Mode */}
          <div>
            <label className={labelClass}>Permission Mode</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AGENT_PERMISSION_MODES) as AgentPermissionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange('agentPermissionMode', values.agentPermissionMode === mode ? '' : mode)}
                  title={AGENT_PERMISSION_MODES[mode].description}
                  className={chipClass(values.agentPermissionMode === mode)}
                >
                  {AGENT_PERMISSION_MODES[mode].label}
                </button>
              ))}
            </div>
            {values.agentPermissionMode && (
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {AGENT_PERMISSION_MODES[values.agentPermissionMode as AgentPermissionMode].description}
              </p>
            )}
          </div>

          {/* Agent Skills */}
          <div>
            <label className={labelClass}>Skills to Load</label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t('agentSkillsHint')}
            </p>
            <input
              type="text"
              value={values.agentSkills}
              onChange={(e) => onChange('agentSkills', e.target.value)}
              placeholder={t('agentSkillsPlaceholder')}
              className={`${inputClass} font-mono`}
            />
          </div>
        </>
      )}

      {/* Command-specific fields */}
      {fields.showCommandFields && (
        <>
          {/* Argument Hint */}
          <div>
            <label className={labelClass}>Argument Hint</label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t('argumentHintDesc')}
            </p>
            <input
              type="text"
              value={values.commandArgumentHint}
              onChange={(e) => onChange('commandArgumentHint', e.target.value)}
              placeholder={t('argumentHintPlaceholder')}
              className={`${inputClass} max-w-md font-mono`}
            />
          </div>

          {/* Disable Model Invocation */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={values.commandDisableModelInvocation}
                onChange={(e) => onChange('commandDisableModelInvocation', e.target.checked)}
                className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-[var(--border-hover)] cursor-pointer"
              />
              <div>
                <span className="text-sm text-[var(--text-primary)]">
                  Disable Model Invocation
                </span>
                <p className="text-xs text-[var(--text-muted)]">
                  {t('disableModelInvocationDesc')}
                </p>
              </div>
            </label>
          </div>
        </>
      )}

      {/* Hook-specific fields */}
      {fields.showHookFields && (
        <>
          {/* Hook Event */}
          <div>
            <label className={labelClass}>Hook Event *</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(HOOK_EVENTS) as HookEvent[]).map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => onChange('hookEvent', values.hookEvent === event ? '' : event)}
                  className={`px-4 py-3 rounded-lg text-left border transition-colors ${
                    values.hookEvent === event
                      ? 'border-[var(--text-primary)]'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-hover)]'
                  }`}
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">{HOOK_EVENTS[event].label}</div>
                  <div className="text-xs mt-0.5 line-clamp-2 text-[var(--text-muted)]">
                    {HOOK_EVENTS[event].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Hook Matcher */}
          {values.hookEvent && HOOK_EVENTS[values.hookEvent as HookEvent]?.matchers.length > 0 && (
            <div>
              <label className={labelClass}>Matcher</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {HOOK_EVENTS[values.hookEvent as HookEvent].matchers.map((matcher) => (
                  <button
                    key={matcher}
                    type="button"
                    onClick={() => onChange('hookMatcher', values.hookMatcher === matcher ? '' : matcher)}
                    className={chipClass(values.hookMatcher === matcher)}
                  >
                    {matcher}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={values.hookMatcher}
                onChange={(e) => onChange('hookMatcher', e.target.value)}
                placeholder={t('hookMatcherPlaceholder')}
                className={`${inputClass} font-mono`}
              />
            </div>
          )}

          {/* Hook Command */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Command *
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t('hookCommandDesc')}
            </p>
            <textarea
              value={values.hookCommand}
              onChange={(e) => onChange('hookCommand', e.target.value)}
              placeholder={t('hookCommandPlaceholder')}
              className={`${inputClass} resize-none`}
              rows={3}
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">
              {t('hookVariablesDesc')} <code className="text-[var(--text-secondary)]">$session_id</code>, <code className="text-[var(--text-secondary)]">$transcript_path</code>, <code className="text-[var(--text-secondary)]">$hook_event_name</code>
            </p>
          </div>

          {/* Hook Timeout */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={values.hookTimeout}
              onChange={(e) => onChange('hookTimeout', e.target.value ? parseInt(e.target.value, 10) : '')}
              placeholder={t('hookTimeoutPlaceholder')}
              min={0}
              className={`${inputClass} max-w-xs`}
            />
          </div>

          {/* Hook Blocking */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={values.hookBlocking}
                onChange={(e) => onChange('hookBlocking', e.target.checked)}
                className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-[var(--border-hover)] cursor-pointer"
              />
              <div>
                <span className="text-sm text-[var(--text-primary)]">
                  Blocking
                </span>
                <p className="text-xs text-[var(--text-muted)]">
                  {t('hookBlockingDesc')}
                </p>
              </div>
            </label>
          </div>

          {/* Preview */}
          {values.hookEvent && values.hookCommand && (
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="eyebrow mb-2">
                {t('configPreview')}
              </div>
              <pre className="text-xs font-mono text-[var(--text-secondary)] overflow-x-auto">
{`{
  "hooks": {
    "${values.hookEvent}": [
      {${values.hookMatcher ? `
        "matcher": "${values.hookMatcher}",` : ''}
        "hooks": [
          {
            "type": "command",
            "command": "${values.hookCommand}"${values.hookTimeout ? `,
            "timeout": ${values.hookTimeout}` : ''}${!values.hookBlocking ? `,
            "blocking": false` : ''}
          }
        ]
      }
    ]
  }
}`}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}
