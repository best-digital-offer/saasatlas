import { expect, test } from '@playwright/test'

test('directory filters, details, and founder navigation work', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The SaaS directory' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'The SaaS directory' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()

  await page.getByRole('button', { name: 'Toggle navigation' }).click()
  await page.getByRole('button', { name: 'For founders' }).click()
  await expect(page.getByRole('heading', { name: 'Your founder workspace' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})


test('email sign-in dialog is wired to the authentication interface', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('dialog')).toContainText('Welcome back')
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: /Create an account/ })).toBeVisible()
})

test('bid intent opens the founder sign-in flow without the obsolete placeholder', async ({ page }) => {
  await page.goto('/')
  await page.locator('.product-boost').first().click()
  await expect(page.getByRole('dialog')).toContainText('Choose a rank to aim for')
  await page.getByRole('button', { name: 'Continue to bid' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Sign in to manage your listings and standing bids.')
  await expect(dialog).not.toContainText('Live bid placement is not connected yet')
  await expect(dialog).not.toContainText('credit funding must be enabled')
})

test('founder workspace does not prefill or advertise QueueTurn', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'For founders' }).click()
  await expect(page.getByRole('heading', { name: 'Your founder workspace' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Prepare QueueTurn' })).toHaveCount(0)
})
