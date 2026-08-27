import { randomUUID } from 'node:crypto'
import { writeFile, readFile } from 'node:fs/promises'

const serverUrl = process.env.AITK_SERVER_URL ?? 'http://host.docker.internal:3002'
const token = process.env.GPTERS_TOKEN
const skillId = process.env.TEST_SKILL_ID ?? 'local-skill-60'
const attemptId = process.env.ATTEMPT_ID ?? randomUUID()
const startEventId = process.env.START_EVENT_ID ?? randomUUID()
const eventId = process.env.EVENT_ID ?? randomUUID()

if (!/^http:\/\/(host\.docker\.internal|127\.0\.0\.1|localhost)(:\d+)?$/.test(serverUrl)) {
  throw new Error('The isolated test agent only accepts a local HTTP server URL')
}
if (!token) throw new Error('GPTERS_TOKEN is required')

const endpoint = `${serverUrl}/api/mcp`
const baseHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
let requestId = 0

async function rpc(method, params, sessionId) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: sessionId ? { ...baseHeaders, 'Mcp-Session-Id': sessionId } : baseHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.json()
  if (!response.ok || body.error) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
  }
  return { result: body.result, response }
}

async function callTool(sessionId, name, args) {
  const { result } = await rpc('tools/call', { name, arguments: args }, sessionId)
  if (result?.isError) {
    const message = result.content?.[0]?.text ?? `${name} failed`
    throw new Error(message)
  }
  return result
}

const { response: initializeResponse } = await rpc('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'ax-isolated-test-agent', version: '1.0.0' },
})
const sessionId = initializeResponse.headers.get('mcp-session-id')
if (!sessionId) throw new Error('MCP initialize did not return a session ID')

const loaded = await callTool(sessionId, 'get_plugin_content', { pluginId: skillId })
const skillDocument = loaded?.content?.[0]?.text ?? ''
if (!skillDocument.includes('AX_LOCAL_TEST_SKILL')) {
  throw new Error('The local verification skill marker was not loaded')
}

const agentId = 'ax-isolated-test-agent'
await callTool(sessionId, 'report_skill_execution_started', {
  eventId: startEventId,
  attemptId,
  source: 'aitk',
  skillId,
  skillVersion: '1.0.0',
  agent: 'test-agent',
  agentId,
  occurredAt: new Date().toISOString(),
})

// A deliberately small, deterministic task: the agent creates an artifact and
// validates it inside its read-only container (only /tmp is writable).
const input = [
  { id: 'alpha', done: true },
  { id: 'beta', done: false },
  { id: 'gamma', done: true },
]
const artifact = {
  total: input.length,
  completed: input.filter((item) => item.done).length,
  pending: input.filter((item) => !item.done).length,
}
const artifactPath = '/tmp/ax-test-agent-result.json'
await writeFile(artifactPath, JSON.stringify(artifact), 'utf8')
const persisted = JSON.parse(await readFile(artifactPath, 'utf8'))
const validationPassed = persisted.total === persisted.completed + persisted.pending
  && persisted.completed === 2
  && persisted.pending === 1
if (!validationPassed) throw new Error('Artifact validation failed')

await callTool(sessionId, 'report_skill_outcome', {
  skillId,
  applied: true,
  summary: '격리 컨테이너에서 상태 요약 산출물을 생성하고 검증함',
})

const executionReport = {
  eventId,
  attemptId,
  source: 'aitk',
  skillId,
  skillVersion: '1.0.0',
  agent: 'test-agent',
  agentId,
  status: 'success',
  failureStage: null,
  errorCode: null,
  validation: {
    method: 'artifact',
    passed: true,
    summary: '전체 3건, 완료 2건, 대기 1건 정합성 확인',
  },
  userAccepted: null,
  occurredAt: new Date().toISOString(),
}

await callTool(sessionId, 'report_skill_execution', executionReport)
// Identical retry proves eventId idempotency without creating a second row.
await callTool(sessionId, 'report_skill_execution', executionReport)

await fetch(endpoint, {
  method: 'DELETE',
  headers: { ...baseHeaders, 'Mcp-Session-Id': sessionId },
  signal: AbortSignal.timeout(15_000),
})

process.stdout.write(`${JSON.stringify({
  success: true,
  agent: 'test-agent',
  agentId,
  skillId,
  attemptId,
  startEventId,
  eventId,
  artifact: persisted,
  duplicateReportSent: true,
})}\n`)
