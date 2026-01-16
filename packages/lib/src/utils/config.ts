const DEFAULT_BASE_URL = 'https://ai-toolkit.gpters.org'

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL
}

export function getMcpServerUrl(): string {
  return `${getBaseUrl()}/api/mcp`
}

export function getMcpCommand(): string {
  return `claude mcp add gpters-ai-toolkit ${getMcpServerUrl()} -t http`
}
