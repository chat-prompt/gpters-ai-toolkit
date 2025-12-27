# GPTers AI Toolkit V2 Architecture

## Executive Summary

바이브 코더를 위한 스킬 공유 시스템. Claude가 UI, MCP가 API.

```
"이 스킬 팀이랑 공유해줘" → 끝
"코드리뷰 스킬 설치해줘" → 끝
"업데이트 있어?" → "2개 있어요" → "응" → 끝
```

---

## 1. 핵심 원칙

| 원칙 | 설명 |
|------|------|
| Claude가 UI | 웹/CLI 대신 자연어 대화 |
| MCP가 API | 별도 스킬 설치 없이 바로 사용 |
| 최소 인프라 | 새 테이블 없음, 컬럼 2개만 추가 |
| 즉시 동작 | 설정/학습 없이 바로 사용 |

---

## 2. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                      사용자 ↔ Claude                         │
│                                                             │
│  "이 스킬 공유해줘"        "코드리뷰 스킬 설치해줘"            │
│         │                         │                         │
│         ▼                         ▼                         │
│  ┌─────────────┐           ┌─────────────┐                  │
│  │ deploy_skill│           │get_plugin   │                  │
│  │ (MCP tool)  │           │ (MCP tool)  │                  │
│  └──────┬──────┘           └──────┬──────┘                  │
│         │                         │                         │
└─────────┼─────────────────────────┼─────────────────────────┘
          │                         │
          ▼                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    GPTers Toolkit API                        │
│                       (MCP Server)                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tools                                                │    │
│  │                                                      │    │
│  │ • search_plugins     (기존) 검색                     │    │
│  │ • get_plugin_content (기존) 콘텐츠 조회              │    │
│  │ • list_plugins       (기존) 목록                     │    │
│  │ • deploy_skill       (NEW)  배포                     │    │
│  │ • check_updates      (NEW)  버전 체크                │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         Data Layer                           │
│                                                             │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ Neon PostgreSQL  │────────▶│ GitHub Repo      │          │
│  │ (Source of Truth)│  Sync   │ (Distribution)   │          │
│  └──────────────────┘         └──────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 흐름

### 3.1 배포 (Deploy)

```
사용자: "이 스킬 팀이랑 공유해줘"
           │
           ▼
┌─────────────────────────────────────┐
│ Claude                              │
│                                     │
│ 1. 대화에서 스킬 콘텐츠 수집         │
│ 2. 메타데이터 추출/생성              │
│    - name, description, tags        │
│    - allowed-tools (있으면)          │
└──────────────┬──────────────────────┘
               │ MCP: deploy_skill
               ▼
┌─────────────────────────────────────┐
│ API Server                          │
│                                     │
│ 1. 기존 스킬 확인 (id로)            │
│ 2. 버전 자동 결정                    │
│    - 신규: 1.0.0                    │
│    - 업데이트: auto bump            │
│ 3. DB 저장                          │
│ 4. GitHub 동기화                    │
│ 5. (선택) Slack 알림                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Response                            │
│                                     │
│ {                                   │
│   "success": true,                  │
│   "id": "code-reviewer",            │
│   "version": "1.0.0",               │
│   "message": "배포 완료!"            │
│ }                                   │
└─────────────────────────────────────┘
               │
               ▼
Claude: "✅ 배포 완료! code-reviewer v1.0.0
        팀원들은 '코드리뷰 스킬 설치해줘'라고 하면 돼요."
```

### 3.2 설치 (Install)

```
사용자: "코드리뷰 스킬 설치해줘"
           │
           ▼
┌─────────────────────────────────────┐
│ Claude                              │
│                                     │
│ 1. MCP: search_plugins("코드리뷰")  │
│ 2. 결과에서 스킬 선택               │
│ 3. MCP: get_plugin_content(id)      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ API Server                          │
│                                     │
│ 스킬 콘텐츠 + 파일 반환              │
│ {                                   │
│   "id": "code-reviewer",            │
│   "version": "1.2.0",               │
│   "content": "...",                 │
│   "files": [...]                    │
│ }                                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Claude (Write 도구 사용)            │
│                                     │
│ ~/.claude/skills/code-reviewer/     │
│   └── SKILL.md                      │
│                                     │
│ (또는 plugin 디렉토리에 설치)        │
└─────────────────────────────────────┘
               │
               ▼
Claude: "✅ 설치 완료! code-reviewer v1.2.0
        /code-reviewer로 사용하세요."
```

### 3.3 업데이트 확인 (Check Updates)

```
사용자: "내 스킬들 업데이트 있어?"
           │
           ▼
┌─────────────────────────────────────┐
│ Claude                              │
│                                     │
│ 1. Glob: ~/.claude/skills/*/        │
│ 2. Read: 각 SKILL.md 의 frontmatter │
│    - id, version 추출               │
│ 3. MCP: check_updates([...])        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ API Server                          │
│                                     │
│ 각 스킬의 최신 버전과 비교           │
│ {                                   │
│   "updates": [                      │
│     {                               │
│       "id": "code-reviewer",        │
│       "installed": "1.0.0",         │
│       "latest": "1.2.0",            │
│       "changelog": "보안 체크 추가"  │
│     }                               │
│   ]                                 │
│ }                                   │
└──────────────┬──────────────────────┘
               │
               ▼
Claude: "📢 업데이트 1개 있어요:
        • code-reviewer: 1.0.0 → 1.2.0
          변경: 보안 체크 추가

        업데이트할까요?"
           │
           ▼ (사용자: "응")

Claude: (get_plugin_content → Write)
        "✅ 업데이트 완료!"
```

---

## 4. DB 변경사항

### 4.1 catalog_items 컬럼 추가

```sql
-- 기존 테이블에 2개 컬럼만 추가
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS
  status TEXT DEFAULT 'published',           -- 'draft' | 'published'
  current_version TEXT DEFAULT '1.0.0';      -- semver
```

### 4.2 Drizzle 스키마 수정

```typescript
// web/lib/db/schema.ts

export const catalogItems = pgTable('catalog_items', {
  // ... 기존 필드들 ...

  // NEW: 상태 및 버전
  status: text('status').default('published'),        // draft | published
  currentVersion: text('current_version').default('1.0.0'),

  // 기존 marketplace 필드는 유지
  marketplaceEnabled: boolean('marketplace_enabled').default(true),
  marketplaceSyncedAt: timestamp('marketplace_synced_at'),
});
```

---

## 5. MCP Tools

### 5.1 deploy_skill (NEW)

```typescript
{
  name: 'deploy_skill',
  description: 'Deploy a skill/agent/command to GPTers AI Toolkit for team sharing',
  inputSchema: {
    type: 'object',
    properties: {
      // 필수
      type: {
        type: 'string',
        enum: ['skill', 'agent', 'command', 'hook'],
        description: 'Type of item to deploy'
      },
      name: {
        type: 'string',
        description: 'Display name of the skill'
      },
      content: {
        type: 'string',
        description: 'Full content (SKILL.md content, agent definition, etc.)'
      },

      // 선택
      id: {
        type: 'string',
        description: 'Unique ID (auto-generated from name if not provided)'
      },
      description: {
        type: 'string',
        description: 'Short description'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for categorization'
      },
      teamTag: {
        type: 'string',
        enum: ['platform', 'ai', 'data', 'product', 'infra', 'general'],
        description: 'Team category'
      },
      allowedTools: {
        type: 'string',
        description: 'Comma-separated allowed tools (for skills)'
      },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        default: 'published',
        description: 'Publication status'
      },

      // 버전 관리
      changelog: {
        type: 'string',
        description: 'What changed in this version (for updates)'
      }
    },
    required: ['type', 'name', 'content']
  }
}
```

**Response:**

```typescript
interface DeployResponse {
  success: boolean;
  id: string;
  version: string;
  previousVersion?: string;  // 업데이트인 경우
  changelog?: string;
  webUrl: string;            // https://company-ai-toolkit.vercel.app/skill/{id}
  installHint: string;       // "팀원들은 '{name} 설치해줘'라고 하면 돼요"
}
```

### 5.2 check_updates (NEW)

```typescript
{
  name: 'check_updates',
  description: 'Check for updates to installed skills',
  inputSchema: {
    type: 'object',
    properties: {
      installations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            version: { type: 'string' }
          },
          required: ['id', 'version']
        },
        description: 'List of installed skills with their versions'
      }
    },
    required: ['installations']
  }
}
```

**Response:**

```typescript
interface CheckUpdatesResponse {
  updates: Array<{
    id: string;
    name: string;
    installedVersion: string;
    latestVersion: string;
    changelog: string;
  }>;
  upToDate: number;  // 최신인 스킬 개수
}
```

### 5.3 기존 Tools 수정

**get_plugin_content** - version 정보 추가:

```typescript
interface GetPluginContentResponse {
  // 기존 필드들...
  id: string;
  name: string;
  content: string;
  files: Array<{ name: string; content: string; type: string }>;

  // NEW
  version: string;
  status: string;
  changelog?: string;
}
```

---

## 6. 버전 자동 관리

### 6.1 버전 결정 로직

```typescript
// web/lib/services/version.ts

import * as semver from 'semver';
import { diffLines } from 'diff';

interface VersionBump {
  version: string;
  type: 'major' | 'minor' | 'patch' | 'none';
  changelog: string;
}

export function determineVersion(
  existing: { content: string; version: string } | null,
  newContent: string,
  explicitChangelog?: string
): VersionBump {

  // 신규 스킬
  if (!existing) {
    return {
      version: '1.0.0',
      type: 'none',
      changelog: 'Initial release'
    };
  }

  const changes = analyzeChanges(existing.content, newContent);

  // Major: Breaking changes
  if (changes.breaking) {
    return {
      version: semver.inc(existing.version, 'major')!,
      type: 'major',
      changelog: explicitChangelog || changes.summary
    };
  }

  // Minor: New features
  if (changes.newFeatures) {
    return {
      version: semver.inc(existing.version, 'minor')!,
      type: 'minor',
      changelog: explicitChangelog || changes.summary
    };
  }

  // Patch: Bug fixes, minor improvements
  if (changes.hasChanges) {
    return {
      version: semver.inc(existing.version, 'patch')!,
      type: 'patch',
      changelog: explicitChangelog || changes.summary
    };
  }

  // No changes
  return {
    version: existing.version,
    type: 'none',
    changelog: 'No changes'
  };
}

function analyzeChanges(oldContent: string, newContent: string) {
  const diff = diffLines(oldContent, newContent);

  const added = diff.filter(d => d.added).map(d => d.value).join('');
  const removed = diff.filter(d => d.removed).map(d => d.value).join('');

  // Breaking change patterns
  const breakingPatterns = [
    /^-\s*allowed-tools:/m,     // allowed-tools 제거
    /^-\s*##\s+\w+/m,           // 주요 섹션 제거
  ];

  const breaking = breakingPatterns.some(p => p.test(removed));

  // New feature patterns
  const featurePatterns = [
    /^\+\s*##\s+\w+/m,          // 새 섹션 추가
    /^\+\s*###\s+\w+/m,         // 새 서브섹션 추가
  ];

  const newFeatures = featurePatterns.some(p => p.test(added));

  const hasChanges = diff.some(d => d.added || d.removed);

  // 자동 요약 생성
  const summary = generateSummary(diff);

  return { breaking, newFeatures, hasChanges, summary };
}

function generateSummary(diff: Change[]): string {
  const addedLines = diff.filter(d => d.added).length;
  const removedLines = diff.filter(d => d.removed).length;

  if (addedLines > removedLines * 2) return 'Content expanded';
  if (removedLines > addedLines * 2) return 'Content simplified';
  if (addedLines > 0 && removedLines > 0) return 'Content updated';
  if (addedLines > 0) return 'Content added';
  if (removedLines > 0) return 'Content removed';
  return 'Minor updates';
}
```

### 6.2 SKILL.md 버전 포함

스킬 콘텐츠에 버전 정보 포함:

```yaml
---
name: Code Reviewer
description: 코드 리뷰 자동화
version: 1.2.0
allowed-tools: Read, Grep
---

# Code Reviewer

...
```

---

## 7. 구현 계획

### Phase 1: Core Deploy (1일)

```
□ deploy_skill MCP tool 구현
  □ 핸들러 함수 작성
  □ 버전 자동 결정 로직
  □ DB 저장 + GitHub 동기화

□ DB 스키마 업데이트
  □ status, current_version 컬럼 추가
  □ 마이그레이션 실행
```

### Phase 2: Version Check (0.5일)

```
□ check_updates MCP tool 구현
□ get_plugin_content에 version 추가
```

### Phase 3: Polish (0.5일)

```
□ 에러 핸들링
□ 테스트 작성
□ 배포 시 Slack 알림 (선택)
```

---

## 8. 파일 구조 변경

```
web/lib/
├── mcp/
│   ├── handlers.ts      # MODIFY: deploy_skill, check_updates 추가
│   ├── tools.ts         # MODIFY: 새 tool 정의 추가
│   └── ...
│
├── services/
│   └── version.ts       # NEW: 버전 관리 로직
│
└── db/
    └── schema.ts        # MODIFY: status, currentVersion 추가
```

---

## 9. 사용 예시

### 배포

```
👤: 방금 만든 DB 마이그레이션 스킬 팀이랑 공유하고 싶어

🤖: 배포할게요.

   📦 db-migration-helper

   이름: DB Migration Helper
   설명: 데이터베이스 마이그레이션 자동화
   태그: database, migration

   이대로 배포할까요?

👤: 응

🤖: (MCP: deploy_skill 호출)

   ✅ 배포 완료!

   📦 db-migration-helper v1.0.0
   🔗 https://company-ai-toolkit.vercel.app/skill/db-migration-helper

   팀원들은 "DB 마이그레이션 스킬 설치해줘"라고 하면 돼요.
```

### 업데이트 배포

```
👤: 이 스킬 롤백 기능 추가했으니까 다시 올려줘

🤖: (MCP: deploy_skill 호출 - 기존 id로)

   ✅ 업데이트 배포 완료!

   📦 db-migration-helper
   📈 1.0.0 → 1.1.0
   📝 롤백 기능 추가

   설치한 팀원들에게 업데이트 알림이 갈 거예요.
```

### 설치

```
👤: 다혜님이 만든 코드리뷰 스킬 설치해줘

🤖: (MCP: search_plugins 호출)
   (MCP: get_plugin_content 호출)
   (Write 도구로 로컬에 저장)

   ✅ 설치 완료!

   📦 code-reviewer v1.2.0
   📍 ~/.claude/skills/code-reviewer/SKILL.md

   대화 중 코드 리뷰가 필요할 때 자동으로 활성화돼요.
```

### 업데이트 확인

```
👤: 업데이트 있어?

🤖: (로컬 스킬 스캔)
   (MCP: check_updates 호출)

   📢 업데이트 2개 있어요:

   • code-reviewer: 1.0.0 → 1.2.0
     변경: 보안 취약점 체크 추가

   • db-helper: 2.0.0 → 2.1.0
     변경: PostgreSQL 17 지원

   업데이트할까요?

👤: code-reviewer만

🤖: (해당 스킬만 업데이트)

   ✅ code-reviewer 업데이트 완료! (1.2.0)
```

---

## 10. 향후 확장 (나중에)

현재 MVP 이후 필요시 추가:

| 기능 | 설명 | 복잡도 |
|------|------|--------|
| PR 협업 | 개선 제안 → 원작자 승인 | 중 |
| AI 리뷰 | 배포 시 자동 품질 체크 | 중 |
| 버전 히스토리 | 이전 버전 조회/롤백 | 하 |
| 설치 통계 | 누가 뭘 설치했는지 | 하 |
| 의존성 관리 | 스킬 간 의존성 자동 설치 | 상 |

---

## Appendix: 기존 대비 변경 요약

| 항목 | 기존 | V2 |
|------|------|-----|
| 배포 방법 | 웹 Admin UI | Claude 대화 (MCP) |
| 설치 방법 | /plugin install 명령어 | Claude 대화 |
| 버전 관리 | 없음 | 자동 semver |
| 새 테이블 | - | 없음 |
| 새 컬럼 | - | 2개 (status, version) |
| 새 MCP tools | - | 2개 |
| 구현 기간 | - | 1-2일 |
