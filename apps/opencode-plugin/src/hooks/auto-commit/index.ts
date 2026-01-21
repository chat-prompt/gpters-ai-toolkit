import type { PluginInput } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"
import { HOOK_NAME, COOLDOWN_MS } from "./constants"
import { COMMIT_AGENT_NAME } from "../../commands/commit"
import type { Todo, AutoCommitState, GitStatus } from "./types"
import { createLogger } from "../../utils/logger"

const logger = createLogger(HOOK_NAME)

function log(message: string, data?: unknown): void {
  logger.debug(message, data)
}

function getGitStatus(directory: string): GitStatus | null {
  try {
    const result = execSync("git status --porcelain", {
      cwd: directory,
      encoding: "utf-8",
      timeout: 5000,
    })

    const lines = result.trim().split("\n").filter(Boolean)

    const staged: string[] = []
    const unstaged: string[] = []
    const untracked: string[] = []

    for (const line of lines) {
      const indexStatus = line[0]
      const workTreeStatus = line[1]
      const filePath = line.slice(3)

      if (indexStatus === "?") {
        untracked.push(filePath)
      } else if (indexStatus !== " ") {
        staged.push(filePath)
      }

      if (workTreeStatus !== " " && workTreeStatus !== "?") {
        unstaged.push(filePath)
      }
    }

    return {
      hasChanges: lines.length > 0,
      staged,
      unstaged,
      untracked,
    }
  } catch {
    return null
  }
}

function areAllTodosComplete(todos: Todo[]): boolean {
  if (todos.length === 0) return false
  return todos.every((t) => t.status === "completed" || t.status === "cancelled")
}

export function createAutoCommitHook(ctx: PluginInput) {
  const { directory, client } = ctx

  const stateMap = new Map<string, AutoCommitState>()

  function getState(sessionID: string): AutoCommitState {
    let state = stateMap.get(sessionID)
    if (!state) {
      state = {
        lastCommitAttempt: 0,
        isProcessing: false,
        completedTodoIds: new Set(),
      }
      stateMap.set(sessionID, state)
    }
    return state
  }

  async function showToast(title: string, message: string, variant: "info" | "success" | "error" = "info"): Promise<void> {
    await client.tui.showToast({
      body: { title, message, variant, duration: 3000 },
    }).catch(() => { })
  }

  async function triggerAutoCommit(sessionID: string): Promise<void> {
    const state = getState(sessionID)

    const now = Date.now()
    if (now - state.lastCommitAttempt < COOLDOWN_MS) {
      log("Skipped: cooldown active", { sessionID })
      return
    }

    if (state.isProcessing) {
      log("Skipped: already processing", { sessionID })
      return
    }

    const gitStatus = getGitStatus(directory)
    if (!gitStatus) {
      log("Skipped: not a git repository or git error", { sessionID })
      return
    }

    if (!gitStatus.hasChanges) {
      log("Skipped: no changes to commit", { sessionID })
      return
    }

    state.isProcessing = true
    state.lastCommitAttempt = now

    try {
      const fileCount = gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length

      log("Triggering auto-commit subtask", {
        sessionID,
        staged: gitStatus.staged.length,
        unstaged: gitStatus.unstaged.length,
        untracked: gitStatus.untracked.length,
      })

      await showToast("Auto-commit", `Creating commits for ${fileCount} file(s)...`, "info")

      await client.session.prompt({
        path: { id: sessionID },
        body: {
          parts: [{
            type: "subtask",
            prompt: "Create atomic commits for current changes",
            description: "Auto-commit",
            agent: COMMIT_AGENT_NAME,
          }],
        },
      })

      log("Auto-commit triggered as subtask", { sessionID })
    } catch (err) {
      log("Failed to trigger auto-commit", { sessionID, error: String(err) })
      await showToast("Auto-commit", "Failed to trigger auto-commit", "error")
    } finally {
      state.isProcessing = false
    }
  }

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      const props = event.properties as Record<string, unknown> | undefined

      if (event.type === "session.deleted") {
        const info = props?.info as { id?: string } | undefined
        const sessionID = info?.id
        if (sessionID) {
          stateMap.delete(sessionID)
          log("Session state cleaned up", { sessionID })
        }
        return
      }

      if (event.type === "session.idle") {
        const sessionID = props?.sessionID as string | undefined
        if (!sessionID) return

        log("session.idle detected", { sessionID })

        const state = getState(sessionID)
        if (state.isProcessing) {
          log("Skipped: already processing", { sessionID })
          return
        }

        let todos: Todo[] = []
        try {
          const response = await client.session.todo({ path: { id: sessionID } })
          todos = (response.data ?? response) as Todo[]
        } catch (err) {
          log("Failed to fetch todos", { sessionID, error: String(err) })
          return
        }

        if (!todos || todos.length === 0) {
          log("No todos found", { sessionID })
          return
        }

        if (!areAllTodosComplete(todos)) {
          log("Not all todos complete", {
            sessionID,
            total: todos.length,
            completed: todos.filter((t) => t.status === "completed").length,
          })
          return
        }

        const currentCompletedIds = new Set(
          todos.filter((t) => t.status === "completed").map((t) => t.id)
        )

        const hasNewCompletions = [...currentCompletedIds].some(
          (id) => !state.completedTodoIds.has(id)
        )

        if (!hasNewCompletions && state.completedTodoIds.size > 0) {
          log("Skipped: no new completions since last check", { sessionID })
          return
        }

        state.completedTodoIds = currentCompletedIds

        await triggerAutoCommit(sessionID)
      }
    },
  }
}
