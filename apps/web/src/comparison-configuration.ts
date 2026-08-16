import type { ComparisonDiagnostic, NormalizedDataset } from '@difflens/comparison-core';

const IDENTIFIER_SUFFIXES = ['id', 'key', 'code', 'guid', 'uuid', 'number'] as const;

function compareFieldNames(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function identifierScore(field: string): number {
  const normalized = field.toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '');

  if (IDENTIFIER_SUFFIXES.includes(normalized as (typeof IDENTIFIER_SUFFIXES)[number])) {
    return 3;
  }

  if (IDENTIFIER_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return 2;
  }

  if (normalized.includes('identifier')) {
    return 1;
  }

  return 0;
}

export function commonFields(
  before: NormalizedDataset,
  after: NormalizedDataset,
): readonly string[] {
  const afterFields = new Set(after.fields);
  return before.fields.filter((field) => afterFields.has(field)).sort(compareFieldNames);
}

export function relevantFields(
  before: NormalizedDataset,
  after: NormalizedDataset,
): readonly string[] {
  return [...new Set([...before.fields, ...after.fields])].sort(compareFieldNames);
}

export function suggestKeyFields(
  before: NormalizedDataset,
  after: NormalizedDataset,
): readonly string[] {
  return commonFields(before, after)
    .map((field) => ({ field, score: identifierScore(field) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || compareFieldNames(left.field, right.field))
    .slice(0, 3)
    .map(({ field }) => field);
}

function sideLabel(side: ComparisonDiagnostic['side']): string {
  if (side === 'before') return 'Before';
  if (side === 'after') return 'After';
  return 'Comparison';
}

function countLabel(count: number | undefined): string {
  return count === undefined ? 'One or more records are' : `${count.toLocaleString('en-US')} records are`;
}

export function comparisonDiagnosticMessage(diagnostic: ComparisonDiagnostic): string {
  const side = sideLabel(diagnostic.side);
  const field = diagnostic.field === undefined ? 'the selected key' : `“${diagnostic.field}”`;

  switch (diagnostic.code) {
    case 'key-not-selected':
      return 'Choose a matching key before running the comparison.';
    case 'key-field-missing':
      return `${side} does not expose ${field}. Choose a field that exists in both datasets.`;
    case 'invalid-key-configuration':
      return 'The selected key cannot also be ignored. Choose a different ignored-field configuration.';
    case 'duplicate-key':
      return `${countLabel(diagnostic.count)} affected by duplicate values for ${field} on the ${side} side. Authoritative comparison is blocked until you choose another key or resolve the duplicates.`;
    case 'missing-key-value':
      return `${countLabel(diagnostic.count)} missing, null, or empty for ${field} on the ${side} side. Those records remain unmatchable while other valid unique records may still be compared.`;
  }
}
