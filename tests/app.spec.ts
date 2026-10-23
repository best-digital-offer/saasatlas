import { expect, test } from '@playwright/test'

test('directory filters, details, and founder navigation work', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The SaaS leaderboard' })).toBeVisible()
  await expect(page.locator('.product-row')).toHaveCount(12)

  await page.getByRole('tab', { name: 'AI' }).click()
  await expect(page.locator('.product-row')).toHaveCount(2)
  await page.getByRole('tab', { name: 'All products' }).click()

  await page.getByRole('textbox', { name: 'Search products and categories' }).fill('Northstar')
  await expect(page.locator('.product-row')).toHaveCount(1)
  await page.locator('.product-row').click()
  await expect(page.getByRole('dialog')).toContainText('No live bidding is taking place')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'For founders' }).click()
  await expect(page.getByRole('heading', { name: 'Your founder workspace' })).toBeVisible()
  await expect(page.getByText('Preview mode')).toBeVisible()
})

test('mobile directory stays within viewport and founder workspace remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The SaaS leaderboard' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()

  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await page.getByRole('button', { name: 'For founders' }).click()
  await expect(page.getByRole('heading', { name: 'Your founder workspace' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})
