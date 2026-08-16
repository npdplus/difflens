import { renderToStaticMarkup } from 'react-dom/server';
import { compareDatasets, type ComparisonResult, type NormalizedDataset } from '@difflens/comparison-core';
import { describe, expect, it } from 'vitest';

import {
  ResultExperience,
  createResultItems,
  displayNormalizedValue,
  filterResultItems,
  visibleResultRange,
} from './ResultExperience';

function dataset(
  id: string,
  records: NormalizedDataset['records'],
  warnings: NormalizedDataset['warnings'] = [],
): NormalizedDataset {
  return {
    id,
    fields: ['CustomerId', 'Name', 'Legacy', 'NewField', 'Note'],
    records,
    warnings,
  };
}

function comparisonResult(): ComparisonResult {
  const before = dataset(
    'before',
    [
      {
        id: 'before-1',
        values: {
          CustomerId: 'C001',
          Name: 'Alpha',
          Legacy: 'old',
          Note: '<script>Reflect.set(window,"__pwnedBefore",true)</script>',
        },
      },
      { id: 'before-2', values: { CustomerId: 'C002', Name: 'Removed' } },
      { id: 'before-4', values: { CustomerId: 'C004', Name: 'Same' } },
      { id: 'before-missing', values: { Name: 'Missing key before' } },
    ],
    [{ code: 'parser-warning' }],
  );
  const after = dataset(
    'after',
    [
      {
        id: 'after-1',
        values: {
          CustomerId: 'C001',
          Name: 'อัลฟ่า',
          NewField: 'new',
          Note: '<script>Reflect.set(window,"__pwnedAfter",true)</script>',
        },
      },
      { id: 'after-3', values: { CustomerId: 'C003', Name: 'Added' } },
      { id: 'after-4', values: { CustomerId: 'C004', Name: 'Same' } },
      { id: 'after-missing', values: { Name: 'Missing key after' } },
    ],
    [{ code: 'parser-warning' }],
  );

  const outcome = compareDatasets(before, after, { key: { field: 'CustomerId' } });
  if (outcome.status !== 'success') {
    throw new Error('Expected a successful comparison fixture.');
  }

  return outcome.result;
}

describe('DiffLens P06 results experience', () => {
  it('renders authoritative summary, warnings, changed fields, Unicode, and inert imported text', () => {
    const result = comparisonResult();
    const markup = renderToStaticMarkup(<ResultExperience result={result} />);

    expect(markup).toContain('Before records');
    expect(markup).toContain('After records');
    expect(markup).toContain('Added');
    expect(markup).toContain('Removed');
    expect(markup).toContain('Changed');
    expect(markup).toContain('Unchanged');
    expect(markup).toContain('Unmatchable records');
    expect(markup).toContain('Added field');
    expect(markup).toContain('Removed field');
    expect(markup).toContain('อัลฟ่า');
    expect(markup).toContain('&lt;script&gt;');
    expect(markup).not.toContain('<script>Reflect.set');
  });

  it('filters existing result items by authoritative classification and displayed key only', () => {
    const items = createResultItems(comparisonResult());

    expect(filterResultItems(items, 'changed', '')).toHaveLength(1);
    expect(filterResultItems(items, 'added', '')).toHaveLength(1);
    expect(filterResultItems(items, 'removed', '')).toHaveLength(1);
    expect(filterResultItems(items, 'all', 'c001')).toHaveLength(1);
    expect(filterResultItems(items, 'all', 'C003')).toHaveLength(1);
    expect(filterResultItems(items, 'all', 'Alpha')).toHaveLength(0);
  });

  it('keeps large lists windowed instead of returning an unbounded visible range', () => {
    const first = visibleResultRange(50_000, 0);
    const middle = visibleResultRange(50_000, 8400);

    expect(first.start).toBe(0);
    expect(first.end).toBeLessThan(20);
    expect(middle.start).toBeGreaterThan(0);
    expect(middle.end - middle.start).toBeLessThan(20);
  });

  it('preserves display distinctions for empty, null, typed, and structured values', () => {
    expect(displayNormalizedValue('')).toBe('"" (empty string)');
    expect(displayNormalizedValue(null)).toBe('null');
    expect(displayNormalizedValue(1)).toBe('1');
    expect(displayNormalizedValue(true)).toBe('true');
    expect(displayNormalizedValue({ nested: ['ไทย', 1] })).toBe('{"nested":["ไทย",1]}');
  });

  it('renders an explicit no-change state when all matchable records are unchanged', () => {
    const source = dataset('same', [
      { id: 'one', values: { CustomerId: 'C001', Name: 'Same' } },
    ]);
    const outcome = compareDatasets(source, source, { key: { field: 'CustomerId' } });
    if (outcome.status !== 'success') {
      throw new Error('Expected successful no-change comparison.');
    }

    const markup = renderToStaticMarkup(<ResultExperience result={outcome.result} />);
    expect(markup).toContain('No compared changes found.');
    expect(markup).toContain('1 matchable record remained unchanged.');
  });
});
