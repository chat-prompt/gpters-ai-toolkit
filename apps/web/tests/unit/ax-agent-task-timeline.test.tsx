// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AgentTaskTimeline } from '../../components/ax/panels/AgentTaskTimeline'
const trace={taskId:'11111111-1111-4111-8111-111111111111',agentId:'test-agent',source:'codex',versions:['0.7.14'],startedAt:'2026-08-26T01:00:00Z',updatedAt:'2026-08-26T01:00:01Z',tokens:null,events:[{taskId:'11111111-1111-4111-8111-111111111111',eventId:'22222222-2222-4222-8222-222222222222',attemptId:'33333333-3333-4333-8333-333333333333',phase:'search' as const,status:'succeeded' as const,evidence:'api' as const,atUtc:'2026-08-26T01:00:01Z'}]}
afterEach(cleanup)
it('shows missing verification and delivery as unknown even when API succeeded',()=>{
 render(<AgentTaskTimeline traces={[trace]} agentId="all" />)
 expect(screen.getByText('검증 미확인')).toBeTruthy()
 expect(screen.getByText('전달 미확인')).toBeTruthy()
 expect(screen.getByText('API 응답')).toBeTruthy()
 fireEvent.click(screen.getByLabelText('실패 포함 작업만'))
 expect(screen.getByText('실패가 기록된 작업이 없습니다.')).toBeTruthy()
})
it('scopes tasks to the selected agent',()=>{
 render(<AgentTaskTimeline traces={[trace]} agentId="other-agent" />)
 expect(screen.getByText(/아직 연결된 작업 기록/)).toBeTruthy()
 expect(screen.queryByText(/11111111 ·/)).toBeNull()
})
