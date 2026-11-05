export type SimDebugCategory =
  | 'development'
  | 'free-agency'
  | 'bird-rights'
  | 'roster-trim'
  | 'lifecycle'
  | 'performance'
  | 'background';

export interface SimDiagnosticEntry {
  sequence: number;
  category: SimDebugCategory;
  message: string;
  context?: Record<string, unknown>;
}

export interface SimDebugConfiguration {
  enabled: boolean;
  categories?: SimDebugCategory[];
  maxEntries?: number;
  console?: boolean;
}

let configuration: Required<SimDebugConfiguration> = {
  enabled: false,
  categories: [],
  maxEntries: 200,
  console: false,
};
let sequence = 0;
let entries: SimDiagnosticEntry[] = [];

export function configureSimDebug(next: SimDebugConfiguration): void {
  configuration = {
    enabled: next.enabled,
    categories: next.categories ?? [],
    maxEntries: Math.max(1, Math.min(2_000, Math.round(next.maxEntries ?? configuration.maxEntries))),
    console: next.console ?? false,
  };
  if (entries.length > configuration.maxEntries) entries = entries.slice(-configuration.maxEntries);
}

const enabledFor = (category: SimDebugCategory): boolean => (
  configuration.enabled
  && (configuration.categories.length === 0 || configuration.categories.includes(category))
);

export function simDebug(
  category: SimDebugCategory,
  messageFactory: () => string,
  context?: Record<string, unknown>,
): void {
  if (!enabledFor(category)) return;
  const entry: SimDiagnosticEntry = {
    sequence: ++sequence,
    category,
    message: messageFactory(),
    ...(context ? { context } : {}),
  };
  entries.push(entry);
  if (entries.length > configuration.maxEntries) entries = entries.slice(-configuration.maxEntries);
  if (configuration.console) console.log(`[sim:${category}] ${entry.message}`, context ?? '');
}

export function clearSimDiagnostics(): void {
  entries = [];
}

export function exportSimDiagnostics(): {
  configuration: Required<SimDebugConfiguration>;
  entries: SimDiagnosticEntry[];
} {
  return {
    configuration: { ...configuration, categories: [...configuration.categories] },
    entries: entries.map(entry => ({
      ...entry,
      ...(entry.context ? { context: { ...entry.context } } : {}),
    })),
  };
}
