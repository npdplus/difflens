import { createRequire } from 'node:module';

import { expect, test, type Locator, type Page } from '@playwright/test';

type BenchmarkFormat = 'csv' | 'json' | 'yaml' | 'xlsx';

interface BenchmarkCase {
  readonly id: string;
  readonly format: BenchmarkFormat;
  readonly records: number;
  readonly fields: number;
  readonly changedRate: number;
  readonly churnRate: number;
}

interface BenchmarkExpected {
  readonly before: number;
  readonly after: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly unchanged: number;
}

interface GeneratedPair {
  readonly before: Buffer;
  readonly after: Buffer;
  readonly expected: BenchmarkExpected;
}

interface XlsxApi {
  readonly utils: {
    json_to_sheet(records: readonly Record<string, string>[]): unknown;
    book_new(): unknown;
    book_append_sheet(workbook: unknown, worksheet: unknown, name: string): void;
  };
  write(workbook: unknown, options: { readonly bookType: 'xlsx'; readonly type: 'buffer' }): Buffer;
}

const benchmarkCases: readonly BenchmarkCase[] = [
  { id: 'csv-small', format: 'csv', records: 1_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
  { id: 'csv-medium', format: 'csv', records: 10_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
  { id: 'csv-large', format: 'csv', records: 50_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
  { id: 'csv-stress', format: 'csv', records: 100_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
  { id: 'csv-wide', format: 'csv', records: 10_000, fields: 20, changedRate: 0.1, churnRate: 0.01 },
  { id: 'json-medium', format: 'json', records: 10_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
  { id: 'yaml-medium', format: 'yaml', records: 10_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
  { id: 'xlsx-medium', format: 'xlsx', records: 10_000, fields: 6, changedRate: 0.1, churnRate: 0.01 },
];

for (const benchmarkCase of benchmarkCases) {
  test(`release benchmark ${benchmarkCase.id}`, async ({ page }, testInfo) => {
    const pair = generatePair(benchmarkCase);
    const mimeType = formatMimeType(benchmarkCase.format);
    const loadStartedAt = performance.now();

    await page.goto('/');

    await Promise.all([
      page.getByLabel('Before file input').setInputFiles({
        name: `benchmark-before.${benchmarkCase.format}`,
        mimeType,
        buffer: pair.before,
      }),
      page.getByLabel('After file input').setInputFiles({
        name: `benchmark-after.${benchmarkCase.format}`,
        mimeType,
        buffer: pair.after,
      }),
    ]);

    const keySelect = page.getByLabel('Matching key', { exact: true });
    await expect(keySelect).toBeVisible();
    const parseAndNormalizeMs = performance.now() - loadStartedAt;

    const validationStartedAt = performance.now();
    await keySelect.selectOption('Id');
    await expect(
      page.getByText('Key is valid and unique across all matchable records on both sides.'),
    ).toBeVisible();
    const validationMs = performance.now() - validationStartedAt;

    const comparisonStartedAt = performance.now();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByTestId('comparison-result-ready')).toBeVisible();
    const comparisonMs = performance.now() - comparisonStartedAt;

    await verifySummary(page, pair.expected);

    const exportStartedAt = performance.now();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV report' }).click();
    const download = await downloadPromise;
    const exportMs = performance.now() - exportStartedAt;
    await download.delete();

    const memory = await page.evaluate(() => {
      const browserPerformance = performance as Performance & {
        memory?: {
          readonly usedJSHeapSize: number;
          readonly totalJSHeapSize: number;
          readonly jsHeapSizeLimit: number;
        };
      };
      return browserPerformance.memory ?? null;
    });

    const evidence = {
      caseId: benchmarkCase.id,
      browserChannel: process.env.DIFFLENS_BROWSER_CHANNEL,
      format: benchmarkCase.format,
      records: benchmarkCase.records,
      fields: benchmarkCase.fields,
      changedRate: benchmarkCase.changedRate,
      churnRate: benchmarkCase.churnRate,
      beforeBytes: pair.before.byteLength,
      afterBytes: pair.after.byteLength,
      expected: pair.expected,
      parseAndNormalizeMs: roundMs(parseAndNormalizeMs),
      keyValidationMs: roundMs(validationMs),
      comparisonMs: roundMs(comparisonMs),
      timeUntilResultUsableMs: roundMs(parseAndNormalizeMs + validationMs + comparisonMs),
      csvExportMs: roundMs(exportMs),
      memory,
    };

    console.log(`DIFFLENS_BENCHMARK ${JSON.stringify(evidence)}`);
    await testInfo.attach(`${benchmarkCase.id}.json`, {
      body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8'),
      contentType: 'application/json',
    });
  });
}

async function verifySummary(page: Page, expected: BenchmarkExpected): Promise<void> {
  const summary = page.getByLabel('Comparison summary');
  await expect(summary).toBeVisible();
  await expectSummaryValue(summary, 'Before records', expected.before);
  await expectSummaryValue(summary, 'After records', expected.after);
  await expectSummaryValue(summary, 'Added', expected.added);
  await expectSummaryValue(summary, 'Removed', expected.removed);
  await expectSummaryValue(summary, 'Changed', expected.changed);
  await expectSummaryValue(summary, 'Unchanged', expected.unchanged);
}

async function expectSummaryValue(
  summary: Locator,
  label: string,
  expected: number,
): Promise<void> {
  const card = summary.getByText(label, { exact: true }).locator('..');
  await expect(card.locator('dd')).toHaveText(expected.toLocaleString('en-US'));
}

function generatePair(benchmarkCase: BenchmarkCase): GeneratedPair {
  const removed = Math.max(1, Math.floor(benchmarkCase.records * benchmarkCase.churnRate));
  const changed = Math.max(1, Math.floor(benchmarkCase.records * benchmarkCase.changedRate));
  if (removed + changed >= benchmarkCase.records) {
    throw new Error(`Benchmark case ${benchmarkCase.id} leaves no unchanged records.`);
  }

  const beforeRows = Array.from({ length: benchmarkCase.records }, (_, index) =>
    createRecord(index, benchmarkCase.fields),
  );
  const afterRows = beforeRows.slice(removed).map((row, index) => {
    if (index >= changed) {
      return row;
    }
    return { ...row, Field1: `${row.Field1}-changed` };
  });

  for (let index = 0; index < removed; index += 1) {
    const row = createRecord(benchmarkCase.records + index, benchmarkCase.fields);
    afterRows.push({ ...row, Id: `A${String(index).padStart(8, '0')}` });
  }

  const expected: BenchmarkExpected = {
    before: benchmarkCase.records,
    after: benchmarkCase.records,
    added: removed,
    removed,
    changed,
    unchanged: benchmarkCase.records - removed - changed,
  };

  return {
    before: encodeRows(benchmarkCase.format, beforeRows),
    after: encodeRows(benchmarkCase.format, afterRows),
    expected,
  };
}

function createRecord(index: number, fieldCount: number): Record<string, string> {
  const record: Record<string, string> = {
    Id: `R${String(index).padStart(8, '0')}`,
  };

  for (let fieldIndex = 1; fieldIndex < fieldCount; fieldIndex += 1) {
    record[`Field${fieldIndex}`] = `value-${fieldIndex}-${index % 97}`;
  }

  return record;
}

function encodeRows(format: BenchmarkFormat, rows: readonly Record<string, string>[]): Buffer {
  switch (format) {
    case 'csv':
      return Buffer.from(encodeCsv(rows), 'utf8');
    case 'json':
      return Buffer.from(JSON.stringify(rows), 'utf8');
    case 'yaml':
      return Buffer.from(encodeYaml(rows), 'utf8');
    case 'xlsx':
      return encodeXlsx(rows);
  }
}

function encodeCsv(rows: readonly Record<string, string>[]): string {
  const fields = Object.keys(rows[0] ?? { Id: '' });
  return [
    fields.join(','),
    ...rows.map((row) => fields.map((field) => csvCell(row[field] ?? '')).join(',')),
  ].join('\r\n');
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function encodeYaml(rows: readonly Record<string, string>[]): string {
  return rows
    .map((row) =>
      Object.entries(row)
        .map(([field, value], index) => `${index === 0 ? '- ' : '  '}${field}: ${JSON.stringify(value)}`)
        .join('\n'),
    )
    .join('\n');
}

function encodeXlsx(rows: readonly Record<string, string>[]): Buffer {
  const requireFromAdapter = createRequire(
    new URL('../../packages/file-adapters/package.json', import.meta.url),
  );
  const xlsx = requireFromAdapter('xlsx') as XlsxApi;
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Benchmark');
  return xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

function formatMimeType(format: BenchmarkFormat): string {
  switch (format) {
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'yaml':
      return 'application/yaml';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
