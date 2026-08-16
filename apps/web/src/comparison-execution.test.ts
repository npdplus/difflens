import { describe, expect, it } from 'vitest';
import {
  compareDatasets,
  type ComparisonOptions,
  type NormalizedDataset,
} from '@difflens/comparison-core';

import {
  executeComparisonWorkerRequest,
  isCurrentComparisonJob,
} from './comparison-execution';

const before: NormalizedDataset = {
  id: 'before',
  fields: ['CustomerId', 'Name', 'ModifiedOn'],
  records: [
    {
      id: 'before-1',
      values: { CustomerId: 'C001', Name: 'Alpha', ModifiedOn: '2026-08-15' },
    },
    {
      id: 'before-2',
      values: { CustomerId: 'C002', Name: 'Beta', ModifiedOn: '2026-08-15' },
    },
  ],
};

const after: NormalizedDataset = {
  id: 'after',
  fields: ['CustomerId', 'Name', 'ModifiedOn'],
  records: [
    {
      id: 'after-1',
      values: { CustomerId: 'C001', Name: 'Alpha', ModifiedOn: '2026-08-16' },
    },
    {
      id: 'after-2',
      values: { CustomerId: 'C002', Name: 'เบต้า', ModifiedOn: '2026-08-16' },
    },
    {
      id: 'after-3',
      values: { CustomerId: 'C003', Name: 'Gamma', ModifiedOn: '2026-08-16' },
    },
  ],
};

const options: ComparisonOptions = {
  key: { field: 'CustomerId' },
  ignoredFields: ['ModifiedOn'],
};

describe('P05 comparison worker boundary', () => {
  it('returns authoritative P02 validation diagnostics through the serializable worker contract', () => {
    const response = executeComparisonWorkerRequest({
      type: 'validate',
      jobId: 7,
      before,
      after,
      options,
    });

    expect(response.type).toBe('validation-complete');
    if (response.type !== 'validation-complete') return;

    expect(response.jobId).toBe(7);
    expect(response.validation.valid).toBe(true);
    expect(response.validation.diagnostics).toEqual([]);
  });

  it('delivers the P02 comparison outcome without semantic mutation', () => {
    const response = executeComparisonWorkerRequest({
      type: 'compare',
      jobId: 8,
      before,
      after,
      options,
    });
    const directOutcome = compareDatasets(before, after, options);

    expect(response.type).toBe('comparison-complete');
    if (response.type !== 'comparison-complete') return;

    expect(response.outcome).toEqual(directOutcome);
    expect(response.outcome.status).toBe('success');

    if (response.outcome.status !== 'success') return;
    expect(response.outcome.result.configuration).toEqual({
      keyField: 'CustomerId',
      ignoredFields: ['ModifiedOn'],
    });
    expect(response.outcome.result.summary).toMatchObject({
      added: 1,
      removed: 0,
      changed: 1,
      unchanged: 1,
    });
  });

  it('rejects stale worker responses deterministically by job identity', () => {
    expect(isCurrentComparisonJob(12, 12)).toBe(true);
    expect(isCurrentComparisonJob(12, 11)).toBe(false);
    expect(isCurrentComparisonJob(null, 12)).toBe(false);
  });

  it('keeps duplicate-key blocking behavior owned by P02', () => {
    const duplicateAfter: NormalizedDataset = {
      ...after,
      records: [
        ...after.records,
        { id: 'after-duplicate', values: { CustomerId: 'C003', Name: 'Duplicate' } },
      ],
    };

    const response = executeComparisonWorkerRequest({
      type: 'compare',
      jobId: 9,
      before,
      after: duplicateAfter,
      options,
    });

    expect(response.type).toBe('comparison-complete');
    if (response.type !== 'comparison-complete') return;

    expect(response.outcome.status).toBe('invalid');
    if (response.outcome.status !== 'invalid') return;
    expect(response.outcome.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'duplicate-key', severity: 'error', side: 'after' }),
    );
  });

  it('preserves missing/null/empty-key warnings and Unicode values through P02', () => {
    const withMissing: NormalizedDataset = {
      ...after,
      records: [
        ...after.records,
        { id: 'after-missing', values: { CustomerId: '', Name: '<img onerror=alert(1)>' } },
      ],
    };

    const response = executeComparisonWorkerRequest({
      type: 'compare',
      jobId: 10,
      before,
      after: withMissing,
      options,
    });

    expect(response.type).toBe('comparison-complete');
    if (response.type !== 'comparison-complete') return;

    expect(response.outcome.status).toBe('success');
    if (response.outcome.status !== 'success') return;
    expect(response.outcome.result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'missing-key-value', severity: 'warning', side: 'after' }),
    );
    expect(response.outcome.result.changed[0]?.after.values.Name).toBe('เบต้า');
  });
});
