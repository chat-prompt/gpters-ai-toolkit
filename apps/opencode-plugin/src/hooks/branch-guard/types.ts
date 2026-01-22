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

export interface BranchGuardState {
  hasChecked: boolean
  sessionId: string | null
  isMainSession: boolean
}

export interface GitCommandResult {
  success: boolean
  error?: string
  output?: string
}
