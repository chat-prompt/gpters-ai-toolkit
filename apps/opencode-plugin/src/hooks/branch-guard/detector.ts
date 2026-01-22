import { spawn } from "node:child_process"
import type { GitCommandResult } from "./types"
import { BRANCH_GUARD_CONFIG } from "./config"

/**
 * 현재 브랜치명 조회
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("git", ["branch", "--show-current"], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""

    child.stdout.on("data", (data) => {
      output += data
    })

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output.trim() || null)
      } else {
        resolve(null)
      }
    })

    child.on("error", () => {
      resolve(null)
    })
  })
}

/**
 * 특정 prefix로 시작하는 브랜치 목록 조회
 */
export async function getExistingBranches(cwd: string, prefix: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn("git", ["branch", "--list", `${prefix}*`], { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let output = ""

    child.stdout.on("data", (data) => {
      output += data
    })

    child.on("close", () => {
      const branches = output
        .split("\n")
        .map((b) => b.trim().replace(/^\*?\s*/, ""))
        .filter(Boolean)
      resolve(branches)
    })

    child.on("error", () => {
      resolve([])
    })
  })
}

/**
 * 보호 브랜치인지 확인
 */
export function isProtectedBranch(branch: string | null): boolean {
  if (!branch) return false
  return BRANCH_GUARD_CONFIG.protectedBranches.includes(branch)
}

/**
 * Git 저장소인지 확인
 */
export async function isGitRepository(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: ["ignore", "pipe", "pipe"] })

    child.on("close", (code) => {
      resolve(code === 0)
    })

    child.on("error", () => {
      resolve(false)
    })
  })
}

export function filterMergedBranches(localBranches: string[], mergedBranches: string[]): string[] {
  const mergedSet = new Set(mergedBranches)
  return localBranches.filter((branch) => !mergedSet.has(branch))
}

export function findSimilarBranch(suggestedBranch: string, existingBranches: string[]): string | null {
  const featureNameMatch = suggestedBranch.match(/feature\/\d{8}-(.+)/)
  if (!featureNameMatch) return null

  const featureName = featureNameMatch[1]

  for (const branch of existingBranches) {
    if (branch.includes(featureName)) {
      return branch
    }
  }

  return null
}
