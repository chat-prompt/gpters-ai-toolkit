/**
 * 합성 데이터로 실제 메시지 빌더의 본문·답글을 검토한다. 네트워크·DB 접근·발송 없음.
 * 실행: node --import tsx apps/web/scripts/preview-popular-skills.ts
 * 결과: out/dev-4280/index.html, messages.json, preview.md
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildPopularSkillsMessages, formatCreatedLines, formatDigestLines,
  formatMissingDescriptionLines, formatUpdatedLines, type PopularSkillDigest,
} from '../../../packages/lib/src/notifications'

const digest: PopularSkillDigest = {
  since: '2026-09-03T00:00:00Z', until: '2026-09-10T00:00:00Z',
  totalApplies: 18, distinctSkills: 2,
  top: [
    { skillId: 'sample-meeting', name: '회의록 정리', applies: 12, users: 4, isFirstTime: false },
    { skillId: 'sample-review', name: '코드 리뷰', applies: 6, users: 2, isFirstTime: true },
  ],
  firstTimers: [],
  created: [{ id: 'sample-report', name: '주간 보고서', authorName: '작성자 A', version: '1.0.0', summary: '업무 기록을 주간 보고서로 정리' }],
  updated: [{ id: 'sample-review', name: '코드 리뷰', authorName: '작성자 B', version: '1.2.0', bumps: 2, summary: '변경 코드의 오류와 개선점 검토', changeNote: '검토 항목 추가' }],
  missingDescriptions: [{ id: 'sample-meeting', name: '회의록 정리', authorName: '작성자 A', recentApplies: 24 }],
  missingDescriptionTotal: 1,
}
const baseUrl = 'https://example.invalid'
const messages = buildPopularSkillsMessages({
  days: 7, totalApplies: digest.totalApplies, distinctSkills: digest.distinctSkills,
  lines: formatDigestLines(digest, baseUrl),
  createdLines: formatCreatedLines(digest, baseUrl),
  updatedLines: formatUpdatedLines(digest, baseUrl),
  missingLines: formatMissingDescriptionLines(digest, baseUrl),
})!
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!))
// 합성 스킬 링크는 실제 스킬로 오인하지 않도록 클릭 불가능한 표시로 만든다.
const markup = (text: string) => escapeHtml(text.replace(/<[^|>]+\|([^>]+)>/g, '$1'))
  .replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
const render = (payload: typeof messages.main) => payload.blocks.map((block) => {
  if (block.type === 'header') return `<h2>${escapeHtml(block.text.text)}</h2>`
  if (block.type === 'divider') return '<hr>'
  if (block.type === 'section' && 'text' in block) return `<p>${markup(block.text.text)}</p>`
  if (block.type === 'context') return `<small>${block.elements.map((item) => markup(item.text)).join(' ')}</small>`
  return ''
}).join('')
const article = (payload: typeof messages.main) => `<article><div class="avatar">A</div><div><b>AITK</b> <span class="app">앱</span>${render(payload)}</div></article>`
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DEV-4280 · 주간 스킬 소식 미리보기</title>
<style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;color:#222;background:#f5f5f7}
body{margin:0;padding:32px}main{max-width:820px;margin:auto}h1{font-size:23px;margin:0 0 12px}.notice{line-height:1.6;color:#666;margin-bottom:24px}
.channel{padding:18px 24px;border-bottom:1px solid #ddd;font-weight:700}.panel{background:#fff;border:1px solid #ddd;border-radius:12px;overflow:hidden}
article{display:grid;grid-template-columns:36px 1fr;gap:12px;padding:24px;overflow-wrap:anywhere}.avatar{background:#552b60;color:white;height:36px;border-radius:7px;display:grid;place-items:center;font-weight:800}
.app{font-size:11px;color:#555;background:#eee;border-radius:3px;padding:2px 4px}h2{font-size:20px;margin:14px 0 22px}p{font-size:15px;line-height:1.9;margin:0 0 16px}hr{border:0;border-top:1px solid #eee;margin:20px 0}small{color:#666;line-height:1.6;display:block}
details{border-top:1px solid #ddd}summary{cursor:pointer;color:#1264a3;padding:16px 24px;font-size:14px;font-weight:600}details article{border-top:1px solid #eee;background:#fafafa}
@media(prefers-color-scheme:dark){:root{background:#19191c;color:#eee}.panel{background:#222225;border-color:#444}.channel,details,details article{border-color:#444}details article{background:#29292d}.notice,small{color:#bbb}.app{color:#ddd;background:#444}summary{color:#83caff}hr{border-color:#444}}
@media(max-width:600px){body{padding:14px}article{padding:18px 14px}.channel,summary{padding:16px}}
</style><main><h1>주간 스킬 소식 · 변경안</h1><div class="notice">합성 데이터 미리보기 — 이름·인원·횟수는 예시입니다. 실제 알림은 발송하지 않았습니다.<br>본문은 인기·신규만 표시합니다. 아래 ‘답글 2개’를 눌러 스레드 구성을 확인하세요.</div>
<div class="panel"><div class="channel"># toolkit-알림</div>${article(messages.main)}<details><summary>답글 ${messages.replies.length}개 · 스레드 보기</summary>${messages.replies.map(article).join('')}</details></div></main></html>`
const outDir = resolve('out/dev-4280')
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'index.html'), html)
writeFileSync(resolve(outDir, 'messages.json'), JSON.stringify(messages, null, 2))
writeFileSync(resolve(outDir, 'preview.md'), [
  '# 주간 스킬 소식 미리보기', '합성 데이터이며 실제 발송하지 않았습니다.',
  '## 채널 본문', messages.main.text,
  ...messages.replies.flatMap((reply, index) => [`## 스레드 답글 ${index + 1}`, reply.text]),
].join('\n\n'))
console.log(`Preview written to ${outDir}`)

