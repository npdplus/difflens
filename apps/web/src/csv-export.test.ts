import { compareDatasets, type NormalizedDataset } from '@difflens/comparison-core';
import { describe, expect, it, vi } from 'vitest';

import {
  CSV_EXPORT_FILENAME,
  buildComparisonCsv,
  createComparisonCsvBlob,
  downloadComparisonCsv,
  escapeCsvCell,
  neutralizeSpreadsheetFormula,
  serializeNormalizedValue,
} from './csv-export';

function dataset(id: string, records: NormalizedDataset['records']): NormalizedDataset {
  return {
    id,
    fields: ['CustomerId', 'Name', 'Note', 'Nullable', 'Empty', 'Structured'],
    records,
  };
}

function resultFixture() {
  const before = dataset('before', [
    {
      id: 'before-1',
      values: {
        CustomerId: 'C001',
        Name: 'Alpha',
        Note: '=SUM(A1:A2)',
        Nullable: null,
        Empty: '',
        Structured: { z: 2, a: 'ไทย' },
      },
    },
    {
      id: 'before-2',
      values: { CustomerId: 'C002', Name: 'Removed, "quoted"\nline' },
    },
  ]);
  const after = dataset('after', [
    {
      id: 'after-1',
      values: {
        CustomerId: 'C001',
        Name: 'อัลฟ่า',
        Note: '  @danger',
        Nullable: '',
        Empty: '',
        Structured: { a: 'ไทย', z: 3 },
      },
    },
    {
      id: 'after-3',
      values: { CustomerId: 'C003', Name: '+Added' },
    },
  ]);

  const outcome = compareDatasets(before, after, { key: { field: 'CustomerId' } });
  if (outcome.status !== 'success') {
    throw new Error('Expected successful comparison fixture.');
  }
  return outcome.result;
}

describe('DiffLens P07 CSV export', () => {
  it('emits the required deterministic header and authoritative Changed/Added/Removed rows', () => {
    const csv = buildComparisonCsv(resultFixture());

    expect(csv.startsWith('\uFEFFRecordKey,ChangeType,Field,BeforeValue,AfterValue\r\n')).toBe(true);
    expect(csv).toContain('C001,Changed,Name,Alpha,อัลฟ่า');
    expect(csv).toContain("C001,Changed,Note,'=SUM(A1:A2),'  @danger");
    expect(csv).toContain('C001,Changed,Nullable,null,""""""');
    expect(csv).toContain('C001,Changed,Structured,"{""a"":""ไทย"",""z"":2}","{""a"":""ไทย"",""z"":3}"');
    expect(csv).toContain("C003,Added,Name,[missing],'+Added");
    expect(csv).toContain('C002,Removed,Name,"Removed, ""quoted""\nline",[missing]');
    expect(buildComparisonCsv(resultFixture())).toBe(csv);
  });

  it('distinguishes null, empty string, structured values, and field absence in serialization', () => {
    expect(serializeNormalizedValue(null)).toBe('null');
    expect(serializeNormalizedValue('')).toBe('""');
    expect(serializeNormalizedValue(false)).toBe('false');
    expect(serializeNormalizedValue(-12.5)).toBe('-12.5');
    expect(serializeNormalizedValue({ b: 2, a: ['ไทย', true] })).toBe(
      '{"a":["ไทย",true],"b":2}',
    );
    expect(buildComparisonCsv(resultFixture())).toContain('[missing]');
  });

  it.each([
    ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
    ['+1+1', "'+1+1"],
    ['-10', "'-10"],
    ['@command', "'@command"],
    ['   =SUM(A1:A2)', "'   =SUM(A1:A2)"],
    ['\t+1', "'\t+1"],
    ['ordinary-value', 'ordinary-value'],
    ['1-2', '1-2'],
  ])('neutralizes formula-risk value %j without rewriting ordinary text', (input, expected) => {
    expect(neutralizeSpreadsheetFormula(input)).toBe(expected);
  });

  it('quotes commas, quotes, CR/LF, and leaves ordinary cells readable', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('creates a UTF-8 CSV Blob with BOM and a safe deterministic filename', async () => {
    const result = resultFixture();
    const blob = createComparisonCsvBlob(result);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(CSV_EXPORT_FILENAME).toBe('difflens-comparison-report.csv');
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(await blob.text()).toContain('RecordKey,ChangeType,Field,BeforeValue,AfterValue');
    expect(await blob.text()).toContain('อัลฟ่า');
  });

  it('uses only a browser-local object URL download path', () => {
    const createObjectUrl = vi.fn(() => 'blob:difflens-local-report');
    const revokeObjectUrl = vi.fn();
    const triggerDownload = vi.fn();

    downloadComparisonCsv(resultFixture(), {
      createObjectUrl,
      revokeObjectUrl,
      triggerDownload,
    });

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(triggerDownload).toHaveBeenCalledWith(
      'blob:difflens-local-report',
      'difflens-comparison-report.csv',
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:difflens-local-report');
  });
});
