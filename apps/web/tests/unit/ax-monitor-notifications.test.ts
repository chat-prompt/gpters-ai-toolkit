// @vitest-environment node
import {describe,it,expect,vi} from 'vitest'
import {deliverOperatorAlert} from '../../../../packages/lib/src/features/ax/monitor-notifications'
const env={AX_MONITOR_ALERTS_ENABLED:'true',AX_MONITOR_SLACK_TOKEN:'test-only',AX_MONITOR_SLACK_USER:'U000000001'}
describe('operator-only monitor delivery',()=>{
 it('does not send when disabled or target is not a human',async()=>{const fetcher=vi.fn();expect((await deliverOperatorAlert('id','text',fetcher,{...env,AX_MONITOR_SLACK_USER:'C000000001'})).status).toBe('blocked');expect(fetcher).not.toHaveBeenCalled()})
 it('requires actual Slack acceptance and addresses only the opened DM',async()=>{const f=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ok:true,channel:{id:'D000000001'}}))).mockResolvedValueOnce(new Response(JSON.stringify({ok:true,ts:'1789000000.000001'})));expect((await deliverOperatorAlert('id','hello',f,env)).status).toBe('accepted');expect(JSON.parse(f.mock.calls[1][1].body).channel).toBe('D000000001');expect(JSON.parse(f.mock.calls[1][1].body).mrkdwn).toBe(false)})
 it('keeps ambiguous send failure uncertain rather than automatically retrying',async()=>{const f=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ok:true,channel:{id:'D000000001'}}))).mockRejectedValueOnce(new Error('timeout'));expect((await deliverOperatorAlert('id','hello',f,env)).status).toBe('uncertain')})
 it('backs off explicit rate limiting and rejects ok=false',async()=>{const f=vi.fn().mockResolvedValueOnce(new Response('{}',{status:429,headers:{'retry-after':'120'}}));expect(await deliverOperatorAlert('id','hello',f,env)).toMatchObject({status:'retry',retryAfterSeconds:120});const rejected=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ok:false})));expect((await deliverOperatorAlert('id','hello',rejected,env)).status).toBe('blocked')})
})
