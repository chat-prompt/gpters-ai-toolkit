#!/usr/bin/env node
/** Repo-built helper. Reuses agent auth; never reads personal CLI auth. */
import { constants, closeSync, fstatSync, openSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { privateIdentityHome, readReportAgentConfig, readReportAgentToken } from './identity-home'

export function privateJson(path: string): unknown {
  const fd = openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK)
  try {
    const stat=fstatSync(fd)
    if(!stat.isFile() || stat.uid!==process.getuid?.() || (stat.mode&0o777)!==0o600 || stat.size>16000) throw new Error('Use an owned 0600 JSON file, at most 16KB')
    try {return JSON.parse(readFileSync(fd,'utf8'))} catch {throw new Error('Invalid report JSON')}
  } finally {closeSync(fd)}
}
export async function runAgentReport(args:string[], deps={readAgentConfig:readReportAgentConfig,readAgentToken:readReportAgentToken,fetch:globalThis.fetch}) {
  const {values,positionals}=parseArgs({args,allowPositionals:true,options:{input:{type:'string'},id:{type:'string'},'identity-home':{type:'string'},server:{type:'string',default:'https://ai-toolkit.gpters.org'}}})
  const command=positionals[0]
  if(positionals.length!==1 || !['submit','get','append'].includes(command)) throw new Error('Usage: report submit --input FILE | get --id ID | append --id ID --input FILE')
  const identityHome=values['identity-home']===undefined?undefined:privateIdentityHome(values['identity-home'])
  const config=deps.readAgentConfig(identityHome)
  if(!config || config.serverUrl!==values.server) throw new Error('Agent identity must be configured for the requested server; no personal token fallback')
  if(identityHome && config.credentialStore!=='file') throw new Error('Private report identity requires the file credential store')
  const origin=new URL(values.server!)
  if(origin.origin!==values.server || (origin.protocol!=='https:' && !(origin.protocol==='http:' && ['127.0.0.1','localhost'].includes(origin.hostname)))) throw new Error('Invalid server origin')
  const token=deps.readAgentToken(identityHome,identityHome?config.agentId:undefined)
  if(!token || !/^aia_[a-f0-9]{64}$/.test(token)) throw new Error('Scoped agent credential unavailable')
  if(command!=='submit' && !/^report_[a-f0-9]{32}$/.test(values.id??'')) throw new Error('Valid report ID required')
  if(command==='get' && values.input) throw new Error('get does not accept an input file')
  if(command==='submit' && values.id) throw new Error('submit derives its ID from the problem message link')
  const body=command==='get'?undefined:JSON.stringify(privateJson(values.input??''))
  const path=command==='submit'?'/api/ax/agent-reports':`/api/ax/agent-reports/${values.id}`
  const response=await deps.fetch(new URL(path,origin),{method:command==='get'?'GET':'POST',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body,redirect:'error',signal:AbortSignal.timeout(30000)})
  const result=await response.json() as {id?:string;url?:string;message?:string}
  if(!response.ok) throw new Error(`Report API ${response.status}: ${result.message??'request failed'}`)
  if(!/^report_[a-f0-9]{32}$/.test(result.id??'') || !result.url || new URL(result.url).origin!==origin.origin) throw new Error('Unexpected receipt; do not announce successful submission')
  return result
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  runAgentReport(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{
    // Do not serialize request headers, response objects, local paths or credentials.
    process.stderr.write(`${error instanceof Error && !/aia_[a-f0-9]{64}/.test(error.message)?error.message:'Report request failed'}\n`)
    process.exitCode=1
  })
}
