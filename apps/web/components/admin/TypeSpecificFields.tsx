/**
 * Type-specific form fields component
 *
 * Renders dynamic form fields based on catalog item type,
 * including difficulty, tools, agent settings, command options, and hook configuration.
 */
'use client'

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
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Difficulty
          </label>
          <div className="flex gap-3">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange('difficulty', values.difficulty === d ? '' : d)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  values.difficulty === d
                    ? 'bg-[var(--accent-cyan)] text-black'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {DIFFICULTY_LABELS[d].emoji} {DIFFICULTY_LABELS[d].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Estimated Time - for guide */}
      {fields.showEstimatedTime && (
        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
            예상 소요 시간
          </label>
          <input
            type="text"
            value={values.estimatedTime}
            onChange={(e) => onChange('estimatedTime', e.target.value)}
            placeholder="예: 10분, 30분, 1시간"
            className="w-full max-w-xs px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
          />
        </div>
      )}

      {/* Allowed Tools - for skill, agent, command */}
      {fields.showAllowedTools && (
        <div>
          <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Allowed Tools
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {type === 'agent' ? 'Agent가 사용할 수 있는 도구를 선택하세요.' : '이 기능이 사용할 수 있는 도구를 제한합니다.'}
            {' '}비워두면 모든 도구를 사용합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {CLAUDE_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => handleToolToggle(tool)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  currentTools.includes(tool)
                    ? 'bg-[var(--accent-purple)] text-white'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tool}
              </button>
            ))}
          </div>
          {currentTools.length > 0 && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)]">
              <code className="text-xs text-[var(--accent-cyan)] font-mono">
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
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Model
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(AGENT_MODELS) as AgentModel[]).map((model) => (
                <button
                  key={model}
                  type="button"
                  onClick={() => onChange('agentModel', values.agentModel === model ? '' : model)}
                  className={`px-4 py-3 rounded-lg text-left transition-all ${
                    values.agentModel === model
                      ? 'bg-[var(--accent-purple)] text-white'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="text-sm font-medium">{AGENT_MODELS[model].label}</div>
                  <div className={`text-xs mt-0.5 ${values.agentModel === model ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                    {AGENT_MODELS[model].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Permission Mode */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Permission Mode
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AGENT_PERMISSION_MODES) as AgentPermissionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange('agentPermissionMode', values.agentPermissionMode === mode ? '' : mode)}
                  title={AGENT_PERMISSION_MODES[mode].description}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    values.agentPermissionMode === mode
                      ? 'bg-[var(--accent-purple)] text-white'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
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
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Skills to Load
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Agent에 자동으로 로드할 스킬 이름을 쉼표로 구분하여 입력하세요.
            </p>
            <input
              type="text"
              value={values.agentSkills}
              onChange={(e) => onChange('agentSkills', e.target.value)}
              placeholder="예: pdf-processing, git-workflow"
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors"
            />
          </div>
        </>
      )}

      {/* Command-specific fields */}
      {fields.showCommandFields && (
        <>
          {/* Argument Hint */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Argument Hint
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              자동완성에서 보여줄 인자 힌트입니다. 예: [message], [file] [options]
            </p>
            <input
              type="text"
              value={values.commandArgumentHint}
              onChange={(e) => onChange('commandArgumentHint', e.target.value)}
              placeholder="예: [message]"
              className="w-full max-w-md px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors"
            />
          </div>

          {/* Disable Model Invocation */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={values.commandDisableModelInvocation}
                onChange={(e) => onChange('commandDisableModelInvocation', e.target.checked)}
                className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--accent-cyan)] focus:ring-[var(--accent-cyan)] cursor-pointer"
              />
              <div>
                <span className="text-sm text-[var(--text-primary)]">
                  Disable Model Invocation
                </span>
                <p className="text-xs text-[var(--text-muted)]">
                  체크하면 SlashCommand 도구가 이 커맨드를 자동으로 호출하지 않습니다.
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
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Hook Event *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(HOOK_EVENTS) as HookEvent[]).map((event) => (
                <button
                  key={event}
                  type="button"
                  onClick={() => onChange('hookEvent', values.hookEvent === event ? '' : event)}
                  className={`px-4 py-3 rounded-lg text-left transition-all ${
                    values.hookEvent === event
                      ? 'bg-[var(--accent-cyan)] text-black'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="text-sm font-medium">{HOOK_EVENTS[event].label}</div>
                  <div className={`text-xs mt-0.5 line-clamp-2 ${values.hookEvent === event ? 'text-black/70' : 'text-[var(--text-muted)]'}`}>
                    {HOOK_EVENTS[event].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Hook Matcher */}
          {values.hookEvent && HOOK_EVENTS[values.hookEvent as HookEvent]?.matchers.length > 0 && (
            <div>
              <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Matcher
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {HOOK_EVENTS[values.hookEvent as HookEvent].matchers.map((matcher) => (
                  <button
                    key={matcher}
                    type="button"
                    onClick={() => onChange('hookMatcher', values.hookMatcher === matcher ? '' : matcher)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      values.hookMatcher === matcher
                        ? 'bg-[var(--accent-purple)] text-white'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {matcher}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={values.hookMatcher}
                onChange={(e) => onChange('hookMatcher', e.target.value)}
                placeholder="또는 커스텀 matcher 입력..."
                className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors"
              />
            </div>
          )}

          {/* Hook Command */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
              Command *
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Hook 실행 시 호출할 셸 명령어를 입력하세요.
            </p>
            <textarea
              value={values.hookCommand}
              onChange={(e) => onChange('hookCommand', e.target.value)}
              placeholder="예: cp $transcript_path ~/backups/transcript-$(date +%s).jsonl"
              className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors resize-none"
              rows={3}
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">
              사용 가능한 변수: <code className="text-[var(--accent-cyan)]">$session_id</code>, <code className="text-[var(--accent-cyan)]">$transcript_path</code>, <code className="text-[var(--accent-cyan)]">$hook_event_name</code>
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
              placeholder="기본값: 60000 (60초)"
              min={0}
              className="w-full max-w-xs px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
            />
          </div>

          {/* Hook Blocking */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={values.hookBlocking}
                onChange={(e) => onChange('hookBlocking', e.target.checked)}
                className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--accent-cyan)] focus:ring-[var(--accent-cyan)] cursor-pointer"
              />
              <div>
                <span className="text-sm text-[var(--text-primary)]">
                  Blocking
                </span>
                <p className="text-xs text-[var(--text-muted)]">
                  체크하면 Hook이 완료될 때까지 Claude Code가 대기합니다.
                </p>
              </div>
            </label>
          </div>

          {/* Preview */}
          {values.hookEvent && values.hookCommand && (
            <div className="p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
              <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
                설정 미리보기
              </div>
              <pre className="text-xs font-mono text-[var(--accent-cyan)] overflow-x-auto">
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
