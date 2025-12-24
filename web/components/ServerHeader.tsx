import { auth } from '@/lib/auth'
import { Header } from './Header'

export async function ServerHeader() {
  const session = await auth()

  return <Header user={session?.user} />
}
