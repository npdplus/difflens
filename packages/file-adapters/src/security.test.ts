import { describe, expect, it } from 'vitest';

import { csvAdapter, jsonAdapter } from './index';

const textInput = (name: string, text: string) => ({ kind: 'text' as const, name, text });

describe('untrusted input guardrails', () => {
  it('returns a controlled resource-limit diagnostic for excessive JSON nesting', () => {
    const nested = `${'['.repeat(70)}{"id":"A"}${']'.repeat(70)}`;
    const result = jsonAdapter.adapt(textInput('deep.json', nested));
    expect(result.status).toBe('error');
    expect(result.diagnostics.map((item) => item.code)).toContain('resource-limit');
  });

  it('preserves HTML/script-like JSON values as inert strings', () => {
    const payload = '<script>alert("not executed")</script>';
    const result = jsonAdapter.adapt(
      textInput('inert.json', JSON.stringify([{ id: 'A', payload }])),
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records[0]?.values.payload).toBe(payload);
    }
  });

  it('preserves formula-like CSV input as plain source data', () => {
    const result = csvAdapter.adapt(textInput('formula.csv', 'id,value\nA,=1+1\n'));
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.dataset.records[0]?.values.value).toBe('=1+1');
    }
  });
});
