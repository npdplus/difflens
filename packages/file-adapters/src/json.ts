import { MAX_NESTING_DEPTH } from './common';
import { adaptStructuredValue, discoverStructuredValue } from './structured';
import type { AdapterDiagnostic, AdapterInput, FileAdapter } from './contracts';

export const jsonAdapter: FileAdapter = {
  format: 'json',
  discover(input) {
    const parsed = parseJson(input);
    if (parsed.status === 'error') {
      return { format: 'json', datasets: [], diagnostics: parsed.diagnostics };
    }
    return discoverStructuredValue('json', parsed.value);
  },
  adapt(input, datasetId) {
    const parsed = parseJson(input);
    if (parsed.status === 'error') {
      return { status: 'error', format: 'json', datasets: [], diagnostics: parsed.diagnostics };
    }
    return adaptStructuredValue({ format: 'json', value: parsed.value, datasetId });
  },
};

type ParsedJson =
  | { readonly status: 'ok'; readonly value: unknown }
  | { readonly status: 'error'; readonly diagnostics: readonly AdapterDiagnostic[] };

class JsonResourceLimitError extends Error {
  constructor() {
    super('json resource limit');
    this.name = 'JsonResourceLimitError';
  }
}

function parseJson(input: AdapterInput): ParsedJson {
  if (input.kind !== 'text') {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }

  const text = stripBom(input.text);
  if (text.trim().length === 0) {
    return { status: 'error', diagnostics: [{ code: 'invalid-file', severity: 'error' }] };
  }

  try {
    if (hasDuplicateJsonObjectKeys(text)) {
      return { status: 'error', diagnostics: [{ code: 'duplicate-fields', severity: 'error' }] };
    }
    return { status: 'ok', value: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      status: 'error',
      diagnostics: [
        {
          code: error instanceof JsonResourceLimitError ? 'resource-limit' : 'parse-failed',
          severity: 'error',
        },
      ],
    };
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function hasDuplicateJsonObjectKeys(source: string): boolean {
  let index = 0;
  let duplicate = false;

  const assertDepth = (depth: number): void => {
    if (depth > MAX_NESTING_DEPTH) {
      throw new JsonResourceLimitError();
    }
  };

  const skipWhitespace = () => {
    while (/\s/u.test(source[index] ?? '')) {
      index += 1;
    }
  };

  const parseString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const char = source[index];
      if (char === '\\') {
        index += 2;
        continue;
      }
      index += 1;
      if (char === '"') {
        return JSON.parse(source.slice(start, index)) as string;
      }
    }
    throw new SyntaxError('unterminated string');
  };

  const parseValue = (depth: number): void => {
    assertDepth(depth);
    skipWhitespace();
    const char = source[index];
    if (char === '{') {
      parseObject(depth + 1);
      return;
    }
    if (char === '[') {
      parseArray(depth + 1);
      return;
    }
    if (char === '"') {
      parseString();
      return;
    }
    while (index < source.length && !/[\s,\]}]/u.test(source[index] ?? '')) {
      index += 1;
    }
  };

  const parseObject = (depth: number): void => {
    assertDepth(depth);
    index += 1;
    const keys = new Set<string>();
    skipWhitespace();
    if (source[index] === '}') {
      index += 1;
      return;
    }
    while (index < source.length) {
      skipWhitespace();
      if (source[index] !== '"') {
        throw new SyntaxError('object key expected');
      }
      const key = parseString();
      if (keys.has(key)) {
        duplicate = true;
      }
      keys.add(key);
      skipWhitespace();
      if (source[index] !== ':') {
        throw new SyntaxError('colon expected');
      }
      index += 1;
      parseValue(depth);
      skipWhitespace();
      if (source[index] === '}') {
        index += 1;
        return;
      }
      if (source[index] !== ',') {
        throw new SyntaxError('comma expected');
      }
      index += 1;
    }
    throw new SyntaxError('unterminated object');
  };

  const parseArray = (depth: number): void => {
    assertDepth(depth);
    index += 1;
    skipWhitespace();
    if (source[index] === ']') {
      index += 1;
      return;
    }
    while (index < source.length) {
      parseValue(depth);
      skipWhitespace();
      if (source[index] === ']') {
        index += 1;
        return;
      }
      if (source[index] !== ',') {
        throw new SyntaxError('comma expected');
      }
      index += 1;
    }
    throw new SyntaxError('unterminated array');
  };

  parseValue(0);
  return duplicate;
}
