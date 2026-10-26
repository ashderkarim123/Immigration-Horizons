import { test, expect } from '@playwright/test';

/** Synthetic fixture only: CRM sales changes never change lead operations. */
test('CRM board, loss reason and quote persist without changing operational status', async ({ page }) => {
  const fixture: { password: string; leadId: string; roles: Record<string, { email: string }> } =
    await (await page.request.get('/__browser_fixture')).json();
  await page.goto('/staff/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email address').fill(fixture.roles.pm.email);
  await page.getByLabel(/^Password/).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  const before = await (await page.request.get('/api/v1/staff/leads/' + fixture.leadId)).json();
  const originalStatus = before.data.status;
  await page.getByRole('navigation', { name: 'Staff navigation' })
    .getByRole('link', { name: 'CRM pipeline' }).click();
  await expect(page.getByRole('heading', { name: 'CRM pipeline' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ten-stage CRM pipeline' }).locator('.crm-column')).toHaveCount(10);
  await page.goto('/staff/crm/' + fixture.leadId);
  await expect(page.getByRole('heading', { name: 'CRM details' })).toBeVisible();
  await page.getByLabel('Sales stage').selectOption('lost');
  await page.getByLabel('Loss reason').selectOption('timing');
  await page.getByLabel('Amount (optional, major currency units)').fill('1250.50');
  await page.getByLabel('Next staff follow-up (your local time)').fill('2026-11-10T14:30');
  await page.getByRole('button', { name: 'Save CRM details' }).click();
  await expect(page.getByText('CRM details saved.')).toBeVisible();
  await expect(page.getByLabel('Sales stage')).toHaveValue('lost');
  const after = await (await page.request.get('/api/v1/staff/crm/leads/' + fixture.leadId)).json();
  expect(after.data.lead.stage).toBe('lost');
  expect(after.data.lead.lostReason).toBe('timing');
  expect(after.data.lead.quote.amountMinor).toBe(125050);
  const originalAfter = await (await page.request.get('/api/v1/staff/leads/' + fixture.leadId)).json();
  expect(originalAfter.data.status).toBe(originalStatus);
});
