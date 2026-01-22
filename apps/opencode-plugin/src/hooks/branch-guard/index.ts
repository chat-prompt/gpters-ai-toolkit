import type { PluginInput } from "@opencode-ai/plugin"
import type { BranchGuardState, PendingBranchChoice } from "./types"
import { BRANCH_GUARD_CONFIG } from "./config"
import { getCurrentBranch, getExistingBranches, isProtectedBranch, isGitRepository, findSimilarBranch } from "./detector"
import { generateBranchName } from "./name-extractor"
import { hasUncommittedChanges, stashChanges, popStash } from "./stash-manager"
import { createBranch, checkoutBranch } from "./creator"
import { createLogger } from "../../utils/logger"

const logger = createLogger("branch-guard")

export function createBranchGuardHook(ctx: PluginInput) {
  const state: BranchGuardState = {
    hasChecked: false,
    sessionId: null,
    pendingBranchChoice: null,
  }

  async function showToast(title: string, message: string, variant: "info" | "success" | "warning" | "error", duration = 5000) {
    try {
      await ctx.client.tui.showToast({
        body: { title, message, variant, duration },
      })
    } catch (err) {
      logger.error("Toast error:", err)
    }
  }

  async function handleBranchCreation(suggestedBranch: string, hasStashed: boolean) {
    const result = await createBranch(ctx.directory, suggestedBranch)

    if (result.success) {
      await showToast("✨ 새 작업 브랜치 생성", suggestedBranch, "success")
      logger.info(`Created branch: ${suggestedBranch}`)

      if (hasStashed) {
        const popResult = await popStash(ctx.directory)
        if (popResult.success) {
          await showToast("📦 변경사항 복원", "stash 했던 내용을 복원했습니다", "info", 3000)
        }
      }
    } else {
      await showToast("⚠️ 브랜치 생성 실패", result.error ?? "알 수 없는 오류", "error")
      logger.error(`Failed to create branch: ${result.error}`)
    }
  }

  async function handleBranchCheckout(branchName: string, hasStashed: boolean) {
    const result = await checkoutBranch(ctx.directory, branchName)

    if (result.success) {
      await showToast("✅ 기존 브랜치로 전환", branchName, "success")
      logger.info(`Checked out branch: ${branchName}`)

      if (hasStashed) {
        const popResult = await popStash(ctx.directory)
        if (popResult.success) {
          await showToast("📦 변경사항 복원", "stash 했던 내용을 복원했습니다", "info", 3000)
        }
      }
    } else {
      await showToast("⚠️ 브랜치 전환 실패", result.error ?? "알 수 없는 오류", "error")
      logger.error(`Failed to checkout branch: ${result.error}`)
    }
  }

  function extractMessageContent(output: { parts: Array<{ type: string; text?: string }> }): string {
    const textPart = output.parts?.find((p) => p.type === "text")
    return textPart?.text ?? ""
  }

  function detectUserChoice(message: string): "existing" | "new" | null {
    const lower = message.toLowerCase()

    if (lower.includes("기존") || lower.includes("1") || lower.includes("existing") || lower.includes("use existing")) {
      return "existing"
    }

    if (lower.includes("새") || lower.includes("2") || lower.includes("new") || lower.includes("create new")) {
      return "new"
    }

    return null
  }

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return

      const props = event.properties as { info?: { id: string; parentID?: string } } | undefined

      if (props?.info?.parentID) return

      state.sessionId = props?.info?.id ?? null
      state.hasChecked = false
      state.pendingBranchChoice = null

      logger.info(`Session created: ${state.sessionId}`)
    },

    "chat.message": async (
      input: { sessionID: string },
      output: { parts: Array<{ type: string; text?: string }> }
    ) => {
      if (!BRANCH_GUARD_CONFIG.enabled) return

      if (state.pendingBranchChoice) {
        const userMessage = extractMessageContent(output)
        const choice = detectUserChoice(userMessage)

        if (choice) {
          const { existing, suggested, hasStashed } = state.pendingBranchChoice

          if (choice === "existing") {
            await handleBranchCheckout(existing, hasStashed)
          } else {
            await handleBranchCreation(suggested, hasStashed)
          }

          state.pendingBranchChoice = null
        }
        return
      }

      if (state.hasChecked) return
      state.hasChecked = true

      const isGitRepo = await isGitRepository(ctx.directory)
      if (!isGitRepo) {
        logger.info("Not a git repository, skipping")
        return
      }

      const currentBranch = await getCurrentBranch(ctx.directory)
      if (!isProtectedBranch(currentBranch)) {
        logger.info(`On ${currentBranch}, not protected, skipping`)
        return
      }

      logger.info(`Protected branch detected: ${currentBranch}`)

      let hasStashed = false
      const hasChanges = await hasUncommittedChanges(ctx.directory)
      if (hasChanges) {
        const stashResult = await stashChanges(ctx.directory, "[branch-guard] Auto stash before branch switch")
        if (stashResult.success) {
          hasStashed = true
          await showToast("📦 변경사항 임시 저장", "작업 중이던 내용을 stash 했습니다", "info", 3000)
          logger.info("Changes stashed")
        } else {
          logger.error(`Failed to stash: ${stashResult.error}`)
        }
      }

      const userMessage = extractMessageContent(output)
      const suggestedBranch = generateBranchName(userMessage)

      const existingBranches = await getExistingBranches(ctx.directory, BRANCH_GUARD_CONFIG.branchPrefix)
      const similarBranch = findSimilarBranch(suggestedBranch, existingBranches)

      if (similarBranch) {
        state.pendingBranchChoice = {
          existing: similarBranch,
          suggested: suggestedBranch,
          hasStashed,
        }
        logger.info(`Similar branch found: ${similarBranch}, waiting for user choice`)
      } else {
        await handleBranchCreation(suggestedBranch, hasStashed)
      }
    },

    "experimental.text.complete": async (
      input: { sessionID: string; messageID: string; partID: string },
      output: { text: string }
    ) => {
      if (!state.pendingBranchChoice) return

      const { existing, suggested } = state.pendingBranchChoice

      const choicePrompt = `---
🛡️ **브랜치 선택이 필요합니다**

기존에 비슷한 작업 브랜치가 있어요:
- 기존: \`${existing}\`
- 새로 만들기: \`${suggested}\`

**어떤 브랜치를 사용할까요?**
1. "기존 브랜치" - \`${existing}\` 사용
2. "새 브랜치" - \`${suggested}\` 새로 생성

(원하시는 옵션을 말씀해주세요)

---

`
      output.text = choicePrompt + output.text
    },
  }
}
