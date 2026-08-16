# Changelog

All notable public changes to DiffLens are documented here.

The format follows Keep a Changelog principles and the project uses semantic versioning for public releases.

## [0.1.0] - Unreleased

### Added

- Local browser comparison for CSV, XLSX, JSON, and YAML.
- Explicit single-field key selection and validation.
- Deterministic Added, Removed, Changed, and Unchanged classification.
- Field-level differences and Before/After inspection.
- Ignored-field configuration.
- Worker-based comparison execution with stale-job protection.
- Result filtering, displayed-key search, and scalable result-list rendering.
- Deterministic local CSV report export with spreadsheet formula-injection mitigation.
- Synthetic examples that run through the real file-adapter and comparison pipeline.
- Light/dark theme preference with only `difflens-theme` persisted locally.
- Release verification for stable Chrome and Edge, dependency audit/license review, local-first network checks, controlled benchmarks, and public-safe screenshots.

### Security

- Imported source values remain inert in the UI.
- Spreadsheet formulas/macros are not executed and external workbook links are not followed automatically.
- CSV export neutralizes formula-like values beginning with `=`, `+`, `-`, or `@`, including leading-whitespace cases.

### Known limitations

- Composite keys are not supported in V0.1.
- No backend comparison, cloud storage, accounts, collaboration, direct database connectors, migration execution, scheduling, or AI matching.
- Practical file size depends on browser memory and format overhead.
- The production build reports a non-blocking Vite large-chunk warning.
