import { test, expect } from '@playwright/test'

test.describe('Auth page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the auth check to finish (loading spinner disappears)
    await page.waitForLoadState('networkidle')
  })

  test('loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('shows email input', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('shows password input', async ({ page }) => {
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('sign-in button disabled when fields empty', async ({ page }) => {
    const btn = page.locator('button.btn-primary').first()
    await expect(btn).toBeDisabled()
  })

  test('sign-in button enabled when email and password filled', async ({ page }) => {
    await page.locator('input[type="email"]').fill('test@example.com')
    await page.locator('input[type="password"]').fill('password123')
    const btn = page.locator('button.btn-primary').first()
    await expect(btn).toBeEnabled()
  })

  test('language toggle switches UI from Hebrew to English', async ({ page }) => {
    // Default lang is Hebrew — toggle button shows "English"
    const toggleBtn = page.getByRole('button', { name: 'English' })
    await expect(toggleBtn).toBeVisible()
    await toggleBtn.click()
    // After toggle, button should show "עברית"
    await expect(page.getByRole('button', { name: 'עברית' })).toBeVisible()
    // Sign-in button should now say "Sign In" (English)
    await expect(page.getByRole('button', { name: 'Sign In' }).first()).toBeVisible()
  })

  test('shows Continue with Google button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
  })
})
