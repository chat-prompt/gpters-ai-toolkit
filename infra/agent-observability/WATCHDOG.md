# Independent central-monitor watchdog

This one-shot helper detects a missing or unhealthy central monitor from a
separate host. No scheduler is installed by this repository. Enabling it changes
automatic operator messaging, so report its target, cadence, recipient and
rollback before installation. It never invokes agent execution or modifies a
collector, scheduled business task or report decision.

## Private configuration

Build `watch-monitor.ts` with the repository's reviewed `monitor-notifications`
adapter into a Node ESM bundle. Keep the bundle and configuration outside the
public checkout. Invoke the bundle with exactly one argument: the private JSON
configuration path. Never place secret values in process arguments or logs.

Configuration fields:

| Field | Purpose |
| --- | --- |
| `origin` | Exact HTTPS toolkit origin, without a trailing slash |
| `healthSecret` | Dedicated health-only secret, at least 32 characters; never the execution cron secret |
| `recipient` | Explicit operator Slack user ID |
| `slackToken` | Private token used only by the operator-message adapter |
| `stateFile` | Absolute path in an existing real directory owned by this user, mode `0700` |

Config and existing state must be owned regular files with exact mode `0600`.
Symlink files are rejected. The state directory must use its canonical real
path, without symlink components. The helper creates its lock and atomic state
files with mode `0600`; it does not relax permissions or create directories.
State includes episode/notice identifiers and timestamps, not secrets or raw
API bodies.

## Health and notifications

Each invocation makes only `GET /api/cron/agent-monitor?heartbeat=1` using the
health secret. Redirects are rejected and the request times out after 15 seconds.
Healthy requires all of: successful HTTP response, `healthy: true`, `backlog: 0`,
and a valid `lastSuccessAt` from zero to fifteen minutes old. An unknown backlog,
future timestamp, stale run, HTTP error or network failure is unhealthy. This
detects failures to drain the backlog even if a scheduler is still executing.

The first unhealthy observation requests one operator DM. Another outage message
is due no sooner than 24 hours after acceptance. Healthy observations after an
accepted outage message request one recovery DM. Rate-limited recovery messages
retain their identity and retry time even while the monitor stays healthy.
Recoveries without an accepted outage do not create an unsolicited message.
Each outage episode and notification has a distinct stable retry identity.

The state is committed and fsynced as `sending` **before** asking Slack to send.
Only an accepted provider receipt advances the schedule. A timeout or incomplete
response becomes `uncertain`; a process restart finding `sending` does the same.
Uncertainty blocks further messages, including recovery, until an operator
reconciles the outcome. Stable client IDs aid lookup; they do not establish
exactly-once Slack delivery. A definite permanent rejection is `blocked`, not an
infinite retry loop. Health checks continue in either state.

## Locks, clocks and recovery

The helper acquires `stateFile + .lock` exclusively before reading state or
making network calls. Another invocation cannot run concurrently. A lock is
never stolen based on age. After a crash, inspect its PID and process start
context, confirm that no invocation is running, and preserve the private state
before manually clearing the stale lock. Do not delete an active lock.

If persisted timestamps are in the future relative to the local clock, stop and
correct/reconcile the host clock; do not reset the file to force another alert.
Unknown/legacy state formats also fail closed. There is no silent migration from
the preliminary unversioned helper because it cannot prove whether Slack already
accepted its last message.

For `uncertain`, inspect the configured operator's Slack history using the
stored notice ID and time. Record whether the notification was accepted before
correcting private state. Preserve `outageSince`, accepted-message history and
the stable notice ID; do not reset to an empty state or change the recipient as
a retry shortcut. For `blocked`, resolve the private token/recipient permissions
and review the pending message before explicitly releasing it. These are
operator recovery actions, not automatic behavior of this helper.

Exit code `0` means a healthy observation with no delivery uncertainty/block;
`1` means unhealthy; `2` means blocked/uncertain delivery, invalid configuration,
state, time or lock. Standard output contains only health/delivery flags; errors
are generic and omit secret values. The host scheduler must surface persistent
exit code `2`, otherwise a stale lock could become another quiet failure.

To stop new checks and messages, disable the separately installed schedule.
Retain private state for audit and later continuation. Already accepted messages
cannot be recalled by disabling scheduling. A host unable to reach both the
dashboard and Slack needs a separately managed host-health alert; this helper
cannot notify through an unavailable provider.

## Validation status

Unit tests use temporary private files and injected health/delivery adapters.
They cover wrong owner/mode, symlinks, concurrent/stale locks, timestamp limits,
backlog, clock rollback, write-before-send, restart uncertainty, daily bounds,
distinct episodes and recovery retry. No real Slack call or scheduler mutation
is part of these tests. A host installation and live end-to-end observation must
be reported and verified separately.
