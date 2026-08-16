export type ExampleId = 'customers' | 'migration' | 'configuration';

export interface ExampleExpectedSummary {
  readonly beforeRecords: number;
  readonly afterRecords: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly unchanged: number;
}

export interface DiffLensExample {
  readonly id: ExampleId;
  readonly title: string;
  readonly formatLabel: string;
  readonly description: string;
  readonly keyField: string;
  readonly suggestedIgnoredFields: readonly string[];
  readonly before: {
    readonly name: string;
    readonly mimeType: string;
    readonly content: string;
  };
  readonly after: {
    readonly name: string;
    readonly mimeType: string;
    readonly content: string;
  };
  readonly expected: ExampleExpectedSummary;
  readonly expectedWithSuggestedIgnoredFields?: ExampleExpectedSummary;
}

const CUSTOMER_BEFORE = `CustomerId,CustomerName,Status,CreditLimit,Segment,ModifiedOn
C001,Northwind Demo,Active,50000,Enterprise,2026-08-01
C002,Blue River Demo,Active,25000,SMB,2026-08-01
C003,Cedar Labs Demo,Paused,40000,Mid-market,2026-08-01
C004,Delta Works Demo,Active,15000,SMB,2026-08-01
C006,Foxtrot Retail Demo,Active,30000,SMB,2026-08-01
`;

const CUSTOMER_AFTER = `CustomerId,CustomerName,Status,CreditLimit,Segment,ModifiedOn
C001,Northwind Demo,Active,50000,Enterprise,2026-08-01
C002,Blue River Demo,Active,30000,SMB,2026-08-16
C003,Cedar Labs Demo,Active,40000,Mid-market,2026-08-16
C005,=Formula-looking customer,Active,20000,SMB,2026-08-16
C006,Foxtrot Retail Demo,Active,30000,SMB,2026-08-16
`;

const MIGRATION_BEFORE = JSON.stringify(
  [
    {
      RecordId: 'R001',
      BusinessValue1: 'Alpha',
      BusinessValue2: 10,
      Status: 'Ready',
      MigrationBatchId: 'BATCH-A',
      ModifiedOn: '2026-08-01T08:00:00Z',
    },
    {
      RecordId: 'R002',
      BusinessValue1: 'Beta',
      BusinessValue2: 20,
      Status: 'Ready',
      MigrationBatchId: 'BATCH-A',
      ModifiedOn: '2026-08-01T08:00:00Z',
    },
    {
      RecordId: 'R003',
      BusinessValue1: 'Gamma',
      BusinessValue2: 30,
      Status: 'Hold',
      MigrationBatchId: 'BATCH-A',
      ModifiedOn: '2026-08-01T08:00:00Z',
    },
    {
      RecordId: 'R004',
      BusinessValue1: 'Removed',
      BusinessValue2: 40,
      Status: 'Ready',
      MigrationBatchId: 'BATCH-A',
      ModifiedOn: '2026-08-01T08:00:00Z',
    },
  ],
  null,
  2,
);

const MIGRATION_AFTER = JSON.stringify(
  [
    {
      RecordId: 'R001',
      BusinessValue1: 'Alpha',
      BusinessValue2: 10,
      Status: 'Ready',
      MigrationBatchId: 'BATCH-B',
      ModifiedOn: '2026-08-16T08:00:00Z',
    },
    {
      RecordId: 'R002',
      BusinessValue1: 'Beta',
      BusinessValue2: 25,
      Status: 'Ready',
      MigrationBatchId: 'BATCH-B',
      ModifiedOn: '2026-08-16T08:00:00Z',
    },
    {
      RecordId: 'R003',
      BusinessValue1: 'Gamma',
      BusinessValue2: 30,
      Status: 'Hold',
      MigrationBatchId: 'BATCH-B',
      ModifiedOn: '2026-08-16T08:00:00Z',
    },
    {
      RecordId: 'R005',
      BusinessValue1: 'Added',
      BusinessValue2: 50,
      Status: 'Ready',
      MigrationBatchId: 'BATCH-B',
      ModifiedOn: '2026-08-16T08:00:00Z',
    },
  ],
  null,
  2,
);

const CONFIG_BEFORE = `- ConfigKey: api-timeout
  Enabled: true
  Value: 30
  Labels:
    environment: demo
- ConfigKey: retry-count
  Enabled: true
  Value: 3
  Labels:
    environment: demo
- ConfigKey: legacy-mode
  Enabled: false
  Value: off
  Labels:
    environment: demo
`;

const CONFIG_AFTER = `- ConfigKey: api-timeout
  Enabled: true
  Value: 45
  Labels:
    environment: demo
- ConfigKey: retry-count
  Enabled: true
  Value: 3
  Labels:
    environment: demo
- ConfigKey: feature-flag
  Enabled: true
  Value: on
  Labels:
    environment: demo
`;

export const DIFFLENS_EXAMPLES: readonly DiffLensExample[] = [
  {
    id: 'customers',
    title: 'Customer changes',
    formatLabel: 'CSV',
    description: 'A compact Before/After customer list with Added, Removed, Changed, and Unchanged records.',
    keyField: 'CustomerId',
    suggestedIgnoredFields: ['ModifiedOn'],
    before: {
      name: 'difflens-customers-before.csv',
      mimeType: 'text/csv',
      content: CUSTOMER_BEFORE,
    },
    after: {
      name: 'difflens-customers-after.csv',
      mimeType: 'text/csv',
      content: CUSTOMER_AFTER,
    },
    expected: {
      beforeRecords: 5,
      afterRecords: 5,
      added: 1,
      removed: 1,
      changed: 3,
      unchanged: 1,
    },
    expectedWithSuggestedIgnoredFields: {
      beforeRecords: 5,
      afterRecords: 5,
      added: 1,
      removed: 1,
      changed: 2,
      unchanged: 2,
    },
  },
  {
    id: 'migration',
    title: 'Migration verification',
    formatLabel: 'JSON',
    description: 'Synthetic migration-style records with audit fields that can be ignored to isolate business changes.',
    keyField: 'RecordId',
    suggestedIgnoredFields: ['MigrationBatchId', 'ModifiedOn'],
    before: {
      name: 'difflens-migration-before.json',
      mimeType: 'application/json',
      content: MIGRATION_BEFORE,
    },
    after: {
      name: 'difflens-migration-after.json',
      mimeType: 'application/json',
      content: MIGRATION_AFTER,
    },
    expected: {
      beforeRecords: 4,
      afterRecords: 4,
      added: 1,
      removed: 1,
      changed: 3,
      unchanged: 0,
    },
    expectedWithSuggestedIgnoredFields: {
      beforeRecords: 4,
      afterRecords: 4,
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 2,
    },
  },
  {
    id: 'configuration',
    title: 'Configuration drift',
    formatLabel: 'YAML',
    description: 'Configuration-style records with a structured nested value and deterministic key-based comparison.',
    keyField: 'ConfigKey',
    suggestedIgnoredFields: [],
    before: {
      name: 'difflens-configuration-before.yaml',
      mimeType: 'application/yaml',
      content: CONFIG_BEFORE,
    },
    after: {
      name: 'difflens-configuration-after.yaml',
      mimeType: 'application/yaml',
      content: CONFIG_AFTER,
    },
    expected: {
      beforeRecords: 3,
      afterRecords: 3,
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 1,
    },
  },
];

export function createExampleFiles(example: DiffLensExample): {
  readonly before: File;
  readonly after: File;
} {
  return {
    before: new File([example.before.content], example.before.name, {
      type: example.before.mimeType,
      lastModified: 0,
    }),
    after: new File([example.after.content], example.after.name, {
      type: example.after.mimeType,
      lastModified: 0,
    }),
  };
}
