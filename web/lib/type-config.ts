/**
 * Type-specific configuration for Claude Code plugins
 * Defines templates, guides, and field configurations for each item type
 */

import type { ItemType, AgentModel, AgentPermissionMode } from './types'

// Available Claude Code tools
export const CLAUDE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'Bash',
  'Task',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  'AskUserQuestion',
  'NotebookEdit',
] as const

export type ClaudeTool = (typeof CLAUDE_TOOLS)[number]

// Agent model options with labels
export const AGENT_MODELS: Record<AgentModel, { label: string; description: string }> = {
  sonnet: { label: 'Sonnet', description: '빠르고 효율적인 모델' },
  opus: { label: 'Opus', description: '가장 강력한 모델 (비용 높음)' },
  haiku: { label: 'Haiku', description: '가장 빠른 모델 (간단한 작업용)' },
  inherit: { label: 'Inherit', description: '메인 스레드와 동일한 모델 사용' },
}

// Agent permission mode options with labels
export const AGENT_PERMISSION_MODES: Record<
  AgentPermissionMode,
  { label: string; description: string }
> = {
  default: { label: 'Default', description: '기본 권한 설정 사용' },
  acceptEdits: { label: 'Accept Edits', description: '파일 수정 자동 승인' },
  bypassPermissions: { label: 'Bypass', description: '모든 권한 우회 (주의!)' },
  plan: { label: 'Plan Mode', description: '계획 모드로 실행' },
  ignore: { label: 'Ignore', description: '권한 무시' },
}

// Type configuration with templates and guides
export const TYPE_CONFIG: Record<
  ItemType,
  {
    label: string
    icon: string
    description: string
    color: string
    namePlaceholder: string
    descriptionPlaceholder: string
    contentPlaceholder: string
    suggestedTags: string[]
    contentTemplate: string
    guide: {
      title: string
      sections: Array<{
        heading: string
        content: string
        tip?: string
      }>
      syntaxHighlights?: Array<{
        syntax: string
        description: string
      }>
    }
    fields: {
      showDifficulty: boolean
      showPluginId: boolean
      showEstimatedTime: boolean
      showAllowedTools: boolean
      showAgentFields: boolean
      showCommandFields: boolean
    }
  }
> = {
  skill: {
    label: 'Skill',
    icon: '⚡',
    description: 'Claude가 자동으로 호출하는 기능',
    color: 'cyan',
    namePlaceholder: 'my-skill-name',
    descriptionPlaceholder: '이 스킬이 언제 사용되는지 설명하세요 (예: PDF 작업 시, Git 커밋 시)',
    contentPlaceholder: '스킬의 실행 방법과 예시를 작성하세요...',
    suggestedTags: ['automation', 'productivity', 'workflow'],
    contentTemplate: `# {name}

## Instructions

이 스킬의 사용 방법을 단계별로 설명하세요.

1. 첫 번째 단계
2. 두 번째 단계
3. 세 번째 단계

## Examples

### 예시 1: 기본 사용
\`\`\`
사용 예시를 보여주세요
\`\`\`

## Best Practices

- 권장 사항 1
- 권장 사항 2
`,
    guide: {
      title: 'Skill 작성 가이드',
      sections: [
        {
          heading: 'Skill이란?',
          content:
            'Skill은 Claude가 작업 중 자동으로 호출하는 기능입니다. description에 "언제 사용하는지"를 명확히 적으면 Claude가 적절한 시점에 스킬을 활성화합니다.',
          tip: 'description에 트리거 키워드를 포함하세요. 예: "PDF 작업 시", "Git 커밋 시"',
        },
        {
          heading: '필수 구조',
          content:
            '- **Instructions**: 스킬 실행 방법을 단계별로 설명\n- **Examples**: 구체적인 사용 예시\n- **Best Practices**: 권장 사항 및 주의점',
        },
        {
          heading: 'Allowed Tools',
          content:
            '특정 도구만 사용하도록 제한할 수 있습니다. 비워두면 모든 도구를 사용할 수 있습니다.',
          tip: '보안이 중요하면 Read, Grep, Glob 등 읽기 전용 도구만 허용하세요.',
        },
      ],
    },
    fields: {
      showDifficulty: true,
      showPluginId: true,
      showEstimatedTime: false,
      showAllowedTools: true,
      showAgentFields: false,
      showCommandFields: false,
    },
  },
  agent: {
    label: 'Agent',
    icon: '◈',
    description: 'Task 도구로 호출하는 서브에이전트',
    color: 'purple',
    namePlaceholder: 'my-agent-name',
    descriptionPlaceholder: '이 에이전트의 전문 분야를 설명하세요 (예: 코드 리뷰, 문서 생성)',
    contentPlaceholder: '에이전트의 시스템 프롬프트를 작성하세요...',
    suggestedTags: ['agent', 'specialized', 'task'],
    contentTemplate: `# {name}

You are a specialized agent for {purpose}.

## Your Responsibilities

- 책임 1
- 책임 2
- 책임 3

## When Invoked

1. 먼저 현재 상태를 파악합니다
2. 필요한 정보를 수집합니다
3. 작업을 수행합니다
4. 결과를 보고합니다

## Guidelines

- 가이드라인 1
- 가이드라인 2

## Output Format

결과는 다음 형식으로 제공합니다:
- 요약
- 상세 내용
- 다음 단계 제안
`,
    guide: {
      title: 'Agent 작성 가이드',
      sections: [
        {
          heading: 'Agent란?',
          content:
            'Agent는 별도의 컨텍스트 창에서 실행되는 전문화된 서브에이전트입니다. Task 도구를 통해 호출되며, 특정 작업에 집중할 수 있습니다.',
          tip: 'Agent는 독립적인 컨텍스트를 가지므로 복잡한 작업을 분리할 수 있습니다.',
        },
        {
          heading: '시스템 프롬프트 작성',
          content:
            '콘텐츠 전체가 Agent의 시스템 프롬프트가 됩니다. 역할, 책임, 가이드라인을 명확히 정의하세요.',
        },
        {
          heading: 'Model 선택',
          content:
            '- **Sonnet**: 일반적인 작업에 적합\n- **Opus**: 복잡한 분석이나 창의적 작업\n- **Haiku**: 간단한 작업 (빠르고 저렴)\n- **Inherit**: 메인 스레드와 동일',
          tip: '비용을 고려하면 inherit가 가장 안전합니다.',
        },
        {
          heading: 'Tools 제한',
          content:
            'Agent가 사용할 도구를 제한할 수 있습니다. 비워두면 모든 도구를 사용합니다.',
        },
      ],
    },
    fields: {
      showDifficulty: false,
      showPluginId: false,
      showEstimatedTime: false,
      showAllowedTools: true,
      showAgentFields: true,
      showCommandFields: false,
    },
  },
  prompt: {
    label: 'Prompt',
    icon: '✦',
    description: '재사용 가능한 프롬프트 템플릿',
    color: 'orange',
    namePlaceholder: 'my-prompt-name',
    descriptionPlaceholder: '이 프롬프트의 용도를 설명하세요 (예: 코드 설명, 번역)',
    contentPlaceholder: '재사용할 프롬프트 템플릿을 작성하세요...',
    suggestedTags: ['template', 'reusable', 'prompt'],
    contentTemplate: `# {name}

## Context

이 프롬프트의 사용 맥락을 설명하세요.

## Prompt

\`\`\`
여기에 프롬프트 내용을 작성하세요.

사용자 입력: {input}

요청 사항:
1. ...
2. ...
\`\`\`

## Variables

- \`{input}\`: 사용자 입력
- \`{context}\`: 추가 컨텍스트

## Usage Tips

- 팁 1
- 팁 2
`,
    guide: {
      title: 'Prompt 작성 가이드',
      sections: [
        {
          heading: 'Prompt란?',
          content:
            'Prompt는 재사용 가능한 프롬프트 템플릿입니다. Claude Code에서는 Skill로 변환되어 사용됩니다.',
        },
        {
          heading: '변수 사용',
          content:
            '`{변수명}` 형식으로 변수를 정의하면 사용 시 대체할 수 있습니다.',
          tip: '자주 사용하는 변수: {input}, {context}, {format}, {language}',
        },
        {
          heading: '구조화',
          content:
            '- **Context**: 사용 맥락\n- **Prompt**: 실제 프롬프트\n- **Variables**: 변수 설명\n- **Usage Tips**: 사용 팁',
        },
      ],
    },
    fields: {
      showDifficulty: true,
      showPluginId: false,
      showEstimatedTime: false,
      showAllowedTools: false,
      showAgentFields: false,
      showCommandFields: false,
    },
  },
  command: {
    label: 'Command',
    icon: '▸',
    description: '/명령어로 실행하는 커맨드',
    color: 'cyan',
    namePlaceholder: 'my-command',
    descriptionPlaceholder: '이 커맨드가 수행하는 작업을 설명하세요 (예: Git 커밋, 테스트 실행)',
    contentPlaceholder: '커맨드 실행 시 수행할 작업을 작성하세요...',
    suggestedTags: ['command', 'cli', 'shortcut'],
    contentTemplate: `# {name}

## Current State

현재 상태를 확인합니다:
- Git 상태: !\`git status\`
- 최근 커밋: !\`git log --oneline -5\`

## Task

$ARGUMENTS를 기반으로 작업을 수행합니다.

## Steps

1. 첫 번째 단계
2. 두 번째 단계
3. 결과 확인

## Output

작업 완료 후 결과를 요약합니다.
`,
    guide: {
      title: 'Command 작성 가이드',
      sections: [
        {
          heading: 'Command란?',
          content:
            'Command는 사용자가 `/명령어`로 직접 호출하는 기능입니다. 자주 사용하는 작업을 빠르게 실행할 수 있습니다.',
        },
        {
          heading: 'Argument Hint',
          content:
            '인자 힌트를 설정하면 자동완성에서 예상 인자를 보여줍니다. 예: `[message]`, `[file] [options]`',
        },
        {
          heading: '특수 문법',
          content:
            'Command에서 사용할 수 있는 특수 문법이 있습니다.',
        },
      ],
      syntaxHighlights: [
        { syntax: '$ARGUMENTS', description: '모든 인자를 하나의 문자열로' },
        { syntax: '$1, $2, $3', description: '개별 위치 인자 접근' },
        { syntax: '!`command`', description: 'Bash 명령 실행 후 결과 포함' },
        { syntax: '@path/to/file', description: '파일 내용 포함' },
      ],
    },
    fields: {
      showDifficulty: false,
      showPluginId: false,
      showEstimatedTime: false,
      showAllowedTools: true,
      showAgentFields: false,
      showCommandFields: true,
    },
  },
  guide: {
    label: 'Guide',
    icon: '📚',
    description: '실습 가이드 및 튜토리얼',
    color: 'purple',
    namePlaceholder: 'my-guide-title',
    descriptionPlaceholder: '이 가이드에서 배울 내용을 설명하세요',
    contentPlaceholder: '단계별 가이드 내용을 작성하세요...',
    suggestedTags: ['tutorial', 'guide', 'learning'],
    contentTemplate: `# {name}

## 개요

이 가이드에서 배울 내용을 소개합니다.

## 사전 준비

- [ ] 필수 도구 설치
- [ ] 환경 설정 완료

## 단계별 진행

### Step 1: 시작하기

첫 번째 단계를 설명합니다.

### Step 2: 핵심 기능

두 번째 단계를 설명합니다.

### Step 3: 마무리

마지막 단계를 설명합니다.

## 정리

배운 내용을 정리합니다.

## 다음 단계

더 배울 수 있는 리소스를 안내합니다.
`,
    guide: {
      title: 'Guide 작성 가이드',
      sections: [
        {
          heading: 'Guide란?',
          content:
            'Guide는 웹 전용 콘텐츠로, Claude Code 마켓플레이스에는 동기화되지 않습니다. 튜토리얼, 가이드, 문서화에 적합합니다.',
        },
        {
          heading: '구조 권장',
          content:
            '- **개요**: 배울 내용 소개\n- **사전 준비**: 필요한 것들\n- **단계별 진행**: 핵심 내용\n- **정리**: 배운 내용 요약\n- **다음 단계**: 추가 학습 안내',
        },
        {
          heading: '난이도와 소요 시간',
          content:
            '독자가 미리 알 수 있도록 난이도와 예상 소요 시간을 설정하세요.',
          tip: '초보자용: 10-15분, 중급: 20-30분, 고급: 30분 이상',
        },
      ],
    },
    fields: {
      showDifficulty: true,
      showPluginId: false,
      showEstimatedTime: true,
      showAllowedTools: false,
      showAgentFields: false,
      showCommandFields: false,
    },
  },
}

/**
 * Get content template for a type, replacing placeholders
 */
export function getContentTemplate(type: ItemType, name: string): string {
  const config = TYPE_CONFIG[type]
  return config.contentTemplate.replace(/{name}/g, name).replace(/{purpose}/g, '특정 작업')
}

/**
 * Get field visibility for a type
 */
export function getFieldsConfig(type: ItemType) {
  return TYPE_CONFIG[type].fields
}

/**
 * Get guide content for a type
 */
export function getGuide(type: ItemType) {
  return TYPE_CONFIG[type].guide
}
