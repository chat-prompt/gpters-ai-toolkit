import type { Config } from "@opencode-ai/sdk"

export const COMMAND_PRD_REVIEW: NonNullable<Config['command']>[string] = {
  template: `
@PRD.md 파일을 읽고 AskUserQuestionTool을 사용하여 기술적 구현, UI & UX, 우려 사항, 트레이드오프 등 모든 측면에 대해 저를 상세히 인터뷰해 주세요.
질문은 뻔하거나 상투적이지 않아야 하며, 매우 심층적으로 접근하여 내용이 완성될 때까지 인터뷰를 계속 이어가야 합니다.
인터뷰가 끝나면 스펙을 파일에 작성하세요. 답변 옵션에는 항상 모름 옵션을 추가, 질문과 답변은 .md 로 따로 생성해주세요`,
  description: '📝 PRD 파일 읽기 및 인터뷰',
}
