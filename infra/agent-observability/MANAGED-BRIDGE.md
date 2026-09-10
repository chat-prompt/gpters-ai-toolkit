# Opt-in managed observation bridge

This is repository code preparation. It does not establish a live installation,
source approval, successful upload, or scheduler coverage. Follow the
[rollout protocol](../agent-telemetry/PROTOCOL.md) before changing a managed host.
No model settings, runtime tool permissions, agent instructions or authentication
are changed by the bridge. The existing collector enrollment authorizes upload;
report submission credentials are a separate surface and are not needed here.

## Build and validate locally

Use the approved full repository commit and its locked dependencies. Build a
self-contained helper with Bun, then record the printed SHA256 in private config:

```sh
sh infra/agent-observability/build-bridge.sh /private/operator/observation-artifact
pnpm --filter @gpters/aitk build
pnpm --filter @gpters/aitk test -- tests/agent-telemetry/observability.test.ts
```

The test command uses only anonymous temporary files, child processes and mocked
HTTP. It builds and executes the actual helper; it does not install a collector
or contact a server. The helper can also be smoke-tested without any source files:

```sh
printf '%s' '{"agentId":"example-agent","source":"openclaw","window":{"startUtc":"2026-01-02T00:00:00.000Z","endUtc":"2026-01-03T00:00:00.000Z"}}' | node /private/operator/observation-artifact/observation-bridge.mjs
```

This last result should report native CLI metrics as `unsupported` and missing
runtime/read-guard inputs as `uncollected`. It is a synthetic artifact check, not
evidence of an agent observation.

## Private configuration

Both the selected scheduled Node executable and collection process must use
Node24+. This requirement applies only when creating a new opt-in observation
batch; ordinary collector compatibility remains unchanged. Store private config
as an owned regular file with mode 0600. Its parent and the helper parent must be
owned by the executing account, without group/world writes or symlink ancestors.
Use absolute canonical paths. The helper must be an owned regular file without
group/world writes and must match the approved SHA256. A helper hash is a trust
pin, not a sandbox: approve the bundled source before pinning it.

```json
{
  "version": 1,
  "agentId": "example-agent",
  "source": "codex",
  "helperPath": "/private/operator/observation-artifact/observation-bridge.mjs",
  "helperSha256": "<SHA256 printed by the build>",
  "cliFiles": [
    {"path":"/private/operator/approved-sessions/session.jsonl","sessionKey":"opaque-session-key","completeFromStart":false}
  ],
  "readGuardFiles": [],
  "runtimeBindings": [],
  "runtimeRecords": []
}
```

These paths and identities are placeholders. Keep real inventory, owners,
configuration, raw records and rollout evidence private. Configuration is bounded
to 240000 bytes; helper source to 2000000 bytes; each inventory to 500 entries. The
window comes from the collector's next batch and cannot be overridden by config.
Agent/source must match the existing collector exactly.

CLI source files must stay inside the existing collector's sessions directory.
Claude files must also belong to its approved project slug. Codex observations
must contain matching `session_meta` thread source and/or approved cwd, with every
`turn_context` remaining in scope. Each physical file must start with its own matching identity header; missing
headers or mixed-scope files fail closed before cross-file deduplication. Giving
a headerless fragment the same sessionKey as an authorized file does not authorize
it. Do not manufacture headers for retained fragments; exclude those fragments
or leave CLI inventory empty until an independently scoped source is available. Native OpenClaw/Hermes session formats do not become Codex metrics merely
because the model provider is Codex.

A read-guard file is eligible only when an operator has established that the log
is exclusive to this agent and records `agentExclusive:true` in its file entry.
This is an explicit private inventory attestation, not independent verification
by the helper. A shared global hook log must not be attested as exclusive; its
other sessions would otherwise be wrongly attributed. First-turn completeness
and rotated sessionKey mappings likewise require operator verification. Source
file ownership and runtime binding authenticity are the approved inventory's
responsibility; file contents are not interpreted as authorization.

Runtime records are optional static snapshots supplied by a private adapter with
exact task/attempt/run bindings. The bridge does not poll scheduler, process or
Slack APIs, discover new agents, or infer successful delivery from model text.
An adapter that refreshes these snapshots still requires separate implementation
and rollout approval. Empty inputs honestly remain uncollected.

## Enablement and retry boundary

After operator review, `collect` and `install` accept
`--observability-config /absolute/private/config.json`. `upgrade` preserves the
installed value unless explicitly changed with that option or removed with
`--disable-observability`. The scheduler uses the recorded installation value.
An explicit upgrade option revalidates even an otherwise current installation.
These commands describe a future controlled rollout; do not run them on a live
host as part of local code verification.

The collector enriches only a newly created batch, validates the canonical schema
inside the pinned helper, then saves the complete pending batch before upload.
Upload uses the existing telemetry token and server validation. Server acceptance
advances the checkpoint under the existing acknowledgment rule.

Existing pending data is always retried unchanged: no config read, hash/version
check, source reread or enrichment happens, even if it predates the bridge.
Never patch a pending batch or reuse its batch ID with changed content. Flush it
before changing the managed installation. Disabling the feature does not strip
observations already frozen into pending data.

Config, hash, Node version, scope, child-process or schema errors fail the new
collection closed: no new pending batch, upload or checkpoint advance. Approved
missing/partial files produce explicit `incomplete` provenance when the helper
can represent the missingness; unsupported/uncollected states are retained.
They are not silently dropped. Child execution is limited to 30 seconds,
512000 stdout bytes and 64000 stderr bytes. Stderr and local file errors are never
included in CLI failure output or telemetry. Only verified helper bytes execute,
so replacing its pathname after verification cannot run replacement code.

Opt-in runs acquire an exclusive per-checkpoint `.observation.lock` covering
collection, pending persistence, upload and acknowledgment. A competing or stale
lock stops without upload or checkpoint change. No stale lock is auto-deleted:
an operator must verify that its owning process is gone before recovering it.
Never remove an active lock. Dry run creates a private checkpoint directory and
temporary lock but writes no checkpoint and makes no upload. Ordinary unconfigured
collectors do not participate in this optional lock; do not mix old/unconfigured
and enabled writers against the same checkpoint during rollout.

Track separately: artifact validated, inventory approved, local observation
verified, collector installed, server sidecar verified, scheduled sidecar seen.
