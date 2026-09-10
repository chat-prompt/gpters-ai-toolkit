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
Healthy requires a successful HTTP response, `healthy: true`, and a valid
`lastSuccessAt` from zero to fifteen minutes old. An empty backlog remains healthy.
For a nonempty backlog, `oldestUnprocessedAt` must be a valid server-created batch
timestamp no more than fifteen minutes old, and `deferredBacklog` must be zero.
This tolerates normal arrivals between five-minute cron runs, without requiring
an always-empty queue. Client event/window timestamps do not establish queue age.
A pending batch older than fifteen minutes or any quarantined/deferred pending
batch remains unhealthy even when the scheduler is running recently. Unknown age,
unknown deferred count for nonempty queues, invalid/future timestamps, stale runs,
HTTP errors and network failures also remain unhealthy. Old endpoints lacking
queue-age metadata are compatible only while their backlog is zero. Deploy the
server metadata before installing the updated watchdog; an older watchdog still
requires an empty backlog.

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

## Prepare a pinned host installation

`build-watchdog.sh` requires a clean checkout at an approved full commit. Its
output is an ESM bundle plus `build.json` containing the source revision and SHA256.
The digest is an integrity check; the operator must still review and approve the
source revision. The build does not install a scheduler or contact Slack.

```sh
sh infra/agent-observability/build-watchdog.sh "$PRIVATE_BUILD" "$REVISION"
```

Prepare an owned real mode0700 installation prefix and state directory. Create
the configuration above as a mode0600 file through an approved private channel.
Use an explicitly reusable Slack app bot credential with permission to open the
approved operator DM and post messages (`im:write`, `chat:write`); do not extract a
connector OAuth token or substitute a shared webhook. The separate health-only
secret belongs in this configuration, never the execution cron secret. Confirm
the app workspace and operator identity before activation.

Create a mode0600 installation JSON with the following anonymous fields:

```json
{
  "bundle": "/private/build/watch-monitor.mjs",
  "sha256": "<64 lowercase hex digest from the reviewed build>",
  "revision": "<40 lowercase hex approved source revision>",
  "node": "/absolute/canonical/path/to/node",
  "config": "/private/watchdog/config.json",
  "prefix": "/private/watchdog/releases",
  "platform": "darwin"
}
```

Use Node22 or newer. Resolve the stable executable to its canonical path first;
package-manager upgrades must not silently redirect a scheduled binary. Never
use the package-manager's cleanup command to remove this binary while scheduled.
`platform` accepts `darwin` or `linux`.

```sh
node infra/agent-observability/watchdog-service.mjs prepare "$PRIVATE_INSTALL_JSON"
node infra/agent-observability/watchdog-service.mjs verify "$RELEASE_DIR"
```

Preparation copies the digest-checked bundle into a new immutable revision
directory, writes a private manifest and renders schedule files. Existing release
directories are never overwritten, including an interrupted installation. Verify
checks bundle/schedule digests, private config permissions and the pinned Node
path. Neither command reads runtime data, makes network requests, runs a bundle,
enables schedules or proves live health. Treat verification as `prepared` only.
Retain any interrupted release for inspection before manually removing it.

## Activation and rollback after operator notice

Before activation, report host, approved revision/digest, config location without
values, explicit recipient, five-minute interval and these rollback commands.
Run the bundle once only after this notice: an unhealthy check can immediately
send a real DM. Verify a healthy observation and its private state first. A
read-only app credential preflight and a healthy check do not prove DM delivery;
any live test notification must be explicitly included in the rollout notice.
Never simulate an outage in the production state just to force a test message.

On macOS, the prepared plist uses the dedicated
`org.gpters.ax-monitor-watchdog` label. After confirming no service already owns
that label, use the current approved user's GUI domain:

```sh
launchctl bootstrap "gui/$(id -u)" "$RELEASE_DIR/org.gpters.ax-monitor-watchdog.plist"
launchctl print "gui/$(id -u)/org.gpters.ax-monitor-watchdog"
# Stop new checks/messages; retain release, config and state.
launchctl bootout "gui/$(id -u)/org.gpters.ax-monitor-watchdog"
```

The plist is loaded from its private release; it is deliberately **not** copied
into `~/Library/LaunchAgents`. This avoids silently promising restart persistence.
A GUI LaunchAgent stops on logout and this manual bootstrap does not re-register
it after reboot. A continuously logged-in host can verify the pilot's natural
interval; a separately approved startup installation is needed before claiming
restart persistence. Check host sleep settings and power/network availability.
The generated stdout/stderr logs contain flags only; the operator must arrange
log rotation and a separate host/scheduler-failure alert before declaring full
unattended coverage. A persistent lock, exit code2 or an offline host cannot be
reported by a watchdog that is no longer executing.

For Linux, link the prepared `.service` and `.timer` into the approved user's
systemd configuration and enable **only** the dedicated timer. Inspect existing
unit ownership before linking; never overwrite another unit. Enabling user
lingering is a separate privilege/host-lifecycle change and is not performed by
the installer. The explicit start/stop commands are:

```sh
systemctl --user link "$RELEASE_DIR/org.gpters.ax-monitor-watchdog.service" "$RELEASE_DIR/org.gpters.ax-monitor-watchdog.timer"
systemctl --user enable --now org.gpters.ax-monitor-watchdog.timer
systemctl --user status org.gpters.ax-monitor-watchdog.timer
# Stop timer first, then any running one-shot service.
systemctl --user disable --now org.gpters.ax-monitor-watchdog.timer
systemctl --user stop org.gpters.ax-monitor-watchdog.service
```

Stopping an in-flight invocation may leave `sending` or its lock; inspect and
reconcile before restarting. It does not undo a message Slack already accepted.
For binary rollback, stop the dedicated schedule, verify the prior release and
re-register its schedule using the **same** state/config. Do not clear pending
state or switch recipients to make a retry appear clean.

After installation, wait at least one full five-minute interval without running
an extra check. Independently match the persisted `checkedAt`, healthy flag and
scheduler last exit with the central heartbeat. Report `scheduled-observed` only
when that natural run is seen. Record DM API acceptance separately; never call a
healthy no-message run a verified notification delivery.

Offline installer tests (temporary files only):

```sh
node --test infra/agent-observability/watchdog-service.test.mjs
```
