/**
 * Profile page layout with shared header
 */
import { ServerHeader } from '@/components/layout/ServerHeader'

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServerHeader />
      {children}
    </>
  )
}
