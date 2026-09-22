/**
 * 구독 로스터 → AX 구독 현황 동기화 API (뽀밋이 전용)
 *
 * 정본은 「지니파이(주) 결제 내역」 시트의 `구독 로스터` 탭이다. 뽀밋이가 로스터를 CSV 로 보내면
 * `plan` 은 갱신·추가·삭제 계획과 해시를 돌려주고, 그 해시를 붙인 `apply` 만 반영한다.
 * 사람 승인은 호출하는 쪽(뽀밋이 DM)이 받는다 — 이 API 는 "미리 본 그대로만 반영"을 보장한다.
 *
 * 운영 DB 자격 증명을 봇 호스트에 두지 않으려고 만든 좁은 쓰기 경로다(DEV-4486).
 * 카드 정보가 서버로 오지 않게 `slack_id`·`card_last4` 열이 있는 CSV 는 거절한다.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { NextRequest, NextResponse } from 'next/server'
import { db, axSubscriptions } from '@/lib/db'
import {
  parseCsvLine,
  parseRosterCsv,
  planRosterSync,
  subscriptionValues,
  summarizeRosterSync,
} from '../../../../../../packages/db/scripts/lib/ax-subscription-roster'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024
const NO_STORE = { 'Cache-Control': 'private, no-store' }
const FORBIDDEN_COLUMNS = ['slack_id', 'card_last4']

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function authorize(authorization: string | null): 'ok' | 'unconfigured' | 'unauthorized' {
  const expectedHash = process.env.AX_SUBSCRIPTION_SYNC_TOKEN_SHA256?.trim().toLowerCase()
  if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) return 'unconfigured'
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
  if (!token) return 'unauthorized'
  const actualHash = createHash('sha256').update(token).digest('hex')
  return constantTimeEqual(actualHash, expectedHash) ? 'ok' : 'unauthorized'
}

const error = (message: string, status: number, details?: string[]) =>
  NextResponse.json(details ? { error: message, details } : { error: message }, { status, headers: NO_STORE })

export async function POST(request: NextRequest) {
  const auth = authorize(request.headers.get('authorization'))
  if (auth === 'unconfigured') return error('Subscription sync is not configured', 503)
  if (auth === 'unauthorized') return error('Unauthorized', 401)

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return error('Payload too large', 413)

  let input: { mode?: unknown; csv?: unknown; approvedPlanHash?: unknown }
  try {
    const text = await request.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return error('Payload too large', 413)
    input = JSON.parse(text)
  } catch {
    return error('Invalid JSON', 400)
  }
  if (!input || typeof input !== 'object') return error('Invalid body', 400)

  const { mode, csv, approvedPlanHash } = input
  if (mode !== 'plan' && mode !== 'apply') return error('mode must be "plan" or "apply"', 400)
  if (typeof csv !== 'string' || !csv.trim()) return error('csv is required', 400)
  if (approvedPlanHash !== undefined && (typeof approvedPlanHash !== 'string' || !/^[a-f0-9]{64}$/.test(approvedPlanHash))) {
    return error('approvedPlanHash must be a sha256 hex string', 400)
  }
  if (mode === 'apply' && !approvedPlanHash) return error('apply requires approvedPlanHash from a prior plan', 400)

  const headerLine = csv.replace(/^﻿/, '').split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
  const header = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase())
  const forbidden = FORBIDDEN_COLUMNS.filter((col) => header.includes(col))
  if (forbidden.length > 0) return error(`CSV must not include columns: ${forbidden.join(', ')}`, 400)

  let parsed: ReturnType<typeof parseRosterCsv>
  try {
    parsed = parseRosterCsv(csv)
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'Invalid roster CSV', 400)
  }
  if (parsed.errors.length > 0) return error('Roster CSV has invalid rows', 400, parsed.errors)
  // 전체 동기화라 빈 입력을 반영하면 구독이 전부 지워진다
  if (parsed.rows.length === 0) return error('Roster CSV has no subscriptions', 400)

  try {
    const existing = await db
      .select({
        id: axSubscriptions.id,
        vendor: axSubscriptions.vendor,
        plan: axSubscriptions.plan,
        ownerName: axSubscriptions.ownerName,
        renewalDay: axSubscriptions.renewalDay,
        payer: axSubscriptions.payer,
        amount: axSubscriptions.amount,
        currency: axSubscriptions.currency,
        billingCycle: axSubscriptions.billingCycle,
        status: axSubscriptions.status,
        note: axSubscriptions.note,
      })
      .from(axSubscriptions)
    const plan = planRosterSync(parsed.rows, existing)
    const summary = summarizeRosterSync(plan, existing)
    const { unchanged, ...body } = summary

    if (mode === 'plan') {
      return NextResponse.json({ status: unchanged ? 'unchanged' : 'planned', ...body }, { headers: NO_STORE })
    }

    if (approvedPlanHash !== summary.planHash) {
      return NextResponse.json(
        { error: 'Plan changed since it was approved; run plan again', status: 'conflict', ...body },
        { status: 409, headers: NO_STORE }
      )
    }

    // 값이 그대로인 행도 갱신해 synced_at(대시보드의 "시트 반영" 날짜)을 이번 반영으로 맞춘다.
    // note 는 로스터에 없는 열이라 갱신하지 않는다(손으로 적은 메모를 지우지 않는다)
    const now = new Date()
    const withoutNote = (row: Parameters<typeof subscriptionValues>[0]) => {
      const { note: _note, ...values } = subscriptionValues(row, now)
      return values
    }
    const build = (client: typeof db): BatchItem<'pg'>[] => [
      ...plan.update.map(({ id, row }) =>
        client.update(axSubscriptions).set(withoutNote(row)).where(eq(axSubscriptions.id, id))
      ),
      ...(plan.insert.length > 0 ? [client.insert(axSubscriptions).values(plan.insert.map((row) => subscriptionValues(row, now)))] : []),
      ...(plan.remove.length > 0
        ? [client.delete(axSubscriptions).where(inArray(axSubscriptions.id, plan.remove.map((row) => row.id)))]
        : []),
    ]
    // Neon HTTP 는 batch 를 한 트랜잭션으로 돈다. 로컬 postgres-js 드라이버는 batch 가 없어 트랜잭션으로 묶는다
    if (typeof (db as { batch?: unknown }).batch === 'function') {
      await db.batch(build(db) as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
    } else {
      await db.transaction(async (tx) => {
        for (const query of build(tx as unknown as typeof db)) await query
      })
    }

    return NextResponse.json({ status: 'applied', ...body }, { headers: NO_STORE })
  } catch (cause) {
    // 금액·이름 없이 원인만 남긴다
    console.error('[ax/subscription-sync] failed:', cause instanceof Error ? cause.message : String(cause))
    return error('Failed to sync subscriptions', 500)
  }
}
