import { read, utils, type CellObject, type WorkBook, type WorkSheet } from 'xlsx';

import { AdapterShapeError, emptyDatasetWarning, normalizeRecordCollection } from './common';
import type {
  AdapterDiagnostic,
  AdapterInput,
  AdapterResult,
  DatasetDescriptor,
  FileAdapter,
} from './contracts';

export const xlsxAdapter: FileAdapter = {
  format: 'xlsx',
  discover(input) {
    const workbook = parseWorkbook(input);
    if (workbook.status === 'error') {
      return { format: 'xlsx', datasets: [], diagnostics: workbook.diagnostics };
    }
    return {
      format: 'xlsx',
      datasets: workbookDescriptors(workbook.workbook),
      diagnostics: [],
    };
  },
  adapt(input, datasetId) {
    const workbook = parseWorkbook(input);
    if (workbook.status === 'error') {
      return { status: 'error', format: 'xlsx', datasets: [], diagnostics: workbook.diagnostics };
    }

    const descriptors = workbookDescriptors(workbook.workbook);
    if (descriptors.length === 0) {
      return {
        status: 'error',
        format: 'xlsx',
        datasets: [],
        diagnostics: [{ code: 'no-record-collection', severity: 'error' }],
      };
    }

    let selected =
      datasetId === undefined ? undefined : descriptors.find((item) => item.id === datasetId);
    if (datasetId === undefined && descriptors.length === 1) {
      selected = descriptors[0];
    }
    if (datasetId === undefined && descriptors.length > 1) {
      return {
        status: 'selection-required',
        format: 'xlsx',
        datasets: descriptors,
        diagnostics: [
          {
            code: 'multiple-record-collections',
            severity: 'warning',
            context: { count: descriptors.length },
          },
        ],
      };
    }
    if (selected === undefined) {
      return {
        status: 'error',
        format: 'xlsx',
        datasets: descriptors,
        diagnostics: [{ code: 'unsupported-shape', severity: 'error' }],
      };
    }

    const sheetIndex = Number(selected.id.slice('sheet:'.length));
    const sheetName = workbook.workbook.SheetNames[sheetIndex];
    const worksheet = sheetName === undefined ? undefined : workbook.workbook.Sheets[sheetName];
    if (sheetName === undefined || worksheet === undefined) {
      return {
        status: 'error',
        format: 'xlsx',
        datasets: descriptors,
        diagnostics: [{ code: 'unsupported-shape', severity: 'error' }],
      };
    }

    return adaptWorksheet(worksheet, selected, sheetIndex, descriptors);
  },
};

type ParsedWorkbook =
  | { readonly status: 'ok'; readonly workbook: WorkBook }
  | { readonly status: 'error'; readonly diagnostics: readonly AdapterDiagnostic[] };

function parseWorkbook(input: AdapterInput): ParsedWorkbook {
  if (input.kind !== 'binary' || !/\.xlsx$/iu.test(input.name)) {
    return { status: 'error', diagnostics: [{ code: 'unsupported-format', severity: 'error' }] };
  }
  if (
    input.bytes.length < 4 ||
    input.bytes[0] !== 0x50 ||
    input.bytes[1] !== 0x4b ||
    input.bytes[2] !== 0x03 ||
    input.bytes[3] !== 0x04
  ) {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }

  try {
    return {
      status: 'ok',
      workbook: read(input.bytes, {
        type: 'array',
        bookDeps: false,
        bookVBA: false,
        cellDates: false,
        cellFormula: true,
        cellHTML: false,
        dense: false,
        sheetStubs: true,
        WTF: false,
      }),
    };
  } catch {
    return { status: 'error', diagnostics: [{ code: 'parse-failed', severity: 'error' }] };
  }
}

function workbookDescriptors(workbook: WorkBook): readonly DatasetDescriptor[] {
  return workbook.SheetNames.map((name, index) => ({ id: `sheet:${index}`, name }));
}

function adaptWorksheet(
  worksheet: WorkSheet,
  selected: DatasetDescriptor,
  sheetIndex: number,
  descriptors: readonly DatasetDescriptor[],
): AdapterResult {
  const matrix = utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    blankrows: true,
  });

  const headerIndex = matrix.findIndex((row) =>
    row.some((value) => value !== undefined && value !== null && value !== ''),
  );
  if (headerIndex < 0) {
    const warning = emptyDatasetWarning(selected.name);
    return {
      status: 'success',
      format: 'xlsx',
      dataset: {
        id: `xlsx:sheet:${sheetIndex}`,
        name: selected.name,
        fields: [],
        records: [],
        warnings: [{ code: warning.code, source: warning.source }],
      },
      datasets: descriptors,
      diagnostics: [warning],
    };
  }

  const rawHeaders = matrix[headerIndex] ?? [];
  const headers: string[] = [];
  for (const rawHeader of rawHeaders) {
    if (rawHeader === undefined || rawHeader === null || rawHeader === '') {
      return shapeError(descriptors, 'unsupported-shape');
    }
    if (typeof rawHeader === 'object') {
      return shapeError(descriptors, 'unsupported-shape');
    }
    headers.push(String(rawHeader));
  }
  if (headers.length === 0) {
    return shapeError(descriptors, 'unsupported-shape');
  }
  if (new Set(headers).size !== headers.length) {
    return shapeError(descriptors, 'duplicate-fields');
  }

  const rows: unknown[] = [];
  const rowNumbers: number[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    if (row.every((value) => value === undefined || value === null || value === '')) {
      continue;
    }
    if (row.length > headers.length) {
      return shapeError(descriptors, 'unsupported-shape');
    }
    rows.push(
      Object.fromEntries(
        headers.flatMap((header, columnIndex) =>
          columnIndex < row.length && row[columnIndex] !== undefined
            ? [[header, row[columnIndex]] as const]
            : [],
        ),
      ),
    );
    rowNumbers.push(rowIndex + 1);
  }

  const diagnostics = inspectWorksheetCells(worksheet, selected.name);
  if (rows.length === 0) {
    diagnostics.push(emptyDatasetWarning(selected.name));
  }

  try {
    const dataset = normalizeRecordCollection({
      datasetId: `xlsx:sheet:${sheetIndex}`,
      datasetName: selected.name,
      records: rows,
      predefinedFields: headers,
      warnings: diagnostics,
      sourceForRecord: (index) => ({
        dataset: selected.name,
        rowNumber: rowNumbers[index],
        recordIndex: index,
      }),
    });
    return {
      status: 'success',
      format: 'xlsx',
      dataset,
      datasets: descriptors,
      diagnostics,
    };
  } catch (error) {
    const code = error instanceof AdapterShapeError ? error.code : 'parse-failed';
    return shapeError(descriptors, code);
  }
}

function inspectWorksheetCells(worksheet: WorkSheet, dataset: string): AdapterDiagnostic[] {
  const diagnostics: AdapterDiagnostic[] = [];
  for (const address of Object.keys(worksheet)) {
    if (address.startsWith('!')) {
      continue;
    }
    const cell = worksheet[address] as CellObject | undefined;
    if (cell === undefined) {
      continue;
    }
    const rowNumber = utils.decode_cell(address).r + 1;
    if (cell.f !== undefined) {
      diagnostics.push({
        code: 'formula-cell',
        severity: 'warning',
        source: { dataset, rowNumber },
      });
    }
    if (cell.l?.Target !== undefined) {
      diagnostics.push({
        code: 'external-link',
        severity: 'warning',
        source: { dataset, rowNumber },
      });
    }
  }
  return diagnostics;
}

function shapeError(
  datasets: readonly DatasetDescriptor[],
  code: 'duplicate-fields' | 'parse-failed' | 'resource-limit' | 'unsupported-shape',
): AdapterResult {
  return { status: 'error', format: 'xlsx', datasets, diagnostics: [{ code, severity: 'error' }] };
}
