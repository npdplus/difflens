# Security Policy

## Supported versions

Security fixes are accepted for the current V0.1 release line while it is supported.

## V0.1 security model

DiffLens is local-first for its core comparison workflow:

- Source files are read with browser-local file APIs.
- Normalized datasets and comparison results are kept in browser memory.
- Comparison runs in a browser worker.
- CSV reports are generated and downloaded locally.
- The core V0.1 workflow does not require an account or comparison backend.

Imported values are treated as untrusted data. The UI renders them as inert text rather than executable HTML. XLSX formulas and macros are not executed, and external workbook links are not followed automatically.

CSV export neutralizes spreadsheet formula-like cells whose first non-whitespace character is `=`, `+`, `-`, or `@` by prefixing the complete original cell text with a single quote before CSV escaping.

## What to report

Please report vulnerabilities involving source/result data transmission, unsafe imported-content rendering or execution, unsafe report export, dependency compromise, secret exposure, or another material security/privacy issue.

Do not include real customer data or secrets in a report. Use synthetic reproduction data whenever possible.

## Private reporting

The public repository is intended to use GitHub private vulnerability reporting. If that option is not available in the repository Security tab, do not post sensitive vulnerability details in a public issue; the repository owner must enable a private reporting route before public launch.

## Non-security bugs

Use the normal issue tracker for non-sensitive correctness or UX bugs.
