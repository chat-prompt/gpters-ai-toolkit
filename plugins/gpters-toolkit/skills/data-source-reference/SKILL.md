---
name: data-source-reference
description: GPTers 플랫폼의 데이터 소스 레퍼런스를 조회합니다. Portal DB(PostgreSQL)와 Airtable 테이블 구조, 필드 정보, 동기화 방향, ID 매핑 관계를 확인할 때 사용하세요. 데이터베이스 스키마, 테이블 관계, Sync 테이블, Hightouch 동기화에 대한 질문에 활용됩니다.
allowed-tools: Read
---

# GPTers 데이터 소스 레퍼런스

GPTers 플랫폼의 데이터 구조와 동기화 정책을 빠르게 참조할 수 있는 스킬입니다.

## 사용 시점

다음과 같은 질문이나 작업 시 이 스킬을 사용하세요:

- "User 테이블 구조가 어떻게 되어 있어?"
- "결제 데이터는 어디서 관리해?"
- "Airtable과 Portal DB 동기화는 어떻게 되지?"
- "기수관리 테이블 필드 정보 알려줘"
- "멤버(Sync) 테이블의 Field ID가 뭐야?"

## 핵심 원칙

### Source of Truth

```
Portal DB (PostgreSQL) = 결제/주문/회원의 절대적 Source of Truth
Airtable 기수관리 테이블 = 스터디 운영 설정의 Source of Truth
```

### 동기화 방향

| 방향 | 방법 | 대상 |
|------|------|------|
| Portal -> Airtable | Hightouch (배치) | 멤버, 결제, 상품, 쿠폰, 게시글, 홀딩 Sync 테이블 |
| Portal -> Airtable | 실시간 API | 결제 완료, 회원 가입/수정 시 |
| Airtable -> Portal | N8N | 환급 처리, 기수 정보 |
| Bettermode -> Portal | Webhook | 회원 인증, 게시글 생성 |

## 빠른 참조

### 주요 Airtable Base ID

| 베이스 | ID |
|--------|-----|
| 리부트 AI 스터디 | `appq8xK4PLp7D7aCg` |
| Bootcamp Portal (레거시) | `appT9VhNkPL4G5Rph` |

### 주요 Sync 테이블 ID

| 테이블 | ID |
|--------|-----|
| 멤버(Sync) | `tblAV1fM6DdHEMfWR` |
| 결제(Sync) | `tblQNIOB0C8CXvgis` |
| 상품(Sync) | `tblc5C4VBnyygEUfR` |
| 기수관리 | `tblJ2uV2TyAtRV06Q` |
| 게시글(Sync) | `tbl0MRlu5YU6ALd5L` |

## 상세 레퍼런스

전체 테이블 구조, 필드 상세, ID 매핑 관계는 [reference.md](reference.md)를 참조하세요.

## 개발 시 주의사항

1. **결제/환불 수정**: Portal DB 우선 -> Webhook으로 Airtable 자동 반영
2. **Airtable Rate Limit**: 5 req/sec, 배치 처리 + 지수 백오프 권장
3. **소프트 삭제**: Order, Payment, CommunityPost는 `deletedAt` 필드 사용
4. **외부 ID**: `airtableId`, `bettermodeUserId` 등 unique 제약 확인 필수
