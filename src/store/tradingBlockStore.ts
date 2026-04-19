/**
 * tradingBlockStore — per-team Trading Block selections (untouchables, block,
 * targets, block picks) persisted across refresh.
 *
 * Mirrors gameplanStore's per-saveId + localStorage pattern so selections
 * survive navigation, refresh, and save switching. Hydrate on mount in
 * TradingBlock.tsx, autosave on every state change.
 *
 * GameContext calls setActiveSaveId() whenever state.saveId changes.
 */

export interface TradingBlockEntry {
  untouchableIds: string[];
  blockIds: string[];
  targetIds: string[];
  blockPickIds: number[];
}

const STORAGE_PREFIX = 'nba-commish-tradingblocks::';
const DEFAULT_SAVE_ID = '__default';

let activeSaveId: string = DEFAULT_SAVE_ID;
let cache: Map<number, TradingBlockEntry> = new Map();
let hydratedFor: string | null = null;

function storageKey(saveId: string) {
  return STORAGE_PREFIX + saveId;
}

function hydrate() {
  if (hydratedFor === activeSaveId) return;
  cache = new Map();
  hydratedFor = activeSaveId;
  try {
    const raw = localStorage.getItem(storageKey(activeSaveId));
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, TradingBlockEntry>;
    for (const [k, v] of Object.entries(obj)) cache.set(Number(k), v);
  } catch {
    // Swallow — corrupt storage just means we start fresh.
  }
}

function persist() {
  try {
    const obj: Record<number, TradingBlockEntry> = {};
    for (const [k, v] of cache) obj[k] = v;
    localStorage.setItem(storageKey(activeSaveId), JSON.stringify(obj));
  } catch {
    // Storage quota / disabled — not worth crashing for.
  }
}

export function setActiveSaveId(saveId: string | undefined | null) {
  const next = saveId && saveId.length > 0 ? saveId : DEFAULT_SAVE_ID;
  if (next === activeSaveId) return;
  activeSaveId = next;
  hydratedFor = null;
}

export function getTradingBlock(teamId: number): TradingBlockEntry | null {
  hydrate();
  return cache.get(teamId) ?? null;
}

export function saveTradingBlock(teamId: number, entry: TradingBlockEntry) {
  hydrate();
  cache.set(teamId, entry);
  persist();
}

export function clearTradingBlock(teamId: number) {
  hydrate();
  cache.delete(teamId);
  persist();
}
