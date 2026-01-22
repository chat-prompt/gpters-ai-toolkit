import type { PluginInput } from "@opencode-ai/plugin"
import type { BranchGuardState, PendingAction } from "./types"
import { BRANCH_GUARD_CONFIG } from "./config"
import { getCurrentBranch, getExistingBranches, isProtectedBranch, isGitRepository, findSimilarBranch, filterMergedBranches } from "./detector"
import { generateBranchName } from "./name-extractor"
import { hasUncommittedChanges, stashChanges, popStash } from "./stash-manager"
import { syncWithOrigin, getMergedBranches, checkBranchMerged } from "./git-sync"
import { createBranch, checkoutBranch } from "./creator"
import { createLogger } from "../../utils/logger"

const logger = createLogger("branch-guard")

export function createBranchGuardHook(ctx: PluginInput) {
  const state: BranchGuardState = {
    hasChecked: false,
    sessionId: null,
    pendingAction: null,
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

  function detectUserChoice(message: string): "existing" | "new" | "skip" | null {
    const lower = message.toLowerCase()

    if (lower.includes("기존") || lower.includes("1") || lower.includes("existing")) {
      return "existing"
    }

    if (lower.includes("새") || lower.includes("생성") || lower.includes("2") || lower.includes("new") || lower.includes("create")) {
      return "new"
    }

    if (lower.includes("스킵") || lower.includes("skip") || lower.includes("3") || lower.includes("그냥") || lower.includes("넘어")) {
      return "skip"
    }

    return null
  }

  async function handleProtectedBranch(currentBranch: string, userMessage: string) {
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

    const syncResult = await syncWithOrigin(ctx.directory)
    if (syncResult.success) {
      await showToast("🔄 브랜치 최신화", `${currentBranch} 브랜치를 최신 상태로 업데이트했습니다`, "info", 3000)
      logger.info(`Synced ${currentBranch} with origin`)
    } else {
      logger.warn(`Failed to sync: ${syncResult.error}`)
    }

    const suggestedBranch = generateBranchName(userMessage)

    const localBranches = await getExistingBranches(ctx.directory, BRANCH_GUARD_CONFIG.branchPrefix)
    const mergedBranches = await getMergedBranches(ctx.directory)
    const activeBranches = filterMergedBranches(localBranches, mergedBranches)
    const similarBranch = findSimilarBranch(suggestedBranch, activeBranches)

    if (similarBranch) {
      state.pendingAction = {
        type: "choose_branch",
        suggestedBranch,
        existingBranch: similarBranch,
        hasStashed,
      }
      logger.info(`Similar branch found: ${similarBranch}, waiting for user choice`)
    } else {
      state.pendingAction = {
        type: "confirm_create",
        suggestedBranch,
        hasStashed,
      }
      logger.info(`No similar branch, asking to create: ${suggestedBranch}`)
    }
  }

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return

      const props = event.properties as { info?: { id: string; parentID?: string } } | undefined

      if (props?.info?.parentID) return

      state.sessionId = props?.info?.id ?? null
      state.hasChecked = false
      state.pendingAction = null

      logger.info(`Session created: ${state.sessionId}`)
    },

    "chat.message": async (
      input: { sessionID: string },
      output: { parts: Array<{ type: string; text?: string }> }
    ) => {
      if (!BRANCH_GUARD_CONFIG.enabled) return

      if (state.pendingAction) {
        const userMessage = extractMessageContent(output)
        const choice = detectUserChoice(userMessage)

        if (choice) {
          const { suggestedBranch, existingBranch, hasStashed } = state.pendingAction

          if (choice === "existing" && existingBranch) {
            await handleBranchCheckout(existingBranch, hasStashed)
          } else if (choice === "new") {
            await handleBranchCreation(suggestedBranch, hasStashed)
          } else if (choice === "skip") {
            await showToast("⏭️ 브랜치 생성 스킵", "현재 브랜치에서 계속합니다", "info", 3000)
            if (hasStashed) {
              const popResult = await popStash(ctx.directory)
              if (popResult.success) {
                await showToast("📦 변경사항 복원", "stash 했던 내용을 복원했습니다", "info", 3000)
              }
            }
          }

          state.pendingAction = null
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
      if (!currentBranch) {
        logger.info("Could not determine current branch")
        return
      }

      const userMessage = extractMessageContent(output)

      if (isProtectedBranch(currentBranch)) {
        logger.info(`Case A: Protected branch detected: ${currentBranch}`)
        await handleProtectedBranch(currentBranch, userMessage)
      } else {
        logger.info(`Case B: Feature branch detected: ${currentBranch}`)

        const { merged, prNumber } = await checkBranchMerged(ctx.directory, currentBranch)

        if (merged) {
          await showToast(
            "✅ 브랜치 머지 완료",
            `${currentBranch}가 이미 머지되었습니다 (PR #${prNumber}). main으로 이동합니다.`,
            "success",
            5000
          )
          logger.info(`Branch ${currentBranch} was merged (PR #${prNumber}), switching to main`)

          const checkoutResult = await checkoutBranch(ctx.directory, "main")
          if (checkoutResult.success) {
            await handleProtectedBranch("main", userMessage)
          } else {
            logger.error(`Failed to checkout main: ${checkoutResult.error}`)
          }
        } else {
          logger.info(`Branch ${currentBranch} not merged, continuing on current branch`)
        }
      }
    },

    "experimental.text.complete": async (
      input: { sessionID: string; messageID: string; partID: string },
      output: { text: string }
    ) => {
      if (!state.pendingAction) return

      const { type, suggestedBranch, existingBranch } = state.pendingAction

      let choicePrompt: string

      if (type === "choose_branch" && existingBranch) {
        choicePrompt = `---
🛡️ **브랜치 선택이 필요합니다**

비슷한 작업 브랜치가 있습니다:
- 기존: \`${existingBranch}\`
- 새로: \`${suggestedBranch}\`

**어떤 브랜치를 사용할까요?**
1. "기존" - \`${existingBranch}\` 사용
2. "새로" - \`${suggestedBranch}\` 새로 생성
3. "스킵" - 현재 브랜치에서 계속

---

`
      } else {
        choicePrompt = `---
🛡️ **브랜치 생성 확인**

보호된 브랜치에서 작업하려고 합니다.
새 브랜치 \`${suggestedBranch}\`를 생성할까요?

1. "생성" - 새 브랜치에서 작업
2. "스킵" - 현재 브랜치에서 계속

---

`
      }

      output.text = choicePrompt + output.text
    },
  }
}
