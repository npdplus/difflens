import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type {
  ComparisonDiagnostic,
  ComparisonResult,
  ComparisonValidation,
  NormalizedDataset,
} from '@difflens/comparison-core';
import type { SupportedFileFormat } from '@difflens/file-adapters';

import {
  commonFields,
  comparisonDiagnosticMessage,
  relevantFields,
  suggestKeyFields,
} from './comparison-configuration';
import {
  isCurrentComparisonJob,
  type ComparisonWorkerRequest,
  type ComparisonWorkerResponse,
} from './comparison-execution';
import {
  createExampleFiles,
  DIFFLENS_EXAMPLES,
  type DiffLensExample,
  type ExampleId,
} from './example-data';
import {
  createEmptyFileState,
  createReadingFileState,
  diagnosticMessage,
  formatFileSize,
  formatName,
  isConfigurationReady,
  loadLocalFile,
  type FileIntakeState,
  type LoadFileOptions,
} from './file-intake';
import { ResultExperience } from './ResultExperience';
import {
  initialTheme,
  persistThemePreference,
  type Theme,
} from './theme-preference';
import './p07.css';

type Side = 'Before' | 'After';
type IntakeSource = 'user' | 'example';

type ValidationState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'ready'; readonly validation: ComparisonValidation }
  | { readonly status: 'error' };

type ExecutionState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'ready'; readonly result: ComparisonResult }
  | { readonly status: 'invalid'; readonly diagnostics: readonly ComparisonDiagnostic[] }
  | { readonly status: 'error' };

const ACCEPTED_FILE_TYPES = '.csv,.xlsx,.json,.yaml,.yml';
const SUPPORTED_FORMATS: readonly SupportedFileFormat[] = ['csv', 'xlsx', 'json', 'yaml'];

export function App() {
  const [before, setBefore] = useState<FileIntakeState>(createEmptyFileState());
  const [after, setAfter] = useState<FileIntakeState>(createEmptyFileState());
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [selectedKey, setSelectedKey] = useState('');
  const [ignoredFields, setIgnoredFields] = useState<readonly string[]>([]);
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [execution, setExecution] = useState<ExecutionState>({ status: 'idle' });
  const [activeExampleId, setActiveExampleId] = useState<ExampleId | null>(null);
  const [exampleStatus, setExampleStatus] = useState('');
  const beforeGeneration = useRef(0);
  const afterGeneration = useRef(0);
  const exampleGeneration = useRef(0);
  const nextComparisonJobId = useRef(0);
  const activeComparisonJobId = useRef<number | null>(null);
  const activeWorker = useRef<Worker | null>(null);

  useEffect(() => {
    persistThemePreference(theme);
  }, [theme]);

  useEffect(
    () => () => {
      activeComparisonJobId.current = null;
      activeWorker.current?.terminate();
      activeWorker.current = null;
    },
    [],
  );

  function cancelActiveComparisonJob() {
    activeComparisonJobId.current = null;
    activeWorker.current?.terminate();
    activeWorker.current = null;
  }

  function invalidateComparisonResult() {
    cancelActiveComparisonJob();
    setExecution({ status: 'idle' });
  }

  function resetComparisonConfiguration() {
    cancelActiveComparisonJob();
    setSelectedKey('');
    setIgnoredFields([]);
    setValidation({ status: 'idle' });
    setExecution({ status: 'idle' });
  }

  function startWorker(request: ComparisonWorkerRequest) {
    const worker = new Worker(new URL('./comparison.worker.ts', import.meta.url), {
      type: 'module',
    });
    activeWorker.current = worker;
    activeComparisonJobId.current = request.jobId;

    worker.onmessage = (event: MessageEvent<ComparisonWorkerResponse>) => {
      const response = event.data;
      if (!isCurrentComparisonJob(activeComparisonJobId.current, response.jobId)) {
        return;
      }

      activeComparisonJobId.current = null;
      if (activeWorker.current === worker) {
        activeWorker.current = null;
      }
      worker.terminate();

      if (response.type === 'worker-error') {
        if (request.type === 'validate') {
          setValidation({ status: 'error' });
        } else {
          setExecution({ status: 'error' });
        }
        return;
      }

      if (response.type === 'validation-complete') {
        setValidation({ status: 'ready', validation: response.validation });
        return;
      }

      if (response.outcome.status === 'invalid') {
        setExecution({ status: 'invalid', diagnostics: response.outcome.diagnostics });
        return;
      }

      setExecution({ status: 'ready', result: response.outcome.result });
    };

    worker.onerror = () => {
      if (!isCurrentComparisonJob(activeComparisonJobId.current, request.jobId)) {
        return;
      }

      activeComparisonJobId.current = null;
      if (activeWorker.current === worker) {
        activeWorker.current = null;
      }
      worker.terminate();

      if (request.type === 'validate') {
        setValidation({ status: 'error' });
      } else {
        setExecution({ status: 'error' });
      }
    };

    worker.postMessage(request);
  }

  function nextJobId(): number {
    nextComparisonJobId.current += 1;
    return nextComparisonJobId.current;
  }

  function validateKey(
    keyField: string,
    nextIgnoredFields: readonly string[],
    beforeDataset: NormalizedDataset,
    afterDataset: NormalizedDataset,
  ) {
    cancelActiveComparisonJob();
    setExecution({ status: 'idle' });

    if (keyField === '') {
      setValidation({ status: 'idle' });
      return;
    }

    const request: ComparisonWorkerRequest = {
      type: 'validate',
      jobId: nextJobId(),
      before: beforeDataset,
      after: afterDataset,
      options: {
        key: { field: keyField },
        ignoredFields: nextIgnoredFields,
      },
    };

    setValidation({ status: 'running' });
    startWorker(request);
  }

  async function loadSide(
    side: Side,
    file: File,
    options: LoadFileOptions = {},
    source: IntakeSource = 'user',
  ): Promise<FileIntakeState> {
    resetComparisonConfiguration();
    if (source === 'user') {
      exampleGeneration.current += 1;
      setActiveExampleId(null);
      setExampleStatus('');
    }

    const generation = side === 'Before' ? beforeGeneration : afterGeneration;
    const setState = side === 'Before' ? setBefore : setAfter;
    const token = ++generation.current;

    setState(createReadingFileState(file));
    const nextState = await loadLocalFile(file, options);
    if (generation.current === token) {
      setState(nextState);
    }
    return nextState;
  }

  function resetComparison() {
    beforeGeneration.current += 1;
    afterGeneration.current += 1;
    exampleGeneration.current += 1;
    resetComparisonConfiguration();
    setBefore(createEmptyFileState());
    setAfter(createEmptyFileState());
    setActiveExampleId(null);
    setExampleStatus('');
  }

  async function loadExample(example: DiffLensExample) {
    resetComparison();
    const token = ++exampleGeneration.current;
    setActiveExampleId(example.id);
    setExampleStatus(`Loading ${example.title} through the local file pipeline…`);
    const files = createExampleFiles(example);
    const [beforeState, afterState] = await Promise.all([
      loadSide('Before', files.before, {}, 'example'),
      loadSide('After', files.after, {}, 'example'),
    ]);

    if (exampleGeneration.current !== token) {
      return;
    }

    if (beforeState.status === 'ready' && afterState.status === 'ready') {
      setExampleStatus(
        `${example.title} is ready. Choose ${example.keyField} as the matching key${
          example.suggestedIgnoredFields.length === 0
            ? '.'
            : `; optionally ignore ${example.suggestedIgnoredFields.join(' and ')} to see the audit-field demonstration.`
        }`,
      );
      return;
    }

    setExampleStatus('The example could not be loaded through the supported local adapter path.');
  }

  const beforeDataset = before.status === 'ready' ? before.dataset : undefined;
  const afterDataset = after.status === 'ready' ? after.dataset : undefined;
  const bothReady =
    beforeDataset !== undefined &&
    afterDataset !== undefined &&
    isConfigurationReady(before) &&
    isConfigurationReady(after);
  const hasActiveFile = before.status !== 'empty' || after.status !== 'empty';
  const activeExample = DIFFLENS_EXAMPLES.find((example) => example.id === activeExampleId);
  const keyFields =
    beforeDataset !== undefined && afterDataset !== undefined
      ? commonFields(beforeDataset, afterDataset)
      : [];
  const ignoreFields =
    beforeDataset !== undefined && afterDataset !== undefined
      ? relevantFields(beforeDataset, afterDataset).filter((field) => field !== selectedKey)
      : [];
  const suggestedKeys =
    beforeDataset !== undefined && afterDataset !== undefined
      ? suggestKeyFields(beforeDataset, afterDataset)
      : [];
  const canCompare =
    bothReady &&
    selectedKey !== '' &&
    validation.status === 'ready' &&
    validation.validation.valid &&
    execution.status !== 'running';

  function changeKey(nextKey: string) {
    if (beforeDataset === undefined || afterDataset === undefined) {
      return;
    }

    const nextIgnoredFields = ignoredFields.filter((field) => field !== nextKey);
    setSelectedKey(nextKey);
    setIgnoredFields(nextIgnoredFields);
    invalidateComparisonResult();
    validateKey(nextKey, nextIgnoredFields, beforeDataset, afterDataset);
  }

  function toggleIgnoredField(field: string) {
    if (beforeDataset === undefined || afterDataset === undefined || field === selectedKey) {
      return;
    }

    const nextIgnoredFields = ignoredFields.includes(field)
      ? ignoredFields.filter((item) => item !== field)
      : [...ignoredFields, field];

    setIgnoredFields(nextIgnoredFields);
    invalidateComparisonResult();
    validateKey(selectedKey, nextIgnoredFields, beforeDataset, afterDataset);
  }

  function runComparison() {
    if (
      beforeDataset === undefined ||
      afterDataset === undefined ||
      selectedKey === '' ||
      validation.status !== 'ready' ||
      !validation.validation.valid
    ) {
      return;
    }

    cancelActiveComparisonJob();
    const request: ComparisonWorkerRequest = {
      type: 'compare',
      jobId: nextJobId(),
      before: beforeDataset,
      after: afterDataset,
      options: {
        key: { field: selectedKey },
        ignoredFields,
      },
    };

    setExecution({ status: 'running' });
    startWorker(request);
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="app-frame">
        <header className="app-header">
          <div>
            <p className="eyebrow">NPD PLUS Labs · Experimental open-source</p>
            <div className="title-row">
              <h1>DiffLens</h1>
              <span className="version-chip">V0.1</span>
            </div>
            <p className="hero-copy">
              Compare two structured files locally, starting with a clear Before and After.
            </p>
          </div>

          <div className="header-actions" aria-label="Application controls">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-pressed={theme === 'light'}
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={resetComparison}
              disabled={!hasActiveFile}
            >
              New comparison
            </button>
          </div>
        </header>

        <section className="privacy-banner" aria-label="Local processing notice">
          <span className="privacy-mark" aria-hidden="true">
            Local
          </span>
          <div>
            <h2>Your comparison stays local to this browser workflow</h2>
            <p>
              Your comparison files are processed locally in your browser for the core DiffLens
              workflow. The comparison result and CSV report are also produced locally; no account
              or backend upload is required for this flow.
            </p>
          </div>
        </section>

        <section className="workflow-intro" aria-labelledby="file-intake-heading">
          <div>
            <p className="section-kicker">Step 1 · Local file intake</p>
            <h2 id="file-intake-heading">Choose the versions you want to inspect</h2>
            <p>
              Drop files below or use the file picker. Supported formats: CSV, XLSX, JSON, and YAML.
            </p>
          </div>
          <div className="format-list" aria-label="Supported formats">
            {SUPPORTED_FORMATS.map((format) => (
              <span key={format}>{formatName(format)}</span>
            ))}
          </div>
        </section>

        <section className="example-launcher" aria-labelledby="example-launcher-heading">
          <div className="example-heading">
            <div>
              <p className="section-kicker">No files handy?</p>
              <h2 id="example-launcher-heading">Try a synthetic example</h2>
              <p>
                These public-safe examples enter the same local file-adapter, key-validation,
                worker comparison, results, and export path as your own files.
              </p>
            </div>
            <span className="phase-pill">Real pipeline</span>
          </div>
          <div className="example-grid">
            {DIFFLENS_EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                className={`example-card ${activeExampleId === example.id ? 'example-card-active' : ''}`}
                onClick={() => void loadExample(example)}
                aria-pressed={activeExampleId === example.id}
              >
                <span className="example-card-topline">
                  <strong>{example.title}</strong>
                  <small>{example.formatLabel}</small>
                </span>
                <span>{example.description}</span>
                <span className="example-card-key">Key: {example.keyField}</span>
              </button>
            ))}
          </div>
          <p className="example-status" aria-live="polite">
            {exampleStatus}
          </p>
        </section>

        <section className="file-grid" aria-label="Before and After local files">
          <FilePanel
            side="Before"
            state={before}
            onFile={(file) => void loadSide('Before', file)}
            onDataset={(file, datasetId) => void loadSide('Before', file, { datasetId })}
            onFormatOverride={(file, format) => void loadSide('Before', file, { format })}
          />
          <FilePanel
            side="After"
            state={after}
            onFile={(file) => void loadSide('After', file)}
            onDataset={(file, datasetId) => void loadSide('After', file, { datasetId })}
            onFormatOverride={(file, format) => void loadSide('After', file, { format })}
          />
        </section>

        <section
          className={`configuration-gate ${bothReady ? 'configuration-gate-ready' : ''}`}
          aria-live="polite"
          aria-label="Configuration readiness"
        >
          <div className="gate-index" aria-hidden="true">
            2
          </div>
          <div>
            <h2>
              {bothReady ? 'Files are ready for comparison settings' : 'Comparison settings come next'}
            </h2>
            <p>
              {bothReady
                ? 'Both selected datasets were normalized locally. Choose a matching key and optional ignored fields below.'
                : 'Load a supported Before and After dataset first. Comparison configuration becomes available only after both datasets are ready.'}
            </p>
          </div>
          <span className="phase-pill">Configure</span>
        </section>

        {bothReady && beforeDataset !== undefined && afterDataset !== undefined && (
          <section className="comparison-config" aria-labelledby="comparison-config-heading">
            <div className="config-heading">
              <div>
                <p className="section-kicker">Step 2 · Comparison settings</p>
                <h2 id="comparison-config-heading">Choose record identity explicitly</h2>
                <p>
                  DiffLens never silently chooses your business key. Suggestions are convenience
                  only and remain under your control.
                </p>
              </div>
              <span className="phase-pill">Local worker</span>
            </div>

            {activeExample !== undefined && (
              <aside className="example-guidance" aria-label="Example comparison guidance">
                <strong>Example guidance</strong>
                <span>
                  Choose <code>{activeExample.keyField}</code> as the matching key
                  {activeExample.suggestedIgnoredFields.length === 0
                    ? '.'
                    : `; you can also ignore ${activeExample.suggestedIgnoredFields.join(' and ')} to demonstrate audit-field filtering.`}
                </span>
              </aside>
            )}

            <div className="config-grid">
              <div className="config-card">
                <label htmlFor="matching-key">Matching key</label>
                <p id="matching-key-help" className="config-help">
                  Select the one field that identifies the same logical record on both sides.
                </p>
                <select
                  id="matching-key"
                  aria-label="Matching key"
                  aria-describedby="matching-key-help matching-key-feedback"
                  value={selectedKey}
                  onChange={(event) => changeKey(event.currentTarget.value)}
                >
                  <option value="">Choose a key…</option>
                  {keyFields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>

                {suggestedKeys.length > 0 && (
                  <div className="suggestion-row" aria-label="Suggested matching keys">
                    <span>Suggested</span>
                    {suggestedKeys.map((field) => (
                      <button
                        key={field}
                        type="button"
                        className="suggestion-button"
                        onClick={() => changeKey(field)}
                      >
                        Use {field}
                      </button>
                    ))}
                  </div>
                )}

                {keyFields.length === 0 && (
                  <p className="config-help status-copy-warning">
                    These datasets do not expose a common field that can be selected as the V0.1
                    key.
                  </p>
                )}

                <div id="matching-key-feedback">
                  <ValidationFeedback state={validation} selectedKey={selectedKey} />
                </div>
              </div>

              <fieldset className="config-card ignore-card" disabled={selectedKey === ''}>
                <legend>Ignored fields</legend>
                <p className="config-help">
                  Optional. Ignored fields are passed to the comparison core and do not contribute
                  to Changed classification. The selected key cannot be ignored.
                </p>
                {ignoreFields.length === 0 ? (
                  <p className="config-help">No additional fields are available to ignore.</p>
                ) : (
                  <div className="field-options" aria-label="Ignored fields">
                    {ignoreFields.map((field) => (
                      <label key={field}>
                        <input
                          type="checkbox"
                          aria-label={`Ignore ${field}`}
                          checked={ignoredFields.includes(field)}
                          onChange={() => toggleIgnoredField(field)}
                        />
                        <span>{field}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </div>

            <div className="compare-action-row">
              <div aria-live="polite">
                {execution.status === 'running' ? (
                  <p className="execution-status">Comparing locally in a browser worker…</p>
                ) : (
                  <p className="config-help">
                    Comparison starts only after the selected key passes validation.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="compare-button"
                onClick={runComparison}
                disabled={!canCompare}
              >
                {execution.status === 'running' ? 'Comparing…' : 'Compare'}
              </button>
            </div>

            <ExecutionFeedback state={execution} />
          </section>
        )}
      </div>
    </main>
  );
}

function ValidationFeedback({
  state,
  selectedKey,
}: {
  readonly state: ValidationState;
  readonly selectedKey: string;
}) {
  if (selectedKey === '') {
    return <p className="config-help">Select a common field to validate record identity.</p>;
  }

  if (state.status === 'running') {
    return (
      <p className="validation-status" aria-live="polite">
        Checking the selected key locally…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="status-copy-error" role="alert">
        DiffLens could not validate this key. Choose another key or reset and try again.
      </p>
    );
  }

  if (state.status !== 'ready') {
    return null;
  }

  if (state.validation.diagnostics.length === 0) {
    return (
      <p className="status-copy-ready">
        Key is valid and unique across all matchable records on both sides.
      </p>
    );
  }

  return (
    <ul className="comparison-diagnostics" aria-label="Key validation diagnostics">
      {state.validation.diagnostics.map((diagnostic, index) => (
        <li
          key={`${diagnostic.code}-${diagnostic.side}-${index}`}
          className={`comparison-diagnostic-${diagnostic.severity}`}
        >
          <strong>{diagnostic.severity === 'error' ? 'Action needed' : 'Notice'}</strong>
          <span>{comparisonDiagnosticMessage(diagnostic)}</span>
        </li>
      ))}
    </ul>
  );
}

function ExecutionFeedback({ state }: { readonly state: ExecutionState }) {
  if (state.status === 'ready') {
    return <ResultExperience result={state.result} />;
  }

  if (state.status === 'invalid') {
    return (
      <ul className="comparison-diagnostics" aria-label="Comparison execution diagnostics">
        {state.diagnostics.map((diagnostic, index) => (
          <li
            key={`${diagnostic.code}-${diagnostic.side}-${index}`}
            className={`comparison-diagnostic-${diagnostic.severity}`}
          >
            <strong>{diagnostic.severity === 'error' ? 'Action needed' : 'Notice'}</strong>
            <span>{comparisonDiagnosticMessage(diagnostic)}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="status-copy-error" role="alert">
        The local comparison could not complete. No source records were sent or added to this
        message. Reset or adjust the configuration and try again.
      </p>
    );
  }

  return null;
}

interface FilePanelProps {
  readonly side: Side;
  readonly state: FileIntakeState;
  readonly onFile: (file: File) => void;
  readonly onDataset: (file: File, datasetId: string) => void;
  readonly onFormatOverride: (file: File, format: SupportedFileFormat) => void;
}

function FilePanel({ side, state, onFile, onDataset, onFormatOverride }: FilePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function chooseFile() {
    inputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file !== undefined) {
      onFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) {
      onFile(file);
    }
  }

  const status = statusPresentation(state);

  return (
    <article className="file-panel" aria-labelledby={`${side.toLowerCase()}-file-heading`}>
      <div className="panel-heading">
        <div className={`side-marker side-marker-${side.toLowerCase()}`} aria-hidden="true">
          {side === 'Before' ? 'B' : 'A'}
        </div>
        <div>
          <p className="panel-label">{side} version</p>
          <h2 id={`${side.toLowerCase()}-file-heading`}>{side} file</h2>
        </div>
        <span className={`status-badge status-${status.tone}`}>{status.label}</span>
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        aria-label={`${side} file input`}
        onChange={handleFileChange}
      />

      <button
        type="button"
        className={`drop-surface ${dragActive ? 'drop-surface-active' : ''}`}
        data-testid={`${side.toLowerCase()}-drop-zone`}
        onClick={chooseFile}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label={`${side} file drop zone. ${state.status === 'empty' ? 'Choose a file' : 'Replace the current file'}.`}
      >
        <span className="drop-icon" aria-hidden="true">
          {state.status === 'reading' ? '···' : '↓'}
        </span>
        <strong>{state.status === 'empty' ? `Choose ${side} file` : 'Replace file'}</strong>
        <span>
          {state.status === 'empty' ? 'Drop it here or open the file picker' : status.detail}
        </span>
      </button>

      {state.status !== 'empty' && <FileMetadata state={state} />}

      {state.status === 'selection-required' && (
        <DatasetSelector
          side={side}
          datasets={state.datasets}
          onSelect={(datasetId) => onDataset(state.file, datasetId)}
        />
      )}

      {state.status === 'unsupported' && (
        <FormatRecovery side={side} file={state.file} onRetry={onFormatOverride} />
      )}

      {'diagnostics' in state && state.diagnostics.length > 0 && (
        <ul className="diagnostic-list" aria-label={`${side} file diagnostics`}>
          {state.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`} className={`diagnostic-${diagnostic.severity}`}>
              <strong>{diagnostic.severity === 'error' ? 'Action needed' : 'Notice'}</strong>
              <span>{diagnosticMessage(diagnostic)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function FileMetadata({
  state,
}: {
  readonly state: Exclude<FileIntakeState, { status: 'empty' }>;
}) {
  const format = 'format' in state ? state.format : undefined;
  const dataset = state.status === 'ready' ? state.dataset : undefined;

  return (
    <dl className="metadata-grid">
      <div>
        <dt>File</dt>
        <dd title={state.metadata.name}>{state.metadata.name}</dd>
      </div>
      <div>
        <dt>Size</dt>
        <dd>{formatFileSize(state.metadata.size)}</dd>
      </div>
      <div>
        <dt>Format</dt>
        <dd>{format === undefined ? 'Not resolved' : formatName(format)}</dd>
      </div>
      <div>
        <dt>Dataset</dt>
        <dd>{dataset?.name ?? (state.status === 'selection-required' ? 'Choose below' : '—')}</dd>
      </div>
      {dataset !== undefined && (
        <>
          <div>
            <dt>Records</dt>
            <dd>{dataset.records.length.toLocaleString('en-US')}</dd>
          </div>
          <div>
            <dt>Fields</dt>
            <dd>{dataset.fields.length.toLocaleString('en-US')}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

function DatasetSelector({
  side,
  datasets,
  onSelect,
}: {
  readonly side: Side;
  readonly datasets: readonly {
    readonly id: string;
    readonly name: string;
    readonly recordCount?: number;
  }[];
  readonly onSelect: (datasetId: string) => void;
}) {
  return (
    <div className="selection-card">
      <label htmlFor={`${side.toLowerCase()}-dataset`}>Choose dataset or worksheet</label>
      <select
        id={`${side.toLowerCase()}-dataset`}
        aria-label={`${side} dataset`}
        defaultValue=""
        onChange={(event) => {
          if (event.currentTarget.value !== '') {
            onSelect(event.currentTarget.value);
          }
        }}
      >
        <option value="" disabled>
          Select one…
        </option>
        {datasets.map((dataset) => (
          <option key={dataset.id} value={dataset.id}>
            {dataset.name}
            {dataset.recordCount === undefined ? '' : ` · ${dataset.recordCount} records`}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormatRecovery({
  side,
  file,
  onRetry,
}: {
  readonly side: Side;
  readonly file: File;
  readonly onRetry: (file: File, format: SupportedFileFormat) => void;
}) {
  const [format, setFormat] = useState<SupportedFileFormat>('csv');

  return (
    <div className="selection-card">
      <label htmlFor={`${side.toLowerCase()}-format`}>Try a known format</label>
      <div className="recovery-row">
        <select
          id={`${side.toLowerCase()}-format`}
          aria-label={`${side} format override`}
          value={format}
          onChange={(event) => setFormat(event.currentTarget.value as SupportedFileFormat)}
        >
          {SUPPORTED_FORMATS.map((item) => (
            <option key={item} value={item}>
              {formatName(item)}
            </option>
          ))}
        </select>
        <button type="button" className="primary-button" onClick={() => onRetry(file, format)}>
          Try as {formatName(format)}
        </button>
      </div>
    </div>
  );
}

function statusPresentation(state: FileIntakeState): {
  readonly label: string;
  readonly detail: string;
  readonly tone: 'neutral' | 'busy' | 'ready' | 'warning' | 'error';
} {
  switch (state.status) {
    case 'empty':
      return {
        label: 'Waiting for file',
        detail: 'No local file selected yet',
        tone: 'neutral',
      };
    case 'reading':
      return {
        label: 'Reading locally',
        detail: 'Reading and parsing this file in your browser',
        tone: 'busy',
      };
    case 'ready':
      return {
        label: 'Ready to configure',
        detail: `${formatName(state.format)} · ${state.dataset.records.length.toLocaleString('en-US')} records`,
        tone: 'ready',
      };
    case 'selection-required':
      return {
        label: 'Selection needed',
        detail: 'Choose one dataset or worksheet below',
        tone: 'warning',
      };
    case 'unsupported':
      return {
        label: 'Unsupported format',
        detail: 'Choose another file or retry with a known format',
        tone: 'error',
      };
    case 'error':
      return {
        label: 'Could not load',
        detail: 'Review the message below, then replace or retry the file',
        tone: 'error',
      };
  }
}
