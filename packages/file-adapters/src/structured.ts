import {
  AdapterShapeError,
  discoverStructuredCollections,
  emptyDatasetWarning,
  normalizeRecordCollection,
} from './common';
import type {
  AdapterDiagnostic,
  AdapterResult,
  DatasetDescriptor,
  SupportedFileFormat,
} from './contracts';

export function adaptStructuredValue(options: {
  readonly format: 'json' | 'yaml';
  readonly value: unknown;
  readonly datasetId?: string;
  readonly parserDiagnostics?: readonly AdapterDiagnostic[];
}): AdapterResult {
  const collections = discoverStructuredCollections(options.value);
  const descriptors = collections.map((collection) => collection.descriptor);
  const parserDiagnostics = [...(options.parserDiagnostics ?? [])];

  if (collections.length === 0) {
    return {
      status: 'error',
      format: options.format,
      datasets: [],
      diagnostics: [...parserDiagnostics, { code: 'no-record-collection', severity: 'error' }],
    };
  }

  const selected = selectCollection(collections, options.datasetId);
  if (selected === 'missing-selection') {
    return selectionRequired(options.format, descriptors, parserDiagnostics);
  }
  if (selected === undefined) {
    return {
      status: 'error',
      format: options.format,
      datasets: descriptors,
      diagnostics: [...parserDiagnostics, { code: 'unsupported-shape', severity: 'error' }],
    };
  }

  const diagnostics = [...parserDiagnostics];
  if (selected.records.length === 0) {
    diagnostics.push(emptyDatasetWarning(selected.descriptor.name));
  }

  try {
    const dataset = normalizeRecordCollection({
      datasetId: `${options.format}:${selected.descriptor.id}`,
      datasetName: selected.descriptor.name,
      records: selected.records,
      warnings: diagnostics,
      sourceForRecord: (index) => ({
        dataset: selected.descriptor.name,
        recordIndex: index,
      }),
    });
    return {
      status: 'success',
      format: options.format,
      dataset,
      datasets: descriptors,
      diagnostics,
    };
  } catch (error) {
    const code = error instanceof AdapterShapeError ? error.code : 'parse-failed';
    return {
      status: 'error',
      format: options.format,
      datasets: descriptors,
      diagnostics: [...diagnostics, { code, severity: 'error' }],
    };
  }
}

export function discoverStructuredValue(
  format: 'json' | 'yaml',
  value: unknown,
  parserDiagnostics: readonly AdapterDiagnostic[] = [],
): {
  readonly format: 'json' | 'yaml';
  readonly datasets: readonly DatasetDescriptor[];
  readonly diagnostics: readonly AdapterDiagnostic[];
} {
  const collections = discoverStructuredCollections(value);
  return {
    format,
    datasets: collections.map((collection) => collection.descriptor),
    diagnostics:
      collections.length === 0
        ? [...parserDiagnostics, { code: 'no-record-collection', severity: 'error' }]
        : parserDiagnostics,
  };
}

function selectCollection(
  collections: ReturnType<typeof discoverStructuredCollections>,
  datasetId?: string,
): (typeof collections)[number] | 'missing-selection' | undefined {
  if (datasetId !== undefined) {
    return collections.find((collection) => collection.descriptor.id === datasetId);
  }
  if (collections.length === 1) {
    return collections[0];
  }
  return 'missing-selection';
}

function selectionRequired(
  format: SupportedFileFormat,
  datasets: readonly DatasetDescriptor[],
  diagnostics: readonly AdapterDiagnostic[],
): AdapterResult {
  return {
    status: 'selection-required',
    format,
    datasets,
    diagnostics: [
      ...diagnostics,
      {
        code: 'multiple-record-collections',
        severity: 'warning',
        context: { count: datasets.length },
      },
    ],
  };
}
