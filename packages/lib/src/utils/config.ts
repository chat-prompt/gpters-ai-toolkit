export function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BASE_URL
  if (!url) {
    if (typeof window === 'undefined') {
      throw new Error('NEXT_PUBLIC_BASE_URL environment variable is required')
    }
    return window.location.origin
  }
  return url
}

export function getMcpServerUrl(): string {
  return `${getBaseUrl()}/api/mcp`
}

export function getMcpCommand(): string {
  return `claude mcp add gpters-ai-toolkit ${getMcpServerUrl()} -t http`
}
