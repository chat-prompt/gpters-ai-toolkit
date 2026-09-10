// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { IncidentHistoryPanel } from '../../components/ax/panels/IncidentHistoryPanel'

const item = { id: 'report_' + 'a'.repeat(32), title: 'Example issue', agentId: 'example', source: 'codex', state: 'needs-info', updatedAt: '2026-01-01T00:00:00.123456Z', revision: 2, pendingReview: false, kind: 'report' }
const page = (nextCursor: string | null = null) => ({ items: [item], nextCursor, pageSize: 50 })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('saved incident history view', () => {
  it('submits dotted and namespaced agent filters', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(page()))
    vi.stubGlobal('fetch', fetch)
    render(<IncidentHistoryPanel/>)
    await screen.findByRole('link', { name: /Example issue/ })
    fireEvent.change(screen.getByLabelText('에이전트 ID'), { target: { value: 'example.agent:worker-1' } })
    fireEvent.click(screen.getByRole('button', { name: /^조회$/ }))
    await waitFor(() => expect(fetch.mock.calls[1][0]).toBe('/api/ax/incident-history?agent=example.agent%3Aworker-1'))
  })
  it('pages with opaque cursor and resets filters to the first page', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(page('cursor-one'))).mockResolvedValueOnce(Response.json(page())).mockResolvedValue(Response.json({ items: [], nextCursor: null, pageSize: 50 }))
    vi.stubGlobal('fetch', fetch)
    render(<IncidentHistoryPanel/>)
    expect(await screen.findByRole('link', { name: /Example issue/ })).toHaveAttribute('href', `?panel=agent-incidents&incident=${item.id}`)
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(fetch.mock.calls[1][0]).toContain('cursor=cursor-one'))
    await screen.findByText('2 페이지')
    fireEvent.change(screen.getByLabelText('소스'), { target: { value: 'codex' } })
    await screen.findByText('조건에 맞는 저장된 기록이 없습니다.')
    expect(fetch.mock.calls[2][0]).toBe('/api/ax/incident-history?source=codex')
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  })
  it('shows an actionable error without raw server details and retries', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ message: 'private secret' }, { status: 500 })).mockResolvedValueOnce(Response.json(page()))
    vi.stubGlobal('fetch', fetch)
    render(<IncidentHistoryPanel/>)
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private secret')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('link', { name: /Example issue/ })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
