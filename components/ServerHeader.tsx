import { auth } from '@/lib/auth'
import { Header } from './Header'

// Development mock user
const DEV_BYPASS_AUTH = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'
const DEV_USER = {
  name: 'Dev User',
  email: 'dev@gpters.org',
  image: null,
}

export async function ServerHeader() {
  const session = await auth()
  const user = DEV_BYPASS_AUTH ? DEV_USER : session?.user

  return <Header user={user} />
}
