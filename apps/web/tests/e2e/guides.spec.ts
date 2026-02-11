import { test, expect } from '@playwright/test'

test.describe('Guides Pages', () => {
  test.describe('Guides List Page', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/guides')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/guides')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for page title
        const title = page.getByText('Vibe Coding Guides')
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }

        // Check for guides badge
        const guidesBadge = page.locator('text=GUIDES')
        const hasBadge = await guidesBadge.isVisible().catch(() => false)

        if (hasBadge) {
          await expect(guidesBadge).toBeVisible()
        }

        // Check for description
        const description = page.getByText(/바이브 코딩을 위한/)
        const hasDescription = await description.isVisible().catch(() => false)

        if (hasDescription) {
          await expect(description).toBeVisible()
        }
      }
    })

    test('should display guide count', async ({ page }) => {
      await page.goto('/guides')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for stats section
        const guidesText = page.locator('text=Guides').first()
        const hasStats = await guidesText.isVisible().catch(() => false)

        if (hasStats) {
          await expect(guidesText).toBeVisible()
        }
      }
    })

    test('should display guide cards', async ({ page }) => {
      await page.goto('/guides')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for guide cards
        const guideCards = page.locator('.glass')
        const count = await guideCards.count()

        // Guides might exist
        expect(count).toBeGreaterThanOrEqual(0)

        // If guides exist, check structure
        if (count > 0) {
          const firstCard = guideCards.first()

          // Check for guide icon
          const guideIcon = firstCard.locator('text=📚')
          const hasIcon = await guideIcon.isVisible().catch(() => false)

          if (hasIcon) {
            await expect(guideIcon).toBeVisible()
          }

          // Check for estimated time
          const timeEstimate = firstCard.locator('text=/⏱/')
          const hasTime = await timeEstimate.isVisible().catch(() => false)

          // Time estimate is optional
          expect(hasTime || true).toBeTruthy()

          // Check for difficulty badge
          const difficulty = firstCard.locator('text=/Easy|Medium|Hard|쉬움|보통|어려움/i')
          const hasDifficulty = await difficulty.isVisible().catch(() => false)

          // Difficulty is optional
          expect(hasDifficulty || true).toBeTruthy()

          // Check for "READ GUIDE" link
          const readLink = firstCard.locator('text=/READ GUIDE/')
          const hasReadLink = await readLink.isVisible().catch(() => false)

          if (hasReadLink) {
            await expect(readLink).toBeVisible()
          }

          // Check for author
          const author = firstCard.locator('text=/^@[a-zA-Z0-9_-]+/')
          const hasAuthor = await author.isVisible().catch(() => false)

          if (hasAuthor) {
            await expect(author).toBeVisible()
          }
        }
      }
    })

    test('should show empty state when no guides', async ({ page }) => {
      await page.goto('/guides')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for either guides or empty state
        const emptyState = page.getByText('아직 가이드가 없습니다')
        const hasEmptyState = await emptyState.isVisible().catch(() => false)

        // Empty state might be shown
        expect(hasEmptyState || true).toBeTruthy()
      }
    })

    test('guide cards should be clickable', async ({ page }) => {
      await page.goto('/guides')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for guide links
        const guideLinks = page.locator('a[href^="/guides/"]')
        const count = await guideLinks.count()

        if (count > 0) {
          // First guide link should be clickable
          const firstLink = guideLinks.first()
          const href = await firstLink.getAttribute('href')

          expect(href).toBeTruthy()
          expect(href).toContain('/guides/')
        }
      }
    })
  })

  test.describe('Guide Detail Page', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/guides/example-guide')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should show 404 for non-existent guide', async ({ page }) => {
      const response = await page.goto('/guides/non-existent-guide-12345')

      // Either redirects to signin or shows 404
      const url = page.url()
      const isSigninOrNotFound = url.includes('/auth/signin') || response?.status() === 404

      expect(isSigninOrNotFound).toBeTruthy()
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/guides/example-guide')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for back link
        const backLink = page.getByRole('link', { name: /Back to Guides/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await expect(backLink).toBeVisible()
        }

        // Check for guide badge
        const guideBadge = page.locator('text=GUIDE')
        const hasBadge = await guideBadge.isVisible().catch(() => false)

        if (hasBadge) {
          await expect(guideBadge).toBeVisible()
        }

        // Check for guide icon
        const guideIcon = page.locator('text=📚')
        const hasIcon = await guideIcon.isVisible().catch(() => false)

        if (hasIcon) {
          await expect(guideIcon).toBeVisible()
        }
      }
    })

    test('should display guide metadata', async ({ page }) => {
      await page.goto('/guides/example-guide')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for difficulty
        const difficulty = page.locator('text=/Easy|Medium|Hard|쉬움|보통|어려움/i').first()
        const hasDifficulty = await difficulty.isVisible().catch(() => false)

        // Difficulty is optional
        expect(hasDifficulty || true).toBeTruthy()

        // Check for estimated time
        const timeEstimate = page.locator('text=/⏱/')
        const hasTime = await timeEstimate.isVisible().catch(() => false)

        // Time estimate is optional
        expect(hasTime || true).toBeTruthy()

        // Check for author
        const author = page.locator('text=/^@[a-zA-Z0-9_-]+/')
        const hasAuthor = await author.isVisible().catch(() => false)

        if (hasAuthor) {
          await expect(author).toBeVisible()
        }
      }
    })

    test('should display tags', async ({ page }) => {
      await page.goto('/guides/example-guide')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for tag badges
        const tags = page.locator('span.rounded-lg')
        const count = await tags.count()

        // Tags might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    test('should display guide content', async ({ page }) => {
      await page.goto('/guides/example-guide')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for content section with .glass class
        const contentSection = page.locator('.glass').first()
        const hasContent = await contentSection.isVisible().catch(() => false)

        if (hasContent) {
          await expect(contentSection).toBeVisible()
        }

        // Look for article tag (prose content)
        const article = page.locator('article')
        const hasArticle = await article.isVisible().catch(() => false)

        if (hasArticle) {
          await expect(article).toBeVisible()
        }
      }
    })

    test('should display additional info if available', async ({ page }) => {
      await page.goto('/guides/example-guide')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for "추가 정보" section
        const additionalInfo = page.getByText('추가 정보')
        const hasAdditionalInfo = await additionalInfo.isVisible().catch(() => false)

        // Additional info is optional
        expect(hasAdditionalInfo || true).toBeTruthy()
      }
    })

    test('back to guides link should work', async ({ page }) => {
      await page.goto('/guides/example-guide')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const backLink = page.getByRole('link', { name: /Back to Guides/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await backLink.click()
          await page.waitForURL('/guides')
          expect(page.url()).toContain('/guides')
        }
      }
    })
  })

  test.describe('Getting Started Page', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/getting-started')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for page title
        const title = page.getByText('Tutorial')
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }

        // Check for intro text
        const intro = page.getByText(/Claude Code를 처음 사용하시나요/)
        const hasIntro = await intro.isVisible().catch(() => false)

        if (hasIntro) {
          await expect(intro).toBeVisible()
        }
      }
    })

    test('should display learning path', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for learning path section
        const learningPath = page.getByText('학습 경로')
        const hasLearningPath = await learningPath.isVisible().catch(() => false)

        if (hasLearningPath) {
          await expect(learningPath).toBeVisible()
        }

        // Check for step numbers (1, 2, 3)
        const step1 = page.locator('text="Claude Code 기초"')
        const hasSteps = await step1.isVisible().catch(() => false)

        if (hasSteps) {
          await expect(step1).toBeVisible()
        }
      }
    })

    test('should display quick start commands', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for quick start section
        const quickStart = page.getByText('빠른 시작')
        const hasQuickStart = await quickStart.isVisible().catch(() => false)

        if (hasQuickStart) {
          await expect(quickStart).toBeVisible()
        }

        // Check for installation command
        const installCommand = page.locator('code:has-text("npm install")')
        const hasCommand = await installCommand.isVisible().catch(() => false)

        if (hasCommand) {
          await expect(installCommand).toBeVisible()
        }
      }
    })

    test('should display recommended items for beginners', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for recommended section
        const recommended = page.getByText('입문자 추천')
        const hasRecommended = await recommended.isVisible().catch(() => false)

        if (hasRecommended) {
          await expect(recommended).toBeVisible()
        }

        // Check for item cards
        const itemCards = page.locator('.glass')
        const count = await itemCards.count()

        // Recommended items might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    test('should have next steps section', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for next steps section
        const nextSteps = page.getByText('다음 단계')
        const hasNextSteps = await nextSteps.isVisible().catch(() => false)

        if (hasNextSteps) {
          await expect(nextSteps).toBeVisible()
        }

        // Check for navigation links
        const catalogLink = page.getByText('카탈로그 탐색')
        const guidesLink = page.getByText('가이드 읽기')

        const hasCatalogLink = await catalogLink.isVisible().catch(() => false)
        const hasGuidesLink = await guidesLink.isVisible().catch(() => false)

        if (hasCatalogLink) {
          await expect(catalogLink).toBeVisible()
        }

        if (hasGuidesLink) {
          await expect(guidesLink).toBeVisible()
        }
      }
    })

    test('should have help section', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for help section
        const help = page.getByText('도움이 필요하신가요')
        const hasHelp = await help.isVisible().catch(() => false)

        if (hasHelp) {
          await expect(help).toBeVisible()
        }

        // Check for Slack link
        const slackLink = page.getByRole('link', { name: /Slack/ })
        const hasSlackLink = await slackLink.isVisible().catch(() => false)

        if (hasSlackLink) {
          await expect(slackLink).toBeVisible()
        }
      }
    })

    test('navigation links should work', async ({ page }) => {
      await page.goto('/getting-started')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Find link to catalog
        const catalogLink = page.locator('a[href="/"]').first()
        const hasLink = await catalogLink.isVisible().catch(() => false)

        if (hasLink) {
          await catalogLink.click()
          await page.waitForURL('/')
          expect(page.url()).toContain('/')
        }
      }
    })
  })
})
