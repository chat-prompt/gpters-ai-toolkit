import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  detectGlobalInstall,
  upgradeSelf,
  type SelfUpgradeDeps,
} from '../../src/commands/self-upgrade.js'

const ROOT = '/usr/local/lib/node_modules'
const PKG = `${ROOT}/@gpters/aitk`

/** npm 전역 설치본 한 벌을 흉내 낸다. npm 호출은 calls 에 쌓인다 */
function fakeDeps(overrides: Partial<SelfUpgradeDeps> & { latest?: string | null; installOk?: boolean; installedVersion?: string } = {}) {
  const calls: string[][] = []
  const { latest = '0.7.22', installOk = true, installedVersion, ...rest } = overrides
  let installed = '0.7.21'
  const deps: SelfUpgradeDeps = {
    entryPath: `${ROOT}/../../bin/aitk`,
    currentVersion: '0.7.21',
    npm: args => {
      calls.push(args)
      if (args[0] === 'root') return ROOT
      if (args[0] === 'view') return latest
      if (args[0] === 'install') {
        if (!installOk) return null
        installed = installedVersion ?? args[2].split('@').pop()!
        return 'changed 1 package'
      }
      return null
    },
    // bin/aitk 심링크가 전역 패키지의 dist 로 풀린다
    realpath: path => (path.endsWith('/bin/aitk') ? `${PKG}/dist/bin/aitk.js` : path),
    isSymlink: () => false,
    isWritable: () => true,
    readVersion: () => installed,
    ...rest,
  }
  return { deps, calls }
}

describe('compareVersions', () => {
  it('번호를 숫자로 비교한다', () => {
    expect(compareVersions('0.7.10', '0.7.9')).toBeGreaterThan(0)
    expect(compareVersions('0.7.21', '0.7.21')).toBe(0)
    expect(compareVersions('0.6.99', '0.7.0')).toBeLessThan(0)
  })

  it('prerelease 는 같은 번호의 정식보다 낮고, 더 높은 번호보다도 낮다', () => {
    expect(compareVersions('0.7.11-native.3', '0.7.11')).toBeLessThan(0)
    expect(compareVersions('0.7.21', '0.7.11-native.3')).toBeGreaterThan(0)
  })
})

describe('detectGlobalInstall', () => {
  it('npm 전역 설치본이면 설치 디렉터리를 돌려준다', () => {
    expect(detectGlobalInstall(fakeDeps().deps)).toEqual({ pkgDir: PKG })
  })

  it('npm link 로 연결된 개발본은 건드리지 않는다', () => {
    const { deps } = fakeDeps({ isSymlink: path => path === PKG })
    expect(detectGlobalInstall(deps)).toEqual({ reason: expect.stringContaining('npm link') })
  })

  it('전역 경로 밖(npx 캐시·저장소 빌드)에서 실행 중이면 건드리지 않는다', () => {
    const { deps } = fakeDeps({ entryPath: '/home/bot/aitk/dist/bin/aitk.js', realpath: path => path })
    expect(detectGlobalInstall(deps)).toEqual({ reason: expect.stringContaining('전역 설치본이 아닙니다') })
  })

  it('이름만 겹치는 형제 디렉터리를 전역 설치본으로 오인하지 않는다', () => {
    const { deps } = fakeDeps({ realpath: path => (path === PKG ? PKG : `${PKG}-dev/dist/bin/aitk.js`) })
    expect(detectGlobalInstall(deps)).toEqual({ reason: expect.stringContaining('전역 설치본이 아닙니다') })
  })

  it('전역 경로에 쓸 수 없으면(sudo 설치) 건드리지 않는다', () => {
    const { deps } = fakeDeps({ isWritable: () => false })
    expect(detectGlobalInstall(deps)).toEqual({ reason: expect.stringContaining('쓰기 권한') })
  })

  it('npm 전역 경로를 모르면 건드리지 않는다', () => {
    const { deps } = fakeDeps({ npm: () => null })
    expect(detectGlobalInstall(deps)).toEqual({ reason: expect.stringContaining('전역 경로') })
  })
})

describe('upgradeSelf', () => {
  it('npm 최신이 더 높으면 조회한 버전을 고정해 설치한다', () => {
    const { deps, calls } = fakeDeps()
    expect(upgradeSelf(deps)).toEqual({ status: 'upgraded', current: '0.7.21', latest: '0.7.22' })
    expect(calls).toContainEqual(['install', '-g', '@gpters/aitk@0.7.22', '--no-fund', '--no-audit'])
  })

  it('이미 최신이거나 더 높으면 설치하지 않는다', () => {
    for (const latest of ['0.7.21', '0.7.20']) {
      const { deps, calls } = fakeDeps({ latest })
      expect(upgradeSelf(deps).status).toBe('current')
      expect(calls.some(args => args[0] === 'install')).toBe(false)
    }
  })

  it('건드리지 않을 설치면 레지스트리도 조회하지 않는다', () => {
    const { deps, calls } = fakeDeps({ isSymlink: () => true })
    expect(upgradeSelf(deps).status).toBe('skipped')
    expect(calls.some(args => args[0] === 'view')).toBe(false)
  })

  it('레지스트리를 못 읽으면 실패로 보고한다', () => {
    const { deps } = fakeDeps({ latest: null })
    expect(upgradeSelf(deps)).toMatchObject({ status: 'failed', reason: expect.stringContaining('레지스트리') })
  })

  it('설치 명령이 실패하면 실패로 보고한다', () => {
    const { deps } = fakeDeps({ installOk: false })
    expect(upgradeSelf(deps)).toMatchObject({ status: 'failed', latest: '0.7.22' })
  })

  it('설치 후 버전이 기대와 다르면 성공으로 치지 않는다', () => {
    const { deps } = fakeDeps({ installedVersion: '0.7.21' })
    expect(upgradeSelf(deps)).toMatchObject({ status: 'failed', reason: expect.stringContaining('0.7.21') })
  })
})
