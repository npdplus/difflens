import type {
  NormalizedDataset,
  NormalizedDatasetWarning,
  NormalizedRecord,
  NormalizedSourceLocation,
  NormalizedValue,
} from '@difflens/comparison-core';

import type { AdapterDiagnostic, DatasetDescriptor } from './contracts';

export const MAX_NESTING_DEPTH = 64;

export class AdapterShapeError extends Error {
  readonly code: 'unsupported-shape' | 'resource-limit';

  constructor(code: 'unsupported-shape' | 'resource-limit') {
    super(code);
    this.name = 'AdapterShapeError';
    this.code = code;
  }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeValue(value: unknown, depth = 0): NormalizedValue {
  if (depth > MAX_NESTING_DEPTH) {
    throw new AdapterShapeError('resource-limit');
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AdapterShapeError('unsupported-shape');
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, depth + 1));
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([field, child]) => [field, normalizeValue(child, depth + 1)]),
    );
  }

  throw new AdapterShapeError('unsupported-shape');
}

export function normalizeRecordCollection(options: {
  readonly datasetId: string;
  readonly datasetName: string;
  readonly records: readonly unknown[];
  readonly sourceForRecord: (index: number) => NormalizedSourceLocation;
  readonly warnings?: readonly AdapterDiagnostic[];
  readonly predefinedFields?: readonly string[];
}): NormalizedDataset {
  const fields = [...(options.predefinedFields ?? [])];
  const fieldSet = new Set(fields);
  const records: NormalizedRecord[] = [];

  options.records.forEach((rawRecord, index) => {
    if (!isPlainRecord(rawRecord)) {
      throw new AdapterShapeError('unsupported-shape');
    }

    const entries: Array<[string, NormalizedValue]> = [];
    for (const [field, rawValue] of Object.entries(rawRecord)) {
      if (rawValue === undefined) {
        continue;
      }
      if (!fieldSet.has(field)) {
        fieldSet.add(field);
        fields.push(field);
      }
      entries.push([field, normalizeValue(rawValue)]);
    }

    records.push({
      id: `${options.datasetId}:record:${index}`,
      values: Object.fromEntries(entries),
      source: options.sourceForRecord(index),
    });
  });

  const warnings = (options.warnings ?? [])
    .filter((diagnostic) => diagnostic.severity === 'warning')
    .map(toDatasetWarning);

  return {
    id: options.datasetId,
    name: options.datasetName,
    fields,
    records,
    warnings,
  };
}

export function emptyDatasetWarning(dataset?: string): AdapterDiagnostic {
  return {
    code: 'empty-dataset',
    severity: 'warning',
    source: dataset === undefined ? undefined : { dataset },
  };
}

export function toDatasetWarning(diagnostic: AdapterDiagnostic): NormalizedDatasetWarning {
  return {
    code: diagnostic.code,
    source: diagnostic.source,
    context: diagnostic.context,
  };
}

export interface StructuredCollection {
  readonly descriptor: DatasetDescriptor;
  readonly records: readonly unknown[];
}

export function discoverStructuredCollections(root: unknown): readonly StructuredCollection[] {
  if (Array.isArray(root)) {
    if (!isRecordList(root)) {
      return [];
    }
    return [
      {
        descriptor: { id: 'root', name: 'Root', recordCount: root.length },
        records: root,
      },
    ];
  }

  if (!isPlainRecord(root)) {
    return [];
  }

  const collections: StructuredCollection[] = [];
  for (const [name, value] of Object.entries(root)) {
    if (Array.isArray(value) && isRecordList(value)) {
      collections.push({
        descriptor: {
          id: `collection:${collections.length}`,
          name,
          recordCount: value.length,
        },
        records: value,
      });
    }
  }

  return collections;
}

function isRecordList(value: readonly unknown[]): boolean {
  return value.length === 0 || value.every(isPlainRecord);
}
