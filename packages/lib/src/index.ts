/**
 * GPTers AI Toolkit Library
 *
 * Root barrel export for backward compatibility.
 * New code should import from specific subdirectories.
 */

// Core infrastructure
export * from './core'

// Utilities (generateIdFromName is duplicated in versioning - use versioning version)
export * from './utils'

// Security & validation
export * from './security'

// Search & filtering (SortDirection is duplicated in features/bookmarks)
export {
  // Types
  type SearchOperator,
  type SortField,
  type SortDirection,
  type SortConfig,
  type FilterPreset,
  type RangeFilter,
  type DateRangeFilter,
  type FilterState,
  type SearchToken,
  type FilterCounts,
  type FilterResult,
  type SavedFilter,
  // Constants
  DEFAULT_FILTER_STATE,
  SORT_OPTIONS,
  FILTER_PRESETS,
  // Functions
  parseSearchQuery,
  matchSearchTokens,
  levenshteinDistance,
  fuzzyMatchScore,
  findFuzzyMatches,
  applyFilters,
  sortItems,
  calculateFilterCounts,
  filterCatalog,
  applyPreset,
  getPresetById,
  saveFilter,
  getSavedFilters,
  deleteSavedFilter,
  addToFilterHistory,
  getFilterHistory,
  clearFilterHistory,
  hasActiveFilters,
  countActiveFilters,
  filterStateFromParams,
  filterStateToParams,
  getSortDescription,
} from './search'

// Version management (has generateIdFromName which conflicts with utils/frontmatter)
export {
  type VersionBump,
  parseSemver,
  incrementVersion,
  analyzeChanges,
  determineVersion,
  compareVersions,
  hasUpdate,
  generateIdFromName,
} from './versioning'

// Feature modules (SortDirection and TYPE_CONFIG conflict with search and data)
export {
  // Bookmark types
  type BookmarkedItem,
  type BookmarkFolder,
  type BookmarkState,
  type BookmarkStats,
  type SortOption,
  // Bookmark constants
  FOLDER_COLORS,
  // Bookmark functions
  loadBookmarks,
  saveBookmarks,
  exportBookmarks,
  importBookmarks,
  clearBookmarks,
  isBookmarked,
  addBookmark,
  removeBookmark,
  toggleBookmark,
  updateBookmarkNote,
  moveToFolder,
  getBookmarkedItems,
  getBookmarkedIds,
  createFolder,
  deleteFolder,
  renameFolder,
  updateFolderColor,
  getFolders,
  getItemsInFolder,
  getBookmarkStats,
  getBookmarkCountByType,
  subscribeToBookmarks,
} from './features/bookmarks'

export * from './features/track-install'
export * from './features/welfare-engine'

// Playground utilities (excluding ParsedMarkdown which conflicts with utils/frontmatter)
export {
  type CodeBlock,
  type MarkdownSection,
  extractCodeBlocks,
  extractFrontmatter,
  removeFrontmatter,
  extractSections,
  extractTitle,
  extractDescription,
  parseMarkdown,
  LANGUAGE_ALIASES,
  normalizeLanguage,
  getFileExtension,
  generateClaudeCommand,
  generateShareUrl,
  escapeHtml,
  addLineNumbers,
  truncateText,
  countLines,
  formatFileSize,
} from './features/playground-utils'

// Static data & configuration
export * from './data'
