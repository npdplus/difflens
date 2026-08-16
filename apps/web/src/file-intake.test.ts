import type { AdapterResult } from '@difflens/file-adapters';
import { describe, expect, it } from 'vitest';

import {
  diagnosticMessage,
  formatFileSize,
  isConfigurationReady,
  toFinishedFileState,
  type LocalFileMetadata,
} from './file-intake';

const fakeFile = {} as File;
const metadata: LocalFileMetadata = {
  name: 'ลูกค้า.csv',
  size: 1536,
  mimeType: 'text/csv',
  lastModified: 0,
};

describe('P04 file intake state', () => {
  it('maps unsupported adapter results to a recoverable unsupported state', () => {
    const result: AdapterResult = {
      status: 'error',
      datasets: [],
      diagnostics: [{ code: 'unsupported-format', severity: 'error' }],
    };

    const state = toFinishedFileState(fakeFile, metadata, result);

    expect(state.status).toBe('unsupported');
    if (state.status === 'unsupported') {
      expect(state.metadata.name).toBe('ลูกค้า.csv');
    }
  });

  it('preserves deterministic dataset choices without selecting on behalf of the user', () => {
    const result: AdapterResult = {
      status: 'selection-required',
      format: 'json',
      datasets: [
        { id: 'collection:0', name: 'customers', recordCount: 2 },
        { id: 'collection:1', name: 'archive', recordCount: 1 },
      ],
      diagnostics: [
        {
          code: 'multiple-record-collections',
          severity: 'warning',
          context: { count: 2 },
        },
      ],
    };

    const state = toFinishedFileState(fakeFile, metadata, result);

    expect(state.status).toBe('selection-required');
    if (state.status === 'selection-required') {
      expect(state.datasets.map((dataset) => dataset.name)).toEqual(['customers', 'archive']);
    }
  });

  it('treats a normalized dataset with fields as configuration-ready without comparing it', () => {
    const result: AdapterResult = {
      status: 'success',
      format: 'csv',
      dataset: {
        id: 'csv',
        name: 'CSV',
        fields: ['CustomerId', 'Name'],
        records: [],
        warnings: [{ code: 'empty-dataset', source: { dataset: 'CSV' } }],
      },
      datasets: [{ id: 'csv', name: 'CSV', recordCount: 0 }],
      diagnostics: [{ code: 'empty-dataset', severity: 'warning' }],
    };

    const state = toFinishedFileState(fakeFile, metadata, result);

    expect(state.status).toBe('ready');
    expect(isConfigurationReady(state)).toBe(true);
  });

  it('uses controlled diagnostic copy rather than raw parser exceptions or source values', () => {
    expect(diagnosticMessage({ code: 'parse-failed', severity: 'error' })).toBe(
      'DiffLens could not parse this file. Check the file and try again.',
    );
    expect(
      diagnosticMessage({
        code: 'parser-warning',
        severity: 'warning',
        context: { count: 3, sensitive: '<script>doNotRender()</script>' },
      }),
    ).toBe('The parser reported a non-blocking warning (3).');
  });

  it('formats local file size metadata without inventing a product size limit', () => {
    expect(formatFileSize(42)).toBe('42 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
