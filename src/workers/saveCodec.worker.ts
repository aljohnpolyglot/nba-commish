type DecodeRequest = {
  id: number;
  buffer: ArrayBuffer;
  gzip: boolean;
};

type DecodeResponse =
  | { id: number; kind: 'phase'; phase: 'decoded' }
  | { id: number; kind: 'result'; value: unknown }
  | { id: number; kind: 'error'; message: string };

const decodeGzip = async (buffer: ArrayBuffer): Promise<string> => {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
};

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, buffer, gzip } = event.data;
  try {
    const text = gzip ? await decodeGzip(buffer) : new TextDecoder().decode(buffer);
    self.postMessage({ id, kind: 'phase', phase: 'decoded' } satisfies DecodeResponse);
    const value = JSON.parse(text);
    self.postMessage({ id, kind: 'result', value } satisfies DecodeResponse);
  } catch (error) {
    self.postMessage({
      id,
      kind: 'error',
      message: error instanceof Error ? error.message : 'The league file could not be decoded.',
    } satisfies DecodeResponse);
  }
};

export {};
