/**
 * 마켓플레이스 mod 목록 — mod 경로만 고르고 설치 명령을 만드는지
 */
import { describe, it, expect } from 'vitest'
import { getMods } from '@/lib/core/mods'

describe('getMods', () => {
  it('apps/claude-code-mods 아래 플러그인만 mod 로 고른다', () => {
    const mods = getMods(
      [
        { name: 'gpters-ai-toolkit', source: './apps/claude-code-plugin' },
        { name: 'pii-mask', source: './apps/claude-code-mods/pii-mask', description: '가린다', category: 'security' },
      ],
      'team-market',
    )

    expect(mods).toEqual([
      {
        name: 'pii-mask',
        description: '가린다',
        category: 'security',
        sourceUrl: 'https://github.com/chat-prompt/gpters-ai-toolkit/tree/main/apps/claude-code-mods/pii-mask',
        installCommand:
          'claude plugin marketplace add chat-prompt/gpters-ai-toolkit 2>/dev/null; claude plugin install pii-mask@team-market',
      },
    ])
  })

  it('실제 marketplace.json 의 mod 를 읽는다', () => {
    expect(getMods().map((mod) => mod.name)).toEqual(expect.arrayContaining(['linear-issues', 'pii-mask']))
  })
})
