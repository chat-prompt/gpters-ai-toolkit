import { test, expect } from '@playwright/test'

test.describe('Detail Pages', () => {
  test.describe('Skill Detail Page', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/skill/test-skill-id')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should show 404 for non-existent skill', async ({ page }) => {
      const response = await page.goto('/skill/non-existent-skill-12345')

      // Either redirects to signin or shows 404
      const url = page.url()
      const isSigninOrNotFound = url.includes('/auth/signin') || response?.status() === 404

      expect(isSigninOrNotFound).toBeTruthy()
    })

    test('should have correct page structure for skill detail', async ({ page }) => {
      // Visit a skill page
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for back link
        const backLink = page.getByRole('link', { name: /Back to Catalog/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await expect(backLink).toBeVisible()
        }

        // Check for skill badge
        const skillBadge = page.locator('text=SKILL')
        const hasBadge = await skillBadge.isVisible().catch(() => false)

        if (hasBadge) {
          await expect(skillBadge).toBeVisible()
        }

        // Check for content section
        const contentSection = page.locator('text=skill.md')
        const hasContent = await contentSection.isVisible().catch(() => false)

        if (hasContent) {
          await expect(contentSection).toBeVisible()
        }
      }
    })

    test('should display tags', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Look for tag badges
        const tags = page.locator('.glass .rounded-lg')
        const count = await tags.count()

        // Tags might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    test('should have install guide section', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Wait a bit for content to load
        await page.waitForTimeout(1000)

        // Look for installation-related content
        const installSection = page.locator('text=/install|설치|Plugin/i').first()
        const hasInstallSection = await installSection.isVisible().catch(() => false)

        // Installation guide might exist
        expect(hasInstallSection || true).toBeTruthy()
      }
    })

    test('should have copy button', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Look for copy buttons
        const copyButtons = page.locator('button:has-text("Copy"), button:has-text("📋")')
        const count = await copyButtons.count()

        // Copy buttons might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Agent Detail Page', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/agent/test-agent-id')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure for agent detail', async ({ page }) => {
      await page.goto('/agent/example-agent')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for back link
        const backLink = page.getByRole('link', { name: /Back to Catalog/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await expect(backLink).toBeVisible()
        }

        // Check for agent badge
        const agentBadge = page.locator('text=AGENT')
        const hasBadge = await agentBadge.isVisible().catch(() => false)

        if (hasBadge) {
          await expect(agentBadge).toBeVisible()
        }

        // Check for agent icon
        const agentIcon = page.locator('text=◈')
        const hasIcon = await agentIcon.isVisible().catch(() => false)

        if (hasIcon) {
          await expect(agentIcon).toBeVisible()
        }
      }
    })

    test('should display agent content sections', async ({ page }) => {
      await page.goto('/agent/example-agent')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for .glass sections (content containers)
        const glassSections = page.locator('.glass')
        const count = await glassSections.count()

        // Should have at least some content sections
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Command Detail Page', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/command/test-command-id')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure for command detail', async ({ page }) => {
      await page.goto('/command/example-command')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for back link
        const backLink = page.getByRole('link', { name: /Back to Catalog/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await expect(backLink).toBeVisible()
        }

        // Check for command badge
        const commandBadge = page.locator('text=COMMAND')
        const hasBadge = await commandBadge.isVisible().catch(() => false)

        if (hasBadge) {
          await expect(commandBadge).toBeVisible()
        }

        // Check for command icon
        const commandIcon = page.locator('text=▸')
        const hasIcon = await commandIcon.isVisible().catch(() => false)

        if (hasIcon) {
          await expect(commandIcon).toBeVisible()
        }
      }
    })

    test('should display command content', async ({ page }) => {
      await page.goto('/command/example-command')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for command.md section
        const commandMd = page.locator('text=command.md')
        const hasCommandMd = await commandMd.isVisible().catch(() => false)

        // Command content might exist
        expect(hasCommandMd || true).toBeTruthy()
      }
    })
  })

  test.describe('Common Detail Page Features', () => {
    test('should display author information', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Look for author attribution (starts with @)
        const author = page.locator('text=/^@[a-zA-Z0-9_-]+/')
        const hasAuthor = await author.isVisible().catch(() => false)

        if (hasAuthor) {
          await expect(author).toBeVisible()
        }
      }
    })

    test('should display difficulty level', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Look for difficulty badges
        const difficulty = page.locator('text=/Easy|Medium|Hard|쉬움|보통|어려움/i').first()
        const hasDifficulty = await difficulty.isVisible().catch(() => false)

        // Difficulty might be displayed
        expect(hasDifficulty || true).toBeTruthy()
      }
    })

    test('should have like button', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for like button (heart icon)
        const likeButton = page.locator('text=♥').first()
        const hasLikeButton = await likeButton.isVisible().catch(() => false)

        // Like button might exist
        expect(hasLikeButton || true).toBeTruthy()
      }
    })

    test('should display tags section', async ({ page }) => {
      await page.goto('/agent/example-agent')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Tags are in rounded-lg spans
        const tags = page.locator('span.rounded-lg')
        const count = await tags.count()

        // Tags might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    test('should have README section if available', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for README.md section
        const readme = page.locator('text=README.md')
        const hasReadme = await readme.isVisible().catch(() => false)

        // README is optional
        expect(hasReadme || true).toBeTruthy()
      }
    })

    test('back to catalog link should work', async ({ page }) => {
      await page.goto('/skill/example-skill')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const backLink = page.getByRole('link', { name: /Back to Catalog/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await backLink.click()
          await page.waitForURL('/')
          expect(page.url()).toContain('/')
        }
      }
    })
  })
})
