import { spawn } from "node:child_process"
import type { GitCommandResult } from "./types"

/**
 * 원격 저장소에서 최신 정보 가져오기
 */
export async function fetchOrigin(cwd: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["fetch", "origin"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""

    child.stderr.on("data", (data) => {
      stderr += data
    })

    child.on("close", (code) => {
      resolve(code === 0 ? { success: true } : { success: false, error: stderr.trim() })
    })

    child.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

/**
 * 현재 브랜치를 원격과 동기화 (pull --rebase)
 */
export async function pullRebase(cwd: string): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const child = spawn("git", ["pull", "--rebase"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""

    child.stderr.on("data", (data) => {
      stderr += data
    })

    child.on("close", (code) => {
      resolve(code === 0 ? { success: true } : { success: false, error: stderr.trim() })
    })

    child.on("error", (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

/**
 * fetch + pull --rebase를 순차 실행
 */
export async function syncWithOrigin(cwd: string): Promise<GitCommandResult> {
  const fetchResult = await fetchOrigin(cwd)
  if (!fetchResult.success) {
    return { success: false, error: `fetch failed: ${fetchResult.error}` }
  }

  const pullResult = await pullRebase(cwd)
  if (!pullResult.success) {
    return { success: false, error: `pull failed: ${pullResult.error}` }
  }

  return { success: true }
}

export async function getMergedBranches(cwd: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["pr", "list", "--state", "merged", "--limit", "100", "--json", "headRefName"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""

    child.stdout.on("data", (data) => {
      stdout += data
    })

    child.on("close", (code) => {
      if (code !== 0) {
        resolve([])
        return
      }
      try {
        const prs = JSON.parse(stdout) as Array<{ headRefName: string }>
        resolve(prs.map((pr) => pr.headRefName))
      } catch {
        resolve([])
      }
    })

    child.on("error", () => {
      resolve([])
    })
  })
}

export async function checkBranchMerged(cwd: string, branchName: string): Promise<{ merged: boolean; prNumber?: number }> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["pr", "list", "--head", branchName, "--state", "merged", "--json", "number"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""

    child.stdout.on("data", (data) => {
      stdout += data
    })

    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ merged: false })
        return
      }
      try {
        const prs = JSON.parse(stdout) as Array<{ number: number }>
        if (prs.length > 0) {
          resolve({ merged: true, prNumber: prs[0].number })
        } else {
          resolve({ merged: false })
        }
      } catch {
        resolve({ merged: false })
      }
    })

    child.on("error", () => {
      resolve({ merged: false })
    })
  })
}
