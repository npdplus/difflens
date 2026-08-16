import type {
  ComparisonDiagnostic,
  ComparisonDiagnosticExample,
  ComparisonOptions,
  ComparisonSide,
  NormalizedDataset,
  NormalizedRecord,
  NormalizedValue,
  UnmatchableRecord,
} from './contracts';
import { normalizedValueFingerprint } from './value';

const MAX_DIAGNOSTIC_EXAMPLES = 5;
const hasOwn = (record: NormalizedRecord, field: string): boolean =>
  Object.prototype.hasOwnProperty.call(record.values, field);

const isMissingKeyValue = (
  value: NormalizedValue | undefined,
): value is null | '' | undefined => value === undefined || value === null || value === '';

const recordReference = (record: NormalizedRecord) => ({
  recordId: record.id,
  ...(record.source === undefined ? {} : { source: record.source }),
});

export interface KeyIndexEntry {
  readonly fingerprint: string;
  readonly key: NormalizedValue;
  readonly record: NormalizedRecord;
}

export interface KeyIndexAnalysis {
  readonly index: ReadonlyMap<string, KeyIndexEntry>;
  readonly diagnostics: readonly ComparisonDiagnostic[];
  readonly unmatchable: readonly UnmatchableRecord[];
}

const duplicateExamples = (
  groups: ReadonlyMap<string, readonly KeyIndexEntry[]>,
): ComparisonDiagnosticExample[] => {
  const examples: ComparisonDiagnosticExample[] = [];

  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    const first = entries[0];
    if (first === undefined) continue;

    examples.push({
      key: first.key,
      records: entries.map(({ record }) => recordReference(record)),
    });

    if (examples.length >= MAX_DIAGNOSTIC_EXAMPLES) break;
  }

  return examples;
};

export const buildKeyIndex = (
  dataset: NormalizedDataset,
  side: Exclude<ComparisonSide, 'comparison'>,
  keyField: string,
): KeyIndexAnalysis => {
  const groups = new Map<string, KeyIndexEntry[]>();
  const unmatchable: UnmatchableRecord[] = [];

  for (const record of dataset.records) {
    const value = hasOwn(record, keyField) ? record.values[keyField] : undefined;

    if (isMissingKeyValue(value)) {
      unmatchable.push({ reason: 'missing-key-value', record });
      continue;
    }

    const fingerprint = normalizedValueFingerprint(value);
    const entry: KeyIndexEntry = { fingerprint, key: value, record };
    const existing = groups.get(fingerprint);
    if (existing === undefined) {
      groups.set(fingerprint, [entry]);
    } else {
      existing.push(entry);
    }
  }

  const diagnostics: ComparisonDiagnostic[] = [];

  if (unmatchable.length > 0) {
    diagnostics.push({
      code: 'missing-key-value',
      severity: 'warning',
      side,
      field: keyField,
      count: unmatchable.length,
      examples: unmatchable.slice(0, MAX_DIAGNOSTIC_EXAMPLES).map(({ record }) => ({
        records: [recordReference(record)],
      })),
    });
  }

  let duplicateAffectedRecords = 0;
  for (const entries of groups.values()) {
    if (entries.length > 1) {
      duplicateAffectedRecords += entries.length;
    }
  }

  if (duplicateAffectedRecords > 0) {
    diagnostics.push({
      code: 'duplicate-key',
      severity: 'error',
      side,
      field: keyField,
      count: duplicateAffectedRecords,
      examples: duplicateExamples(groups),
    });
  }

  const index = new Map<string, KeyIndexEntry>();
  for (const [fingerprint, entries] of groups) {
    if (entries.length !== 1) continue;
    const entry = entries[0];
    if (entry !== undefined) {
      index.set(fingerprint, entry);
    }
  }

  return { index, diagnostics, unmatchable };
};

export const validateKeyConfiguration = (
  before: NormalizedDataset,
  after: NormalizedDataset,
  options: ComparisonOptions,
): ComparisonDiagnostic[] => {
  const diagnostics: ComparisonDiagnostic[] = [];
  const keyField = options.key.field;

  if (keyField === '') {
    diagnostics.push({
      code: 'key-not-selected',
      severity: 'error',
      side: 'comparison',
    });
    return diagnostics;
  }

  if (options.ignoredFields?.includes(keyField) === true) {
    diagnostics.push({
      code: 'invalid-key-configuration',
      severity: 'error',
      side: 'comparison',
      field: keyField,
    });
  }

  if (!before.fields.includes(keyField)) {
    diagnostics.push({
      code: 'key-field-missing',
      severity: 'error',
      side: 'before',
      field: keyField,
    });
  }

  if (!after.fields.includes(keyField)) {
    diagnostics.push({
      code: 'key-field-missing',
      severity: 'error',
      side: 'after',
      field: keyField,
    });
  }

  return diagnostics;
};
