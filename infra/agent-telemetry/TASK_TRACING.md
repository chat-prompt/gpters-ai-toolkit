# Task tracing for agent runtimes

A task is one bounded job, not an entire gateway process or a conversation inferred
from overlapping timestamps. The source collector retains its existing identity
and credential. This optional protocol works with OpenClaw, Hermes, Claude Code
and Codex when their job dispatcher passes the same task context to child commands.

## Start a bounded job

Use the installed repo-built CLI (0.7.14 or later) to wrap one command:

```sh
"$NODE" "$CLI" agent-task run --agent "$AGENT" --source "$SOURCE" -- <runtime-command> <arguments>
```

This creates a random task ID, journals the start, passes `AITK_TASK_ID`,
`AITK_TASK_AGENT`, `AITK_TASK_SOURCE` to the child, and records its exit outcome.
The wrapper does not log the command, arguments or output. Existing runtime
attribution flags/isolated homes still apply. Do not wrap a persistent gateway as
one task. Update each runtime's private job entry point; installing AITK alone
does not instrument existing gateway jobs. Absolute paths to an older AITK binary
must also be updated in that private entry point.

AITK search/get calls in the child automatically record API attempts and outcomes.
Skill execution reporting has its own **execution-report** phase: successful report
submission is not successful execution. Searches skipped explicitly use
**search-skip**. MCP tools invoked outside this CLI require the runtime to emit the
corresponding event; there is no automatic interception of every runtime tool.

For work spanning separate tool processes, start once, retain the returned IDs in
private job state, and pass the same context explicitly for every command:

```sh
"$NODE" "$CLI" agent-task start --agent "$AGENT" --source "$SOURCE"
# Use the returned taskId, not a person name, channel ID or request text.
AITK_TASK_ID="$TASK_ID" AITK_TASK_AGENT="$AGENT" AITK_TASK_SOURCE="$SOURCE" \
  "$NODE" "$CLI" search 'generic task query'
```

## Verification, delivery and other evidence

Only report a successful verification after the actual check finishes. Delivery
requires a gateway/transport acknowledgment, not an answer appearing in a transcript.
Runtime adapters or the operating agent can emit structured evidence:

```sh
"$NODE" "$CLI" agent-task event --agent "$AGENT" --source "$SOURCE" \
  --task-id "$TASK_ID" --event-id "$EVENT_ID" --attempt-id "$ATTEMPT_ID" \
  --parent-event-id "$PREVIOUS_EVENT_ID" --phase verification --status succeeded
```

Supported phases: task, search, search-skip, skill-load, tool, execution,
execution-report, verification, delivery, read-guard, compaction.
Statuses: started, succeeded, failed, skipped, unknown.
Explicit events are labeled **self-reported** even if the agent says they were
verified. API and process outcomes have separate evidence labels. Missing stages
remain unknown. Repeat the same event ID for a retransmission; create a new attempt
ID for a retry, linking its predecessor with parent-event-id when known.

Optional numeric metrics: `--context-input-tokens`, `--tool-result-chars`,
`--read-guard-denied-count`, `--compaction-count`. Leave unavailable metrics absent;
do not substitute zero. Never include prompts, responses, tool arguments, paths,
user identities, credentials, Slack IDs or arbitrary error text. Unit names are
explicit; characters and tokens are not interchangeable.

## Collection and inspection

The private journal is scoped to agent/source, mode0600 in a private directory.
The existing scheduled collector sends at most500 complete events per batch and
advances its journal offset only after server acknowledgment. Partial trailing
writes wait for the next run. A malformed journal or unexpected replacement stops
advancement; preserve it and diagnose, rather than resetting and recounting.
The server stores events in the existing batch collection JSON. The dashboard
deduplicates event IDs within an authenticated agent/source and shows the latest100
tasks in the selected period, with failure filtering and comparison. No DB schema
migration is required. Unattributed task token totals stay null; batch usage is not
allocated to tasks by time overlap. Runtime versions not observed remain unknown;
collector versions identify the collection build, not the runtime or skill version.

Deploy the compatible server contract before upgrading collectors to0.7.14.
Legacy batches without taskEvents remain supported. Do not downgrade a collector
while a batch containing new fields is pending. A runtime that has not adopted
this job protocol continues aggregate collection but has no task timeline.

## Acceptance

For each runtime, run an authorized small real task and compare the same task ID
in its local journal, acknowledged batch and AX → Agent activity → Task timeline.
Check a failed/retried step, the evidence labels and missing-delivery state. Confirm
that raw content and other agents' records are absent. Observe a subsequent
scheduled batch independently before declaring continuous collection verified.
