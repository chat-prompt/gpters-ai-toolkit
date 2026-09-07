import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VercelProjectsPanel } from '../../components/ax/panels/VercelProjectsPanel'
import type { AxVercelData } from '../../../../packages/lib/src/features/ax/types'

const data: AxVercelData = {
  team: null,
  projects: Array.from({ length: 26 }, (_, index) => ({
    id: String(index),
    name: `site-${index + 1}`,
    framework: 'nextjs',
    productionUrl: `site-${index + 1}.example.com`,
    lastDeployedAt: '2026-09-07T00:00:00Z',
    lastDeploymentState: index === 0 ? 'CANCELED' : 'READY',
  })),
}

beforeEach(() => vi.stubGlobal('innerHeight', 424))
afterEach(() => vi.unstubAllGlobals())

describe('배포 사이트 표', () => {
  it('색상 점의 의미를 보조 기술과 키보드 사용자에게 제공한다', () => {
    render(<VercelProjectsPanel data={data} days={7} />)
    const canceled = screen.getByRole('img', { name: '배포 상태: 취소됨' })
    expect(canceled.getAttribute('tabindex')).toBe('0')
    expect(screen.getAllByRole('img', { name: '배포 상태: 정상' })).toHaveLength(4)
  })

  it('마지막 장에서도 표 높이를 유지하고 페이지 이동 시 목록 스크롤을 처음으로 돌린다', () => {
    render(<VercelProjectsPanel data={data} days={7} />)
    const list = screen.getByRole('region', { name: '배포 사이트 목록' })
    const height = list.style.height
    list.scrollTop = 500
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(screen.getByText('site-26')).toBeTruthy()
    expect(screen.queryByText('site-1')).toBeNull()
    expect(list.scrollTop).toBe(0)
    expect(list.style.height).toBe(height)
    expect((screen.getByRole('button', { name: '다음 페이지' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }))
    expect(screen.getByText('site-21')).toBeTruthy()
  })

  it('창 높이가 바뀌면 행 수를 조절하면서 보던 첫 항목을 포함한다', () => {
    render(<VercelProjectsPanel data={data} days={7} />)
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
    expect(screen.getByText('site-6')).toBeTruthy()
    vi.stubGlobal('innerHeight', 592)
    fireEvent(window, new Event('resize'))
    expect(screen.getAllByRole('row')).toHaveLength(9)
    expect(screen.getByText('site-6')).toBeTruthy()
    expect(screen.getByText('1–8 / 26')).toBeTruthy()
  })

  it('확인 우선순위별로 묶고 각 단계 안에서는 최근 배포부터 보여준다', () => {
    vi.stubGlobal('innerHeight', 900)
    const states = ['READY', 'CANCELED', 'ERROR', null, 'BUILDING', 'BLOCKED', 'ERROR', 'READY']
    const projects = states.map((state, index) => ({
      ...data.projects[index], lastDeploymentState: state,
      lastDeployedAt: `2026-09-0${index + 1}T00:00:00Z`,
    }))
    render(<VercelProjectsPanel data={{ team: null, projects }} days={7} />)
    const names = screen.getAllByRole('row').slice(1).map((row) => row.querySelector('[title]')?.getAttribute('title'))
    expect(names).toEqual(['site-7', 'site-6', 'site-3', 'site-4', 'site-2', 'site-5', 'site-8', 'site-1'])
    expect(projects[0].name).toBe('site-1')
  })
})
