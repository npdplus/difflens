import Papa from 'papaparse';

import { AdapterShapeError, emptyDatasetWarning, normalizeRecordCollection } from './common';
import type {
  AdapterDiagnostic,
  AdapterInput,
  AdapterResult,
  DatasetDescriptor,
  FileAdapter,
} from './contracts';

const DATASET: DatasetDescriptor = { id: 'csv', name: 'CSV' };

export const csvAdapter: FileAdapter = {
  format: 'csv',
  discover(input) {
    const prepared = prepareCsv(input);
    return {
      format: 'csv',
      datasets: prepared.status === 'ok' ? [{ ...DATASET, recordCount: prepared.rows.length }] : [],
      diagnostics: prepared.diagnostics,
    };
  },
  adapt(input) {
    const prepared = prepareCsv(input);
    if (prepared.status === 'error') {
      return errorResult(prepared.diagnostics);
    }

    const diagnostics = [...prepared.diagnostics];
    if (prepared.rows.length === 0) {
      diagnostics.push(emptyDatasetWarning('CSV'));
    }

    try {
      const objects = prepared.rows.map((row) =>
        Object.fromEntries(
          prepared.headers.flatMap((header, index) =>
            index < row.length ? [[header, row[index] ?? ''] as const] : [],
          ),
        ),
      );
      const dataset = normalizeRecordCollection({
        datasetId: DATASET.id,
        datasetName: DATASET.name,
        records: objects,
        predefinedFields: prepared.headers,
        warnings: diagnostics,
        sourceForRecord: (index) => ({ dataset: 'CSV', rowNumber: index + 2, recordIndex: index }),
      });
      return {
        status: 'success',
        format: 'csv',
        dataset,
        datasets: [{ ...DATASET, recordCount: prepared.rows.length }],
        diagnostics,
      } satisfies AdapterResult;
    } catch (error) {
      return shapeFailure(error, diagnostics);
    }
  },
};

type PreparedCsv =
  | {
      readonly status: 'ok';
      readonly headers: readonly string[];
      readonly rows: readonly string[][];
      readonly diagnostics: readonly AdapterDiagnostic[];
    }
  | { readonly status: 'error'; readonly diagnostics: readonly AdapterDiagnostic[] };

function prepareCsv(input: AdapterInput): PreparedCsv {
  if (input.kind !== 'text') {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }

  const text = stripBom(input.text);
  if (text.trim().length === 0) {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }

  const parsed = Papa.parse<string[]>(text, {
    dynamicTyping: false,
    header: false,
    skipEmptyLines: 'greedy',
  });

  const fatalParseError = parsed.errors.some((error) => error.type === 'Quotes');
  if (fatalParseError || parsed.data.length === 0) {
    return { status: 'error', diagnostics: [{ code: 'parse-failed', severity: 'error' }] };
  }

  const headerRow = parsed.data[0] ?? [];
  const headers = headerRow.map((value) => value ?? '');
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    return { status: 'error', diagnostics: [{ code: 'unsupported-shape', severity: 'error' }] };
  }

  if (new Set(headers).size !== headers.length) {
    return { status: 'error', diagnostics: [{ code: 'duplicate-fields', severity: 'error' }] };
  }

  const rows = parsed.data.slice(1);
  if (rows.some((row) => row.length > headers.length)) {
    return { status: 'error', diagnostics: [{ code: 'unsupported-shape', severity: 'error' }] };
  }

  const diagnostics: AdapterDiagnostic[] = [];
  if (parsed.errors.some((error) => error.type !== 'Quotes')) {
    diagnostics.push({
      code: 'parser-warning',
      severity: 'warning',
      context: { count: parsed.errors.filter((error) => error.type !== 'Quotes').length },
    });
  }

  return { status: 'ok', headers, rows, diagnostics };
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function errorResult(diagnostics: readonly AdapterDiagnostic[]): AdapterResult {
  return { status: 'error', format: 'csv', datasets: [], diagnostics };
}

function shapeFailure(error: unknown, diagnostics: readonly AdapterDiagnostic[]): AdapterResult {
  const code = error instanceof AdapterShapeError ? error.code : 'parse-failed';
  return {
    status: 'error',
    format: 'csv',
    datasets: [{ ...DATASET }],
    diagnostics: [...diagnostics, { code, severity: 'error' }],
  };
}
