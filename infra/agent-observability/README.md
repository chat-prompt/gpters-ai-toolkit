# Optional agent observation adapters

These repo-built, read-only helpers prepare `collection.observability`. They do
not install a collector, modify a runtime, send a batch, advance a checkpoint,
or establish that any live agent has enabled these capabilities. Existing
collector schedules continue unchanged until their integration is separately
reviewed and installed under the [rollout protocol](../agent-telemetry/PROTOCOL.md).

The optional [managed bridge](MANAGED-BRIDGE.md) adds a pinned helper to new
collector batches only after explicit installation configuration. Its default is
disabled. The offline commands below do not enable it.

## Local use

Use Node24+ and the repository's installed dependencies for schema validation.
The metrics and runtime adapters themselves use only Node built-ins.

```sh
node infra/agent-observability/collect.mjs --config /private/operator/observation.json > /private/operator/observation-output.json
node infra/agent-observability/enrich-batch.mjs --batch /private/operator/batch-copy.json --observation /private/operator/observation-output.json > /private/operator/batch-review.json
node --test infra/agent-observability/*.test.mjs
node --import tsx --test infra/agent-observability/contract.test.mts
```

Input config (anonymous paths; keep real inventory private):

```json
{
  "agentId": "example-agent",
  "source": "claude-code",
  "window": {"startUtc":"2026-01-02T00:00:00.000Z","endUtc":"2026-01-03T00:00:00.000Z"},
  "cliFiles": [{"path":"/private/agent/session.jsonl","sessionKey":"local-session-key","completeFromStart":true}],
  "readGuardFiles": [{"path":"/private/agent/read-guard.jsonl","sessionKey":"local-guard-stream"}],
  "runtimeBindings": [],
  "runtimeRecords": []
}
```

The operator explicitly supplies every file. `sessionKey` identifies one source
session across rotation and aliases; it is never uploaded. Use distinct keys for
different sessions. `completeFromStart:true` is an inventory assertion that the
listed parts cover the complete session history, including before the requested
window. Do not set it when only retained fragments are available. Ownership and
source isolation must already be established; this helper does not infer ownership
from filenames, a shared cwd, or concurrent timestamps. No paths are discovered
from HOME and no auth/config files are read implicitly.

The enrichment helper validates the canonical schema, exact agent/source/window,
and receipt time against `collectedAtUtc`; it returns a copy. It does not validate
all existing batch fields or authorize the sender. The normal server batch
validator still performs those checks. Never rewrite a managed pending batch or
reuse its ID with different content; this command is for local review only.

## Supported metrics and missingness

- Claude: assistant `message.usage` input + cache creation + cache read; repeated
  message IDs prefer a completed snapshot, then the greater context token count.
  Codex: `event_msg/token_count/info.last_token_usage.input_tokens`, already
  inclusive of cache. Repeated cumulative token totals are deduplicated.
- First-turn input samples are included only when the first usage in the complete
  session lies in `[start,end)`. A session's first record in a reporting window
  is not automatically its first turn. Partial history marks this metric incomplete.
  Adapter version `3` attests complete history for dynamically discovered Claude
  sessions when, among every scanned file carrying that session ID, exactly one is
  a main thread (its first uuid record is not a sidechain), that file is selected
  for the window and self-contained (its first uuid record has `parentUuid:null`
  and is not a compact summary, and every `parentUuid` resolves inside the file),
  and every other file starts as a sidechain (subagents). Anything else, and every
  Codex session, stays unproven. Version `3` first-turn numbers are not comparable
  with version `2`, which never attested dynamic sessions.
- Peak context is the maximum observed in-window input per session, not lifetime
  peak. Histograms merged across windows describe *session-window peaks*. They
  must not be presented as distinct-session lifetime peaks.
- Tool result text counts Unicode code points; structured images/base64 blocks
  are excluded. Claude `tool_result` and Codex `function_call_output` /
  `custom_tool_call_output` are supported. IDs deduplicate repeated results;
  different values for the same result ID mark the source incomplete.
- Compaction counts recognize Claude `system/compact_boundary` and Codex
  `compacted` or `event_msg/context_compacted`. Other formats are not guessed.
- Read-guard supports ISO `ts` plus `decision:allow|deny`. Only counters leave the
  host; paths, tool inputs, session keys and content are excluded. An existing
  empty guard log yields observed zero; missing files yield null. Numeric epoch
  units and unrecognized decisions remain incomplete.
  A shared guard log (one hook log for every session on the account) is read only
  with `sessionFilter:"installed-scope"`: rows whose `session` is one of the Claude
  session IDs found in this collector's installed scope count; other sessions'
  decisions and times are never interpreted, but every line is parsed, so a damaged
  line anywhere marks the metric incomplete. `<path>.1` (the hook's rotated copy)
  is read too when present, and a row in both counts once. Both paths are
  identified before and after reading. An append or a rotation in between is
  retried (three attempts); if it keeps changing, it is the timing reason
  `source-changed` (the window is sent without observation, never a partial count).
  A hook only appends, so a symlink, a non-file, a shrink, or any change to bytes
  already read (re-hashed through the handle that read them, so a rotation right
  after cannot hide it, and whatever the timestamps say) fails closed. A prefix
  that keeps changing while re-hashed proves nothing either way and is timing. A
  rewrite that happens before the bytes are read cannot be told from the file's
  state and is simply read. Session IDs stay inside the helper.
- Boot-file health (adapter version `3`, Claude/OpenClaw only) reads OpenClaw's
  agent database read-only (`bootstrapReports.path`, `node:sqlite` with
  `readOnly`). Each session's latest `systemPromptReport` generated inside
  `[start,end)` for the `claude-cli` provider counts once: snapshots, truncated,
  near-limit and warning snapshots, the largest injected file's characters (max and
  latest) and the per-file limit. No file name or path leaves the host. OpenClaw
  keeps only a session's newest report, so a boot replaced before its window is
  collected is not counted. A busy or locked database, or more than 5,000 selected
  rows (this runtime's reports in the window plus unreadable ones), is `incomplete`
  with null. A row that is null or not valid JSON marks the value incomplete. The
  helper reads only the file the collector approved (device, inode, owner), checked
  before and after the query on every exit path, a busy one included. The row limit
  does not bound query time: the table is small (466 rows, about 1MB, a 3ms scan on
  2026-09-22), but a much larger one could reach the helper's 30-second limit and
  fail the window closed; re-measure if OpenClaw's session table grows. A report of this provider whose time or
  numbers do not have the established shape marks the value incomplete; reports of
  other providers are skipped. A path that changed since the collector checked it,
  a missing table or any other database error fails closed. If OpenClaw renames the
  provider, its reports read as another runtime's and the count drops to zero —
  re-check the provider name when OpenClaw is upgraded.
- Hermes and OpenClaw CLI metrics are explicitly unsupported. Their exact-bound
  normalized runtime receipts remain usable. A provider named Codex does not
  establish the Codex JSONL format.

Missing/unsupported sources return null. Recognized complete sources with no
matching in-window activity return zero counts or empty histograms. Partial
sources may return observed lower bounds with `incomplete` capability; never
compare those as complete totals. Metadata-only CLI files stay uncollected.
Capabilities exist both per source adapter and per metric.

Histograms have fixed inclusive upper bounds and an overflow bucket, plus count,
sum, min/max. Sum bucket counts to merge compatible nonoverlapping observations;
never average percentiles. Quantiles derived from buckets are approximate.
Repeated windows must be deduplicated by the surrounding authenticated batch
pipeline, since this stateless helper deliberately keeps no hidden checkpoint.

Files are opened read-only. Each read checks inode, size and modification time;
a concurrent replacement/truncation is incomplete, never silently accepted. For
dynamically discovered files, growth of the same regular file (same inode, not
shrunk, discovery-time prefix hash unchanged) is reported as the timing reason `source-changed` so the managed collector
can omit that window's observation instead of dropping the usage batch;
replacement, truncation and path changes stay scope failures (see `MANAGED-BRIDGE.md`).
The default per-file limit is64MiB. Oversize input is rejected as incomplete;
partition it into reviewed complete parts rather than silently dropping history.
An incomplete final line is excluded and marks parse failure. Exact source/session
record fingerprints deduplicate replayed rotated records; inherently identical
records without unique event IDs cannot be distinguished from replay. No raw
record or filename is returned in provenance.

## Exact runtime receipt integration boundary

A private adapter must create a binding **when it launches a specific runtime
run**, retaining `{agentId,source,runtimeRunId,taskId,attemptId}`. An optional
`expectedDeadlineUtc` is copied only if this exact binding actually has one.
Do not assign a task by matching a nearby timestamp, a thread title, or the latest
active task. Ambiguous run bindings fail; absent/wrong-source bindings stay unmatched.

Supported normalized input records have the same agent/source/run ID, an opaque
local `receiptId`, ISO `atUtc`, and one of these explicit formats:

| Format | Required observed fields | Result means |
| --- | --- | --- |
| `scheduler-v1` | `status:ok|error|unknown` | Scheduler completion only |
| `process-v1` | `exitCode` or `signal` | Process exit only |
| `slack-api-v1` | Exact invocation's `response.ok`; success also needs returned `channel` and `ts` | Slack API accepted a message; no recipient read claim |

These are adapter contracts, not assertions that a particular OpenClaw/Hermes
version already emits this shape. Runtime-specific interception/reading of actual
receipts and persisted task binding is still required before enabling scheduled
collection. A human or agent saying “sent” is self-report; it must use the existing
self-reported task event path and cannot be promoted to `slack-api-v1` without the
corresponding observed API response. A scheduler `ok` never becomes process success.
No normalized receipt asserts whole-task completion, verified correctness, or that
a human received/read a message. Failed Slack API replies remain failed API claims.

The output uses a deterministic UUID scoped by agent/source/run/receipt kind/ID,
with no raw run, channel, message timestamp, payload or error text. Replay is
idempotent; conflicting observations for one receipt ID are excluded and mark
incomplete. Maximum500 receipts per window; exceeding it fails instead of truncating.
The canonical schema is in
`packages/lib/src/features/ax/agent-observability-contract.ts` and validates strict
allowlisted fields, mergeable histogram invariants and claim/evidence relationships.
The authenticated server must additionally enforce scope/window equivalence and
receipt timestamps no later than batch collection time.

## Read-only dashboard projection

`observation-trends.ts` validates stored sidecars again against batch agent,
source, window and collection time. `/api/ax/agent-observations` requires an
internal admin session, strict query filters and a private no-store response.
The query supports7/30/90days, optional agent/source and historical end time.
Comparison requires an explicit exact stream, change time and duration in hours;
its adjacent before/after windows must both fit within the selected range.

Identical metric windows are deduplicated within each agent/source/adapter group.
Conflicting windows and every member of an overlapping cluster are excluded.
A stream cap of50, a raw row cap of20000 and a detail point cap of200 are disclosed
separately. Group summaries use all accepted nonoverlapping rows, not just the
last200 detail points. Raw-row truncation or invalid/overlapping observations
prevents complete-comparison claims.

Comparisons show mean differences from mergeable histogram sums/counts, or count
differences for equal durations. A difference is only calculated with supported
non-null metrics, positive sample counts and continuous full interval coverage.
Batch windows crossing a comparison boundary cannot be split from aggregates:
the resulting comparison remains incomplete. This can occur for hourly batches
whose actual boundaries drift; no interpolation or prorating is applied. Samples
for count metrics mean observed collection windows, not individual events.
No comparison asserts that a change caused an effect. The first-turn sample
caveat and session-window peak semantics above also apply to the dashboard.

Adapter version 3 may carry optional **boot-file health** (`metrics.bootstrap` with
`metricCapabilities.bootstrap`): numbers only — boot snapshots in the window,
snapshots with a truncated / near-limit file or a truncation warning, and the
largest injected file's characters (window maximum and latest) against the
per-file limit. Windows merge it by sum (counts), maximum and latest snapshot,
never by adding sizes; rows written before it existed simply lack it. A batch may
instead carry `collection.observabilityFailure` (`source-changed` or
`partial-tail`) when the collector sent the window without observability; the
projection counts those per agent/source/reason by unique batch
(`coverage.observationFailures`) so an omitted window is never shown as an observed
zero; `coverage.observationFailureTotals` gives unique failed windows per
agent/source regardless of reason. The panel shows both as one line per stream,
and failures of an agent/source with no observation card as their own block.
The server accepts these fields first; the collector starts sending
`observabilityFailure` and adapter version 3 only in the following change, after
this server is deployed (until then the CLI reports the reason locally only).

`AgentObservationPanel` is registered in the admin dashboard. The authenticated
projection can show compatible saved observations; it does not prove that a live
agent has enabled the sidecar. Local browser visual verification remains required
when changing the panel. The opt-in managed bridge is implemented, while actual
scoped host activation and natural scheduled observations require separate verification.

For the exact current readiness boundaries, private config/offline commands,
managed bridge rollout acceptance criteria, and the default-off independent deadline
registration path, follow the rollout protocol's
[optional runtime observations](../agent-telemetry/PROTOCOL.md#optional-runtime-observations-preparation-versus-live-collection)
section. Helpers alone do not enable scheduled sidecars or complete
missing-delivery detection.

See [explicit task expectations](TASK-EXPECTATIONS.md) for pre-execution registration
and missing-receipt detection when no runtime event is emitted.
