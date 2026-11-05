export function assertJsonResponse(response: Response, label: string): void {
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(`${label} returned the app page instead of JSON. Check the data file path or deployment assets.`);
  }
}

export async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  assertJsonResponse(response, label);

  const payload = new Uint8Array(await response.arrayBuffer());
  const gzip = payload[0] === 0x1f && payload[1] === 0x8b;
  let decoded = payload;
  if (gzip) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(`${label} is gzip-compressed, but this browser cannot decompress it.`);
    }
    const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'));
    decoded = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const text = new TextDecoder().decode(decoded);
  const trimmed = text.trimStart();
  if (!trimmed) throw new Error(`${label} returned an empty response.`);
  if (trimmed.startsWith('<')) {
    throw new Error(`${label} returned the app page instead of JSON. Check the data file path or deployment assets.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} returned invalid JSON: ${reason}`);
  }
}
