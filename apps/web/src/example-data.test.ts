import { compareDatasets } from '@difflens/comparison-core';
import { describe, expect, it } from 'vitest';

import { createExampleFiles, DIFFLENS_EXAMPLES } from './example-data';
import { loadLocalFile } from './file-intake';

describe('DiffLens P07 synthetic examples', () => {
  it.each(DIFFLENS_EXAMPLES)('$title uses the real file-adapter and comparison-core pipeline', async (example) => {
    const files = createExampleFiles(example);
    const [beforeState, afterState] = await Promise.all([
      loadLocalFile(files.before),
      loadLocalFile(files.after),
    ]);

    expect(beforeState.status).toBe('ready');
    expect(afterState.status).toBe('ready');
    if (beforeState.status !== 'ready' || afterState.status !== 'ready') {
      throw new Error('Expected example files to normalize through P03.');
    }

    const outcome = compareDatasets(beforeState.dataset, afterState.dataset, {
      key: { field: example.keyField },
    });
    expect(outcome.status).toBe('success');
    if (outcome.status !== 'success') {
      throw new Error('Expected example comparison to succeed through P02.');
    }

    expect(outcome.result.summary).toMatchObject(example.expected);

    if (example.expectedWithSuggestedIgnoredFields !== undefined) {
      const ignoredOutcome = compareDatasets(beforeState.dataset, afterState.dataset, {
        key: { field: example.keyField },
        ignoredFields: example.suggestedIgnoredFields,
      });
      expect(ignoredOutcome.status).toBe('success');
      if (ignoredOutcome.status !== 'success') {
        throw new Error('Expected ignored-field example comparison to succeed.');
      }
      expect(ignoredOutcome.result.summary).toMatchObject(example.expectedWithSuggestedIgnoredFields);
    }
  });

  it('keeps example data public-safe and free of obvious credential material', () => {
    for (const example of DIFFLENS_EXAMPLES) {
      const combined = `${example.before.content}\n${example.after.content}`;
      expect(example.before.name).toMatch(/^difflens-/u);
      expect(example.after.name).toMatch(/^difflens-/u);
      expect(combined).not.toMatch(/password|api[_-]?key|client[_-]?secret|bearer\s+[a-z0-9]/iu);
    }
  });
});
