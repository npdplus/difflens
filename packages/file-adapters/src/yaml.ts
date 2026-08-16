import { parseDocument } from 'yaml';

import { adaptStructuredValue, discoverStructuredValue } from './structured';
import type { AdapterDiagnostic, AdapterInput, FileAdapter } from './contracts';

export const yamlAdapter: FileAdapter = {
  format: 'yaml',
  discover(input) {
    const parsed = parseYaml(input);
    if (parsed.status === 'error') {
      return { format: 'yaml', datasets: [], diagnostics: parsed.diagnostics };
    }
    return discoverStructuredValue('yaml', parsed.value, parsed.diagnostics);
  },
  adapt(input, datasetId) {
    const parsed = parseYaml(input);
    if (parsed.status === 'error') {
      return { status: 'error', format: 'yaml', datasets: [], diagnostics: parsed.diagnostics };
    }
    return adaptStructuredValue({
      format: 'yaml',
      value: parsed.value,
      datasetId,
      parserDiagnostics: parsed.diagnostics,
    });
  },
};

type ParsedYaml =
  | {
      readonly status: 'ok';
      readonly value: unknown;
      readonly diagnostics: readonly AdapterDiagnostic[];
    }
  | { readonly status: 'error'; readonly diagnostics: readonly AdapterDiagnostic[] };

function parseYaml(input: AdapterInput): ParsedYaml {
  if (input.kind !== 'text') {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }
  if (input.text.trim().length === 0) {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }

  try {
    const document = parseDocument(input.text, {
      customTags: [],
      logLevel: 'error',
      merge: false,
      prettyErrors: false,
      resolveKnownTags: false,
      schema: 'core',
      strict: true,
    });
    if (document.errors.length > 0) {
      return { status: 'error', diagnostics: [{ code: 'parse-failed', severity: 'error' }] };
    }

    const diagnostics: AdapterDiagnostic[] = [];
    if (document.warnings.length > 0) {
      diagnostics.push({
        code: 'parser-warning',
        severity: 'warning',
        context: { count: document.warnings.length },
      });
    }

    const value = document.toJS({ maxAliasCount: 0 }) as unknown;
    return { status: 'ok', value, diagnostics };
  } catch (error) {
    const isAliasLimit =
      error instanceof ReferenceError ||
      (error instanceof Error && /alias|anchor|maxAliasCount/iu.test(error.message));
    return {
      status: 'error',
      diagnostics: [{ code: isAliasLimit ? 'resource-limit' : 'parse-failed', severity: 'error' }],
    };
  }
}
