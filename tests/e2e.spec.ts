import { expect, test } from '@playwright/test'

test.describe('Hedge Signal Desk smoke routes', () => {
  const routes = ['/', '/desk', '/auto', '/charts', '/log', '/performance', '/accuracy', '/settings', '/about']

  for (const route of routes) {
    test(`route ${route} loads`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveTitle(/Hedge Signal Desk/i)
      await expect(page.locator('body')).toContainText(/Hedge Signal Desk|Live Desk|Auto Paper Trader|Trade Log|Settings|About/i)
    })
  }

  test('desk ticket can be copied and settings can change the theme', async ({ page }) => {
    await page.goto('/desk')
    await page.getByRole('button', { name: /copy ticket/i }).click()
    await expect(page.getByRole('button', { name: /copied/i })).toBeVisible()

    await page.goto('/settings')
    await page.locator('select').first().selectOption('light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('auto page controls are live and chart timeframe toggles work', async ({ page }) => {
    await page.goto('/auto')
    await page.getByRole('button', { name: /start/i }).click()
    await expect(page.getByText(/RUNNING/i)).toBeVisible()
    await page.getByRole('button', { name: /pause/i }).click()
    await expect(page.getByText(/PAUSED/i)).toBeVisible()

    await page.goto('/charts')
    await page.getByRole('button', { name: /m5/i }).click()
    await expect(page.getByRole('button', { name: /m5/i })).toHaveClass(/active-tab/)
  })
})
