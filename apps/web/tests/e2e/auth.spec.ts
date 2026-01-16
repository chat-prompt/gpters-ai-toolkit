import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should redirect to signin page when not authenticated', async ({ page }) => {
    await page.goto('/')

    // Should be redirected to signin
    await expect(page).toHaveURL(/\/auth\/signin/)
  })

  test('should show signin page correctly', async ({ page }) => {
    await page.goto('/auth/signin')

    // Check page elements
    await expect(page.getByText('AI Toolkit')).toBeVisible()
    await expect(page.getByText('GPTers 팀 계정으로 계속하기')).toBeVisible()
    await expect(page.getByRole('button', { name: /Google 계정으로 로그인/i })).toBeVisible()
  })

  test('should show error page correctly', async ({ page }) => {
    await page.goto('/auth/error?error=AccessDenied')

    await expect(page.getByText('접근 권한 없음')).toBeVisible()
    await expect(page.getByText('@gpters.org 이메일 계정만 로그인할 수 있습니다')).toBeVisible()
    await expect(page.getByRole('link', { name: '다시 로그인' })).toBeVisible()
  })
})
