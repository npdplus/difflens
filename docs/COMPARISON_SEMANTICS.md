# Comparison Semantics

DiffLens V0.1 compares records using one explicitly selected key field.

## Key rules

- The key must be a field available on both normalized datasets.
- DiffLens does not silently choose the key.
- Duplicate keys are invalid for deterministic matching.
- Records whose selected key is missing, `null`, or an empty string are unmatchable rather than silently paired.
- Matching is type-sensitive and case-sensitive.

## Record classification

For matchable keys:

- **Added** — present only in After.
- **Removed** — present only in Before.
- **Changed** — present on both sides and at least one non-ignored field differs.
- **Unchanged** — present on both sides and all non-ignored fields are equal.

## Strict equality defaults

V0.1 intentionally preserves meaningful distinctions:

- missing field ≠ `null`
- `null` ≠ empty string
- empty string ≠ whitespace-only string
- number `1` ≠ string `"1"`
- case differences are changes
- whitespace differences are changes
- boolean values retain boolean type
- date-like strings are compared as their normalized values rather than silently reinterpreted
- object property order does not create a difference
- array order remains significant

Ignored fields do not contribute to Changed classification. The selected key cannot be ignored.

## Determinism

Given the same normalized inputs and configuration, DiffLens produces stable classifications, field differences, and ordering. Row order and object field order do not change the logical result.

## Export

The CSV report is generated from the authoritative comparison result. Its columns are:

`RecordKey,ChangeType,Field,BeforeValue,AfterValue`

Changed records produce one row per authoritative field difference. Added and Removed records produce deterministic per-field rows. Missing values, `null`, and empty strings remain distinguishable in the report.
