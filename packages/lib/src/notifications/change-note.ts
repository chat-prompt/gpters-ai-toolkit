/**
 * 한 주의 변경 기록을 명사형 한 마디로 줄인다 (예: "버그 수정", "문체 개선").
 *
 * ## 왜 규칙이 아니라 모델인가
 *
 * `item_versions.changelog`에 두 종류가 섞여 있다 — 도구가 자동으로 남긴
 * `"파일 추가/업데이트: run.sh, register.js"` 같은 줄과, 사람이 쓴 긴 산문이다.
 * 후자는 "클릭률 100%는 유망이 아니라 보안 프로그램의 표식이라는 정정" 같은 문장이라
 * 키워드 규칙으로는 갈리지 않는다.
 *
 * ## 지어내지 않는다
 *
 * 키가 없거나 호출이 실패하거나 changelog가 비면 **null을 돌려준다.** 알림에서는 그 자리를
 * 비워 둔다. 요약이 없는 것과 "변경 없음"은 다르다.
 */

import { GoogleGenAI } from '@google/genai'
import { createLogger } from '../core/logger'

const log = createLogger('change-note')

/** 요약에 쓰는 모델 — 슬랙 요약과 같은 급을 쓴다 */
const MODEL = 'gemini-2.5-flash'

/** 모델에 넘기는 changelog 총 길이 상한 */
const INPUT_CAP = 1500

/** 돌려받을 한 마디의 최대 길이 */
const NOTE_MAX = 20

/**
 * 모델이 돌려준 문자열을 알림에 쓸 수 있게 다듬는다.
 *
 * 따옴표·마침표·줄바꿈을 걷어내고 길면 버린다 — 한 마디를 부탁했는데 문장이 오면
 * 자르는 것보다 안 쓰는 편이 낫다.
 *
 * @param raw - 모델 응답
 * @returns 쓸 수 있는 한 마디. 아니면 null
 */
export function normalizeChangeNote(raw: string | null | undefined): string | null {
  const text = (raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^["'`\s]+|["'`.\s]+$/g, '')
    .trim()
  if (text === '') return null
  if (text.length > NOTE_MAX) return null
  return text
}

/**
 * 이번 주 변경 기록들을 한 마디로 줄인다.
 *
 * @param changelogs - 창 안에서 남은 changelog들
 * @returns 명사형 한 마디. 재료가 없거나 실패하면 null
 */
export async function summarizeChangeNote(changelogs: string[]): Promise<string | null> {
  const material = changelogs.filter((entry) => entry.trim() !== '').join('\n')
  if (material === '') return null

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const client = new GoogleGenAI({ apiKey })
    const response = await client.models.generateContent({
      model: MODEL,
      contents:
        '다음은 한 스킬의 이번 주 변경 기록이다. 무엇이 바뀌었는지를 ' +
        '**명사형 한 마디**(10자 이내)로만 답하라. 예: 버그 수정, 문체 개선, 파일 추가, 문서 보강, 규칙 정리.\n' +
        '문장으로 쓰지 말고 다른 말도 붙이지 마라.\n\n' +
        material.slice(0, INPUT_CAP),
    })
    return normalizeChangeNote(response.text)
  } catch (error) {
    // 요약이 없다고 알림 자체를 실패시키지 않는다
    log.error('Failed to summarize change note', error)
    return null
  }
}
