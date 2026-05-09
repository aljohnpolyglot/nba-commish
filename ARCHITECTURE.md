# Architecture: NBA Commish Sim

## System Overview

Browser-only React + TypeScript + Vite SPA. Single in-memory `GameState` (`src/types.ts`); kein Server, kein Backend. Persistenz läuft gzipped durch `SaveManager.ts` in IndexedDB unter `keyval-store`. Zwei Spielmodi (Commissioner / GM) teilen sich denselben State + Sim-Engine — der Modus ist ein Flag (`gameMode`) plus eine `userTeamId` (`-999` für Commissioner-Sentinel). Zusätzlich gibt es zwei Liga-Typen: `leagueType: 'modded' | 'fictional'`. LLM-Narrative über Gemini ist optional und im Code als Side-Effect-Layer modelliert (Sim läuft auch ohne API-Key).

## Codemap

```
src/
  components/         React-UI
    actions/          Commissioner-Action-UI (suspensionen, force-trades, etc.)
    central/view/     Hauptansichten (PlayerBio, TradeFinder, TradeProposals, …)
    central/view/Coaching/  CoachingHubView — Top-Level Coaching-Surface (Sidebar)
    commissioner/     Dashboard, Rules-Editor (useRulesState), Viewership
    draft/            DraftSimulatorView + DraftScoutingView
    layout/           MainContent.tsx (Tab-Routing)
    modals/           TradeMachineModal, SettingsModal, BoxScoreModal, …
    offseason/        OffseasonAufgaben.tsx (2K-Aufgaben-Sidebar + Phase-Badge)
    playoffs/         PlayoffView, BracketLayout
    schedule/         ScheduleView, AllStarDayView, DayView
    sidebar/          NavigationMenu
    shared/           PlayerPortrait, MyFace (faces.js wrapper), reusable UI
    team-stats/       TeamStatsView
    training/         TrainingCenterView, TrainingDayView, TrainingDayOverlay
    allstar/          AllStarView, ThroneContestView, contest UIs
  services/
    offseason/        offseasonState, offseasonPlan ([OSPLAN] SSoT)
    simulation/       GameSim-Engine, StatGenerator, knobs
    logic/            seasonRollover, lazySimRunner, autoResolvers, gameLogic
    playerDevelopment/ ProgressionEngine, retirementChecker, breakouts
    allStar/          AllStarWeekendOrchestrator, throneOrchestrator,
                      AllStar*Sim (Dunk/3PT/Throne/HORSE/Shooting/Skills/1v1)
    trade/            tradeValueEngine, inboundProposalGenerator, cbaTradeRules
    llm/              Gemini prompts + generators
    social/           Social-Media-Posts (Charania-Tweets, etc.)
    staff/            GM attributes shared helpers (gmAttributes.ts)
    AIFreeAgentHandler.ts  5-Pass-Signing-System
    AITradeHandler.ts      AI-AI trade evaluation + execution
    SaveManager.ts         gzip + IndexedDB I/O
    fictionalLeagueGenerator.ts  lokale Fictional-League-Generierung
    fictionalStaffGenerator.ts   lokale Fictional-Staff/Ref-Generierung
    externalSigningRouter.ts  Auslandsligen-Routing am 1. Oktober
    faMarketTicker.ts      Daily FA-Bid-Markt
    rosterService.ts       Roster + external-team Sync
    TeamTraining/          Team-Training-Engine (Familiarity, Defensive Aura)
    realPlayerDataFetcher.ts  Photos + ZenGM bio fetch
    bioCache.ts            Player-Image + Bio Cache
    imageCache.ts          IndexedDB blob cache for portraits
  store/
    GameContext.tsx        State-Store, Action-Dispatch, LOAD_GAME, Reducer
    gameplanStore.ts       Save-scoped Gameplan-Persistenz
    defenseGameplanStore.ts     Team-Defense-Base (Phase 1: UI+Persist; Sim TBD)
    defenderDetailStore.ts      Per-Defender-Baseline-Coverage (Phase 1)
    rivalGameplanStore.ts       Per-Opp-Targeting + auto-reconcile (Phase 1)
    matchupAssignmentsStore.ts  Lockdown/Hide-Picks (Phase 1)
    logic/                 gameLogic, initialization, actionProcessor,
                           statUpdater, simulationHandler, playerActions
  utils/                   dateUtils, salaryUtils, ratingUtils, helpers
  hooks/                   useExpiringResignGate, useRosterComplianceGate, …
  types.ts                 Alle TypeScript-Interfaces (GameState, NBAPlayer, etc.)
  constants.ts             Liga-Konstanten, EXTERNAL_SALARY_SCALE, TID-Offsets
scripts/                   Browser-DevTools-Audit-Scripts (auto-load newest save)
```

Subsystem-Ownership:
- **State:** `store/GameContext.tsx` ist die einzige Stelle, die `GameState` mutiert (Reducer-Pattern). Alle anderen Files berechnen Patches, dispatchen via `dispatch({type, payload})`.
- **Sim:** `services/logic/simulationHandler.ts` orchestriert pro Tag; ruft `services/simulation/GameSim` für Spiele und `services/logic/lazySimRunner.ts` für Multi-Day-Skips.
- **Offseason:** `services/offseason/offseasonPlan.ts` ist die Single-Source-of-Truth ab Session 5 — alle Dispatches lesen `getOffseasonDayPlan(state).actions.X === 'fire'` statt parallel zu rechnen.

## Main Flows

### Day Tick (regulärer Saisonalltag)
1. User klickt PlayButton → `processTurn` Action.
2. `simulationHandler` läuft: liest Date, schaut welche Calendar-Events fällig sind.
3. Für jeden Game-Day: `GameSim.runGame` pro geplantem Spiel → `boxScore` Push, `player.stats` Update, Mood-Drift.
4. Reducer schreibt neuen State; UI re-rendered.
5. Ein Tag = `state.date` + 1.

### Multi-Day-Skip (>30 Tage)
1. User klickt "Sim to Trade Deadline" o.ä.
2. `runLazySim` iteriert Tag für Tag, ruft denselben Code wie Day Tick aber UI-frei.
3. `buildAutoResolveEvents` setzt Hooks für Calendar-Boundaries (Lottery, Rollover, Throne-Phasen, etc.).
4. Progress-Overlay zeigt Day-Counter; bei Critical-Event (Trade auf User-Team, Injury auf Star) `stopBefore: true` Pause.

### Start-Flow nach Liga-Typ
1. Setup schreibt `leagueType` in `pendingStartPayload`.
2. `handleStartGame()` brancht:
3. `modded` → `getRosterData()` + Historical Awards + External-Roster-Fetches.
4. `fictional` → `generateFictionalLeague()` + `generateFictionalStaff()` + `generateFictionalReferees()`, keine External-Roster-Fetches.
5. Der Fictional-Pfad nutzt einen Seed, damit Setup-Preview und gestarteter Save dieselbe generierte Liga verwenden.

### Free Agency (Multi-Pass)
`AIFreeAgentHandler.runAIFreeAgencyRound` läuft tagsgenau:
1. **Pass 1** Best-Fit-Signings (Cap + MLE).
2. **Pass 2** Two-Way-Contracts (≤60 BBGM OVR).
3. **Pass 3** Non-Guaranteed Training-Camp (Jul 1 – Oct 21).
4. **Pass 4** Min-Roster-Enforcement (Fill auf 15-Mann).
5. **Pass 5** Floor-Enforcement (nur bei offenen Roster-Slots — siehe Limit).

Reihenfolge ist nicht verhandelbar (siehe `CLAUDE.md`).

### Trade
1. UI: TradeMachineModal sammelt Spieler + Picks + Cash.
2. `cbaTradeRules.checkIncoming/checkOutgoing` validiert pro Team (Cap-Room, Apron, Salary-Match).
3. `TradeSummaryModal` zeigt Validity-State + GM-vs-Commissioner-Override-Buttons.
4. Bestätigung dispatcht `EXECUTE_TRADE` → `actionProcessor` swappt `player.tid`, transferiert `draftPicks`, schreibt `history`.

### Offseason GM-Aufgaben (Session 53)
1. Calendar erreicht Jun 15 → Auto-Init useEffect minted `state.offseasonChecklist`.
2. `OffseasonAufgabenSidebar` rendert 8 Rows; jede mit Enter / Skip Button.
3. User klickt Row → Modal-Stack oder eingebettete View.
4. Engine-Signals (z.B. `draftComplete = true`) auto-marken Rows done via `OFFSEASON_COMPLETE_PHASE`.
5. FA-Tag-Counter: 1/13 → 13/13, jeder Step = ~5 Tage `SIMULATE_TO_DATE` mit `stopBefore: true`.
6. "Auto-Resolve all" → `OFFSEASON_AUTO_RESOLVE_ALL` → `runLazySim` mit `assistantGM=true` bis Opening Night.

## Architectural Invariants

1. **State-Mutation läuft nur durch `GameContext`-Reducer.** Direkter Mutate von `state.players[i].xyz` außerhalb ist verboten.
2. **`team.players` existiert nicht.** Spieler-Team-Link ist immer `player.tid`.
3. **`state.players` ist die einzige Spielerquelle.** Kein parallel array für Retired / Prospects / External — alles dort.
4. **Save-Scoped Persistenz.** Side-Stores (Gameplan, Rotation-Presets, Image-Cache) MÜSSEN auf `state.saveId` skopt sein.
5. **Pipeline-Reihenfolge in `runAIFreeAgencyRound` ist fix.** Pass 2 vor Pass 4, sonst hungert der Two-Way-Pool aus.
6. **Rollover MUSS `schedule: []` zurückgeben.** Sonst leaken alte Spiele in die neue Saison.
7. **Family-Ties-Protection in jedem Trim/Cut.** `hasFamilyOnRoster` Check bevor `canCut` true wird.
8. **Offseason-Dispatch läuft durch `getOffseasonDayPlan`.** Inline-Date-Checks für Rollover/FA-Pass/Bird-Rights sind seit Session 5 verboten.
9. **Rating-Skalen nicht verwechseln.** BBGM raw (35–82) vs K2 (66–99); jede Schwelle ≥85 BBGM ist tot.
10. **Fictional ist derzeit NBA-only.** Wenn `leagueType === 'fictional'`, bleiben `nonNBATeams` und alle externen League-Fetches leer; Code darf dort keine Auslandsliga-Daten voraussetzen.

## Boundaries & External Dependencies

| Boundary | Detail |
|----------|--------|
| **IndexedDB (`keyval-store`)** | Save-Persistenz via `idb-keyval`. Saves sind gzipped — `{__gz, data: ArrayBuffer}` Wrapper. |
| **Gemini API** | LLM-Generation. Optional; alle Generators no-op-en wenn Key fehlt. |
| **NBA-CDN (`cdn.nba.com`)** | Player-Photos. Fallback nach `player.imgURL` (BBGM gist), dann faces.js, dann Initialen. |
| **Public Gists (ZenGM, custom)** | Real-Player-Data, Bios, Awards, External-League-Rosters, Names, Country-Pools, College-Pools, Contracts. Alle gefetcht zur Init oder per Demand. |
| **localStorage** | Save-scoped Side-Stores nur (Gameplan, Settings). Niemals globaler Key für editierbare Per-Save-Settings. |

Fictional-League-Start ist die Ausnahme: dort wird die External-Data-Boundary beim Init bewusst vollständig umgangen.

Alle Daten-Boundaries validieren Schema vor Cache-Write — siehe `nameDataFetcher.ts` für das Pattern.

## Cross-Cutting Concerns

### Configuration
- `constants.ts` — Liga-Konstanten, Salary-Skalen, External-League-TIDs.
- `state.leagueStats` — Editierbare Liga-Settings (Cap, Regeln, MLE-Tier-Modes, etc.). Persistiert im Save.
- `useRulesState.ts` — Single-Source-of-Truth für Commissioner-Regel-Editor; Save-Flow-Audit (Session 27) deckt jedes UI-Field auf Persist-Lücken ab.
- `.env.local` — `GEMINI_API_KEY` für LLM-Calls.

### Logging & Drift-Tracking
`[OSPLAN]`-Tag in DevTools-Konsole filtern → vollständige Offseason-Dispatch-Timeline (Plan-Computation, Fire, Drift-Warning, Shadow-Disagreement). Eingeführt Session 5.

### Persistence
`SaveManager.ts` ist die kanonische Ein-/Ausgabestelle. Audit-Scripts in `scripts/` zeigen das Decompress-Pattern.

### Error Handling
Trust internal code; validate at boundaries. Kein try/catch um interne Function-Calls. Render-Errors fängt React-Boundary; Sim-Errors fallen durch und sind Bugs.

### Image Caching
`services/imageCache.ts` pre-downloaded alle Portraits zur Init in IndexedDB-Blob-Cache. In Settings → Performance toggle-bar (Heavy-User können es deaktivieren).

## How To Extend The System Safely

### Neuen Calendar-Event hinzufügen
1. Date-Helper in `utils/dateUtils.ts` ergänzen.
2. Event-Hook in `buildAutoResolveEvents()` (`services/logic/lazySimRunner.ts`) registrieren.
3. Wenn Offseason-relevant: Plan-Action in `services/offseason/offseasonPlan.ts` ergänzen + `[OSPLAN]`-Trace.
4. Auto-News-Template in `buildAutoNews` falls User-sichtbar.

### Neue Auslandsliga hinzufügen
Voller Pfad in `EXTERNAL_ROSTERS.md`. Stichpunkte: TID-Offset in `constants.ts`, Salary-Mult, Bio-Gist-URL, Ratings-Gist-URL, Preseason-Schedule-Block in `autoResolvers.ts`.

### Neuer All-Star-Satellite-Event
1. Sim-Service unter `services/allStar/AllStar*Sim.ts`.
2. Result-Type auf `AllStarState`.
3. Toggle + Settings in `commissioner/rules/view/all-star/AllStarEventsSection.tsx`.
4. Gating in `AllStarWeekendOrchestrator.simulateWeekend`.
5. Per-Event-UI-Pass: DayView-Card + News-Template + Awards-Write-Back + History-Spalte + Contestants-Announce-Date (siehe `NEW_FEATURES.md` Satellite-Checkliste).

### Neue Per-Save-Persistenz
1. Store-File mit `setActiveSaveId()` Pattern (siehe `gameplanStore.ts`).
2. localStorage-Key als `<feature-name>::<saveId>`.
3. `GameContext` rehydrate-Hook auf `state.saveId` Watch.

### Neuer Action-Type
1. Type in `types.ts` `ActionType` ergänzen.
2. Reducer-Case in `GameContext.tsx`.
3. Wenn complex: Helper in `store/logic/actionProcessor.ts` oder `playerActions.ts`.

## Open Questions

- Soll `leagueType === 'fictional'` langfristig ein eigenes External-/Feeder-League-Subsystem bekommen oder architektonisch bewusst leer bleiben?
- Soll `state.phase` zum gespeicherten Field promoted werden, jetzt wo der Plan Single-SoT ist? (Bricht Save-Forward-Compat — worth?)
- Wie viel `[OSPLAN]`-Coverage braucht `autoResolvers` (Lottery/Draft/HOF)? Aktuell loggen sie nicht in die Unified Timeline.
- Pass-5-Shortfall-Distribution: NBA-genau (Bonus-Pools je Player nach FA-Tier) oder simpler Spread?
- Hard-Cap-Konzept (CBA #9): per-team Flag (`hardCapForSeason`) oder per-action computed?
- Lohnt sich ein In-App-Debug-Panel für `[OSPLAN]`-Drift, oder reicht DevTools-Filter?
