'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

export interface TocItem {
  id: string
  label: string
  icon?: string
}

interface TableOfContentsProps {
  items: TocItem[]
}

// Calculate initial active ID based on scroll position
function getInitialActiveId(items: TocItem[]): string {
  if (typeof window === 'undefined' || items.length === 0) {
    return items[0]?.id || ''
  }

  const scrollPosition = window.scrollY + 120

  for (let i = items.length - 1; i >= 0; i--) {
    const element = document.getElementById(items[i].id)
    if (element && element.offsetTop <= scrollPosition) {
      return items[i].id
    }
  }

  return items[0]?.id || ''
}

export function TableOfContents({ items }: TableOfContentsProps) {
  // Initialize with first item, will update on mount
  const initialId = useMemo(() => items[0]?.id || '', [items])
  const [activeId, setActiveId] = useState<string>(initialId)

  const handleScroll = useCallback(() => {
    const scrollPosition = window.scrollY + 120 // offset for header

    for (let i = items.length - 1; i >= 0; i--) {
      const element = document.getElementById(items[i].id)
      if (element && element.offsetTop <= scrollPosition) {
        setActiveId(items[i].id)
        return
      }
    }

    if (items.length > 0) {
      setActiveId(items[0].id)
    }
  }, [items])

  // Set initial active ID after mount
  useEffect(() => {
    setActiveId(getInitialActiveId(items))
  }, [items])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      })
    }
  }

  if (items.length === 0) return null

  return (
    <nav className="hidden xl:block fixed right-8 top-32 w-48 z-20">
      <div className="glass rounded-xl p-4">
        <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
          목차
        </h3>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => scrollToSection(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                  activeId === item.id
                    ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                }`}
              >
                {item.icon && <span className="text-xs">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

/**
 * Section wrapper component that adds an ID for TOC navigation
 */
interface SectionProps {
  id: string
  children: React.ReactNode
  className?: string
}

export function Section({ id, children, className = '' }: SectionProps) {
  return (
    <section id={id} className={`scroll-mt-24 ${className}`}>
      {children}
    </section>
  )
}
