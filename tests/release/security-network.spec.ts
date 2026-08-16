import { expect, test } from '@playwright/test';

interface ReleaseFormatCase {
  readonly name: string;
  readonly beforePath: string;
  readonly afterPath: string;
  readonly keyField: string;
}

const cases: readonly ReleaseFormatCase[] = [
  {
    name: 'CSV',
    beforePath: 'examples/customers-before.csv',
    afterPath: 'examples/customers-after.csv',
    keyField: 'CustomerId',
  },
  {
    name: 'XLSX',
    beforePath: 'examples/product-catalog-before.xlsx',
    afterPath: 'examples/product-catalog-after.xlsx',
    keyField: 'ProductId',
  },
  {
    name: 'JSON',
    beforePath: 'examples/migration-before.json',
    afterPath: 'examples/migration-after.json',
    keyField: 'RecordId',
  },
  {
    name: 'YAML',
    beforePath: 'examples/configuration-before.yaml',
    afterPath: 'examples/configuration-after.yaml',
    keyField: 'ConfigKey',
  },
];

for (const formatCase of cases) {
  test(`${formatCase.name} comparison and export make no unexpected network requests`, async ({
    page,
  }) => {
    const requests: { readonly method: string; readonly url: string }[] = [];
    page.on('request', (request) => {
      requests.push({ method: request.method(), url: request.url() });
    });

    await page.goto('/');
    const appOrigin = new URL(page.url()).origin;

    await page.getByLabel('Before file input').setInputFiles(formatCase.beforePath);
    await page.getByLabel('After file input').setInputFiles(formatCase.afterPath);

    const keySelect = page.getByLabel('Matching key', { exact: true });
    await expect(keySelect).toBeVisible();
    await keySelect.selectOption(formatCase.keyField);
    await expect(
      page.getByText('Key is valid and unique across all matchable records on both sides.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByTestId('comparison-result-ready')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV report' }).click();
    const download = await downloadPromise;
    await download.delete();

    const unexpected = requests.filter((request) => {
      const requestUrl = new URL(request.url);
      return requestUrl.origin !== appOrigin;
    });

    expect(unexpected).toEqual([]);
    expect(requests.some((request) => request.method !== 'GET')).toBe(false);
    expect(
      requests.some(
        (request) =>
          request.url.includes(formatCase.beforePath.split('/').at(-1) ?? '') ||
          request.url.includes(formatCase.afterPath.split('/').at(-1) ?? ''),
      ),
    ).toBe(false);
  });
}
