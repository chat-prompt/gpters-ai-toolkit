import { describe, it, expect } from 'vitest'
import { parseExamplesFromContent, type Example } from '@/lib/search/parse-examples'

describe('parseExamplesFromContent', () => {
  describe('Section Detection', () => {
    it('should detect ## Examples section', () => {
      const content = `
# Title

Some intro text.

## Examples

### Example 1

\`\`\`javascript
console.log('hello')
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBeGreaterThan(0)
    })

    it('should detect ## 예시 section (Korean)', () => {
      const content = `
# 제목

소개 텍스트

## 예시

### 예제 1

\`\`\`python
print('안녕')
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBeGreaterThan(0)
    })

    it('should detect ## Usage section', () => {
      const content = `
# Tool

## Usage

\`\`\`bash
tool --help
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBeGreaterThan(0)
    })

    it('should detect ## 사용 예시 section', () => {
      const content = `
# 도구

## 사용 예시

\`\`\`bash
command run
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBeGreaterThan(0)
    })

    it('should detect ### Examples section (h3)', () => {
      const content = `
# Title

## Details

### Examples

\`\`\`javascript
code here
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBeGreaterThan(0)
    })

    it('should return empty array when no examples section found', () => {
      const content = `
# Title

Just some regular content without examples.

## Other Section

More content here.
`
      const examples = parseExamplesFromContent(content)
      expect(examples).toEqual([])
    })

    it('should stop at next ## heading', () => {
      const content = `
# Title

## Examples

\`\`\`javascript
example code
\`\`\`

## Next Section

\`\`\`javascript
this should not be included
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(1)
      expect(examples[0].code).toBe('example code')
    })
  })

  describe('Sub-heading Based Examples', () => {
    it('should parse examples with ### sub-headings', () => {
      const content = `
## Examples

### Basic Usage

\`\`\`javascript
const x = 1
\`\`\`

### Advanced Usage

\`\`\`javascript
const y = complex()
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(2)
      expect(examples[0].title).toBe('Basic Usage')
      expect(examples[1].title).toBe('Advanced Usage')
    })

    it('should assign sequential IDs to examples', () => {
      const content = `
## Examples

### First

\`\`\`js
a
\`\`\`

### Second

\`\`\`js
b
\`\`\`

### Third

\`\`\`js
c
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].id).toBe('example-1')
      expect(examples[1].id).toBe('example-2')
      expect(examples[2].id).toBe('example-3')
    })

    it('should extract description before code block', () => {
      const content = `
## Examples

### Greeting Example

This example shows how to greet users.

\`\`\`javascript
console.log('Hello!')
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].description).toContain('how to greet users')
    })
  })

  describe('Input/Output Pair Detection', () => {
    it('should detect input/output pairs with "output" label', () => {
      const content = `
## Examples

\`\`\`javascript
add(1, 2)
\`\`\`

Output:

\`\`\`
3
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(1)
      expect(examples[0].input).toBe('add(1, 2)')
      expect(examples[0].output).toBe('3')
    })

    it('should detect input/output pairs with "결과" label (Korean)', () => {
      const content = `
## 예시

\`\`\`python
sum([1, 2, 3])
\`\`\`

결과:

\`\`\`
6
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].input).toBe('sum([1, 2, 3])')
      expect(examples[0].output).toBe('6')
    })

    it('should detect input/output pairs with "response" label', () => {
      const content = `
## Examples

\`\`\`json
{"action": "test"}
\`\`\`

Response:

\`\`\`json
{"status": "ok"}
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].input).toBe('{"action": "test"}')
      expect(examples[0].output).toBe('{"status": "ok"}')
    })

    it('should detect input/output pairs with "출력" label', () => {
      const content = `
## 사용법

\`\`\`bash
echo "hello"
\`\`\`

출력:

\`\`\`
hello
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].input).toBe('echo "hello"')
      expect(examples[0].output).toBe('hello')
    })
  })

  describe('Single Code Block Examples', () => {
    it('should parse single code block as code', () => {
      const content = `
## Examples

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(1)
      expect(examples[0].code).toContain('def hello()')
      expect(examples[0].input).toBeUndefined()
      expect(examples[0].output).toBeUndefined()
    })

    it('should extract language from code fence', () => {
      const content = `
## Examples

\`\`\`typescript
const x: number = 5
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].language).toBe('typescript')
    })

    it('should handle code blocks without language specified', () => {
      const content = `
## Examples

\`\`\`
plain code here
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].code).toBe('plain code here')
      expect(examples[0].language).toBeUndefined()
    })

    it('should parse multiple separate code blocks as separate examples', () => {
      const content = `
## Examples

\`\`\`javascript
first()
\`\`\`

Some text between.

\`\`\`javascript
second()
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(2)
      expect(examples[0].code).toBe('first()')
      expect(examples[1].code).toBe('second()')
    })
  })

  describe('Labeled Input/Output in Sub-sections', () => {
    it('should detect input label before code block', () => {
      const content = `
## Examples

### API Call

Input:

\`\`\`json
{"query": "test"}
\`\`\`

Output:

\`\`\`json
{"result": "success"}
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].input).toBe('{"query": "test"}')
      expect(examples[0].output).toBe('{"result": "success"}')
    })

    it('should detect Korean labels (입력/출력)', () => {
      const content = `
## 예시

### 함수 호출

입력:

\`\`\`python
calculate(5)
\`\`\`

출력:

\`\`\`
25
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].input).toBe('calculate(5)')
      expect(examples[0].output).toBe('25')
    })

    it('should detect command/result labels', () => {
      const content = `
## Examples

### Run Command

Command:

\`\`\`bash
ls -la
\`\`\`

Result:

\`\`\`
total 0
drwxr-xr-x  2 user user 40 Jan  1 00:00 .
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].input).toContain('ls -la')
      expect(examples[0].output).toContain('total 0')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const examples = parseExamplesFromContent('')
      expect(examples).toEqual([])
    })

    it('should handle content with only whitespace in examples section', () => {
      const content = `
## Examples



`
      const examples = parseExamplesFromContent(content)
      expect(examples).toEqual([])
    })

    it('should handle examples section with no code blocks', () => {
      const content = `
## Examples

Just some text without any code blocks.
`
      const examples = parseExamplesFromContent(content)
      expect(examples).toEqual([])
    })

    it('should handle malformed code blocks gracefully', () => {
      const content = `
## Examples

\`\`\`javascript
unclosed code block
`
      const examples = parseExamplesFromContent(content)
      // Should not crash, may return empty or partial
      expect(Array.isArray(examples)).toBe(true)
    })

    it('should preserve code block content exactly', () => {
      const codeContent = `function test() {
  const x = 1;
  return x + 2;
}`
      const content = `
## Examples

\`\`\`javascript
${codeContent}
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples[0].code).toBe(codeContent)
    })

    it('should handle Example singular form', () => {
      const content = `
## Example

\`\`\`python
code
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(1)
    })

    it('should handle Example Usage section', () => {
      const content = `
## Example Usage

\`\`\`javascript
usage()
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(1)
    })

    it('should handle 사용법 section', () => {
      const content = `
## 사용법

\`\`\`bash
command
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(1)
    })
  })

  describe('Complex Content', () => {
    it('should handle real-world skill example content', () => {
      const content = `
# Code Review Skill

This skill helps review code for best practices.

## Features

- Checks for common issues
- Suggests improvements

## Examples

### Basic Review

Request a code review:

\`\`\`
Review my Python function for best practices
\`\`\`

Output:

\`\`\`
Code looks good, consider adding type hints.
\`\`\`

### Security Check

\`\`\`
Check this code for security vulnerabilities
\`\`\`

## Configuration

Some config details here.
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(2)
      expect(examples[0].title).toBe('Basic Review')
      expect(examples[0].description).toContain('Request a code review')
      expect(examples[1].title).toBe('Security Check')
    })

    it('should handle mixed language code blocks', () => {
      const content = `
## Examples

\`\`\`python
def python_func():
    pass
\`\`\`

\`\`\`javascript
function jsFunc() {}
\`\`\`

\`\`\`rust
fn rust_func() {}
\`\`\`
`
      const examples = parseExamplesFromContent(content)
      expect(examples.length).toBe(3)
      expect(examples[0].language).toBe('python')
      expect(examples[1].language).toBe('javascript')
      expect(examples[2].language).toBe('rust')
    })
  })
})
