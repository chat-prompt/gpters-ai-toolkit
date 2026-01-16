/**
 * Installation tracking utility
 *
 * Client-side function for tracking catalog item installations
 * with various installation methods for analytics purposes.
 */

/** Available installation methods for tracking */
type InstallMethod = 'cli' | 'mcp' | 'plugin' | 'manual_content' | 'manual_folder' | 'manual_file'

/**
 * Track a catalog item installation event
 *
 * @param itemId - ID of the installed catalog item
 * @param method - Installation method used
 */
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
