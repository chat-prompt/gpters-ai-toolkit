/**
 * Getting started page
 *
 * Interactive onboarding guide for setting up the MCP server
 * integration and Claude Code hooks with step-by-step instructions.
 */
import { ServerHeader } from '@/components/layout/ServerHeader'
import { auth } from '@/lib/core/auth'
import { GettingStartedContent } from './GettingStartedContent'

/** Internal email domain for full plugin access (empty = no internal features) */
const INTERNAL_DOMAIN = process.env.INTERNAL_ORGANIZATION_DOMAIN || ''

export default async function GettingStartedPage() {
  const session = await auth()
  const email = session?.user?.email ?? ''
  const isInternal = INTERNAL_DOMAIN ? email.endsWith(`@${INTERNAL_DOMAIN}`) : false

  return (
    <div className="min-h-screen grid-pattern noise-overlay">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[var(--accent-purple)] opacity-[0.03] blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] rounded-full" />
      </div>

      <ServerHeader />

      <main className="relative z-10 max-w-3xl mx-auto px-8 py-12">
        <GettingStartedContent isInternal={isInternal} />
      </main>
    </div>
  )
}
