/**
 * Shared utility for parsing examples from content.
 * This is kept separate from the client component so it can be used on the server.
 */

export interface Example {
  id: string
  title?: string
  description?: string
  input?: string
  output?: string
  code?: string
  language?: string
}

/**
 * Extracts examples from markdown content
 * Looks for ## Examples, ## 예시, ## Usage, ## 사용 예시 sections
 */
export function parseExamplesFromContent(content: string): Example[] {
  const examples: Example[] = []

  // Pattern to match example sections
  const sectionPatterns = [
    /^##\s*(Examples?|예시|Usage|사용\s*예시|Example Usage|사용법)\s*$/im,
    /^###\s*(Examples?|예시|Usage|사용\s*예시|Example Usage|사용법)\s*$/im,
  ]

  let exampleSection = ''

  // Find the examples section in the content
  for (const pattern of sectionPatterns) {
    const match = content.match(pattern)
    if (match && match.index !== undefined) {
      // Get content from this section until the next ## heading
      const startIndex = match.index + match[0].length
      const remainingContent = content.slice(startIndex)
      const nextSectionMatch = remainingContent.match(/^##\s+/m)

      if (nextSectionMatch && nextSectionMatch.index !== undefined) {
        exampleSection = remainingContent.slice(0, nextSectionMatch.index)
      } else {
        exampleSection = remainingContent
      }
      break
    }
  }

  if (!exampleSection.trim()) {
    return examples
  }

  // Parse individual examples from the section
  // Strategy 1: Look for ### sub-headings as individual examples
  const subHeadingPattern = /^###\s+(.+)$/gm
  const subHeadings = [...exampleSection.matchAll(subHeadingPattern)]

  if (subHeadings.length > 0) {
    // Parse examples by sub-headings
    subHeadings.forEach((match, index) => {
      const startIndex = (match.index ?? 0) + match[0].length
      const endIndex = index < subHeadings.length - 1
        ? subHeadings[index + 1].index ?? exampleSection.length
        : exampleSection.length

      const exampleContent = exampleSection.slice(startIndex, endIndex).trim()
      const parsed = parseExampleContent(exampleContent, match[1].trim())

      if (parsed) {
        examples.push({
          ...parsed,
          id: `example-${index + 1}`,
          title: match[1].trim(),
        })
      }
    })
  } else {
    // Strategy 2: Look for code blocks directly
    const codeBlockPattern = /```(\w*)\n([\s\S]*?)```/g
    const codeBlocks = [...exampleSection.matchAll(codeBlockPattern)]

    if (codeBlocks.length > 0) {
      // Group code blocks as input/output pairs or individual examples
      let exampleIndex = 0
      let i = 0

      while (i < codeBlocks.length) {
        const current = codeBlocks[i]
        const currentLang = current[1] || ''
        const currentCode = current[2].trim()

        // Check if next block could be output
        const next = codeBlocks[i + 1]
        const textBetween = next
          ? exampleSection.slice(
              (current.index ?? 0) + current[0].length,
              next.index ?? exampleSection.length
            ).toLowerCase()
          : ''

        const isNextOutput = textBetween.includes('output') ||
                            textBetween.includes('결과') ||
                            textBetween.includes('response') ||
                            textBetween.includes('출력')

        if (next && isNextOutput) {
          // Input/output pair
          examples.push({
            id: `example-${++exampleIndex}`,
            input: currentCode,
            output: next[2].trim(),
            language: currentLang || next[1] || undefined,
          })
          i += 2
        } else {
          // Single code block
          examples.push({
            id: `example-${++exampleIndex}`,
            code: currentCode,
            language: currentLang || undefined,
          })
          i += 1
        }
      }
    }
  }

  return examples
}

/**
 * Parse a single example's content for input/output blocks
 */
function parseExampleContent(content: string, _title?: string): Partial<Example> | null {
  const codeBlockPattern = /```(\w*)\n([\s\S]*?)```/g
  const codeBlocks = [...content.matchAll(codeBlockPattern)]

  if (codeBlocks.length === 0) {
    return null
  }

  // Look for input/output labels
  const inputLabels = ['input', 'request', 'command', '입력', '요청', '명령']
  const outputLabels = ['output', 'response', 'result', '출력', '결과', '응답']

  let input: string | undefined
  let output: string | undefined
  let code: string | undefined
  let language: string | undefined
  let description: string | undefined

  // Extract description (text before first code block)
  if (codeBlocks[0].index && codeBlocks[0].index > 0) {
    const descText = content.slice(0, codeBlocks[0].index).trim()
    if (descText) {
      description = descText
    }
  }

  // Categorize code blocks
  codeBlocks.forEach((block, index) => {
    const blockStart = block.index ?? 0
    const textBefore = content.slice(
      index > 0 ? (codeBlocks[index - 1].index ?? 0) + codeBlocks[index - 1][0].length : 0,
      blockStart
    ).toLowerCase()

    const lang = block[1] || ''
    const blockCode = block[2].trim()

    if (!language && lang) {
      language = lang
    }

    const isInput = inputLabels.some(label => textBefore.includes(label))
    const isOutput = outputLabels.some(label => textBefore.includes(label))

    if (isInput && !input) {
      input = blockCode
    } else if (isOutput && !output) {
      output = blockCode
    } else if (!code && !input && !output) {
      // First unlabeled block - could be input or standalone code
      if (codeBlocks.length > 1) {
        input = blockCode
      } else {
        code = blockCode
      }
    } else if (!output && input) {
      // Second block after input, assume it's output
      output = blockCode
    }
  })

  // If we have input but no output, and there was only one block, use it as code
  if (input && !output && codeBlocks.length === 1) {
    code = input
    input = undefined
  }

  if (!input && !output && !code) {
    return null
  }

  return { input, output, code, language, description }
}
