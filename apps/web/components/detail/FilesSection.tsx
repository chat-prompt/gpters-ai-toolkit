/**
 * Files section component for displaying plugin files grouped by type
 *
 * Renders additional files (scripts, references, templates, configs)
 * with expandable content previews and type-specific styling.
 */
'use client'

import { useState } from 'react'
import type { PluginFile, FileType } from '@/lib/core/types'
import { CopyButton } from '../ui/CopyButton'

/**
 * Props for the FilesSection component
 */
interface FilesSectionProps {
  /** Array of plugin files to display */
  files: PluginFile[]
}

/** File type metadata with icons and styling */
const FILE_TYPE_META: Record<
  FileType,
  { icon: string; label: string; color: string; description: string }
> = {
  script: {
    icon: '🔧',
    label: '실행 스크립트',
    color: 'border-emerald-500/30 bg-emerald-500/5',
    description: 'node/bash/python으로 실행 가능한 스크립트',
  },
  reference: {
    icon: '📚',
    label: '참조 문서',
    color: 'border-blue-500/30 bg-blue-500/5',
    description: '컨텍스트 이해를 위한 참조 자료',
  },
  template: {
    icon: '📋',
    label: '템플릿',
    color: 'border-purple-500/30 bg-purple-500/5',
    description: '프로젝트에 복사할 템플릿 파일',
  },
  config: {
    icon: '⚙️',
    label: '설정 파일',
    color: 'border-amber-500/30 bg-amber-500/5',
    description: '프로젝트 설정에 추가할 파일',
  },
}

/**
 * Infer file type from filename extension if not explicitly provided
 */
function inferFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'js' || ext === 'mjs' || ext === 'ts' || ext === 'sh' || ext === 'py') {
    return 'script'
  }
  if (ext === 'md' || ext === 'txt') {
    return 'reference'
  }
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') {
    return 'config'
  }
  return 'template'
}

/**
 * Group files by their type
 */
function groupFilesByType(files: PluginFile[]): Map<FileType, PluginFile[]> {
  const grouped = new Map<FileType, PluginFile[]>()

  files.forEach((file) => {
    const type = (file.type as FileType) || inferFileType(file.name)
    const existing = grouped.get(type) || []
    grouped.set(type, [...existing, file])
  })

  return grouped
}

/**
 * Individual file display with expandable content
 */
function FileItem({ file }: { file: PluginFile }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const type = (file.type as FileType) || inferFileType(file.name)
  const meta = FILE_TYPE_META[type]

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${meta.color} ${
        isExpanded ? 'shadow-lg' : ''
      }`}
    >
      {/* File header */}
      <div className="w-full px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 flex-1 hover:bg-white/5 transition-colors rounded-lg -ml-2 px-2 py-1"
        >
          <span className="text-lg">{meta.icon}</span>
          <div className="text-left">
            <div className="text-sm font-mono text-[var(--text-primary)]">{file.name}</div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5">
              {(file.content ?? '').split('\n').length} lines
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-[var(--text-secondary)] transition-transform ml-auto ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-2 ml-2">
          <CopyButton text={file.content} />
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          <pre className="p-4 text-xs font-mono text-[var(--text-primary)] overflow-x-auto max-h-96 overflow-y-auto">
            <code>{file.content}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * File type group with header and file list
 */
function FileTypeGroup({ type, files }: { type: FileType; files: PluginFile[] }) {
  const meta = FILE_TYPE_META[type]

  return (
    <div className="mb-6 last:mb-0">
      {/* Type header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{meta.icon}</span>
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{meta.label}</h3>
          <p className="text-xs text-[var(--text-muted)]">{meta.description}</p>
        </div>
        <div className="ml-auto">
          <span className="px-2 py-1 rounded-full bg-[var(--bg-tertiary)] text-xs text-[var(--text-secondary)] font-medium">
            {files.length}개
          </span>
        </div>
      </div>

      {/* File list */}
      <div className="space-y-2">
        {files.map((file, index) => (
          <FileItem key={`${file.name}-${index}`} file={file} />
        ))}
      </div>
    </div>
  )
}

/**
 * Main files section component
 *
 * Displays plugin files grouped by type with expandable previews
 *
 * @example
 * ```tsx
 * <FilesSection files={[
 *   { name: 'run.mjs', content: '...', type: 'script' },
 *   { name: 'guide.md', content: '...', type: 'reference' }
 * ]} />
 * ```
 */
export function FilesSection({ files }: FilesSectionProps) {
  if (!files || files.length === 0) {
    return null
  }

  const groupedFiles = groupFilesByType(files)
  const typeOrder: FileType[] = ['script', 'reference', 'template', 'config']

  return (
    <div className="glass rounded-2xl p-8 mb-8">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xl">📁</span>
        <h2 className="text-lg font-medium text-[var(--text-primary)]">추가 파일</h2>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-6">
        이 리소스에는 {files.length}개의 추가 파일이 포함되어 있습니다. 각 파일을 클릭하여
        내용을 확인하세요.
      </p>

      {/* File groups */}
      <div>
        {typeOrder.map((type) => {
          const filesOfType = groupedFiles.get(type)
          if (!filesOfType || filesOfType.length === 0) return null
          return <FileTypeGroup key={type} type={type} files={filesOfType} />
        })}
      </div>
    </div>
  )
}
