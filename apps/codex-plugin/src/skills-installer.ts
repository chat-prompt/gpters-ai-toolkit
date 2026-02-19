/**
 * 스킬 파일을 대상 디렉토리에 복사하는 유틸리티
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'

/**
 * 스킬 설치 결과
 */
export interface InstallResult {
  /** 복사된 스킬 이름 목록 */
  copied: string[]
  /** 이미 존재하여 건너뛴 스킬 이름 목록 */
  skipped: string[]
}

/**
 * 패키지 내장 skills 디렉토리 경로를 반환한다.
 * import.meta.url 기반으로 패키지 위치를 해석한다.
 *
 * @param baseUrl - import.meta.url 값
 * @returns skills 디렉토리 절대 경로
 */
export function resolveSkillsSource(baseUrl: string): string {
  const fileUrl = new URL(baseUrl)
  const dir = fileUrl.pathname.replace(/\/[^/]+$/, '')
  return join(dir, '..', 'skills')
}

/**
 * 단일 스킬 디렉토리를 대상에 복사한다.
 *
 * @param srcDir - 소스 스킬 디렉토리 (예: skills/commit)
 * @param destDir - 대상 스킬 디렉토리 (예: .agents/skills/gpters/commit)
 * @param force - true면 기존 파일 덮어쓰기
 * @returns 복사된 파일 수
 */
function copySkillDir(srcDir: string, destDir: string, force: boolean): number {
  let count = 0
  mkdirSync(destDir, { recursive: true })

  const entries = readdirSync(srcDir)
  for (const entry of entries) {
    const srcPath = join(srcDir, entry)
    const destPath = join(destDir, entry)
    const stat = statSync(srcPath)

    if (stat.isDirectory()) {
      count += copySkillDir(srcPath, destPath, force)
    } else {
      if (!force && existsSync(destPath)) {
        continue
      }
      const content = readFileSync(srcPath, 'utf-8')
      writeFileSync(destPath, content, 'utf-8')
      count++
    }
  }
  return count
}

/**
 * 패키지 내장 스킬을 대상 디렉토리에 복사한다.
 *
 * @param skillsSourceDir - 패키지 내 skills 디렉토리 경로
 * @param targetDir - 대상 스킬 디렉토리 (예: .agents/skills/gpters/)
 * @param force - true면 기존 파일 덮어쓰기 (기본값: false)
 * @returns 복사/건너뛰기 결과
 */
export function installSkills(
  skillsSourceDir: string,
  targetDir: string,
  force = false
): InstallResult {
  const result: InstallResult = { copied: [], skipped: [] }

  if (!existsSync(skillsSourceDir)) {
    return result
  }

  const skills = readdirSync(skillsSourceDir).filter((name) => {
    const fullPath = join(skillsSourceDir, name)
    return statSync(fullPath).isDirectory()
  })

  for (const skillName of skills) {
    const srcDir = join(skillsSourceDir, skillName)
    const destDir = join(targetDir, skillName)

    if (!force && existsSync(destDir)) {
      result.skipped.push(skillName)
      continue
    }

    copySkillDir(srcDir, destDir, force)
    result.copied.push(skillName)
  }

  return result
}

/**
 * AGENTS.md 템플릿을 대상 경로에 복사한다.
 *
 * @param templatePath - 템플릿 파일 경로
 * @param destPath - 대상 파일 경로
 * @param force - true면 기존 파일 덮어쓰기 (기본값: false)
 * @returns 'created' (생성됨), 'skipped' (이미 존재), 'not_found' (템플릿 없음)
 */
export function installAgentsMd(
  templatePath: string,
  destPath: string,
  force = false
): 'created' | 'skipped' | 'not_found' {
  if (!existsSync(templatePath)) {
    return 'not_found'
  }

  if (!force && existsSync(destPath)) {
    return 'skipped'
  }

  const content = readFileSync(templatePath, 'utf-8')
  writeFileSync(destPath, content, 'utf-8')
  return 'created'
}
