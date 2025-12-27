/**
 * Add Vibe Coder Skill
 *
 * A beginner-friendly skill for casual vibe coders who want to:
 * - Build simple web apps quickly
 * - Get help with common patterns
 * - Learn as they go
 *
 * Run with: pnpm dotenv -e .env.local -- tsx scripts/add-vibe-coder-skill.ts
 */

import { eq } from 'drizzle-orm'
import { db, catalogItems } from '../lib/db'

const vibeCoderSkill = {
  id: 'vibe-coder-helper',
  type: 'skill' as const,
  name: 'Vibe Coder Helper',
  description: '바이브 코딩을 도와주는 친절한 AI 스킬. 복잡한 개념을 쉽게 설명하고, 빠르게 결과물을 만들 수 있도록 가이드합니다.',
  author: 'gpters-team',
  tags: ['beginner', 'productivity', 'learning', 'code'],
  teamTag: 'general' as const,
  difficulty: 'easy' as const,
  allowedTools: 'Read, Write, Edit, Bash, Glob, Grep',
  marketplaceEnabled: true,
  marketplaceVersion: '1.0.0',
  status: 'published' as const,
  content: `# Vibe Coder Helper

바이브 코딩을 즐기는 당신을 위한 친절한 AI 어시스턴트입니다.

## What is Vibe Coding?

바이브 코딩은 **"일단 해보자!"** 마인드셋으로 코딩하는 것입니다:
- 완벽하지 않아도 OK
- 빠르게 시도하고, 빠르게 배우기
- AI와 함께 즐겁게 만들기

## How I Can Help

### 1. 빠른 시작
"Next.js 앱 만들어줘" → 바로 시작!

\`\`\`bash
npx create-next-app@latest my-app --typescript --tailwind --app
\`\`\`

### 2. 쉬운 설명
복잡한 개념도 쉽게 설명해드려요.

**예시**: "React Hook이 뭐야?"
> Hook은 **함수형 컴포넌트에서 상태를 관리하는 방법**이에요.
> 마치 게임에서 세이브 포인트처럼, 값을 저장하고 나중에 다시 불러올 수 있죠!

### 3. 코드 리뷰
작성한 코드가 잘 작동하는지 확인해드려요.

### 4. 에러 해결
에러가 나면 당황하지 마세요! 복사해서 붙여넣기만 하면 해결책을 알려드려요.

## Quick Recipes

### 버튼 만들기
\`\`\`tsx
<button
  onClick={() => alert('클릭!')}
  className="bg-blue-500 text-white px-4 py-2 rounded"
>
  클릭해봐요
</button>
\`\`\`

### API 호출하기
\`\`\`tsx
const [data, setData] = useState(null)

useEffect(() => {
  fetch('/api/hello')
    .then(res => res.json())
    .then(setData)
}, [])
\`\`\`

### 폼 다루기
\`\`\`tsx
const [name, setName] = useState('')

<input
  value={name}
  onChange={(e) => setName(e.target.value)}
  placeholder="이름을 입력하세요"
/>
\`\`\`

## Tips for Vibe Coding

1. **일단 시작하세요** - 완벽한 계획보다 빠른 실행!
2. **에러는 친구** - 에러 메시지가 해결책을 알려줍니다
3. **작게 시작** - 큰 기능은 작은 조각으로 나누세요
4. **자주 저장** - Ctrl+S (또는 Cmd+S)를 습관처럼!
5. **질문하세요** - 모르면 물어보세요, AI가 도와드려요

## Emergency Commands

당황했을 때 쓰는 응급 명령어:

\`\`\`bash
# 뭔가 잘못됐을 때
git checkout .

# 패키지 문제일 때
rm -rf node_modules && pnpm install

# 포트가 이미 사용 중일 때
lsof -i :3000 | xargs kill -9

# 캐시 문제일 때
rm -rf .next && pnpm dev
\`\`\`

## Let's Vibe!

무엇을 만들고 싶으신가요? 🚀
`,
}

async function main() {
  console.log('Adding Vibe Coder Helper skill...')

  try {
    // Check if already exists
    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.id, vibeCoderSkill.id))

    if (existing) {
      console.log('Skill already exists, updating...')
      await db.update(catalogItems)
        .set({ ...vibeCoderSkill, updatedAt: new Date() })
        .where(eq(catalogItems.id, vibeCoderSkill.id))
      console.log('Updated successfully!')
    } else {
      console.log('Creating new skill...')
      await db.insert(catalogItems).values(vibeCoderSkill)
      console.log('Created successfully!')
    }

    // Verify
    const [result] = await db.select().from(catalogItems).where(eq(catalogItems.id, vibeCoderSkill.id))
    console.log('\nSkill details:')
    console.log(`  ID: ${result.id}`)
    console.log(`  Name: ${result.name}`)
    console.log(`  Type: ${result.type}`)
    console.log(`  Difficulty: ${result.difficulty}`)
    console.log(`  Tags: ${result.tags?.join(', ')}`)
    console.log(`  AllowedTools: ${result.allowedTools}`)

  } catch (error) {
    console.error('Failed to add skill:', error)
    process.exit(1)
  }

  process.exit(0)
}

main()
