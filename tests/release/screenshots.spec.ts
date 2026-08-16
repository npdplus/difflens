import { mkdir } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

const outputDir = 'release-artifacts/screenshots';

test('captures public-safe screenshots from the verified product flow', async ({ page }) => {
  await mkdir(outputDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');

  await page.screenshot({
    path: `${outputDir}/difflens-file-intake.png`,
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: /Customer changes/u }).click();
  await expect(page.getByText('Customer changes is ready.')).toBeVisible();
  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();
  await page.getByLabel('Ignore ModifiedOn').check();

  await page.screenshot({
    path: `${outputDir}/difflens-key-ignore-fields.png`,
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByTestId('comparison-result-ready')).toBeVisible();

  await page.screenshot({
    path: `${outputDir}/difflens-comparison-summary.png`,
    fullPage: true,
    animations: 'disabled',
  });

  await page.getByRole('button', { name: /^Changed\s+2$/u }).click();
  await page.getByLabel('Search by key · CustomerId').fill('C002');
  await page.getByRole('button', { name: 'Changed record C002' }).click();
  await expect(page.getByLabel('Selected record inspector')).toContainText('CreditLimit');

  await page.screenshot({
    path: `${outputDir}/difflens-field-level-diff.png`,
    fullPage: true,
    animations: 'disabled',
  });
});
