export type ItemType = 'skill' | 'agent' | 'prompt'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface CatalogItem {
  id: string
  type: ItemType
  name: string
  description: string
  author: string
  tags: string[]
  difficulty?: Difficulty
  pluginId?: string // 플러그인 설치 ID (스킬만)
  content: string // skill.md 내용
  readme?: string // README.md 내용
  createdAt?: string
  updatedAt?: string
}

export interface Tag {
  id: string
  label: string
  color: string
}

export const TAGS: Record<string, Tag> = {
  writing: { id: 'writing', label: '문서 작성', color: 'bg-blue-100 text-blue-800' },
  documentation: { id: 'documentation', label: '문서화', color: 'bg-blue-100 text-blue-800' },
  toolkit: { id: 'toolkit', label: 'AI Toolkit', color: 'bg-purple-100 text-purple-800' },
  productivity: { id: 'productivity', label: '생산성', color: 'bg-green-100 text-green-800' },
  collaboration: { id: 'collaboration', label: '협업', color: 'bg-yellow-100 text-yellow-800' },
  code: { id: 'code', label: '코드', color: 'bg-gray-100 text-gray-800' },
  review: { id: 'review', label: '리뷰', color: 'bg-orange-100 text-orange-800' },
  meeting: { id: 'meeting', label: '회의', color: 'bg-pink-100 text-pink-800' },
  analysis: { id: 'analysis', label: '분석', color: 'bg-indigo-100 text-indigo-800' },
}

export const DIFFICULTY_LABELS: Record<Difficulty, { label: string; color: string }> = {
  easy: { label: '쉬움', color: 'bg-green-100 text-green-800' },
  medium: { label: '보통', color: 'bg-yellow-100 text-yellow-800' },
  hard: { label: '어려움', color: 'bg-red-100 text-red-800' },
}
