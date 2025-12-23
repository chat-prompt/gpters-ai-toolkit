'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TAGS, DIFFICULTY_LABELS, Difficulty, MCP_SERVERS } from '@/lib/types'
import { MarkdownContent } from '@/components/MarkdownContent'
import { parseFrontmatter, generateIdFromName } from '@/lib/frontmatter'

type ItemType = 'skill' | 'agent' | 'prompt' | 'command' | 'guide'

const TYPE_CONFIG = {
  skill: { label: 'Skill', icon: '⚡', description: 'Claude Code에서 /명령어로 실행', color: 'cyan' },
  agent: { label: 'Agent', icon: '◈', description: 'Task 도구로 호출하는 서브에이전트', color: 'purple' },
  prompt: { label: 'Prompt', icon: '✦', description: '재사용 가능한 프롬프트 템플릿', color: 'orange' },
  command: { label: 'Command', icon: '▸', description: 'CLI 스타일 커맨드', color: 'cyan' },
  guide: { label: 'Guide', icon: '📚', description: '실습 가이드 및 튜토리얼', color: 'purple' },
}

const AVAILABLE_TAGS = Object.keys(TAGS) as Array<keyof typeof TAGS>

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [type, setType] = useState<ItemType>('skill')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [pluginId, setPluginId] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [dependencies, setDependencies] = useState<string[]>([])
  const [newDependency, setNewDependency] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // File upload handlers
  const handleFileUpload = useCallback((file: File) => {
    if (!file.name.endsWith('.md')) {
      setError('.md 파일만 업로드할 수 있습니다')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { frontmatter, content: parsedContent } = parseFrontmatter(text)

      const newName = frontmatter.name || file.name.replace('.md', '')
      setId(frontmatter.id || generateIdFromName(newName))
      setType(frontmatter.type || 'skill')
      setName(newName)
      setDescription(frontmatter.description || '')
      setAuthor(frontmatter.author || '')
      setSelectedTags(frontmatter.tags || [])
      setDifficulty(frontmatter.difficulty || '')
      setPluginId(frontmatter.pluginId || '')
      setEstimatedTime(frontmatter.estimatedTime || '')
      setDependencies(frontmatter.dependencies || [])
      setContent(parsedContent)
      setError('')
    }
    reader.readAsText(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  // Generate frontmatter preview
  const frontmatter = useMemo(() => {
    const lines = ['---']
    if (id) lines.push(`id: ${id}`)
    lines.push(`type: ${type}`)
    if (name) lines.push(`name: ${name}`)
    if (description) lines.push(`description: ${description}`)
    if (author) lines.push(`author: ${author}`)
    if (selectedTags.length > 0) lines.push(`tags: [${selectedTags.join(', ')}]`)
    if (difficulty) lines.push(`difficulty: ${difficulty}`)
    if (pluginId) lines.push(`pluginId: ${pluginId}`)
    if (estimatedTime) lines.push(`estimatedTime: ${estimatedTime}`)
    if (dependencies.length > 0) lines.push(`dependencies: [${dependencies.join(', ')}]`)
    lines.push('---')
    return lines.join('\n')
  }, [id, type, name, description, author, selectedTags, difficulty, pluginId, estimatedTime, dependencies])

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

  const handleNameChange = (newName: string) => {
    setName(newName)
    if (!id) {
      setId(generateIdFromName(newName))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const payload = {
        id: id || generateIdFromName(name),
        type,
        name,
        description,
        author,
        tags: selectedTags,
        difficulty: difficulty || null,
        pluginId: pluginId || null,
        estimatedTime: estimatedTime || null,
        dependencies,
        content,
        readme: null,
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setSuccess(true)
        setTimeout(() => {
          router.push(`/${type}/${id || generateIdFromName(name)}`)
        }, 1500)
      } else {
        const data = await res.json()
        setError(data.error || '업로드에 실패했습니다')
      }
    } catch {
      setError('연결 오류가 발생했습니다')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center grid-pattern noise-overlay">
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-medium text-[var(--text-primary)] mb-2">
            업로드 완료!
          </h1>
          <p className="text-[var(--text-secondary)]">잠시 후 페이지로 이동합니다...</p>
        </div>
      </div>
    )
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
          {/* File Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`glass rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-2 border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/5'
                : 'border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--text-muted)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="text-4xl mb-3">📄</div>
            <p className="text-[var(--text-primary)] font-medium mb-1">
              .md 파일을 드래그하거나 클릭하여 선택
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              frontmatter가 있으면 자동으로 파싱됩니다
            </p>
          </div>

          <div className="text-center text-[var(--text-muted)] text-sm">— 또는 직접 작성 —</div>

          {/* Type Selection */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-4">
              Type
            </label>
            <div className="grid grid-cols-5 gap-3">
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

          {/* Name & ID */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="나의 멋진 스킬"
                className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                ID *
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="my-awesome-skill (자동 생성)"
                className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
                required
              />
            </div>
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

          {/* Dependencies */}
          <div>
            <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
              Dependencies (Optional)
            </label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              필요한 MCP 서버나 다른 스킬을 추가하세요. 형식: <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">mcp:github</code>, <code className="px-1 py-0.5 rounded bg-[var(--bg-tertiary)]">skill:git-commit</code>
            </p>

            {/* Quick add MCP servers */}
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(MCP_SERVERS).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    const dep = `mcp:${key}`
                    if (!dependencies.includes(dep)) {
                      setDependencies([...dependencies, dep])
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    dependencies.includes(`mcp:${key}`)
                      ? 'bg-blue-500 text-white'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  title={value.description}
                >
                  🔌 {value.label}
                </button>
              ))}
            </div>

            {/* Custom dependency input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newDependency}
                onChange={(e) => setNewDependency(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newDependency.trim()) {
                    e.preventDefault()
                    if (!dependencies.includes(newDependency.trim())) {
                      setDependencies([...dependencies, newDependency.trim()])
                    }
                    setNewDependency('')
                  }
                }}
                placeholder="skill:my-skill 또는 mcp:custom-server"
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  if (newDependency.trim() && !dependencies.includes(newDependency.trim())) {
                    setDependencies([...dependencies, newDependency.trim()])
                    setNewDependency('')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                추가
              </button>
            </div>

            {/* Added dependencies */}
            {dependencies.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {dependencies.map((dep) => (
                  <span
                    key={dep}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs font-mono"
                  >
                    <span className={dep.startsWith('mcp:') ? 'text-blue-400' : 'text-[var(--accent-cyan)]'}>
                      {dep}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDependencies(dependencies.filter((d) => d !== dep))}
                      className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Type-specific fields */}
          {(type === 'skill' || type === 'guide') && (
            <div className="grid grid-cols-2 gap-4">
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

              {/* Plugin ID (skill) or Estimated Time (guide) */}
              {type === 'skill' ? (
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
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-3">
                    예상 소요 시간
                  </label>
                  <input
                    type="text"
                    value={estimatedTime}
                    onChange={(e) => setEstimatedTime(e.target.value)}
                    placeholder="10분"
                    className="w-full px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                  />
                </div>
              )}
            </div>
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
              <div className="w-full min-h-[400px] px-5 py-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] overflow-auto">
                {content ? (
                  <MarkdownContent content={content} />
                ) : (
                  <p className="text-[var(--text-muted)] italic">미리볼 내용이 없습니다</p>
                )}
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

          {/* Error Message */}
          {error && (
            <div className="text-red-400 text-sm text-center py-2">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-[var(--text-muted)]">
              제출하면 GPTers 카탈로그에 바로 추가됩니다
            </p>
            <button
              type="submit"
              disabled={isSubmitting || !id || !name || !content}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent-cyan)] text-black text-sm font-semibold transition-all hover:opacity-90 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-cyan-500/20"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin">◌</span>
                  <span>업로드 중...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>게시하기</span>
                </>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
