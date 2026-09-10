# Central monitoring operations

The monitor is a read-only observer of existing committed telemetry. It writes only its own durable projection, batch receipts, candidate records and delivery queue. It never runs or repairs an agent task. Apply migration 0041 before enabling the monitor. Existing report/review and telemetry clients remain compatible.

## Activation and delivery boundaries

- `AX_MONITOR_ENABLED=true`, the existing `AX_INCIDENT_ORG_ID`, and a nonempty explicit `AX_MONITOR_AGENT_IDS` allowlist enable projection. No default fleet is inferred.
- The Vercel job calls `/api/cron/agent-monitor` every five minutes using `CRON_SECRET` (at least 32 characters). A manually invoked authenticated tick is not proof of a natural scheduled run.
- `AX_MONITOR_ALERTS_ENABLED=true`, `AX_MONITOR_SLACK_TOKEN`, and `AX_MONITOR_SLACK_USER` enable only a configured human DM. Never substitute the shared Slack webhook. Keep alerts off during the initial quiet observation.
- `AX_MONITOR_HEALTH_SECRET` is a distinct read-only secret for `?heartbeat=1`. It cannot run a monitor tick. Install the [independent watchdog](../infra/agent-observability/WATCHDOG.md) separately and verify a natural run before calling unattended monitoring complete.
- Report inbox enrollment/delivery use separate default-off `AX_REPORT_INBOX_ENABLED` and `AX_REPORT_INBOX_DELIVERY_ENABLED` flags and an explicit channel allowlist. Enrollment requires the designated reviewer and confirmed original thread. See [report protocol](../infra/agent-reports/PROTOCOL.md). Do not enable reminders merely because a report exists.

## Evidence and failure handling

Committed batches are found by an anti-join against a durable consumed-batch ledger, not a wall-clock cursor. A CAS transaction commits projection, consumed batches, new candidates and queued notifications atomically. Late transaction commits and duplicate event replay are covered by isolated PostgreSQL tests.

Malformed, conflicting or future-clock batches are deferred without starving later valid batches. Deferred rows remain visible in the backlog; they are never silently marked consumed. Invalid rows retry after one day and require operator investigation. While any configured stream remains incomplete, missing-receipt and recovery conclusions are conservatively withheld. Removing an agent from the allowlist removes its deferred rows from this completeness decision. History remains stored.

Only explicit delivery deadlines can produce a missing-receipt candidate. The current producer contract supports deadlines attached to Slack API receipts. It does not register independently expected tasks, and cannot detect work that never produced any receipt. Scheduler completion, process exit and Slack API acceptance are distinct facts. No adapter currently proves human receipt independently; the dashboard labels that capability unavailable.

Human decisions remain authoritative. Late pre-review evidence does not reopen a closed monitor candidate. A newer failure is a review signal, not an automatically confirmed incident. The monitor preserves its event identities and per-attempt evidence; existing human case rows are insert-only here and are not overwritten with batch projections.

An outbox item is claimed before sending and checked against current scope, condition, claim and human disposition immediately before Slack POST. A timed-out POST or expired sending claim becomes `uncertain` and is not automatically resent. Explicit rate limits may retry; blocked and uncertain items require operator resolution. DB checks and Slack POST cannot form one transaction: a human decision after the final check can still race with an in-flight message. API acceptance is not a read receipt.

## Rollback and verification

Disable alert and inbox-delivery flags first to stop new outbound activity. Disable `AX_MONITOR_ENABLED` to stop projection. Retain the new tables and pending/uncertain receipts for investigation; do not delete evidence or replay uncertain sends. Roll back the web deployment if needed. Agent prompts, hooks, schedules and npm versions do not change with this server rollback.

Use unit tests and only the guarded disposable PostgreSQL test target. Browser verification uses synthetic read-only fixtures in desktop/mobile and light/dark modes. Actual pilot tests use synthetic Slack reports only. Never reuse SMS/Kakao jobs, change existing schedules, or run mutating API/E2E suites against a shared DB.

Track implementation, server deployment, helper build, scoped local collection, matching server ingestion, natural scheduled execution and human review as separate acceptance states. Helper readiness is not a completed agent rollout; see [observation protocol](../infra/agent-observability/PROTOCOL.md).
