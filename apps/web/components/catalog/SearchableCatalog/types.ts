/**
 * 카탈로그 컴포넌트 타입
 */
import type { CatalogItemSummary, ItemType, Difficulty } from '@/lib/core/types'

/**
 * SearchableCatalog props
 */
export interface SearchableCatalogProps {
  /** 화면에 뿌릴 카탈로그 항목 전체 */
  catalog: CatalogItemSummary[]
}

/**
 * ItemCard props
 */
export interface ItemCardProps {
  /** 카드로 그릴 항목 */
  item: CatalogItemSummary
  /** 목록 안에서의 순서 — 등장 지연에 쓴다 */
  index: number
}

/**
 * SectionHeader props
 */
export interface SectionHeaderProps {
  /** 구획 제목 */
  title: string
  /** 구획에 속한 항목 수 */
  count: number
  /** @deprecated 장식 아이콘은 그리지 않는다 */
  icon?: string
  /** @deprecated 구획별 강조색은 쓰지 않는다 */
  accentColor?: string
}

/**
 * 항목 유형별 표시 설정
 */
export interface TypeFilterConfig {
  /** 카드·필터에 쓰는 대문자 유형 라벨 */
  label: string
}

/**
 * useSearchFilters 옵션
 */
export interface UseSearchFiltersOptions {
  /** 필터링 대상 카탈로그 */
  catalog: CatalogItemSummary[]
}

/**
 * useSearchFilters 반환값 — 검색어·필터 상태와 유형별로 나눈 목록
 */
export interface UseSearchFiltersReturn {
  searchQuery: string
  setSearchQuery: (query: string) => void
  activeFilter: ItemType | 'all'
  selectedTags: string[]
  selectedDifficulty: Difficulty | ''
  selectedPlatform: string | null
  showFilters: boolean
  setShowFilters: (show: boolean) => void
  availableTags: string[]
  filteredCatalog: CatalogItemSummary[]
  didYouMean: string[]
  hasActiveFilters: boolean
  handleTypeFilter: (type: ItemType | 'all') => void
  handleTagToggle: (tag: string) => void
  handleDifficultyChange: (difficulty: Difficulty | '') => void
  handlePlatformChange: (platform: string | null) => void
  handleClearAllFilters: () => void
  skills: CatalogItemSummary[]
  agents: CatalogItemSummary[]
  commands: CatalogItemSummary[]
  hooks: CatalogItemSummary[]
  packages: CatalogItemSummary[]
  totalSkills: number
  totalAgents: number
  totalCommands: number
  totalHooks: number
  totalPackages: number
}
