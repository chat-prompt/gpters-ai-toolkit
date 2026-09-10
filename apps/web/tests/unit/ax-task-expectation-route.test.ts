// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
const mocks=vi.hoisted(()=>({auth:vi.fn(),save:vi.fn(),read:vi.fn()}))
vi.mock('@gpters/lib/security',()=>({authenticateAgent:mocks.auth}))
vi.mock('@/lib/utils/rate-limit',()=>({withRateLimit:()=>null,RateLimitPresets:{standard:{}}}))
vi.mock('@/lib/features/ax',async()=>{const actual=await import('../../../../packages/lib/src/features/ax/task-expectations');return {...actual,saveTaskExpectation:mocks.save,readOwnTaskExpectation:mocks.read}})
vi.mock('../../app/api/ax/agent-reports/shared',()=>({reportBody:async(request:Request)=>{const text=await request.text();if(text.length>16000)throw Error('size');return JSON.parse(text)}}))
const {POST,GET}=await import('../../app/api/ax/task-expectations/route')
const token='aia_'+'a'.repeat(64),id='expect_'+'b'.repeat(64)
const principal={orgId:'example-org',agentId:'example-agent',ownerUserId:'owner',allowDeploy:false}
function setup(){vi.stubEnv('AX_MONITOR_ENABLED','true');vi.stubEnv('AX_MONITOR_AGENT_IDS','example-agent');vi.stubEnv('AX_TASK_EXPECTATIONS_ENABLED','true');vi.stubEnv('AX_INCIDENT_ORG_ID','example-org');vi.stubEnv('AX_TASK_EXPECTATIONS_AGENT_IDS','example-agent');mocks.auth.mockResolvedValue(principal)}
function request(body:unknown,authorization='Bearer '+token){return new NextRequest('https://example.test/api/ax/task-expectations',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(body)})}
const input=()=>({action:'register',source:'codex',taskId:randomUUID(),attemptId:randomUUID(),phase:'execution',evidence:'process',scheduledFor:'2026-01-01T01:00:00.000Z',deadlineAt:'2026-01-01T02:00:00.000Z'})
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks()})
describe('explicit expectation API authorization',()=>{
 it('defaults off and rejects collector/human tokens without fallback',async()=>{expect((await POST(request(input()))).status).toBe(503);setup();for(const credential of ['Bearer agt_'+'a'.repeat(64),'Bearer human',''])expect((await POST(request(input(),credential))).status).toBe(401);expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled()})
 it('requires organization and exact enabled agent; deployment permission does not grant this permission',async()=>{setup();mocks.auth.mockResolvedValue({...principal,orgId:'other'});expect((await POST(request(input()))).status).toBe(403);mocks.auth.mockResolvedValue({...principal,agentId:'other',allowDeploy:true});expect((await POST(request(input()))).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled()})
 it('cannot choose another agent/org or submit arbitrary completion claims',async()=>{setup();for(const body of [{...input(),agentId:'other'},{...input(),orgId:'other'},{action:'complete',id,revision:1,operationId:randomUUID()}])expect((await POST(request(body))).status).toBe(400);expect(mocks.save).not.toHaveBeenCalled()})
 it('passes only authenticated principal and validated request, with private responses and replay status',async()=>{setup();const body=input();mocks.save.mockResolvedValue({record:{id},replayed:false});const response=await POST(request(body));expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(mocks.save).toHaveBeenCalledWith(principal,body);mocks.save.mockResolvedValue({record:{id},replayed:true});expect((await POST(request(body))).status).toBe(200)})
 it('does not leak unknown identities or exception text, and GET cannot broaden its query',async()=>{setup();mocks.read.mockResolvedValue(null);const url='https://example.test/api/ax/task-expectations?id='+id;expect((await GET(new NextRequest(url,{headers:{authorization:'Bearer '+token}}))).status).toBe(404);expect(mocks.read).toHaveBeenCalledWith(principal,id);expect((await GET(new NextRequest(url+'&orgId=other',{headers:{authorization:'Bearer '+token}}))).status).toBe(400);mocks.save.mockRejectedValue(Error('/private/raw-token'));const response=await POST(request(input()));expect(response.status).toBe(500);expect(await response.text()).not.toContain('raw-token')})
})
