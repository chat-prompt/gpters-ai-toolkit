import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HookConfigGenerator } from '@/components/features/hook/HookConfigGenerator'

// Mock next-intl to return Korean translation strings used by HookConfigGenerator
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      'title': 'Hook 설정 JSON 생성기',
      'subtitle': 'Claude Code settings.json에 추가할 Hook 설정을 쉽게 생성할 수 있습니다.',
      'sectionTitle': '설정',
      'eventLabel': 'Hook 이벤트',
      'matcherLabel': 'Matcher',
      'matcherPlaceholder': '도구 이름을 입력하거나 선택하세요',
      'matcherHintTool': '특정 도구에만 Hook을 적용하려면 도구 이름을 입력하세요. 여러 도구 타입은 여러 Hook을 추가해야 합니다.',
      'matcherHintPreCompact': 'auto: 자동 Compaction, manual: 수동 Compaction (/compact 명령)',
      'matcherHintSessionStart': 'startup: 새 세션, resume: 기존 세션 재개, clear: /clear 후, compact: /compact 후',
      'commandLabel': '실행 명령어',
      'commandPlaceholder': '예: /path/to/script.sh $CLAUDE_SESSION_ID',
      'commandHint': '환경변수: $CLAUDE_SESSION_ID, $CLAUDE_PROJECT_DIR 등을 사용할 수 있습니다.',
      'timeoutLabel': '타임아웃 (ms)',
      'timeoutHint': '명령어 실행 제한 시간. 기본값은 30000ms (30초)입니다.',
      'blockingLabel': 'Blocking',
      'blockingHint': '체크 시 Hook 완료까지 Claude가 대기합니다. 해제 시 비동기로 실행됩니다.',
      'generateButton': 'JSON 생성',
      'resultTitle': '생성된 JSON',
      'copiedLabel': '복사됨!',
      'installTitle': '설치 방법:',
      'installStep1': '파일을 엽니다',
      'installStep2Before': '기존',
      'installStep2After': '객체에 위 설정을 병합하거나, 없으면 새로 추가합니다',
      'installStep3Before': 'Claude Code를 재시작하거나',
      'installStep3After': '로 확인합니다',
      'errorCommand': '실행할 명령어를 입력하세요',
      'errorMatcher': 'Matcher를 선택하거나 입력하세요',
    }
    const value = messages[key] ?? key
    if (params) {
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        value
      )
    }
    return value
  },
}))

// Mock clipboard API
const mockWriteText = vi.fn().mockResolvedValue(undefined)

describe('HookConfigGenerator', () => {
  beforeEach(() => {
    mockWriteText.mockClear()
    // Mock clipboard in a way that works with happy-dom
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
      },
      writable: true,
      configurable: true,
    })
  })

  it('renders the component with default state', () => {
    render(<HookConfigGenerator />)

    // Check header is present
    expect(screen.getByText('Hook 설정 JSON 생성기')).toBeInTheDocument()

    // Check form fields are present
    expect(screen.getByText('Hook 이벤트')).toBeInTheDocument()
    expect(screen.getByText('실행 명령어')).toBeInTheDocument()
    expect(screen.getByText('타임아웃 (ms)')).toBeInTheDocument()
    expect(screen.getByText('Blocking')).toBeInTheDocument()

    // Check generate button is present
    expect(screen.getByRole('button', { name: 'JSON 생성' })).toBeInTheDocument()
  })

  it('shows PreCompact matchers by default', () => {
    render(<HookConfigGenerator />)

    // PreCompact event should show auto and manual matchers
    expect(screen.getByRole('button', { name: 'auto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'manual' })).toBeInTheDocument()
  })

  it('generates correct JSON for PreCompact event', () => {
    render(<HookConfigGenerator />)

    // Fill in the command
    const commandInput = screen.getByPlaceholderText(/예: \/path\/to\/script.sh/)
    fireEvent.change(commandInput, { target: { value: 'echo "compacting"' } })

    // Check generated JSON contains the command
    const preElement = document.querySelector('pre')
    expect(preElement).toBeInTheDocument()
    expect(preElement?.textContent).toContain('"command": "echo \\"compacting\\""')
    expect(preElement?.textContent).toContain('"PreCompact"')
  })

  it('updates matcher options when event type changes', async () => {
    render(<HookConfigGenerator />)

    // Change event type to SessionStart
    const eventSelect = screen.getByRole('combobox')
    fireEvent.change(eventSelect, { target: { value: 'SessionStart' } })

    // SessionStart should show startup, resume, clear, compact matchers
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'startup' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'resume' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'clear' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'compact' })).toBeInTheDocument()
    })
  })

  it('shows text input for tool-based events', async () => {
    render(<HookConfigGenerator />)

    // Change event type to PreToolUse
    const eventSelect = screen.getByRole('combobox')
    fireEvent.change(eventSelect, { target: { value: 'PreToolUse' } })

    // Should show text input for tool name instead of buttons
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/도구 이름을 입력하거나 선택하세요/)).toBeInTheDocument()
    })
  })

  it('validates command input before generating', async () => {
    render(<HookConfigGenerator />)

    // Click generate without entering command
    const generateButton = screen.getByRole('button', { name: 'JSON 생성' })
    fireEvent.click(generateButton)

    // Should show validation error
    await waitFor(() => {
      expect(screen.getByText('실행할 명령어를 입력하세요')).toBeInTheDocument()
    })
  })

  it('clears validation error when command is entered', async () => {
    render(<HookConfigGenerator />)

    // Click generate without entering command
    const generateButton = screen.getByRole('button', { name: 'JSON 생성' })
    fireEvent.click(generateButton)

    // Error should be visible
    await waitFor(() => {
      expect(screen.getByText('실행할 명령어를 입력하세요')).toBeInTheDocument()
    })

    // Enter command
    const commandInput = screen.getByPlaceholderText(/예: \/path\/to\/script.sh/)
    fireEvent.change(commandInput, { target: { value: 'test command' } })

    // Error should be cleared
    await waitFor(() => {
      expect(screen.queryByText('실행할 명령어를 입력하세요')).not.toBeInTheDocument()
    })
  })

  it('updates timeout value correctly', () => {
    render(<HookConfigGenerator />)

    // Find and change timeout input
    const timeoutInput = screen.getByDisplayValue('30000')
    fireEvent.change(timeoutInput, { target: { value: '60000' } })

    // Verify the value changed
    expect(timeoutInput).toHaveValue(60000)
  })

  it('toggles blocking checkbox', () => {
    render(<HookConfigGenerator />)

    // Find blocking checkbox (should be checked by default)
    const blockingCheckbox = screen.getByRole('checkbox')
    expect(blockingCheckbox).toBeChecked()

    // Click to uncheck
    fireEvent.click(blockingCheckbox)
    expect(blockingCheckbox).not.toBeChecked()
  })

  it('copies JSON to clipboard when copy button is clicked', async () => {
    render(<HookConfigGenerator />)

    // Fill in command
    const commandInput = screen.getByPlaceholderText(/예: \/path\/to\/script.sh/)
    fireEvent.change(commandInput, { target: { value: 'test-command' } })

    // Find and click copy button
    const copyButton = screen.getByRole('button', { name: /Copy/i })
    fireEvent.click(copyButton)

    // Verify clipboard was called
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledTimes(1)
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('"command": "test-command"'))
    })
  })

  it('shows correct JSON structure for events without matchers', async () => {
    render(<HookConfigGenerator />)

    // Change to Stop event (no matchers)
    const eventSelect = screen.getByRole('combobox')
    fireEvent.change(eventSelect, { target: { value: 'Stop' } })

    // Fill command
    const commandInput = screen.getByPlaceholderText(/예: \/path\/to\/script.sh/)
    fireEvent.change(commandInput, { target: { value: 'cleanup.sh' } })

    // The JSON should not have matcher key at the top level
    await waitFor(() => {
      // Find the pre element with the JSON
      const preElement = document.querySelector('pre')
      expect(preElement?.textContent).not.toContain('"matcher"')
    })
  })

  it('generates JSON with all configured options', () => {
    render(<HookConfigGenerator />)

    // Configure all options
    const commandInput = screen.getByPlaceholderText(/예: \/path\/to\/script.sh/)
    fireEvent.change(commandInput, { target: { value: '/usr/local/bin/backup.sh' } })

    const timeoutInput = screen.getByDisplayValue('30000')
    fireEvent.change(timeoutInput, { target: { value: '45000' } })

    const blockingCheckbox = screen.getByRole('checkbox')
    fireEvent.click(blockingCheckbox) // Uncheck

    // Verify JSON contains all configured values
    const preElement = document.querySelector('pre')
    const jsonContent = preElement?.textContent || ''

    expect(jsonContent).toContain('"command": "/usr/local/bin/backup.sh"')
    expect(jsonContent).toContain('"timeout": 45000')
    expect(jsonContent).toContain('"blocking": false')
  })
})
