// @vitest-environment node
import { mkdtempSync, writeFileSync, chmodSync, rmSync, realpathSync, symlinkSync } from 'node:fs'
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
  it('uses the explicitly selected identity for both config and token with no default fallback',async()=>{
    const home=realpathSync(mkdtempSync(join(tmpdir(),'report-identity-')));folders.push(home)
    const readAgentConfig=vi.fn((selected?:string)=>selected===home?config:null)
    const readAgentToken=vi.fn((selected?:string)=>selected===home?token:undefined)
    const fetch=vi.fn().mockResolvedValue(Response.json({id,url:server+'/en/ax?incident='+id}))
    await runAgentReport(['get','--id',id,'--server',server,'--identity-home',home],{readAgentConfig,readAgentToken,fetch})
    expect(readAgentConfig).toHaveBeenCalledExactlyOnceWith(home)
    expect(readAgentToken).toHaveBeenCalledExactlyOnceWith(home,config.agentId)
    readAgentConfig.mockReturnValue(null);readAgentToken.mockClear();fetch.mockClear()
    await expect(runAgentReport(['get','--id',id,'--server',server,'--identity-home',home],{readAgentConfig,readAgentToken,fetch})).rejects.toThrow('identity')
    expect(readAgentToken).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects an unsafe or symlinked identity directory before reading credentials',async()=>{
    const home=realpathSync(mkdtempSync(join(tmpdir(),'report-identity-')));folders.push(home)
    const deps={readAgentConfig:vi.fn(()=>config),readAgentToken:vi.fn(()=>token),fetch:vi.fn()}
    const link=join(home,'alias');symlinkSync(home,link)
    for(const path of ['relative',link])await expect(runAgentReport(['get','--id',id,'--server',server,'--identity-home',path],deps)).rejects.toThrow('0700')
    chmodSync(home,0o755)
    await expect(runAgentReport(['get','--id',id,'--server',server,'--identity-home',home],deps)).rejects.toThrow('0700')
    expect(deps.readAgentConfig).not.toHaveBeenCalled();expect(deps.readAgentToken).not.toHaveBeenCalled();expect(deps.fetch).not.toHaveBeenCalled()
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
