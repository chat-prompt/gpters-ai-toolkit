---
name: analyze-mcp-usage
description: "MCP 플러그인 사용 행태 분석 리포트를 생성합니다 (mcp_audit_logs·skill_events 기반, 검색·조회·전환율·스킵·적용률)."
---

# MCP 사용 행태 분석

`mcp_audit_logs`, `skill_events` 데이터를 기반으로 MCP 플러그인 사용 행태 분석 리포트를 생성합니다.

## 실행 방법

아래 명령어를 Bash로 실행하고, 출력 결과를 사용자에게 그대로 전달하세요.

```bash
node .claude/skills/analyze-mcp-usage/analyze-mcp-usage.mjs
```

### 옵션

- `--days=N` — 분석 기간을 최근 N일로 지정 (기본: 30일)

```bash
# 최근 7일만 분석
node .claude/skills/analyze-mcp-usage/analyze-mcp-usage.mjs --days=7
```

## 분석 항목

| 섹션 | 내용 |
|------|------|
| 1. 전체 요약 | 총 로그, 사용자 수, 검색/조회/배포, 전환율 |
| 2. 클라이언트별 비교 | 클라이언트별 요청/검색/조회/전환율 |
| 3. 인기 검색어 | 클라이언트별 TOP 15 |
| 4. 검색 품질 분석 | 미전환 검색, 세션별 검색→조회 흐름, 검색 스킵 사유(`report_search_skip`), 스킬 적용 여부(`report_skill_outcome`) |
| 5. 인기 스킬 | 클라이언트별 TOP 10 조회 스킬 |
| 6. 시간대별 사용량 | KST 기준 클라이언트별 분포 |
| 7. 일별 추이 | 최근 14일 클라이언트별 |
| 8. 세션 분석 | 세션 단위 사용 패턴 |
| 9. 커뮤니티 & 관리 활동 | 개선 제안(`suggestions`), 스킬 버전 이력(`item_versions`), 9-4 검색 무결과율 |
| 10. 스킬별 전환율 | `skill_events` 기반 search→load→apply 퍼널, 저조한 스킬 식별 |
| 11. 목표 달성 현황 | 오류율·전환율·적용률·스킵률 목표 대비 |
| 12. Go/No-go Dashboard | 6개 기준 판정 |

## 에러 처리

스크립트 실행 실패 시 에러 메시지만 사용자에게 전달하세요.
주요 원인: `DATABASE_URL` 미설정, DB 연결 실패, 테이블 미존재.
