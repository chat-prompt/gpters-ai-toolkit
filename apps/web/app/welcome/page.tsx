/**
 * Welcome landing page
 *
 * 외부 Claude Code 사용자에게 AI Toolkit 플랫폼을 소개하고
 * MCP 서버 연결 방법을 안내하는 퍼블릭 랜딩페이지.
 */
import Link from 'next/link'
import { Footer } from '@/components/layout/Footer'
import { CopyButton } from './CopyButton'

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'AI Toolkit'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://ai-toolkit.gpters.org'
const MCP_COMMAND = `claude mcp add gpters-ai-toolkit ${BASE_URL}/api/mcp -t http`

export const metadata = {
  title: `Welcome - ${SITE_NAME}`,
  description: 'Claude Code용 스킬, 에이전트, 커맨드를 공유하는 AI Toolkit 플랫폼에 연결하세요.',
}

/** Feature 카드 데이터 */
const FEATURES = [
  {
    icon: '/',
    label: 'Skills',
    title: '슬래시 커맨드',
    description: '반복 작업을 자동화하는 재사용 가능한 스킬을 검색하고 바로 설치하세요.',
  },
  {
    icon: '@',
    label: 'Agents',
    title: '전문 에이전트',
    description: '코드 리뷰, 디버깅, 리팩토링 등 전문 에이전트를 검색하고 설치하세요.',
  },
  {
    icon: '>',
    label: 'Commands',
    title: '커스텀 커맨드',
    description: '프로젝트별 맞춤 커맨드로 개발 워크플로우를 간소화하세요.',
  },
  {
    icon: '?',
    label: 'Guides',
    title: '활용 가이드',
    description: 'Claude Code 활용 노하우와 베스트 프랙티스를 확인하세요.',
  },
] as const

/** MCP 도구 예시 데이터 */
const TOOL_EXAMPLES = [
  {
    tool: 'search_plugins',
    description: '키워드로 스킬 검색',
    example: 'search_plugins("code review")',
  },
  {
    tool: 'get_plugin_content',
    description: '스킬 전체 내용 조회',
    example: 'get_plugin_content("code-reviewer")',
  },
  {
    tool: 'deploy_skill',
    description: '새 스킬을 배포',
    example: 'deploy_skill(type="skill", name="my-skill", ...)',
  },
  {
    tool: 'check_updates',
    description: '설치된 스킬 업데이트 확인',
    example: 'check_updates(["code-reviewer", "refactor-guide"])',
  },
] as const

export default function WelcomePage() {
  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-24 pb-20 px-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-6">
            {SITE_NAME}
          </p>
          <h1
            className="text-5xl md:text-7xl font-light text-[var(--text-primary)] leading-[1.1] tracking-[-0.03em] mb-6"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
              AI Skills
            </span>{' '}
            Hub
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto mb-10">
            Claude Code용 스킬, 에이전트, 커맨드를 한곳에서 검색하고 공유하세요.
            <br />
            MCP 서버로 연결하면 Claude Code에서 바로 사용할 수 있습니다.
          </p>
          <a
            href="#connect"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-medium bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] text-white hover:opacity-90 transition-opacity"
          >
            Connect Now
            <span aria-hidden="true">&darr;</span>
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            What We Offer
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            네 가지 콘텐츠 타입
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.label}
                className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6 hover:border-[var(--brand-primary)]/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-sm font-mono text-[var(--brand-primary)]">
                    {feature.icon}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    {feature.label}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Connect Section */}
      <section id="connect" className="relative z-10 py-20 px-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            Get Started
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            MCP 서버{' '}
            <span className="bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] bg-clip-text text-transparent font-medium">
              연결하기
            </span>
          </h2>

          {/* Command Box */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-6 mb-10">
            <p className="text-xs text-[var(--text-muted)] mb-3">터미널에서 실행하세요:</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-[var(--bg-secondary)] rounded-lg px-4 py-3 text-sm font-mono text-[var(--text-primary)] overflow-x-auto">
                {MCP_COMMAND}
              </code>
              <CopyButton text={MCP_COMMAND} />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-6">
            {[
              {
                step: '1',
                title: '커맨드 실행',
                description: '위 커맨드를 터미널에 붙여넣어 MCP 서버를 등록합니다.',
              },
              {
                step: '2',
                title: 'Google 로그인',
                description: '브라우저가 열리면 조직 계정(@gpters.org)으로 로그인하세요.',
              },
              {
                step: '3',
                title: '바로 사용',
                description: 'Claude Code에서 스킬 검색, 조회, 배포가 가능해집니다.',
              },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-secondary)] flex items-center justify-center text-white text-sm font-medium">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Inside Section */}
      <section className="relative z-10 py-20 px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[var(--brand-primary)] text-xs font-medium uppercase tracking-[0.3em] mb-4 text-center">
            What&apos;s Inside
          </p>
          <h2
            className="text-3xl md:text-4xl font-light text-[var(--text-primary)] leading-[1.2] tracking-[-0.02em] mb-12 text-center"
            style={{ fontFamily: 'var(--font-newsreader)' }}
          >
            MCP 도구 미리보기
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TOOL_EXAMPLES.map((item) => (
              <div
                key={item.tool}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-sm p-5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-sm font-mono font-semibold text-[var(--brand-primary)]">
                    {item.tool}
                  </code>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-3">{item.description}</p>
                <pre className="bg-[var(--bg-secondary)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text-muted)] overflow-x-auto">
                  {item.example}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--border-subtle)] py-8">
        <div className="max-w-7xl mx-auto px-8 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">{SITE_NAME}</p>
          <div className="flex items-center gap-4">
            <Link
              href="/terms"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Privacy
            </Link>
            <p className="text-xs text-[var(--text-muted)]">{SITE_NAME}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
