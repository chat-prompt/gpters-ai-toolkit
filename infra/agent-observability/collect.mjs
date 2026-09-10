#!/usr/bin/env node
/** Read-only repo helper. Config contains private exact source paths; output contains only bounded aggregates. */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { collectObservability } from './collect-core.mjs'
export { collectObservability } from './collect-core.mjs'

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--config') throw new Error('Expected --config')
    const config = JSON.parse(await readFile(process.argv[3],'utf8'))
    process.stdout.write(JSON.stringify(await collectObservability(config))+'\n')
  } catch { process.stderr.write('Observation collection failed; check the private config and source format.\n'); process.exitCode=1 }
}
