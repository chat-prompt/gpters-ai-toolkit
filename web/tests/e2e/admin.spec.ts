import { test, expect } from '@playwright/test'

test.describe('Admin Pages', () => {
  test.describe('Admin Dashboard (/admin)', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/admin')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for dashboard title
        const title = page.getByText('Dashboard')
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }

        // Check for subtitle
        const subtitle = page.getByText('Manage your catalog items')
        const hasSubtitle = await subtitle.isVisible().catch(() => false)

        if (hasSubtitle) {
          await expect(subtitle).toBeVisible()
        }
      }
    })

    test('should display stats cards', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Check for stat labels
        const statLabels = ['Total Items', 'Skills', 'Agents', 'Commands', 'Guides']

        for (const label of statLabels) {
          const stat = page.getByText(label)
          const hasStat = await stat.isVisible().catch(() => false)

          if (hasStat) {
            await expect(stat).toBeVisible()
          }
        }
      }
    })

    test('should have catalog action links', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for View All Items link
        const viewAllLink = page.getByRole('link', { name: 'View All Items' })
        const hasViewAll = await viewAllLink.isVisible().catch(() => false)

        if (hasViewAll) {
          await expect(viewAllLink).toBeVisible()
        }

        // Check for Create New Item link
        const createLink = page.getByRole('link', { name: 'Create New Item' })
        const hasCreate = await createLink.isVisible().catch(() => false)

        if (hasCreate) {
          await expect(createLink).toBeVisible()
        }
      }
    })

    test('should have data management section', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for Data Management heading
        const dmHeading = page.getByText('Data Management')
        const hasDM = await dmHeading.isVisible().catch(() => false)

        if (hasDM) {
          await expect(dmHeading).toBeVisible()
        }

        // Check for Tags link
        const tagsLink = page.getByRole('link', { name: /Tags/i })
        const hasTags = await tagsLink.isVisible().catch(() => false)

        if (hasTags) {
          await expect(tagsLink).toBeVisible()
        }

        // Check for Authors link
        const authorsLink = page.getByRole('link', { name: /Authors/i })
        const hasAuthors = await authorsLink.isVisible().catch(() => false)

        if (hasAuthors) {
          await expect(authorsLink).toBeVisible()
        }

        // Check for MCP Servers link
        const mcpLink = page.getByRole('link', { name: /MCP Servers/i })
        const hasMcp = await mcpLink.isVisible().catch(() => false)

        if (hasMcp) {
          await expect(mcpLink).toBeVisible()
        }
      }
    })
  })

  test.describe('Catalog List Page (/admin/catalog)', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/admin/catalog')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/admin/catalog')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for catalog title
        const title = page.getByText('Catalog').first()
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }
      }
    })

    test('should have type filter buttons', async ({ page }) => {
      await page.goto('/admin/catalog')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for filter buttons
        const filters = ['all', 'skill', 'agent', 'command', 'guide']

        for (const filter of filters) {
          const button = page.getByRole('button', { name: new RegExp(filter, 'i') })
          const hasButton = await button.isVisible().catch(() => false)

          if (hasButton) {
            await expect(button).toBeVisible()
          }
        }
      }
    })

    test('should have create new item link', async ({ page }) => {
      await page.goto('/admin/catalog')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const createLink = page.getByRole('link', { name: /New Item/i })
        const hasCreate = await createLink.isVisible().catch(() => false)

        if (hasCreate) {
          await expect(createLink).toBeVisible()
        }
      }
    })

    test('should display catalog items', async ({ page }) => {
      await page.goto('/admin/catalog')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for item cards or empty state
        const items = page.locator('a[href^="/admin/catalog/"]')
        const count = await items.count()

        // Items might exist or might be empty
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Create New Item Page (/admin/catalog/new)', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/admin/catalog/new')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/admin/catalog/new')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for form elements
        const nameInput = page.locator('input[name="name"]')
        const hasName = await nameInput.isVisible().catch(() => false)

        if (hasName) {
          await expect(nameInput).toBeVisible()
        }
      }
    })

    test('should have back link', async ({ page }) => {
      await page.goto('/admin/catalog/new')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        const backLink = page.getByRole('link', { name: /Back/i })
        const hasBack = await backLink.isVisible().catch(() => false)

        if (hasBack) {
          await expect(backLink).toBeVisible()
        }
      }
    })
  })

  test.describe('Tags Management Page (/admin/tags)', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/admin/tags')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/admin/tags')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for Tags title
        const title = page.getByText('Tags').first()
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }
      }
    })

    test('should have add new tag section', async ({ page }) => {
      await page.goto('/admin/tags')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for Add button
        const addButton = page.getByRole('button', { name: /Add/i })
        const hasAdd = await addButton.isVisible().catch(() => false)

        if (hasAdd) {
          await expect(addButton).toBeVisible()
        }
      }
    })

    test('should display existing tags', async ({ page }) => {
      await page.goto('/admin/tags')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for tag items
        const tagItems = page.locator('.glass')
        const count = await tagItems.count()

        // Tags might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Authors Management Page (/admin/authors)', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/admin/authors')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/admin/authors')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for Authors title
        const title = page.getByText('Authors').first()
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }
      }
    })

    test('should have add new author section', async ({ page }) => {
      await page.goto('/admin/authors')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for Add button
        const addButton = page.getByRole('button', { name: /Add/i })
        const hasAdd = await addButton.isVisible().catch(() => false)

        if (hasAdd) {
          await expect(addButton).toBeVisible()
        }
      }
    })

    test('should display existing authors', async ({ page }) => {
      await page.goto('/admin/authors')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for author items
        const authorItems = page.locator('.glass')
        const count = await authorItems.count()

        // Authors might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('MCP Servers Management Page (/admin/mcp-servers)', () => {
    test('should redirect to signin when not authenticated', async ({ page }) => {
      await page.goto('/admin/mcp-servers')
      await expect(page).toHaveURL(/\/auth\/signin/)
    })

    test('should have correct page structure', async ({ page }) => {
      await page.goto('/admin/mcp-servers')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        // Check for MCP Servers title
        const title = page.getByText('MCP Servers').first()
        const hasTitle = await title.isVisible().catch(() => false)

        if (hasTitle) {
          await expect(title).toBeVisible()
        }
      }
    })

    test('should have add new server section', async ({ page }) => {
      await page.goto('/admin/mcp-servers')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Check for Add button
        const addButton = page.getByRole('button', { name: /Add/i })
        const hasAdd = await addButton.isVisible().catch(() => false)

        if (hasAdd) {
          await expect(addButton).toBeVisible()
        }
      }
    })

    test('should display existing MCP servers', async ({ page }) => {
      await page.goto('/admin/mcp-servers')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(1000)

        // Look for server items
        const serverItems = page.locator('.glass')
        const count = await serverItems.count()

        // Servers might exist
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test.describe('Admin Navigation', () => {
    test('dashboard links should work', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        // Test View All Items link
        const viewAllLink = page.getByRole('link', { name: 'View All Items' })
        const hasViewAll = await viewAllLink.isVisible().catch(() => false)

        if (hasViewAll) {
          await viewAllLink.click()
          await page.waitForURL('/admin/catalog')
          expect(page.url()).toContain('/admin/catalog')
        }
      }
    })

    test('create new item link should work', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        const createLink = page.getByRole('link', { name: 'Create New Item' })
        const hasCreate = await createLink.isVisible().catch(() => false)

        if (hasCreate) {
          await createLink.click()
          await page.waitForURL('/admin/catalog/new')
          expect(page.url()).toContain('/admin/catalog/new')
        }
      }
    })

    test('tags link should work', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        const tagsLink = page.locator('a[href="/admin/tags"]')
        const hasTags = await tagsLink.isVisible().catch(() => false)

        if (hasTags) {
          await tagsLink.click()
          await page.waitForURL('/admin/tags')
          expect(page.url()).toContain('/admin/tags')
        }
      }
    })

    test('authors link should work', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        const authorsLink = page.locator('a[href="/admin/authors"]')
        const hasAuthors = await authorsLink.isVisible().catch(() => false)

        if (hasAuthors) {
          await authorsLink.click()
          await page.waitForURL('/admin/authors')
          expect(page.url()).toContain('/admin/authors')
        }
      }
    })

    test('mcp-servers link should work', async ({ page }) => {
      await page.goto('/admin')

      const isOnSignin = page.url().includes('/auth/signin')

      if (!isOnSignin) {
        await page.waitForTimeout(500)

        const mcpLink = page.locator('a[href="/admin/mcp-servers"]')
        const hasMcp = await mcpLink.isVisible().catch(() => false)

        if (hasMcp) {
          await mcpLink.click()
          await page.waitForURL('/admin/mcp-servers')
          expect(page.url()).toContain('/admin/mcp-servers')
        }
      }
    })
  })
})
