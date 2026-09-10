// @vitest-environment node
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { privateJson, runAgentReport } from '../../../../infra/agent-reports/report'
const folders:string[]=[]
function input(mode=0o600) {const dir=mkdtempSync(join(tmpdir(),'incident-helper-'));folders.push(dir);const path=join(dir,'input.json');writeFileSync(path,JSON.stringify({title:'Example'}),{mode});return path}
const token='aia_'+'a'.repeat(64),id='report_'+'a'.repeat(32),server='https://toolkit.example.org'
const config={version:1 as const,agentId:'example',serverUrl:server,credentialStore:'file' as const}
afterEach(()=>{for(const folder of folders.splice(0))rmSync(folder,{recursive:true,force:true})})
describe('repo-built report helper',()=>{
  it('uses only explicit matching agent auth and returns a validated receipt',async()=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({id,url:server+'/en/ax?incident='+id,state:'candidate'}))
    const result=await runAgentReport(['submit','--server',server,'--input',input()],{readAgentConfig:()=>config,readAgentToken:()=>token,fetch})
    expect(result.id).toBe(id);expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token}})
    expect(JSON.stringify(result)).not.toContain(token)
  })
  it('refuses another server and missing identity before reading credentials or sending',async()=>{
    const readAgentToken=vi.fn(),fetch=vi.fn()
    await expect(runAgentReport(['get','--server','https://other.example.org','--id',id],{readAgentConfig:()=>config,readAgentToken,fetch})).rejects.toThrow('identity')
    await expect(runAgentReport(['get','--server',server,'--id',id],{readAgentConfig:()=>null,readAgentToken,fetch})).rejects.toThrow('identity')
    expect(readAgentToken).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects public input files and malformed JSON without echoing private content',()=>{
    const path=input();chmodSync(path,0o644);expect(()=>privateJson(path)).toThrow('0600')
    chmodSync(path,0o600);writeFileSync(path,'private transcript');expect(()=>privateJson(path)).toThrow('Invalid report JSON')
  })
  it('does not claim success for HTTP failures or unexpected receipt origins',async()=>{
    const deps={readAgentConfig:()=>config,readAgentToken:()=>token,fetch:vi.fn().mockResolvedValue(Response.json({message:'conflict'},{status:409}))}
    await expect(runAgentReport(['get','--id',id,'--server',server],deps)).rejects.toThrow('409')
    deps.fetch.mockResolvedValue(Response.json({id,url:'https://other.example.org/en/ax'}))
    await expect(runAgentReport(['get','--id',id,'--server',server],deps)).rejects.toThrow('Unexpected receipt')
  })
})
