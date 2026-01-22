import type { BranchGuardConfig } from "./types"

export const BRANCH_GUARD_CONFIG: BranchGuardConfig = {
  enabled: true,
  protectedBranches: ["main", "dev"],
  branchPrefix: "feature/",
  fallbackName: "work",
}
