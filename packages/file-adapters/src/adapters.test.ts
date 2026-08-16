import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import { adaptFile, detectFileFormat, jsonAdapter, xlsxAdapter, yamlAdapter } from './index';

const fixture = (path: string) =>
  readFileSync(new URL(`../../../tests/fixtures/file-adapters/${path}`, import.meta.url), 'utf8');

const textInput = (name: string, text: string) => ({ kind: 'text' as const, name, text });
const binaryInput = (name: string, bytes: Uint8Array) => ({ kind: 'binary' as const, name, bytes });

function workbookBytes(
  sheets: Readonly<Record<string, readonly (readonly unknown[])[]>>,
): Uint8Array {
  const workbook = utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows.map((row) => [...row])), name);
  }
  return new Uint8Array(write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

describe('format detection', () => {
  it('detects supported extensions and requires explicit recovery for ambiguous text', () => {
    expect(detectFileFormat(textInput('data.csv', 'id,name\n1,A'))).toBe('csv');
    expect(detectFileFormat(textInput('data.yml', '- id: A'))).toBe('yaml');
    expect(detectFileFormat(textInput('unknown.txt', '[{"id":"A"}]'))).toBe('json');
    expect(detectFileFormat(textInput('unknown.txt', 'id,name\n1,A'))).toBeUndefined();
  });
});

describe('CSV adapter', () => {
  it('preserves strings, quoted delimiters/newlines, source rows, and Thai text', () => {
    const result = adaptFile(textInput('quoted.csv', fixture('csv/quoted.csv')));
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.dataset.records[0]?.values.note).toBe('hello, world');
    expect(result.dataset.records[1]?.values.note).toBe('line one\nline two');

    const thai = adaptFile(textInput('before.csv', fixture('csv/basic-before.csv')));
    expect(thai.status).toBe('success');
    if (thai.status === 'success') {
      expect(thai.dataset.records[1]?.values.name).toBe('สมชาย');
      expect(thai.dataset.records[0]?.source?.rowNumber).toBe(2);
    }
  });

  it('preserves missing versus explicitly empty CSV cells', () => {
    const result = adaptFile(textInput('missing.csv', 'id,name,note\nA,,x\nB,name\n'));
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.dataset.records[0]?.values.name).toBe('');
    expect(Object.hasOwn(result.dataset.records[1]?.values ?? {}, 'note')).toBe(false);
  });

  it('returns controlled diagnostics for duplicate headers and malformed input', () => {
    const duplicate = adaptFile(
      textInput('duplicate-header.csv', fixture('csv/duplicate-header.csv')),
    );
    expect(duplicate.status).toBe('error');
    expect(duplicate.diagnostics.map((item) => item.code)).toContain('duplicate-fields');

    const malformed = adaptFile(textInput('malformed.csv', fixture('csv/malformed.csv')));
    expect(malformed.status).toBe('error');
    expect(malformed.diagnostics.map((item) => item.code)).toContain('parse-failed');
  });

  it('treats a header-only CSV as an empty normalized dataset', () => {
    const result = adaptFile(textInput('empty.csv', 'id,name\n'));
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records).toHaveLength(0);
      expect(result.dataset.fields).toEqual(['id', 'name']);
      expect(result.dataset.warnings?.map((item) => item.code)).toContain('empty-dataset');
    }
  });
});

describe('JSON adapter', () => {
  it('supports top-level record arrays with structured nested values', () => {
    const result = jsonAdapter.adapt(
      textInput('nested.json', '[{"id":"A","nested":{"enabled":true},"tags":["x",2]}]'),
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records[0]?.values.nested).toEqual({ enabled: true });
      expect(result.dataset.records[0]?.values.tags).toEqual(['x', 2]);
    }
  });

  it('discovers multiple top-level record collections and requires selection', () => {
    const input = textInput('multiple.json', fixture('json/multiple.json'));
    const discovery = jsonAdapter.discover(input);
    expect(discovery.datasets.map((item) => item.name)).toEqual(['customers', 'products']);
    const pending = jsonAdapter.adapt(input);
    expect(pending.status).toBe('selection-required');
    const selected = jsonAdapter.adapt(input, 'collection:1');
    expect(selected.status).toBe('success');
    if (selected.status === 'success') {
      expect(selected.dataset.name).toBe('products');
    }
  });

  it('accepts an empty top-level record collection with an explicit warning', () => {
    const result = jsonAdapter.adapt(textInput('empty.json', '[]'));
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records).toHaveLength(0);
      expect(result.dataset.warnings?.map((item) => item.code)).toContain('empty-dataset');
    }
  });

  it('rejects malformed, primitive-list, and duplicate-property input', () => {
    expect(jsonAdapter.adapt(textInput('bad.json', fixture('json/malformed.json'))).status).toBe(
      'error',
    );
    const unsupported = jsonAdapter.adapt(
      textInput('unsupported.json', fixture('json/unsupported.json')),
    );
    expect(unsupported.status).toBe('error');
    expect(unsupported.diagnostics.map((item) => item.code)).toContain('no-record-collection');

    const duplicate = jsonAdapter.adapt(textInput('duplicate.json', '[{"id":"A","id":"B"}]'));
    expect(duplicate.status).toBe('error');
    expect(duplicate.diagnostics.map((item) => item.code)).toContain('duplicate-fields');
  });
});

describe('YAML adapter', () => {
  it('supports equivalent record-list shapes and Thai text', () => {
    const result = yamlAdapter.adapt(textInput('before.yaml', fixture('yaml/basic-before.yaml')));
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records[1]?.values.name).toBe('สมชาย');
    }
  });

  it('requires selection for multiple candidate collections', () => {
    const input = textInput('multiple.yaml', fixture('yaml/multiple.yaml'));
    expect(yamlAdapter.discover(input).datasets).toHaveLength(2);
    expect(yamlAdapter.adapt(input).status).toBe('selection-required');
  });

  it('accepts an empty record collection and rejects aliases/malformed YAML safely', () => {
    const empty = yamlAdapter.adapt(textInput('empty.yaml', '[]\n'));
    expect(empty.status).toBe('success');
    if (empty.status === 'success') {
      expect(empty.dataset.warnings?.map((item) => item.code)).toContain('empty-dataset');
    }

    const alias = yamlAdapter.adapt(textInput('alias.yaml', fixture('yaml/alias.yaml')));
    expect(alias.status).toBe('error');
    expect(alias.diagnostics.map((item) => item.code)).toContain('resource-limit');

    const malformed = yamlAdapter.adapt(textInput('bad.yaml', fixture('yaml/malformed.yaml')));
    expect(malformed.status).toBe('error');
    expect(malformed.diagnostics.map((item) => item.code)).toContain('parse-failed');
  });
});

describe('XLSX adapter', () => {
  it('discovers worksheets and requires an explicit choice when multiple exist', () => {
    const input = binaryInput(
      'multi.xlsx',
      workbookBytes({
        Customers: [
          ['id', 'name'],
          ['C1', 'ลูกค้า'],
        ],
        Products: [
          ['id', 'name'],
          ['P1', 'Product'],
        ],
      }),
    );
    expect(xlsxAdapter.discover(input).datasets.map((item) => item.name)).toEqual([
      'Customers',
      'Products',
    ]);
    expect(xlsxAdapter.adapt(input).status).toBe('selection-required');
    const selected = xlsxAdapter.adapt(input, 'sheet:1');
    expect(selected.status).toBe('success');
    if (selected.status === 'success') {
      expect(selected.dataset.records[0]?.values.id).toBe('P1');
      expect(selected.dataset.records[0]?.source?.rowNumber).toBe(2);
    }
  });

  it('preserves typed primitive cells without string coercion', () => {
    const input = binaryInput(
      'typed.xlsx',
      workbookBytes({
        Data: [
          ['id', 'amount', 'enabled'],
          ['A', 10, true],
          ['B', '10', false],
        ],
      }),
    );
    const result = xlsxAdapter.adapt(input);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records[0]?.values.amount).toBe(10);
      expect(result.dataset.records[1]?.values.amount).toBe('10');
      expect(result.dataset.records[0]?.values.enabled).toBe(true);
    }
  });

  it('reports formula and hyperlink metadata but never evaluates or follows it', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ['id', 'value', 'link'],
      ['A', 2, 'safe text'],
    ]);
    sheet.B2 = { t: 'n', v: 2, f: '1+1' };
    sheet.C2 = { t: 's', v: 'safe text', l: { Target: 'https://example.invalid/' } };
    utils.book_append_sheet(workbook, sheet, 'Data');
    const bytes = new Uint8Array(
      write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer,
    );
    const result = xlsxAdapter.adapt(binaryInput('safe.xlsx', bytes));
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records[0]?.values.value).toBe(2);
      expect(result.diagnostics.map((item) => item.code)).toContain('formula-cell');
      expect(result.diagnostics.map((item) => item.code)).toContain('external-link');
    }
  });

  it('keeps spreadsheet date storage deterministic as numeric serial data', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([
      ['id', 'date'],
      ['A', new Date(Date.UTC(2026, 0, 2))],
    ]);
    utils.book_append_sheet(workbook, sheet, 'Data');
    const bytes = new Uint8Array(
      write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer,
    );
    const result = xlsxAdapter.adapt(binaryInput('date.xlsx', bytes));
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(typeof result.dataset.records[0]?.values.date).toBe('number');
    }
  });

  it('controls empty, duplicate-header, malformed, and unsupported extension cases', () => {
    const empty = xlsxAdapter.adapt(binaryInput('empty.xlsx', workbookBytes({ Data: [] })));
    expect(empty.status).toBe('success');
    if (empty.status === 'success') expect(empty.dataset.records).toHaveLength(0);

    const duplicate = xlsxAdapter.adapt(
      binaryInput(
        'duplicate.xlsx',
        workbookBytes({
          Data: [
            ['id', 'name', 'name'],
            ['A', 'One', 'Two'],
          ],
        }),
      ),
    );
    expect(duplicate.status).toBe('error');
    expect(duplicate.diagnostics.map((item) => item.code)).toContain('duplicate-fields');

    expect(xlsxAdapter.adapt(binaryInput('bad.xlsx', new Uint8Array([1, 2, 3, 4]))).status).toBe(
      'error',
    );
    expect(
      xlsxAdapter.adapt(binaryInput('macro.xlsm', workbookBytes({ Data: [['id'], ['A']] }))).status,
    ).toBe('error');
  });
});
