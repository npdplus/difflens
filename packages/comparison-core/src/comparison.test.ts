import { describe, expect, it } from 'vitest';

import {
  compareDatasets,
  type ComparisonOptions,
  type ComparisonResult,
  type NormalizedDataset,
  type NormalizedRecord,
  type NormalizedValue,
} from './index';

const options = (ignoredFields: readonly string[] = []): ComparisonOptions => ({
  key: { field: 'id' },
  ignoredFields,
});

const record = (
  id: string,
  values: Readonly<Record<string, NormalizedValue>>,
  recordIndex?: number,
): NormalizedRecord => ({
  id,
  values,
  ...(recordIndex === undefined ? {} : { source: { recordIndex } }),
});

const dataset = (
  id: string,
  records: readonly NormalizedRecord[],
  fields?: readonly string[],
): NormalizedDataset => ({
  id,
  fields:
    fields ??
    [...new Set(records.flatMap(({ values }) => Object.keys(values)))].sort(),
  records,
});

const compare = (
  before: NormalizedDataset,
  after: NormalizedDataset,
  comparisonOptions = options(),
): ComparisonResult => {
  const outcome = compareDatasets(before, after, comparisonOptions);
  expect(outcome.status).toBe('success');
  if (outcome.status !== 'success') {
    throw new Error('Expected comparison to succeed');
  }
  return outcome.result;
};

describe('comparison classification', () => {
  it('classifies identical datasets as unchanged', () => {
    const before = dataset('before', [
      record('b1', { id: 'C001', name: 'A' }),
      record('b2', { id: 'C002', name: 'B' }),
    ]);

    const result = compare(before, before);

    expect(result.summary).toEqual({
      beforeRecords: 2,
      afterRecords: 2,
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 2,
      unmatchableBefore: 0,
      unmatchableAfter: 0,
    });
  });

  it('classifies an added record', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', name: 'A' })]),
      dataset('after', [
        record('a1', { id: 'C001', name: 'A' }),
        record('a2', { id: 'C002', name: 'B' }),
      ]),
    );

    expect(result.added.map(({ key }) => key)).toEqual(['C002']);
    expect(result.summary.added).toBe(1);
  });

  it('classifies a removed record', () => {
    const result = compare(
      dataset('before', [
        record('b1', { id: 'C001', name: 'A' }),
        record('b2', { id: 'C002', name: 'B' }),
      ]),
      dataset('after', [record('a1', { id: 'C001', name: 'A' })]),
    );

    expect(result.removed.map(({ key }) => key)).toEqual(['C002']);
    expect(result.summary.removed).toBe(1);
  });

  it('classifies one and multiple changed fields', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', name: 'Alpha', active: true })]),
      dataset('after', [record('a1', { id: 'C001', name: 'Beta', active: false })]),
    );

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]?.differences.map(({ field, kind }) => [field, kind])).toEqual([
      ['active', 'changed'],
      ['name', 'changed'],
    ]);
  });

  it('reconciles mixed Added, Removed, Changed, and Unchanged results', () => {
    const result = compare(
      dataset('before', [
        record('b1', { id: 'A', value: 1 }),
        record('b2', { id: 'B', value: 2 }),
        record('b3', { id: 'C', value: 3 }),
      ]),
      dataset('after', [
        record('a1', { id: 'A', value: 1 }),
        record('a2', { id: 'B', value: 20 }),
        record('a4', { id: 'D', value: 4 }),
      ]),
    );

    expect(result.summary).toMatchObject({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(result.added[0]?.key).toBe('D');
    expect(result.removed[0]?.key).toBe('C');
    expect(result.changed[0]?.key).toBe('B');
    expect(result.unchanged[0]?.key).toBe('A');
  });

  it('treats a changed key as Removed plus Added', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', name: 'Same' })]),
      dataset('after', [record('a1', { id: 'C009', name: 'Same' })]),
    );

    expect(result.summary).toMatchObject({ added: 1, removed: 1, changed: 0, unchanged: 0 });
  });
});

describe('strict field comparison semantics', () => {
  it.each([
    ['null and empty string', null, ''],
    ['empty and whitespace string', '', ' '],
    ['case-only string change', 'Alpha', 'alpha'],
    ['number and numeric-looking string', 1, '1'],
    ['boolean change', true, false],
    ['date-like strings without normalization', '2026-08-16', '2026-08-16T00:00:00Z'],
  ] as const)('counts %s as changed', (_label: string, beforeValue: NormalizedValue, afterValue: NormalizedValue) => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', value: beforeValue })]),
      dataset('after', [record('a1', { id: 'C001', value: afterValue })]),
    );

    expect(result.summary.changed).toBe(1);
    expect(result.changed[0]?.differences[0]?.field).toBe('value');
  });

  it('distinguishes a missing field from explicit null', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001' })], ['id', 'value']),
      dataset('after', [record('a1', { id: 'C001', value: null })], ['id', 'value']),
    );

    expect(result.changed[0]?.differences).toEqual([
      {
        field: 'value',
        kind: 'added-field',
        before: { present: false },
        after: { present: true, value: null },
      },
    ]);
  });

  it('classifies added and removed fields explicitly', () => {
    const addedField = compare(
      dataset('before', [record('b1', { id: 'C001' })], ['id']),
      dataset('after', [record('a1', { id: 'C001', note: 'new' })], ['id', 'note']),
    );
    expect(addedField.changed[0]?.differences[0]?.kind).toBe('added-field');

    const removedField = compare(
      dataset('before', [record('b1', { id: 'C001', note: 'old' })], ['id', 'note']),
      dataset('after', [record('a1', { id: 'C001' })], ['id']),
    );
    expect(removedField.changed[0]?.differences[0]?.kind).toBe('removed-field');
  });

  it('ignores field order and nested object property order', () => {
    const result = compare(
      dataset('before', [
        record('b1', {
          id: 'C001',
          first: 'A',
          nested: { beta: 2, alpha: 1 },
        }),
      ]),
      dataset('after', [
        record('a1', {
          nested: { alpha: 1, beta: 2 },
          first: 'A',
          id: 'C001',
        }),
      ]),
    );

    expect(result.summary.unchanged).toBe(1);
    expect(result.summary.changed).toBe(0);
  });

  it('compares array values structurally and in order', () => {
    const same = compare(
      dataset('before', [record('b1', { id: 'C001', tags: ['a', 'b'] })]),
      dataset('after', [record('a1', { id: 'C001', tags: ['a', 'b'] })]),
    );
    expect(same.summary.unchanged).toBe(1);

    const reordered = compare(
      dataset('before', [record('b1', { id: 'C001', tags: ['a', 'b'] })]),
      dataset('after', [record('a1', { id: 'C001', tags: ['b', 'a'] })]),
    );
    expect(reordered.summary.changed).toBe(1);
  });

  it('supports Unicode and Thai values without coercion', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'ลูกค้า-001', name: 'สวัสดี 🌏' })]),
      dataset('after', [record('a1', { id: 'ลูกค้า-001', name: 'สวัสดี 🌎' })]),
    );

    expect(result.changed[0]?.key).toBe('ลูกค้า-001');
    expect(result.changed[0]?.differences[0]?.field).toBe('name');
  });

  it('handles very long values deterministically', () => {
    const beforeText = 'ก'.repeat(50_000);
    const afterText = `${beforeText}x`;
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', note: beforeText })]),
      dataset('after', [record('a1', { id: 'C001', note: afterText })]),
    );

    expect(result.summary.changed).toBe(1);
  });
});

describe('ignore fields', () => {
  it('ignores one changed field while retaining other differences', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', name: 'A', audit: 1 })]),
      dataset('after', [record('a1', { id: 'C001', name: 'B', audit: 2 })]),
      options(['audit']),
    );

    expect(result.changed[0]?.differences.map(({ field }) => field)).toEqual(['name']);
    expect(result.configuration.ignoredFields).toEqual(['audit']);
  });

  it('classifies ignored-field-only changes as unchanged', () => {
    const result = compare(
      dataset('before', [record('b1', { id: 'C001', audit: 1 })]),
      dataset('after', [record('a1', { id: 'C001', audit: 2 })]),
      options(['audit']),
    );

    expect(result.summary.changed).toBe(0);
    expect(result.summary.unchanged).toBe(1);
  });
});

describe('ordering and invariants', () => {
  it('is independent of source row order and returns deterministic key ordering', () => {
    const before = dataset('before', [
      record('b2', { id: 'B', value: 2 }),
      record('b1', { id: 'A', value: 1 }),
      record('b3', { id: 'C', value: 3 }),
    ]);
    const after = dataset('after', [
      record('a3', { id: 'C', value: 30 }),
      record('a1', { id: 'A', value: 1 }),
      record('a4', { id: 'D', value: 4 }),
    ]);

    const first = compare(before, after);
    const reordered = compare(
      dataset('before-reordered', [...before.records].reverse(), before.fields),
      dataset('after-reordered', [...after.records].reverse(), after.fields),
    );

    expect(first.summary).toEqual(reordered.summary);
    expect(first.added.map(({ key }) => key)).toEqual(['D']);
    expect(first.removed.map(({ key }) => key)).toEqual(['B']);
    expect(first.changed.map(({ key }) => key)).toEqual(['C']);
    expect(first.unchanged.map(({ key }) => key)).toEqual(['A']);
  });

  it('produces exactly equal results on repeated runs', () => {
    const before = dataset('before', [record('b1', { id: 'A', value: { z: 2, a: 1 } })]);
    const after = dataset('after', [record('a1', { id: 'A', value: { a: 1, z: 3 } })]);

    expect(compare(before, after)).toEqual(compare(before, after));
  });

  it('handles empty datasets when the selected key is part of the resolved schema', () => {
    const result = compare(
      dataset('before', [], ['id', 'name']),
      dataset('after', [], ['name', 'id']),
    );

    expect(result.summary).toEqual({
      beforeRecords: 0,
      afterRecords: 0,
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 0,
      unmatchableBefore: 0,
      unmatchableAfter: 0,
    });
  });

  it('preserves source warnings for downstream UI/report consumers', () => {
    const before: NormalizedDataset = {
      ...dataset('before', [], ['id']),
      warnings: [{ code: 'adapter-warning', context: { count: 1 } }],
    };
    const result = compare(before, dataset('after', [], ['id']));

    expect(result.sourceWarnings.before).toEqual(before.warnings);
    expect(result.sourceWarnings.after).toEqual([]);
  });
});

describe('large synthetic correctness', () => {
  it('correctly compares 10,000 keyed records without a timing threshold', () => {
    const count = 10_000;
    const beforeRecords = Array.from({ length: count }, (_, index) =>
      record(`b-${index}`, { id: index, value: index }),
    );
    const afterRecords = Array.from({ length: count }, (_, index) =>
      record(`a-${index}`, { id: index, value: index % 100 === 0 ? index + 1 : index }),
    );
    afterRecords.push(record('a-new', { id: count, value: count }));

    const result = compare(dataset('before', beforeRecords), dataset('after', afterRecords));

    expect(result.summary).toMatchObject({
      beforeRecords: 10_000,
      afterRecords: 10_001,
      added: 1,
      removed: 0,
      changed: 100,
      unchanged: 9_900,
    });
  });
});
