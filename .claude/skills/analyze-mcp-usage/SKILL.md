# MCP 사용 행태 분석

`mcp_audit_logs` 데이터를 기반으로 MCP 플러그인 사용 행태 분석 리포트를 생성합니다.

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
| 전체 요약 | 총 로그, 사용자 수, 검색/조회/배포, 전환율 |
| 클라이언트별 비교 | Claude Code vs OpenCode — 요청/검색/조회/전환율 |
| 인기 검색어 | 클라이언트별 TOP 15 |
| 검색 스킵 분석 | report_search_skip 사유 분포, 스킵된 쿼리 TOP 15 |
| 스킬 적용률 분석 | report_skill_outcome 적용/미적용 비율, 스킬별 목록, 미적용 사유 |
| 인기 스킬 | 클라이언트별 TOP 10 조회 스킬 |
| 시간대별 사용량 | KST 기준 클라이언트별 분포 |
| 일별 추이 | 최근 14일 클라이언트별 |

## 에러 처리

스크립트 실행 실패 시 에러 메시지만 사용자에게 전달하세요.
주요 원인: `DATABASE_URL` 미설정, DB 연결 실패, 테이블 미존재.
