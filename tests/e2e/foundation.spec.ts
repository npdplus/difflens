import { expect, test, type Page } from '@playwright/test';

async function setLocalFile(
  page: Page,
  side: 'Before' | 'After',
  file: { readonly name: string; readonly mimeType: string; readonly content: string },
) {
  await page.getByLabel(`${side} file input`).setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: Buffer.from(file.content, 'utf-8'),
  });
}

test('loads Before and After files, replaces stale input, and resets the local session', async ({
  page,
}) => {
  await page.goto('/');

  await setLocalFile(page, 'Before', {
    name: 'ลูกค้า-ก่อน.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC001,Alpha\nC002,Beta\n',
  });
  await setLocalFile(page, 'After', {
    name: 'customers-after.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC001,Alpha\nC003,Gamma\n',
  });

  await expect(page.getByText('ลูกค้า-ก่อน.csv')).toBeVisible();
  await expect(page.getByText('customers-after.csv')).toBeVisible();
  await expect(page.getByLabel('Configuration readiness')).toContainText(
    'Files are ready for comparison settings',
  );
  await expect(page.getByLabel('Matching key', { exact: true })).toBeVisible();

  await page.getByLabel('Matching key', { exact: true }).selectOption('CustomerId');
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();

  await setLocalFile(page, 'Before', {
    name: 'replacement-before.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC010,Replacement\n',
  });

  await expect(page.getByText('replacement-before.csv')).toBeVisible();
  await expect(page.getByText('ลูกค้า-ก่อน.csv')).toHaveCount(0);
  await expect(page.getByLabel('Matching key', { exact: true })).toHaveValue('');

  await page.getByRole('button', { name: 'New comparison' }).click();
  await expect(page.getByText('Choose Before file')).toBeVisible();
  await expect(page.getByText('Choose After file')).toBeVisible();
  await expect(page.getByLabel('Configuration readiness')).toContainText(
    'Comparison settings come next',
  );
});

test('uses P03 dataset discovery and requires explicit selection for ambiguous JSON', async ({ page }) => {
  await page.goto('/');

  await setLocalFile(page, 'Before', {
    name: 'multi.json',
    mimeType: 'application/json',
    content: JSON.stringify({
      customers: [{ CustomerId: 'C001', Name: 'Alpha' }],
      archive: [{ CustomerId: 'C000', Name: 'Old' }],
    }),
  });
  await setLocalFile(page, 'After', {
    name: 'after.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC001,Alpha\n',
  });

  await expect(page.getByText('Selection needed')).toBeVisible();
  await expect(page.getByLabel('Before dataset')).toBeVisible();
  await page.getByLabel('Before dataset').selectOption('collection:0');

  await expect(page.getByText('customers', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Configuration readiness')).toContainText(
    'Files are ready for comparison settings',
  );
});

test('supports drag and drop plus explicit format recovery without duplicating parser logic', async ({
  page,
}) => {
  await page.goto('/');

  await page.getByTestId('before-drop-zone').evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['CustomerId,Name\nC001,Dragged\n'], 'dragged-before.csv', { type: 'text/csv' }),
    );
    element.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    );
  });

  await expect(page.getByText('dragged-before.csv')).toBeVisible();
  await expect(page.getByText('Ready to configure')).toBeVisible();

  await setLocalFile(page, 'After', {
    name: 'ambiguous.data',
    mimeType: 'text/plain',
    content: 'CustomerId,Name\nC001,Recovered\n',
  });

  await expect(page.getByText('Unsupported format')).toBeVisible();
  await page.getByLabel('After format override').selectOption('csv');
  await page.getByRole('button', { name: 'Try as CSV' }).click();

  await expect(page.getByLabel('Configuration readiness')).toContainText(
    'Files are ready for comparison settings',
  );
});

test('shows controlled parser errors and keeps imported script-like text inert', async ({ page }) => {
  await page.goto('/');

  await setLocalFile(page, 'Before', {
    name: 'broken.json',
    mimeType: 'application/json',
    content: '{',
  });

  await expect(page.getByText('Could not load')).toBeVisible();
  await expect(
    page.getByText('DiffLens could not parse this file. Check the file and try again.'),
  ).toBeVisible();

  await setLocalFile(page, 'Before', {
    name: 'safe.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Value\nC001,"<script data-difflens-test=inert>sample()</script>"\n',
  });

  await expect(page.getByText('safe.csv')).toBeVisible();
  await expect(page.locator('script[data-difflens-test="inert"]')).toHaveCount(0);
});

test('configures through P05 then explores the authoritative P06 result', async ({ page }) => {
  await page.goto('/');

  await setLocalFile(page, 'Before', {
    name: 'comparison-before.csv',
    mimeType: 'text/csv',
    content:
      'CustomerId,Name,ModifiedOn\nC001,Alpha,2026-08-15\nC002,Beta,2026-08-15\nC004,Removed,2026-08-15\n',
  });
  await setLocalFile(page, 'After', {
    name: 'comparison-after.csv',
    mimeType: 'text/csv',
    content:
      'CustomerId,Name,ModifiedOn\nC001,Alpha,2026-08-16\nC002,เบต้า,2026-08-16\nC003,Gamma,2026-08-16\n',
  });

  const keySelect = page.getByLabel('Matching key', { exact: true });
  await expect(keySelect).toHaveValue('');
  await expect(page.getByLabel('Suggested matching keys')).toContainText('Use CustomerId');

  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  await expect(keySelect).toHaveValue('CustomerId');
  await expect(page.getByLabel('Ignore CustomerId')).toHaveCount(0);
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();

  await page.getByLabel('Ignore ModifiedOn').check();
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();

  const compare = page.getByRole('button', { name: 'Compare', exact: true });
  await expect(compare).toBeEnabled();
  await compare.click();

  const result = page.getByTestId('comparison-result-ready');
  await expect(result).toBeVisible();
  await expect(result).toContainText('See exactly what changed');
  await expect(result).toContainText('CustomerId');
  await expect(result).toContainText('ModifiedOn');

  const summary = page.getByLabel('Comparison summary');
  await expect(summary.locator('.summary-card-neutral').filter({ hasText: 'Before records' })).toContainText('3');
  await expect(summary.locator('.summary-card-neutral').filter({ hasText: 'After records' })).toContainText('3');
  await expect(summary.locator('.summary-card-added')).toContainText('1');
  await expect(summary.locator('.summary-card-removed')).toContainText('1');
  await expect(summary.locator('.summary-card-changed')).toContainText('1');
  await expect(summary.locator('.summary-card-unchanged')).toContainText('1');

  await page.getByRole('button', { name: /^Changed\s+1$/ }).click();
  await page.getByLabel('Search by key · CustomerId').fill('c002');
  await page.getByRole('button', { name: 'Changed record C002' }).click();

  const inspector = page.getByLabel('Selected record inspector');
  await expect(inspector).toContainText('Name');
  await expect(inspector).toContainText('Beta');
  await expect(inspector).toContainText('เบต้า');
  await expect(inspector).toContainText('Changed fields are shown by default');

  await page.getByLabel('Search by key · CustomerId').fill('');
  await page.getByRole('button', { name: /^Added\s+1$/ }).click();
  await expect(page.getByRole('button', { name: 'Added record C003' })).toBeVisible();
  await page.getByRole('button', { name: /^Removed\s+1$/ }).click();
  await expect(page.getByRole('button', { name: 'Removed record C004' })).toBeVisible();
  await page.getByRole('button', { name: /^All changes\s+3$/ }).click();

  await page.getByLabel('Ignore ModifiedOn').uncheck();
  await expect(result).toHaveCount(0);

  await page.getByRole('button', { name: 'New comparison' }).click();
  await expect(page.getByLabel('Matching key', { exact: true })).toHaveCount(0);
});

test('blocks duplicate keys and surfaces missing keys without exposing source key examples', async ({
  page,
}) => {
  await page.goto('/');

  await setLocalFile(page, 'Before', {
    name: 'validation-before.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC001,Alpha\nC002,Beta\n',
  });
  await setLocalFile(page, 'After', {
    name: 'duplicate-after.csv',
    mimeType: 'text/csv',
    content:
      'CustomerId,Name\nC001,Alpha\nDUP-SECRET,First\nDUP-SECRET,Second\n',
  });

  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  const diagnostics = page.getByLabel('Key validation diagnostics');
  await expect(diagnostics).toContainText('duplicate values');
  await expect(diagnostics).not.toContainText('DUP-SECRET');
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toBeDisabled();

  await setLocalFile(page, 'After', {
    name: 'missing-after.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC001,Alpha\n,NoKey\nC003,Gamma\n',
  });

  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  await expect(page.getByLabel('Key validation diagnostics')).toContainText(
    'missing, null, or empty',
  );
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const result = page.getByTestId('comparison-result-ready');
  await expect(result).toBeVisible();
  await expect(page.getByLabel('Result warnings and unmatchable records')).toContainText(
    'Unmatchable records · Before 0 · After 1',
  );
});

test('source reconfiguration invalidates any completed or in-flight comparison job', async ({ page }) => {
  await page.goto('/');

  const rows = Array.from({ length: 10000 }, (_, index) => `C${index},Value ${index}`).join('\n');
  await setLocalFile(page, 'Before', {
    name: 'large-before.csv',
    mimeType: 'text/csv',
    content: `CustomerId,Name\n${rows}\n`,
  });
  await setLocalFile(page, 'After', {
    name: 'large-after.csv',
    mimeType: 'text/csv',
    content: `CustomerId,Name\n${rows}\n`,
  });

  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  await expect(
    page.getByText('Key is valid and unique across all matchable records on both sides.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();

  await setLocalFile(page, 'After', {
    name: 'new-after.csv',
    mimeType: 'text/csv',
    content: 'CustomerId,Name\nC99999,Replacement\n',
  });

  await expect(page.getByText('new-after.csv')).toBeVisible();
  await expect(page.getByLabel('Matching key', { exact: true })).toHaveValue('');
  await expect(page.getByTestId('comparison-result-ready')).toHaveCount(0);
});
