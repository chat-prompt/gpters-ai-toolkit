'use client'

/**
 * 추가 파일 구획
 *
 * 스킬에 딸려 오는 스크립트·참조 문서·템플릿·설정 파일을 종류별로 묶어 보여준다.
 * 파일 이름과 내용은 자리가 맞아야 읽히므로 고정폭을 쓴다.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PluginFile, FileType } from '@/lib/core/types'
import { CopyButton } from '../ui/CopyButton'

/**
 * Props for the FilesSection component
 */
interface FilesSectionProps {
  /** 보여줄 파일 목록 */
  files: PluginFile[]
}

/**
 * 확장자로 파일 종류를 추정한다 (명시된 종류가 없을 때만)
 *
 * @param filename - 파일 이름
 * @returns 추정한 파일 종류
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
 * 파일을 종류별로 묶는다
 *
 * @param files - 파일 목록
 * @returns 종류를 키로 하는 파일 묶음
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
 * 파일 한 줄 — 눌러서 내용을 펼친다
 *
 * @param file - 표시할 파일
 */
function FileItem({ file }: { file: PluginFile }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const lineCount = (file.content ?? '').split('\n').length

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-tertiary)]">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0">
            <div className="truncate font-mono text-sm text-[var(--text-primary)]">{file.name}</div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-muted)]">
              {lineCount} lines
            </div>
          </div>
          <svg
            className={`ml-auto h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <CopyButton text={file.content} />
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
          <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
            <code>{file.content}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * 같은 종류의 파일 묶음
 *
 * @param type - 파일 종류
 * @param files - 그 종류에 속한 파일들
 */
function FileTypeGroup({ type, files }: { type: FileType; files: PluginFile[] }) {
  const t = useTranslations('detail.files')

  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {t(`types.${type}.label`)}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t(`types.${type}.description`)}</p>
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)]">
          {files.length}
        </span>
      </div>

      <div className="space-y-2">
        {files.map((file, index) => (
          <FileItem key={`${file.name}-${index}`} file={file} />
        ))}
      </div>
    </div>
  )
}

/**
 * 추가 파일 목록
 *
 * @param files - 보여줄 파일 목록
 *
 * @example
 * ```tsx
 * <FilesSection files={[{ name: 'run.mjs', content: '...', type: 'script' }]} />
 * ```
 */
export function FilesSection({ files }: FilesSectionProps) {
  const t = useTranslations('detail.files')

  if (!files || files.length === 0) {
    return null
  }

  const groupedFiles = groupFilesByType(files)
  const typeOrder: FileType[] = ['script', 'reference', 'template', 'config']

  return (
    <div className="surface-card mb-8">
      <h2 className="text-base font-medium tracking-tight text-[var(--text-primary)]">
        {t('title')}
      </h2>
      <p className="mt-1 mb-6 text-sm text-[var(--text-secondary)]">
        {t('description', { count: files.length })}
      </p>

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
