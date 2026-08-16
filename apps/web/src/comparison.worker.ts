import {
  executeComparisonWorkerRequest,
  type ComparisonWorkerRequest,
  type ComparisonWorkerResponse,
} from './comparison-execution';

interface WorkerScope {
  onmessage: ((event: MessageEvent<ComparisonWorkerRequest>) => void) | null;
  postMessage(message: ComparisonWorkerResponse): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  workerScope.postMessage(executeComparisonWorkerRequest(event.data));
};
