# Organization-Based Multi-Tenancy Access Control System

## TL;DR

> **Quick Summary**: GPTers AI Toolkit에 조직(Organization) 기반 멀티테넌시를 도입하여 외부 회사/조직이 자체 아이템을 관리하고, 3단계 공개 수준(private/shared/public)으로 아이템 접근을 제어합니다. 기존 @gpters.org 사용자와 아이템은 GPTers 조직의 내부 전용으로 유지됩니다.
>
> **Deliverables**:
> - Organizations 테이블 + 멤버십 모델 (DB 스키마)
> - 4단계 역할 체계 (super_admin + org_admin/org_editor/org_viewer)
> - 아이템 3단계 공개 수준 (private/shared/public)
> - Google OAuth 도메인 기반 조직 자동 배정
> - 조직 전환 UI + 세션 관리
> - 모든 API 라우트에 조직 컨텍스트 적용
> - MCP 서버 조직 기반 접근 제어
> - Fork 기능 (조직 간 아이템 복사)
> - 조직 관리 (생성/설정/멤버 관리)
> - 기존 데이터 마이그레이션 스크립트
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 5 → Task 8 → Task 11

---

## Context

### Original Request
외부 인원들도 플랫폼을 사용할 수 있게 하되, 권한에 따라 사용 가능한 아이템이 달라지는 시스템 필요.

### Interview Summary
**Key Discussions**:
- 외부 인원 = B2B (다른 회사/조직 팀원), B2C 아님
- 조직(Organization) 기반 멀티테넌시로 접근 제어
- Google OAuth 도메인 확장 (조직별 허용 도메인 등록)
- 아이템 공개 수준 3단계: private / shared / public
- 조직 내 역할은 기존 3단계 유지 (admin/editor/viewer)
- 글로벌 super_admin 역할 추가 (GPTers 플랫폼 운영자)
- 조직 간 공유는 Fork (복사) 방식, 원본 참조 유지
- MCP도 조직 기반 접근 제어 적용
- 과금 없음 (무료)
- 복수 조직 소속 가능 → 조직 전환하며 사용
- 조직 생성: super_admin 직접 + 셀프서비스 신청(승인 필요)
- 기존 데이터는 GPTers 조직 내부 전용으로 유지
- 전체 구현 (단계적 도입 아님)

**Research Findings**:
- 기존 RBAC가 잘 구조화되어 있음 (packages/lib/src/security/rbac.ts, 254줄)
- 583줄 RBAC 테스트 스위트 존재
- OAuth 2.1 테이블 이미 존재 (MCP 인증용)
- teamTag 필드는 조직 내 팀 분류용으로 병행 유지
- 기존 API 패턴: rate limit → auth → permission → business logic

### Metis Review
**Identified Gaps** (addressed):
- 다중 도메인 사용자 해결: 모든 매칭 조직에 자동 등록, 클라이언트에서 조직 선택
- 세션 조직 컨텍스트: 쿠키/로컬스토리지로 현재 조직 관리
- teamTag 처리: org_id와 병행 유지 (teamTag = 조직 내 팀 분류)
- 마이그레이션: 유지보수 창에서 수행
- 데이터 격리 가드레일 설정 (private 아이템 존재 자체 노출 금지 등)

---

## Work Objectives

### Core Objective
조직 기반 멀티테넌시를 도입하여 외부 B2B 조직이 플랫폼을 사용할 수 있게 하면서, 조직 간 데이터 격리와 3단계 아이템 공개 수준을 통해 세밀한 접근 제어를 제공한다.

### Concrete Deliverables
- `packages/db/src/schema.ts`: organizations, org_memberships, org_invitations 테이블 추가
- `packages/db/src/schema.ts`: catalog_items에 org_id, visibility, forked_from 필드 추가
- `packages/lib/src/security/rbac.ts`: super_admin 역할 + 조직 기반 퍼미션 확장
- `apps/web/lib/core/auth-config.ts`: 도메인 기반 조직 자동 배정 로직
- `apps/web/middleware.ts`: 조직 컨텍스트 검증 추가
- API 라우트 전체: 조직 기반 접근 제어 적용
- MCP 서버: 조직 기반 아이템 필터링
- Fork API: 조직 간 아이템 복사 기능
- 조직 관리 UI: 생성/설정/멤버/도메인 관리
- 조직 전환 UI: 헤더에 조직 셀렉터
- 마이그레이션 스크립트: 기존 데이터 → GPTers 조직

### Definition of Done
- [ ] 외부 조직 사용자가 Google OAuth로 로그인 후 자신의 조직 아이템만 볼 수 있다
- [ ] private 아이템은 해당 조직 멤버만 접근 가능 (존재 자체 노출 금지)
- [ ] shared 아이템은 지정된 조직들만 접근 가능
- [ ] public 아이템은 모든 인증된 사용자가 접근 가능
- [ ] MCP 검색에서도 조직 권한에 따른 필터링 동작
- [ ] Fork로 다른 조직의 public 아이템을 자신의 조직에 복사 가능
- [ ] super_admin은 모든 조직의 데이터에 접근 가능
- [ ] 기존 @gpters.org 데이터가 GPTers 조직의 private으로 유지
- [ ] pnpm test 전체 통과
- [ ] pnpm lint 통과
- [ ] pnpm build 성공

### Must Have
- Organizations 테이블 + 멤버십 모델
- 4단계 역할: super_admin / org_admin / org_editor / org_viewer
- 아이템 visibility: private / shared / public
- 도메인 기반 조직 자동 배정
- 모든 API 라우트에 조직 컨텍스트 적용
- MCP 조직 기반 접근 제어
- Fork 기능
- 기존 데이터 마이그레이션
- 마이그레이션 롤백 스크립트

### Must NOT Have (Guardrails)
- ❌ 과금/빌링 코드 (무료 모델)
- ❌ 조직 계층 구조 (플랫 구조만, 하위 조직 없음)
- ❌ 커스텀 역할 정의 (고정 3단계만)
- ❌ SSO/SAML 인증 (Google OAuth only)
- ❌ 조직 브랜딩 (로고, 테마 등)
- ❌ 조직 간 공동 편집 (Fork만, 공유 편집 없음)
- ❌ Fork 동기화 (Fork는 시점 복사, 원본 업데이트 자동 반영 없음)
- ❌ 이메일/Slack 알림 시스템
- ❌ 사용량 대시보드/분석
- ❌ 개인 이메일(gmail.com 등) 가입 허용 (B2B 도메인만)
- ❌ client-provided org_id를 권한 결정에 신뢰하지 않음 (서버에서 검증)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> ALL verification is executed by the agent using tools (Playwright, Bash, curl, etc.).

### Test Decision
- **Infrastructure exists**: YES (Vitest + Playwright)
- **Automated tests**: YES (TDD)
- **Framework**: Vitest (unit/API), Playwright (E2E)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| DB Schema | Bash (pnpm db:push + SQL queries) | Push schema, verify tables exist, check constraints |
| API Routes | Bash (curl/httpie) | Send requests, assert status codes and response bodies |
| Auth Flow | Playwright | Navigate login, verify redirect, check session |
| Frontend UI | Playwright | Navigate, interact, assert DOM elements |
| MCP Server | Bash (curl JSON-RPC) | Send MCP requests, verify filtered results |
| Migration | Bash (SQL + scripts) | Run migration, verify data integrity |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Start Immediately):
├── Task 1: DB Schema (organizations, memberships, invitations)
├── Task 2: Extend catalog_items schema (org_id, visibility, forked_from)
└── Task 4: RBAC Extension (super_admin + org-scoped permissions)

Wave 2 (Auth & Core - After Wave 1):
├── Task 3: Auth Flow (domain-based org resolution)
├── Task 5: Org Context Middleware (session org management)
└── Task 6: Org Management API (CRUD, members, domains)

Wave 3 (Features - After Wave 2):
├── Task 7: Catalog API Org Filtering (all catalog routes)
├── Task 8: MCP Org-Based Access Control
├── Task 9: Fork API
└── Task 10: Org Management UI (admin pages)

Wave 4 (Integration - After Wave 3):
├── Task 11: Org Switcher UI (header component)
├── Task 12: Data Migration Script (existing → GPTers org)
└── Task 13: E2E Integration Tests

Critical Path: Task 1 → Task 3 → Task 5 → Task 7 → Task 11
Parallel Speedup: ~45% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 5, 6, 12 | 2, 4 |
| 2 | None | 7, 8, 9, 12 | 1, 4 |
| 3 | 1 | 5, 6 | 4 (if 1 done) |
| 4 | None | 5, 6, 7 | 1, 2 |
| 5 | 1, 3, 4 | 7, 8, 9, 10, 11 | 6 |
| 6 | 1, 3 | 10 | 5 |
| 7 | 2, 4, 5 | 11, 13 | 8, 9, 10 |
| 8 | 2, 5 | 13 | 7, 9, 10 |
| 9 | 2, 5 | 13 | 7, 8, 10 |
| 10 | 6 | 13 | 7, 8, 9 |
| 11 | 5, 7 | 13 | 12 |
| 12 | 1, 2 | 13 | 11 |
| 13 | 7, 8, 9, 10, 11, 12 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2, 4 | delegate_task(category="unspecified-high", ...) parallel |
| 2 | 3, 5, 6 | delegate_task(category="deep", ...) parallel after Wave 1 |
| 3 | 7, 8, 9, 10 | delegate_task(category="deep", ...) parallel after Wave 2 |
| 4 | 11, 12, 13 | 11=visual-engineering, 12=unspecified-high, 13=deep |

---

## TODOs

- [ ] 1. DB Schema: Organizations & Memberships

  **What to do**:
  - `packages/db/src/schema.ts`에 다음 테이블 추가:
    - `organizations` 테이블: id, name, slug, allowed_domains (jsonb string[]), description, is_active, created_at, updated_at
    - `org_memberships` 테이블: user_id, org_id, role (org_admin/org_editor/org_viewer), joined_at, invited_by
    - `org_invitations` 테이블: id, org_id, email, role, status (pending/accepted/rejected/expired), invited_by, expires_at, created_at
  - 관계 (relations) 정의: organizations ↔ org_memberships ↔ users
  - 인덱스: org_memberships(user_id, org_id), org_invitations(email, org_id, status)
  - GPTers 기본 조직 시드 데이터 준비 (마이그레이션에서 사용)

  **Must NOT do**:
  - 조직 계층 구조 (parent_org_id 등) 추가 금지
  - 커스텀 역할 테이블 추가 금지
  - 과금 관련 필드 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: DB 스키마 설계는 도메인 특화 작업이지만 높은 정확도 필요
  - **Skills**: [`git-master`]
    - `git-master`: 스키마 변경 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 4)
  - **Blocks**: Tasks 3, 5, 6, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/db/src/schema.ts:99-111` - 기존 users 테이블 패턴 (pgTable, 인덱스, relations)
  - `packages/db/src/schema.ts:22` - userRoleEnum 패턴 → org role enum도 같은 방식
  - `packages/db/src/schema.ts:144-152` - catalogItemTags 정션 테이블 패턴 → org_memberships 참고
  - `packages/db/src/schema.ts:241-292` - oauthClients/oauthCodes 테이블 → 초대 테이블 패턴 참고

  **Type References**:
  - `packages/db/src/schema.ts:110-111` - UserRecord/NewUserRecord 패턴 → OrgRecord/NewOrgRecord도 동일

  **Test References**:
  - `apps/web/tests/unit/rbac.test.ts` - RBAC 테스트 구조 참고

  **WHY Each Reference Matters**:
  - users 테이블: 동일한 패턴으로 organizations 테이블 구조화
  - userRoleEnum: pgEnum으로 org 역할도 정의하는 방식 참고
  - catalogItemTags: 다대다 관계 정션 테이블의 Drizzle ORM 패턴
  - OAuth 테이블: 초대/토큰과 유사한 만료 관리 패턴

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일 생성: `apps/web/tests/unit/org-schema.test.ts`
  - [ ] organizations 테이블 CRUD 테스트 작성 → PASS
  - [ ] org_memberships 정션 테이블 관계 테스트 → PASS
  - [ ] org_invitations 만료 처리 테스트 → PASS
  - [ ] `pnpm test apps/web/tests/unit/org-schema.test.ts` → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: Schema push succeeds without errors
    Tool: Bash
    Preconditions: DATABASE_URL set, database accessible
    Steps:
      1. Run: pnpm db:push --force
      2. Assert: exit code 0
      3. Assert: stdout contains no errors
    Expected Result: Schema applied successfully
    Evidence: Terminal output captured

  Scenario: Organizations table has correct columns
    Tool: Bash (psql or drizzle-kit)
    Steps:
      1. Query: SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organizations' ORDER BY ordinal_position
      2. Assert: columns include id, name, slug, allowed_domains, description, is_active, created_at, updated_at
      3. Assert: allowed_domains type is jsonb
    Expected Result: All columns present with correct types
    Evidence: Query output captured

  Scenario: Org membership composite key enforced
    Tool: Bash (SQL)
    Steps:
      1. Insert org membership (user_id=U1, org_id=O1, role=org_viewer)
      2. Attempt duplicate insert (user_id=U1, org_id=O1, role=org_editor)
      3. Assert: second insert fails with unique constraint violation
    Expected Result: Duplicate membership prevented
    Evidence: Error output captured
  ```

  **Commit**: YES
  - Message: `feat(db): add organizations, memberships, and invitations tables`
  - Files: `packages/db/src/schema.ts`
  - Pre-commit: `pnpm test apps/web/tests/unit/org-schema.test.ts`

---

- [ ] 2. DB Schema: Extend catalog_items for Org Ownership & Visibility

  **What to do**:
  - `packages/db/src/schema.ts`의 `catalogItems` 테이블에 필드 추가:
    - `org_id`: text, references organizations.id (nullable initially for migration)
    - `visibility`: visibilityEnum('private' | 'shared' | 'public'), default 'private'
    - `forked_from`: text, references catalogItems.id (nullable, self-reference)
    - `fork_count`: integer, default 0
    - `shared_with_orgs`: jsonb string[] (shared visibility일 때 접근 허용 조직 ID 목록)
  - visibilityEnum pgEnum 생성
  - 인덱스 추가: org_id, visibility, forked_from
  - catalogItems relations에 organization 관계 추가

  **Must NOT do**:
  - org_id를 NOT NULL로 설정하지 않음 (마이그레이션 후 변경)
  - 기존 teamTag 필드 제거/변경 금지
  - fork sync 메커니즘 구현 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 스키마 확장은 기존 코드에 미치는 영향 범위가 넓음
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 4)
  - **Blocks**: Tasks 7, 8, 9, 12
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/db/src/schema.ts:34-90` - catalogItems 테이블 전체 구조 (확장할 대상)
  - `packages/db/src/schema.ts:71-76` - status/version 필드 패턴 → visibility도 같은 방식
  - `packages/db/src/schema.ts:84-90` - 기존 인덱스 패턴 → 새 인덱스 추가 시 참고
  - `packages/db/src/schema.ts:173-178` - catalogItemsRelations → organization 관계 추가

  **WHY Each Reference Matters**:
  - catalogItems: 확장할 정확한 위치와 기존 필드 구조 파악
  - status 패턴: text enum 기반 필드 추가 방식 참고
  - 인덱스: 기존 인덱스 네이밍/구조 따르기
  - relations: Drizzle ORM relations 확장 패턴

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/unit/catalog-visibility.test.ts`
  - [ ] visibility enum 값 검증 테스트 → PASS
  - [ ] forked_from 자기참조 관계 테스트 → PASS
  - [ ] `pnpm test apps/web/tests/unit/catalog-visibility.test.ts` → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: Catalog items table has new columns
    Tool: Bash (SQL)
    Steps:
      1. Run: pnpm db:push --force
      2. Query: SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_items' AND column_name IN ('org_id', 'visibility', 'forked_from', 'fork_count', 'shared_with_orgs')
      3. Assert: all 5 columns exist
    Expected Result: New columns added to catalog_items
    Evidence: Query output

  Scenario: Visibility enum has correct values
    Tool: Bash (SQL)
    Steps:
      1. Query: SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'visibility')
      2. Assert: values are 'private', 'shared', 'public'
    Expected Result: Enum defined correctly
    Evidence: Query output
  ```

  **Commit**: YES
  - Message: `feat(db): add org_id, visibility, fork fields to catalog_items`
  - Files: `packages/db/src/schema.ts`
  - Pre-commit: `pnpm test apps/web/tests/unit/catalog-visibility.test.ts`

---

- [ ] 3. Auth Flow: Domain-Based Organization Resolution

  **What to do**:
  - `apps/web/lib/core/auth-config.ts` 수정:
    - `ALLOWED_DOMAIN` 하드코딩 제거
    - signIn 콜백에서 이메일 도메인 → organizations.allowed_domains 매칭
    - 매칭되는 모든 조직에 org_membership 자동 생성
    - 매칭 조직이 없으면 로그인 거부 (기존 동작 유지)
  - `packages/lib/src/core/auth.ts` 수정 (해당 시)
  - JWT 토큰에 사용자의 조직 목록 (org_ids) 추가
  - 세션에 현재 활성 조직 ID + 조직 역할 추가

  **Must NOT do**:
  - 개인 이메일(gmail.com 등) 허용 금지
  - SSO/SAML 인증 추가 금지
  - 도메인 매칭 실패 시 자동 조직 생성 금지

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 인증 흐름은 보안에 민감하며 기존 로직과의 정합성이 중요
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `apps/web/lib/core/auth-config.ts:11` - ALLOWED_DOMAIN 하드코딩 (제거 대상)
  - `apps/web/lib/core/auth-config.ts:23-61` - signIn 콜백 전체 (수정 대상)
  - `apps/web/lib/core/auth-config.ts:62-72` - session 콜백 (org 정보 추가)
  - `apps/web/lib/core/auth-config.ts:73-94` - jwt 콜백 (org_ids 추가)
  - `packages/lib/src/core/auth.ts:57-109` - 패키지 레벨 auth 설정

  **API/Type References**:
  - `apps/web/types/next-auth.d.ts:1-24` - Session 타입 확장 (orgId, orgRole 추가)

  **Test References**:
  - `apps/web/tests/unit/rbac.test.ts` - 기존 RBAC 테스트 패턴

  **WHY Each Reference Matters**:
  - auth-config.ts signIn: 도메인 검증 로직의 정확한 위치와 현재 동작 파악
  - session/jwt 콜백: 조직 정보를 세션에 추가하는 정확한 위치
  - next-auth.d.ts: TypeScript 타입을 확장해야 하는 정확한 위치

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/unit/auth-org-resolution.test.ts`
  - [ ] 등록된 도메인 사용자 → 조직 자동 배정 테스트 → PASS
  - [ ] 미등록 도메인 사용자 → 로그인 거부 테스트 → PASS
  - [ ] 복수 조직 매칭 → 모든 조직에 멤버십 생성 테스트 → PASS
  - [ ] 세션에 orgId, orgRole 포함 테스트 → PASS
  - [ ] `pnpm test apps/web/tests/unit/auth-org-resolution.test.ts` → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: User with registered domain auto-joins org
    Tool: Bash (Vitest)
    Preconditions: Organization "TestOrg" exists with domain "testcorp.com"
    Steps:
      1. Mock Google OAuth callback with email "user@testcorp.com"
      2. Assert: user created in users table
      3. Assert: org_membership created (user_id, org_id=TestOrg, role=org_viewer)
      4. Assert: session contains orgId=TestOrg
    Expected Result: Automatic org assignment on first login
    Evidence: Test output

  Scenario: User with unregistered domain is rejected
    Tool: Bash (Vitest)
    Preconditions: No org has "unknown.com" domain
    Steps:
      1. Mock Google OAuth callback with email "user@unknown.com"
      2. Assert: signIn callback returns false
      3. Assert: no user record created
    Expected Result: Login rejected for unregistered domains
    Evidence: Test output

  Scenario: User matching multiple orgs gets all memberships
    Tool: Bash (Vitest)
    Preconditions: OrgA and OrgB both have "consultant.com" domain
    Steps:
      1. Mock Google OAuth callback with email "jane@consultant.com"
      2. Assert: org_membership exists for OrgA
      3. Assert: org_membership exists for OrgB
    Expected Result: Memberships created for all matching orgs
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(auth): implement domain-based organization resolution`
  - Files: `apps/web/lib/core/auth-config.ts`, `apps/web/types/next-auth.d.ts`, `packages/lib/src/core/auth.ts`
  - Pre-commit: `pnpm test apps/web/tests/unit/auth-org-resolution.test.ts`

---

- [ ] 4. RBAC Extension: super_admin + Org-Scoped Permissions

  **What to do**:
  - `packages/lib/src/security/rbac.ts` 확장:
    - UserRole에 'super_admin' 추가
    - OrgRole 타입 추가: 'org_admin' | 'org_editor' | 'org_viewer'
    - super_admin 전용 퍼미션 추가: ORGS_VIEW, ORGS_MANAGE, ORGS_CREATE, SUPER_ADMIN_ACCESS
    - 조직 기반 퍼미션 체크 함수 추가: `hasOrgPermission(orgRole, permission)`
    - `requireOrgPermission(permission, orgId)` 서버사이드 헬퍼 추가
    - `requireSuperAdmin()` 헬퍼 추가
    - 기존 함수들은 하위 호환 유지
  - `packages/db/src/schema.ts`의 userRoleEnum에 'super_admin' 추가
  - `apps/web/lib/security/rbac.ts` re-export 업데이트

  **Must NOT do**:
  - 기존 RBAC 함수의 시그니처 변경 금지 (하위 호환)
  - 커스텀 역할 정의 메커니즘 추가 금지
  - 조직 계층 기반 퍼미션 상속 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 기존 RBAC 패턴을 정확히 따르면서 확장해야 함
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/lib/src/security/rbac.ts:11-14` - UserRole 타입 + ROLE_HIERARCHY (확장 대상)
  - `packages/lib/src/security/rbac.ts:19-37` - Permissions 객체 (새 퍼미션 추가)
  - `packages/lib/src/security/rbac.ts:44-72` - ROLE_PERMISSIONS 매핑 (super_admin 추가)
  - `packages/lib/src/security/rbac.ts:77-81` - hasPermission 함수 패턴 → hasOrgPermission도 동일 패턴
  - `packages/lib/src/security/rbac.ts:191-253` - 서버사이드 헬퍼 패턴 → requireOrgPermission 참고

  **Test References**:
  - `apps/web/tests/unit/rbac.test.ts` - 583줄 기존 RBAC 테스트 (확장 필요)

  **WHY Each Reference Matters**:
  - ROLE_HIERARCHY: super_admin을 최상위에 추가해야 하는 정확한 위치
  - Permissions: 새 퍼미션을 기존 패턴과 동일하게 추가
  - ROLE_PERMISSIONS: super_admin에 모든 퍼미션 부여
  - 기존 테스트: 새 테스트가 기존 패턴을 따르도록

  **Acceptance Criteria**:

  TDD:
  - [ ] 기존 테스트 유지: `pnpm test apps/web/tests/unit/rbac.test.ts` → PASS (하위 호환)
  - [ ] 테스트 추가: super_admin 퍼미션 테스트 → PASS
  - [ ] 테스트 추가: hasOrgPermission 함수 테스트 → PASS
  - [ ] 테스트 추가: requireOrgPermission 서버 헬퍼 테스트 → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: Existing RBAC tests still pass (backward compatibility)
    Tool: Bash
    Steps:
      1. Run: pnpm test apps/web/tests/unit/rbac.test.ts
      2. Assert: exit code 0
      3. Assert: all existing tests pass
    Expected Result: Zero regression in existing RBAC
    Evidence: Test output

  Scenario: super_admin has all permissions
    Tool: Bash (Vitest)
    Steps:
      1. Call hasPermission('super_admin', permission) for every permission in Permissions
      2. Assert: all return true
    Expected Result: super_admin is unrestricted
    Evidence: Test output

  Scenario: org_admin permissions match expected set
    Tool: Bash (Vitest)
    Steps:
      1. Call hasOrgPermission('org_admin', 'catalog:create') → true
      2. Call hasOrgPermission('org_admin', 'catalog:delete') → true
      3. Call hasOrgPermission('org_admin', 'users:manage') → true
      4. Call hasOrgPermission('org_viewer', 'catalog:create') → false
    Expected Result: Org roles have correct permission sets
    Evidence: Test output
  ```

  **Commit**: YES
  - Message: `feat(rbac): add super_admin role and org-scoped permission system`
  - Files: `packages/lib/src/security/rbac.ts`, `packages/db/src/schema.ts`, `apps/web/lib/security/rbac.ts`
  - Pre-commit: `pnpm test apps/web/tests/unit/rbac.test.ts`

---

- [ ] 5. Org Context Middleware & Session Management

  **What to do**:
  - `apps/web/middleware.ts` 수정:
    - 인증 후 조직 컨텍스트 검증 로직 추가
    - 쿠키에서 현재 조직 ID 읽기 (`x-current-org-id` 쿠키)
    - 조직 멤버십 검증 (해당 조직에 속해 있는지)
    - super_admin은 모든 조직 접근 허용
  - 조직 컨텍스트 유틸리티 생성:
    - `packages/lib/src/security/org-context.ts`: getCurrentOrgId, setCurrentOrg, validateOrgAccess
  - 클라이언트 사이드 조직 컨텍스트:
    - `apps/web/lib/hooks/useOrgContext.ts`: React hook for org switching
    - 쿠키 + 로컬스토리지에 현재 조직 저장

  **Must NOT do**:
  - 조직 컨텍스트를 request body에서 읽지 않음 (쿠키/세션에서만)
  - 조직 간 세션 공유 구현 금지
  - 클라이언트에서 제공한 org_id를 권한 결정에 사용하지 않음 (서버에서 멤버십 검증)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 미들웨어와 세션은 전체 앱의 핵심 보안 레이어
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 6)
  - **Blocks**: Tasks 7, 8, 9, 10, 11
  - **Blocked By**: Tasks 1, 3, 4

  **References**:

  **Pattern References**:
  - `apps/web/middleware.ts:1-60` - 전체 미들웨어 (확장 대상)
  - `apps/web/middleware.ts:20-30` - 공개 라우트 목록 (유지)
  - `apps/web/middleware.ts:34-36` - DEV_BYPASS_AUTH 패턴 (org도 바이패스 추가)
  - `packages/lib/src/utils/api-utils.ts` - API 유틸리티 패턴 → org-context도 동일 구조

  **Test References**:
  - `apps/web/tests/unit/rbac.test.ts` - 서버사이드 헬퍼 테스트 패턴

  **WHY Each Reference Matters**:
  - middleware.ts: 확장할 정확한 위치와 기존 인증 흐름 파악
  - api-utils.ts: 서버 유틸리티의 패턴/구조 참고

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/unit/org-context.test.ts`
  - [ ] getCurrentOrgId: 쿠키에서 org ID 반환 테스트 → PASS
  - [ ] validateOrgAccess: 멤버십 검증 테스트 → PASS
  - [ ] super_admin 조직 접근 바이패스 테스트 → PASS
  - [ ] 비멤버 조직 접근 차단 테스트 → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: Middleware validates org membership
    Tool: Bash (curl)
    Preconditions: User belongs to OrgA only
    Steps:
      1. curl -H "Cookie: x-current-org-id=orgA-id; ..." http://localhost:3000/api/catalog
      2. Assert: HTTP 200
      3. curl -H "Cookie: x-current-org-id=orgB-id; ..." http://localhost:3000/api/catalog
      4. Assert: HTTP 403 "Not a member of this organization"
    Expected Result: Non-member org access blocked
    Evidence: Response status + body

  Scenario: super_admin can access any org
    Tool: Bash (curl)
    Preconditions: User has super_admin role
    Steps:
      1. curl with x-current-org-id set to any org
      2. Assert: HTTP 200 regardless of org
    Expected Result: super_admin bypasses org membership check
    Evidence: Response status
  ```

  **Commit**: YES
  - Message: `feat(middleware): add organization context validation and session management`
  - Files: `apps/web/middleware.ts`, `packages/lib/src/security/org-context.ts`, `apps/web/lib/hooks/useOrgContext.ts`
  - Pre-commit: `pnpm test apps/web/tests/unit/org-context.test.ts`

---

- [ ] 6. Organization Management API

  **What to do**:
  - `apps/web/app/api/organizations/route.ts`:
    - GET: 조직 목록 조회 (super_admin: 전체, 일반: 자신의 조직만)
    - POST: 조직 생성 (super_admin만) 또는 셀프서비스 신청 (pending 상태)
  - `apps/web/app/api/organizations/[orgId]/route.ts`:
    - GET: 조직 상세 조회 (멤버만)
    - PATCH: 조직 설정 수정 (org_admin)
  - `apps/web/app/api/organizations/[orgId]/members/route.ts`:
    - GET: 멤버 목록
    - POST: 멤버 초대 (org_admin)
    - PATCH: 멤버 역할 변경 (org_admin)
    - DELETE: 멤버 제거 (org_admin)
  - `apps/web/app/api/organizations/[orgId]/domains/route.ts`:
    - GET: 도메인 목록
    - POST: 도메인 추가 (org_admin)
    - DELETE: 도메인 제거 (org_admin)

  **Must NOT do**:
  - 조직 삭제 API 구현 금지 (soft delete/비활성화만)
  - 다른 조직 멤버 정보 노출 금지
  - 도메인 소유권 검증 구현 금지 (향후 과제)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: REST API 설계와 권한 체크가 복합적
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `apps/web/app/api/catalog/route.ts:95-186` - 기존 API 라우트 패턴 (rate limit → auth → permission → logic)
  - `apps/web/app/api/admin/users/route.ts:1-111` - 사용자 관리 API 패턴 → 멤버 관리 참고
  - `packages/lib/src/utils/api-utils.ts` - ApiErrors, requirePermissionAsync, getCurrentUser

  **Test References**:
  - `apps/web/tests/api/` - 기존 API 테스트 디렉토리

  **WHY Each Reference Matters**:
  - catalog route.ts: API 라우트의 정확한 패턴 (에러 처리, 응답 형식)
  - admin/users: 사용자 관리 API가 멤버 관리와 유사한 구조

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/api/organizations.test.ts`
  - [ ] 조직 CRUD API 테스트 → PASS
  - [ ] 멤버 관리 API 테스트 → PASS
  - [ ] 도메인 관리 API 테스트 → PASS
  - [ ] 권한 거부 테스트 (비멤버 접근) → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: super_admin creates organization
    Tool: Bash (curl)
    Steps:
      1. POST /api/organizations -d '{"name":"Partner Corp","slug":"partner-corp","allowedDomains":["partner.com"]}'
         -H "Authorization: Bearer $SUPER_ADMIN_TOKEN"
      2. Assert: HTTP 201
      3. Assert: response.id is UUID
      4. Assert: response.allowedDomains contains "partner.com"
    Expected Result: Organization created
    Evidence: Response body

  Scenario: org_admin adds member
    Tool: Bash (curl)
    Steps:
      1. POST /api/organizations/$ORG_ID/members -d '{"email":"new@partner.com","role":"org_editor"}'
         -H "Authorization: Bearer $ORG_ADMIN_TOKEN"
      2. Assert: HTTP 201
      3. GET /api/organizations/$ORG_ID/members
      4. Assert: new member appears in list
    Expected Result: Member invited and visible
    Evidence: Response bodies

  Scenario: non-member cannot view org details
    Tool: Bash (curl)
    Steps:
      1. GET /api/organizations/$OTHER_ORG_ID
         -H "Authorization: Bearer $NON_MEMBER_TOKEN"
      2. Assert: HTTP 404 (not 403, don't leak existence)
    Expected Result: Org details hidden from non-members
    Evidence: Response status
  ```

  **Commit**: YES
  - Message: `feat(api): add organization management API (CRUD, members, domains)`
  - Files: `apps/web/app/api/organizations/**`
  - Pre-commit: `pnpm test apps/web/tests/api/organizations.test.ts`

---

- [ ] 7. Catalog API: Organization-Based Filtering

  **What to do**:
  - `apps/web/app/api/catalog/route.ts` (GET) 수정:
    - 현재 조직 컨텍스트에 따라 아이템 필터링
    - private: org_id가 현재 조직인 것만
    - shared: shared_with_orgs에 현재 조직이 포함된 것
    - public: 모든 공개 아이템
    - super_admin: 모든 아이템 (필터 바이패스 옵션)
  - `apps/web/app/api/catalog/route.ts` (POST) 수정:
    - 아이템 생성 시 현재 조직의 org_id 자동 설정
    - visibility 기본값: private
  - `apps/web/app/api/catalog/[id]/route.ts` 수정:
    - GET/PATCH/DELETE에 조직 기반 접근 제어 적용
    - private 아이템 비멤버 접근 시 404 반환 (존재 노출 금지)
  - `packages/lib/src/catalog.ts` 수정:
    - 카탈로그 조회 함수에 org 필터링 파라미터 추가
  - MCP deploy_skill 수정:
    - 배포 시 현재 조직의 org_id 자동 설정

  **Must NOT do**:
  - 기존 catalog API 시그니처 깨뜨리지 않음
  - org_id 없는 아이템 에러 처리 (마이그레이션 전 null 허용)
  - 검색 결과에서 private 아이템 존재 힌트 노출 금지

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 기존 API 전체를 조직 인식으로 변환하는 넓은 범위 작업
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10)
  - **Blocks**: Tasks 11, 13
  - **Blocked By**: Tasks 2, 4, 5

  **References**:

  **Pattern References**:
  - `apps/web/app/api/catalog/route.ts` - 전체 (수정 대상)
  - `apps/web/app/api/catalog/[id]/route.ts` - 상세 라우트 (수정 대상)
  - `packages/lib/src/catalog.ts` - 카탈로그 데이터 접근 함수들

  **API/Type References**:
  - `packages/lib/src/types.ts` - CatalogItem 타입 (확장 필요)

  **WHY Each Reference Matters**:
  - catalog route.ts: 조직 필터링을 삽입할 정확한 위치
  - catalog.ts: 데이터 접근 레이어에서 WHERE 절 추가 위치

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/api/catalog-org-filter.test.ts`
  - [ ] private 아이템: 소속 조직 멤버만 조회 가능 → PASS
  - [ ] shared 아이템: 지정 조직만 조회 가능 → PASS
  - [ ] public 아이템: 모든 인증 사용자 조회 가능 → PASS
  - [ ] 비멤버의 private 아이템 접근 → 404 (존재 노출 금지) → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: Private items only visible to org members
    Tool: Bash (curl)
    Preconditions: OrgA has private item "secret-skill"
    Steps:
      1. GET /api/catalog?type=skill with OrgA member token + x-current-org-id=OrgA
      2. Assert: "secret-skill" appears in results
      3. GET /api/catalog?type=skill with OrgB member token + x-current-org-id=OrgB
      4. Assert: "secret-skill" NOT in results
    Expected Result: Data isolation verified
    Evidence: Response bodies compared

  Scenario: Private item returns 404 for non-members
    Tool: Bash (curl)
    Steps:
      1. GET /api/catalog/secret-skill-id with OrgB member token
      2. Assert: HTTP 404 (NOT 403)
      3. Assert: response body does not contain item name
    Expected Result: Item existence not leaked
    Evidence: Response status + body

  Scenario: Public items visible to all authenticated users
    Tool: Bash (curl)
    Steps:
      1. Create public item in OrgA
      2. GET /api/catalog with OrgB token
      3. Assert: public item appears in results
    Expected Result: Public items are cross-org visible
    Evidence: Response body
  ```

  **Commit**: YES
  - Message: `feat(api): add organization-based catalog filtering and access control`
  - Files: `apps/web/app/api/catalog/**`, `packages/lib/src/catalog.ts`
  - Pre-commit: `pnpm test apps/web/tests/api/catalog-org-filter.test.ts`

---

- [ ] 8. MCP Server: Organization-Based Access Control

  **What to do**:
  - MCP 서버 핸들러 수정 (`apps/web/app/api/mcp/` 또는 `packages/lib/src/mcp/`):
    - OAuth 토큰에서 사용자 ID → 조직 멤버십 조회
    - search_plugins: 접근 가능한 아이템만 반환 (private=own org, shared=allowed orgs, public=all)
    - get_plugin_content: 접근 권한 체크 후 반환
    - list_plugins: 조직 기반 필터링
    - deploy_skill: 현재 사용자의 조직에 아이템 생성
  - MCP 토큰 컨텍스트에 orgId 추가
  - MCP 감사 로그에 org_id 필드 추가

  **Must NOT do**:
  - MCP 프로토콜 인터페이스 변경 금지
  - 비인증 MCP 요청에 대한 조직 기반 필터 적용 금지 (public만 반환)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: MCP 프로토콜과 조직 컨텍스트의 통합이 복잡
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 9, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 5

  **References**:

  **Pattern References**:
  - `packages/lib/src/mcp/` - MCP 서버 구현 전체
  - `apps/web/app/api/mcp/` - MCP API 라우트
  - `packages/db/src/schema.ts:445-487` - MCP 감사 로그 테이블 (org_id 추가)

  **Test References**:
  - `apps/web/tests/api/` - API 테스트 패턴

  **WHY Each Reference Matters**:
  - MCP 서버: 수정할 정확한 위치와 기존 필터링 로직 파악
  - 감사 로그: org_id를 추가할 위치

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/api/mcp-org-filter.test.ts`
  - [ ] search_plugins: 조직 기반 필터링 테스트 → PASS
  - [ ] deploy_skill: 조직 연결 테스트 → PASS
  - [ ] 비인증 요청: public 아이템만 반환 테스트 → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: MCP search returns org-filtered results
    Tool: Bash (curl JSON-RPC)
    Preconditions: OrgA has private "internal-skill", public "public-skill"
    Steps:
      1. POST /api/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_plugins","arguments":{"query":"skill"}}}'
         -H "Authorization: Bearer $ORG_A_TOKEN"
      2. Assert: results include "internal-skill" and "public-skill"
      3. Same request with $ORG_B_TOKEN
      4. Assert: results include "public-skill" but NOT "internal-skill"
    Expected Result: MCP respects org boundaries
    Evidence: JSON-RPC response bodies

  Scenario: deploy_skill creates item in user's org
    Tool: Bash (curl JSON-RPC)
    Steps:
      1. POST /api/mcp deploy_skill with OrgA token
      2. Assert: created item has org_id = OrgA
      3. Assert: created item has visibility = 'private' (default)
    Expected Result: Deployed skill belongs to deployer's org
    Evidence: Response + database verification
  ```

  **Commit**: YES
  - Message: `feat(mcp): add organization-based access control to MCP server`
  - Files: `packages/lib/src/mcp/**`, `apps/web/app/api/mcp/**`
  - Pre-commit: `pnpm test apps/web/tests/api/mcp-org-filter.test.ts`

---

- [ ] 9. Fork API: Cross-Organization Item Copying

  **What to do**:
  - `apps/web/app/api/catalog/[id]/fork/route.ts` 생성:
    - POST: 아이템을 현재 조직에 복사
    - 복사되는 필드: name, type, description, content, files, tags, difficulty 등 콘텐츠 필드
    - 자동 설정: new id, org_id=current org, visibility=private, forked_from=original id
    - 원본의 fork_count 증가
    - public/shared 아이템만 fork 가능 (private 금지)
  - Fork 이력 조회:
    - 원본에서 fork된 아이템 목록 조회
    - fork된 아이템에서 원본 정보 조회

  **Must NOT do**:
  - fork 동기화 (자동 업데이트 반영) 구현 금지
  - fork의 fork 체인 추적 금지 (1단계 참조만)
  - private 아이템 fork 허용 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API 엔드포인트 추가와 데이터 복사 로직
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8, 10)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 2, 5

  **References**:

  **Pattern References**:
  - `apps/web/app/api/catalog/route.ts` (POST) - 아이템 생성 패턴 → fork도 유사
  - `apps/web/app/api/catalog/[id]/route.ts` - 아이템 상세 조회 패턴

  **WHY Each Reference Matters**:
  - catalog POST: 아이템 생성 시 필드 복사 로직 참고

  **Acceptance Criteria**:

  TDD:
  - [ ] 테스트 파일: `apps/web/tests/api/fork.test.ts`
  - [ ] public 아이템 fork → 새 아이템 생성, forked_from 설정 → PASS
  - [ ] private 아이템 fork 시도 → 403 거부 → PASS
  - [ ] fork 후 원본 fork_count 증가 → PASS
  - [ ] fork된 아이템은 독립적 (원본 수정 시 영향 없음) → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: Fork creates independent copy
    Tool: Bash (curl)
    Steps:
      1. POST /api/catalog/public-item-id/fork -H "Authorization: Bearer $ORG_B_TOKEN"
      2. Assert: HTTP 201
      3. Assert: response.id != "public-item-id"
      4. Assert: response.forkedFrom == "public-item-id"
      5. Assert: response.orgId == OrgB id
      6. GET /api/catalog/public-item-id → Assert: forkCount >= 1
    Expected Result: Fork creates new item with reference
    Evidence: Response bodies

  Scenario: Cannot fork private item
    Tool: Bash (curl)
    Steps:
      1. POST /api/catalog/private-item-id/fork -H "Authorization: Bearer $OTHER_ORG_TOKEN"
      2. Assert: HTTP 404 (not 403, don't leak existence)
    Expected Result: Private items cannot be forked by outsiders
    Evidence: Response status
  ```

  **Commit**: YES
  - Message: `feat(api): add fork endpoint for cross-org item copying`
  - Files: `apps/web/app/api/catalog/[id]/fork/route.ts`
  - Pre-commit: `pnpm test apps/web/tests/api/fork.test.ts`

---

- [ ] 10. Organization Management UI

  **What to do**:
  - `apps/web/app/admin/organizations/page.tsx`: 조직 목록 페이지
    - super_admin: 모든 조직 목록 + 생성 버튼
    - org_admin: 자신의 조직만 표시
  - `apps/web/app/admin/organizations/[orgId]/page.tsx`: 조직 상세 설정
    - 이름/설명 수정
    - 멤버 목록 + 역할 변경 + 초대
    - 허용 도메인 관리
    - 셀프서비스 신청 승인/거부 (super_admin)
  - `apps/web/app/admin/organizations/new/page.tsx`: 조직 생성 폼
  - 기존 admin 대시보드 네비게이션에 "Organizations" 메뉴 추가

  **Must NOT do**:
  - 조직 삭제 UI 구현 금지 (비활성화만)
  - 조직 브랜딩/테마 설정 UI 금지
  - 다른 조직 멤버 정보 노출 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 관리 UI 페이지들의 디자인과 구현
  - **Skills**: [`frontend-ui-ux`, `git-master`]
    - `frontend-ui-ux`: 관리자 UI/UX 패턴
    - `git-master`: 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8, 9)
  - **Blocks**: Task 13
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `apps/web/app/admin/` - 기존 관리자 페이지 구조
  - `apps/web/components/` - 기존 UI 컴포넌트들

  **WHY Each Reference Matters**:
  - admin 페이지: 기존 레이아웃, 네비게이션, 스타일링 패턴

  **Acceptance Criteria**:

  TDD:
  - [ ] 컴포넌트 렌더 테스트 → PASS
  - [ ] `pnpm lint` → PASS
  - [ ] `pnpm build` → PASS

  Agent-Executed QA Scenarios:

  ```
  Scenario: super_admin can view all organizations
    Tool: Playwright
    Preconditions: Dev server running, super_admin logged in
    Steps:
      1. Navigate to: http://localhost:3000/admin/organizations
      2. Wait for: table or list of organizations (timeout: 5s)
      3. Assert: page contains "Organizations" heading
      4. Assert: multiple orgs visible in list
      5. Screenshot: .sisyphus/evidence/task-10-org-list.png
    Expected Result: Organization list page renders
    Evidence: .sisyphus/evidence/task-10-org-list.png

  Scenario: org_admin can manage members
    Tool: Playwright
    Preconditions: org_admin logged in, viewing their org
    Steps:
      1. Navigate to: http://localhost:3000/admin/organizations/{orgId}
      2. Assert: "Members" section visible
      3. Click: invite button
      4. Fill: email field with "newuser@domain.com"
      5. Select: role "org_editor"
      6. Click: submit
      7. Assert: success message visible
      8. Screenshot: .sisyphus/evidence/task-10-member-invite.png
    Expected Result: Member invitation flow works
    Evidence: .sisyphus/evidence/task-10-member-invite.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add organization management admin pages`
  - Files: `apps/web/app/admin/organizations/**`, `apps/web/components/**`
  - Pre-commit: `pnpm lint && pnpm build`

---

- [ ] 11. Organization Switcher UI

  **What to do**:
  - `apps/web/components/OrgSwitcher.tsx` 컴포넌트 생성:
    - 현재 조직 표시 + 드롭다운으로 조직 전환
    - 소속 조직 목록 표시
    - 전환 시 쿠키 업데이트 + 페이지 새로고침 (또는 클라이언트 상태 업데이트)
  - 글로벌 헤더/네비게이션에 OrgSwitcher 통합
  - 조직 전환 시 모든 데이터 컨텍스트 갱신

  **Must NOT do**:
  - 조직 전환 시 다른 조직의 세션 데이터 유지 금지
  - 인라인 조직 생성 UI 추가 금지 (관리자 페이지에서만)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 컴포넌트 디자인과 인터랙션
  - **Skills**: [`frontend-ui-ux`, `git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `apps/web/components/` - 기존 컴포넌트 패턴 (Tailwind CSS, React 19)
  - `apps/web/lib/hooks/useOrgContext.ts` - Task 5에서 생성한 org context hook

  **WHY Each Reference Matters**:
  - 컴포넌트: 기존 스타일링, 레이아웃 패턴 따르기
  - useOrgContext: 조직 전환 로직의 데이터 소스

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Org switcher shows all user's orgs
    Tool: Playwright
    Preconditions: User belongs to OrgA and OrgB, logged in
    Steps:
      1. Navigate to: http://localhost:3000
      2. Find: org switcher component in header
      3. Click: org switcher dropdown
      4. Assert: "OrgA" and "OrgB" visible in list
      5. Assert: current org is highlighted
      6. Screenshot: .sisyphus/evidence/task-11-org-switcher-open.png
    Expected Result: Org list displays correctly
    Evidence: .sisyphus/evidence/task-11-org-switcher-open.png

  Scenario: Switching org reloads with new context
    Tool: Playwright
    Preconditions: Viewing OrgA catalog
    Steps:
      1. Click org switcher → select OrgB
      2. Wait for: page reload or state update (timeout: 5s)
      3. Assert: org switcher shows "OrgB" as current
      4. Assert: catalog shows OrgB items
      5. Screenshot: .sisyphus/evidence/task-11-org-switched.png
    Expected Result: Org context fully switches
    Evidence: .sisyphus/evidence/task-11-org-switched.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add organization switcher component`
  - Files: `apps/web/components/OrgSwitcher.tsx`, header component
  - Pre-commit: `pnpm lint && pnpm build`

---

- [ ] 12. Data Migration: Existing Data → GPTers Organization

  **What to do**:
  - 마이그레이션 스크립트 생성: `packages/db/src/migrations/add-org-support.ts`
    1. GPTers 조직 생성 (id, name="GPTers", slug="gpters", allowed_domains=["gpters.org"])
    2. 기존 모든 사용자를 GPTers 조직에 멤버십 생성 (기존 role 매핑: admin→org_admin, editor→org_editor, viewer→org_viewer)
    3. 기존 admin 사용자를 super_admin으로 승격 (users.role 업데이트)
    4. 기존 모든 catalog_items에 org_id=GPTers org id 설정
    5. 기존 모든 catalog_items에 visibility='private' 설정
    6. org_id를 NOT NULL 제약 추가 (nullable → NOT NULL)
  - 롤백 스크립트: `packages/db/src/migrations/rollback-org-support.ts`
    - 위 변경사항을 모두 되돌리는 스크립트
  - Drizzle 마이그레이션 생성: `pnpm db:generate`

  **Must NOT do**:
  - 기존 세션 무효화 (유지보수 창에서 수행하므로 세션은 이미 끊김)
  - 기존 teamTag 데이터 변경 금지
  - 마이그레이션 중 API 접근 허용 금지 (유지보수 모드)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 데이터 무결성이 중요한 마이그레이션 작업
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `packages/db/src/schema.ts` - 전체 스키마 (마이그레이션 대상)
  - `apps/web/app/api/admin/seed/route.ts` - 기존 시드 스크립트 패턴

  **WHY Each Reference Matters**:
  - schema.ts: 마이그레이션할 테이블 구조와 필드
  - seed route: 데이터 삽입 패턴 (Drizzle ORM 사용법)

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Migration creates GPTers org with all users
    Tool: Bash (SQL)
    Steps:
      1. Run migration script
      2. Query: SELECT * FROM organizations WHERE slug = 'gpters'
      3. Assert: exactly 1 row
      4. Query: SELECT COUNT(*) FROM org_memberships WHERE org_id = (gpters org id)
      5. Assert: count equals total users count
    Expected Result: All users migrated to GPTers org
    Evidence: Query outputs

  Scenario: All items assigned to GPTers org as private
    Tool: Bash (SQL)
    Steps:
      1. Query: SELECT COUNT(*) FROM catalog_items WHERE org_id IS NULL
      2. Assert: 0
      3. Query: SELECT COUNT(*) FROM catalog_items WHERE visibility != 'private' AND org_id = (gpters org id)
      4. Assert: 0
    Expected Result: All items are GPTers-private
    Evidence: Query outputs

  Scenario: Migration is idempotent
    Tool: Bash
    Steps:
      1. Run migration script
      2. Run migration script again
      3. Assert: no errors, no duplicate data
    Expected Result: Safe to re-run
    Evidence: Script output

  Scenario: Rollback restores original state
    Tool: Bash
    Steps:
      1. Run rollback script
      2. Query: SELECT COUNT(*) FROM organizations
      3. Assert: 0 (or original count)
      4. Query: SELECT COUNT(*) FROM catalog_items WHERE org_id IS NOT NULL
      5. Assert: 0
    Expected Result: Clean rollback
    Evidence: Query outputs
  ```

  **Commit**: YES
  - Message: `feat(db): add organization migration and rollback scripts`
  - Files: `packages/db/src/migrations/add-org-support.ts`, `packages/db/src/migrations/rollback-org-support.ts`
  - Pre-commit: Script dry-run

---

- [ ] 13. E2E Integration Tests

  **What to do**:
  - Playwright E2E 테스트 작성: `apps/web/tests/e2e/org-access-control.spec.ts`
  - 전체 시나리오 테스트:
    1. 외부 조직 사용자 로그인 → 자기 조직 아이템만 보임
    2. public 아이템은 모든 조직에서 검색 가능
    3. 조직 전환 → 데이터 컨텍스트 변경 확인
    4. Fork → 자기 조직에 복사 확인
    5. 조직 관리 → 멤버 추가/역할 변경
    6. super_admin → 모든 조직 접근 가능
  - `pnpm test` 전체 통과 확인
  - `pnpm lint` 통과 확인
  - `pnpm build` 성공 확인

  **Must NOT do**:
  - 수동 검증 단계 포함 금지
  - 실제 Google OAuth 사용 금지 (테스트용 mock/bypass 사용)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 전체 시스템 통합 테스트는 깊은 이해 필요
  - **Skills**: [`playwright`, `git-master`]
    - `playwright`: E2E 테스트 작성 전문
    - `git-master`: 최종 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (sequential, after all others)
  - **Blocks**: None (final)
  - **Blocked By**: Tasks 7, 8, 9, 10, 11, 12

  **References**:

  **Pattern References**:
  - `apps/web/tests/e2e/` - 기존 E2E 테스트 구조
  - `apps/web/playwright.config.ts` - Playwright 설정

  **Test References**:
  - 기존 E2E 테스트 파일들 → 패턴, 헬퍼, 셋업 방식

  **WHY Each Reference Matters**:
  - E2E 테스트 디렉토리: 기존 테스트 구조와 헬퍼 함수 활용

  **Acceptance Criteria**:

  Agent-Executed QA Scenarios:

  ```
  Scenario: Full org isolation E2E flow
    Tool: Playwright
    Steps:
      1. Login as OrgA user
      2. Navigate to catalog
      3. Assert: only OrgA items visible
      4. Navigate to OrgB's private item URL directly
      5. Assert: 404 page shown
      6. Search for "public" items
      7. Assert: public items from other orgs visible
      8. Screenshot: .sisyphus/evidence/task-13-org-isolation.png
    Expected Result: Complete org data isolation verified
    Evidence: .sisyphus/evidence/task-13-org-isolation.png

  Scenario: Fork flow E2E
    Tool: Playwright
    Steps:
      1. Login as OrgB user
      2. Navigate to public item from OrgA
      3. Click fork button
      4. Assert: redirected to new item in OrgB
      5. Assert: "Forked from" badge visible
      6. Switch to OrgB catalog
      7. Assert: forked item appears in list
      8. Screenshot: .sisyphus/evidence/task-13-fork-flow.png
    Expected Result: Fork creates independent copy
    Evidence: .sisyphus/evidence/task-13-fork-flow.png

  Scenario: All tests pass, build succeeds
    Tool: Bash
    Steps:
      1. Run: pnpm lint
      2. Assert: exit code 0
      3. Run: pnpm test
      4. Assert: exit code 0, all tests pass
      5. Run: pnpm build
      6. Assert: exit code 0
    Expected Result: Full CI/CD pipeline green
    Evidence: Command outputs
  ```

  **Commit**: YES
  - Message: `test(e2e): add organization access control integration tests`
  - Files: `apps/web/tests/e2e/org-access-control.spec.ts`
  - Pre-commit: `pnpm lint && pnpm test && pnpm build`

---

## Commit Strategy

| After Task | Message | Key Files | Verification |
|------------|---------|-----------|--------------|
| 1 | `feat(db): add organizations, memberships, and invitations tables` | packages/db/src/schema.ts | pnpm test |
| 2 | `feat(db): add org_id, visibility, fork fields to catalog_items` | packages/db/src/schema.ts | pnpm test |
| 3 | `feat(auth): implement domain-based organization resolution` | apps/web/lib/core/auth-config.ts | pnpm test |
| 4 | `feat(rbac): add super_admin role and org-scoped permission system` | packages/lib/src/security/rbac.ts | pnpm test |
| 5 | `feat(middleware): add organization context validation` | apps/web/middleware.ts | pnpm test |
| 6 | `feat(api): add organization management API` | apps/web/app/api/organizations/** | pnpm test |
| 7 | `feat(api): add organization-based catalog filtering` | apps/web/app/api/catalog/** | pnpm test |
| 8 | `feat(mcp): add organization-based MCP access control` | packages/lib/src/mcp/** | pnpm test |
| 9 | `feat(api): add fork endpoint for cross-org item copying` | apps/web/app/api/catalog/[id]/fork/** | pnpm test |
| 10 | `feat(ui): add organization management admin pages` | apps/web/app/admin/organizations/** | pnpm lint && pnpm build |
| 11 | `feat(ui): add organization switcher component` | apps/web/components/OrgSwitcher.tsx | pnpm lint && pnpm build |
| 12 | `feat(db): add organization migration and rollback scripts` | packages/db/src/migrations/** | script dry-run |
| 13 | `test(e2e): add organization access control integration tests` | apps/web/tests/e2e/** | pnpm test:all |

---

## Success Criteria

### Verification Commands
```bash
# All unit + API tests pass
pnpm test                    # Expected: all pass, 0 failures

# All E2E tests pass
pnpm test:e2e                # Expected: all pass

# Linting passes
pnpm lint                    # Expected: 0 errors

# Build succeeds
pnpm build                   # Expected: exit 0, no TypeScript errors

# Schema push succeeds
pnpm db:push                 # Expected: exit 0

# Migration runs cleanly
pnpm db:migrate-data         # Expected: all items have org_id, visibility
```

### Final Checklist
- [ ] All "Must Have" present (organizations, roles, visibility, fork, MCP, migration)
- [ ] All "Must NOT Have" absent (no billing, no SSO, no org hierarchy, no fork sync)
- [ ] All tests pass (unit, API, E2E)
- [ ] Data isolation verified (private items not leaking cross-org)
- [ ] MCP respects org boundaries
- [ ] Existing @gpters.org data preserved as private
- [ ] Migration rollback tested
- [ ] TSDoc documentation on all new files
