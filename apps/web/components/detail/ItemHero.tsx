/**
 * 상세 페이지 머리글
 *
 * 종류 라벨 → 제목 → 설명 → 태그 → 메타 스트립 순으로 위계를 세운다.
 * 작성자·버전·갱신일처럼 부수적인 값은 맨 아래 한 줄로 몰아 두어,
 * 제목과 설명이 먼저 읽히게 한다.
 */
import { TAGS, DIFFICULTY_LABELS } from '@/lib/core/types'
import { StatusBadge } from '../ui/StatusBadge'
import { VersionPopover } from '../ui/VersionPopover'
import { Fragment, ReactNode } from 'react'

/** Supported catalog item types */
export type ItemType = 'skill' | 'agent' | 'command' | 'hook' | 'guide' | 'package'

/**
 * Props for the ItemHero component
 */
interface ItemHeroProps {
  /** Type of catalog item */
  type: ItemType
  /** Item title */
  name: string
  /** Item description */
  description: string
  /** Author username */
  authorName?: string
  /** Tag keys for the item */
  tags: string[]
  /** Unique item identifier */
  itemId: string
  /** Difficulty level */
  difficulty?: string
  /** Last update date string */
  updatedAt?: string
  /** Publication status */
  status?: 'draft' | 'published'
  /** Version string */
  version?: string
  /** Estimated completion time */
  estimatedTime?: string
  /** Additional badges to display */
  extraBadges?: ReactNode
}

/** 항목 종류별 표시 이름 — 색과 아이콘 대신 이름으로만 구분한다 */
const TYPE_LABELS: Record<ItemType, string> = {
  skill: 'Skill',
  agent: 'Agent',
  command: 'Command',
  hook: 'Hook',
  guide: 'Guide',
  package: 'Package',
}

/**
 * 상세 페이지 머리글
 *
 * @param type - 항목 종류
 * @param name - 항목 이름
 * @param description - 한 줄 설명
 * @param authorName - 작성자 계정
 * @param tags - 태그 키 목록
 * @param itemId - 항목 식별자
 * @param difficulty - 난이도
 * @param updatedAt - 마지막 갱신일
 * @param status - 공개 상태
 * @param version - 버전 문자열
 * @param estimatedTime - 예상 소요 시간
 * @param extraBadges - 종류별로 덧붙이는 배지
 *
 * @example
 * ```tsx
 * <ItemHero
 *   type="skill"
 *   itemId="code-reviewer"
 *   name="Code Reviewer"
 *   description="AI-powered code review assistant"
 *   tags={['automation', 'code-quality']}
 * />
 * ```
 */
export function ItemHero({
  type,
  name,
  description,
  authorName,
  tags,
  itemId,
  difficulty,
  updatedAt,
  status,
  version,
  estimatedTime,
  extraBadges,
}: ItemHeroProps) {
  const difficultyLabel = difficulty
    ? DIFFICULTY_LABELS[difficulty as keyof typeof DIFFICULTY_LABELS]?.label ?? difficulty
    : null

  // 한 줄 메타 스트립 — 값이 없는 항목은 아예 빠지고, 남은 것끼리만 구분점을 찍는다
  const metaItems: ReactNode[] = []
  if (authorName) {
    metaItems.push(<span className="font-mono">@{authorName}</span>)
  }
  if (version) {
    metaItems.push(<VersionPopover version={version} itemId={itemId} size="sm" />)
  }
  if (updatedAt) {
    metaItems.push(<span className="font-mono tabular-nums">Updated {updatedAt}</span>)
  }
  if (difficultyLabel) {
    metaItems.push(<span>{difficultyLabel}</span>)
  }
  if (estimatedTime) {
    metaItems.push(<span className="font-mono tabular-nums">{estimatedTime}</span>)
  }

  return (
    <div className="mb-12">
      <div className="flex flex-wrap items-center gap-3">
        <span className="eyebrow">{TYPE_LABELS[type]}</span>
        {extraBadges}
        {status === 'draft' && <StatusBadge status={status} />}
      </div>

      <h1 className="mt-4 text-3xl md:text-4xl font-medium tracking-tight text-[var(--text-primary)]">
        {name}
      </h1>

      <p className="page-subtitle">{description}</p>

      {tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs text-[var(--text-secondary)]"
            >
              {TAGS[tag]?.label || tag}
            </span>
          ))}
        </div>
      )}

      {metaItems.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border-subtle)] pt-4 text-xs text-[var(--text-muted)]">
          {metaItems.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && <span aria-hidden="true">·</span>}
              {item}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
