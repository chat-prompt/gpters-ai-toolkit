export const HOOK_NAME = "auto-commit"

export const FAST_MODEL = {
  providerID: "anthropic",
  modelID: "claude-sonnet-4-20250514",
}

export const AUTO_COMMIT_TASK_PROMPT = `
Create atomic commit(s) for the current changes.

**Context from completed todos:**
{TODO_CONTEXT}

**INSTRUCTIONS:**
1. Run git status to see all changes
2. Detect commit style from git log -30
3. Create atomic commits following the repository's conventions
4. Do NOT push - just commit locally

Now execute the git-master workflow.
`.trim()

export const COOLDOWN_MS = 30000
