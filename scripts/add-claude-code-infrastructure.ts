import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { db, catalogItems } from '../lib/db'
import { readFileSync } from 'fs'
import { join } from 'path'

async function addClaudeCodeInfrastructure() {
  const pluginDir = join(__dirname, '../plugins/claude-code-infrastructure')

  // README.md를 메인 content로 사용
  const readmeContent = readFileSync(join(pluginDir, 'README.md'), 'utf-8')

  // Skills 내용도 합쳐서 포함
  const devDocsSkill = readFileSync(
    join(pluginDir, 'skills/dev-docs-pattern/SKILL.md'),
    'utf-8'
  )
  const hooksGuideSkill = readFileSync(
    join(pluginDir, 'skills/hooks-guide/SKILL.md'),
    'utf-8'
  )
  const skillActivationSkill = readFileSync(
    join(pluginDir, 'skills/skill-activation/SKILL.md'),
    'utf-8'
  )

  // 템플릿들
  const planTemplate = readFileSync(
    join(pluginDir, 'skills/dev-docs-pattern/resources/plan-template.md'),
    'utf-8'
  )
  const contextTemplate = readFileSync(
    join(pluginDir, 'skills/dev-docs-pattern/resources/context-template.md'),
    'utf-8'
  )
  const tasksTemplate = readFileSync(
    join(pluginDir, 'skills/dev-docs-pattern/resources/tasks-template.md'),
    'utf-8'
  )

  // skill-rules 예시
  const skillRulesExample = readFileSync(
    join(pluginDir, 'skills/skill-activation/resources/skill-rules-example.json'),
    'utf-8'
  )

  // Hook 스크립트들
  const buildCheckSh = readFileSync(
    join(pluginDir, 'hooks/build-check.sh'),
    'utf-8'
  )
  const skillActivationSh = readFileSync(
    join(pluginDir, 'hooks/skill-activation-prompt.sh'),
    'utf-8'
  )

  // 전체 content 조합
  const fullContent = `${readmeContent}

---

# Skills

## Dev Docs Pattern

${devDocsSkill}

### Templates

#### plan-template.md

\`\`\`markdown
${planTemplate}
\`\`\`

#### context-template.md

\`\`\`markdown
${contextTemplate}
\`\`\`

#### tasks-template.md

\`\`\`markdown
${tasksTemplate}
\`\`\`

---

## Hooks Guide

${hooksGuideSkill}

---

## Skills Auto-Activation

${skillActivationSkill}

### skill-rules-example.json

\`\`\`json
${skillRulesExample}
\`\`\`

---

# Hook Scripts

## build-check.sh

\`\`\`bash
${buildCheckSh}
\`\`\`

## skill-activation-prompt.sh

\`\`\`bash
${skillActivationSh}
\`\`\`
`

  const newItem = {
    id: 'claude-code-infrastructure',
    type: 'skill' as const,
    name: 'Claude Code Infrastructure',
    description: '6개월간의 실전 사용에서 검증된 Claude Code 인프라 패턴: Dev Docs, Skills Auto-Activation, Build Check Hooks',
    author: 'gpters-team',
    tags: ['infrastructure', 'dev-docs', 'hooks', 'skill-activation', 'context', 'workflow', 'productivity'],
    teamTag: 'infra' as const,
    difficulty: 'medium' as const,
    pluginId: 'claude-code-infrastructure',
    content: fullContent,
    allowedTools: 'Read,Write,Edit,Bash',
    marketplaceEnabled: true,
    marketplaceVersion: '1.0.0',
  }

  try {
    await db.insert(catalogItems).values(newItem).onConflictDoUpdate({
      target: catalogItems.id,
      set: {
        name: newItem.name,
        description: newItem.description,
        content: newItem.content,
        tags: newItem.tags,
        teamTag: newItem.teamTag,
        allowedTools: newItem.allowedTools,
        marketplaceVersion: newItem.marketplaceVersion,
        updatedAt: new Date(),
      },
    })
    console.log('✅ claude-code-infrastructure added successfully!')
  } catch (error) {
    console.error('❌ Failed to add:', error)
    process.exit(1)
  }

  process.exit(0)
}

addClaudeCodeInfrastructure()
