type DecodeResponse =
  | { id: number; kind: 'phase'; phase: 'decoded' }
  | { id: number; kind: 'result'; value: unknown }
  | { id: number; kind: 'error'; message: string };

interface PendingDecode {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  onDecoded?: () => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingDecode>();

const rejectPending = (message: string) => {
  for (const request of pending.values()) request.reject(new Error(message));
  pending.clear();
  worker?.terminate();
  worker = null;
};

const getWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/saveCodec.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
    return null;
  }
  worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    if (response.kind === 'phase') {
      request.onDecoded?.();
      return;
    }
    pending.delete(response.id);
    if (response.kind === 'result') request.resolve(response.value);
    else request.reject(new Error(response.message));
  };
  worker.onerror = () => rejectPending('The background save reader stopped unexpectedly.');
  worker.onmessageerror = () => rejectPending('The browser could not return the decoded save.');
  return worker;
};

const decodeOnMainThread = async (
  buffer: ArrayBuffer,
  gzip: boolean,
  onDecoded?: () => void,
): Promise<unknown> => {
  let text: string;
  if (gzip) {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buffer);
  }
  onDecoded?.();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  return JSON.parse(text);
};

export async function decodeLeagueBuffer(
  buffer: ArrayBuffer,
  gzip: boolean,
  onDecoded?: () => void,
): Promise<unknown> {
  const codecWorker = getWorker();
  if (!codecWorker) {
    return decodeOnMainThread(buffer, gzip, onDecoded);
  }

  const id = nextRequestId++;
  let decodedReported = false;
  const reportDecoded = () => {
    if (decodedReported) return;
    decodedReported = true;
    onDecoded?.();
  };
  const transferable = buffer.slice(0);
  try {
    return await new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject, onDecoded: reportDecoded });
      codecWorker.postMessage({ id, buffer: transferable, gzip }, [transferable]);
    });
  } catch {
    pending.delete(id);
    return decodeOnMainThread(buffer, gzip, reportDecoded);
  }
}
