import { test, expect } from '@playwright/test'

test.describe('Navigation (unauthenticated)', () => {
  test('auth pages should be accessible without login', async ({ page }) => {
    // Signin page
    const signinResponse = await page.goto('/auth/signin')
    expect(signinResponse?.status()).toBe(200)

    // Error page
    const errorResponse = await page.goto('/auth/error')
    expect(errorResponse?.status()).toBe(200)
  })

  test('protected routes should redirect to signin', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/auth\/signin/)

    await page.goto('/guides')
    await expect(page).toHaveURL(/\/auth\/signin/)
  })
})
