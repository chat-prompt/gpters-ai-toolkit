/**
 * 마켓플레이스 mod 카드
 *
 * mod 는 상세 페이지가 없어서 카드 안에 설치 명령을 바로 두고,
 * 제목은 README 가 있는 GitHub 폴더로 연결한다.
 */
import { memo } from 'react'
import { CopyButton } from '@/components/ui/CopyButton'
import type { ModSummary } from '@/lib/core/mods'

/**
 * mod 카드
 *
 * @param mod - 카드로 그릴 mod
 *
 * @example
 * ```tsx
 * <ModCard mod={mods[0]} />
 * ```
 */
export const ModCard = memo(function ModCard({ mod }: { mod: ModSummary }) {
  return (
    <article className="reveal h-full flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          Mod
        </span>
        {mod.category && (
          <span className="text-[11px] text-[var(--text-muted)]">{mod.category}</span>
        )}
      </div>

      <h3 className="text-[15px] font-medium leading-snug tracking-tight text-[var(--text-primary)]">
        <a
          href={mod.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--brand-primary)] transition-colors"
        >
          {mod.name}
        </a>
      </h3>

      <p className="mt-1.5 mb-4 flex-grow text-[13px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
        {mod.description}
      </p>

      {/* 설치 명령 — 길어서 한 줄로 자르고 복사 버튼으로 통째 가져가게 한다 */}
      <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-muted)]" title={mod.installCommand}>
          claude plugin install {mod.name}
        </code>
        <CopyButton text={mod.installCommand} />
      </div>
    </article>
  )
})
