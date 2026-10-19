// pii-mask: 도구가 돌아간 뒤, Claude가 결과를 읽기 전에 민감정보를 가린다.
// 원본 파일·DB는 건드리지 않는다. Claude 눈에 들어가는 결과만 바꾼다.
// 슬랙에서 개인정보 권한이 없는 사람이 시키거나, 외부 워크스페이스이거나, "가림모드"를 켜면 개인정보까지 가린다.
// 관리자의 업무 요청·자동화는 토큰·키만 가린다(업무가 안 깨지게).
import type { Register } from 'claude-code'
import { atom, read, update } from 'claude-code'
import { configure, strictReason, maskDeep, total, type MaskCount } from './mask'
import type { Mode } from '../types'

// 세션 동안 유지되는 모드. 한 번 외부 채널로 확인되면 그 세션은 끝까지 strict.
// 아직 메시지를 하나도 못 봤으면(unknown) 안전하게 strict로 가린다. 봇 재시작 직후 첫 메시지를 놓치는 경우 대비.
const mode = atom({ plugin: 'pii-mask', key: 'mode' } as const, 'unknown' as Mode)

export const register: Register = (on, options) => {
  // 개인 설정(userConfig). /config 또는 settings.json pluginConfigs 에서 바꾼다.
  configure(options)

  on('prompt.submit', async ($, e, next) => {
    const reason = strictReason(e.text)
    if (reason) $.ui.log(`개인정보까지 가립니다: ${reason}`)
    await update($, mode, m => (reason || m === 'strict' ? 'strict' : 'secrets'))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    // 거부됐거나 에러난 호출은 그대로 둔다
    if (ran.deny !== undefined || ran.isError === true) return ran

    const seen = await read($, mode)
    const current = seen === 'unknown' ? 'strict' : seen
    const count: MaskCount = {}
    const masked = maskDeep(ran.result, count, current)
    if (total(count) === 0) return ran

    const summary = Object.entries(count).map(([k, n]) => `${k} ${n}`).join(', ')
    $.ui.log(`${e.tool} 결과에서 ${summary}건을 가렸어요 (${current})`)
    // 자기 result로 답하면 엔진이 도구의 원래 변환기로 다시 모델용 글을 만든다
    return {
      result: masked,
      context: [`[pii-mask] 이 결과의 민감정보 ${total(count)}건(${summary})은 가려졌다. 원문 값이 필요하면 사람에게 확인을 요청할 것.`],
    }
  }).catch(($, e, next) =>
    // 가리는 도중 실패하면 원문을 흘리지 않고 결과를 통째로 숨긴다
    next.called ? { deny: `${$.plugin.name}: 마스킹에 실패해 결과를 숨겼어요` } : next(e),
  )
}
