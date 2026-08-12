import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  usePathname: () => '/',
  useRouter: () => ({ replace: replaceMock }),
}))

import { SearchableCatalog } from '@/components/catalog/SearchableCatalog'

describe('SearchableCatalog layering', () => {
  it('keeps the search controls above later animated sections', () => {
    render(<SearchableCatalog catalog={[]} />)

    const searchInput = screen.getByPlaceholderText('Search skills, agents, commands...')
    const searchControls = searchInput.parentElement?.parentElement

    expect(searchControls?.classList.contains('relative')).toBe(true)
    expect(searchControls?.classList.contains('z-10')).toBe(true)
  })
})
