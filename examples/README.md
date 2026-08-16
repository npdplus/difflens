# DiffLens V0.1 Synthetic Examples

All files in this directory are intentionally synthetic and public-safe. They contain no customer exports, credentials, tokens, production identifiers, or private business records.

## Customer changes — CSV

Files:

- `customers-before.csv`
- `customers-after.csv`

Matching key: `CustomerId`

Default expected summary:

- Before: 5
- After: 5
- Added: 1 (`C005`)
- Removed: 1 (`C004`)
- Changed: 3 (`C002`, `C003`, `C006`)
- Unchanged: 1 (`C001`)

Known differences include `C002.CreditLimit`, `C003.Status`, and `ModifiedOn`. Ignoring `ModifiedOn` produces Added 1, Removed 1, Changed 2, Unchanged 2. `C005.CustomerName` intentionally begins with `=` so the CSV export path demonstrates spreadsheet-formula neutralization.

## Product Catalog — XLSX

Files:

- `product-catalog-before.xlsx`
- `product-catalog-after.xlsx`

Matching key: `ProductId`

Expected summary:

- Before: 4
- After: 4
- Added: 1 (`P005`)
- Removed: 1 (`P004`)
- Changed: 2 (`P001`, `P002`)
- Unchanged: 1 (`P003`)

Known differences: `P001.Price` changes from `49.9` to `54.9`; `P002.Active` changes from `true` to `false`. This pair exercises the real XLSX adapter with numeric and boolean values.

## Migration verification — JSON

Files:

- `migration-before.json`
- `migration-after.json`

Matching key: `RecordId`

Default expected summary:

- Before: 4
- After: 4
- Added: 1 (`R005`)
- Removed: 1 (`R004`)
- Changed: 3 (`R001`, `R002`, `R003`)
- Unchanged: 0

Ignoring `MigrationBatchId` and `ModifiedOn` isolates the business change at `R002.BusinessValue2` and produces Added 1, Removed 1, Changed 1, Unchanged 2.

## Configuration drift — YAML

Files:

- `configuration-before.yaml`
- `configuration-after.yaml`

Matching key: `ConfigKey`

Expected summary:

- Before: 3
- After: 3
- Added: 1 (`feature-flag`)
- Removed: 1 (`legacy-mode`)
- Changed: 1 (`api-timeout`)
- Unchanged: 1 (`retry-count`)

Known difference: `api-timeout.Value` changes from `30` to `45`. Nested `Labels` values exercise structured normalized data without line-based diff semantics.

## Usage

The in-app launcher exposes the CSV, JSON, and YAML examples and routes them through the same browser-local adapter, key validation, worker comparison, results, and export pipeline as user-selected files. The XLSX Product Catalog pair is available in this directory for normal local file intake and is covered by the browser E2E path.
