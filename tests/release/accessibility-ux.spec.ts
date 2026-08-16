import { expect, test } from '@playwright/test';

test('stable browser keyboard, labels, status, motion, and classification sanity', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const appShell = page.locator('.app-shell');
  const initialTheme = await appShell.getAttribute('data-theme');
  expect(initialTheme === 'dark' || initialTheme === 'light').toBe(true);

  const themeToggle = page.getByRole('button', { name: /^Switch to (light|dark) mode$/u });
  await expect(themeToggle).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(themeToggle).toBeFocused();

  const focusStyle = await themeToggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      transitionDuration: style.transitionDuration,
    };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(3);
  expect(
    focusStyle.transitionDuration
      .split(',')
      .map((duration) => duration.trim())
      .every((duration) => duration === '0s'),
  ).toBe(true);

  await expect(page.getByLabel('Local processing notice')).toBeVisible();
  await expect(page.getByLabel('Before file input')).toHaveCount(1);
  await expect(page.getByLabel('After file input')).toHaveCount(1);
  await expect(page.getByLabel('Supported formats')).toContainText('CSV');
  await expect(page.getByLabel('Supported formats')).toContainText('XLSX');
  await expect(page.getByLabel('Supported formats')).toContainText('JSON');
  await expect(page.getByLabel('Supported formats')).toContainText('YAML');

  const exampleStatus = page.locator('.example-status[aria-live="polite"]');
  await page.getByRole('button', { name: /Customer changes/u }).click();
  await expect(exampleStatus).toContainText('Customer changes is ready.');

  await page.getByRole('button', { name: 'Use CustomerId' }).click();
  const keySelect = page.getByLabel('Matching key', { exact: true });
  await expect(keySelect).toHaveAttribute(
    'aria-describedby',
    'matching-key-help matching-key-feedback',
  );
  await expect(page.locator('#matching-key-help')).toBeVisible();
  await expect(page.locator('#matching-key-feedback')).toContainText(
    'Key is valid and unique across all matchable records on both sides.',
  );

  await page.getByLabel('Ignore ModifiedOn').check();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByTestId('comparison-result-ready')).toBeVisible();

  const classificationFilters = page.getByRole('group', { name: 'Result classification filter' });
  await expect(classificationFilters).toContainText('Added');
  await expect(classificationFilters).toContainText('Removed');
  await expect(classificationFilters).toContainText('Changed');
  await expect(page.getByLabel('Comparison summary')).toContainText('Unchanged');

  await themeToggle.press('Enter');
  await expect(appShell).toHaveAttribute('data-theme', initialTheme === 'dark' ? 'light' : 'dark');
});
