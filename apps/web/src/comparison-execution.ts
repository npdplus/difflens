import {
  compareDatasets,
  validateComparisonInput,
  type ComparisonOptions,
  type ComparisonOutcome,
  type ComparisonValidation,
  type NormalizedDataset,
} from '@difflens/comparison-core';

interface ComparisonWorkerRequestBase {
  readonly jobId: number;
  readonly before: NormalizedDataset;
  readonly after: NormalizedDataset;
  readonly options: ComparisonOptions;
}

export type ComparisonWorkerRequest =
  | (ComparisonWorkerRequestBase & { readonly type: 'validate' })
  | (ComparisonWorkerRequestBase & { readonly type: 'compare' });

export type ComparisonWorkerResponse =
  | {
      readonly type: 'validation-complete';
      readonly jobId: number;
      readonly validation: ComparisonValidation;
    }
  | {
      readonly type: 'comparison-complete';
      readonly jobId: number;
      readonly outcome: ComparisonOutcome;
    }
  | {
      readonly type: 'worker-error';
      readonly jobId: number;
      readonly code: 'comparison-failed';
    };

export function executeComparisonWorkerRequest(
  request: ComparisonWorkerRequest,
): ComparisonWorkerResponse {
  try {
    if (request.type === 'validate') {
      return {
        type: 'validation-complete',
        jobId: request.jobId,
        validation: validateComparisonInput(request.before, request.after, request.options),
      };
    }

    return {
      type: 'comparison-complete',
      jobId: request.jobId,
      outcome: compareDatasets(request.before, request.after, request.options),
    };
  } catch {
    return {
      type: 'worker-error',
      jobId: request.jobId,
      code: 'comparison-failed',
    };
  }
}

export function isCurrentComparisonJob(
  activeJobId: number | null,
  responseJobId: number,
): boolean {
  return activeJobId !== null && activeJobId === responseJobId;
}
