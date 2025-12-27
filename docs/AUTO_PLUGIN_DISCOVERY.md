# Claude Code 플러그인 자동 검색 및 사용 가이드

## 개요

이 문서는 **"마켓플레이스만 등록하면 Claude Code가 필요한 플러그인을 자동으로 찾아서 사용"**하는 기능의 가능 여부와 구현 방법을 설명합니다.

---

## 요약

| 기능 | 현재 지원 | 우회 구현 |
|------|----------|----------|
| 마켓플레이스 등록 | ✅ 가능 | - |
| 플러그인 수동 설치 | ✅ 가능 | - |
| 작업 중 자동 검색 | ❌ 불가 | ✅ MCP 서버 |
| 자동 설치 후 사용 | ❌ 불가 | ✅ MCP 서버 |

---

## 1. Claude Code 기본 지원 기능

### 1.1 마켓플레이스 등록 (지원됨)

팀원이 마켓플레이스를 한 번 등록하면 플러그인 목록을 볼 수 있습니다.

```json
// ~/.claude/settings.json
{
  "extraKnownMarketplaces": {
    "gpters": {
      "source": {
        "source": "github",
        "repo": "chat-prompt/gpters-ai-toolkit"
      }
    }
  }
}
```

### 1.2 플러그인 설치 (수동)

등록된 마켓플레이스에서 플러그인을 **수동으로** 설치해야 합니다.

```bash
# 마켓플레이스 추가 (1회)
/plugin marketplace add gpters/gpters-ai-toolkit

# 플러그인 설치 (수동)
/plugin install data-source-reference@gpters
```

### 1.3 플러그인 사전 활성화

settings.json에서 미리 활성화해두면 설치 후 바로 사용 가능합니다.

```json
{
  "enabledPlugins": {
    "data-source-reference@gpters": true,
    "refactor-guide@gpters": true
  }
}
```

---

## 2. 원하는 기능: 자동 검색 및 사용

### 2.1 이상적인 흐름

```
사용자: "Portal DB 스키마 알려줘"
    ↓
Claude Code: (마켓플레이스에서 관련 플러그인 검색)
    ↓
Claude Code: (data-source-reference 플러그인 발견)
    ↓
Claude Code: (플러그인 내용을 읽어서 답변)
```

### 2.2 현재 지원 상태

**Claude Code는 이 기능을 네이티브로 지원하지 않습니다.**

- 마켓플레이스는 정적 카탈로그일 뿐 검색 API가 아님
- 작업 중 자동으로 플러그인을 찾는 메커니즘 없음
- 동적 스킬 로딩 미지원

---

## 3. 우회 구현: MCP 서버 방식

### 3.1 아키텍처

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Claude Code   │────>│  Marketplace MCP     │────>│  PostgreSQL DB  │
│                 │<────│  Server              │<────│  (플러그인 저장) │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                         │
        │ 자연어 요청              │ 검색/조회
        ▼                         ▼
   "DB 스키마 알려줘"      search_plugins("database")
                                  │
                                  ▼
                         플러그인 내용 반환
```

### 3.2 MCP 서버 기능

| 도구 | 설명 | 예시 |
|------|------|------|
| `search_plugins` | 키워드로 플러그인 검색 | `search_plugins("database schema")` |
| `get_plugin_content` | 특정 플러그인 내용 조회 | `get_plugin_content("data-source-reference")` |
| `list_plugins` | 전체 플러그인 목록 | `list_plugins()` |
| `get_plugin_by_category` | 카테고리별 조회 | `get_plugin_by_category("skill")` |

### 3.3 사용 흐름

```
사용자: "Portal DB 스키마 알려줘"
    ↓
Claude Code: search_plugins("portal database schema") 호출
    ↓
MCP 서버: [{id: "data-source-reference", score: 0.95, ...}] 반환
    ↓
Claude Code: get_plugin_content("data-source-reference") 호출
    ↓
MCP 서버: 플러그인 전체 내용 (SKILL.md + reference.md) 반환
    ↓
Claude Code: 해당 내용을 바탕으로 답변
```

---

## 4. MCP 서버 구현

### 4.1 파일 구조

```
web/
├── lib/
│   └── mcp/
│       ├── server.ts          # MCP 서버 메인
│       ├── tools.ts           # 도구 정의
│       └── handlers.ts        # 핸들러 구현
└── app/
    └── api/
        └── mcp/
            └── route.ts       # HTTP 엔드포인트 (옵션)
```

### 4.2 MCP 서버 코드 예시

```typescript
// lib/mcp/tools.ts
export const tools = [
  {
    name: "search_plugins",
    description: "마켓플레이스에서 플러그인 검색. 키워드와 매칭되는 플러그인 반환",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "검색 키워드 (예: 'database', 'refactoring', 'code review')"
        },
        category: {
          type: "string",
          enum: ["skill", "agent", "command", "all"],
          description: "플러그인 카테고리 필터"
        },
        limit: {
          type: "number",
          description: "최대 결과 수 (기본: 5)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_plugin_content",
    description: "특정 플러그인의 전체 내용 조회. 스킬/에이전트/커맨드 정의 포함",
    inputSchema: {
      type: "object",
      properties: {
        pluginId: {
          type: "string",
          description: "플러그인 ID (예: 'data-source-reference')"
        }
      },
      required: ["pluginId"]
    }
  },
  {
    name: "list_plugins",
    description: "마켓플레이스의 모든 플러그인 목록 조회",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["skill", "agent", "command", "guide", "all"]
        }
      }
    }
  }
];
```

### 4.3 핸들러 구현 예시

```typescript
// lib/mcp/handlers.ts
import { db } from '@/lib/db';
import { catalogItems } from '@/lib/db/schema';
import { ilike, or, eq, sql } from 'drizzle-orm';

export async function searchPlugins(query: string, category?: string, limit = 5) {
  const searchPattern = `%${query}%`;

  let whereClause = or(
    ilike(catalogItems.name, searchPattern),
    ilike(catalogItems.description, searchPattern),
    sql`${catalogItems.tags}::text ILIKE ${searchPattern}`
  );

  if (category && category !== 'all') {
    whereClause = and(whereClause, eq(catalogItems.type, category));
  }

  const results = await db
    .select({
      id: catalogItems.id,
      name: catalogItems.name,
      type: catalogItems.type,
      description: catalogItems.description,
      tags: catalogItems.tags,
    })
    .from(catalogItems)
    .where(whereClause)
    .limit(limit);

  return results;
}

export async function getPluginContent(pluginId: string) {
  const item = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, pluginId))
    .limit(1);

  if (!item.length) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  return {
    id: item[0].id,
    name: item[0].name,
    type: item[0].type,
    description: item[0].description,
    content: item[0].content,      // SKILL.md 또는 에이전트 정의
    readme: item[0].readme,        // 추가 문서
    tags: item[0].tags,
    author: item[0].author,
  };
}

export async function listPlugins(category?: string) {
  let query = db.select({
    id: catalogItems.id,
    name: catalogItems.name,
    type: catalogItems.type,
    description: catalogItems.description,
  }).from(catalogItems);

  if (category && category !== 'all') {
    query = query.where(eq(catalogItems.type, category));
  }

  return await query;
}
```

---

## 5. 팀원 설정 방법

### 5.1 MCP 서버 등록

팀원의 Claude Code 설정에 MCP 서버 추가:

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "gpters-marketplace": {
      "command": "npx",
      "args": ["-y", "@gpters/marketplace-mcp"],
      "env": {
        "API_URL": "https://company-ai-toolkit.vercel.app/api"
      }
    }
  }
}
```

또는 HTTP 기반 MCP 서버:

```json
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://company-ai-toolkit.vercel.app/api/mcp"
    }
  }
}
```

### 5.2 프로젝트별 설정 (선택)

특정 프로젝트에서만 사용하려면 프로젝트 루트에 설정:

```json
// 프로젝트/.claude/settings.json
{
  "mcpServers": {
    "gpters-marketplace": {
      "type": "http",
      "url": "https://company-ai-toolkit.vercel.app/api/mcp"
    }
  }
}
```

### 5.3 CLAUDE.md에 사용 지침 추가

프로젝트 CLAUDE.md에 MCP 서버 사용 지침 추가:

```markdown
## 사내 플러그인 활용

작업 중 필요한 지침이나 레퍼런스가 있으면 gpters-marketplace MCP 서버를 활용하세요:

1. `search_plugins("키워드")` - 관련 플러그인 검색
2. `get_plugin_content("플러그인ID")` - 상세 내용 조회
3. 조회한 내용을 바탕으로 작업 수행
```

---

## 6. 사용 예시

### 6.1 데이터베이스 스키마 조회

```
사용자: Portal DB의 users 테이블 구조 알려줘

Claude Code 내부 동작:
1. search_plugins("portal database schema users")
2. 결과: [{id: "data-source-reference", ...}]
3. get_plugin_content("data-source-reference")
4. 플러그인 내용을 읽고 users 테이블 정보 추출
5. 사용자에게 답변
```

### 6.2 리팩토링 가이드 조회

```
사용자: 이 코드 리팩토링 해줘

Claude Code 내부 동작:
1. search_plugins("refactoring guide")
2. 결과: [{id: "refactor-guide", ...}]
3. get_plugin_content("refactor-guide")
4. 가이드의 원칙에 따라 리팩토링 수행
```

### 6.3 코드 리뷰 에이전트 활용

```
사용자: 이 PR 리뷰해줘

Claude Code 내부 동작:
1. search_plugins("code review")
2. 결과: [{id: "code-reviewer", type: "agent", ...}]
3. get_plugin_content("code-reviewer")
4. 에이전트 정의에 따라 리뷰 수행
```

---

## 7. 구현 상태

### ✅ Phase 1: 기본 MCP 서버 (완료)

구현된 파일:
- `web/lib/mcp/types.ts` - 타입 정의
- `web/lib/mcp/tools.ts` - 도구 정의
- `web/lib/mcp/handlers.ts` - DB 조회 핸들러
- `web/lib/mcp/server.ts` - MCP 서버 로직
- `web/lib/mcp/index.ts` - 모듈 내보내기
- `web/app/api/mcp/route.ts` - HTTP API 엔드포인트

### API 엔드포인트

**JSON-RPC 2.0 모드 (MCP 프로토콜)**:
```bash
POST /api/mcp
Content-Type: application/json

{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
```

**Simple REST 모드**:
```bash
# 검색
POST /api/mcp?action=search
{"query": "database"}

# 플러그인 조회
POST /api/mcp?action=get
{"pluginId": "data-source-reference"}

# 목록
POST /api/mcp?action=list
{"category": "skill"}
```

### 🔜 Phase 2: 팀 배포 (예정)

1. MCP 서버 npm 패키지로 배포 (`@gpters/marketplace-mcp`)
2. 팀원 온보딩 문서 작성
3. 설정 템플릿 제공

### 📋 Phase 3: 고급 기능 (선택)

1. 시맨틱 검색 (벡터 임베딩)
2. 사용 통계 수집
3. 플러그인 추천 시스템
4. 캐싱 레이어

---

## 8. 비교: 수동 설치 vs MCP 서버

| 항목 | 수동 설치 | MCP 서버 |
|------|----------|----------|
| 초기 설정 | 마켓플레이스 등록 + 플러그인 설치 | MCP 서버 등록만 |
| 새 플러그인 사용 | 매번 수동 설치 필요 | 자동 검색/사용 |
| 플러그인 업데이트 | 재설치 필요 | 서버에서 자동 반영 |
| 오프라인 사용 | ✅ 가능 | ❌ 불가 (서버 필요) |
| 성능 | 빠름 (로컬) | 네트워크 지연 있음 |
| 유연성 | 낮음 | 높음 (동적 검색) |

---

## 9. 제한사항

### 9.1 MCP 서버 방식의 한계

- **네트워크 의존**: 인터넷 연결 필수
- **지연 시간**: API 호출 시 약간의 지연
- **서버 운영 비용**: 서버 인프라 필요

### 9.2 기능적 제한

- **자동 설치 불가**: 플러그인을 "설치"하는 게 아니라 "내용을 조회"하는 방식
- **로컬 캐싱 없음**: 매번 서버에서 조회
- **Claude Code 네이티브 통합 아님**: MCP 도구로 우회하는 방식

---

## 10. 결론

**"마켓플레이스 등록만으로 자동 플러그인 사용"**은 Claude Code 네이티브로는 불가능하지만, **MCP 서버를 통해 동등한 경험을 구현할 수 있습니다.**

### 권장 접근법

1. **단기**: 기존 마켓플레이스 + 수동 설치 유지
2. **중기**: MCP 서버 구현으로 자동 검색/조회 지원
3. **장기**: Claude Code의 동적 플러그인 로딩 기능 출시 대기

---

## 관련 문서

- [마켓플레이스 통합 계획](./MARKETPLACE_INTEGRATION.md)
- [Claude Code 플러그인 공식 문서](https://docs.anthropic.com/en/docs/claude-code/plugins)
- [MCP 서버 개발 가이드](https://modelcontextprotocol.io/)
