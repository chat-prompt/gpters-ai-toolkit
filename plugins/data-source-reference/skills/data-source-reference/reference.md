# 데이터 소스 레퍼런스

> 마지막 업데이트: 2025-12-24
> 작성자: Claude Code
> 대상: 바이브코딩 개발자

## 목차

1. [개요](#1-개요)
2. [Portal DB (PostgreSQL) - Source of Truth](#2-portal-db-postgresql---source-of-truth)
   - [2.5 Portal DB 테이블별 필드 상세](#25-portal-db-테이블별-필드-상세)
3. [Airtable 베이스 구조](#3-airtable-베이스-구조)
4. [데이터 동기화 방향](#4-데이터-동기화-방향)
5. [주요 ID 매핑 관계](#5-주요-id-매핑-관계)
6. [개발 시 주의사항](#6-개발-시-주의사항)
7. [Airtable 테이블별 필드 상세](#7-airtable-테이블별-필드-상세)

---

## 1. 개요

GPTers 플랫폼은 **Portal DB (PostgreSQL)**를 Source of Truth로 사용하며, 운영팀이 사용하는 **Airtable**과 양방향 동기화됩니다.

### 데이터 흐름 원칙

```
┌─────────────────────────────────────────────────────────────┐
│                    Source of Truth                           │
│                   Portal DB (Neon PostgreSQL)                │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │  Airtable   │    │ Bettermode  │    │   Portone   │
   │  (운영 DB)  │    │ (커뮤니티)  │    │   (결제)    │
   └─────────────┘    └─────────────┘    └─────────────┘
```

### 핵심 규칙

1. **결제/주문 데이터**: Portal DB가 절대적 Source of Truth
2. **회원 정보**: Portal DB → Airtable 단방향 동기화 (Hightouch)
3. **스터디 운영 데이터**: Airtable → Portal DB (기수관리 등 일부 테이블)
4. **커뮤니티 콘텐츠**: Bettermode → Portal DB → Airtable

---

## 2. Portal DB (PostgreSQL) - Source of Truth

### 2.1 핵심 도메인 모델

| 도메인 | 주요 테이블 | 설명 |
|--------|-------------|------|
| **사용자** | `User` | 회원 정보, OAuth 연동 (Kakao, Naver) |
| **결제** | `Order`, `OrderItem`, `Payment` | 주문/결제 정보 (소프트 삭제 적용) |
| **수강** | `UserEnrollment`, `EnrollmentHold` | 수강 상태, 홀딩 정보 |
| **상품** | `CourseProduct`, `ProductCoupon`, `Coupon` | 상품/쿠폰 정보 |
| **커뮤니티** | `CommunityPost`, `CommunityComment`, `CommunitySpace` | 게시글/댓글/공간 |
| **스터디** | `Study`, `StudyUser`, `Cohort` | 스터디 정보 |
| **스터디 캘린더** | `StudyCalendar` | 스터디별 캘린더(.ics) 정보 |
| **환불** | `Refund` | 환불 요청 정보 |
| **쿠폰 사용** | `UserCoupon`, `UserCouponUse` | 사용자 쿠폰 발급/사용 이력 |
| **사용자 동의** | `UserAgreement` | 마케팅/뉴스레터 동의 |
| **초대 그룹** | `InviteGroup`, `InviteGroupCoupon`, `InviteGroupCouponInfo` | 무료초대 쿠폰 그룹 |
| **설정/로그** | `Setting`, `Log`, `EmailLog` | 포탈 설정, 이벤트/이메일 로그 |

### 2.2 외부 ID 필드 (Airtable/Bettermode 연동용)

| 모델 | 필드명 | 외부 시스템 | 용도 |
|------|--------|-------------|------|
| `User` | `airtableId` | Airtable | 멤버(Sync) 테이블 레코드 ID |
| `User` | `bettermodeUserId` | Bettermode | Bettermode 사용자 ID |
| `User` | `bettermodeExternalId` | Bettermode | Bettermode 외부 ID |
| `CommunityPost` | `bettermodeId` | Bettermode | Bettermode 게시글 ID |
| `CommunitySpace` | `bettermodeId` | Bettermode | Bettermode 공간 ID |
| `Cohort` | `airtableId` | Airtable | 기수관리 테이블 레코드 ID |

### 2.3 Prisma 스키마 위치

```
packages/db/prisma/schema/
├── user.prisma          # 사용자, 동의, 초대그룹 모델
├── order.prisma         # 주문/결제/환불/쿠폰 모델
├── course.prisma        # 상품 모델 (CourseProduct)
├── community.prisma     # 커뮤니티 모델
├── study.prisma         # 스터디/기수 모델
├── study-calendar.prisma # 스터디 캘린더 모델
├── userEnrollment.prisma # 수강/홀딩 모델
├── coaching.prisma      # 코칭 모델 (@deprecated)
└── schema.prisma        # 설정/로그 모델
```

### 2.4 Hightouch 동기화 View

Portal DB → Airtable 동기화를 위한 SQL View들:

| View 이름 | Airtable 대상 테이블 | 동기화 필드 |
|-----------|---------------------|-------------|
| `UserForSync` | 멤버(Sync) | id, email, name, phone, bettermodeUserId |
| `ProductForSync` | 상품(Sync) | id, name, price, status |
| `OrdersForSync` | 결제(Sync) | paymentId, productId, price, method |
| `CouponForSync` | 쿠폰(Sync) | id, name, code, discountPrice |
| `CommunityPostForSync` | 게시글(Sync) | bettermodeId, authorId, url, tags |
| `EnrollmentHoldForSync` | 홀딩(Sync) | cohort, status, holdDates |

**위치**: `packages/db/prisma/views/`

### 2.5 Portal DB 테이블별 필드 상세

> 주요 모델의 핵심 필드 정보입니다. 전체 스키마는 `packages/db/prisma/schema/` 참조.

#### 2.5.1 User (사용자)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 사용자 고유 ID |
| `email` | String? | 이메일 (unique) |
| `name` | String | 이름 |
| `nickname` | String | 닉네임 |
| `phone` | String? | 전화번호 |
| `phoneCountryCode` | String? | 전화번호 국가코드 |
| `profileImage` | String? | 프로필 이미지 URL |
| `airtableId` | String? | Airtable 멤버(Sync) 레코드 ID (unique) |
| `bettermodeUserId` | String? | Bettermode 사용자 ID (unique) |
| `bettermodeExternalId` | String? | Bettermode 외부 ID (unique) |
| `kakaoId` | String? | 카카오 연동 ID (unique) |
| `naverId` | String? | 네이버 연동 ID (unique) |
| `signupStatus` | Enum | NonMember, Signup, Completed |
| `mergeStatus` | Enum | PortalUser, CommunityUser, UserManualMerged, UserAutoMerged |
| `badges` | Int[] | 보유 뱃지 ID 목록 |
| `referrerCode` | String? | 추천인 코드 (unique) |
| `createdAt` | DateTime | 생성일 |

#### 2.5.2 Order (주문)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 주문 고유 ID |
| `status` | Enum | Pending, Completed, Cancelled, PartialCancelled |
| `userId` | Int? (FK) | 구매자 User.id |
| `paymentId` | Int? (FK) | 결제 정보 Payment.id (unique) |
| `courseEnrollId` | Int? (FK) | 캠프 신청 정보 |
| `deletedAt` | DateTime? | 소프트 삭제 시각 |
| `createdAt` | DateTime | 생성일 |

#### 2.5.3 Payment (결제)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 결제 고유 ID |
| `name` | String | 결제한 상품 이름 |
| `merchantUid` | String | 포트원 merchant_uid (unique) |
| `impUid` | String | 포트원 imp_uid (unique) |
| `actualPrice` | Decimal | 실제 결제 금액 |
| `refundedPrice` | Int? | 환불 금액 |
| `currency` | Enum | KRW, USD |
| `method` | Enum | None, TossCard, Kakao, TossVBank, Paypal |
| `status` | Enum | Success, VBankIssued, VBankExpired, Invalid, Error, PartialCancel, Cancel |
| `receiptUrl` | String? | PG사 영수증 URL |
| `cardName` | String? | 카드사명 |
| `cardNumber` | String? | 카드번호 (마스킹) |
| `vBankName` | String? | 가상계좌 은행명 |
| `vBankNum` | String? | 가상계좌 번호 |
| `vBankDate` | DateTime? | 가상계좌 입금기한 |
| `paidAt` | DateTime? | 결제 완료 시각 |
| `deletedAt` | DateTime? | 소프트 삭제 시각 |

#### 2.5.4 CourseProduct (상품)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 상품 고유 ID |
| `name` | String | 상품명 (예: 19기 실전캠프) |
| `description` | String? | 상품 설명 |
| `price` | Decimal | 상품 가격 |
| `currency` | Enum | KRW, USD |
| `status` | Enum | Upcoming, SoldOut, Selling, Stop |
| `cohort` | Int | 기수 번호 |
| `kind` | Enum | Product, Option |
| `startsAt` | DateTime? | 상품 시작일 |
| `expiredAt` | DateTime? | 상품 만료일 |
| `stopSellingAt` | DateTime? | 판매 중지일 |
| `refund` | Enum | AutoRefund, ManualRefund |
| `refundRate` | Int? | 환불 비율 (기본 100%) |
| `bettermodePostId` | String? | Bettermode 게시글 ID |

#### 2.5.5 UserEnrollment (수강)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 수강 고유 ID |
| `userId` | Int (FK) | 수강자 User.id |
| `courseProductId` | Int (FK) | 상품 CourseProduct.id |
| `cohort` | Int | 기수 번호 |
| `orderId` | Int? (FK) | 주문 Order.id |
| `paymentId` | Int? (FK) | 결제 Payment.id |
| `startsAt` | DateTime? | 수강 시작일 |
| `expiredAt` | DateTime? | 수강 만료일 |
| `cancelledAt` | DateTime? | 취소일 |
| `parentId` | Int? (FK) | 루트 enrollment ID (연장/갱신 추적) |

#### 2.5.6 Cohort (기수)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 기수 고유 ID |
| `cohort` | Int | 기수 번호 |
| `name` | String | 기수명 (예: "19기") |
| `preSaleStartDate` | DateTime? | 사전판매 시작일 |
| `preSaleEndDate` | DateTime? | 사전판매 종료일 |
| `saleStartDate` | DateTime? | 판매 시작일 |
| `saleEndDate` | DateTime? | 판매 종료일 |
| `startDate` | DateTime? | 스터디 시작일 |
| `endDate` | DateTime? | 스터디 종료일 |
| `leaderRecruitEndDate` | DateTime? | 스터디장 신청 마감일 |
| `kakaoOpenChatUrl` | String? | 카카오 오픈채팅 URL |
| `networkingKakaoChatUrl` | String? | 네트워킹 카톡방 URL |
| `airtableId` | String? | Airtable 기수관리 레코드 ID |

#### 2.5.7 CommunityPost (게시글)

| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 게시글 고유 ID |
| `name` | String | 게시글 제목 |
| `content` | String | 게시글 본문 (HTML) |
| `slug` | String | URL 슬러그 |
| `url` | String? | 게시글 URL |
| `bettermodeId` | String? | Bettermode 게시글 ID (unique) |
| `bettermodeAuthorId` | String? | Bettermode 작성자 ID |
| `bettermodeSpaceId` | String? | Bettermode 공간 ID |
| `bettermodePostTypeId` | String? | Bettermode 게시글 타입 ID |
| `isHide` | Boolean | 숨김 여부 |
| `tagNames` | String[] | 태그 목록 |
| `notifyBotStatus` | Enum | Pending, NotTarget, Waiting, AutoApproved, Approved, Rejected, Sent |
| `publishedAt` | DateTime? | 게시일 |
| `deletedAt` | DateTime? | 소프트 삭제 시각 |

#### 2.5.8 Study / StudyUser (스터디)

**Study**:
| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 스터디 고유 ID |
| `name` | String | 스터디 이름 |
| `cohort` | String | 기수 번호 |
| `leaderId` | Int | 스터디 리더 ID |
| `leaderName` | String | 스터디 리더 이름 |
| `leaderEmail` | String | 스터디 리더 이메일 |
| `status` | Enum | ready, inprogress, finished, closed |
| `kakaoOpenChatUrl` | String? | 카카오 오픈채팅 URL |
| `startDate` | DateTime? | 시작일 |
| `endDate` | DateTime? | 종료일 |

**StudyUser**:
| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 스터디 참여 고유 ID |
| `studyId` | Int (FK) | 스터디 ID |
| `userId` | Int? | Portal User.id |
| `email` | String? | 이메일 |
| `name` | String? | 이름 |
| `role` | Enum | leader, member, buddy |
| `status` | Enum | active, inactive, canceled |
| `airtableInfo` | Json | Airtable 연동 정보 |

#### 2.5.9 Coupon / UserCoupon (쿠폰)

**Coupon**:
| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 쿠폰 고유 ID |
| `name` | String | 쿠폰 이름 |
| `description` | String | 쿠폰 설명 |
| `code` | String? | 쿠폰 코드 (unique) |
| `discountPrice` | Int | 할인 금액 |
| `kind` | Enum | Standard, AutoOption |
| `status` | Enum | Active, Deactive, Expired |
| `canDuplicate` | Boolean | 중복 사용 가능 여부 |
| `expiresAt` | DateTime? | 만료일 |

**UserCoupon**:
| 필드명 | 타입 | 설명 |
|--------|------|------|
| `id` | Int (PK) | 사용자 쿠폰 고유 ID |
| `userId` | Int (FK) | 소유자 User.id |
| `couponId` | Int (FK) | 쿠폰 Coupon.id |
| `referrerId` | Int? (FK) | 추천인 User.id |
| `issuedBy` | Enum | Admin, Manual, Url, Auto, Calculate |

---

## 3. Airtable 베이스 구조

### 3.1 주요 운영 베이스

| 베이스 | Base ID | 용도 | 동기화 방향 |
|--------|---------|------|-------------|
| **리부트 AI 스터디** | `appq8xK4PLp7D7aCg` | AI 스터디 운영 (주력) | Portal <-> Airtable |
| **리부트 AI 스터디 관리** | `appmQz54PE67Onk0N` | 스터디 관리 자동화 | 운영 전용 |
| **Bootcamp Portal** | `appT9VhNkPL4G5Rph` | 부트캠프 운영 (레거시) | Portal <-> Airtable |

### 3.2 리부트 AI 스터디 (appq8xK4PLp7D7aCg) - 핵심 베이스

#### Sync 테이블 (Portal DB 연동)

| 테이블 | Table ID | 동기화 방향 | 설명 |
|--------|----------|-------------|------|
| **멤버(Sync)** | `tblAV1fM6DdHEMfWR` | Portal -> Airtable | 회원 정보 (Hightouch) |
| **결제(Sync)** | `tblQNIOB0C8CXvgis` | Portal <-> Airtable | 결제 정보 |
| **상품(Sync)** | `tblc5C4VBnyygEUfR` | Portal -> Airtable | 상품 정보 |
| **쿠폰(Sync)** | `tblH7QMux8NFGxxrr` | Portal -> Airtable | 쿠폰 정보 |
| **게시글(Sync)** | `tbl0MRlu5YU6ALd5L` | Portal -> Airtable | 커뮤니티 게시글 |
| **홀딩(Sync)** | `tbl3ur22LQ5m78iNF` | Portal -> Airtable | 수강 홀딩 |

#### 운영 테이블 (Airtable Source of Truth)

| 테이블 | Table ID | 용도 |
|--------|----------|------|
| **기수관리** | `tblJ2uV2TyAtRV06Q` | 기수별 설정, 일정, 링크 (SOT) |
| **확정 전 스터디 리스트** | `tbluZH7N0lZIRlh5R` | 스터디장 지원/선발 관리 |
| **확정된 스터디(건들지X)** | `tblP0bMmo1xuLnX2v` | 확정 스터디 목록 |
| **스터디 신청** | `tblHtC3jZO0Oscrrt` | 스터디 신청 정보 |
| **무료초대** | `tbl02TSvhoQskduyv` | 무료초대/버디 환급 관리 |
| **환급자 취합** | `tblzT1FW2BRUXMevB` | 환급 대상자 관리 |

#### 운영 보조 테이블

| 테이블 | Table ID | 용도 |
|--------|----------|------|
| **ZOOM_무기명설문** | `tbll5v39Cr7GYkyXP` | Zoom 설문/베스트발표 선정 |
| **줌기록 vod** | `tblLeSdOWr22vtaI4` | 다시보기 영상 관리 |
| **오프모임 참여조사** | `tblj3GwsB1qCdA27T` | 오프라인 모임 참여 조사 |
| **스터디 주제 슬롯** | `tblD0Jb2CfD3zRczE` | 스터디 주제 슬롯 관리 |
| **N주차 관리** | `tblu1mkrh8KYX7SuU` | 주차별 일정 관리 |
| **쿠폰 발급 명단** | `tblFus1OjwGyTfyHl` | 쿠폰 발급 대상 관리 |
| **댓글** | `tblU9jdRbQRz9YIt9` | 커뮤니티 댓글 동기화 |
| **북마크** | `tbl81Y8V4LoGGyasG` | 게시글 북마크 |
| **학습반장** | `tblxrAeDHmEEXkCFc` | 학습반장 관리 |
| **베터모드뱃지** | `tblVSzK5rc8YnBbUQ` | 뱃지 관리 |
| **자동 모니터링 결과** | `tblFRGvzgR2oY0dEK` | AI 모니터링 자동화 결과 |
| **자동 모니터링 결과 피드백** | `tblp3w4CgbVML05Zs` | 모니터링 피드백 |
| **공지사항** | `tblq25zarOfLiDm4R` | 공지 관리 |
| **지역거점조사** | `tblTL7JnS71ogtiMa` | 오프라인 모임 지역 조사 |
| **수료증발급요청** | `tblzKR1C3BzGK4kVQ` | 수료증 발급 관리 |
| **연간멤버십 연장관리** | `tblXXncqobQtZcxav` | 멤버십 연장 관리 |
| **뱃지추가** | `tbl7fFD6LsklGl5l6` | 뱃지 발급 요청 |
| **스터디 세션** | `tbllsAHl2ZGjprebv` | 스터디 세션 관리 |
| **스터디 세션 진행** | `tblVn8o4qsUZzhS2I` | 세션 진행 상태 |
| **Make 무료 제공** | `tblWvNcbaohqCAwJ3` | Make 혜택 제공 관리 |

### 3.3 Bootcamp Portal (appT9VhNkPL4G5Rph) - 레거시 베이스

> **주의**: AI 스터디로 전환 전 부트캠프 운영에 사용했던 베이스. 일부 데이터 참조용으로만 사용.

| 테이블 | Table ID | 용도 |
|--------|----------|------|
| **회원** | `tblryJjitdqf3h0uw` | 부트캠프 회원 정보 |
| **부트캠프** | `tblr91vtWuFZsIegj` | 부트캠프 정보 |
| **부트캠프신청** | `tblK0vUN3qOTbn9cX` | 부트캠프 신청 정보 |
| **파트너신청** | `tblTCAOSs0ayHXVP7` | 파트너 신청 정보 |
| **상품** | `tblhrwWVVSWW5RUW7` | 부트캠프 상품 |
| **쿠폰** | `tblXLPwCrPgwaZrZE` | 부트캠프 쿠폰 |
| **발표자체크** | `tblO78dYjwDGTAf2q` | 발표자 체크 |
| **코칭권** | `tbld0hcAovt2JddXH` | 1:1 코칭권 |
| **코칭권 신청** | `tbl1Yq8uDH6mHNANE` | 코칭권 신청 |

---

## 4. 데이터 동기화 방향

### 4.1 Portal -> Airtable (Hightouch 배치)

```
Portal DB (PostgreSQL)
    │
    │  Hightouch (배치, 정시마다)
    ▼
Airtable Sync 테이블들
    - 멤버(Sync)
    - 결제(Sync)
    - 상품(Sync)
    - 쿠폰(Sync)
    - 게시글(Sync)
    - 홀딩(Sync)
```

### 4.2 Portal -> Airtable (실시간 API)

```
Portal Webhook/API 호출
    │
    │  직접 Airtable API
    ▼
Airtable
    - 결제(Sync): 결제 완료 시 upsert
    - 멤버(Sync): 회원 가입/수정 시 upsert
```

**코드 위치**: `packages/airtable/src/`

### 4.3 Airtable -> Portal (N8N 자동화)

```
Airtable
    │
    │  N8N Workflow
    ▼
Portal DB
    - 환급 처리: Payment 상태 업데이트
    - 기수 정보: Cohort 테이블 동기화
```

**주요 워크플로우**:
- `환급대상자 수동 환불 후 DB 업데이트` (ID: `62ie43Ap56vRaLbB`)
- `주기적 게시글 싱크` (ID: `BZ4y9uiSombhpPj2`)

### 4.4 Bettermode -> Portal -> Airtable

```
Bettermode Webhook
    │
    │  member.verified, post.created, etc.
    ▼
Portal DB
    │  (User, CommunityPost 업데이트)
    │
    │  Fire-and-forget Airtable upsert
    ▼
Airtable (멤버/게시글 Sync)
```

**Webhook 핸들러**: `apps/web/src/app/api/bettermode/webhook/`

---

## 5. 주요 ID 매핑 관계

### 5.1 사용자 ID 연결고리

```
Portal User.id (Int, auto-increment)
    ├── User.airtableId -> Airtable 멤버(Sync).recordId
    ├── User.bettermodeUserId -> Bettermode member.id
    └── User.bettermodeExternalId -> Bettermode member.externalId
```

### 5.2 결제 ID 연결고리

```
Portal Payment.id (Int, auto-increment)
    ├── Payment.portoneId -> Portone imp_uid
    └── Airtable 결제(Sync).paymentId -> Portal Payment.id
```

### 5.3 스터디 ID 연결고리

```
Portal Study.id (Int, auto-increment)
    ├── Study.bettermodeId -> Bettermode space.id
    └── Airtable 확정된 스터디.studyId -> Portal Study.id
```

### 5.4 게시글 ID 연결고리

```
Portal CommunityPost.id (Int, auto-increment)
    ├── CommunityPost.bettermodeId -> Bettermode post.id
    └── Airtable 게시글(Sync).postId -> Portal CommunityPost.id
```

---

## 6. 개발 시 주의사항

### 6.1 데이터 수정 시 원칙

| 데이터 유형 | 수정 위치 | 동기화 방법 |
|------------|----------|-------------|
| 결제/환불 | **Portal DB 우선** | Webhook -> Airtable 자동 반영 |
| 회원 정보 | **Portal DB 우선** | Hightouch 배치 or API 직접 호출 |
| 스터디 운영 | **Airtable 우선** | N8N -> Portal (필요시) |
| 기수 설정 | **Airtable 기수관리 테이블** | Portal은 읽기만 함 |

### 6.2 Airtable API 제한

- **Rate Limit**: 5 requests/second
- **권장**: 배치 처리 + 지수 백오프

```typescript
// 권장 패턴
import { upsertMemberToAirtable } from '@gpters/airtable'

// Fire-and-forget (에러 로깅만)
void upsertMemberToAirtable(user).catch(err => {
  logger.error('Airtable sync failed', { userId: user.id, error: err })
})
```

### 6.3 소프트 삭제 주의

Portal DB에서 다음 모델들은 **소프트 삭제** 적용:
- `Order`
- `OrderItem`
- `Payment`
- `CommunityPost`

```typescript
// 조회 시 자동으로 deletedAt IS NULL 조건 추가됨
// 하드 삭제 필요시:
await db.$executeRaw`DELETE FROM "Order" WHERE id = ${orderId}`
```

### 6.4 외부 ID 검증

새 레코드 생성 시 외부 ID uniqueness 확인:

```typescript
// 중복 체크 예시
const existing = await db.user.findFirst({
  where: {
    OR: [
      { airtableId: newAirtableId },
      { bettermodeUserId: newBettermodeId }
    ]
  }
})
```

### 6.5 N8N 직접 DB 업데이트 주의

N8N에서 PostgreSQL 직접 업데이트 시:
- Prisma 미들웨어 우회됨
- 소프트 삭제 로직 미적용
- 감사 로그 누락 가능

**권장**: 가능하면 Portal API 엔드포인트 호출로 전환

---

## 7. Airtable 테이블별 필드 상세

> 아래는 주요 Sync 테이블들의 핵심 필드 정보입니다.
> 전체 필드 목록은 Airtable MCP를 통해 조회하거나 직접 Airtable에서 확인하세요.

### 7.1 멤버(Sync) - `tblAV1fM6DdHEMfWR`

Portal DB의 `User` 테이블과 연동됩니다.

| 필드명 | Field ID | 타입 | 설명 |
|--------|----------|------|------|
| `userId` | `fldejmJPlWWRXudKO` | number | Portal User.id (PK) |
| `이름` | `fldxNYc77pufaNib2` | text | 사용자 이름 |
| `닉네임` | `fldFI5p6nGjzLq1ud` | text | Bettermode 닉네임 |
| `이메일` | `fldiT2n2LAhTF76TU` | email | 이메일 주소 |
| `전화번호` | `fldFBtfxo5eeftrpf` | text | 전화번호 |
| `bettermode_user_id` | `fldMq5eV0pnrN6Mod` | text | Bettermode 사용자 ID (수정금지) |
| `참여기수` | `fldHMIra9F5pFr966` | text | 참여한 기수 목록 (JSON) |
| `실제참여기수` | `fldPiZCJRJeWwCSTc` | text | 실제 참여 기수 |
| `유저쿠폰ids` | `fldksrFsFIoqSLCDc` | text | 보유 쿠폰 ID 목록 |
| `recordId` | `fld86qHwtOuyRpxrJ` | formula | Airtable 레코드 ID (RECORD_ID()) |

**연결 필드 (Link)**:
- `결제` -> 결제(Sync) 테이블
- `게시글(Sync)` -> 게시글(Sync) 테이블
- `확정 전 스터디 리스트` -> 스터디장 지원 내역
- `보유뱃지` -> 베터모드뱃지 테이블

### 7.2 결제(Sync) - `tblQNIOB0C8CXvgis`

Portal DB의 `Order`, `Payment` 테이블과 연동됩니다.

| 필드명 | Field ID | 타입 | 설명 |
|--------|----------|------|------|
| `paymentId` | `flderN3tvxNmm5yLu` | number | Portal Payment.id (PK) |
| `userId` | `fldqygJ53bskvi10p` | number | Portal User.id (FK) |
| `productId` | `fldKivT2DhlLcLxkX` | number | Portal CourseProduct.id (FK) |
| `실결제금액` | `fldPL1zrXYHgpr0xk` | number | 실제 결제 금액 |
| `결제일` | `fld0nDhMPDxuimlCg` | dateTime | 결제 완료 일시 |
| `상태` | `fldRRJfy5wV2Muovx` | select | Success, Cancel, VBankIssued, PartialCancel |
| `결제수단` | `fldZ4qsPIN34UaDd9` | select | TossCard, Kakao, TossVBank, Paypal, None |
| `결제통화` | `fldAJnLyLKvWW1E23` | text | KRW, USD 등 |
| `portoneId` | `fldaK1swV6rntm9Xa` | text | Portone imp_uid |
| `환불된금액` | `fldi2LYcJpOeHUaSQ` | number | 부분환불 금액 |
| `사용한쿠폰ids` | `fld2Qf2dZfTqFKUsk` | text | 적용된 쿠폰 ID 목록 |
| `신규/재참여` | `fldO8LaPvhdPRZEp2` | select | 신규, 재참여, 연속재참여 |
| `recordId` | `fldEwHICLs1VbDNAG` | formula | Airtable 레코드 ID |

**연결 필드 (Link)**:
- `멤버` -> 멤버(Sync) 테이블
- `상품(Sync)` -> 상품(Sync) 테이블
- `스터디신청` -> 스터디 신청 테이블
- `사용한쿠폰` -> 쿠폰(Sync) 테이블
- `홀딩(Sync)` -> 홀딩(Sync) 테이블

### 7.3 상품(Sync) - `tblc5C4VBnyygEUfR`

Portal DB의 `CourseProduct` 테이블과 연동됩니다.

| 필드명 | Field ID | 타입 | 설명 |
|--------|----------|------|------|
| `productId` | `fldGzJPvoON6DVUIQ` | number | Portal CourseProduct.id (PK) |
| `이름` | `fldk2IFnaA7SCgIdM` | text | 상품명 |
| `가격` | `fld9fbQV6NESTt0sl` | number | 상품 가격 |
| `판매상태` | `fld2slPxEbTSXsDwJ` | select | Stop, Selling, SoldOut, Upcoming |
| `상품구분` | `fldZaJoISaGPEQiyH` | text | 상품 유형 |
| `설명` | `fldfxHQ432iV8hao3` | text | 상품 설명 |
| `bettermodeId` | `fld83g2wKL9wYHWG7` | text | Bettermode Space ID |
| `사용가능쿠폰ids` | `fldM8qbHzUsmHzu2i` | text | 사용 가능한 쿠폰 ID 목록 |
| `recordId` | `fldFvU8LlRWz2JLMF` | formula | Airtable 레코드 ID |

**연결 필드 (Link)**:
- `기수관리` -> 기수관리 테이블 (기수별 설정)
- `스터디_link` -> 확정된 스터디 테이블
- `결제(Sync)` -> 결제(Sync) 테이블
- `사용가능쿠폰` -> 쿠폰(Sync) 테이블

**Lookup 필드** (기수관리에서 가져옴):
- `기수`, `공통줌_gateway_URL`, `공통캘린더URL`, `공지카톡방`, `네트워킹카톡방`

### 7.4 기수관리 - `tblJ2uV2TyAtRV06Q`

> **Airtable이 Source of Truth**인 테이블. Portal DB에서 읽기만 합니다.

| 필드명 | Field ID | 타입 | 설명 |
|--------|----------|------|------|
| `기수` | `fldAMH3Rpgl3vnu3K` | number | 기수 번호 (예: 19) |
| `기수명` | `fldPGUnPKLdb9Ti0L` | text | 기수 표시명 (예: "19기") |
| `사전판매시작일` | `fldIfUoJl74tCFXOR` | date | 사전 판매 시작일 |
| `모집시작일` | `fldHQqiqDbCApVB9z` | dateTime | 본 모집 시작일 |
| `모집마감일` | `fldnmm9N9LDWocE5t` | dateTime | 모집 마감일 |
| `스터디시작일` | `flde63JGFrJNqCRLG` | date | 스터디 시작일 |
| `스터디종료일` | `flddFBTK4erjvJChC` | date | 스터디 종료일 |
| `스터디시간` | `fldeXjcQIaEhNFKAm` | text | 스터디 진행 시간 |
| `모집정원` | `fld8dwlPHjE4LJuTq` | number | 모집 정원 |
| `공지카톡방` | `fld0tVrflE7RqeMiZ` | url | 카카오톡 공지방 URL |
| `네트워킹카톡방` | `fldslz51XR4cnBFc1` | url | 네트워킹 카톡방 URL |
| `공통줌_gateway_URL` | `fld6FWz0CfLrjlJr1` | url | 게이트웨이 줌 URL |
| `스터디장지원마감일` | `fldylrcWVAODmMBeU` | dateTime | 스터디장 지원 마감 |
| `스터디장선발회신일` | `fldZzjeDpcXwHXlqd` | dateTime | 선발 결과 발표일 |
| `recordId` | `fldLDAF4OIU49g6jU` | formula | Airtable 레코드 ID |

**연결 필드 (Link)**:
- `상품(Sync)` -> 해당 기수 상품
- `확정 전 스터디 리스트` -> 스터디장 지원 목록
- `N주차 관리` -> 주차별 일정

### 7.5 게시글(Sync) - `tbl0MRlu5YU6ALd5L`

Portal DB의 `CommunityPost` 테이블과 연동됩니다.

| 필드명 | Field ID | 타입 | 설명 |
|--------|----------|------|------|
| `id` | `fldhgdcJFKH6tW1bu` | text | Portal CommunityPost.id |
| `bettermodeId` | `fld6cXYoo5Adqz9QN` | text | Bettermode Post ID (수정금지) |
| `제목` | `fldQDMoqawN9AGBVI` | text | 게시글 제목 |
| `URL` | `fldjJ6FWY6TTEvIou` | url | 게시글 URL |
| `slug` | `flds5YYg555bG2HNd` | text | URL 슬러그 |
| `태그` | `fldLCeI8M5RmvaIjl` | text | 게시글 태그 (JSON) |
| `게시판이름` | `fldiEVuXvxVWAu6p5` | text | 게시판명 |
| `생성일` | `fldYd5YT6NPOCtQ76` | dateTime | 게시글 생성일 |
| `수정일` | `fldWfhmppRhjbFWyk` | dateTime | 마지막 수정일 |
| `배포일` | `fldmZmUmlHkc343SL` | dateTime | 게시글 배포일 |
| `삭제일` | `fldwUXhP4G6ppRZbM` | dateTime | 삭제일 (soft delete) |
| `숨김여부` | `fldIGZUJx2fvAHD2c` | checkbox | 숨김 처리 여부 |
| `bettermodeAuthorId` | `fld4T0psnD9f97nZr` | text | Bettermode 작성자 ID |
| `bettermodeSpaceId` | `fldhti8ttKLLRfPGt` | text | Bettermode Space ID |
| `bettermodePostTypeId` | `fld5u5cmxdNQV9v2V` | text | Bettermode PostType ID |
| `본문` | `fld63mytTbcELGNQP` | richText | 게시글 본문 |
| `요약본` | `fld9hjbFcHifeKUJA` | richText | AI 요약 |
| `한줄요약` | `fld0Vy9dZEEm50mhF` | text | 한줄 요약 |
| `recordId` | `fldMF9NQlsbWhYSux` | formula | Airtable 레코드 ID |

**연결 필드 (Link)**:
- `작성자` -> 멤버(Sync) 테이블
- `스터디` -> 확정된 스터디 테이블
- `베스트사례` -> ZOOM_무기명설문 테이블
- `댓글` -> 댓글 테이블
- `북마크` -> 북마크 테이블

**운영용 필드**:
- `주차인정`: 주차별 사례 인정 (1~5주차)
- `수강구분`: 수강/청강 구분

---

## 부록: 빠른 참조

### Airtable Base ID

| 베이스명 | Base ID |
|---------|---------|
| 리부트 AI 스터디 | `appq8xK4PLp7D7aCg` |
| Bootcamp Portal | `appT9VhNkPL4G5Rph` |
| 리부트 AI 스터디 관리 | `appmQz54PE67Onk0N` |

### 주요 Sync 테이블 ID (리부트 AI 스터디)

| 테이블명 | Table ID |
|---------|----------|
| 멤버(Sync) | `tblAV1fM6DdHEMfWR` |
| 결제(Sync) | `tblQNIOB0C8CXvgis` |
| 상품(Sync) | `tblc5C4VBnyygEUfR` |
| 쿠폰(Sync) | `tblH7QMux8NFGxxrr` |
| 게시글(Sync) | `tbl0MRlu5YU6ALd5L` |
| 홀딩(Sync) | `tbl3ur22LQ5m78iNF` |
| 기수관리 | `tblJ2uV2TyAtRV06Q` |
| 자동 모니터링 결과 | `tblFRGvzgR2oY0dEK` |
| 수료증발급요청 | `tblzKR1C3BzGK4kVQ` |
| 스터디 세션 | `tbllsAHl2ZGjprebv` |

### 파일 위치 참조

| 카테고리 | 경로 |
|---------|------|
| Prisma 스키마 | `packages/db/prisma/schema/` |
| Hightouch Views | `packages/db/prisma/views/` |
| Airtable Client | `packages/airtable/src/` |
| Bettermode Webhook | `apps/web/src/app/api/bettermode/webhook/` |
| 상세 동기화 정책 | `docs/04-database/data-sync-integrity-policy.md` |
