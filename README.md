# NBA Commish Sim

Tiefgehende Basketball-Management-Simulation mit zwei Rollen und zwei Liga-Quellen:

- **Commissioner**: gesamte Liga kontrollieren
- **GM**: ein Team managen
- **Fictional League**: vollständig generierte Liga, offline, keine externen Downloads
- **Modded League**: Community-gepflegte Realwelt-Daten via externe Quellen

Tech-Stack: React + TypeScript + Vite + Tailwind. Persistenz über `idb-keyval` in IndexedDB. LLM-Narrative über Gemini.

## Quickstart

```bash
npm install
echo "GEMINI_API_KEY=your_key" > .env.local
npm run dev
```

`npm run lint` führt `tsc --noEmit` aus, `npm run build` produziert das Vite-Bundle.

## Game Modes

| Modus | Kontrolle | Doku |
|-------|-----------|------|
| **Commissioner** | Gesamte Liga — Regeln, Trades, Sperren, Ökonomie, Narrative | [`COMMISSIONER_MODE_README.md`](./COMMISSIONER_MODE_README.md) |
| **GM** | Ein Team — Roster, Trades, FA, Draft, Extensions | [`GM_MODE_README.md`](./GM_MODE_README.md) |

## League Types

| Liga-Typ | Quelle | Eigenschaften |
|----------|--------|---------------|
| **Fictional** | lokal generiert | 30 fiktive Teams, generierte Spieler/Staff/Refs, offline, keine Auslandsligen |
| **Modded** | externe Community-Daten | reale Teams, reale Spieler, reale Verträge, externe Bilder/Bios/Leagues |

**Wichtiger Unterschied:** Fictional-Setup erzeugt seine Liga vollständig lokal. Modded-Setup lädt Roster, Historie und Zusatzdaten aus externen Quellen.

**Euro-Isolated worktree recovery (May 15–16, 2026):** Euro mode is being repaired directly in the main worktree. Current in-flight wiring seeds setup tier/budget, owner, six-role staff, sponsor slots, `INIT_EURO_CAREER` save state, LOAD_GAME healing for older Euro GM saves, generated staff free-agent pools for Front Office hiring, year-end owner patience/cash-injection mechanics, Euro Tasks transfer-market gating, sponsor/endorsement duplicate protection, direct Euro FA signings without NBA cap/MLE blocks, generated coach bio display, and FIBA 200-minute gameplan budgets. See `TODO.md` and `docs/superpowers/plans/2026-05-14-euro-setup-hybrid.md` before continuing Euro setup work.

## Architektur in einer Minute

Single in-memory `GameState` (`src/types.ts`). Kein Backend. Save/Load läuft gzipped durch `SaveManager.ts` in IndexedDB unter `keyval-store`.

```
state.players[]      ALLE Spieler (NBA + Auslandsligen + Retired + Prospects)
state.teams[]        30 NBA-Teams
state.nonNBATeams[]  Auslandsligen (Euroleague, PBA, G-League, …)
state.schedule[]     Aktueller Saisonspielplan
state.boxScores[]    Spielergebnisse mit Per-Player-Stats
state.leagueStats    Cap, Regeln, Jahr, Wirtschafts-Settings
state.allStar        All-Star-Weekend (cleared bei Rollover)
state.playoffs       Playoff-Bracket (cleared bei Rollover)
state.history[]      Transaction-Log
state.news[]         News-Feed
```

**Goldene Regel:** Spieler verlinken auf Teams via `player.tid`. `team.players` existiert nicht.

### Sim-Engine

| Lücke | Engine | UI |
|-------|--------|----|
| 1 Tag | `processTurn` → `runSimulation` | Game-Result-Modal |
| 2–30 Tage | `processTurn` → `runSimulation` (Batch) | Game-Result-Modal |
| 30+ Tage | `runLazySim` (iterativ, Tag für Tag) | Progress-Overlay |

Beide Pfade nutzen `runLazySim` als gemeinsame Engine. **Kalenderevent hinzufügen:** Eintrag in `buildAutoResolveEvents()` in `lazySimRunner.ts`.

### Simulator-Modi

Seit den jüngsten Simulator-Commits existieren zwei Sim-Pfade:

- **Fast** — schneller Season-/Bulk-Sim über StatGenerator
- **Realistic** — possession-by-possession mit Rotation Manager, Live-Minutes-Flow und erweitertem Box-Score-Aufbau

Guide: [`docs/simulator-guide.md`](./docs/simulator-guide.md)

### Offseason-Orchestrator

`src/services/offseason/offseasonState.ts` und `offseasonPlan.ts` sind seit Session 52/53 Single Source of Truth für Phasen (`inSeason | preDraft | draftDay | postDraft | moratorium | birdRights | openFA | preCamp`). Alle Dispatches loggen unter dem Tag `[OSPLAN]` — DevTools danach filtern, dann sieht man jede Offseason-Entscheidung mit Phase + Datum + Reason in einem Stream.

Die GM-Mode-Offseason läuft seit Session 53 als 2K-style Checklist (`OffseasonAufgaben.tsx`) mit 8 Aufgaben statt Tag-für-Tag-Klicks.

## Rating-Skalen (KRITISCH)

Zwei Skalen existieren parallel. Verwechseln zerschießt alles.

| Skala | Range | Wo | Beispiel |
|-------|-------|----|----|
| **BBGM raw** | 35–82 praktisch | `player.overallRating`, Retirement, Progression | LeBron ~78, Bench ~50 |
| **K2 (2K)** | 66–99 | Anzeige, Salary-Tiers, External Routing | LeBron ~97, Bench ~75 |

Konvertierung: `K2 = 0.88 * BBGM + 31` (`convertTo2KRating(ovr, hgt, tp)`).

**Faustregel:** Jede Schwelle `>= 85` BBGM ist toter Code. Nutze 65–72 für Star, 55–64 für Starter. Skala dokumentieren.

## Häufige Stolperfallen

### Players & Teams
- `state.players` ist die einzige Spielerquelle. `team.players` existiert nicht.
- `tid === -1` = Free Agent · `tid === -2` = Draft Prospect · `tid >= 100` = Auslandsliga.
- Rebounds: immer `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`.
- Aktuelle Saison-Stats: `s.season === year && !s.playoffs`, dann reduce auf höchstes `gp` (handhabt Mid-Season-Trades).
- `NBATeam.name` enthält bereits die Stadt ("Oklahoma City Thunder"). Nicht `region + name` konkatenieren.

### Contracts & Cap
- `contract.amount` in **BBGM-Tausendern** (3200 = $3.2M). Salary-Utils nutzen USD.
- `minContractStaticAmount` in **Millionen** (1.273 = $1.273M).
- `EXTERNAL_SALARY_SCALE` in `constants.ts` cappt NBA-Offers auf ~3× Auslandspeak.
- `getCapThresholds()` und `getMLEAvailability()` in `salaryUtils.ts` / `AIFreeAgentHandler.ts`.

### Saisonfluss
- Rollover feuert Jun 30 (`shouldFireRollover`) — läuft sowohl in `simulationHandler` als auch `lazySimRunner`. Seit Session 5 routen beide durch `getOffseasonDayPlan` statt parallel zu rechnen.
- Rollover MUSS `schedule: []` zurückgeben.
- `allStar` und `playoffs` werden bei Rollover gecleared. Exhibition-Box-Scores (negative Team-IDs) gepruned.
- Optionen Jun 29 → FA-Signings Jul 1+ → External Routing Oct 1.
- `draftComplete` boolean — wird bei Rollover gecleared, von `DraftSimulatorView` gesetzt.

### Auslandsligen
- TID-Offsets: Euroleague +1000 · PBA +2000 · WNBA +3000 · B-League +4000 · Endesa +5000 · G-League +6000 · CBA +7000 · NBL +8000.
- Voller Integrationspfad in [`EXTERNAL_ROSTERS.md`](./EXTERNAL_ROSTERS.md).
- **Fictional-League-Ausnahme:** Fictional-Saves sind derzeit NBA-only. `state.nonNBATeams[]` bleibt dort leer.

### UI
- All-Star-Teams nutzen negative IDs (-1/-2 East/West, -3/-4 Rising Stars, -5/-6 Celebrity).
- `resolveTeam(tid)` handhabt NBA + nonNBA + negative IDs.
- Portrait-Kette: `player.imgURL` → NBA-CDN → Initialen. Externe Spieler überspringen das CDN.
- Bild-Cache: IndexedDB-Blob-Cache, in Settings → Performance toggle-bar.

### Persistenz — Save-Scoped Storage (KRITISCH)

Alles, was in `localStorage` oder `IndexedDB` außerhalb von `GameState` geschrieben wird, MUSS mit `state.saveId` skopt sein, sonst leakt es zwischen Saves.

- `state.saveId` wird in `initialization.ts` als `nba_commish_<ts>_<rand>` gemintet, swap bei `LOAD_GAME` / `UPDATE_SAVE_ID`.
- `GameContext` beobachtet `state.saveId` und ruft `setActiveSaveId()` auf dem Gameplan-Store. Dieses Muster für jeden neuen Per-Save-Side-Store nachahmen.
- Reference: `src/store/gameplanStore.ts` keyt localStorage als `nba-commish-gameplans::<saveId>`. Niemals einen einzelnen globalen Key für editier­bare Per-Save-Settings — so leakten die Gameplan-Minutes vor dem Fix.

## Save-Format (für Debugging)

Saves sind **gzipped**. Roh gelesen sehen sie aus wie `{__gz: true, data: ArrayBuffer}` — kein `players` Field. `DecompressionStream('gzip')` ist Pflicht. Kanonische Helpers in `src/services/SaveManager.ts`. Audit-Pattern in `scripts/audit-economy.js`.

Standard-DevTools-Snippet zum Inspizieren des neuesten Saves: siehe [`CLAUDE.md`](./CLAUDE.md) → "Standard snippet — load newest save and inspect a player".

## File Structure

```
src/
  components/
    actions/          Commissioner-Action-UI
    central/view/     Hauptansichten (PlayerBio, TradeFinder, …)
    commissioner/     Dashboard, Rules, Viewership
    draft/            DraftSimulatorView
    layout/           MainContent.tsx (Tab-Routing)
    modals/           TradeMachineModal, SettingsModal, …
    offseason/        OffseasonAufgaben.tsx (2K-style Checklist)
    playoffs/         PlayoffView, BracketLayout
    schedule/         ScheduleView, AllStarDayView
    sidebar/          NavigationMenu
    shared/           PlayerPortrait, MyFace, reusable UI
    team-stats/       TeamStatsView
    training/         TrainingCenterView, TrainingDayView
  services/
    offseason/        offseasonState, offseasonPlan ([OSPLAN] Single Source of Truth)
    simulation/       GameSim-Engine, StatGenerator, knobs
    logic/            seasonRollover, lazySimRunner, autoResolvers
    playerDevelopment/ ProgressionEngine, retirementChecker, breakouts
    allStar/          All-Star-Weekend-Orchestrierung + Throne
    trade/            tradeValueEngine, inboundProposalGenerator, cbaTradeRules
    llm/              Gemini (prompts, generators)
    social/           Social-Media-Posts
  store/
    GameContext.tsx   State-Store, Action-Dispatch, LOAD_GAME
    gameplanStore.ts  Save-scoped Gameplan-Persistenz
    logic/            gameLogic, initialization, actionProcessor
  types.ts            Alle TypeScript-Interfaces
  constants.ts        Liga-Konstanten, Salary-Skalen, External-League-Config
  utils/              dateUtils, salaryUtils, helpers
```

## Doku-Index

| Dokument | Zweck |
|----------|-------|
| [`CLAUDE.md`](./CLAUDE.md) | KI-Agent-Brief: Sprache, Pipeline-Reihenfolge, Save-Format, Debug-Snippet |
| [`COMMISSIONER_MODE_README.md`](./COMMISSIONER_MODE_README.md) | Commissioner-Features — Actions, LLM, Ökonomie, Club-Debuffs |
| [`GM_MODE_README.md`](./GM_MODE_README.md) | GM-Mode-Implementation — Phasen, File-Changes, Pitfalls |
| [`EXTERNAL_ROSTERS.md`](./EXTERNAL_ROSTERS.md) | Auslandsliga-Integration — TID-Offsets, Scaling, Checkliste |
| [`LEAGUE_RULES_README.md`](./LEAGUE_RULES_README.md) | Commissioner-Regeln in die Sim-Engine wiren |
| [`docs/simulator-guide.md`](./docs/simulator-guide.md) | `Realistic` vs `Fast` erklärt: Verhalten, Tradeoffs, Empfehlungen |
| [`AI_AND_ECONOMY_PLAN.md`](./AI_AND_ECONOMY_PLAN.md) | AI-Trade-Engine + Wirtschafts-Design |
| [`TODO.md`](./TODO.md) | Aktive Bugs, verify-on-new-save, Feature-Backlog |
| [`NEW_FEATURES.md`](./NEW_FEATURES.md) | Feature-Ideen und Wunschliste |
| [`CHANGELOG.md`](./CHANGELOG.md) | Sessionweise Bugfixes und Architecture-Discoveries |

## Aktueller Übergabestand

- Die letzten **committeten** Änderungen vom `2026-05-08` betreffen fast nur den Simulator (`Realistic`-Pfad, Rotation, Kalibrierung).
- Der aktuelle Worktree enthält zusätzlich größere **uncommittete** Änderungen für Fictional League, Bird Rights, Doku und mehrere UI-Flächen.
- Offene Follow-ups und Cleanup-Punkte stehen gesammelt in [`TODO.md`](./TODO.md).

## Investigation Findings (nicht offensichtlich)

Vor dem Anfassen dieser Bereiche lesen:

- `historicalAwards` hat **zwei Schemas**: BBGM (kein `type`-Field) und flat (`type: 'MVP'`). Unterscheiden via `!!a.type`.
- `state.staff.gms` ist **per Team-Name** gekeyt, nicht per tid.
- `playoffRoundsWon` wird vom Sim **nicht** auto-aktualisiert — explizit in `lazySimRunner` setzen.
- `extractNbaId(imgURL, name)` — Name als 2. Argument für `NAME_TO_ID`-Lookup.
- Retired Players: `tid === -1`, voller `stats[]` intakt. Career-Team = max GP nach tid.
- `GameResult` lebt in **zwei** Files: `src/types.ts` UND `src/services/simulation/types.ts`. Beide updaten.
- `playerDNPs` speichert DNP-Reason zur Sim-Zeit — vor dem aktuellen `player.injury`-State bevorzugen.
