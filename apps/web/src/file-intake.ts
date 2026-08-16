import { adaptFile } from '@difflens/file-adapters';
import type {
  AdapterDiagnostic,
  AdapterResult,
  DatasetDescriptor,
  SupportedFileFormat,
} from '@difflens/file-adapters';
import type { NormalizedDataset } from '@difflens/comparison-core';

export interface LocalFileMetadata {
  readonly name: string;
  readonly size: number;
  readonly mimeType?: string;
  readonly lastModified: number;
}

interface ActiveFileState {
  readonly file: File;
  readonly metadata: LocalFileMetadata;
}

export type FileIntakeState =
  | { readonly status: 'empty' }
  | (ActiveFileState & { readonly status: 'reading' })
  | (ActiveFileState & {
      readonly status: 'ready';
      readonly format: SupportedFileFormat;
      readonly dataset: NormalizedDataset;
      readonly datasets: readonly DatasetDescriptor[];
      readonly diagnostics: readonly AdapterDiagnostic[];
    })
  | (ActiveFileState & {
      readonly status: 'selection-required';
      readonly format: SupportedFileFormat;
      readonly datasets: readonly DatasetDescriptor[];
      readonly diagnostics: readonly AdapterDiagnostic[];
    })
  | (ActiveFileState & {
      readonly status: 'unsupported';
      readonly diagnostics: readonly AdapterDiagnostic[];
    })
  | (ActiveFileState & {
      readonly status: 'error';
      readonly format?: SupportedFileFormat;
      readonly datasets: readonly DatasetDescriptor[];
      readonly diagnostics: readonly AdapterDiagnostic[];
    });

export interface LoadFileOptions {
  readonly format?: SupportedFileFormat;
  readonly datasetId?: string;
}

export function createEmptyFileState(): FileIntakeState {
  return { status: 'empty' };
}

export function createReadingFileState(file: File): FileIntakeState {
  return {
    status: 'reading',
    file,
    metadata: getLocalFileMetadata(file),
  };
}

export async function loadLocalFile(
  file: File,
  options: LoadFileOptions = {},
): Promise<FileIntakeState> {
  const metadata = getLocalFileMetadata(file);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const shouldUseBinaryInput =
      options.format === 'xlsx' ||
      file.name.toLocaleLowerCase('en-US').endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      isZipContainer(bytes);

    const result = shouldUseBinaryInput
      ? adaptFile(
          {
            kind: 'binary',
            name: file.name,
            bytes,
            mimeType: file.type || undefined,
          },
          options,
        )
      : adaptFile(
          {
            kind: 'text',
            name: file.name,
            text: new TextDecoder('utf-8').decode(bytes),
            mimeType: file.type || undefined,
          },
          options,
        );

    return toFinishedFileState(file, metadata, result);
  } catch {
    return {
      status: 'error',
      file,
      metadata,
      datasets: [],
      diagnostics: [{ code: 'invalid-file', severity: 'error' }],
    };
  }
}

export function toFinishedFileState(
  file: File,
  metadata: LocalFileMetadata,
  result: AdapterResult,
): FileIntakeState {
  if (result.status === 'success') {
    return {
      status: 'ready',
      file,
      metadata,
      format: result.format,
      dataset: result.dataset,
      datasets: result.datasets,
      diagnostics: result.diagnostics,
    };
  }

  if (result.status === 'selection-required') {
    return {
      status: 'selection-required',
      file,
      metadata,
      format: result.format,
      datasets: result.datasets,
      diagnostics: result.diagnostics,
    };
  }

  if (result.diagnostics.some((diagnostic) => diagnostic.code === 'unsupported-format')) {
    return {
      status: 'unsupported',
      file,
      metadata,
      diagnostics: result.diagnostics,
    };
  }

  return {
    status: 'error',
    file,
    metadata,
    format: result.format,
    datasets: result.datasets,
    diagnostics: result.diagnostics,
  };
}

export function getLocalFileMetadata(file: File): LocalFileMetadata {
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
    lastModified: file.lastModified,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export function formatName(format: SupportedFileFormat): string {
  return format === 'xlsx' ? 'XLSX' : format.toUpperCase();
}

export function diagnosticMessage(diagnostic: AdapterDiagnostic): string {
  const safeCount =
    typeof diagnostic.context?.count === 'number' ? ` (${diagnostic.context.count})` : '';

  switch (diagnostic.code) {
    case 'unsupported-format':
      return 'This file type is not recognized. Choose CSV, XLSX, JSON, or YAML, or retry with an explicit format.';
    case 'invalid-file':
      return 'The file could not be read as a valid supported file.';
    case 'parse-failed':
      return 'DiffLens could not parse this file. Check the file and try again.';
    case 'duplicate-fields':
      return 'Duplicate field names are not supported because they would make the dataset ambiguous.';
    case 'no-record-collection':
      return 'No supported record collection was found in this file.';
    case 'multiple-record-collections':
      return `Choose the dataset or worksheet you want to use${safeCount}.`;
    case 'empty-dataset':
      return 'This dataset contains no records. Its available fields are preserved when the format provides them.';
    case 'unsupported-shape':
      return 'The file is valid, but its data shape is not supported by DiffLens V0.1.';
    case 'resource-limit':
      return 'This input exceeded a parser safety guardrail and was stopped.';
    case 'formula-cell':
      return `Formula cells were treated as stored workbook values; formulas were not executed${safeCount}.`;
    case 'external-link':
      return `Workbook links were detected but were not followed${safeCount}.`;
    case 'parser-warning':
      return `The parser reported a non-blocking warning${safeCount}.`;
  }
}

export function isConfigurationReady(state: FileIntakeState): boolean {
  return state.status === 'ready' && state.dataset.fields.length > 0;
}

function isZipContainer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}
