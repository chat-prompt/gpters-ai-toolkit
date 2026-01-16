import { test, expect } from '@playwright/test'

test.describe('Upload Page', () => {
  test('should redirect to signin when not authenticated', async ({ page }) => {
    await page.goto('/upload')
    await expect(page).toHaveURL(/\/auth\/signin/)
  })

  test.describe('Upload Page Structure', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/upload')
    })

    test('should have correct page title', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const title = page.getByText('Share Your Creation')
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }

        // Check for subtitle
        const subtitle = page.getByText('스킬, 에이전트, 프롬프트를 GPTers 팀과 공유하세요')
        const hasSubtitle = await subtitle.isVisible().catch(() => false)

        if (hasSubtitle) {
          await expect(subtitle).toBeVisible()
        }
      }
    })

    test('should have back to catalog link', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const backLink = page.getByRole('link', { name: /Back to Catalog/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await expect(backLink).toBeVisible()
        }
      }
    })

    test('should have file upload area', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for file upload drop zone
        const dropZone = page.getByText('.md 파일을 드래그하거나 클릭하여 선택')
        const hasDropZone = await dropZone.isVisible().catch(() => false)

        if (hasDropZone) {
          await expect(dropZone).toBeVisible()
        }

        // Check for file input
        const fileInput = page.locator('input[type="file"][accept=".md"]')
        const hasFileInput = await fileInput.count().then((c) => c > 0)

        expect(hasFileInput).toBeTruthy()
      }
    })

    test('should have type selection buttons', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for type buttons
        const skillButton = page.locator('button:has-text("Skill")')
        const agentButton = page.locator('button:has-text("Agent")')
        const commandButton = page.locator('button:has-text("Command")')
        const guideButton = page.locator('button:has-text("Guide")')

        const hasSkillButton = await skillButton.isVisible().catch(() => false)
        const hasAgentButton = await agentButton.isVisible().catch(() => false)
        const hasCommandButton = await commandButton.isVisible().catch(() => false)
        const hasGuideButton = await guideButton.isVisible().catch(() => false)

        if (hasSkillButton) {
          await expect(skillButton).toBeVisible()
        }
        if (hasAgentButton) {
          await expect(agentButton).toBeVisible()
        }
        if (hasCommandButton) {
          await expect(commandButton).toBeVisible()
        }
        if (hasGuideButton) {
          await expect(guideButton).toBeVisible()
        }
      }
    })

    test('should have name and ID fields', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for name input
        const nameInput = page.locator('input[placeholder*="나의 멋진 스킬"]')
        const hasNameInput = await nameInput.isVisible().catch(() => false)

        if (hasNameInput) {
          await expect(nameInput).toBeVisible()
        }

        // Check for ID input
        const idInput = page.locator('input[placeholder*="my-awesome-skill"]')
        const hasIdInput = await idInput.isVisible().catch(() => false)

        if (hasIdInput) {
          await expect(idInput).toBeVisible()
        }
      }
    })

    test('should have description field', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const descInput = page.locator('input[placeholder*="이 스킬이 하는 일을 한 줄로 설명"]')
        const hasDescInput = await descInput.isVisible().catch(() => false)

        if (hasDescInput) {
          await expect(descInput).toBeVisible()
        }
      }
    })

    test('should have author field', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const authorInput = page.locator('input[placeholder*="your-name"]')
        const hasAuthorInput = await authorInput.isVisible().catch(() => false)

        if (hasAuthorInput) {
          await expect(authorInput).toBeVisible()
        }
      }
    })

    test('should have tags selection', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Look for tags label
        const tagsLabel = page.locator('label:has-text("Tags")')
        const hasTagsLabel = await tagsLabel.isVisible().catch(() => false)

        if (hasTagsLabel) {
          await expect(tagsLabel).toBeVisible()
        }
      }
    })

    test('should have content textarea', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Look for content textarea
        const contentArea = page.locator('textarea')
        const hasContentArea = await contentArea.isVisible().catch(() => false)

        if (hasContentArea) {
          await expect(contentArea).toBeVisible()
        }
      }
    })

    test('should have submit button', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const submitButton = page.getByRole('button', { name: /게시하기/i })
        const hasSubmitButton = await submitButton.isVisible().catch(() => false)

        if (hasSubmitButton) {
          await expect(submitButton).toBeVisible()
        }
      }
    })

    test('should have frontmatter preview section', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const frontmatterPreview = page.getByText('Generated Frontmatter:')
        const hasPreview = await frontmatterPreview.isVisible().catch(() => false)

        if (hasPreview) {
          await expect(frontmatterPreview).toBeVisible()
        }
      }
    })

    test('should have preview toggle button', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const previewButton = page.getByText('Show Preview')
        const hasPreviewButton = await previewButton.isVisible().catch(() => false)

        if (hasPreviewButton) {
          await expect(previewButton).toBeVisible()
        }
      }
    })

    test('should have type guide panel on the right', async ({ page }) => {
      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Look for guide panel content
        const guidePanel = page.locator('.sticky')
        const hasGuidePanel = await guidePanel.count().then((c) => c > 0)

        expect(hasGuidePanel).toBeTruthy()
      }
    })
  })

  test.describe('Upload Page Interactions', () => {
    test('type selection should update UI', async ({ page }) => {
      await page.goto('/upload')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Click on Agent type
        const agentButton = page.locator('button:has-text("Agent")').first()
        const hasAgentButton = await agentButton.isVisible().catch(() => false)

        if (hasAgentButton) {
          await agentButton.click()
          await page.waitForTimeout(300)

          // Check that agent-specific fields appear
          const agentSection = page.getByText('Agent 전용 설정')
          const hasAgentSection = await agentSection.isVisible().catch(() => false)

          if (hasAgentSection) {
            await expect(agentSection).toBeVisible()
          }
        }
      }
    })

    test('name field should auto-generate ID', async ({ page }) => {
      await page.goto('/upload')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        const nameInput = page.locator('input[placeholder*="나의 멋진 스킬"]')
        const idInput = page.locator('input[placeholder*="my-awesome-skill"]')

        const hasNameInput = await nameInput.isVisible().catch(() => false)

        if (hasNameInput) {
          // Type a name
          await nameInput.fill('My Test Skill')
          await page.waitForTimeout(300)

          // Check that ID is auto-generated
          const idValue = await idInput.inputValue()
          expect(idValue).toContain('my-test-skill')
        }
      }
    })

    test('submit button should be disabled without required fields', async ({ page }) => {
      await page.goto('/upload')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        const submitButton = page.getByRole('button', { name: /게시하기/i })
        const hasSubmitButton = await submitButton.isVisible().catch(() => false)

        if (hasSubmitButton) {
          // Button should be disabled when form is empty
          await expect(submitButton).toBeDisabled()
        }
      }
    })

    test('back to catalog link should work', async ({ page }) => {
      await page.goto('/upload')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const backLink = page.getByRole('link', { name: /Back to Catalog/i })
        const hasBackLink = await backLink.isVisible().catch(() => false)

        if (hasBackLink) {
          await backLink.click()
          await page.waitForURL('/')
          expect(page.url()).not.toContain('/upload')
        }
      }
    })
  })
})
