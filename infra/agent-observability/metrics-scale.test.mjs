import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectCliMetrics } from './metrics.mjs'

const window = { startUtc: '2026-01-02T00:00:00.000Z', endUtc: '2026-01-03T00:00:00.000Z' }
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'observation-metrics-scale-'))
  const path = join(root, 'anonymous.jsonl')
  try { await run(path) } finally { await rm(root, { recursive: true, force: true }) }
}
const context = path => ({ source: 'claude-code', files: [{ path, sessionKey: 'anonymous-session', completeFromStart: true }], window })

test('a supported-size session with 150,000 usage records computes its window peak without argument spread', () => fixture(async path => {
  const count = 150000
  const file = await open(path, 'w')
  const row = (id, input_tokens, timestamp = window.startUtc) => JSON.stringify({ type: 'assistant', timestamp,
    message: { id, stop_reason: 'end_turn', usage: { input_tokens } } }) + '\n'
  try {
    // Bound fixture-generation memory independently of the reader under test.
    for (let first = 0; first < count; first += 1000) {
      let chunk = ''
      for (let i = first; i < first + 1000; i++) chunk += row(String(i), i)
      await file.write(chunk)
    }
    await file.write(row('outside-window', count * 2, window.endUtc))
  } finally { await file.close() }
  assert.ok((await stat(path)).size < 64 * 1024 * 1024)
  const result = await collectCliMetrics(context(path))
  assert.equal(result.capability, 'supported')
  assert.equal(result.provenance.recordsRead, count + 1)
  assert.equal(result.metrics.peakContextTokens.count, 1)
  assert.equal(result.metrics.peakContextTokens.max, count - 1)
  assert.equal(result.metrics.firstTurnTokens.min, 0)
}))

test('tool-result characters preserve Unicode code-point, empty and block semantics', () => fixture(async path => {
  const cases = [
    ['', 0],
    ['plain', 5],
    ['한글', 2],
    ['😀𐐀', 2],
    ['e\u0301', 2],
    ['\ud800x\udc00', 3],
    [[], 0],
    [[{ type: 'image' }, { type: 'input_image' }], 0],
    [[{ type: 'text', text: '한😀' }, { type: 'image', text: 'ignored' }, { type: 'text', text: '' }, { type: 'text', text: '\ud800' }], 3],
    [[{ type: 'input_text', text: '한😀' }, { type: 'input_image', image_url: 'ignored' }, { type: 'text', text: 'e\u0301' }], 4],
  ]
  for (const [content, expected] of cases) {
    await writeFile(path, JSON.stringify({ type: 'user', timestamp: window.startUtc,
      message: { content: [{ type: 'tool_result', tool_use_id: 'result', content }] } }) + '\n')
    const result = await collectCliMetrics(context(path))
    assert.equal(result.capability, 'supported')
    assert.equal(result.metrics.toolResultChars.count, 1)
    assert.equal(result.metrics.toolResultChars.sum, expected)
  }
}))

test('Codex typed input_text outputs contribute their actual characters', () => fixture(async path => {
  await writeFile(path, JSON.stringify({ type: 'response_item', timestamp: window.startUtc,
    payload: { type: 'custom_tool_call_output', call_id: 'typed-output', output: [
      { type: 'input_text', text: 'a'.repeat(47) },
      { type: 'input_text', text: 'b'.repeat(23775) },
    ] } }) + '\n')
  const result = await collectCliMetrics({ ...context(path), source: 'codex' })
  assert.equal(result.capability, 'supported')
  assert.equal(result.provenance.unsupportedRecords, 0)
  assert.equal(result.metrics.toolResultChars.count, 1)
  assert.equal(result.metrics.toolResultChars.sum, 23822)
}))

test('unknown or malformed tool output blocks are incomplete rather than measured as zero', () => fixture(async path => {
  for (const output of [
    [{ type: 'future_output', text: 'unrecognized' }],
    [{ type: 'text' }],
    [{ type: 'input_text', text: 42 }],
    [null],
    [{ type: 'input_text', text: 'valid' }, { type: 'future_output' }],
  ]) {
    await writeFile(path, JSON.stringify({ type: 'response_item', timestamp: window.startUtc,
      payload: { type: 'custom_tool_call_output', call_id: 'invalid-output', output } }) + '\n')
    const result = await collectCliMetrics({ ...context(path), source: 'codex' })
    assert.equal(result.capability, 'incomplete')
    assert.equal(result.metricCapabilities.toolResultChars, 'incomplete')
    assert.equal(result.provenance.unsupportedRecords, 1)
    assert.equal(result.metrics.toolResultChars.count, 0)
  }
}))

test('a large Unicode tool result remains an exact code-point count', () => fixture(async path => {
  const repetitions = 1024 * 1024
  await writeFile(path, JSON.stringify({ type: 'user', timestamp: window.startUtc,
    message: { content: [{ type: 'tool_result', tool_use_id: 'large-result', content: '한😀'.repeat(repetitions) }] } }) + '\n')
  const result = await collectCliMetrics(context(path))
  assert.equal(result.capability, 'supported')
  assert.equal(result.metrics.toolResultChars.sum, repetitions * 2)
}))
