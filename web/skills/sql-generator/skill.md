---
name: sql-generator
description: 자연어 설명을 SQL 쿼리로 변환
author: gpters-team
tags: [database, sql, productivity]
difficulty: medium
---

# SQL Query Generator

자연어로 원하는 데이터를 설명하면 최적화된 SQL 쿼리를 생성합니다.

## Usage

스키마 정보와 함께 원하는 쿼리를 자연어로 설명하세요.

```
/sql-generator
테이블: users, orders, products
"지난 30일간 가장 많이 주문한 상위 10명의 사용자"
```

## Process

1. 테이블 스키마 분석
2. 자연어 요구사항 파싱
3. 필요한 JOIN, 집계 함수 결정
4. 최적화된 쿼리 생성
5. 실행 계획 설명

## Supported Databases

- **PostgreSQL** (기본)
- **MySQL / MariaDB**
- **SQLite**
- **SQL Server**
- **Oracle**

## Output Format

```markdown
## Generated Query

### Your Request
"지난 30일간 가장 많이 주문한 상위 10명의 사용자"

### SQL Query
```sql
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total_amount) as total_spent
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name, u.email
ORDER BY order_count DESC
LIMIT 10;
```

### Explanation
1. `users`와 `orders` 테이블을 user_id로 JOIN
2. 최근 30일 주문만 필터링
3. 사용자별 주문 수와 총 금액 집계
4. 주문 수 기준 내림차순 정렬
5. 상위 10명만 반환

### Performance Tips
- `orders.created_at`에 인덱스 권장
- `orders.user_id`에 인덱스 필요

### Alternative Approaches
[다른 방식의 쿼리가 있다면 제시]
```

## Features

- **스키마 인식**: 기존 테이블 구조 자동 파악
- **쿼리 최적화**: 효율적인 쿼리 작성
- **방언 지원**: 데이터베이스별 문법 차이 처리
- **인덱스 제안**: 성능 향상을 위한 인덱스 추천

## Examples

### Simple Query
```
"이메일이 gmail.com인 모든 사용자"

SELECT * FROM users
WHERE email LIKE '%@gmail.com';
```

### Complex Query
```
"각 카테고리별 월간 매출 추이 (최근 6개월)"

SELECT
    c.name as category,
    DATE_TRUNC('month', o.created_at) as month,
    SUM(oi.quantity * oi.price) as revenue
FROM categories c
JOIN products p ON c.id = p.category_id
JOIN order_items oi ON p.id = oi.product_id
JOIN orders o ON oi.order_id = o.id
WHERE o.created_at >= NOW() - INTERVAL '6 months'
GROUP BY c.name, DATE_TRUNC('month', o.created_at)
ORDER BY month, category;
```

## Options

- `--dialect <db>`: 데이터베이스 종류 지정
- `--explain`: 실행 계획 포함
- `--optimize`: 성능 최적화 버전도 제시
