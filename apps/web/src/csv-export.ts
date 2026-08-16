import type {
  ComparisonResult,
  NormalizedObject,
  NormalizedRecord,
  NormalizedValue,
  ValuePresence,
} from '@difflens/comparison-core';

export const CSV_EXPORT_FILENAME = 'difflens-comparison-report.csv';
export const CSV_EXPORT_HEADERS = [
  'RecordKey',
  'ChangeType',
  'Field',
  'BeforeValue',
  'AfterValue',
] as const;

const MISSING_VALUE = '[missing]';
const RECORD_PRESENT = '[record present]';

interface CsvRow {
  readonly recordKey: string;
  readonly changeType: string;
  readonly field: string;
  readonly beforeValue: string;
  readonly afterValue: string;
}

export interface CsvDownloadEnvironment {
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
  readonly triggerDownload: (url: string, filename: string) => void;
}

export function buildComparisonCsv(result: ComparisonResult): string {
  const rows = comparisonCsvRows(result);
  const body = [
    CSV_EXPORT_HEADERS.map(escapeCsvCell).join(','),
    ...rows.map((row) =>
      [row.recordKey, row.changeType, row.field, row.beforeValue, row.afterValue]
        .map(escapeCsvCell)
        .join(','),
    ),
  ].join('\r\n');

  return `\uFEFF${body}\r\n`;
}

export function createComparisonCsvBlob(result: ComparisonResult): Blob {
  return new Blob([buildComparisonCsv(result)], { type: 'text/csv;charset=utf-8' });
}

export function downloadComparisonCsv(
  result: ComparisonResult,
  environment: CsvDownloadEnvironment = browserCsvDownloadEnvironment(),
): void {
  const blob = createComparisonCsvBlob(result);
  const url = environment.createObjectUrl(blob);

  try {
    environment.triggerDownload(url, CSV_EXPORT_FILENAME);
  } finally {
    environment.revokeObjectUrl(url);
  }
}

export function neutralizeSpreadsheetFormula(value: string): string {
  return /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: string): string {
  const safeValue = neutralizeSpreadsheetFormula(value);
  if (!/[",\r\n]/u.test(safeValue)) {
    return safeValue;
  }

  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function serializeNormalizedValue(value: NormalizedValue): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value === '' ? '""' : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return stableJson(value);
}

function comparisonCsvRows(result: ComparisonResult): readonly CsvRow[] {
  const rows: CsvRow[] = [];

  for (const changed of result.changed) {
    for (const difference of changed.differences) {
      rows.push({
        recordKey: serializeNormalizedValue(changed.key),
        changeType:
          difference.kind === 'added-field'
            ? 'Changed (Added field)'
            : difference.kind === 'removed-field'
              ? 'Changed (Removed field)'
              : 'Changed',
        field: difference.field,
        beforeValue: serializePresence(difference.before),
        afterValue: serializePresence(difference.after),
      });
    }
  }

  for (const added of result.added) {
    rows.push(...recordRows('Added', added.key, added.record, result.configuration.keyField));
  }

  for (const removed of result.removed) {
    rows.push(...recordRows('Removed', removed.key, removed.record, result.configuration.keyField));
  }

  return rows;
}

function recordRows(
  changeType: 'Added' | 'Removed',
  key: NormalizedValue,
  record: NormalizedRecord,
  keyField: string,
): readonly CsvRow[] {
  const recordKey = serializeNormalizedValue(key);
  const fields = Object.entries(record.values)
    .filter(([field]) => field !== keyField)
    .sort(([left], [right]) => compareStrings(left, right));

  if (fields.length === 0) {
    return [
      {
        recordKey,
        changeType,
        field: '',
        beforeValue: changeType === 'Added' ? MISSING_VALUE : RECORD_PRESENT,
        afterValue: changeType === 'Added' ? RECORD_PRESENT : MISSING_VALUE,
      },
    ];
  }

  return fields.map(([field, rawValue]) => {
    const value = serializeNormalizedValue(rawValue);
    return {
      recordKey,
      changeType,
      field,
      beforeValue: changeType === 'Added' ? MISSING_VALUE : value,
      afterValue: changeType === 'Added' ? value : MISSING_VALUE,
    };
  });
}

function serializePresence(presence: ValuePresence): string {
  return presence.present ? serializeNormalizedValue(presence.value) : MISSING_VALUE;
}

function stableJson(value: readonly NormalizedValue[] | NormalizedObject): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonValue(item)).join(',')}]`;
  }

  const objectValue = value as NormalizedObject;
  return `{${Object.entries(objectValue)
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonValue(item)}`)
    .join(',')}}`;
}

function stableJsonValue(value: NormalizedValue): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  return stableJson(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function browserCsvDownloadEnvironment(): CsvDownloadEnvironment {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    triggerDownload: (url, filename) => {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}
