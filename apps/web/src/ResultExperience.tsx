import { useMemo, useRef, useState } from 'react';
import type {
  AddedRecordResult,
  ChangedRecordResult,
  ComparisonResult,
  FieldDifference,
  NormalizedRecord,
  NormalizedValue,
  RemovedRecordResult,
  ValuePresence,
} from '@difflens/comparison-core';

import { comparisonDiagnosticMessage } from './comparison-configuration';
import { downloadComparisonCsv } from './csv-export';
import './p06.css';

export type ResultFilter = 'all' | 'changed' | 'added' | 'removed';

export type ResultListItem =
  | {
      readonly id: string;
      readonly classification: 'changed';
      readonly key: NormalizedValue;
      readonly result: ChangedRecordResult;
    }
  | {
      readonly id: string;
      readonly classification: 'added';
      readonly key: NormalizedValue;
      readonly result: AddedRecordResult;
    }
  | {
      readonly id: string;
      readonly classification: 'removed';
      readonly key: NormalizedValue;
      readonly result: RemovedRecordResult;
    };

const RESULT_ROW_HEIGHT = 84;
const RESULT_VIEWPORT_HEIGHT = 420;
const RESULT_OVERSCAN = 4;

export function createResultItems(result: ComparisonResult): readonly ResultListItem[] {
  return [
    ...result.changed.map<ResultListItem>((record, index) => ({
      id: `changed:${index}`,
      classification: 'changed',
      key: record.key,
      result: record,
    })),
    ...result.added.map<ResultListItem>((record, index) => ({
      id: `added:${index}`,
      classification: 'added',
      key: record.key,
      result: record,
    })),
    ...result.removed.map<ResultListItem>((record, index) => ({
      id: `removed:${index}`,
      classification: 'removed',
      key: record.key,
      result: record,
    })),
  ];
}

export function filterResultItems(
  items: readonly ResultListItem[],
  filter: ResultFilter,
  query: string,
): readonly ResultListItem[] {
  const normalizedQuery = query.toLocaleLowerCase();

  return items.filter((item) => {
    if (filter !== 'all' && item.classification !== filter) {
      return false;
    }

    if (normalizedQuery === '') {
      return true;
    }

    return displayNormalizedValue(item.key).toLocaleLowerCase().includes(normalizedQuery);
  });
}

export function visibleResultRange(
  total: number,
  scrollTop: number,
  viewportHeight = RESULT_VIEWPORT_HEIGHT,
  rowHeight = RESULT_ROW_HEIGHT,
  overscan = RESULT_OVERSCAN,
): { readonly start: number; readonly end: number } {
  if (total <= 0) {
    return { start: 0, end: 0 };
  }

  const safeScrollTop = Math.max(0, scrollTop);
  const start = Math.max(0, Math.floor(safeScrollTop / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((safeScrollTop + viewportHeight) / rowHeight) + overscan);
  return { start, end };
}

export function displayNormalizedValue(value: NormalizedValue): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value === '' ? '"" (empty string)' : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function normalizedValueType(value: NormalizedValue): string {
  if (value === null) {
    return 'Null';
  }

  if (Array.isArray(value)) {
    return 'Array';
  }

  const kind = typeof value;
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function classificationLabel(classification: ResultListItem['classification']): string {
  switch (classification) {
    case 'changed':
      return 'Changed';
    case 'added':
      return 'Added';
    case 'removed':
      return 'Removed';
  }
}

function resetListScroll(list: HTMLDivElement | null) {
  if (list !== null) {
    list.scrollTop = 0;
  }
}

export function ResultExperience({ result }: { readonly result: ComparisonResult }) {
  const items = useMemo(() => createResultItems(result), [result]);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => items[0]?.id ?? null);
  const [scrollTop, setScrollTop] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(
    () => filterResultItems(items, filter, query),
    [filter, items, query],
  );
  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  const visibleRange = visibleResultRange(filteredItems.length, scrollTop);
  const visibleItems = filteredItems.slice(visibleRange.start, visibleRange.end);

  function changeFilter(nextFilter: ResultFilter) {
    setFilter(nextFilter);
    setSelectedId(null);
    setScrollTop(0);
    resetListScroll(listRef.current);
  }

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    setSelectedId(null);
    setScrollTop(0);
    resetListScroll(listRef.current);
  }

  function exportCsv() {
    try {
      downloadComparisonCsv(result);
      setExportStatus('CSV report downloaded locally.');
    } catch {
      setExportStatus('DiffLens could not create the local CSV report.');
    }
  }

  const hasWarnings =
    result.diagnostics.length > 0 ||
    result.sourceWarnings.before.length > 0 ||
    result.sourceWarnings.after.length > 0 ||
    result.summary.unmatchableBefore > 0 ||
    result.summary.unmatchableAfter > 0;

  return (
    <section
      className="results-experience"
      aria-label="Comparison result ready"
      data-testid="comparison-result-ready"
    >
      <header className="results-heading">
        <div>
          <p className="section-kicker">Step 3 · Comparison results</p>
          <h3>See exactly what changed</h3>
          <p>
            These classifications and field differences come directly from the comparison engine.
            Search and filters only change this view.
          </p>
        </div>
        <div className="results-actions">
          <dl className="result-configuration" aria-label="Comparison configuration used">
            <div>
              <dt>Matching key</dt>
              <dd>{result.configuration.keyField}</dd>
            </div>
            <div>
              <dt>Ignored fields</dt>
              <dd>
                {result.configuration.ignoredFields.length === 0
                  ? 'None'
                  : result.configuration.ignoredFields.join(', ')}
              </dd>
            </div>
          </dl>
          <button type="button" className="export-button" onClick={exportCsv}>
            Export CSV report
          </button>
          <p className="export-help">
            Generated from this authoritative result in your browser. Spreadsheet formula-like
            cells are neutralized before download.
          </p>
          <p className="export-status" aria-live="polite">
            {exportStatus}
          </p>
        </div>
      </header>

      <dl className="result-summary" aria-label="Comparison summary">
        <SummaryCard label="Before records" value={result.summary.beforeRecords} />
        <SummaryCard label="After records" value={result.summary.afterRecords} />
        <SummaryCard label="Added" value={result.summary.added} tone="added" />
        <SummaryCard label="Removed" value={result.summary.removed} tone="removed" />
        <SummaryCard label="Changed" value={result.summary.changed} tone="changed" />
        <SummaryCard label="Unchanged" value={result.summary.unchanged} tone="unchanged" />
      </dl>

      {hasWarnings && <ResultNotices result={result} />}

      {items.length === 0 ? (
        <div className="result-empty-state" data-testid="no-change-state">
          <strong>No compared changes found.</strong>
          <span>
            {result.summary.unchanged.toLocaleString('en-US')} matchable record
            {result.summary.unchanged === 1 ? '' : 's'} remained unchanged.
          </span>
        </div>
      ) : (
        <div className="results-workbench">
          <section className="result-list-panel" aria-labelledby="result-list-heading">
            <div className="result-list-heading-row">
              <div>
                <p className="section-kicker">Explore records</p>
                <h4 id="result-list-heading">Result list</h4>
              </div>
              <span className="result-count" aria-live="polite">
                {filteredItems.length.toLocaleString('en-US')} shown
              </span>
            </div>

            <div className="result-filters" role="group" aria-label="Result classification filter">
              <FilterButton
                label="All changes"
                count={result.summary.added + result.summary.removed + result.summary.changed}
                active={filter === 'all'}
                onClick={() => changeFilter('all')}
              />
              <FilterButton
                label="Changed"
                count={result.summary.changed}
                active={filter === 'changed'}
                onClick={() => changeFilter('changed')}
              />
              <FilterButton
                label="Added"
                count={result.summary.added}
                active={filter === 'added'}
                onClick={() => changeFilter('added')}
              />
              <FilterButton
                label="Removed"
                count={result.summary.removed}
                active={filter === 'removed'}
                onClick={() => changeFilter('removed')}
              />
            </div>

            <label className="result-search" htmlFor="result-key-search">
              <span>Search by key · {result.configuration.keyField}</span>
              <input
                id="result-key-search"
                type="search"
                value={query}
                placeholder="Case-insensitive key search"
                onChange={(event) => changeQuery(event.currentTarget.value)}
              />
            </label>
            <p className="result-search-help">
              Search is a case-insensitive substring match against the displayed record key only. It
              does not change comparison semantics.
            </p>

            {filteredItems.length === 0 ? (
              <div className="result-empty-state" data-testid="filtered-empty-state">
                <strong>No result records match this view.</strong>
                <span>Clear the search or choose another classification filter.</span>
              </div>
            ) : (
              <div
                ref={listRef}
                className="result-virtual-list"
                role="list"
                aria-label="Comparison result records"
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              >
                <div
                  className="result-virtual-spacer"
                  style={{ height: `${filteredItems.length * RESULT_ROW_HEIGHT}px` }}
                >
                  {visibleItems.map((item, visibleIndex) => {
                    const absoluteIndex = visibleRange.start + visibleIndex;
                    return (
                      <div
                        className="result-row-slot"
                        role="listitem"
                        key={item.id}
                        style={{ transform: `translateY(${absoluteIndex * RESULT_ROW_HEIGHT}px)` }}
                      >
                        <button
                          type="button"
                          className={`result-row ${selectedItem?.id === item.id ? 'result-row-selected' : ''}`}
                          onClick={() => setSelectedId(item.id)}
                          aria-label={`${classificationLabel(item.classification)} record ${displayNormalizedValue(item.key)}`}
                          aria-current={selectedItem?.id === item.id ? 'true' : undefined}
                        >
                          <span className={`result-status result-status-${item.classification}`}>
                            {classificationLabel(item.classification)}
                          </span>
                          <span className="result-key-block">
                            <strong>{displayNormalizedValue(item.key)}</strong>
                            <small>{normalizedValueType(item.key)} key</small>
                          </span>
                          <span className="result-row-meta">
                            {item.classification === 'changed'
                              ? `${item.result.differences.length.toLocaleString('en-US')} changed field${item.result.differences.length === 1 ? '' : 's'}`
                              : item.classification === 'added'
                                ? 'Exists in After only'
                                : 'Exists in Before only'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <ResultInspector item={selectedItem} keyField={result.configuration.keyField} />
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'neutral' | 'added' | 'removed' | 'changed' | 'unchanged';
}) {
  return (
    <div className={`summary-card summary-card-${tone}`}>
      <dt>{label}</dt>
      <dd>{value.toLocaleString('en-US')}</dd>
    </div>
  );
}

function ResultNotices({ result }: { readonly result: ComparisonResult }) {
  return (
    <aside className="result-notices" aria-label="Result warnings and unmatchable records">
      <div>
        <strong>Review notices</strong>
        <span>Warnings remain visible without exposing raw customer records.</span>
      </div>

      {result.summary.unmatchableBefore > 0 || result.summary.unmatchableAfter > 0 ? (
        <p>
          Unmatchable records · Before {result.summary.unmatchableBefore.toLocaleString('en-US')} ·
          After {result.summary.unmatchableAfter.toLocaleString('en-US')}. Records with absent,
          null, or empty selected keys were not silently matched.
        </p>
      ) : null}

      {result.diagnostics.map((diagnostic, index) => (
        <p key={`${diagnostic.code}-${diagnostic.side}-${index}`}>
          {comparisonDiagnosticMessage(diagnostic)}
        </p>
      ))}

      {result.sourceWarnings.before.length > 0 || result.sourceWarnings.after.length > 0 ? (
        <p>
          Source warnings carried through from parsing · Before{' '}
          {result.sourceWarnings.before.length.toLocaleString('en-US')} · After{' '}
          {result.sourceWarnings.after.length.toLocaleString('en-US')}.
        </p>
      ) : null}
    </aside>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`result-filter ${active ? 'result-filter-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{count.toLocaleString('en-US')}</strong>
    </button>
  );
}

function ResultInspector({
  item,
  keyField,
}: {
  readonly item: ResultListItem | undefined;
  readonly keyField: string;
}) {
  if (item === undefined) {
    return (
      <section className="result-inspector result-inspector-empty" aria-label="Selected record inspector">
        <p className="section-kicker">Record inspector</p>
        <h4>Select a result record</h4>
        <p>Choose a visible result to inspect its authoritative Before and After detail.</p>
      </section>
    );
  }

  if (item.classification === 'changed') {
    return (
      <section className="result-inspector" aria-label="Selected record inspector">
        <InspectorHeader item={item} keyField={keyField} />
        <p className="inspector-description">
          Changed fields are shown by default. Added and removed fields use explicit text labels as
          well as visual treatment.
        </p>
        <table className="difference-table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Status</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {item.result.differences.map((difference) => (
              <DifferenceRow key={difference.field} difference={difference} />
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  const record = item.result.record;
  const side = item.classification === 'added' ? 'After' : 'Before';

  return (
    <section className="result-inspector" aria-label="Selected record inspector">
      <InspectorHeader item={item} keyField={keyField} />
      <p className="inspector-description">
        This record exists in {side} only. Its normalized values are shown as inert text for
        inspection; no field-level match is inferred for an unmatched record.
      </p>
      <RecordTable record={record} valueHeading={`${side} value`} />
    </section>
  );
}

function InspectorHeader({
  item,
  keyField,
}: {
  readonly item: ResultListItem;
  readonly keyField: string;
}) {
  return (
    <header className="inspector-heading">
      <div>
        <p className="section-kicker">Selected record</p>
        <h4>{displayNormalizedValue(item.key)}</h4>
        <p>
          {keyField} · {normalizedValueType(item.key)} key
        </p>
      </div>
      <span className={`result-status result-status-${item.classification}`}>
        {classificationLabel(item.classification)}
      </span>
    </header>
  );
}

function DifferenceRow({ difference }: { readonly difference: FieldDifference }) {
  const label =
    difference.kind === 'added-field'
      ? 'Added field'
      : difference.kind === 'removed-field'
        ? 'Removed field'
        : 'Changed';

  return (
    <tr>
      <th scope="row">{difference.field}</th>
      <td>
        <span className={`difference-kind difference-kind-${difference.kind}`}>{label}</span>
      </td>
      <td>
        <PresenceValue presence={difference.before} />
      </td>
      <td>
        <PresenceValue presence={difference.after} />
      </td>
    </tr>
  );
}

function PresenceValue({ presence }: { readonly presence: ValuePresence }) {
  if (!presence.present) {
    return <span className="value-missing">Not present</span>;
  }

  return <ValueText value={presence.value} />;
}

function ValueText({ value }: { readonly value: NormalizedValue }) {
  return (
    <code className="result-value" title={displayNormalizedValue(value)}>
      {displayNormalizedValue(value)}
    </code>
  );
}

function RecordTable({
  record,
  valueHeading,
}: {
  readonly record: NormalizedRecord;
  readonly valueHeading: string;
}) {
  const fields = Object.entries(record.values);

  if (fields.length === 0) {
    return <p className="result-empty-state">This normalized record has no displayable fields.</p>;
  }

  return (
    <table className="difference-table record-table">
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">{valueHeading}</th>
        </tr>
      </thead>
      <tbody>
        {fields.map(([field, value]) => (
          <tr key={field}>
            <th scope="row">{field}</th>
            <td>
              <ValueText value={value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
