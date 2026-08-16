import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('DiffLens P07 web shell', () => {
  it('preserves the local comparison flow and exposes examples, theme, accessibility, and local export messaging', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('DiffLens');
    expect(markup).toContain('Before file');
    expect(markup).toContain('After file');
    expect(markup).toContain('Choose Before file');
    expect(markup).toContain('Choose After file');
    expect(markup).toContain('CSV');
    expect(markup).toContain('XLSX');
    expect(markup).toContain('JSON');
    expect(markup).toContain('YAML');
    expect(markup).toContain(
      'Your comparison files are processed locally in your browser for the core DiffLens workflow.',
    );
    expect(markup).toContain('The comparison result and CSV report are also produced locally');
    expect(markup).toContain('Try a synthetic example');
    expect(markup).toContain('Customer changes');
    expect(markup).toContain('Migration verification');
    expect(markup).toContain('Configuration drift');
    expect(markup).toContain('New comparison');
    expect(markup).toContain('Comparison settings come next');
    expect(markup).not.toContain('Added records');
    expect(markup).not.toContain('Changed records');
  });
});
