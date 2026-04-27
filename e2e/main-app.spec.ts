import { test, expect } from '@playwright/test'

const SUPABASE_URL = 'https://aduwnjejyiviegrrmbzi.supabase.co'
const PROJECT_REF  = 'aduwnjejyiviegrrmbzi'
const SESSION_KEY  = `sb-${PROJECT_REF}-auth-token`

const MOCK_SESSION = {
  access_token:  'mock-access-token',
  token_type:    'bearer',
  expires_in:    3600,
  expires_at:    Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'mock-refresh-token',
  user: {
    id: 'mock-user-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  },
}

test.describe('Main app (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject session into localStorage before the app scripts run
    await page.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
    }, { key: SESSION_KEY, session: MOCK_SESSION })

    // Mock all Supabase REST API calls
    await page.route(`${SUPABASE_URL}/rest/v1/**`, async route => {
      const url = route.request().url()
      if (url.includes('/profiles')) {
        // No profile row — app falls back to defaults
        await route.fulfill({
          status: 406,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }),
        })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
    })

    // Mock auth token refresh so the SDK doesn't reject our injected token
    await page.route(`${SUPABASE_URL}/auth/v1/**`, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SESSION),
      })
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('shows main app — not auth page', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('shows Today tab by default', async ({ page }) => {
    // The today tab label appears in the tab bar
    const todayBtn = page.getByRole('button', { name: /היום|today/i }).first()
    await expect(todayBtn).toBeVisible()
  })

  test('shows empty-state when no meals logged', async ({ page }) => {
    await expect(
      page.getByText(/לא נוספו ארוחות|no meals logged/i).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('add-meal FAB is present and accessible', async ({ page }) => {
    const fab = page.locator('button[aria-label="הוסף ארוחה"]')
      .or(page.locator('button[aria-label="Add meal"]'))
    await expect(fab).toBeVisible()
    await expect(fab).toBeEnabled()
  })

  test('History tab navigates correctly', async ({ page }) => {
    const historyBtn = page.getByRole('button', { name: /היסטוריה|history/i }).first()
    await historyBtn.click()
    // History view should appear (week/month toggle or search)
    await expect(
      page.getByRole('button', { name: /שבוע|week|month|חודש/i }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('language toggle works in main app', async ({ page }) => {
    // Find lang toggle (usually in header/settings area)
    const toggle = page.getByRole('button', { name: /english|עברית/i }).first()
    if (await toggle.isVisible()) {
      const before = await toggle.textContent()
      await toggle.click()
      const after = await toggle.textContent()
      expect(after).not.toBe(before)
    }
  })
})
