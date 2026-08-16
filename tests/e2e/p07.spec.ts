import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

test('runs a synthetic example through the real pipeline, inspects results, and exports a safe local CSV', async ({
  page,
}) => {
  await page.goto('/');

  const workflowRequests: { readonly method: string; readonly url: string }[] = [];
  page.on('request', (request) => {
    workflowRequests.push({ method: request.method(), url: request.url() });
  });

  await page.getByRole('button', { name: /Customer changes/u }).click();
  await expect(page.getByText('Customer changes is ready.')).toBeVisible();
  await expect(page.getByText('difflens-customers-before.csv')).toBeVisible();
  await expect(page.getByText('difflens-customers-after.csv')).toBeVisible();

  const keySelect = page.getByLabel('Matching key', { exact: true });
  await expect(keySelect).toHaveAttribute(
    'aria-describedby',
    'matching-key-help matching-key-feedback',
  );
  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();

  await page.getByLabel('Ignore ModifiedOn').check();
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const result = page.getByTestId('comparison-result-ready');
  await expect(result).toBeVisible();

  const summary = page.getByLabel('Comparison summary');
  await expect(summary.locator('.summary-card-added')).toContainText('1');
  await expect(summary.locator('.summary-card-removed')).toContainText('1');
  await expect(summary.locator('.summary-card-changed')).toContainText('2');
  await expect(summary.locator('.summary-card-unchanged')).toContainText('2');

  await page.getByRole('button', { name: /^Changed\s+2$/u }).click();
  await page.getByLabel('Search by key · CustomerId').fill('C002');
  await page.getByRole('button', { name: 'Changed record C002' }).click();
  const inspector = page.getByLabel('Selected record inspector');
  await expect(inspector).toContainText('CreditLimit');
  await expect(inspector).toContainText('25000');
  await expect(inspector).toContainText('30000');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV report' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('difflens-comparison-report.csv');

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  if (downloadPath === null) {
    throw new Error('Expected a local CSV download path.');
  }

  const csv = await readFile(downloadPath, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('RecordKey,ChangeType,Field,BeforeValue,AfterValue');
  expect(csv).toContain('C002,Changed,CreditLimit,25000,30000');
  expect(csv).toContain("C005,Added,CustomerName,[missing],'=Formula-looking customer");
  expect(csv).toContain('C004,Removed,CustomerName,Delta Works Demo,[missing]');
  await expect(page.getByText('CSV report downloaded locally.')).toBeVisible();

  expect(workflowRequests.some((request) => request.method === 'POST')).toBe(false);
  expect(
    workflowRequests.some(
      (request) =>
        request.url.includes('difflens-customers-before.csv') ||
        request.url.includes('difflens-customers-after.csv'),
    ),
  ).toBe(false);

  await page.getByRole('button', { name: 'New comparison' }).click();
  await expect(page.getByTestId('comparison-result-ready')).toHaveCount(0);
  await expect(page.getByText('Choose Before file')).toBeVisible();
  await expect(page.getByText('Choose After file')).toBeVisible();
  await expect(page.getByText('Customer changes is ready.')).toHaveCount(0);
});

test('loads the synthetic XLSX Product Catalog pair through normal local intake', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Before file input').setInputFiles('examples/product-catalog-before.xlsx');
  await page.getByLabel('After file input').setInputFiles('examples/product-catalog-after.xlsx');
  await expect(page.getByText('product-catalog-before.xlsx')).toBeVisible();
  await expect(page.getByText('product-catalog-after.xlsx')).toBeVisible();

  const keySelect = page.getByLabel('Matching key', { exact: true });
  await keySelect.selectOption('ProductId');
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();

  const summary = page.getByLabel('Comparison summary');
  await expect(summary.locator('.summary-card-added')).toContainText('1');
  await expect(summary.locator('.summary-card-removed')).toContainText('1');
  await expect(summary.locator('.summary-card-changed')).toContainText('2');
  await expect(summary.locator('.summary-card-unchanged')).toContainText('1');

  await page.getByLabel('Search by key · ProductId').fill('P001');
  const inspector = page.getByLabel('Selected record inspector');
  await expect(inspector).toContainText('Price');
  await expect(inspector).toContainText('49.9');
  await expect(inspector).toContainText('54.9');
});

test('persists only the theme preference and exposes visible keyboard focus for primary controls', async ({
  page,
}) => {
  await page.goto('/');

  const shell = page.locator('.app-shell');
  const themeButton = page.locator('.header-actions button').first();
  const initialTheme = await shell.getAttribute('data-theme');
  expect(initialTheme === 'dark' || initialTheme === 'light').toBe(true);

  await page.keyboard.press('Tab');
  await expect(themeButton).toBeFocused();
  const outlineWidth = await themeButton.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).outlineWidth),
  );
  expect(outlineWidth).toBeGreaterThan(0);

  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await themeButton.click();
  await expect(shell).toHaveAttribute('data-theme', nextTheme);
  expect(await page.evaluate(() => localStorage.getItem('difflens-theme'))).toBe(nextTheme);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['difflens-theme']);

  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', nextTheme);
  await page.locator('.header-actions button').first().click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', initialTheme as string);
});
