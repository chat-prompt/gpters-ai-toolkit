/**
 * 알림에 실을 짧은 문구를 만든다 — 변경 요약과 설명 압축.
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

/**
 * 요약에 쓰는 모델. `slack.ts`의 `SUMMARY_MODEL`과 같은 값을 쓴다.
 *
 * **이름이 낡으면 404가 나고 요약이 조용히 사라진다.** 2026-09-07에 `gemini-2.0-flash`와
 * `gemini-2.5-flash`가 둘 다 폐기된 것을 운영 로그로 확인했다 — API가 응답 본문에
 * 대체 모델을 알려준다.
 *
 * 모델 이름은 우리가 통제하지 못하는 값이라 언젠가 또 낡는다. 그때 조용히 사라지지 않도록
 * 실패를 로그로 남긴다.
 */
const MODEL = 'gemini-3.6-flash'

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
  if (!apiKey) {
    log.warn('GEMINI_API_KEY is not set; skipping change note')
    return null
  }

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
    const note = normalizeChangeNote(response.text)
    // 응답은 왔는데 쓸 수 없는 모양이면 그것도 남긴다 — 조용히 비면 원인을 못 찾는다
    if (note === null) log.warn('Change note unusable', { raw: response.text?.slice(0, 80) })
    return note
  } catch (error) {
    // 요약이 없다고 알림 자체를 실패시키지 않는다
    log.error('Failed to summarize change note', error)
    return null
  }
}

/** 압축한 설명의 최대 길이 — 알림 한 줄에 들어가야 한다 */
const SUMMARY_MAX = 45

/**
 * 설명을 첫 문장만 남겨 줄인다.
 *
 * 모델을 못 쓸 때 쓰는 결정적 대안이다. **원문에서 잘라 오기만 하고 새로 쓰지 않는다.**
 *
 * @param description - 카탈로그 설명
 * @returns 줄인 문구. 재료가 없으면 null
 */
export function firstSentence(description: string | null | undefined): string | null {
  const text = (description ?? '').replace(/\s+/g, ' ').trim()
  if (text === '') return null
  // 마침표·물음표·느낌표에서 끊되, 없으면 통째로 본다
  const cut = text.search(/[.!?。](\s|$)/)
  const head = cut > 0 ? text.slice(0, cut) : text
  return head.length > SUMMARY_MAX ? `${head.slice(0, SUMMARY_MAX)}…` : head
}

/**
 * 설명을 알림 한 줄에 들어가게 압축한다.
 *
 * 자세한 내용은 링크를 눌러 보면 되므로, 여기서는 **무엇을 하는 스킬인지**만 남긴다.
 * 운영 설명의 중앙값이 90자라 그대로 실으면 잘려서 뜻이 끊긴다.
 *
 * 모델을 못 쓰면 첫 문장으로 물러난다. 둘 다 안 되면 null이고, 알림은 그 줄을 만들지 않는다.
 *
 * @param description - 카탈로그 설명
 * @returns 압축한 한 줄. 재료가 없으면 null
 */
export async function compactDescription(description: string | null | undefined): Promise<string | null> {
  const text = (description ?? '').replace(/\s+/g, ' ').trim()
  if (text === '') return null
  if (text.length <= SUMMARY_MAX) return text

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return firstSentence(text)

  try {
    const client = new GoogleGenAI({ apiKey })
    const response = await client.models.generateContent({
      model: MODEL,
      contents:
        '다음 스킬 설명을 25자 이내 한 줄로 압축하라. 무엇을 하는 스킬인지만 남기고 ' +
        '방법·조건·예시는 버려라. 문장 부호로 끝내지 말고 다른 말도 붙이지 마라.\n\n' +
        text.slice(0, INPUT_CAP),
    })
    const compact = (response.text ?? '').replace(/\s+/g, ' ').replace(/^["\'`\s]+|["\'`.\s]+$/g, '').trim()
    // 부탁한 것보다 길게 오면 쓰지 않는다 — 자르면 뜻이 바뀐다
    if (compact === '' || compact.length > SUMMARY_MAX) return firstSentence(text)
    return compact
  } catch (error) {
    log.error('Failed to compact description', error)
    return firstSentence(text)
  }
}

/**
 * 설명이 비어 있을 때 스킬 본문에서 한 줄을 뽑는다.
 *
 * ## 이것은 `description`을 대신하지 않는다
 *
 * `description`은 검색이 실제로 색인하는 값이다 — 의미 검색 임베딩(`search/embedding.ts`),
 * 전문 검색(`search/full-text-search.ts`), MCP 검색 결과가 모두 그 칸을 읽는다.
 * 여기서 만든 요약은 **알림에서 읽히기만 하고 그 칸에 저장되지 않는다.**
 *
 * 그래서 자동 요약이 있어도 "설명을 채워 주세요"는 여전히 유효하다. 기계가 쓴 문장을 그 칸에
 * 넣어 버리면 검색이 그것을 색인하고, 아무도 다시 고치지 않는다.
 *
 * @param content - 스킬 본문(마크다운)
 * @returns 압축한 한 줄. 재료가 없거나 실패하면 null
 */
export async function summarizeSkillContent(content: string | null | undefined): Promise<string | null> {
  const text = (content ?? '').trim()
  if (text === '') return null

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const client = new GoogleGenAI({ apiKey })
    const response = await client.models.generateContent({
      model: MODEL,
      contents:
        '다음 스킬 문서를 읽고 무엇을 하는 스킬인지 25자 이내 한 줄로 답하라. ' +
        '방법·조건·예시는 버리고 목적만 남겨라. 문장 부호로 끝내지 말고 다른 말도 붙이지 마라.\n\n' +
        text.slice(0, 3000),
    })
    const compact = (response.text ?? '').replace(/\s+/g, ' ').replace(/^["\'`\s]+|["\'`.\s]+$/g, '').trim()
    // 부탁한 것보다 길게 오면 쓰지 않는다 — 본문 요약은 대안이 없으므로 그냥 비운다
    if (compact === '' || compact.length > SUMMARY_MAX) return null
    return compact
  } catch (error) {
    log.error('Failed to summarize skill content', error)
    return null
  }
}
