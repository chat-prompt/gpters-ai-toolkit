export interface BranchGuardConfig {
  enabled: boolean
  protectedBranches: string[]
  branchPrefix: string
  fallbackName: string
}

export interface BranchInfo {
  current: string
  isProtected: boolean
  existingFeatures: string[]
}

export interface PendingAction {
  type: "confirm_create" | "choose_branch"
  suggestedBranch: string
  existingBranch?: string
  hasStashed: boolean
}

export interface BranchGuardState {
  hasChecked: boolean
  sessionId: string | null
  pendingAction: PendingAction | null
  isMainSession: boolean
}

export interface GitCommandResult {
  success: boolean
  error?: string
  output?: string
}
