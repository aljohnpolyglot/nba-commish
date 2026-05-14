# Zustand Migration — Plan

> **Wann ausführen:** NACH der Euro-Overnight-Welle (`plans/codex-overnight-goal.md`). Nicht parallel.
>
> **Design North Star:** der gesamte Game-State (Players / Teams / League / Schedule / History / Negotiations / Sponsorships / Tycoon / UI) wandert in einen Zustand-Store, organisiert per Slice. `GameContext` wird zum Compatibility-Shim und am Ende komplett ausgemustert.

## Locked Decisions (Session 2026-05-13)

1. **Strangler-Fig Migration** — `useGame()` bleibt als Compatibility-Shim, der intern `useGameStore` queryt. Bestehende ~hundreds Consumer funktionieren weiter ohne Touch. Neue Components nutzen direkt `useGameStore(selector)`. Migration ist inkrementell pro Component.
2. **Custom Storage Adapter** — Zustand `persist` middleware mit einem Adapter, der intern `SaveManager.compress()` + `idb-keyval` + Multi-Save-Bucketing nutzt. Saves bleiben gzipped + save-id-scoped.
3. **Pilot: 11 isolated stores zuerst** — `gameplanStore`, `coachSystemStore`, `coachStrategyLockStore`, `defenderDetailStore`, `defenseGameplanStore`, `idealRotationStore`, `matchupAssignmentsStore`, `rivalGameplanStore`, `scoringOptionsStore`, `tradingBlockStore`, `saveScopedMapStore`. Niedrigstes Regression-Risk, perfekter Adapter-Validation-Pilot.

## Phase 1 — Pilot: Die 11 isolated Stores (1–2 Sessions)

**Ziel:** Pattern + Adapter validieren ohne Main-State anzufassen.

**Konkret:**
- `pnpm add zustand` (auch wenn schon installiert → check `package.json`)
- Pro Store-Datei: ersetze handgerollte `subscribers + getState + setState + useSyncExternalStore` durch `create()` mit `persist` middleware
- Custom Adapter: `src/store/persistence/saveScopedLocalStorage.ts` — wrappt localStorage + saveId-bucket-Logik (genau wie heute, nur als Zustand-Storage-Adapter)
- API-Compat: jeder Store exportiert weiterhin `getX()` / `setX()` / `subscribeX()` als Wrapper für nicht-React-Aufrufer (StatGenerator, sim engine), plus neuen `useXStore` hook für React
- Verify pro Store: localStorage bucket per saveId identisch wie heute (Pre/Post-Migration-Snapshot vergleichen)
- Files to touch:
  - `src/store/gameplanStore.ts` + `coachSystemStore.ts` + `coachStrategyLockStore.ts` + `defenderDetailStore.ts` + `defenseGameplanStore.ts` + `idealRotationStore.ts` + `matchupAssignmentsStore.ts` + `rivalGameplanStore.ts` + `scoringOptionsStore.ts` + `tradingBlockStore.ts` + `saveScopedMapStore.ts`
  - New: `src/store/persistence/saveScopedLocalStorage.ts`
- Zero Touch auf `GameContext`, `useGameActions`, Consumer-Components
- Acceptance: alle Coaching/Trading-Block/Defender-Detail UIs identisch funktional, saves persist gleich, localStorage-Buckets identisch byte-für-byte

## Phase 2 — Custom IDB Adapter + Main Store Skelett (1 Session)

**Ziel:** Den Main-Store anlegen (leer) + den IDB-gzip-Adapter implementieren, bevor Slices migrieren.

- `src/store/persistence/gzipIdbAdapter.ts` — Zustand `StateStorage`-Adapter:
  - `getItem(name)` → IDB `get(name)` → DecompressionStream gzip → JSON.parse
  - `setItem(name, value)` → JSON.stringify → CompressionStream gzip → IDB `set(name, ArrayBuffer)`
  - `removeItem(name)` → IDB `del(name)`
  - Schreibt das `{ __gz: true, data: ArrayBuffer }`-Format genau wie heute (siehe CLAUDE.md Save Format Section)
- `src/store/useGameStore.ts` — initial leerer Store mit Slice-Composition-Skelett, persist disabled bis Slices migriert sind
- Tests: load-existing-save via Adapter → state struct identisch zum Pre-Migration-State (deep-equal-Snapshot)
- Verify: Roundtrip eines Test-Saves bricht keine bestehende Logik (alter GameContext nutzt es noch nicht)

## Phase 3 — UI Slice (1 Session)

**Ziel:** Niedrigster-Risk-Slice als Strangler-Fig-Validation. Beweist dass Compat-Shim funktioniert.

- New: `src/store/slices/uiSlice.ts` — modalState, navigation-current-route, prefs, suppressFinanceRecapUntil, etc.
- `useGame()` Shim updated: liest `uiPrefs`-Reads aus `useGameStore.getState().ui.*`, Writes dispatchen via Slice-Actions
- Beweist: ein Slice live in production, useGame-Consumer agnostic, kein UI-Regression

## Phase 4 — Domain Slices (5–8 Sessions, in Reihenfolge)

Pro Slice: anlegen → useGame Shim umroutet → Consumer-Migration optional → alte GameContext-State-Field deprecated.

1. **`createNegotiationSlice`** — signings + sponsor-neg + trade-talks (Overnight-Codex baut neue Negotiation-Features eh; Zustand-native macht's sauberer)
2. **`createTeamSlice`** — teams + tycoon + staffing + facilities
3. **`createLeagueSlice`** — leagueStats + schedule + standings + competitions + calendar
4. **`createPlayerSlice`** — players + stats + ratings + relatives + moodTraits (höchstes Volumen, höchste Selector-Win)
5. **`createHistorySlice`** — history + awards + retired + transactions + boxScores
6. **`createScheduleSlice`** — schedule + competitionRows + matchdays (kann auch Teil von League sein; split nur wenn Selector-Hot-Path)
7. **`createCommissionerSlice`** — rules, settings, commissioner-only state

Acceptance pro Slice: getätigte Mutations laufen über Slice-Actions, alle bestehenden useGame-Reads liefern identische Werte, Test-Save roundtrips deep-equal.

## Phase 5 — GameContext Sunset (1 Session)

- Wenn ALLE State-Fields in Slices leben: GameContext-Wrapper enthält nur noch Refs + Lifecycle + Callbacks (nicht-State)
- useGame() Shim returnt jetzt eine kombinierte Selector-Aggregation für Legacy-Consumer
- Consumer-Migration optional (rein Performance — Selector-Renders pro Consumer-Touch)
- Long-term: useGame() deprecated, neue Components nutzen direkt slice-spezifische Hooks (`useTycoon()`, `usePlayers()`, etc.)

## Phase 6 — Selector Migration (Ongoing, Multi-Session)

Pro Hot-Path-Component (Schedule-Calendar, Front-Office-Live-Updates, Trade-Hub, Player-Bio-Lists): useGame() → useGameStore-Selector. Erkennbarer FPS-Win in DevTools-Profiler. Kein Big-Bang — touched-when-touched.

## API-Compat-Shim Spec

```ts
// src/store/GameContext.tsx (post Phase 3+)
export const useGame = () => {
  const state = useGameStore();           // Full state — kein Selector, bewusst
  const dispatch = useGameStore(s => s.dispatch);
  const applyTycoonMutation = useGameStore(s => s.applyTycoonMutation);
  // ... weitere existing-API-Funktionen
  return { state, dispatch, applyTycoonMutation, /* ... */ };
};
```

Bestehende Components funktionieren ohne Änderung. Nur ineffizient (Full-State-Subscription). Migration zu Selectoren ist optional und inkrementell.

## Was nicht migriert wird (Out of Scope)

- **`SaveManager.ts`** Core-Funktionalität: bleibt für Multi-Save-Listing, Metadata-Verwaltung, Export/Import. Zustand-Adapter ruft `SaveManager.compress/decompress` intern auf — keine doppelte Pipeline.
- **`useGameActions.ts`** Action-Set: wandert progressive in Slice-Actions, aber alte Aufrufer (`useGameActions().applyTycoonMutation(...)`) bleiben via Shim funktional.
- **`logic/turn/postProcessor.ts`** + Sim-Engine: keine React-Components, lesen direkt aus `getState()` — nur API-Compat-Shim nötig (`getState()` returnt heutige State-Shape).

## Stopping Conditions

- [ ] Phase 1: alle 11 isolated stores migrated, alle saves identisch byte-für-byte
- [ ] Phase 2: gzipIdbAdapter roundtrip-tested mit production-Save
- [ ] Phase 3: uiSlice live, kein UI-Regression in 1-Wochen-QA-Run
- [ ] Phase 4 (per Slice): Slice live, alle useGame-Consumer agnostic, deep-equal-Snapshot vs pre-migration-State
- [ ] Phase 5: GameContext nur noch Lifecycle/Refs, kein State
- [ ] Acceptance-Test: lädt 12-month-Save, simuliert 1 Season, alle Lederger-Numbers + Standings identisch vs Pre-Migration-Snapshot

## Risiken & Gegenmaßnahmen

- **Save-Korruption** durch falschen Adapter → Phase 2 dedicated Adapter-Test mit 5 verschiedenen Saves vor Production-Use
- **Performance-Regression** durch Full-State-Subscriptions via Shim → akzeptabel während Migration, Selector-Migration in Phase 6 fixt's
- **Verlust handgerollter Optimierungen** (z.B. saveScopedMapStore custom buckets) → Adapter testet bucket-Layout bit-genau

## Memory & Documentation

- Update `CLAUDE.md` mit Zustand-Pattern + Save-Adapter-Hinweis nach Phase 2
- Update `MEMORY.md` Index mit `project_zustand_migration.md` (status-tracker per Phase)
- Touch `TODO.md` per Phase-Completion
