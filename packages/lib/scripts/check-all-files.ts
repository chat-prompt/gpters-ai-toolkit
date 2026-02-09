import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

type FileType = 'script' | 'reference' | 'template' | 'config'

interface PluginFile {
  name: string
  content: string
  type?: string
}

// 파일명에서 타입 추론
function inferFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase()
  const name = filename.toLowerCase()
  
  // Script patterns
  if (['js', 'mjs', 'cjs', 'ts', 'sh', 'bash', 'py', 'rb'].includes(ext || '')) {
    return 'script'
  }
  if (name.includes('scripts/') || name.startsWith('script')) {
    return 'script'
  }
  
  // Config patterns
  if (['json', 'yaml', 'yml', 'toml'].includes(ext || '') && 
      (name.includes('config') || name.includes('mcp-') || name.includes('settings'))) {
    return 'config'
  }
  
  // Template patterns
  if (name.includes('template') || name.includes('templates/') || name.includes('assets/')) {
    return 'template'
  }
  
  // Reference patterns (markdown, docs)
  if (['md', 'txt', 'rst'].includes(ext || '') || name.includes('reference') || name.includes('guide')) {
    return 'reference'
  }
  
  return 'reference' // default
}

async function main() {
  console.log('=== DB Files 검사 ===\n')
  
  const items = await sql`
    SELECT id, name, type, files 
    FROM catalog_items 
    WHERE files IS NOT NULL AND jsonb_array_length(files) > 0
    ORDER BY name
  `
  
  console.log(`총 ${items.length}개 아이템에 files가 있습니다.\n`)
  
  const issues: Array<{
    itemId: string
    itemName: string
    itemType: string
    fileName: string
    currentType: string | undefined
    expectedType: FileType
    issue: string
  }> = []
  
  for (const item of items) {
    const files = item.files as PluginFile[]
    
    console.log(`📦 ${item.name} (${item.type})`)
    console.log(`   ID: ${item.id}`)
    
    for (const file of files) {
      const currentType = file.type
      const inferredType = inferFileType(file.name)
      
      let status = '✅'
      let issue = ''
      
      if (!currentType) {
        status = '⚠️'
        issue = 'type 미지정'
        issues.push({
          itemId: item.id,
          itemName: item.name,
          itemType: item.type,
          fileName: file.name,
          currentType,
          expectedType: inferredType,
          issue
        })
      } else if (!['script', 'reference', 'template', 'config'].includes(currentType)) {
        status = '❌'
        issue = `비표준 타입: "${currentType}"`
        issues.push({
          itemId: item.id,
          itemName: item.name,
          itemType: item.type,
          fileName: file.name,
          currentType,
          expectedType: inferredType,
          issue
        })
      }
      
      console.log(`   ${status} ${file.name}`)
      console.log(`      type: ${currentType || '(없음)'} → 추론: ${inferredType}${issue ? ` [${issue}]` : ''}`)
    }
    console.log()
  }
  
  if (issues.length > 0) {
    console.log('\n=== 수정 필요한 항목 ===\n')
    console.log('| 아이템 | 파일 | 현재 | 권장 | 이슈 |')
    console.log('|--------|------|------|------|------|')
    for (const issue of issues) {
      console.log(`| ${issue.itemName} | \`${issue.fileName}\` | ${issue.currentType || '(없음)'} | ${issue.expectedType} | ${issue.issue} |`)
    }
  } else {
    console.log('\n✅ 모든 파일의 타입이 올바르게 설정되어 있습니다.')
  }
}

main().catch(console.error)
