import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentIncidentPanel } from '../../components/ax/panels/AgentIncidentPanel'
import type { IncidentCase, IncidentReviewData } from '../../../../packages/lib/src/features/ax/incident-review'
const candidate: IncidentCase = {id:'case',revision:1,state:'confirmed',agentId:'example',source:'codex',phase:'execution',evidence:'process',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',lastFailureAt:'2026-01-01T00:00:00Z',lastFailureIds:['event'],failureCount:1,examples:[],history:[]}
const data: IncidentReviewData = {cases:[candidate],evaluations:{},start:'2026-01-01T00:00:00Z',end:'2026-01-05T00:00:00Z',sourceAvailable:true,truncated:false,storageReady:true}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('incident review form',()=>{
  it('requires evidence, submits the actual date input and preserves a failed form',async()=>{
    const fetch = vi.fn().mockResolvedValue(Response.json({message:'다른 검토자가 변경했습니다'},{status:409})); vi.stubGlobal('fetch',fetch)
    render(<AgentIncidentPanel data={data} days={7}/>)
    fireEvent.click(screen.getByRole('button',{name:/example · 실행 사고 확정/}))
    fireEvent.click(screen.getByRole('button',{name:'수정 기록 저장'})); expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('판정 이유'),{target:{value:'실패 재현과 수정'}})
    fireEvent.change(screen.getByLabelText('근거 링크 또는 기록 위치'),{target:{value:'private:receipt'}})
    fireEvent.change(screen.getByLabelText('수정 적용 시각'),{target:{value:'2026-01-03T12:00'}})
    fireEvent.change(screen.getByLabelText('변경 참조'),{target:{value:'commit:test'}})
    fireEvent.change(screen.getByLabelText('롤백 참조'),{target:{value:'private:rollback'}})
    fireEvent.click(screen.getByRole('button',{name:'수정 기록 저장'}))
    await waitFor(()=>expect(screen.getByText('다른 검토자가 변경했습니다')).toBeTruthy())
    const payload=JSON.parse(fetch.mock.calls[0][1].body)
    expect(payload.appliedAt).toBe(new Date('2026-01-03T12:00').toISOString()); expect(payload.revision).toBe(1)
    expect(screen.getByLabelText('판정 이유')).toHaveValue('실패 재현과 수정')
  })
  it('shows the accepted retest window even after a newer refresh',()=>{
    const accepted={start:'2026-01-03T00:00:00Z',end:'2026-01-04T00:00:00Z',failed:0,terminal:10,unresolved:0,complete:true}
    render(<AgentIncidentPanel data={{...data,cases:[{...candidate,state:'verified',verification:{stats:accepted,minimumSamples:10}}],evaluations:{case:{...accepted,terminal:20}}}} days={7}/>)
    fireEvent.change(screen.getByLabelText('문제 상태'),{target:{value:'all'}})
    fireEvent.click(screen.getByRole('button',{name:/example · 실행 재검증 완료/}))
    expect(screen.getByText('수정 후 실패 0/10회 · 미종료 0회')).toBeTruthy()
  })
})
