import type {
  ComparisonDiagnostic,
  ComparisonOptions,
  ComparisonOutcome,
  ComparisonResult,
  ComparisonValidation,
  FieldDifference,
  NormalizedDataset,
  NormalizedRecord,
  ValuePresence,
} from './contracts';
import {
  buildKeyIndex,
  type KeyIndexAnalysis,
  validateKeyConfiguration,
} from './key-index';
import { normalizedValuesEqual, sortText } from './value';

interface InputAnalysis {
  readonly diagnostics: readonly ComparisonDiagnostic[];
  readonly before: KeyIndexAnalysis;
  readonly after: KeyIndexAnalysis;
}

const EMPTY_INDEX_ANALYSIS: KeyIndexAnalysis = {
  index: new Map(),
  diagnostics: [],
  unmatchable: [],
};

const analyzeInput = (
  before: NormalizedDataset,
  after: NormalizedDataset,
  options: ComparisonOptions,
): InputAnalysis => {
  const configurationDiagnostics = validateKeyConfiguration(before, after, options);
  if (configurationDiagnostics.some(({ severity }) => severity === 'error')) {
    return {
      diagnostics: configurationDiagnostics,
      before: EMPTY_INDEX_ANALYSIS,
      after: EMPTY_INDEX_ANALYSIS,
    };
  }

  const beforeAnalysis = buildKeyIndex(before, 'before', options.key.field);
  const afterAnalysis = buildKeyIndex(after, 'after', options.key.field);

  return {
    diagnostics: [
      ...configurationDiagnostics,
      ...beforeAnalysis.diagnostics,
      ...afterAnalysis.diagnostics,
    ],
    before: beforeAnalysis,
    after: afterAnalysis,
  };
};

const presence = (record: NormalizedRecord, field: string): ValuePresence => {
  if (!Object.prototype.hasOwnProperty.call(record.values, field)) {
    return { present: false };
  }

  const value = record.values[field];
  if (value === undefined) {
    return { present: false };
  }

  return { present: true, value };
};

const compareRecords = (
  before: NormalizedRecord,
  after: NormalizedRecord,
  keyField: string,
  ignoredFields: ReadonlySet<string>,
): FieldDifference[] => {
  const fields = new Set<string>([
    ...Object.keys(before.values),
    ...Object.keys(after.values),
  ]);
  fields.delete(keyField);
  for (const ignoredField of ignoredFields) {
    fields.delete(ignoredField);
  }

  const differences: FieldDifference[] = [];

  for (const field of sortText(fields)) {
    const beforeValue = presence(before, field);
    const afterValue = presence(after, field);

    if (!beforeValue.present) {
      if (afterValue.present) {
        differences.push({
          field,
          kind: 'added-field',
          before: beforeValue,
          after: afterValue,
        });
      }
      continue;
    }

    if (!afterValue.present) {
      differences.push({
        field,
        kind: 'removed-field',
        before: beforeValue,
        after: afterValue,
      });
      continue;
    }

    if (!normalizedValuesEqual(beforeValue.value, afterValue.value)) {
      differences.push({
        field,
        kind: 'changed',
        before: beforeValue,
        after: afterValue,
      });
    }
  }

  return differences;
};

const normalizedIgnoredFields = (options: ComparisonOptions): string[] => {
  const uniqueFields = new Set(options.ignoredFields ?? []);
  uniqueFields.delete(options.key.field);
  return sortText(uniqueFields);
};

export const validateComparisonInput = (
  before: NormalizedDataset,
  after: NormalizedDataset,
  options: ComparisonOptions,
): ComparisonValidation => {
  const analysis = analyzeInput(before, after, options);
  return {
    valid: !analysis.diagnostics.some(({ severity }) => severity === 'error'),
    diagnostics: analysis.diagnostics,
    sourceWarnings: {
      before: before.warnings ?? [],
      after: after.warnings ?? [],
    },
    unmatchable: {
      before: analysis.before.unmatchable,
      after: analysis.after.unmatchable,
    },
  };
};

export const compareDatasets = (
  before: NormalizedDataset,
  after: NormalizedDataset,
  options: ComparisonOptions,
): ComparisonOutcome => {
  const analysis = analyzeInput(before, after, options);

  if (analysis.diagnostics.some(({ severity }) => severity === 'error')) {
    return {
      status: 'invalid',
      diagnostics: analysis.diagnostics,
      sourceWarnings: {
        before: before.warnings ?? [],
        after: after.warnings ?? [],
      },
      unmatchable: {
        before: analysis.before.unmatchable,
        after: analysis.after.unmatchable,
      },
    };
  }

  const ignoredFields = new Set(normalizedIgnoredFields(options));
  const fingerprints = sortText(
    new Set([...analysis.before.index.keys(), ...analysis.after.index.keys()]),
  );

  const added: ComparisonResult['added'][number][] = [];
  const removed: ComparisonResult['removed'][number][] = [];
  const changed: ComparisonResult['changed'][number][] = [];
  const unchanged: ComparisonResult['unchanged'][number][] = [];

  for (const fingerprint of fingerprints) {
    const beforeEntry = analysis.before.index.get(fingerprint);
    const afterEntry = analysis.after.index.get(fingerprint);

    if (beforeEntry === undefined && afterEntry !== undefined) {
      added.push({ key: afterEntry.key, record: afterEntry.record });
      continue;
    }

    if (beforeEntry !== undefined && afterEntry === undefined) {
      removed.push({ key: beforeEntry.key, record: beforeEntry.record });
      continue;
    }

    if (beforeEntry === undefined || afterEntry === undefined) {
      continue;
    }

    const differences = compareRecords(
      beforeEntry.record,
      afterEntry.record,
      options.key.field,
      ignoredFields,
    );

    if (differences.length === 0) {
      unchanged.push({
        key: beforeEntry.key,
        before: beforeEntry.record,
        after: afterEntry.record,
      });
    } else {
      changed.push({
        key: beforeEntry.key,
        before: beforeEntry.record,
        after: afterEntry.record,
        differences,
      });
    }
  }

  const result: ComparisonResult = {
    configuration: {
      keyField: options.key.field,
      ignoredFields: [...ignoredFields],
    },
    summary: {
      beforeRecords: before.records.length,
      afterRecords: after.records.length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
      unmatchableBefore: analysis.before.unmatchable.length,
      unmatchableAfter: analysis.after.unmatchable.length,
    },
    diagnostics: analysis.diagnostics,
    sourceWarnings: {
      before: before.warnings ?? [],
      after: after.warnings ?? [],
    },
    added,
    removed,
    changed,
    unchanged,
    unmatchable: {
      before: analysis.before.unmatchable,
      after: analysis.after.unmatchable,
    },
  };

  return { status: 'success', result };
};
