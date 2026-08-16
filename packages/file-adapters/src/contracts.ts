import type { NormalizedDataset, NormalizedSourceLocation } from '@difflens/comparison-core';

export type SupportedFileFormat = 'csv' | 'xlsx' | 'json' | 'yaml';
export type AdapterDiagnosticSeverity = 'error' | 'warning';

export type AdapterDiagnosticCode =
  | 'unsupported-format'
  | 'invalid-file'
  | 'parse-failed'
  | 'duplicate-fields'
  | 'no-record-collection'
  | 'multiple-record-collections'
  | 'empty-dataset'
  | 'unsupported-shape'
  | 'resource-limit'
  | 'formula-cell'
  | 'external-link'
  | 'parser-warning';

export interface AdapterDiagnostic {
  readonly code: AdapterDiagnosticCode;
  readonly severity: AdapterDiagnosticSeverity;
  readonly source?: NormalizedSourceLocation;
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export interface DatasetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly recordCount?: number;
}

export interface TextAdapterInput {
  readonly kind: 'text';
  readonly name: string;
  readonly text: string;
  readonly mimeType?: string;
}

export interface BinaryAdapterInput {
  readonly kind: 'binary';
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly mimeType?: string;
}

export type AdapterInput = TextAdapterInput | BinaryAdapterInput;

export interface AdapterOptions {
  readonly format?: SupportedFileFormat;
  readonly datasetId?: string;
}

export interface AdapterDiscoveryResult {
  readonly format: SupportedFileFormat;
  readonly datasets: readonly DatasetDescriptor[];
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export type AdapterResult =
  | {
      readonly status: 'success';
      readonly format: SupportedFileFormat;
      readonly dataset: NormalizedDataset;
      readonly datasets: readonly DatasetDescriptor[];
      readonly diagnostics: readonly AdapterDiagnostic[];
    }
  | {
      readonly status: 'selection-required';
      readonly format: SupportedFileFormat;
      readonly datasets: readonly DatasetDescriptor[];
      readonly diagnostics: readonly AdapterDiagnostic[];
    }
  | {
      readonly status: 'error';
      readonly format?: SupportedFileFormat;
      readonly datasets: readonly DatasetDescriptor[];
      readonly diagnostics: readonly AdapterDiagnostic[];
    };

export interface FileAdapter {
  readonly format: SupportedFileFormat;
  discover(input: AdapterInput): AdapterDiscoveryResult;
  adapt(input: AdapterInput, datasetId?: string): AdapterResult;
}
