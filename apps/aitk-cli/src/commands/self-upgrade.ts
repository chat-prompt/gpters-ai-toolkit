/**
 * aitk 자기 업그레이드 — npm 전역 설치본일 때만 npm 최신 버전으로 올린다
 *
 * 플러그인 SessionStart 훅이 하루 한 번 자동으로 부르므로, 건드리면 안 되는 설치는
 * 사유만 돌려주고 끝낸다: npm link 로 연결한 개발본, npx 캐시, 저장소 빌드를 쓰는
 * 사내 에이전트, 쓰기 권한이 없는 전역 경로(sudo 설치).
 */

import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

/** npm 패키지 이름 */
export const PACKAGE_NAME = '@gpters/aitk'

/** 자기 업그레이드 결과 */
export interface SelfUpgradeResult {
  /** upgraded: 올렸다 · current: 이미 최신 · skipped: 건드리지 않을 설치 · failed: 시도했지만 실패 */
  status: 'upgraded' | 'current' | 'skipped' | 'failed'
  /** 실행 중인 aitk 버전 */
  current: string
  /** npm 최신 버전 (조회했을 때만) */
  latest?: string
  /** skipped·failed 사유 */
  reason?: string
}

/** 테스트에서 바꿔 끼우는 외부 의존성 */
export interface SelfUpgradeDeps {
  /** 실행 중인 aitk 진입 파일 (process.argv[1]) */
  entryPath: string
  /** 실행 중인 aitk 버전 */
  currentVersion: string
  /** npm 실행 — 성공하면 stdout, 실패하면 null */
  npm: (args: string[], timeoutMs: number) => string | null
  realpath: (path: string) => string
  isSymlink: (path: string) => boolean
  isWritable: (path: string) => boolean
  /** 설치 디렉터리의 package.json 버전 */
  readVersion: (pkgDir: string) => string | null
}

/**
 * semver 비교 — a 가 b 보다 높으면 양수, 같으면 0, 낮으면 음수
 *
 * prerelease(`-native.3` 등)는 같은 번호의 정식 버전보다 낮다.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/, '').split('-', 2)
    return { nums: core.split('.').map(n => Number.parseInt(n, 10) || 0), pre }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) {
    const diff = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre.localeCompare(y.pre, undefined, { numeric: true })
}

/**
 * 실행 중인 aitk 가 npm 전역 설치본인지 판정한다
 *
 * @returns 전역 설치본이면 설치 디렉터리, 아니면 건드리지 않을 사유
 */
export function detectGlobalInstall(deps: SelfUpgradeDeps): { pkgDir: string } | { reason: string } {
  const globalRoot = deps.npm(['root', '-g'], 15_000)
  if (!globalRoot) return { reason: 'npm 전역 경로를 알 수 없습니다' }

  const pkgDir = join(globalRoot, ...PACKAGE_NAME.split('/'))
  if (deps.isSymlink(pkgDir)) return { reason: 'npm link 로 연결된 개발본입니다' }

  let entry: string
  let root: string
  try {
    entry = deps.realpath(deps.entryPath)
    root = deps.realpath(pkgDir)
  } catch {
    return { reason: 'npm 전역 설치본이 아닙니다 (npx·저장소 빌드 등)' }
  }
  if (!entry.startsWith(root + sep)) return { reason: 'npm 전역 설치본이 아닙니다 (npx·저장소 빌드 등)' }
  if (!deps.isWritable(globalRoot)) return { reason: 'npm 전역 경로에 쓰기 권한이 없습니다' }

  return { pkgDir }
}

/**
 * npm 최신 버전이 더 높으면 전역 설치본을 그 버전으로 올린다
 */
export function upgradeSelf(deps: SelfUpgradeDeps): SelfUpgradeResult {
  const current = deps.currentVersion

  // 설치 판정을 먼저 한다 — 건드리지 않을 설치라면 레지스트리 조회도 필요 없다
  const install = detectGlobalInstall(deps)
  if ('reason' in install) return { status: 'skipped', current, reason: install.reason }

  const latest = deps.npm(['view', PACKAGE_NAME, 'version'], 30_000)
  if (!latest) return { status: 'failed', current, reason: 'npm 레지스트리에서 최신 버전을 읽지 못했습니다' }
  if (compareVersions(latest, current) <= 0) return { status: 'current', current, latest }

  // 조회한 버전을 고정해 설치한다 — `@latest` 는 조회와 설치 사이에 바뀔 수 있다
  const output = deps.npm(['install', '-g', `${PACKAGE_NAME}@${latest}`, '--no-fund', '--no-audit'], 300_000)
  if (output === null) return { status: 'failed', current, latest, reason: 'npm install -g 가 실패했습니다' }

  const installed = deps.readVersion(install.pkgDir)
  if (installed !== latest) {
    return { status: 'failed', current, latest, reason: `설치 후 버전이 ${installed ?? '알 수 없음'} 입니다` }
  }
  return { status: 'upgraded', current, latest }
}

/**
 * 실제 환경의 의존성
 *
 * npm 은 실행 중인 node 옆의 것을 우선 쓴다 — 버전 매니저(mise·nvm)는 node 버전마다
 * 전역 경로가 달라, PATH 의 npm 이 다른 node 의 전역 경로를 가리킬 수 있다.
 */
export function defaultSelfUpgradeDeps(currentVersion: string): SelfUpgradeDeps {
  const siblingNpm = join(dirname(process.execPath), 'npm')
  const npmBin = existsSync(siblingNpm) ? siblingNpm : 'npm'

  return {
    entryPath: process.argv[1] ?? '',
    currentVersion,
    npm: (args, timeoutMs) => {
      try {
        return execFileSync(npmBin, args, {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: timeoutMs,
        }).trim()
      } catch {
        return null
      }
    },
    realpath: path => realpathSync(path),
    isSymlink: path => {
      try {
        return lstatSync(path).isSymbolicLink()
      } catch {
        return false
      }
    },
    isWritable: path => {
      try {
        accessSync(path, constants.W_OK)
        return true
      } catch {
        return false
      }
    },
    readVersion: pkgDir => {
      try {
        return (JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8')) as { version?: string }).version ?? null
      } catch {
        return null
      }
    },
  }
}

/** 결과를 사람이 읽는 한 줄로 */
export function describeSelfUpgrade(result: SelfUpgradeResult): string {
  switch (result.status) {
    case 'upgraded':
      return `aitk ${result.current} → ${result.latest} 로 올렸습니다`
    case 'current':
      return `aitk ${result.current} — 최신입니다`
    case 'skipped':
      return `aitk ${result.current} — 자동 업그레이드 대상이 아닙니다: ${result.reason}`
    case 'failed':
      return `aitk ${result.current} — 업그레이드 실패: ${result.reason}`
  }
}
