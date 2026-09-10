#!/usr/bin/env node
/** Import an approved agent grant into a separate report identity; never use owner auth here. */
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { importAgentCredential } from '../../apps/aitk-cli/src/agent-auth'
import { privateIdentityHome, readReportAgentConfig } from './identity-home'

export async function runReportIdentity(args: string[], input: AsyncIterable<Uint8Array> = process.stdin,
  deps = { importAgentCredential, readAgentConfig: readReportAgentConfig }) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'identity-home': { type: 'string' }, 'credential-stdin': { type: 'boolean' },
    server: { type: 'string', default: 'https://ai-toolkit.gpters.org' },
  } })
  if (positionals.length !== 1 || !['import', 'status'].includes(positionals[0]) || !values['identity-home']) {
    throw new Error('Usage: identity import --identity-home DIRECTORY --credential-stdin | status --identity-home DIRECTORY')
  }
  const home = privateIdentityHome(values['identity-home'])
  if (positionals[0] === 'status') {
    if (values['credential-stdin']) throw new Error('status does not accept a credential')
    return { actor: deps.readAgentConfig(home) }
  }
  if (!values['credential-stdin']) throw new Error('--credential-stdin is required')
  if (deps.readAgentConfig(home)) throw new Error('Report identity already configured; inspect it before making changes')
  const chunks: Buffer[] = []
  let size = 0
  for await (const bytes of input) {
    size += bytes.byteLength
    if (size > 4096) throw new Error('Agent grant exceeds 4096 bytes')
    chunks.push(Buffer.from(bytes))
  }
  let grant: unknown
  try { grant = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new Error('Invalid agent grant JSON') }
  await deps.importAgentCredential(grant, values.server!, home, 'file')
  return { ok: true, actor: deps.readAgentConfig(home) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReportIdentity(process.argv.slice(2)).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(() => {
    process.stderr.write('Report identity operation failed; inspect the private directory and approved grant.\n')
    process.exitCode = 1
  })
}
