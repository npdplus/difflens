import type { AdapterInput, SupportedFileFormat } from './contracts';

const MIME_FORMATS: Readonly<Record<string, SupportedFileFormat>> = {
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/x-yaml': 'yaml',
  'text/csv': 'csv',
  'text/yaml': 'yaml',
};

export function detectFileFormat(input: AdapterInput): SupportedFileFormat | undefined {
  const lowerName = input.name.toLocaleLowerCase('en-US');
  if (lowerName.endsWith('.csv')) return 'csv';
  if (lowerName.endsWith('.xlsx')) return 'xlsx';
  if (lowerName.endsWith('.json')) return 'json';
  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml')) return 'yaml';

  if (input.mimeType !== undefined && MIME_FORMATS[input.mimeType] !== undefined) {
    return MIME_FORMATS[input.mimeType];
  }

  if (input.kind === 'binary') {
    return input.bytes.length >= 4 && input.bytes[0] === 0x50 && input.bytes[1] === 0x4b
      ? 'xlsx'
      : undefined;
  }

  const trimmed = input.text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return undefined;
    }
  }
  return undefined;
}
