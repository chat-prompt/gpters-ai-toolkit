# Explicit task expectations

This API registers a bounded plan before work starts. It does not create a cron,
send a message, run a command, modify an agent, or certify task success. An agent
or private scheduler adapter must receive registration acknowledgment before
starting the corresponding work. No installed runtime uses it automatically.

## Authorization and enablement

Apply additive migration `0042_ax_task_expectations.sql` through the reviewed
rollout process, then explicitly configure `AX_TASK_EXPECTATIONS_ENABLED=true` and
`AX_TASK_EXPECTATIONS_AGENT_IDS` with the approved agent identities. The existing
`AX_MONITOR_ENABLED`, `AX_INCIDENT_ORG_ID` and `AX_MONITOR_AGENT_IDS` must also cover
the registration. The feature is disabled by default and does not query its new
table while disabled. Do not enable it before the migration is applied.

Requests require an active `aia_` credential for the configured organization and
an individually allowed, monitored agent. Authentication checks the active owner
account and organization membership. Collector `agt_` credentials, human OAuth,
cookies, report links and deployment permission do not grant this new capability.
The server selects organization and agent from authentication; the request cannot
choose them. The allowed agent can register its own supported runtime sources;
source, task, attempt and phase are immutable after registration. Reads and writes
are scoped to organization and agent. No cross-agent bulk listing API is exposed.

Activating this protocol in an existing agent or scheduler changes its behavior
and requires the normal advance notice. Server code availability alone is not
host activation or evidence of scheduled coverage.

## Registration and retries

`POST /api/ax/task-expectations` accepts JSON up to 16KB. Example only:

```json
{
  "action": "register",
  "source": "codex",
  "taskId": "11111111-1111-4111-8111-111111111111",
  "attemptId": "22222222-2222-4222-8222-222222222222",
  "phase": "execution",
  "evidence": "process",
  "scheduledFor": "2027-01-01T01:00:00.000Z",
  "deadlineAt": "2027-01-01T01:05:00.000Z"
}
```

Replace the synthetic dates with UTC times in the next 30 days. Registration
must arrive no later than `scheduledFor`, which must precede `deadlineAt`.
Allow transport time when choosing the planned start. Phases are `execution`,
`verification` and `delivery`; evidence is `process` or `api`. Delivery requires
`api`. Neither scheduler `ok` nor self-reported completion fulfills these plans.

The server returns `{record,replayed}` with a deterministic `expect_` ID, revision
and timestamps. Identity covers organization, agent, source, task, attempt and
phase. Repeating identical registration returns the same record identity, even
if the deadline has since passed. Changing any other registration field under
that identity returns 409. A replay may return the latest revision; the caller
must inspect state and revision rather than assume the original state.

If the registration result is uncertain, repeat the identical request. Do not
invent a new attempt merely to escape an uncertain acknowledgment. A caller must
never treat HTTP timeout as proof that registration failed. Once acknowledged,
retain task/attempt IDs in the actual runtime's existing telemetry receipts.

`GET /api/ax/task-expectations?id=<id>` returns the calling agent's record only.
Unknown and out-of-scope IDs both return 404. No raw prompt, command, address,
message text, transport receipt body or destination is accepted by this API.

## Changes and terminal boundaries

Cancellation is explicit:

```json
{"action":"cancel","id":"<returned expectation ID>","revision":1,"operationId":"33333333-3333-4333-8333-333333333333","reason":"no-longer-needed"}
```

Allowed cancellation reasons are `no-longer-needed`, `replaced-by-new-attempt`,
and `operator-request`. Postponement uses `action:"defer"`, a later `deadlineAt`,
and reason `dependency-delay`, `rescheduled` or `operator-request`. It moves the
receipt deadline, not the runtime schedule or original planned start. Both
operations require the latest revision and a new operation UUID. Retry the same
operation UUID and exact body after uncertainty; altered content is a conflict.
The audit history records the old deadline. A change after a missed deadline
retains `overdueBeforeChange`; postponement cannot erase the original lateness.
Even if cancellation/postponement occurs before the first monitor tick, that
missed deadline remains a historical candidate with its current signal inactive.
A late first receipt likewise retains a historical missed-deadline candidate.
An expectation accepts at most 100 explicit changes.

Cancellation and successful receipt observation are terminal. Cancelling this
plan does not stop a runtime job or retract a message; that requires a separate
authorized runtime operation. A new execution
attempt gets a new attempt UUID and a new registration; it does not complete or
cancel the old attempt. Explicitly cancel an obsolete old plan if that is the
intended decision. There is no automatic retry scheduling or cascade cancellation.
A cancellation racing completion can lose revision CAS; read the resulting state.
An earlier on-time receipt arriving later corrects the apparent missed-deadline
label, including on a cancelled plan, while retaining the cancellation/defer
audit. Recording that receipt never changes a cancelled plan back to completed.

There is deliberately no arbitrary `complete` command. Completion comes only
from a successful task event or normalized process/API receipt for the exact
agent, source, task, attempt, phase and required evidence. A receipt before server
registration cannot satisfy a future plan. A late valid receipt resolves the
observation but retains its actual timestamp; earlier eligible receipts arriving
later can correct the recorded receipt time. A cancelled plan remains cancelled
when later activity arrives. The activity itself stays in the telemetry history.
`completed` means the required reported receipt was observed, not independent
verification, full business correctness, or proof that a human read a message.

## Monitor and consistency

The monitor examines registered plans even when no telemetry batch or execution
receipt exists. Only an explicit elapsed deadline establishes a missing-receipt
candidate. While ingestion is backlogged or poisoned, absence-based detection
waits rather than assuming missing data is a failed run. Independent monitoring
must still detect a stalled central monitor separately.

Plan mutations invalidate the monitor snapshot through its revision CAS.
Completion, batch acknowledgment, projection and alert outbox commit atomically.
The pre-send guard rechecks the current plan after Slack channel resolution and
cancels an obsolete alert after cancellation or postponement. A revised deadline
starts a new observation episode even when it expires between monitor ticks; an
old cancelled opening cannot suppress the new opening until a daily reminder.
Database state and
a final external message POST cannot be one distributed transaction; a change
made after that final check can still race a send. Existing ambiguous-send rules
remain in force.

Existing human disposition fields are preserved. Resolving a signal does not
set a case to fixed or verified. These candidates are displayed in the existing
read-only monitoring panel, with planned time, deadline, plan state and late
receipt labeling. This change does not add a new review action UI for missing
receipt cases; the existing incident review flow is not repurposed to declare
that an absent execution succeeded.

Completed/cancelled plans without a missed deadline or retained monitor candidate are omitted from
subsequent projection reads, while their durable API records remain available.
Active plans and retained candidate plans are bounded to 10,000 per monitor.
Exceeding that bound fails visibly rather than pretending a partial read covers
all deadlines. Projection indexes events by exact scope to avoid plans × events
work. A future archive policy must preserve candidate/replay history; deleting
plans is not an available API operation.

## Validation boundary

Unit tests use anonymous fixtures and mocked authentication/network calls.
`ax-task-expectation-store.postgres.test.ts` runs only with
`RUN_ISOLATED_EXPECTATION_TESTS=true`, `DATABASE_DRIVER=postgres-js`, and the
explicit loopback URL `postgres://postgres@127.0.0.1:55443/ax_task_expectations_test`.
It requires a fresh empty disposable database and creates its own minimal tables.
The dedicated CI workflow supplies that disposable PostgreSQL service. Never point
this test at an existing development, shared or production database.

Report separately: code tested, migration applied, API enabled, an actual plan
registered, natural deadline/receipt observed, and human review performed.
