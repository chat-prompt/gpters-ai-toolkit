/**
 * MCP Tool Definitions for GPTers AI Toolkit
 *
 * These tools allow Claude Code to search and retrieve plugins
 * from the GPTers catalog dynamically.
 */

import type { McpTool } from './types'

/**
 * 관리자 전용 도구 이름 목록
 * 이 도구들은 MCP tools/list에서 숨겨지며, 호출 시 권한 에러를 반환합니다.
 */
export const ADMIN_TOOL_NAMES = ['create_plugin', 'update_plugin', 'delete_plugin'] as const

export type AdminToolName = (typeof ADMIN_TOOL_NAMES)[number]

/**
 * 도구가 관리자 전용인지 확인
 */
export function isAdminTool(toolName: string): toolName is AdminToolName {
  return ADMIN_TOOL_NAMES.includes(toolName as AdminToolName)
}

/**
 * 모든 도구 정의 (관리자 도구 포함 - 내부용)
 */
const ALL_TOOLS: McpTool[] = [
  {
    name: 'semantic_search',
    description: `의미 기반으로 플러그인을 검색합니다.
자연어로 질문하면 의미적으로 유사한 플러그인을 찾습니다.
키워드 검색(search_plugins)과 달리 의도를 이해하여 검색합니다.

예시:
- "코드 품질을 높이는 도구" → 코드 리뷰, 리팩토링 관련 플러그인
- "데이터베이스 작업 도와줘" → DB 스키마, 쿼리 관련 플러그인
- "문서 작성할 때 쓸만한 것" → 문서화, 마크다운 관련 플러그인`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '자연어 검색 쿼리 (예: "코드 리뷰 도와주는 도구", "DB 관련 작업")',
        },
        category: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'all'],
          description: '플러그인 카테고리 필터 (기본: all)',
        },
        limit: {
          type: 'number',
          description: '최대 결과 수 (기본: 5, 최대: 20)',
        },
        _source: {
          type: 'string',
          description: '호출 출처 마커 (예: "skill-suggest"). 자동 추천과 수동 검색을 구분하는 데 사용',
        },
        _journeyId: {
          type: 'string',
          description: '탐색→로드→실행을 연결하는 UUID (생략 시 서버 생성, 인증정보 아님)',
        },
        userContext: {
          type: 'string',
          description: '작업 맥락 (예: "슬랙 멘션 자동 수집 봇 구현, airtable 연동 완료")',
        },
      },
      required: ['query'],
    },
  },
  //   {
  //     name: 'search_plugins',
  //     description: `카탈로그에서 플러그인을 검색합니다.
  // 키워드와 매칭되는 스킬, 에이전트, 커맨드를 반환합니다.
  // 검색은 이름, 설명, 태그를 대상으로 수행됩니다.
  //
  // 예시:
  // - "database schema" → DB 관련 플러그인 검색
  // - "code review" → 코드 리뷰 관련 플러그인 검색
  // - "refactoring" → 리팩토링 가이드 검색`,
  //     inputSchema: {
  //       type: 'object',
  //       properties: {
  //         query: {
  //           type: 'string',
  //           description: '검색 키워드 (예: "database", "refactoring", "code review")',
  //         },
  //         category: {
  //           type: 'string',
  //           enum: ['skill', 'agent', 'command', 'guide', 'all'],
  //           description: '플러그인 카테고리 필터 (기본: all)',
  //         },
  //         limit: {
  //           type: 'number',
  //           description: '최대 결과 수 (기본: 5, 최대: 20)',
  //         },
  //       },
  //       required: ['query'],
  //     },
  //   },
  {
    name: 'get_plugin_content',
    description: `특정 플러그인의 전체 내용을 조회합니다.
스킬의 경우 SKILL.md 내용을, 에이전트의 경우 에이전트 정의를 반환합니다.
플러그인 ID는 search_plugins 또는 list_plugins로 먼저 확인하세요.

반환되는 content 필드에는 해당 플러그인의 지침이 포함되어 있으며,
이를 참고하여 작업을 수행할 수 있습니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        pluginId: {
          type: 'string',
          description: '플러그인 ID (예: "data-source-reference", "code-reviewer")',
        },
        _journeyId: {
          type: 'string',
          description: '앞선 검색의 journeyId (생략 시 새 흐름으로 생성)',
        },
      },
      required: ['pluginId'],
    },
  },
  //   {
  //     name: 'list_plugins',
  //     description: `카탈로그의 모든 플러그인 목록을 조회합니다.
  // 카테고리나 팀 태그로 필터링할 수 있습니다.
  // 전체 목록을 확인하거나 특정 유형의 플러그인을 찾을 때 유용합니다.
  //
  // 권한에 따라 볼 수 있는 플러그인이 달라집니다:
  // - 일반 사용자: 자기 조직 + public + legacy 플러그인
  // - 비인증 사용자: public + legacy 플러그인만
  // - super_admin: 모든 플러그인`,
  //     inputSchema: {
  //       type: 'object',
  //       properties: {
  //         category: {
  //           type: 'string',
  //           enum: ['skill', 'agent', 'command', 'guide', 'all'],
  //           description: '플러그인 카테고리 필터 (기본: all)',
  //         },
  //       },
  //     },
  //   },
  //   {
  //     name: 'get_plugins_by_category',
  //     description: `특정 카테고리의 플러그인 목록을 조회합니다.
  // 스킬, 에이전트, 커맨드 등 특정 유형만 필요할 때 사용하세요.`,
  //     inputSchema: {
  //       type: 'object',
  //       properties: {
  //         category: {
  //           type: 'string',
  //           enum: ['skill', 'agent', 'command', 'guide'],
  //           description: '플러그인 카테고리',
  //         },
  //         limit: {
  //           type: 'number',
  //           description: '최대 결과 수 (기본: 10)',
  //         },
  //       },
  //       required: ['category'],
  //     },
  //   },
  //   {
  //     name: 'create_plugin',
  //     description: `새 플러그인을 카탈로그에 생성합니다.
  // 스킬, 에이전트, 커맨드, 가이드, 훅을 생성할 수 있습니다.
  // content 필드에 메인 콘텐츠(SKILL.md 등)를 전달하고,
  // files 필드에 추가 파일(스크립트, 레퍼런스 등)을 배열로 전달할 수 있습니다.
  //
  // 주의: 이 도구는 관리자 권한이 필요합니다.`,
  //     inputSchema: {
  //       type: 'object',
  //       properties: {
  //         id: {
  //           type: 'string',
  //           description: '플러그인 ID (소문자, 하이픈 사용, 예: "my-new-skill")',
  //         },
  //         type: {
  //           type: 'string',
  //           enum: ['skill', 'agent', 'command', 'guide', 'hook'],
  //           description: '플러그인 타입',
  //         },
  //         name: {
  //           type: 'string',
  //           description: '플러그인 이름 (표시용)',
  //         },
  //         description: {
  //           type: 'string',
  //           description: '플러그인 설명',
  //         },
  //         content: {
  //           type: 'string',
  //           description: '메인 콘텐츠 (SKILL.md, AGENT.md 등의 내용)',
  //         },
  //         author: {
  //           type: 'string',
  //           description: '작성자 이름 (기본: unknown)',
  //         },
  //         tags: {
  //           type: 'array',
  //           items: { type: 'string' },
  //           description: '태그 목록',
  //         },
  //         readme: {
  //           type: 'string',
  //           description: 'README.md 내용 (선택)',
  //         },
  //         files: {
  //           type: 'array',
  //           items: {
  //             type: 'object',
  //             properties: {
  //               name: { type: 'string', description: '파일명 (예: "setup.sh")' },
  //               content: { type: 'string', description: '파일 내용' },
  //               type: { type: 'string', description: '파일 타입 힌트 (예: "bash", "markdown")' },
  //             },
  //             required: ['name', 'content'],
  //           },
  //           description: '추가 파일 목록 (스크립트, 레퍼런스 등)',
  //         },
  //         mcpEnabled: {
  //           type: 'boolean',
  //           description: 'MCP 공개 여부 (기본: false)',
  //         },
  //       },
  //       required: ['id', 'type', 'name', 'content'],
  //     },
  //   },
  //   {
  //     name: 'update_plugin',
  //     description: `기존 플러그인을 업데이트합니다.
  // 변경하고자 하는 필드만 전달하면 됩니다.
  // files 필드를 전달하면 기존 파일 목록이 완전히 교체됩니다.
  //
  // 주의: 이 도구는 관리자 권한이 필요합니다.`,
  //     inputSchema: {
  //       type: 'object',
  //       properties: {
  //         id: {
  //           type: 'string',
  //           description: '업데이트할 플러그인 ID',
  //         },
  //         name: {
  //           type: 'string',
  //           description: '새 플러그인 이름',
  //         },
  //         description: {
  //           type: 'string',
  //           description: '새 설명',
  //         },
  //         content: {
  //           type: 'string',
  //           description: '새 메인 콘텐츠',
  //         },
  //         author: {
  //           type: 'string',
  //           description: '새 작성자',
  //         },
  //         tags: {
  //           type: 'array',
  //           items: { type: 'string' },
  //           description: '새 태그 목록',
  //         },
  //         readme: {
  //           type: 'string',
  //           description: '새 README 내용',
  //         },
  //         files: {
  //           type: 'array',
  //           items: {
  //             type: 'object',
  //             properties: {
  //               name: { type: 'string' },
  //               content: { type: 'string' },
  //               type: { type: 'string' },
  //             },
  //             required: ['name', 'content'],
  //           },
  //           description: '새 파일 목록 (기존 파일 교체)',
  //         },
  //         mcpEnabled: {
  //           type: 'boolean',
  //           description: 'MCP 공개 여부',
  //         },
  //       },
  //       required: ['id'],
  //     },
  //   },
  //   {
  //     name: 'delete_plugin',
  //     description: `플러그인을 삭제합니다.
  //
  // 주의: 이 작업은 되돌릴 수 없습니다. 관리자 권한이 필요합니다.`,
  //     inputSchema: {
  //       type: 'object',
  //       properties: {
  //         id: {
  //           type: 'string',
  //           description: '삭제할 플러그인 ID',
  //         },
  //       },
  //       required: ['id'],
  //     },
  //   },
  // V2: Deploy and version management tools
  {
    name: 'deploy_skill',
    description: `스킬/에이전트/커맨드/가이드를 GPTers 팀에 배포합니다.

현재 대화에서 만든 스킬을 팀과 공유할 때 사용합니다.
버전은 자동으로 관리됩니다:
- 신규: 1.0.0
- 기존 업데이트: 변경 내용에 따라 자동 bump (patch/minor/major)

부분 업데이트:
- 업데이트 시 content를 생략하면 기존 콘텐츠 유지
- 업데이트 시 files를 생략하면 기존 파일 유지
- files만 추가/변경하고 싶으면 content 없이 files만 전달

예시:
- 새 스킬 배포: type="skill", name="코드 리뷰어", content="..."
- 새 가이드 배포: type="guide", name="Git 사용법", content="..."
- 기존 스킬 업데이트: id="code-reviewer", content="...", changelog="보안 체크 추가"
- 참조문서만 추가: id="code-reviewer", files=[...], changelog="참조문서 추가"`,
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['skill', 'agent', 'command', 'guide', 'hook'],
          description: '배포할 항목 타입',
        },
        name: {
          type: 'string',
          description: '표시 이름 (예: "코드 리뷰어")',
        },
        content: {
          type: 'string',
          description: '메인 콘텐츠 (SKILL.md 내용 등). 업데이트 시 생략하면 기존 콘텐츠 유지',
        },
        id: {
          type: 'string',
          description: '플러그인 ID (영문 소문자, 숫자, 하이픈만 허용. 예: "my-skill-name"). 미지정 시 name에서 자동 생성',
        },
        description: {
          type: 'string',
          description: '짧은 설명',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '태그 목록',
        },
        allowedTools: {
          type: 'string',
          description: '허용된 도구 (스킬용, 쉼표 구분)',
        },
        agentModel: {
          type: 'string',
          enum: ['sonnet', 'opus', 'haiku', 'inherit'],
          description: '에이전트 모델 (기본: inherit)',
        },
        agentPermissionMode: {
          type: 'string',
          enum: ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'ignore'],
          description: '에이전트 권한 모드 (기본: default)',
        },
        agentSkills: {
          type: 'string',
          description: '에이전트에 로드할 스킬 목록 (쉼표 구분, 예: "git-master,code-reviewer")',
        },
        status: {
          type: 'string',
          enum: ['draft', 'published'],
          description: '배포 상태 (기본: published)',
        },
        changelog: {
          type: 'string',
          description: '변경사항 설명 (업데이트 시)',
        },
        platforms: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['claude_code', 'opencode', 'codex', 'cursor'],
          },
          description: '호환 플랫폼 목록. 미지정 시 모든 플랫폼에서 사용 가능. 예: ["claude_code", "codex"]',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '파일 경로 (예: scripts/run.mjs, templates/config.json)',
              },
              content: { type: 'string', description: '파일 내용' },
              type: {
                type: 'string',
                enum: ['script', 'reference', 'template', 'config'],
                description: `파일 타입:
- script: 실행 스크립트 (node/bash로 실행)
- reference: 참조 문서 (컨텍스트로 활용)
- template: 템플릿 (프로젝트에 복사)
- config: 설정 파일 (설정에 추가)
미지정 시 파일명에서 자동 추론`,
              },
            },
            required: ['name', 'content'],
          },
          description: '추가 파일들 (스크립트, 템플릿, 참조 문서 등)',
        },
      },
      required: ['type', 'name'],
    },
  },
  {
    name: 'undeploy_skill',
    description: `본인이 배포한 스킬/에이전트/커맨드를 삭제합니다.

플러그인 제작자만 자신의 플러그인을 삭제할 수 있습니다.
다른 사람의 플러그인은 삭제할 수 없습니다.

예시:
- 내 스킬 삭제: id="my-code-reviewer"

주의: 이 작업은 되돌릴 수 없습니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '삭제할 플러그인 ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'check_updates',
    description: `설치된 스킬들의 업데이트를 확인합니다.

로컬에 설치된 스킬 목록과 버전을 전달하면,
최신 버전과 비교하여 업데이트가 필요한 항목을 반환합니다.

예시:
installations: [
  { id: "code-reviewer", version: "1.0.0" },
  { id: "db-helper", version: "2.0.0" }
]`,
    inputSchema: {
      type: 'object',
      properties: {
        installations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '스킬 ID' },
              version: { type: 'string', description: '설치된 버전' },
            },
            required: ['id', 'version'],
          },
          description: '설치된 스킬 목록',
        },
      },
      required: ['installations'],
    },
  },
  // File management tools
  {
    name: 'add_files',
    description: `플러그인에 파일을 추가하거나 기존 파일을 업데이트합니다.

기존 파일은 유지하면서, 같은 이름의 파일은 덮어쓰고, 새 파일은 추가합니다.
deploy_skill로 모든 파일을 한 번에 전달하기 어려울 때 유용합니다.

예시:
- 스크립트 추가: id="my-skill", files=[{name: "scripts/run.mjs", content: "..."}]
- 참조문서 업데이트: id="my-skill", files=[{name: "references/guide.md", content: "..."}]`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '파일을 추가할 플러그인 ID',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: '파일 경로 (예: scripts/run.mjs, references/guide.md)',
              },
              content: { type: 'string', description: '파일 내용' },
              type: {
                type: 'string',
                enum: ['script', 'reference', 'template', 'config'],
                description: '파일 타입 (미지정 시 파일명에서 자동 추론)',
              },
            },
            required: ['name', 'content'],
          },
          description: '추가/업데이트할 파일 목록',
        },
      },
      required: ['id', 'files'],
    },
  },
  {
    name: 'report_session_event',
    description: `클라이언트 세션 컨텍스트를 서버에 리포트합니다 (분석용).

플러그인(Claude Code, OpenCode, Codex)이 세션 종료 시 호출하여
프롬프트 수, 추천 노출/사용 횟수 등 클라이언트 측 메트릭을 전송합니다.

예시:
- 세션 요약: eventType="session_summary", promptCount=15
- 세션 종료: eventType="session_end", sessionEndReason="idle"`,
    inputSchema: {
      type: 'object',
      properties: {
        eventType: {
          type: 'string',
          enum: ['session_summary', 'session_end'],
          description: '이벤트 유형 (session_summary: 중간 리포트, session_end: 종료 리포트)',
        },
        promptCount: {
          type: 'number',
          description: '세션 내 프롬프트 수',
        },
        suggestionsShown: {
          type: 'number',
          description: '스킬 추천 노출 횟수',
        },
        suggestionsUsed: {
          type: 'number',
          description: '추천 스킬 실제 사용 횟수',
        },
        skippedSearches: {
          type: 'number',
          description: '스킵된 검색 횟수 (후속 패턴)',
        },
        sessionEndReason: {
          type: 'string',
          enum: ['idle', 'explicit_close', 'timeout'],
          description: '세션 종료 사유',
        },
        pluginVersion: {
          type: 'string',
          description: '플러그인 자체 버전 (예: "0.1.1")',
        },
      },
      required: ['eventType'],
    },
  },
  {
    name: 'report_usage',
    description: `AI 코딩 클라이언트 사용량 집계를 기록합니다 (AX 대시보드 · 클라이언트 사용량 패널).

aitk CLI가 각 팀원 머신의 로컬 트랜스크립트를 집계해 호출합니다.
보내는 값은 집계 수치와 플랜 문자열뿐입니다 — 대화 내용·파일 경로·인증 토큰은 보내지 않습니다.

누구의 사용량인지는 서버가 인증 세션에서 정합니다. 이름을 인자로 보낼 수 없습니다.
(클라이언트, periodStart)가 같으면 덮어씁니다 — 같은 구간을 다시 보내도 총량이 부풀지 않습니다.

한도 필드는 없을 수 있습니다. Claude Code는 최신 statusline usage cache가 있을 때만,
Codex는 최신 rollout 스냅샷이 있을 때만 보고합니다. 수집하지 못한 값을 0으로 채우면
"한도를 안 쓴 사람"과 구분되지 않으므로 null로 보냅니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          description: '클라이언트별 집계 (한 번에 최대 20건, 같은 클라이언트·구간 중복 불가)',
          items: {
            type: 'object',
            properties: {
              client: {
                type: 'string',
                enum: ['claude-code', 'codex'],
                description: '클라이언트 종류',
              },
              planRaw: {
                type: ['string', 'null'],
                description: '클라이언트가 보고한 원시 티어 문자열 (예: "default_claude_max_20x", "prolite")',
              },
              plan: {
                type: ['string', 'null'],
                description: '사람이 읽는 플랜명 (예: "Claude Max 20x")',
              },
              periodStart: {
                type: 'string',
                description: '집계 구간 시작 (ISO 8601). 저장 키의 일부다',
              },
              periodEnd: {
                type: 'string',
                description: '집계 구간 끝 (ISO 8601). 최대 90일',
              },
              inputTokens: { type: 'number', description: '입력 토큰 합 (0 이상의 정수)' },
              outputTokens: { type: 'number', description: '출력 토큰 합 (0 이상의 정수)' },
              cachedTokens: { type: 'number', description: '캐시 읽기 토큰 합 (0 이상의 정수)' },
              sessions: { type: 'number', description: '세션 수 (0 이상의 정수)' },
              models: {
                type: 'object',
                description: '모델명 → 토큰 수 (최대 50종)',
                additionalProperties: { type: 'number' },
              },
              limitUsedPercent: {
                type: ['number', 'null'],
                description: '주간 한도 사용률 0~100. 보고하지 않는 클라이언트는 null (Claude Code는 항상 null)',
              },
              limitResetsAt: {
                type: ['string', 'null'],
                description: '한도 리셋 시각 (ISO 8601). 없으면 null',
              },
            },
            // 전부 필수다. nullable 필드도 "없음"을 null로 명시해야 한다 —
            // 키를 빼면 "보고할 값이 없다"와 "보내는 걸 잊었다"가 구분되지 않는다.
            required: [
              'client',
              'planRaw',
              'plan',
              'periodStart',
              'periodEnd',
              'inputTokens',
              'outputTokens',
              'cachedTokens',
              'sessions',
              'models',
              'limitUsedPercent',
              'limitResetsAt',
            ],
          },
        },
      },
      required: ['records'],
    },
  },
  {
    name: 'remove_files',
    description: `플러그인에서 파일을 삭제합니다.

파일 이름 목록으로 삭제합니다.
존재하지 않는 파일은 무시됩니다 (에러 아님).

예시:
- 파일 삭제: id="my-skill", fileNames=["scripts/old.mjs", "references/deprecated.md"]`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '파일을 삭제할 플러그인 ID',
        },
        fileNames: {
          type: 'array',
          items: { type: 'string' },
          description: '삭제할 파일 이름 목록 (예: ["scripts/old.mjs"])',
        },
      },
      required: ['id', 'fileNames'],
    },
  },
  {
    name: 'report_search_skip',
    description: `스킬 검색 후 결과를 사용하지 않은 이유를 보고합니다.

semantic_search로 검색했으나 get_plugin_content를 호출하지 않을 때 사용합니다.
스킵 사유 데이터를 수집하여 추천 품질 개선에 활용합니다.

예시:
- 검색 결과가 현재 작업과 무관: reason="사업계획서 작성 중인데 코드 리뷰 스킬만 나옴"
- 이미 알고 있는 스킬: reason="해당 스킬은 이미 사용 중"`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색에 사용한 쿼리',
        },
        resultIds: {
          type: 'array',
          items: { type: 'string' },
          description: '반환된 스킬 ID 목록',
        },
        reason: {
          type: 'string',
          description: '스킵 사유 (한 줄)',
        },
      },
      required: ['query', 'resultIds', 'reason'],
    },
  },
  {
    name: 'report_skill_outcome',
    description: `로드한 스킬의 적용 결과를 보고합니다.

get_plugin_content로 스킬을 로드한 후, 실제로 적용했는지와 결과를 기록합니다.
스킬 효용성 측정에 활용됩니다.

예시:
- 적용 성공: applied=true, summary="Mixpanel 대시보드 쿼리 작성에 활용"
- 적용 안 함: applied=false, summary="현재 작업과 맞지 않아 미적용"`,
    inputSchema: {
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          description: '스킬 ID',
        },
        applied: {
          type: 'boolean',
          description: '실제 적용 여부',
        },
        summary: {
          type: 'string',
          description: '결과 요약 (한 줄)',
        },
        journeyId: {
          type: ['string', 'null'],
          description: '앞선 검색·로드와 연결하는 UUID',
        },
      },
      required: ['skillId', 'applied', 'summary'],
    },
  },
  {
    name: 'report_skill_execution_started',
    description: `스킬을 실제 작업에 적용하기 시작한 시점을 보고합니다.

콘텐츠를 단순 조회한 시점이 아니라 실제 적용을 결정한 직후 호출합니다. 같은 attemptId를
완료 보고에도 사용해야 결과 미보고와 실행 시간을 측정할 수 있습니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '시작 이벤트 재전송 멱등성을 위한 UUID (생략 시 서버 생성)' },
        attemptId: { type: 'string', description: '시작과 완료를 연결하는 UUID (생략 시 서버 생성)' },
        journeyId: { type: ['string', 'null'], description: '앞선 검색·로드와 연결하는 UUID' },
        source: { type: 'string', enum: ['aitk', 'bbopters-shared'] },
        skillId: { type: 'string' },
        skillVersion: { type: ['string', 'null'] },
        agent: { type: 'string', enum: ['claude-code', 'codex', 'openclaw', 'hermes', 'test-agent'] },
        agentId: { type: 'string', description: '봇을 구분하는 안정적인 소문자 식별자 (생략 시 runtime 이름)' },
        occurredAt: { type: 'string', description: 'ISO 8601 시작 시각 (생략 시 서버 시각)' },
      },
      required: ['skillId', 'agent'],
    },
  },
  {
    name: 'report_skill_execution',
    description: `스킬을 실제 작업에 적용한 한 번의 시도와 검증 결과를 보고합니다.

report_skill_outcome의 적용 여부보다 강한 실행 결과 계약입니다. 대화 원문, 파일 내용,
명령 출력 전문이나 인증정보는 보내지 말고 짧은 검증 요약만 보냅니다.

status는 success/partial/failed/abandoned, validation.method는
test/command/artifact/user_confirmation/none 중 하나입니다.`,
    inputSchema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: '재전송 멱등성을 위한 UUID (생략 시 서버 생성)' },
        attemptId: { type: 'string', description: '한 번의 실제 적용 시도를 식별하는 UUID' },
        journeyId: { type: ['string', 'null'], description: '앞선 검색·로드와 연결하는 UUID' },
        source: { type: 'string', enum: ['aitk', 'bbopters-shared'] },
        skillId: { type: 'string' },
        skillVersion: { type: ['string', 'null'] },
        agent: { type: 'string', enum: ['claude-code', 'codex', 'openclaw', 'hermes', 'test-agent'] },
        agentId: { type: 'string', description: '봇을 구분하는 안정적인 소문자 식별자 (생략 시 runtime 이름)' },
        status: { type: 'string', enum: ['success', 'partial', 'failed', 'abandoned'] },
        failureStage: {
          type: ['string', 'null'],
          enum: ['load', 'instruction', 'dependency', 'execution', 'validation', null],
        },
        errorCode: { type: ['string', 'null'] },
        validation: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['test', 'command', 'artifact', 'user_confirmation', 'none'],
            },
            passed: { type: ['boolean', 'null'] },
            summary: { type: ['string', 'null'] },
          },
          required: ['method', 'passed', 'summary'],
        },
        userAccepted: { type: ['boolean', 'null'] },
        occurredAt: { type: 'string', description: 'ISO 8601 시각' },
      },
      required: [
        'attemptId',
        'skillId',
        'agent',
        'status',
      ],
    },
  },
]

/**
 * 공개 도구 목록 (MCP tools/list에서 반환)
 * 관리자 도구는 제외됩니다.
 */
export const MCP_TOOLS: McpTool[] = ALL_TOOLS.filter(
  (tool) => !isAdminTool(tool.name)
)

/**
 * 이름으로 도구 찾기 (관리자 도구 포함)
 * 내부적으로 도구 실행 시 사용됩니다.
 */
export function getToolByName(name: string): McpTool | undefined {
  return ALL_TOOLS.find((tool) => tool.name === name)
}

/**
 * 공개 도구 이름 목록 반환
 */
export function getAllToolNames(): string[] {
  return MCP_TOOLS.map((tool) => tool.name)
}
