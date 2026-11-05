export type MediaRuntimeDiagnostics = {
  socialEngineConstructors: number;
  socialPresentationCalls: number;
  newsPresentationCalls: number;
  engagementCalls: number;
  photoLookupCalls: number;
  remoteProviderCalls: number;
  llmCalls: number;
  callSites: string[];
};
export type MediaRuntimeCounter = Exclude<keyof MediaRuntimeDiagnostics, 'callSites'>;

const createEmptyDiagnostics = (): MediaRuntimeDiagnostics => ({
  socialEngineConstructors: 0,
  socialPresentationCalls: 0,
  newsPresentationCalls: 0,
  engagementCalls: 0,
  photoLookupCalls: 0,
  remoteProviderCalls: 0,
  llmCalls: 0,
  callSites: [],
});

let diagnostics = createEmptyDiagnostics();

(globalThis as typeof globalThis & {
  __recordMediaRuntimeCall?: (key: MediaRuntimeCounter) => void;
}).__recordMediaRuntimeCall = (key) => {
  diagnostics[key] += 1;
  if ((globalThis as typeof globalThis & { __mediaRuntimeTrace?: boolean }).__mediaRuntimeTrace) {
    const site = new Error().stack?.split('\n').slice(2, 6).join(' <- ') ?? key;
    if (!diagnostics.callSites.includes(`${key}: ${site}`)) diagnostics.callSites.push(`${key}: ${site}`);
  }
};

/** Low-overhead evidence hook. It never participates in saved gameplay state. */
export const recordMediaRuntimeCall = (key: MediaRuntimeCounter): void => {
  diagnostics[key] += 1;
  if ((globalThis as typeof globalThis & { __mediaRuntimeTrace?: boolean }).__mediaRuntimeTrace) {
    const site = new Error().stack?.split('\n').slice(2, 6).join(' <- ') ?? key;
    if (!diagnostics.callSites.includes(`${key}: ${site}`)) diagnostics.callSites.push(`${key}: ${site}`);
  }
};

export const getMediaRuntimeDiagnostics = (): MediaRuntimeDiagnostics => ({ ...diagnostics });

export const resetMediaRuntimeDiagnostics = (): void => {
  diagnostics = createEmptyDiagnostics();
};
