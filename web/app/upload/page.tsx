'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { TAGS, DIFFICULTY_LABELS, Difficulty } from '@/lib/types'

type ItemType = 'skill' | 'agent' | 'prompt'

const TYPE_CONFIG = {
  skill: { label: 'Skill', icon: '⚡', description: 'Claude Code에서 /명령어로 실행', color: 'cyan' },
  agent: { label: 'Agent', icon: '◈', description: 'Task 도구로 호출하는 서브에이전트', color: 'purple' },
  prompt: { label: 'Prompt', icon: '✦', description: '재사용 가능한 프롬프트 템플릿', color: 'orange' },
}

const AVAILABLE_TAGS = Object.keys(TAGS) as Array<keyof typeof TAGS>

export default function UploadPage() {
  const [type, setType] = useState<ItemType>('skill')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [pluginId, setPluginId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Generate frontmatter preview
  const frontmatter = useMemo(() => {
    const lines = ['---']
    if (name) lines.push(`name: ${name}`)
    if (description) lines.push(`description: ${description}`)
    if (author) lines.push(`author: ${author}`)
    if (selectedTags.length > 0) lines.push(`tags: [${selectedTags.join(', ')}]`)
    if (type === 'skill' && difficulty) lines.push(`difficulty: ${difficulty}`)
    if (type === 'skill' && pluginId) lines.push(`pluginId: ${pluginId}`)
    lines.push('---')
    return lines.join('\n')
  }, [name, description, author, selectedTags, difficulty, pluginId, type])

  const fullContent = useMemo(() => {
    return `${frontmatter}\n\n${content}`
  }, [frontmatter, content])

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    // TODO: GitHub PR 생성 로직
    // 현재는 데모로 alert 표시
    setTimeout(() => {
      alert(`GPTers 카탈로그에 추가하기 위해 GitHub PR이 생성됩니다.\n\n생성될 파일:\n${type}s/${name}/${type}.md\n\n내용이 클립보드에 복사되었습니다.`)
      navigator.clipboard.writeText(fullContent)
      console.log({ type, name, description, content: fullContent, author, tags: selectedTags, difficulty, pluginId })
      setIsSubmitting(false)
    }, 1000)
  }

  const colorVar = TYPE_CONFIG[type].color

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-${colorVar})] opacity-[0.03] blur-[120px] rounded-full`} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--border-subtle)]">
        <div className="max-w-3xl mx-auto px-8 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm transition-colors"
          >
            <span>←</span>
            <span>Back to Catalog</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        {/* Title */}
        <div className="mb-12">
          <p className="text-[#F26522] text-xs font-medium uppercase tracking-[0.3em] mb-4">
            Share with GPTers
          </p>
          <h1 className="text-4xl font-light text-[var(--text-primary)] tracking-tight mb-4" style={{ fontFamily: 'Newsreader, serif' }}>
            Share Your Creation
          </h1>
          <p className="text-lg text-[var(--text-secondary)]">
            스킬, 에이전트, 프롬프트를 GPTers 팀과 공유하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Type Selection */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-4">
              Type
            </label>
            <div className="grid grid-cols-3 gap-4">
              {(Object.keys(TYPE_CONFIG) as ItemType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`glass rounded-xl p-4 text-left transition-all ${
                    type === t
                      ? `border-[var(--accent-${TYPE_CONFIG[t].color})] shadow-[0_0_20px_rgba(0,212,255,0.2)]`
                      : ''
                  }`}
                >
                  <div className="text-2xl mb-2">{TYPE_CONFIG[t].icon}</div>
                  <div className="text-sm font-medium text-[var(--text-primary)] mb-1">
                    {TYPE_CONFIG[t].label}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {TYPE_CONFIG[t].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="my-awesome-skill"
              className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
              required
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">
              kebab-case만 사용 가능 (예: case-study-writer)
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="이 스킬이 하는 일을 한 줄로 설명"
              className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
              required
            />
          </div>

          {/* Author */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Author *
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="your-name"
              className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
              required
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagToggle(tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedTags.includes(tag)
                      ? 'bg-[var(--accent-cyan)] text-black'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {TAGS[tag].label}
                </button>
              ))}
            </div>
          </div>

          {/* Skill-specific fields */}
          {type === 'skill' && (
            <>
              {/* Difficulty */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                  Difficulty
                </label>
                <div className="flex gap-3">
                  {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(difficulty === d ? '' : d)}
                      className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                        difficulty === d
                          ? 'bg-[var(--accent-cyan)] text-black'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {DIFFICULTY_LABELS[d].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plugin ID */}
              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                  Plugin ID (Optional)
                </label>
                <input
                  type="text"
                  value={pluginId}
                  onChange={(e) => setPluginId(e.target.value)}
                  placeholder="your-org@your-plugin-marketplace"
                  className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
                />
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  플러그인으로 배포한 경우 ID 입력 (예: superpowers@superpowers-marketplace)
                </p>
              </div>
            </>
          )}

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider">
                Content *
              </label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-[var(--accent-cyan)] hover:underline"
              >
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
            </div>

            {showPreview ? (
              <div className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm font-mono overflow-x-auto">
                <pre className="whitespace-pre-wrap">{fullContent || '(preview will appear here)'}</pre>
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`# ${name || 'my-skill'}\n\n스킬 내용을 여기에 작성하세요...\n\n## Usage\n\n...\n\n## Examples\n\n...`}
                rows={16}
                className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors resize-none"
                required
              />
            )}
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Frontmatter는 자동 생성됩니다. 본문만 작성하세요.
            </p>
          </div>

          {/* Frontmatter Preview */}
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-[var(--text-muted)]">Generated Frontmatter:</span>
            </div>
            <pre className="text-xs text-[var(--accent-cyan)] font-mono whitespace-pre-wrap">{frontmatter}</pre>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-[var(--text-muted)]">
              제출하면 GPTers 카탈로그에 추가됩니다
            </p>
            <button
              type="submit"
              disabled={isSubmitting || !name || !description || !author || !content}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#F26522] text-white text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-orange-500/20"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin">◌</span>
                  <span>Creating PR...</span>
                </>
              ) : (
                <>
                  <span>→</span>
                  <span>Submit for Review</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
