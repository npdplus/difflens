import { readFileSync } from 'node:fs';

import { compareDatasets } from '@difflens/comparison-core';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import type { AdapterInput } from './contracts';
import { adaptFile } from './index';

const fixture = (path: string) =>
  readFileSync(new URL(`../../../tests/fixtures/file-adapters/${path}`, import.meta.url), 'utf8');

function xlsxInput(name: string, rows: readonly (readonly unknown[])[]): AdapterInput {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows.map((row) => [...row])), 'Data');
  return {
    kind: 'binary',
    name,
    bytes: new Uint8Array(write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer),
  };
}

const expectedSummary = {
  beforeRecords: 3,
  afterRecords: 3,
  added: 1,
  removed: 1,
  changed: 1,
  unchanged: 1,
  unmatchableBefore: 0,
  unmatchableAfter: 0,
};

describe('file adapter -> normalized dataset -> comparison-core integration', () => {
  it.each([
    [
      'csv',
      {
        kind: 'text',
        name: 'before.csv',
        text: fixture('csv/basic-before.csv'),
      } satisfies AdapterInput,
      {
        kind: 'text',
        name: 'after.csv',
        text: fixture('csv/basic-after.csv'),
      } satisfies AdapterInput,
    ],
    [
      'json',
      {
        kind: 'text',
        name: 'before.json',
        text: fixture('json/basic-before.json'),
      } satisfies AdapterInput,
      {
        kind: 'text',
        name: 'after.json',
        text: fixture('json/basic-after.json'),
      } satisfies AdapterInput,
    ],
    [
      'yaml',
      {
        kind: 'text',
        name: 'before.yaml',
        text: fixture('yaml/basic-before.yaml'),
      } satisfies AdapterInput,
      {
        kind: 'text',
        name: 'after.yaml',
        text: fixture('yaml/basic-after.yaml'),
      } satisfies AdapterInput,
    ],
    [
      'xlsx',
      xlsxInput('before.xlsx', [
        ['id', 'name', 'status'],
        ['A', 'Alpha', 'active'],
        ['B', 'สมชาย', 'active'],
        ['D', 'Delta', 'active'],
      ]),
      xlsxInput('after.xlsx', [
        ['id', 'name', 'status'],
        ['A', 'Alpha', 'inactive'],
        ['B', 'สมชาย', 'active'],
        ['C', 'Charlie', 'active'],
      ]),
    ],
  ])(
    '%s fixtures produce the authoritative comparison result',
    (_format: string, beforeInput: AdapterInput, afterInput: AdapterInput) => {
      const before = adaptFile(beforeInput);
      const after = adaptFile(afterInput);
      expect(before.status).toBe('success');
      expect(after.status).toBe('success');
      if (before.status !== 'success' || after.status !== 'success') return;

      const outcome = compareDatasets(before.dataset, after.dataset, { key: { field: 'id' } });
      expect(outcome.status).toBe('success');
      if (outcome.status === 'success') {
        expect(outcome.result.summary).toEqual(expectedSummary);
        expect(outcome.result.changed[0]?.differences.map((item) => item.field)).toEqual([
          'status',
        ]);
      }
    },
  );
});
