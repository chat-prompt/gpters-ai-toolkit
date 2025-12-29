type InstallMethod = 'cli' | 'mcp' | 'plugin' | 'manual_content' | 'manual_folder' | 'manual_file'

export async function trackInstall(itemId: string, method: InstallMethod): Promise<void> {
  try {
    await fetch('/api/installations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, method }),
    })
  } catch {
    // Silently fail - tracking shouldn't break the UI
    console.debug('Failed to track installation')
  }
}
