# DiffLens

DiffLens is a local-first browser tool for comparing two structured datasets and seeing exactly what changed.

V0.1 supports CSV, XLSX, JSON, and YAML files. Files are parsed and compared in the browser; the core comparison workflow does not require an account or backend upload.

## What V0.1 does

- Load a Before and After file with picker or drag/drop.
- Select a worksheet or dataset when a file exposes more than one.
- Choose one explicit matching key; DiffLens never silently chooses record identity.
- Optionally ignore fields that should not contribute to Changed classification.
- Classify matchable records as Added, Removed, Changed, or Unchanged.
- Show field-level differences for Changed records.
- Search and filter comparison results without changing comparison semantics.
- Export a deterministic CSV report locally.
- Try synthetic CSV, XLSX, JSON, and YAML examples through the same product pipeline.
- Switch between light and dark themes.

## Comparison semantics

V0.1 intentionally uses strict, deterministic semantics. Type, case, whitespace, missing values, `null`, empty strings, booleans, numeric strings, and numbers remain distinguishable. Object property order does not create a difference; array order does.

Records whose selected key is missing, `null`, or an empty string are not silently matched. Duplicate-key diagnostics are surfaced before comparison.

See [Comparison semantics](docs/COMPARISON_SEMANTICS.md) for the public contract.

## Local-first privacy and safety

Source files, normalized datasets, comparison results, and exported report data stay in the browser for the core V0.1 workflow. DiffLens does not require a comparison backend.

Imported values are rendered as inert text. XLSX formulas/macros are not executed, external workbook links are not followed automatically, and CSV export neutralizes spreadsheet formula-like cells beginning with `=`, `+`, `-`, or `@`, including when preceded by whitespace.

See [SECURITY.md](SECURITY.md) for the supported security model.

## Run locally

Requirements:

- Node.js 24
- pnpm 11.17.x

```bash
pnpm install --frozen-lockfile
pnpm dev
```

For the full quality suite:

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Examples

Synthetic example pairs live in [`examples/`](examples/). They contain no customer data and are safe to use for product exploration and tests.

## Tested range

Release verification on hosted Windows Server 2025 runners successfully exercised stable Chrome and Edge with approximately **100,000 CSV records / 6 fields**, **10,000 CSV records / 20 fields**, and **10,000-record JSON, YAML, and XLSX** cases. Every benchmark case also verified its expected Added, Removed, Changed, and Unchanged counts.

See [V0.1 benchmark results](docs/release/V0.1_BENCHMARK_RESULTS.md) for browser versions, environment details, source sizes, and measured timings. This is evidence-based guidance rather than a theoretical maximum; larger files may work but remain browser- and format-dependent.

## V0.1 limitations

- One matching key field at a time; composite keys are not supported.
- No account, team workspace, backend comparison service, cloud source storage, or scheduled comparison.
- No direct database, Dataverse, or ETL/migration execution.
- No AI/LLM matching or explanations.
- Browser memory and file-format overhead affect practical dataset size; larger files are not guaranteed merely because a smaller tested tier succeeds.
- The published automated Chrome/Edge release evidence was gathered on hosted Windows Server 2025 runners, not a physical end-user Windows desktop.
- The production build currently reports a non-blocking Vite large-chunk warning; it is not hidden or threshold-suppressed.

## Documentation

Start with [docs/README.md](docs/README.md). Architecture, comparison semantics, release notes, and benchmark evidence are maintained there for public users and contributors.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

DiffLens is released under the [MIT License](LICENSE). Third-party production dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
