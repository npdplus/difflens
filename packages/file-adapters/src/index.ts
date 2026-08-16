import { csvAdapter } from './csv';
import { detectFileFormat } from './detect';
import { jsonAdapter } from './json';
import type {
  AdapterInput,
  AdapterOptions,
  AdapterResult,
  FileAdapter,
  SupportedFileFormat,
} from './contracts';
import { xlsxAdapter } from './xlsx';
import { yamlAdapter } from './yaml';

export const FILE_ADAPTERS_PACKAGE_NAME = '@difflens/file-adapters';

const ADAPTERS: Readonly<Record<SupportedFileFormat, FileAdapter>> = {
  csv: csvAdapter,
  json: jsonAdapter,
  xlsx: xlsxAdapter,
  yaml: yamlAdapter,
};

export function adaptFile(input: AdapterInput, options: AdapterOptions = {}): AdapterResult {
  const format = options.format ?? detectFileFormat(input);
  if (format === undefined) {
    return {
      status: 'error',
      datasets: [],
      diagnostics: [{ code: 'unsupported-format', severity: 'error' }],
    };
  }
  return ADAPTERS[format].adapt(input, options.datasetId);
}

export function discoverFile(input: AdapterInput, format?: SupportedFileFormat) {
  const detected = format ?? detectFileFormat(input);
  if (detected === undefined) {
    return undefined;
  }
  return ADAPTERS[detected].discover(input);
}

export { csvAdapter } from './csv';
export { detectFileFormat } from './detect';
export { jsonAdapter } from './json';
export { xlsxAdapter } from './xlsx';
export { yamlAdapter } from './yaml';
export type {
  AdapterDiagnostic,
  AdapterDiagnosticCode,
  AdapterDiagnosticSeverity,
  AdapterDiscoveryResult,
  AdapterInput,
  AdapterOptions,
  AdapterResult,
  BinaryAdapterInput,
  DatasetDescriptor,
  FileAdapter,
  SupportedFileFormat,
  TextAdapterInput,
} from './contracts';
