/**
 * readline 기반 대화형 프롬프트 유틸리티
 */

import { createInterface } from 'node:readline'
import type { Scope } from './paths.js'

/**
 * 사용자에게 질문하고 한 줄 입력을 받는다.
 *
 * @param question - 표시할 질문 텍스트
 * @returns 사용자 입력 문자열
 */
function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * 설치 범위를 사용자에게 물어본다.
 *
 * @returns 선택된 scope ('project' 또는 'user')
 */
export async function promptScope(): Promise<Scope> {
  console.log('\n설치 범위를 선택하세요:')
  console.log('  1) project - 현재 프로젝트에만 설치 (.agents/skills/gpters/)')
  console.log('  2) user    - 사용자 전역 설치 (~/.agents/skills/gpters/)')

  const answer = await ask('\n선택 [1/2] (기본: 1): ')

  if (answer === '2' || answer.toLowerCase() === 'user') {
    return 'user'
  }
  return 'project'
}

/**
 * AGENTS.md 생성 여부를 사용자에게 물어본다.
 *
 * @returns true면 생성
 */
export async function promptAgentsMd(): Promise<boolean> {
  const answer = await ask('\nAGENTS.md를 프로젝트에 생성하시겠습니까? [Y/n]: ')
  return answer === '' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}
