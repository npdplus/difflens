# Architecture

DiffLens V0.1 is a local-first browser application organized as a pnpm workspace.

## Runtime flow

1. The web app receives a user-selected local file through the browser File API.
2. `@difflens/file-adapters` detects/parses CSV, XLSX, JSON, or YAML and normalizes the selected dataset.
3. The user explicitly chooses one common field as the matching key and optionally selects ignored fields.
4. Key validation and comparison execute in a Web Worker using `@difflens/comparison-core`.
5. The web app renders the authoritative comparison result, including summary counts, diagnostics, result navigation, and field differences.
6. CSV export is generated directly from that result in the browser and downloaded through a Blob/object URL.

There is no comparison backend in V0.1.

## Package responsibilities

### `packages/comparison-core`

Owns the normalized comparison contracts, key validation, strict equality semantics, classification, field-level differences, ignored fields, deterministic ordering, unmatchable records, and source-warning pass-through.

### `packages/file-adapters`

Owns format detection, CSV/XLSX/JSON/YAML parsing, dataset discovery, normalization, source metadata, parser diagnostics, and untrusted-file handling.

### `apps/web`

Owns local file intake, dataset selection, comparison configuration, worker lifecycle, result presentation, local CSV export, examples, theme preference, and browser UX/accessibility behavior.

## Local-first boundary

Source contents, normalized datasets, comparison results, and report rows are not sent to a DiffLens comparison service. Production release verification exercises all four supported formats and checks representative comparison/export flows for unexpected network requests.

## Performance boundary

Parsing happens in the browser and comparison runs in a worker to keep the main UI responsive. Practical capacity depends on browser memory, record width, source format, and change rate. Tested release evidence is recorded separately rather than encoded as a theoretical maximum.
