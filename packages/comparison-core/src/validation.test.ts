import { describe, expect, it } from 'vitest';

import {
  compareDatasets,
  validateComparisonInput,
  type NormalizedDataset,
  type NormalizedRecord,
  type NormalizedValue,
} from './index';

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
  fields: readonly string[] = ['id', 'value'],
): NormalizedDataset => ({ id, fields, records });

const options = { key: { field: 'id' } } as const;

describe('key configuration validation', () => {
  it('requires an explicit selected key', () => {
    const outcome = compareDatasets(
      dataset('before', [], ['id']),
      dataset('after', [], ['id']),
      { key: { field: '' } },
    );

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.diagnostics).toContainEqual({
        code: 'key-not-selected',
        severity: 'error',
        side: 'comparison',
      });
    }
  });

  it('reports the selected key field missing from either resolved dataset schema', () => {
    const validation = validateComparisonInput(
      dataset('before', [], ['name']),
      dataset('after', [], ['name']),
      options,
    );

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual([
      { code: 'key-field-missing', severity: 'error', side: 'before', field: 'id' },
      { code: 'key-field-missing', severity: 'error', side: 'after', field: 'id' },
    ]);
  });

  it('rejects a key that is also configured as ignored', () => {
    const outcome = compareDatasets(
      dataset('before', [], ['id']),
      dataset('after', [], ['id']),
      { key: { field: 'id' }, ignoredFields: ['id'] },
    );

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.diagnostics[0]).toEqual({
        code: 'invalid-key-configuration',
        severity: 'error',
        side: 'comparison',
        field: 'id',
      });
    }
  });
});

describe('duplicate key handling', () => {
  it.each([
    ['Before', [record('b1', { id: 'DUP', value: 1 }), record('b2', { id: 'DUP', value: 2 })], [record('a1', { id: 'DUP', value: 1 })], 'before'],
    ['After', [record('b1', { id: 'DUP', value: 1 })], [record('a1', { id: 'DUP', value: 1 }), record('a2', { id: 'DUP', value: 2 })], 'after'],
  ] as const)('blocks authoritative comparison for duplicates in %s', (
    _label: string,
    beforeRecords: readonly NormalizedRecord[],
    afterRecords: readonly NormalizedRecord[],
    side: 'before' | 'after',
  ) => {
    const outcome = compareDatasets(
      dataset('before', beforeRecords),
      dataset('after', afterRecords),
      options,
    );

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      const diagnostic = outcome.diagnostics.find(({ code }) => code === 'duplicate-key');
      expect(diagnostic).toMatchObject({
        code: 'duplicate-key',
        severity: 'error',
        side,
        field: 'id',
        count: 2,
      });
      expect(diagnostic?.examples?.[0]?.key).toBe('DUP');
      expect(diagnostic?.examples?.[0]?.records).toHaveLength(2);
    }
  });

  it('reports duplicates independently on both sides', () => {
    const duplicate = [
      record('r1', { id: 'DUP', value: 1 }),
      record('r2', { id: 'DUP', value: 2 }),
    ];
    const validation = validateComparisonInput(
      dataset('before', duplicate),
      dataset('after', duplicate),
      options,
    );

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.filter(({ code }) => code === 'duplicate-key')).toHaveLength(2);
  });

  it('preserves source type distinctions for keys with the same display text', () => {
    const outcome = compareDatasets(
      dataset('before', [record('b1', { id: 1, value: 'same' })]),
      dataset('after', [record('a1', { id: '1', value: 'same' })]),
      options,
    );

    expect(outcome.status).toBe('success');
    if (outcome.status === 'success') {
      expect(outcome.result.summary).toMatchObject({ added: 1, removed: 1, changed: 0 });
    }
  });
});

describe('missing key handling', () => {
  it('keeps missing, null, and empty key values unmatchable instead of collapsing them', () => {
    const before = dataset('before', [
      record('b-missing', { value: 'missing' }, 0),
      record('b-null', { id: null, value: 'null' }, 1),
      record('b-empty', { id: '', value: 'empty' }, 2),
      record('b-valid', { id: 'A', value: 1 }, 3),
    ]);
    const after = dataset('after', [record('a-valid', { id: 'A', value: 1 }, 0)]);

    const outcome = compareDatasets(before, after, options);

    expect(outcome.status).toBe('success');
    if (outcome.status !== 'success') return;

    expect(outcome.result.summary).toMatchObject({
      beforeRecords: 4,
      unchanged: 1,
      unmatchableBefore: 3,
    });
    expect(outcome.result.unmatchable.before.map(({ record }) => record.id)).toEqual([
      'b-missing',
      'b-null',
      'b-empty',
    ]);
    expect(outcome.result.diagnostics).toContainEqual({
      code: 'missing-key-value',
      severity: 'warning',
      side: 'before',
      field: 'id',
      count: 3,
      examples: [
        { records: [{ recordId: 'b-missing', source: { recordIndex: 0 } }] },
        { records: [{ recordId: 'b-null', source: { recordIndex: 1 } }] },
        { records: [{ recordId: 'b-empty', source: { recordIndex: 2 } }] },
      ],
    });
  });

  it('treats whitespace-only keys as real strict string values', () => {
    const outcome = compareDatasets(
      dataset('before', [record('b1', { id: ' ', value: 1 })]),
      dataset('after', [record('a1', { id: ' ', value: 1 })]),
      options,
    );

    expect(outcome.status).toBe('success');
    if (outcome.status === 'success') {
      expect(outcome.result.summary.unchanged).toBe(1);
      expect(outcome.result.summary.unmatchableBefore).toBe(0);
    }
  });

  it('supports Unicode and Thai key values', () => {
    const outcome = compareDatasets(
      dataset('before', [record('b1', { id: 'รหัส-๑', value: 1 })]),
      dataset('after', [record('a1', { id: 'รหัส-๑', value: 2 })]),
      options,
    );

    expect(outcome.status).toBe('success');
    if (outcome.status === 'success') {
      expect(outcome.result.changed[0]?.key).toBe('รหัส-๑');
    }
  });
});

describe('diagnostic safety and stability', () => {
  it('limits duplicate examples while preserving stable machine-readable codes', () => {
    const records = Array.from({ length: 7 }, (_, group) => [
      record(`a-${group}`, { id: `D${group}`, value: 1 }),
      record(`b-${group}`, { id: `D${group}`, value: 2 }),
    ]).flat();

    const validation = validateComparisonInput(
      dataset('before', records),
      dataset('after', [], ['id', 'value']),
      options,
    );
    const duplicate = validation.diagnostics.find(({ code }) => code === 'duplicate-key');

    expect(duplicate?.examples).toHaveLength(5);
    expect(duplicate?.examples?.map(({ key }) => key)).toEqual(['D0', 'D1', 'D2', 'D3', 'D4']);
  });

  it('preserves source warnings even when key validation blocks comparison', () => {
    const before: NormalizedDataset = {
      ...dataset('before', [], ['name']),
      warnings: [{ code: 'parser-note' }],
    };
    const outcome = compareDatasets(before, dataset('after', [], ['name']), options);

    expect(outcome.status).toBe('invalid');
    if (outcome.status === 'invalid') {
      expect(outcome.sourceWarnings.before).toEqual([{ code: 'parser-note' }]);
    }
  });
});
