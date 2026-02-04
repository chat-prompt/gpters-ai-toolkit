import type { PluginInput } from "@opencode-ai/plugin"
import type { BranchGuardState } from "./types"
import { BRANCH_GUARD_CONFIG } from "./config"
import { getCurrentBranch, getExistingBranches, isProtectedBranch, isGitRepository, findSimilarBranch, filterMergedBranches } from "./detector"
import { generateBranchName } from "./name-extractor"
import { hasUncommittedChanges, stashChanges, popStash } from "./stash-manager"
import { syncWithOrigin, getMergedBranches, checkBranchMerged } from "./git-sync"
import { createBranch, checkoutBranch } from "./creator"
import { createLogger } from "../../utils/logger"
import { showSelect, showYesNo } from "../../utils/dialog"

const logger = createLogger("branch-guard")

export function createBranchGuardHook(ctx: PluginInput) {
  const state: BranchGuardState = {
    hasChecked: false,
    sessionId: null,
    isMainSession: false,
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
      logger.debug(`Created branch: ${suggestedBranch}`)

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
      logger.debug(`Checked out branch: ${branchName}`)

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

  async function handleProtectedBranch(currentBranch: string, userMessage: string) {
    let hasStashed = false
    const hasChanges = await hasUncommittedChanges(ctx.directory)
    if (hasChanges) {
      const stashResult = await stashChanges(ctx.directory, "[branch-guard] Auto stash before branch switch")
      if (stashResult.success) {
        hasStashed = true
        await showToast("📦 변경사항 임시 저장", "작업 중이던 내용을 stash 했습니다", "info", 3000)
        logger.debug("Changes stashed")
      } else {
        logger.error(`Failed to stash: ${stashResult.error}`)
      }
    }

    const syncResult = await syncWithOrigin(ctx.directory)
    if (syncResult.success) {
      await showToast("🔄 브랜치 최신화", `${currentBranch} 브랜치를 최신 상태로 업데이트했습니다`, "info", 3000)
      logger.debug(`Synced ${currentBranch} with origin`)
    } else {
      logger.warn(`Failed to sync: ${syncResult.error}`)
    }

    const suggestedBranch = generateBranchName(userMessage)

    const localBranches = await getExistingBranches(ctx.directory, BRANCH_GUARD_CONFIG.branchPrefix)
    const mergedBranches = await getMergedBranches(ctx.directory)
    const activeBranches = filterMergedBranches(localBranches, mergedBranches)
    const similarBranch = findSimilarBranch(suggestedBranch, activeBranches)

    if (similarBranch) {
      const result = await showSelect({
        items: [
          `기존: ${similarBranch}`,
          `새로: ${suggestedBranch}`,
          "스킵 (현재 브랜치 유지)"
        ],
        title: "🛡️ 브랜치 선택"
      })

      if (result.ok) {
        if (result.value.startsWith("기존:")) {
          await handleBranchCheckout(similarBranch, hasStashed)
        } else if (result.value.startsWith("새로:")) {
          await handleBranchCreation(suggestedBranch, hasStashed)
        } else {
          await handleSkip(hasStashed)
        }
      } else {
        logger.warn(`Dialog cancelled or error: ${result.error}`)
        await handleSkip(hasStashed)
      }
    } else {
      const result = await showYesNo({
        message: `새 브랜치 '${suggestedBranch}'를 생성할까요?`,
        title: "🛡️ 브랜치 생성",
        yesText: "생성",
        noText: "스킵"
      })

      if (result.ok && result.value) {
        await handleBranchCreation(suggestedBranch, hasStashed)
      } else {
        await handleSkip(hasStashed)
      }
    }
  }

  async function handleSkip(hasStashed: boolean) {
    await showToast("⏭️ 브랜치 생성 스킵", "현재 브랜치에서 계속합니다", "info", 3000)
    logger.debug("User skipped branch creation")
    if (hasStashed) {
      const popResult = await popStash(ctx.directory)
      if (popResult.success) {
        await showToast("📦 변경사항 복원", "stash 했던 내용을 복원했습니다", "info", 3000)
      }
    }
  }

  return {
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      if (event.type !== "session.created") return

      const props = event.properties as { info?: { id: string; parentID?: string } } | undefined

      const isMainSession = !props?.info?.parentID
      state.isMainSession = isMainSession
      state.sessionId = props?.info?.id ?? null
      state.hasChecked = false

      if (!isMainSession) {
        logger.debug(`Subtask session detected: ${state.sessionId}, skipping branch guard`)
        return
      }

      logger.debug(`Main session created: ${state.sessionId}`)
    },

    "chat.message": async (
      input: { sessionID: string },
      output: { parts: Array<{ type: string; text?: string }> }
    ) => {
      if (!BRANCH_GUARD_CONFIG.enabled) return
      if (!state.isMainSession) return
      if (state.hasChecked) return
      state.hasChecked = true

      const isGitRepo = await isGitRepository(ctx.directory)
      if (!isGitRepo) {
        logger.debug("Not a git repository, skipping")
        return
      }

      const currentBranch = await getCurrentBranch(ctx.directory)
      if (!currentBranch) {
        logger.debug("Could not determine current branch")
        return
      }

      const userMessage = extractMessageContent(output)

      if (isProtectedBranch(currentBranch)) {
        logger.debug(`Case A: Protected branch detected: ${currentBranch}`)
        await handleProtectedBranch(currentBranch, userMessage)
      } else {
        logger.debug(`Case B: Feature branch detected: ${currentBranch}`)

        const { merged, prNumber } = await checkBranchMerged(ctx.directory, currentBranch)

        if (merged) {
          await showToast(
            "✅ 브랜치 머지 완료",
            `${currentBranch}가 이미 머지되었습니다 (PR #${prNumber}). main으로 이동합니다.`,
            "success",
            5000
          )
          logger.debug(`Branch ${currentBranch} was merged (PR #${prNumber}), switching to main`)

          const checkoutResult = await checkoutBranch(ctx.directory, "main")
          if (checkoutResult.success) {
            await handleProtectedBranch("main", userMessage)
          } else {
            logger.error(`Failed to checkout main: ${checkoutResult.error}`)
          }
        } else {
          logger.debug(`Branch ${currentBranch} not merged, continuing on current branch`)
        }
      }
    },
  }
}
