/**
 * 스킬 본문의 구버전 라이브러리 참조 탐지.
 *
 * `cli_tools.latest_version`과 대조해 `next@13` 같은 옛 major 참조에 경고를 붙인다.
 * 스킬 검색 결과(`skills-search.ts`)에서만 쓴다.
 *
 * ## Context7 동기화는 제거됐다 (2026-09-07)
 *
 * 예전에는 `sync-cli-versions` 크론이 매일 Context7 API로 `latest_version`을 갱신했다.
 * 그 API가 돌려주는 값이 최신이 아니라(eslint를 v8, vercel을 v14 canary로 응답) 3개월간
 * 갱신이 0건이었고, 값을 쓰는 곳은 이 함수 하나뿐이라 크론을 걷어냈다.
 *
 * 그래서 `latest_version`은 **더 이상 자동으로 갱신되지 않는다.** 값이 낡으면 경고가
 * 덜 나올 뿐 틀린 경고가 나오지는 않는다 — 참조 major가 저장된 major보다 작을 때만 경고한다.
 */

/**
 * Detect stale library version references in skill content
 *
 * Looks for patterns like "stripe@14", "vite@5", "next@14" and compares
 * against cli_tools.latest_version.
 *
 * @param content - Skill content to check
 * @param versionMap - Map of tool name → latest version
 * @returns Warning message if stale versions found, undefined otherwise
 */
export function detectStaleLibraryVersions(
  content: string | null,
  versionMap: Map<string, string>
): string | undefined {
  if (!content) return undefined

  const stale: string[] = []
  // Match patterns: packageName@majorVersion (e.g., stripe@14, next@13)
  const versionRefs = content.matchAll(/(\w[\w-]*)@(\d+)(?:\.\d+)?(?:\.\d+)?/g)

  for (const match of versionRefs) {
    const pkgName = match[1].toLowerCase()
    const refMajor = parseInt(match[2], 10)

    const latestVersion = versionMap.get(pkgName)
    if (!latestVersion) continue

    const latestMajor = parseInt(latestVersion.split('.')[0], 10)
    if (refMajor < latestMajor) {
      stale.push(`${match[0]} (최신: ${latestVersion})`)
    }
  }

  if (stale.length === 0) return undefined
  return `⚠️ 구버전 라이브러리 참조: ${stale.join(', ')}`
}
