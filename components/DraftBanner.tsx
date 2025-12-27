interface DraftBannerProps {
  className?: string
}

export function DraftBanner({ className = '' }: DraftBannerProps) {
  return (
    <div
      className={`rounded-xl p-4 mb-8 bg-yellow-500/10 border border-yellow-500/30 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">🚧</span>
        <div>
          <div className="text-sm font-medium text-yellow-400">Draft</div>
          <p className="text-xs text-yellow-400/70 mt-0.5">
            이 아이템은 아직 작성 중이며 공개 카탈로그에 표시되지 않습니다.
          </p>
        </div>
      </div>
    </div>
  )
}
