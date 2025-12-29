import type { CatalogItemSummary, ItemType, Difficulty, TeamTag } from '@/lib/core/types'

export interface SearchableCatalogProps {
  catalog: CatalogItemSummary[]
}

export interface ItemCardProps {
  item: CatalogItemSummary
  index: number
}

export interface SectionHeaderProps {
  icon: string
  title: string
  count: number
  accentColor: string
}

export interface TypeFilterConfig {
  label: string
  icon: string
  gradient: string
  glow: string
}

export interface UseSearchFiltersOptions {
  catalog: CatalogItemSummary[]
}

export interface UseSearchFiltersReturn {
  searchQuery: string
  setSearchQuery: (query: string) => void
  activeFilter: ItemType | 'all'
  selectedTags: string[]
  selectedDifficulty: Difficulty | ''
  selectedTeamTag: TeamTag | ''
  showFilters: boolean
  setShowFilters: (show: boolean) => void
  availableTags: string[]
  filteredCatalog: CatalogItemSummary[]
  didYouMean: string[]
  hasActiveFilters: boolean
  handleTypeFilter: (type: ItemType | 'all') => void
  handleTagToggle: (tag: string) => void
  handleDifficultyChange: (difficulty: Difficulty | '') => void
  handleTeamTagChange: (team: TeamTag | '') => void
  handleClearAllFilters: () => void
  skills: CatalogItemSummary[]
  agents: CatalogItemSummary[]
  commands: CatalogItemSummary[]
  hooks: CatalogItemSummary[]
  totalSkills: number
  totalAgents: number
  totalCommands: number
  totalHooks: number
}
