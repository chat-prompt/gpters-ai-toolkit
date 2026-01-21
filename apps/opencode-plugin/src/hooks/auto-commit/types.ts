export interface Todo {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority?: "low" | "medium" | "high"
}

export interface AutoCommitState {
  lastCommitAttempt: number
  isProcessing: boolean
  completedTodoIds: Set<string>
}

export interface GitStatus {
  hasChanges: boolean
  staged: string[]
  unstaged: string[]
  untracked: string[]
}
