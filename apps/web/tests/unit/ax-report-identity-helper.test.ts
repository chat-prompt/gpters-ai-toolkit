// @vitest-environment node
import { existsSync, mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runReportIdentity } from '../../../../infra/agent-reports/identity'
import { runAgentReport } from '../../../../infra/agent-reports/report'
import { privateIdentityHome, readReportAgentConfig } from '../../../../infra/agent-reports/identity-home'
const folders:string[]=[]
function home(){const path=realpathSync(mkdtempSync(join(tmpdir(),'report-identity-import-')));folders.push(path);return path}
async function* input(value:string){yield Buffer.from(value)}
const actor={version:1 as const,agentId:'example-agent',serverUrl:'https://toolkit.example.org',credentialStore:'file' as const}
afterEach(()=>{vi.unstubAllGlobals();for(const path of folders.splice(0))rmSync(path,{recursive:true,force:true})})
describe('isolated report identity import',()=>{
  it('imports only to the explicit private identity and returns metadata rather than the grant',async()=>{
    const directory=home(),grant={...actor,token:'aia_'+'a'.repeat(64),allowDeploy:false,expiresAt:'2099-01-01T00:00:00Z'}
    const deps={readAgentConfig:vi.fn().mockReturnValueOnce(null).mockReturnValue(actor),importAgentCredential:vi.fn().mockResolvedValue(undefined)}
    const result=await runReportIdentity(['import','--identity-home',directory,'--credential-stdin','--server',actor.serverUrl],input(JSON.stringify(grant)),deps)
    expect(deps.importAgentCredential).toHaveBeenCalledExactlyOnceWith(grant,actor.serverUrl,directory,'file')
    expect(deps.readAgentConfig.mock.calls).toEqual([[directory],[directory]])
    expect(result).toEqual({ok:true,actor});expect(JSON.stringify(result)).not.toContain(grant.token)
  })
  it('refuses to replace an existing identity or accept oversized credentials',async()=>{
    const directory=home(),deps={readAgentConfig:vi.fn().mockReturnValue(actor),importAgentCredential:vi.fn()}
    await expect(runReportIdentity(['import','--identity-home',directory,'--credential-stdin'],input('{}'),deps)).rejects.toThrow('already configured')
    deps.readAgentConfig.mockReturnValue(null)
    await expect(runReportIdentity(['import','--identity-home',directory,'--credential-stdin'],input('a'.repeat(4097)),deps)).rejects.toThrow('4096')
    expect(deps.importAgentCredential).not.toHaveBeenCalled()
  })
  it('status never reads stdin or imports a credential',async()=>{
    const directory=home(),deps={readAgentConfig:vi.fn(()=>actor),importAgentCredential:vi.fn()}
    async function* unexpected(){throw new Error('stdin must not be read');yield Buffer.alloc(0)}
    expect(await runReportIdentity(['status','--identity-home',directory],unexpected(),deps)).toEqual({actor})
    expect(deps.importAgentCredential).not.toHaveBeenCalled()
  })
  it('rejects the actual personal HOME even if its permissions would otherwise be accepted',()=>{
    expect(()=>privateIdentityHome(realpathSync(homedir()))).toThrow('identity directory')
  })
  it('imports and reads actual private files using one pinned server request, without default credentials',async()=>{
    const directory=home(),grant={...actor,token:'aia_'+'b'.repeat(64),allowDeploy:false,expiresAt:'2099-01-01T00:00:00Z'}
    const id='report_'+'b'.repeat(32)
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({success:true,actor:{type:'agent',id:actor.agentId,allowDeploy:false}}))
      .mockResolvedValueOnce(Response.json({id,url:actor.serverUrl+'/en/ax?incident='+id}))
    vi.stubGlobal('fetch',fetch)
    const result=await runReportIdentity(['import','--identity-home',directory,'--credential-stdin','--server',actor.serverUrl],input(JSON.stringify(grant)))
    expect(result).toEqual({ok:true,actor})
    expect(fetch.mock.calls[0]).toEqual([actor.serverUrl+'/api/agents/mcp?action=whoami',expect.objectContaining({method:'POST',redirect:'error',body:'{}',headers:expect.objectContaining({Authorization:'Bearer '+grant.token})})])
    const configPath=join(directory,'.config/aitk/agent.json')
    expect(JSON.parse(readFileSync(configPath,'utf8'))).toEqual(actor)
    expect(readFileSync(join(directory,'.config/aitk/credentials/agent-example-agent.token'),'utf8').trim()).toBe(grant.token)
    await runAgentReport(['get','--id',id,'--server',actor.serverUrl,'--identity-home',directory])
    expect(fetch.mock.calls[1][1]).toMatchObject({headers:{Authorization:'Bearer '+grant.token}})
    writeFileSync(configPath,JSON.stringify({...actor,credentialStore:'macos-keychain'}))
    await expect(runAgentReport(['get','--id',id,'--server',actor.serverUrl,'--identity-home',directory])).rejects.toThrow('file credential store')
    writeFileSync(configPath,JSON.stringify(actor));chmodSync(configPath,0o644)
    expect(()=>readReportAgentConfig(directory)).toThrow('private regular files')
    chmodSync(configPath,0o600);const copy=join(directory,'copy.json');writeFileSync(copy,JSON.stringify(actor),{mode:0o600});rmSync(configPath);symlinkSync(copy,configPath)
    expect(()=>readReportAgentConfig(directory)).toThrow('private regular files')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('leaves the identity empty after server rejection',async()=>{
    const directory=home(),grant={...actor,token:'aia_'+'c'.repeat(64),allowDeploy:false,expiresAt:'2099-01-01T00:00:00Z'}
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({},{status:401})))
    await expect(runReportIdentity(['import','--identity-home',directory,'--credential-stdin','--server',actor.serverUrl],input(JSON.stringify(grant)))).rejects.toThrow('verification failed')
    expect(existsSync(join(directory,'.config'))).toBe(false)
  })
})
