'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  type InstallationSnapshot,
  type RollbackOperation,
  type RollbackOptions,
  type RollbackScope,
  type FileChange,
  ROLLBACK_STEPS,
  validateSnapshotForRollback,
  getRollbackPreview,
  simulateRollback,
  createRollbackOperation,
  getRollbackScopeLabel,
  getRollbackStatusLabel,
  getFileChangeTypeLabel,
  formatFileSize,
  formatDuration,
  getDaysUntilExpiry,
  isSnapshotExpired,
  getSnapshotStorageSummary,
} from '@/lib/plugin/rollback'

// ============================================
// Main Rollback Panel
// ============================================

interface PluginRollbackPanelProps {
  snapshots: InstallationSnapshot[]
  onRollback: (snapshot: InstallationSnapshot, options: RollbackOptions) => Promise<void>
  onDeleteSnapshot?: (snapshotId: string) => void
}

export function PluginRollbackPanel({
  snapshots,
  onRollback,
  onDeleteSnapshot,
}: PluginRollbackPanelProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<InstallationSnapshot | null>(null)
  const [showRollbackDialog, setShowRollbackDialog] = useState(false)

  const summary = useMemo(() => getSnapshotStorageSummary(snapshots), [snapshots])

  const handleRollback = useCallback(
    async (options: RollbackOptions) => {
      if (!selectedSnapshot) return
      await onRollback(selectedSnapshot, options)
      setShowRollbackDialog(false)
      setSelectedSnapshot(null)
    },
    [selectedSnapshot, onRollback]
  )

  return (
    <div className="space-y-6">
      {/* Storage Summary */}
      <SnapshotStorageSummary summary={summary} />

      {/* Snapshots List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">설치 스냅샷</h2>
        {snapshots.length === 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
            저장된 스냅샷이 없습니다
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snapshot) => (
              <SnapshotCard
                key={snapshot.id}
                snapshot={snapshot}
                onSelect={() => {
                  setSelectedSnapshot(snapshot)
                  setShowRollbackDialog(true)
                }}
                onDelete={onDeleteSnapshot ? () => onDeleteSnapshot(snapshot.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rollback Dialog */}
      {showRollbackDialog && selectedSnapshot && (
        <RollbackDialog
          snapshot={selectedSnapshot}
          onConfirm={handleRollback}
          onCancel={() => {
            setShowRollbackDialog(false)
            setSelectedSnapshot(null)
          }}
        />
      )}
    </div>
  )
}

// ============================================
// Snapshot Storage Summary
// ============================================

interface SnapshotStorageSummaryProps {
  summary: ReturnType<typeof getSnapshotStorageSummary>
}

export function SnapshotStorageSummary({ summary }: SnapshotStorageSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-2xl font-bold text-white">{summary.totalSnapshots}</p>
        <p className="text-sm text-gray-400">전체 스냅샷</p>
      </div>
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-2xl font-bold text-green-400">{summary.activeSnapshots}</p>
        <p className="text-sm text-gray-400">활성 스냅샷</p>
      </div>
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-2xl font-bold text-yellow-400">{summary.expiredSnapshots}</p>
        <p className="text-sm text-gray-400">만료된 스냅샷</p>
      </div>
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <p className="text-2xl font-bold text-blue-400">{formatFileSize(summary.totalSize)}</p>
        <p className="text-sm text-gray-400">전체 크기</p>
      </div>
    </div>
  )
}

// ============================================
// Snapshot Card
// ============================================

interface SnapshotCardProps {
  snapshot: InstallationSnapshot
  onSelect: () => void
  onDelete?: () => void
}

export function SnapshotCard({ snapshot, onSelect, onDelete }: SnapshotCardProps) {
  const expired = isSnapshotExpired(snapshot)
  const daysLeft = getDaysUntilExpiry(snapshot)
  const validation = validateSnapshotForRollback(snapshot)

  const typeLabels = {
    install: { label: '신규 설치', color: 'bg-green-500/20 text-green-300' },
    update: { label: '업데이트', color: 'bg-blue-500/20 text-blue-300' },
    reinstall: { label: '재설치', color: 'bg-yellow-500/20 text-yellow-300' },
  }

  const typeConfig = typeLabels[snapshot.installationType]

  return (
    <div
      className={`rounded-lg border p-4 ${
        expired
          ? 'border-gray-700 bg-gray-800/50 opacity-60'
          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white">{snapshot.pluginName}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            {snapshot.status === 'rolled_back' && (
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
                롤백됨
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-400">
            v{snapshot.previousVersion ? `${snapshot.previousVersion} → ` : ''}{snapshot.version}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!expired && validation.valid && (
            <button
              onClick={onSelect}
              className="rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
            >
              롤백
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
        <span>📅 {new Date(snapshot.installedAt).toLocaleDateString()}</span>
        <span>📁 {snapshot.metadata.totalFiles}개 파일</span>
        <span>💾 {formatFileSize(snapshot.metadata.totalSize)}</span>
        <span className={expired ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : ''}>
          ⏰ {expired ? '만료됨' : `${daysLeft}일 남음`}
        </span>
      </div>

      {/* File changes summary */}
      <div className="mt-3 flex gap-3 text-xs">
        {snapshot.metadata.createdFiles > 0 && (
          <span className="text-green-400">+{snapshot.metadata.createdFiles} 생성</span>
        )}
        {snapshot.metadata.modifiedFiles > 0 && (
          <span className="text-yellow-400">~{snapshot.metadata.modifiedFiles} 수정</span>
        )}
        {snapshot.metadata.deletedFiles > 0 && (
          <span className="text-red-400">-{snapshot.metadata.deletedFiles} 삭제</span>
        )}
      </div>

      {/* Validation errors */}
      {!validation.valid && (
        <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2">
          <p className="text-sm text-red-400">⚠️ 롤백 불가:</p>
          <ul className="mt-1 text-xs text-red-300">
            {validation.errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ============================================
// Rollback Dialog
// ============================================

interface RollbackDialogProps {
  snapshot: InstallationSnapshot
  onConfirm: (options: RollbackOptions) => void
  onCancel: () => void
}

export function RollbackDialog({ snapshot, onConfirm, onCancel }: RollbackDialogProps) {
  const [scope, setScope] = useState<RollbackScope>('full')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [skipConfigs, setSkipConfigs] = useState(false)
  const [createBackup, setCreateBackup] = useState(true)
  const [dryRun, setDryRun] = useState(false)
  const [reason, setReason] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const options: RollbackOptions = useMemo(
    () => ({
      scope,
      selectedFiles: scope === 'partial' ? selectedFiles : undefined,
      skipConfigs,
      createBackup,
      dryRun,
      reason: reason || undefined,
    }),
    [scope, selectedFiles, skipConfigs, createBackup, dryRun, reason]
  )

  const preview = useMemo(
    () => getRollbackPreview(snapshot, options),
    [snapshot, options]
  )

  const dryRunResult = useMemo(
    () => (dryRun ? simulateRollback(snapshot, options) : null),
    [dryRun, snapshot, options]
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-6">
        <h2 className="text-xl font-semibold text-white">롤백 설정</h2>
        <p className="mt-1 text-sm text-gray-400">
          {snapshot.pluginName} v{snapshot.version} → v{snapshot.previousVersion || '이전'}
        </p>

        <div className="mt-6 space-y-6">
          {/* Scope Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300">롤백 범위</label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(['full', 'partial', 'config_only', 'files_only'] as RollbackScope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-lg border p-3 text-left ${
                    scope === s
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <p className={`font-medium ${scope === s ? 'text-blue-400' : 'text-white'}`}>
                    {getRollbackScopeLabel(s)}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {s === 'full' && '모든 파일과 설정 복원'}
                    {s === 'partial' && '선택한 파일만 복원'}
                    {s === 'config_only' && '설정 파일만 복원'}
                    {s === 'files_only' && '설정 제외, 파일만 복원'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* File Selection for Partial Rollback */}
          {scope === 'partial' && (
            <div>
              <label className="block text-sm font-medium text-gray-300">파일 선택</label>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 p-3">
                {snapshot.files.filter((f) => f.canRollback).map((file) => (
                  <FileSelectionItem
                    key={file.path}
                    file={file}
                    selected={selectedFiles.includes(file.path)}
                    onToggle={() => {
                      setSelectedFiles((prev) =>
                        prev.includes(file.path)
                          ? prev.filter((p) => p !== file.path)
                          : [...prev, file.path]
                      )
                    }}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {selectedFiles.length}개 파일 선택됨
              </p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={createBackup}
                onChange={(e) => setCreateBackup(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-sm text-gray-300">롤백 전 현재 상태 백업</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={skipConfigs}
                onChange={(e) => setSkipConfigs(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-sm text-gray-300">설정 파일 제외</span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-sm text-gray-300">시뮬레이션 모드 (실제 변경 없음)</span>
            </label>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-300">롤백 사유 (선택)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 새 버전에서 버그 발생"
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Preview Toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            {showPreview ? '미리보기 숨기기 ▲' : '롤백 미리보기 ▼'}
          </button>

          {/* Preview */}
          {showPreview && <RollbackPreview preview={preview} dryRunResult={dryRunResult} />}

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <p className="font-medium text-yellow-400">⚠️ 주의사항</p>
              <ul className="mt-1 text-sm text-yellow-300">
                {preview.warnings.map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-600 px-4 py-2 text-gray-300 hover:bg-gray-700"
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(options)}
            disabled={scope === 'partial' && selectedFiles.length === 0}
            className={`rounded-lg px-4 py-2 font-medium ${
              scope === 'partial' && selectedFiles.length === 0
                ? 'cursor-not-allowed bg-gray-600 text-gray-400'
                : dryRun
                  ? 'bg-yellow-500 text-black hover:bg-yellow-400'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {dryRun ? '시뮬레이션 실행' : '롤백 실행'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// File Selection Item
// ============================================

interface FileSelectionItemProps {
  file: FileChange
  selected: boolean
  onToggle: () => void
}

function FileSelectionItem({ file, selected, onToggle }: FileSelectionItemProps) {
  const typeColors = {
    created: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
  }

  return (
    <label className="flex cursor-pointer items-center gap-3 py-1 hover:bg-gray-700/30">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500"
      />
      <span className={`text-xs ${typeColors[file.type]}`}>
        {getFileChangeTypeLabel(file.type)}
      </span>
      <span className="flex-1 truncate text-sm text-gray-300">{file.path}</span>
      {file.after && (
        <span className="text-xs text-gray-500">{formatFileSize(file.after.size)}</span>
      )}
    </label>
  )
}

// ============================================
// Rollback Preview
// ============================================

interface RollbackPreviewProps {
  preview: ReturnType<typeof getRollbackPreview>
  dryRunResult: ReturnType<typeof simulateRollback> | null
}

function RollbackPreview({ preview, dryRunResult }: RollbackPreviewProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <h4 className="font-medium text-white">롤백 예상 결과</h4>

      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-400">복원할 파일</p>
          <p className="text-lg font-bold text-green-400">{preview.filesToRestore.length}개</p>
        </div>
        <div>
          <p className="text-gray-400">제외할 파일</p>
          <p className="text-lg font-bold text-gray-400">{preview.filesToSkip.length}개</p>
        </div>
        <div>
          <p className="text-gray-400">복원할 설정</p>
          <p className="text-lg font-bold text-blue-400">{preview.configsToRestore.length}개</p>
        </div>
        <div>
          <p className="text-gray-400">예상 소요 시간</p>
          <p className="text-lg font-bold text-white">{formatDuration(preview.estimatedDuration)}</p>
        </div>
      </div>

      {dryRunResult && (
        <div className="mt-4 rounded border border-green-500/30 bg-green-500/10 p-3">
          <p className="font-medium text-green-400">✓ 시뮬레이션 완료</p>
          <p className="mt-1 text-sm text-green-300">
            {dryRunResult.filesRestored}개 파일, {dryRunResult.configsRestored}개 설정이 복원됩니다.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================
// Rollback Progress
// ============================================

interface RollbackProgressProps {
  operation: RollbackOperation
}

export function RollbackProgress({ operation }: RollbackProgressProps) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">롤백 진행 중...</h3>
        <span className="text-2xl font-bold text-blue-400">{operation.progress.percentage}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${operation.progress.percentage}%` }}
        />
      </div>

      {/* Steps */}
      <div className="mt-6 space-y-3">
        {ROLLBACK_STEPS.map((step, index) => {
          const isComplete = operation.progress.completedSteps > index
          const isCurrent = operation.progress.currentStep === step.id
          const isPending = operation.progress.completedSteps < index

          return (
            <div key={step.id} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  isComplete
                    ? 'bg-green-500'
                    : isCurrent
                      ? 'bg-blue-500'
                      : 'bg-gray-700'
                }`}
              >
                {isComplete ? (
                  <span className="text-white">✓</span>
                ) : isCurrent ? (
                  <span className="animate-spin text-white">⟳</span>
                ) : (
                  <span className="text-gray-400">{index + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className={`font-medium ${isCurrent ? 'text-white' : isPending ? 'text-gray-500' : 'text-gray-300'}`}>
                  {step.label}
                </p>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* File progress */}
      <div className="mt-6 text-center text-sm text-gray-400">
        {operation.progress.filesRestored} / {operation.progress.filesTotal} 파일 복원됨
      </div>
    </div>
  )
}

// ============================================
// Rollback History
// ============================================

interface RollbackHistoryProps {
  history: Array<{
    id: string
    pluginName: string
    version: string
    scope: RollbackScope
    status: 'completed' | 'failed' | 'cancelled'
    performedAt: string
    duration: number
    filesAffected: number
    reason?: string
  }>
}

export function RollbackHistory({ history }: RollbackHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-8 text-center text-gray-400">
        롤백 이력이 없습니다
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-white">{entry.pluginName}</h4>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    entry.status === 'completed'
                      ? 'bg-green-500/20 text-green-300'
                      : entry.status === 'failed'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-gray-500/20 text-gray-300'
                  }`}
                >
                  {getRollbackStatusLabel(entry.status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-400">
                v{entry.version} · {getRollbackScopeLabel(entry.scope)}
              </p>
            </div>
            <p className="text-sm text-gray-500">
              {new Date(entry.performedAt).toLocaleString()}
            </p>
          </div>

          <div className="mt-2 flex gap-4 text-sm text-gray-400">
            <span>⏱️ {formatDuration(entry.duration)}</span>
            <span>📁 {entry.filesAffected}개 파일</span>
          </div>

          {entry.reason && (
            <p className="mt-2 text-sm text-gray-300">
              💬 {entry.reason}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================
// Compact Rollback Button
// ============================================

interface RollbackButtonProps {
  snapshot: InstallationSnapshot
  onRollback: () => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

export function RollbackButton({ snapshot, onRollback, size = 'md', disabled }: RollbackButtonProps) {
  const validation = validateSnapshotForRollback(snapshot)
  const isDisabled = disabled || !validation.valid || isSnapshotExpired(snapshot)

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'

  return (
    <button
      onClick={onRollback}
      disabled={isDisabled}
      title={!validation.valid ? validation.errors[0] : undefined}
      className={`rounded-lg font-medium ${sizeClasses} ${
        isDisabled
          ? 'cursor-not-allowed bg-gray-600 text-gray-400'
          : 'bg-blue-500 text-white hover:bg-blue-600'
      }`}
    >
      ↩️ 롤백
    </button>
  )
}
