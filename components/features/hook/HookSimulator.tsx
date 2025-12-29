'use client'

import { useState, useMemo, useCallback } from 'react'
import { CopyButton } from '../../ui/CopyButton'
import type { HookEvent } from '@/lib/core/types'
import { HOOK_EVENTS } from '@/lib/core/types'
import {
  simulateHookEvent,
  generateSampleEnvironment,
  testHookScenarios,
  generateSimulationReport,
  type HookSimulationInput,
  type HookSimulationResult,
  type SimulatedEnvironment,
} from '@/lib/plugin/hook-simulator'

type SimulationMode = 'single' | 'scenarios'

interface EnvironmentVariable {
  key: string
  value: string
}

export function HookSimulator() {
  const [event, setEvent] = useState<HookEvent>('PreToolUse')
  const [command, setCommand] = useState('')
  const [timeout, setTimeout] = useState(30000)
  const [mode, setMode] = useState<SimulationMode>('single')
  const [customEnvVars, setCustomEnvVars] = useState<EnvironmentVariable[]>([])
  const [result, setResult] = useState<HookSimulationResult | null>(null)
  const [scenarioResults, setScenarioResults] = useState<{
    scenarios: Array<{ name: string; result: HookSimulationResult }>
    summary: { total: number; passed: number; failed: number; blocked: number; allowed: number }
  } | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const hookEvents = Object.keys(HOOK_EVENTS) as HookEvent[]

  // Get sample environment for the current event
  const sampleEnv = useMemo(() => {
    return generateSampleEnvironment(event)
  }, [event])

  // Build environment object from sample + custom vars
  const buildEnvironment = useCallback((): Partial<SimulatedEnvironment> => {
    const env: Record<string, string> = {}

    // Add custom environment variables
    for (const { key, value } of customEnvVars) {
      if (key.trim()) {
        env[key.trim()] = value
      }
    }

    return env
  }, [customEnvVars])

  // Run simulation
  const handleSimulate = useCallback(() => {
    if (!command.trim()) return

    setIsRunning(true)
    setResult(null)
    setScenarioResults(null)

    try {
      const input: HookSimulationInput = {
        event,
        command,
        timeout,
        environment: buildEnvironment(),
      }

      if (mode === 'scenarios') {
        const scenarios = testHookScenarios(input)
        setScenarioResults(scenarios)
      } else {
        const simResult = simulateHookEvent(input)
        setResult(simResult)
      }
    } finally {
      setIsRunning(false)
    }
  }, [event, command, timeout, mode, buildEnvironment])

  // Add new environment variable row
  const addEnvVar = useCallback(() => {
    setCustomEnvVars((prev) => [...prev, { key: '', value: '' }])
  }, [])

  // Remove environment variable row
  const removeEnvVar = useCallback((index: number) => {
    setCustomEnvVars((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Update environment variable
  const updateEnvVar = useCallback((index: number, field: 'key' | 'value', value: string) => {
    setCustomEnvVars((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    )
  }, [])

  // Load sample environment as custom vars
  const loadSampleEnv = useCallback(() => {
    const vars: EnvironmentVariable[] = Object.entries(sampleEnv)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, value: value as string }))
    setCustomEnvVars(vars)
  }, [sampleEnv])

  // Generate report for current result
  const reportMarkdown = useMemo(() => {
    if (result) {
      return generateSimulationReport(result)
    }
    return ''
  }, [result])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass rounded-2xl p-6 glow-purple">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🧪</span>
          <h2 className="text-xl font-medium text-[var(--text-primary)]">Hook 시뮬레이터</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Hook 동작을 미리 테스트해 보세요. 실제 명령어를 실행하지 않고 환경 변수 확장, 명령어 분석, 예상 동작을 확인할 수 있습니다.
        </p>
      </div>

      {/* Configuration Form */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-6">시뮬레이션 설정</h3>

        <div className="space-y-6">
          {/* Event Type Selection */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Hook 이벤트
            </label>
            <select
              value={event}
              onChange={(e) => setEvent(e.target.value as HookEvent)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)] transition-colors"
            >
              {hookEvents.map((evt) => (
                <option key={evt} value={evt}>
                  {HOOK_EVENTS[evt].label} ({evt})
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {HOOK_EVENTS[event].description}
            </p>
          </div>

          {/* Command Input */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              실행 명령어
            </label>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="예: echo $CLAUDE_TOOL_NAME >> /tmp/hooks.log"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--accent-purple)] transition-colors resize-none"
            />
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              환경변수를 사용하면 시뮬레이션에서 확장된 결과를 볼 수 있습니다.
            </p>
          </div>

          {/* Timeout Input */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              타임아웃 (ms)
            </label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              step={1000}
              className="w-full px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-purple)] transition-colors"
            />
          </div>

          {/* Simulation Mode */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              시뮬레이션 모드
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                  mode === 'single'
                    ? 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border-[var(--accent-purple)]/30'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                단일 실행
              </button>
              <button
                type="button"
                onClick={() => setMode('scenarios')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                  mode === 'scenarios'
                    ? 'bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border-[var(--accent-purple)]/30'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                시나리오 테스트
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {mode === 'single'
                ? '현재 설정으로 한 번 시뮬레이션합니다.'
                : '다양한 시나리오(일반 실행, 타임아웃, 누락된 환경변수 등)를 테스트합니다.'}
            </p>
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider">
                환경 변수
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadSampleEnv}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  샘플 로드
                </button>
                <button
                  type="button"
                  onClick={addEnvVar}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] hover:bg-[var(--accent-purple)]/20 transition-colors"
                >
                  + 추가
                </button>
              </div>
            </div>

            {customEnvVars.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] italic">
                환경 변수가 없습니다. 샘플을 로드하거나 직접 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {customEnvVars.map((envVar, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={envVar.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                      placeholder="KEY"
                      className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--accent-purple)] transition-colors"
                    />
                    <input
                      type="text"
                      value={envVar.value}
                      onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                      placeholder="value"
                      className="flex-2 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--accent-purple)] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(index)}
                      className="px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Available env vars for this event */}
            <div className="mt-4 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-muted)] mb-2">
                <strong className="text-[var(--text-primary)]">{event}</strong> 이벤트에서 사용 가능한 환경 변수:
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.keys(sampleEnv).map((key) => (
                  <code
                    key={key}
                    className="px-1.5 py-0.5 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]"
                  >
                    ${key}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Simulate Button */}
        <div className="mt-8">
          <button
            onClick={handleSimulate}
            disabled={!command.trim() || isRunning}
            className="w-full px-6 py-3 rounded-xl bg-[var(--accent-purple)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? '시뮬레이션 중...' : mode === 'scenarios' ? '시나리오 테스트 실행' : '시뮬레이션 실행'}
          </button>
        </div>
      </div>

      {/* Single Simulation Result */}
      {result && mode === 'single' && (
        <div className={`glass rounded-2xl p-6 ${result.success ? 'glow-cyan' : 'border-red-500/30'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">{result.success ? '✅' : '❌'}</span>
              <h3 className="text-lg font-medium text-[var(--text-primary)]">시뮬레이션 결과</h3>
            </div>
            <CopyButton text={reportMarkdown} />
          </div>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]">
                <p className="text-xs text-[var(--text-muted)] mb-1">이벤트</p>
                <p className="font-mono text-sm text-[var(--text-primary)]">{result.event}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]">
                <p className="text-xs text-[var(--text-muted)] mb-1">상태</p>
                <p className={`font-medium text-sm ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                  {result.success ? '성공' : '실패'}
                </p>
              </div>
            </div>

            {/* Expanded Command */}
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)]">
              <p className="text-xs text-[var(--text-muted)] mb-2">확장된 명령어</p>
              <pre className="font-mono text-sm text-[var(--accent-cyan)] whitespace-pre-wrap break-all">
                {result.expandedCommand}
              </pre>
            </div>

            {/* Validation Issues */}
            {result.issues.length > 0 && (
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]">
                <p className="text-xs text-[var(--text-muted)] mb-2">검증 결과</p>
                <ul className="space-y-1">
                  {result.issues.map((issue, i) => (
                    <li key={i} className={`text-sm flex items-start gap-2 ${issue.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                      <span>{issue.severity === 'error' ? '❌' : '⚠️'}</span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Behavior Prediction */}
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)]">
              <p className="text-xs text-[var(--text-muted)] mb-2">예상 동작</p>
              <p className="text-sm text-[var(--text-primary)]">{result.behavior.reason}</p>
              {result.behavior.wouldBlock && (
                <p className="mt-2 text-sm text-yellow-400 flex items-center gap-2">
                  <span>⏳</span>
                  이 Hook은 Claude 실행을 차단합니다.
                </p>
              )}
              {result.behavior.wouldAllow && (
                <p className="mt-2 text-sm text-green-400 flex items-center gap-2">
                  <span>✅</span>
                  이 Hook은 Claude 실행을 허용합니다.
                </p>
              )}
            </div>

            {/* Execution Info */}
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)]">
              <p className="text-xs text-[var(--text-muted)] mb-2">실행 정보</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">종료 코드</p>
                  <p className={`text-sm font-mono ${result.execution.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {result.execution.exitCode}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">실행 시간</p>
                  <p className="text-sm text-[var(--text-primary)]">
                    {result.execution.duration}ms
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">타임아웃</p>
                  <p className="text-sm text-[var(--text-primary)]">
                    {result.execution.timedOut ? '예' : '아니오'}
                  </p>
                </div>
              </div>
              {result.execution.stdout && (
                <div className="mt-2">
                  <p className="text-xs text-[var(--text-muted)] mb-1">표준 출력</p>
                  <pre className="p-2 rounded text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] overflow-x-auto">
                    {result.execution.stdout}
                  </pre>
                </div>
              )}
              {result.execution.stderr && (
                <div className="mt-2">
                  <p className="text-xs text-[var(--text-muted)] mb-1">표준 에러</p>
                  <pre className="p-2 rounded text-xs bg-[var(--bg-tertiary)] text-red-400 overflow-x-auto">
                    {result.execution.stderr}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scenario Test Results */}
      {scenarioResults && mode === 'scenarios' && (
        <div className="glass rounded-2xl p-6 glow-cyan">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">📊</span>
              <h3 className="text-lg font-medium text-[var(--text-primary)]">시나리오 테스트 결과</h3>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {scenarioResults.summary.total}
              </p>
              <p className="text-xs text-[var(--text-muted)]">전체</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] text-center">
              <p className="text-2xl font-bold text-green-400">
                {scenarioResults.summary.passed}
              </p>
              <p className="text-xs text-[var(--text-muted)]">성공</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-secondary)] text-center">
              <p className="text-2xl font-bold text-red-400">
                {scenarioResults.summary.failed}
              </p>
              <p className="text-xs text-[var(--text-muted)]">실패</p>
            </div>
          </div>

          {/* Individual Scenarios */}
          <div className="space-y-3">
            {scenarioResults.scenarios.map((scenario, i) => (
              <details key={i} className="group">
                <summary className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer ${
                  scenario.result.success ? 'bg-green-500/10' : 'bg-red-500/10'
                } hover:opacity-80 transition-opacity`}>
                  <span>{scenario.result.success ? '✅' : '❌'}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{scenario.name}</p>
                  </div>
                  <span className="text-[var(--text-muted)] group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-2 ml-8 p-3 rounded-xl bg-[var(--bg-secondary)]">
                  <p className="text-xs text-[var(--text-muted)] mb-1">확장된 명령어</p>
                  <pre className="font-mono text-sm text-[var(--accent-cyan)] whitespace-pre-wrap break-all">
                    {scenario.result.expandedCommand}
                  </pre>
                  {scenario.result.issues.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-[var(--text-muted)] mb-1">이슈</p>
                      <ul className="space-y-1">
                        {scenario.result.issues.map((issue, j) => (
                          <li key={j} className={`text-xs ${issue.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}`}>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
