/**
 * Device authorization page layout with shared header
 */
import { ServerHeader } from '@/components/layout/ServerHeader'

export default function DeviceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServerHeader />
      {children}
    </>
  )
}
