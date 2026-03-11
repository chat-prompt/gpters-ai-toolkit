/**
 * Minimal next/server mock for vitest
 *
 * Provides NextRequest and NextResponse stubs so that modules importing
 * from 'next/server' can be loaded in the happy-dom test environment
 * without hitting the real Next.js runtime.
 */

export class NextRequest extends Request {
  public nextUrl: URL

  constructor(input: string | URL | Request, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    super(url, init)
    this.nextUrl = new URL(url)
  }

  get cookies() {
    return {
      get: (_name: string) => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      has: (_name: string) => false,
    }
  }

  get geo() {
    return {}
  }

  get ip() {
    return '127.0.0.1'
  }
}

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    const body = JSON.stringify(data)
    const headers = new Headers(init?.headers)
    headers.set('content-type', 'application/json')
    return new NextResponse(body, { ...init, headers })
  }

  static redirect(url: string | URL, status = 307) {
    const headers = new Headers()
    headers.set('location', typeof url === 'string' ? url : url.toString())
    return new NextResponse(null, { status, headers })
  }

  static next(init?: { headers?: HeadersInit }) {
    return new NextResponse(null, { ...init })
  }
}
