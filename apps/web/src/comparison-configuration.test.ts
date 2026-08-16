import { describe, expect, it } from 'vitest';
import type { ComparisonDiagnostic, NormalizedDataset } from '@difflens/comparison-core';

import {
  commonFields,
  comparisonDiagnosticMessage,
  relevantFields,
  suggestKeyFields,
} from './comparison-configuration';

const dataset = (id: string, fields: readonly string[]): NormalizedDataset => ({
  id,
  fields,
  records: [],
});

describe('P05 comparison configuration helpers', () => {
  it('exposes only common fields as key options and all relevant fields for ignore options', () => {
    const before = dataset('before', ['CustomerId', 'Name', 'BeforeOnly']);
    const after = dataset('after', ['Name', 'CustomerId', 'AfterOnly']);

    expect(commonFields(before, after)).toEqual(['CustomerId', 'Name']);
    expect(relevantFields(before, after)).toEqual([
      'AfterOnly',
      'BeforeOnly',
      'CustomerId',
      'Name',
    ]);
  });

  it('suggests common identifier-style fields without silently selecting one', () => {
    const before = dataset('before', ['Name', 'CustomerId', 'OrderCode', 'Notes']);
    const after = dataset('after', ['OrderCode', 'CustomerId', 'Name']);

    expect(suggestKeyFields(before, after)).toEqual(['CustomerId', 'OrderCode']);
  });

  it('does not expose diagnostic example values in safe UI messages', () => {
    const diagnostic: ComparisonDiagnostic = {
      code: 'duplicate-key',
      severity: 'error',
      side: 'before',
      field: 'CustomerId',
      count: 2,
      examples: [
        {
          key: '<script>globalThis.pwned=true</script>',
          records: [{ recordId: 'record-1' }, { recordId: 'record-2' }],
        },
      ],
    };

    const message = comparisonDiagnosticMessage(diagnostic);
    expect(message).toContain('2 records');
    expect(message).toContain('CustomerId');
    expect(message).not.toContain('<script>');
    expect(message).not.toContain('record-1');
  });
});
