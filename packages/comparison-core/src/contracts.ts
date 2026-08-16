export type NormalizedPrimitive = null | string | number | boolean;

export interface NormalizedObject {
  readonly [field: string]: NormalizedValue;
}

export type NormalizedValue =
  | NormalizedPrimitive
  | readonly NormalizedValue[]
  | NormalizedObject;

export interface NormalizedSourceLocation {
  readonly dataset?: string;
  readonly rowNumber?: number;
  readonly recordIndex?: number;
}

export interface NormalizedDatasetWarning {
  readonly code: string;
  readonly source?: NormalizedSourceLocation;
  readonly context?: Readonly<Record<string, string | number | boolean>>;
}

export interface NormalizedRecord {
  readonly id: string;
  readonly values: Readonly<Record<string, NormalizedValue>>;
  readonly source?: NormalizedSourceLocation;
}

export interface NormalizedDataset {
  readonly id: string;
  readonly name?: string;
  readonly fields: readonly string[];
  readonly records: readonly NormalizedRecord[];
  readonly warnings?: readonly NormalizedDatasetWarning[];
}

export interface KeyConfiguration {
  readonly field: string;
}

export interface ComparisonOptions {
  readonly key: KeyConfiguration;
  readonly ignoredFields?: readonly string[];
}

export type ComparisonDiagnosticCode =
  | 'key-not-selected'
  | 'key-field-missing'
  | 'duplicate-key'
  | 'missing-key-value'
  | 'invalid-key-configuration';

export type ComparisonDiagnosticSeverity = 'error' | 'warning';
export type ComparisonSide = 'before' | 'after' | 'comparison';

export interface DiagnosticRecordReference {
  readonly recordId: string;
  readonly source?: NormalizedSourceLocation;
}

export interface ComparisonDiagnosticExample {
  readonly key?: NormalizedValue;
  readonly records: readonly DiagnosticRecordReference[];
}

export interface ComparisonDiagnostic {
  readonly code: ComparisonDiagnosticCode;
  readonly severity: ComparisonDiagnosticSeverity;
  readonly side: ComparisonSide;
  readonly field?: string;
  readonly count?: number;
  readonly examples?: readonly ComparisonDiagnosticExample[];
}

export type UnmatchableReason = 'missing-key-value';

export interface UnmatchableRecord {
  readonly reason: UnmatchableReason;
  readonly record: NormalizedRecord;
}

export interface SourceWarnings {
  readonly before: readonly NormalizedDatasetWarning[];
  readonly after: readonly NormalizedDatasetWarning[];
}

export interface ComparisonValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly ComparisonDiagnostic[];
  readonly sourceWarnings: SourceWarnings;
  readonly unmatchable: {
    readonly before: readonly UnmatchableRecord[];
    readonly after: readonly UnmatchableRecord[];
  };
}

export type FieldDifferenceKind = 'changed' | 'added-field' | 'removed-field';

export type ValuePresence =
  | { readonly present: false }
  | { readonly present: true; readonly value: NormalizedValue };

export interface FieldDifference {
  readonly field: string;
  readonly kind: FieldDifferenceKind;
  readonly before: ValuePresence;
  readonly after: ValuePresence;
}

export interface AddedRecordResult {
  readonly key: NormalizedValue;
  readonly record: NormalizedRecord;
}

export interface RemovedRecordResult {
  readonly key: NormalizedValue;
  readonly record: NormalizedRecord;
}

export interface ChangedRecordResult {
  readonly key: NormalizedValue;
  readonly before: NormalizedRecord;
  readonly after: NormalizedRecord;
  readonly differences: readonly FieldDifference[];
}

export interface UnchangedRecordResult {
  readonly key: NormalizedValue;
  readonly before: NormalizedRecord;
  readonly after: NormalizedRecord;
}

export interface ComparisonSummary {
  readonly beforeRecords: number;
  readonly afterRecords: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly unchanged: number;
  readonly unmatchableBefore: number;
  readonly unmatchableAfter: number;
}

export interface ComparisonConfiguration {
  readonly keyField: string;
  readonly ignoredFields: readonly string[];
}

export interface ComparisonResult {
  readonly configuration: ComparisonConfiguration;
  readonly summary: ComparisonSummary;
  readonly diagnostics: readonly ComparisonDiagnostic[];
  readonly sourceWarnings: SourceWarnings;
  readonly added: readonly AddedRecordResult[];
  readonly removed: readonly RemovedRecordResult[];
  readonly changed: readonly ChangedRecordResult[];
  readonly unchanged: readonly UnchangedRecordResult[];
  readonly unmatchable: {
    readonly before: readonly UnmatchableRecord[];
    readonly after: readonly UnmatchableRecord[];
  };
}

export type ComparisonOutcome =
  | { readonly status: 'success'; readonly result: ComparisonResult }
  | {
      readonly status: 'invalid';
      readonly diagnostics: readonly ComparisonDiagnostic[];
      readonly sourceWarnings: SourceWarnings;
      readonly unmatchable: {
        readonly before: readonly UnmatchableRecord[];
        readonly after: readonly UnmatchableRecord[];
      };
    };
