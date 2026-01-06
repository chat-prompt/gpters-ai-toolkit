'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TypeSpecificFields } from '@/components/admin/TypeSpecificFields'
import { TypeGuidePanel } from '@/components/admin/TypeGuidePanel'
import { TeamTagSelector } from '@/components/social/TeamTagSelector'
import { TYPE_CONFIG, getContentTemplate } from '@/lib/data/type-config'
import { useAdminAuth } from '@/components/admin/AdminAuthProvider'
import type { ItemType, Difficulty, TeamTag, AgentModel, AgentPermissionMode, HookEvent } from '@/lib/core/types'

const ITEM_TYPES: ItemType[] = ['skill', 'agent', 'command', 'guide', 'hook']

export default function NewCatalogItem() {
  const router = useRouter()
  useAdminAuth() // For layout protection
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Basic form state
  const [id, setId] = useState('')
  const [type, setType] = useState<ItemType>('skill')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [teamTag, setTeamTag] = useState<TeamTag>('general')
  const [tags, setTags] = useState('')
  const [pluginId, setPluginId] = useState('')
  const [content, setContent] = useState('')
  const [readme, setReadme] = useState('')

  // Marketplace state
  const [mcpEnabled, setMarketplaceEnabled] = useState(false)
  const [version, setMarketplaceVersion] = useState('1.0.0')

  // Type-specific state
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [allowedTools, setAllowedTools] = useState('')
  const [agentModel, setAgentModel] = useState<AgentModel | ''>('')
  const [agentPermissionMode, setAgentPermissionMode] = useState<AgentPermissionMode | ''>('')
  const [agentSkills, setAgentSkills] = useState('')
  const [commandArgumentHint, setCommandArgumentHint] = useState('')
  const [commandDisableModelInvocation, setCommandDisableModelInvocation] = useState(false)

  // Hook state
  const [hookEvent, setHookEvent] = useState<HookEvent | ''>('')
  const [hookMatcher, setHookMatcher] = useState('')
  const [hookCommand, setHookCommand] = useState('')
  const [hookTimeout, setHookTimeout] = useState<number | ''>('')
  const [hookBlocking, setHookBlocking] = useState(true)

  // Auto-apply content template when type or name changes
  useEffect(() => {
    if (name && !content) {
      const template = getContentTemplate(type, name)
      setContent(template)
    }
  }, [type, name, content])

  const handleTypeSpecificChange = (field: string, value: string | boolean | number) => {
    switch (field) {
      case 'difficulty':
        setDifficulty(value as Difficulty | '')
        break
      case 'estimatedTime':
        setEstimatedTime(value as string)
        break
      case 'allowedTools':
        setAllowedTools(value as string)
        break
      case 'agentModel':
        setAgentModel(value as AgentModel | '')
        break
      case 'agentPermissionMode':
        setAgentPermissionMode(value as AgentPermissionMode | '')
        break
      case 'agentSkills':
        setAgentSkills(value as string)
        break
      case 'commandArgumentHint':
        setCommandArgumentHint(value as string)
        break
      case 'commandDisableModelInvocation':
        setCommandDisableModelInvocation(value as boolean)
        break
      case 'hookEvent':
        setHookEvent(value as HookEvent | '')
        break
      case 'hookMatcher':
        setHookMatcher(value as string)
        break
      case 'hookCommand':
        setHookCommand(value as string)
        break
      case 'hookTimeout':
        setHookTimeout(value as number | '')
        break
      case 'hookBlocking':
        setHookBlocking(value as boolean)
        break
    }
  }

  // Reset type-specific fields when type changes
  const handleTypeChange = (newType: ItemType) => {
    setType(newType)
    // Reset content to apply new template
    setContent('')
    // Reset type-specific fields
    setDifficulty('')
    setEstimatedTime('')
    setAllowedTools('')
    setAgentModel('')
    setAgentPermissionMode('')
    setAgentSkills('')
    setCommandArgumentHint('')
    setCommandDisableModelInvocation(false)
    // Reset hook fields
    setHookEvent('')
    setHookMatcher('')
    setHookCommand('')
    setHookTimeout('')
    setHookBlocking(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const payload = {
        id,
        type,
        name,
        description,
        author: author || 'anonymous',
        teamTag,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        difficulty: difficulty || null,
        pluginId: pluginId || null,
        estimatedTime: estimatedTime || null,
        content,
        readme: readme || null,
        mcpEnabled,
        version: version || '1.0.0',
        // Type-specific fields
        allowedTools: allowedTools || null,
        agentModel: agentModel || null,
        agentPermissionMode: agentPermissionMode || null,
        agentSkills: agentSkills || null,
        commandArgumentHint: commandArgumentHint || null,
        commandDisableModelInvocation,
        // Hook fields
        hookEvent: hookEvent || null,
        hookMatcher: hookMatcher || null,
        hookCommand: hookCommand || null,
        hookTimeout: hookTimeout || null,
        hookBlocking,
      }

      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        router.push('/admin/catalog')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to create item')
      }
    } catch {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  const config = TYPE_CONFIG[type]

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      <div className="mb-8">
        <Link
          href="/admin/catalog"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-4 inline-block"
        >
          ← Back to Catalog
        </Link>
        <h1 className="text-3xl font-light text-[var(--text-primary)]">
          Create New Item
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Type Selection */}
            <div className="glass rounded-2xl p-8">
              <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
                Type 선택
              </h2>
              <div className="grid grid-cols-5 gap-3">
                {ITEM_TYPES.map((t) => {
                  const tConfig = TYPE_CONFIG[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      className={`p-4 rounded-xl transition-all ${
                        type === t
                          ? 'bg-[var(--accent-cyan)] text-black'
                          : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <div className="text-2xl mb-2">{tConfig.icon}</div>
                      <div className="text-sm font-medium capitalize">{t}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Basic Info */}
            <div className="glass rounded-2xl p-8 space-y-6">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">
                기본 정보
              </h2>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    ID *
                  </label>
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                    placeholder="my-skill-id"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                    placeholder={config.namePlaceholder}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors resize-none"
                  rows={3}
                  placeholder={config.descriptionPlaceholder}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    Author
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                    placeholder="username"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                    placeholder={config.suggestedTags.join(', ')}
                  />
                </div>
              </div>

              <TeamTagSelector value={teamTag} onChange={setTeamTag} />

              {type === 'skill' && (
                <div>
                  <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                    Plugin ID (external skills only)
                  </label>
                  <input
                    type="text"
                    value={pluginId}
                    onChange={(e) => setPluginId(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                    placeholder="@author/plugin-name"
                  />
                </div>
              )}
            </div>

            {/* Type-Specific Fields */}
            <div className="glass rounded-2xl p-8">
              <h2 className="text-lg font-medium text-[var(--text-primary)] mb-6">
                {config.icon} {type.charAt(0).toUpperCase() + type.slice(1)} 설정
              </h2>
              <TypeSpecificFields
                type={type}
                values={{
                  difficulty,
                  estimatedTime,
                  allowedTools,
                  agentModel,
                  agentPermissionMode,
                  agentSkills,
                  commandArgumentHint,
                  commandDisableModelInvocation,
                  hookEvent,
                  hookMatcher,
                  hookCommand,
                  hookTimeout,
                  hookBlocking,
                }}
                onChange={handleTypeSpecificChange}
              />
            </div>

            {/* Content */}
            <div className="glass rounded-2xl p-8 space-y-6">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">
                Content
              </h2>

              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Content * (Markdown)
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors resize-none"
                  rows={20}
                  placeholder={config.contentPlaceholder}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  README (optional)
                </label>
                <textarea
                  value={readme}
                  onChange={(e) => setReadme(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm font-mono focus:border-[var(--accent-cyan)] transition-colors resize-none"
                  rows={8}
                  placeholder="Additional documentation for users..."
                />
              </div>
            </div>

            {/* Marketplace Settings */}
            {type !== 'guide' && type !== 'hook' && (
              <div className="glass rounded-2xl p-8 space-y-6">
                <h2 className="text-lg font-medium text-[var(--text-primary)] flex items-center gap-2">
                  <span className="text-[var(--accent-cyan)]">CLI</span> Marketplace Settings
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Enable this item in the Claude Code plugin marketplace for CLI installation.
                </p>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mcpEnabled}
                      onChange={(e) => setMarketplaceEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--accent-cyan)] focus:ring-[var(--accent-cyan)] cursor-pointer"
                    />
                    <span className="text-[var(--text-primary)]">Enable in Marketplace</span>
                  </label>
                </div>

                {mcpEnabled && (
                  <div>
                    <label className="block text-sm text-[var(--text-muted)] uppercase tracking-wider mb-2">
                      Version (semver)
                    </label>
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setMarketplaceVersion(e.target.value)}
                      placeholder="1.0.0"
                      className="w-full max-w-xs px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:border-[var(--accent-cyan)] transition-colors"
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm">{error}</div>
            )}

            <div className="flex justify-end gap-4">
              <Link
                href="/admin/catalog"
                className="px-6 py-3 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-3 rounded-lg bg-[var(--accent-cyan)] text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Item'}
              </button>
            </div>
          </div>

          {/* Right Column: Guide Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <TypeGuidePanel type={type} />
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
