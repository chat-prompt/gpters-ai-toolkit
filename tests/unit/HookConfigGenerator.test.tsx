import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HookConfigGenerator } from '@/components/HookConfigGenerator'

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
