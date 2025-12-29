# /update-dev-docs

현재 진행 중인 작업의 Dev Docs를 최신 상태로 업데이트합니다.

## Usage

```
/update-dev-docs [feature-name]
```

## Instructions

다음 작업을 수행해주세요:

### 1. Feature Name 확인
- `$ARGUMENTS`가 비어있으면 `dev/active/` 디렉토리에서 현재 작업 확인
- 여러 개면 사용자에게 선택 요청

### 2. 현재 Dev Docs 읽기
```
dev/active/[feature]-plan.md
dev/active/[feature]-context.md
dev/active/[feature]-tasks.md
```

### 3. 업데이트 수행

**tasks.md 업데이트:**
- 이번 세션에서 완료한 작업 체크 표시
- 진행 중인 작업 상태 업데이트
- Progress Overview 갱신
- "마지막 업데이트" 시간을 현재 시간으로
- Session Notes에 세션 요약 추가:
  ```markdown
  ### [오늘 날짜] - Session End
  **Completed:**
  - [완료한 작업들]

  **Next Session:**
  - [다음에 할 작업]

  **Blockers:**
  - [있으면 기록]
  ```

**context.md 업데이트:**
- 새로 수정/생성된 파일이 있으면 Key Files에 추가
- 새로운 결정사항이 있으면 Decisions Made에 추가
- "마지막 업데이트" 시간 갱신
- Session Log에 세션 요약 추가

**plan.md 업데이트 (필요시):**
- Phase 진행 상황 반영
- 해결된 Open Questions 체크
- 새로운 리스크 발견 시 추가

### 4. 결과 요약

```
✅ Dev Docs 업데이트 완료

📊 이번 세션 요약:
- 완료: [완료한 작업 수]개 작업
- 진행중: [현재 작업]
- 다음: [다음 작업]

📁 업데이트된 파일:
- dev/active/[feature]-tasks.md
- dev/active/[feature]-context.md

💡 다음 세션 시작 시:
"dev/active/[feature]-*.md 읽고 이어서 작업해줘"
```

## Example

```
User: /update-dev-docs user-auth

Claude: (dev docs 파일들을 읽고 분석)

✅ Dev Docs 업데이트 완료

📊 이번 세션 요약:
- 완료: 3개 작업 (로그인 API, 세션 관리, 미들웨어)
- 진행중: 프론트엔드 로그인 폼
- 다음: 로그아웃 기능

📁 업데이트된 파일:
- dev/active/user-auth-tasks.md
- dev/active/user-auth-context.md

💡 다음 세션 시작 시:
"dev/active/user-auth-*.md 읽고 이어서 작업해줘"
```

## Tips

- 세션이 길어지기 전에 주기적으로 실행
- 중요한 결정을 내렸을 때 바로 실행
- Context가 부족해지기 전에 미리 실행
