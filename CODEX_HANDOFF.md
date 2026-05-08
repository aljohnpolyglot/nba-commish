# Codex Handoff — NBA Commish Sim

> Stichdatum: 2026-05-07 (post-Session-55-Refactor-Pass). Ziel-Leser: ein Codex-Agent (oder neuer Claude-Agent), der das Repo zum ersten Mal anpackt. Basis-Lesefläche bevor irgendein Code gefasst wird.
>
> Sprache: Deutsch (siehe `CLAUDE.md`).

---

## 0. Erst lesen

| Datei | Warum |
|-------|-------|
| `CLAUDE.md` | Operationale Anweisungen, Save-Format, Debug-Snippet, Don't-Liste |
| `AGENTS.md` | Repo-Guidelines (Build/Lint/Test, Code-Style, Persistence-Constraint) |
| `PRODUCT.md` | Aktuelle nutzer-sichtbare Features + Limits |
| `ROADMAP.md` | Wo hingelaufen wird, Non-Priorities |
| `ARCHITECTURE.md` | Codemap, 9 Architectural Invariants, Boundaries, Extend-Playbook |
| `TODO.md` | Aktueller Backlog (Bug-Pickup-ready) |
| `CHANGELOG.md` | Sessions 1–55 — wo wir herkommen |

`CLAUDE.md` zuerst lesen — enthält die Save-State-Debug-Protokoll-Pflicht (STOP and ask before reading code for save-state bugs).

---

## 1. Was ist das

Browser-only React + TypeScript + Vite SPA. Tiefen-NBA-Sim mit zwei Modi: **Commissioner** (alle 30 Teams) und **GM** (1 Team). Single in-memory `GameState` (`src/types.ts`), kein Backend. Persistenz **gzipped** in IndexedDB unter `keyval-store`. LLM-Narrative über Gemini ist optional.

**Reife: Beta.** Kern-Loops (Sim, Trades, Draft, FA, All-Star, Playoffs, Rollover) laufen. Multi-Saison ist seit Sessions 21+ stabil (vorher war Saison 2 unspielbar wegen fehlendem Lazy-Sim-Rollover). Sessions 52/53 brachten den Offseason-Orchestrator, Sessions 54/55 das Coaching-Depth-Layer + Trade/Signings-Hardening.

---

## 2. Game Core Mechanics

### 2.1 State-Modell

Alles in `state` (kein Backend, kein Redux-Devtools). Nur `GameContext`-Reducer mutiert State. Direkter Mutate von `state.players[i].xyz` außerhalb ist verboten.

```
state.players[]      ALLE Spieler (NBA + Auslandsligen + Retired + Prospects)
state.teams[]        30 NBA-Teams
state.nonNBATeams[]  Auslandsligen (Euroleague, PBA, B-League, …)
state.schedule[]     Aktueller Saisonspielplan
state.boxScores[]    Spielergebnisse mit Per-Player-Stats
state.leagueStats    Cap, Regeln, Jahr (BBGM-Konvention: season-end-year), Wirtschafts-Settings
state.allStar        All-Star-Weekend-State (cleared bei Rollover)
state.playoffs       Playoff-Bracket (cleared bei Rollover)
state.history[]      Transaction-Log
state.news[]         News-Feed
state.tradeProposals[]  Inbound-Proposals (mit cbaValid-Flag seit S55)
state.faBidding      Bid-Markets
state.offseasonChecklist  Tasks-Sidebar (S53)
state.saveId         Per-Save-Scope für lokale Stores (NIEMALS leaken!)
```

**Goldene Regel:** Spieler-Team-Link ist `player.tid`. **`team.players` existiert nicht.** Roster-Filter immer `state.players.filter(p => p.tid === teamId && !p.twoWay)`.

### 2.2 Sim-Engine

Drei Pfade, alle teilen die gleiche Engine:

| Lücke | Engine | UI |
|-------|--------|----|
| 1 Tag | `processTurn` → `runSimulation` | Game-Result-Modal |
| 2–30 Tage | `processTurn` (Batch) | Game-Result-Modal |
| 30+ Tage | `runLazySim` (iterativ) | Progress-Overlay |

**Calendar-Event hinzufügen:** Eintrag in `buildAutoResolveEvents()` in `src/services/logic/lazySimRunner.ts`. Wenn Offseason-relevant: zusätzlich Plan-Action in `services/offseason/offseasonPlan.ts` ergänzen + `[OSPLAN]`-Trace.

### 2.3 Calendar-Phasen (KRITISCH)

`getOffseasonState(date, leagueStats, schedule)` aus `src/services/offseason/offseasonState.ts` ist die **Single Source of Truth** für die aktuelle Phase:

| Phase | Window | Was läuft |
|-------|--------|-----------|
| `inSeason` | Oct 22 – Jun 14 (incl. playoffs bis Bracket-complete) | Reguläre Saison + Playoffs |
| `preDraft` | post-Finals → Draft-1 | Lottery-Window, kein FA |
| `draftDay` | Draft (Jun ~26) | NBA Draft (Lottery + Picks 1–60) |
| `postDraft` | post-Draft → Jun 30 | Rookie-Contracts werden seeded |
| `moratorium` | Jul 1 – Jul 6 | FA-Talks aber keine Signings (Real-NBA-Moratorium) |
| `birdRights` | Jul 7 (1 Tag) | Bird-Rights-Re-signs öffnen |
| `openFA` | Jul 8 – mid-Sept | FA-Markt aktiv, Bid-Tickets resolven |
| `preCamp` | mid-Sept – Oct 21 | Training-Camp-Roster (21-Mann), External-Routing 1. Oktober |

**Window-Helper:** `offseasonWindowStart = Jun 15`, `offseasonWindowEnd = Oct 21`. Außerhalb = immer `inSeason`. Innerhalb = Phase-Cascade (siehe Z.137-174 in `offseasonState.ts`).

`getOffseasonDayPlan(state)` aus `offseasonPlan.ts` returnt was-soll-heute-feuern (`rollover` / `tickFAMarkets` / `runAIFAPass` / `runBirdRightsPass`). Alle Dispatches in `simulationHandler` + `lazySimRunner` lesen diesen Plan **anstatt** parallel zu rechnen. Convention: alle relevanten Stellen loggen unter Tag `[OSPLAN]` — DevTools danach filtern um die volle Offseason-Dispatch-Timeline zu sehen.

**Anti-Pattern:** Inline-Date-Checks wie `compareGameDates(date, getCurrentOffseasonEffectiveFAStart(...))` als Phase-Test. Funktion returnt nach Oct 1 die NEXT-year FA → führt dazu, dass `isPreFA` das ganze Jahr `true` ist (Session 55 fix). Statt dessen: `getOffseasonState(...).phase`.

### 2.4 5-Pass FA-Pipeline (FIX-REIHENFOLGE!)

`AIFreeAgentHandler.runAIFreeAgencyRound` läuft tagsgenau in der Offseason:

1. **Pass 1** Best-Fit-Signings (Cap + MLE für Top-FAs)
2. **Pass 2** Two-Way-Contracts (≤60 BBGM OVR fringe FAs) — **MUSS vor Pass 4 laufen**
3. **Pass 3** Non-Guaranteed Training-Camp (Jul 1 – Oct 21)
4. **Pass 4** Min-Roster-Enforcement (Fill auf 15-Mann, last-resort min-deal). Sortiert by salary ASC → würde Pass 2 vakuumieren wenn vorher
5. **Pass 5** Floor-Enforcement (nur bei offenen Roster-Slots)

**Niemals umsortieren.** Pass 2 vor Pass 4 ist nicht-verhandelbar. Wenn dein Refactor diese Reihenfolge auch nur scheinbar ändert, nicht machen.

### 2.5 FA-Markt-Mechaniken (Bid-Markets)

`faMarketTicker.tickFAMarkets` läuft täglich in `openFA`-Phase:

1. **1a** Cap-Re-Validation: jeder bid wird gegen aktuellen Cap gecheckt; falls invalid → withdrawn.
2. **1b** Counter-Bids für User-Markets ohne AI-Bidder.
3. **1c** LOYAL-Markets schließen früh wenn nur non-prior-team Bids (LOYAL-Trait blocks Wechsel).
4. **2** Sign-Resolution: winner-bid evaluiert; RFA-Branch öffnet Match-Window für prior-Team.
5. **3** Re-open: declined bids öffnen Markt nach Cooldown wieder.
6. **4** Open new markets für ungesignte FAs.

**Roster-Slot-Check seit Session 55:** `bidStillLegalAtResolution` weist Bids ab wenn Team `>= effectiveMaxRoster` (15 in-season / 21 training-camp).

### 2.6 Trade-Engine

| File | Verantwortung |
|------|---------------|
| `services/trade/tradeValueEngine.ts` | `calcPlayerTV`, `calcPickTV`, `getPickTV(pick, ctx)` (originalTid für rank), `getTeamMode`, `autoBalance`, `isSalaryLegal` (NBA 125%) |
| `services/trade/tradeFinderEngine.ts` | Find-Offers, scant 29 Teams, Pick-Sweetener, autoBalance |
| `services/trade/inboundProposalGenerator.ts` | GM-Mode Inbound-Proposals mit `cbaValid`-Flag (S55 — illegal proposals bleiben sichtbar als "Needs Adjust"-Hinweis) |
| `services/trade/stepienRule.ts` | `wouldStepienViolateForTid` |
| `utils/cbaTradeRules.ts` | `validateCBATradeRules` (Apron, S&T, Same-Day-S&T, Moratorium) |
| `services/AITradeHandler.ts` | AI-AI-Trade-Eval + Execution + GM-Personalities (`trade_aggression`, `scouting_focus`) |

**Pick-Wert folgt Original-Owner.** OKC, das LAC's 1st hält, wird mit LAC's Lottery-Curve bewertet (nicht OKC's contender-rank). `getPickTV` macht das automatisch — nicht direkt `calcPickTV` aufrufen ohne den Original-Tid lookup.

### 2.7 Rating-Skalen (NICHT VERWECHSELN)

Zwei Skalen koexistieren:

| Skala | Range | Wo |
|-------|-------|----|
| **BBGM raw** | 35–82 praktisch | `player.overallRating`, Retirement, Progression |
| **K2 (2K)** | 66–99 | Anzeige, Salary-Tiers, External Routing |

`K2 = 0.88 * BBGM + 31` via `convertTo2KRating(ovr, hgt, tp)`.

**Faustregel:** Jede Schwelle `>= 85` BBGM ist toter Code. Refactor auf K2 65–72 (Star) / 55–64 (Starter). Skala dokumentieren wenn unklar.

### 2.8 Coaching-Depth (Session 54)

Vier per-Save-skopte Stores in `src/store/`, alle gebaut via `createSaveScopedMapStore<T>(prefix)` Factory:

- `defenseGameplanStore` — Team-Defense-Base (5 Templates)
- `defenderDetailStore` — Per-Defender-Baseline-Coverage
- `rivalGameplanStore` — Per-Opponent-Targeting (max 2 Targets)
- `matchupAssignmentsStore` — Lockdown/Hide-Picks

**Phase 1 (UI+Persist) shipped, Sim-Wiring deferred** — siehe TODO. Plus AI Coach Paradigm in `services/training/aiCoachParadigm.ts` (kontext-aware täglicher Plan pro AI-Team).

### 2.9 All-Star Weekend

`AllStarWeekendOrchestrator` koordiniert Saturday-Events:
- Dunk Contest, 3PT Contest, Rising Stars (5 Formate)
- **The Throne** (Saturday 1v1, opt-in) — composite voting (Fan/Player/Media/Coach), mandatory title defense
- Satellite events (HORSE, Skills, 1v1, Shooting Stars) — Sim-Services + Toggles vorhanden, UI-Surfaces pro Event in Entwicklung

---

## 3. Save-Format (KRITISCH)

**Saves sind gzipped.** Roh in IndexedDB sehen sie aus wie `{__gz: true, data: ArrayBuffer}` — kein `players` Field. `DecompressionStream('gzip')` ist Pflicht.

- IndexedDB-DB: `keyval-store`, Object-Store: `keyval`
- Save-IDs: `nba_commish_<timestamp>_<id>`
- Metadata-Index: `nba_commish_metadata` (Array)
- Kanonische Helpers in `src/services/SaveManager.ts`
- Audit-Pattern: `scripts/audit-economy.js`, `scripts/audit-economy-deep.js`

**Standard-Snippet** (DevTools-Console) zum Inspizieren: siehe `CLAUDE.md` § "Standard snippet".

**Debug-Protokoll:** Bei jedem Save-State-Bug (Korruption / Contract / FA-Pool / Roster / Bird-Rights / Mood / Trade) **STOP** nach der Hypothese und User um den Snippet bitten. Code-Reads ohne tatsächlichen Save sind Raten — siehe Khris-Middleton-Saga (S55) als Lehrstück.

---

## 4. Save-Scoped Persistenz (NICHT VERHANDELBAR)

Alles, was in localStorage/IndexedDB außerhalb von `GameState` geschrieben wird, **MUSS** mit `state.saveId` skopt sein, sonst leakt es zwischen Saves.

- `state.saveId` minted in `initialization.ts`, swap bei `LOAD_GAME` / `UPDATE_SAVE_ID`.
- Reference: `src/store/gameplanStore.ts` keyt localStorage als `nba-commish-gameplans::<saveId>`.
- **Factory:** `createSaveScopedMapStore<T>(prefix)` aus `src/store/saveScopedMapStore.ts` für jeden neuen Per-Save-Store nutzen. Pattern bereits angewendet auf gameplan/defenseGameplan/defenderDetail/rivalGameplan/matchupAssignments.

Niemals globalen Key für editierbare Per-Save-Settings. So leakten die Gameplan-Minuten zwischen Saves vor dem Fix.

---

## 5. Unit-Gotchas

| Field | Unit |
|-------|------|
| `contract.amount` | BBGM **thousands** (3200 = $3.2M). Multiply ×1000 für USD |
| `minContractStaticAmount` | **Millionen** (1.273 = $1.273M). Multiply ×1,000,000 für USD |
| `overallRating` | **BBGM raw** (35–82) — `convertTo2KRating` für Anzeige |
| `yearsOfService` | `player.stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).length`, NICHT `age - 22` |

Cap-Skala-Bugs sind die häufigste Bug-Klasse. Beim Vergleich von payroll (BBGM thousands) gegen `salaryCap` (USD): immer `payroll * 1000 < salaryCap`. Session 51 + Session 55 hatten beide einen Skala-Bug.

---

## 6. Was nicht tun

Aus `CLAUDE.md` Don't-Liste + Praxis:

- **Nicht** `team.players` zugreifen (gibt's nicht).
- **Nicht** Pass-Reihenfolge in `runAIFreeAgencyRound` umsortieren (Pass 2 vor Pass 4 = fix).
- **Nicht** `hasFamilyOnRoster`-Check vor Trim/Cut weglassen (Family-Ties-Protection).
- **Nicht** Multi-Paragraph-Docstrings — eine Zeile max.
- **Nicht** Backwards-Compat-Shim (`_unused`-vars, dead Re-Exports, `// removed`-Marker, renamed vars).
- **Nicht** Error-Handling für unmögliche Szenarien (trust internal code; validate nur an System-Boundaries).
- **Nicht** hardcoded `2025`/`2026`/`new Date().getFullYear()` in Sim-Context — immer `state.leagueStats.year`.
- **Nicht** Inline-Phase-Checks parallel zum Plan rechnen — immer `getOffseasonState` / `getOffseasonDayPlan`.
- **Nicht** `try/catch` um interne Function-Calls (System-Boundary-Ausnahmen: localStorage, fetch).
- **Nicht** Magic Numbers ≥85 BBGM — toter Code, K2-Schwellen nutzen.
- **Nicht** Save-State mutate ohne Reducer.
- **Nicht** automatisch committen / pushen ohne explizite User-Anweisung.

---

## 7. Verifikation

- `npm run lint` (= `tsc --noEmit`) — Type-Check, MUSS Exit 0 nach jeder Änderung.
- `npm run build` — Vite-Bundle, fängt Build-Errors.
- **Browser-Playthrough mit echtem Save** — Sim mehrere Saisons durch, DevTools `[OSPLAN]`-Filter setzen, jede Drift-Warning ist ein Bug.
- **Audit-Scripts** — `scripts/audit-economy.js` (Roster/Cap/2W-Health), `scripts/audit-economy-deep.js` (FA-Pool-by-OVR + unter-rostered-Team-Logs). Beide auto-loaden den neuesten Save.

Type-Checks und Build verifizieren Code-Korrektheit, **nicht** Feature-Korrektheit. UI-Änderungen erfordern visuelle Verifikation im Dev-Server.

---

## 8. Aktive Tools / Sub-Agents

`.claude/agents/code-simplifier.md` — adaptiert für Repo-Konventionen (Default keine Kommentare, kein Backwards-Compat-Shim, Pipeline-Reihenfolge fix, etc.). Spawnable via Agent-Tool für gezielte Refactor-Passes.

`.claude/commands/code-review.md` — Slash-Command für PR-Review. 5 parallele Sonnet-Agents + Confidence-Gating ≥80, NBA-Commish-spezifische CLAUDE.md-Compliance-Hooks.

---

## 9. Recent Sessions Zusammenfassung

### Session 55 (May 7, 2026) — Trade & Signings Audit + Khris Middleton Saga + Mega-Refactor-Pass

**Bug-Fixes Trade/Signings (16):**
- Roster-Slot-Check vor Sign (faMarketTicker, phase-aware 15/21)
- Cap-Skala-Bug AITradeHandler:340 (BBGM-thousands × 1000 fehlte)
- inboundProposalGenerator CBA-Validation als `cbaValid`-Flag (NICHT-filtern, UI zeigt "Needs Adjust"-Badge + "Legal only"-Toggle)
- `salariesFit` ±30% → `isSalaryLegal` 125%
- Bird-Rights `priorTid=-1` Guard (G-League call-ups)
- `minSalary` Konstante 9 Sites einheitlich `1.273`
- Log-Tag `[autoRunDraft]` → `[AI-FA]`
- `canCut`-Twin-Funktion → `buildForcedTrimPool` Helper
- `pickOpts` 3× → `getPickTV` (+ Bug-Fix `originalTid` statt `tid`)
- `tradablePickWindow` magic 7 → `DEFAULT_TRADABLE_PICK_SEASONS`
- `capSpaceTeams` Cap-Room-Sort

**Khris-Middleton-Saga (Waive→Sign Contract-Korruption):**
- Waive-Handler clear contract (`amount: 0, exp: currentSeasonYear`) + future contractYears (vorher: alter Mavs-$33.3M-Vertrag blieb hängen)
- SigningModal `mleType` auto-stamp gate (vorher: jede guaranteed signing wurde MLE-flagged → cap umgangen)
- handleSignFreeAgent server-side defense-in-depth Block bei MLE-mismatch
- FA-Sidebar season-aware (`isPreFA` via `getOffseasonState` statt Inline-Date-Check) — Sidebar zeigte "Projected cap (post-rollover)" das ganze Jahr
- Shortlist + Room-After hidden in-season
- Transactions-Log nutzt strukturierten `signingOutcomeText` statt LLM-Narrative
- `commissioner: true` flag jetzt `gameMode`-aware

**Game-Sim Bonus:**
- `possessionBuilder.ts:148` `q` → `quarter` Reference-Error
- `engine.ts` 4× hardcoded `2026` → `currentSeason`
- `coordinated.ts` Rebound-Drift: setzt jetzt `s.reb` UND `s.trb`
- `engine.ts` try/catch + `_unused`-Prefixes weg

**Refactor-Pass post-Audit (Code-Simplifier-Agent-Output):**
- `OffseasonAufgaben.tsx` — `lsYearOf` Helper konsolidiert 9× `?? 2026`; inline `cMonth/cDay`-Phase-Math → `getOffseasonState().phase` (Drift-Quelle geschlossen)
- `lazySimRunner.ts` — Finals-MVP + Semifinals-MVP Bag-Aggregation (~80 LOC dupliziert) → `computePlayoffMvpFromResults` Helper, −54 net LOC
- `seasonRollover.ts` — 5× Bird-Rights inline → `computeBirdRightsForRollover` Helper
- `offseasonState.ts` — `computeDraftSeasonYear` + `computeUpcomingSeasonYear` als Top-Level-Exports
- `seasonRollover.ts` — Hardcoded `Jun 29, ${currentYear}` 3× → derived `getFreeAgencyStartDate(currentYear, ls) - 1 day` (commissioner-FA-shift-aware)
- `src/utils/leagueYear.ts` neue Helper-Datei (`getLsYear(state)`)
- **Mass-Sweep:** alle `?? 2026` Sites in 52 Files → `?? new Date().getFullYear()` (Cliff-Bug ab Saison 2027 entschärft)

**Stores:**
- 5 Defense-Stores via `createSaveScopedMapStore` Factory konsolidiert (−75 LOC, −15%)

**Tooling:**
- Code-Simplifier + Code-Review Agents geclont (`.claude/agents/`, `.claude/commands/`)

### Session 54 (May 4–7, 2026) — Coaching Depth Phase 2/3

- AI Coach Paradigm (`aiCoachParadigm.ts`) — context-aware täglicher Plan
- AI Auto-Setup (`aiAutoSetup.ts`) — One-Shot Dev-Focus + Mentor-Backfill
- Phase 3 Stores (`defenseGameplan`/`defenderDetail`/`rivalGameplan`/`matchupAssignments`)
- Coaching Hub View (`CoachingHubView.tsx`)
- Throne Watch Overlay (`ThroneWatchOverlay.tsx`)
- Training Dashboard Status Bar
- 25 Offseason-2K-Hardening-Commits (Tasks-rename, Calendar-Advance, Full QO Modal, Enter-Preseason-Exit etc.)
- CLAUDE.md Save-State-Debug-Protokoll dokumentiert
- TEAM_TRAINING_PLAN.md Guiding Principle + Future Updates (Defensive Lib, Chemistry, Conditioning-as-Decay-Fighter)

### Session 53 (May 3, 2026) — 2K-Style Tasks-Sidebar

8-Aufgaben-Checklist + FA-Tag-Counter + Auto-Resolve-All. GM-Mode-only. Foundation Sessions 1-5 (Orchestrator) machten dies möglich.

### Sessions 52 + 1–5 (May 3, 2026) — Offseason-Orchestrator Foundation

- `getOffseasonState` + `getOffseasonDayPlan` als Single Source of Truth
- `[OSPLAN]`-Convention für Drift-Tracking
- 4 Subsysteme (`simulationHandler`, `lazySimRunner`, `faMarketTicker`, `seasonRollover`) routed durch Plan statt parallel zu rechnen
- Format-Caps (`gamesPerSeason ≤82`, `playoffSeries ≤7`) in Commissioner-UI

### Session 50 — Team Training Phase 3.5/4

- System Familiarity affektiert tatsächliches Spielergebnis (`engine.ts`)
- Defensive Aura wired (`team.defensiveAura` per `trainingTick`)
- Fatigue affektiert Stat-Generation (`(1 - fatigue/200)` Multiplier)

### Session 36 — Codex one-shot economy cleanup

CBA P0+P1 + Rising Stars 4-team tournament + All-Star polish. Big sweep.

Komplette Liste in `CHANGELOG.md`.

---

## 10. Investigation Findings (nicht offensichtlich)

Vor dem Anfassen dieser Bereiche lesen:

- `historicalAwards` hat **zwei Schemas**: BBGM (kein `type`-Field) und flat (`type: 'MVP'`). Unterscheiden via `!!a.type`.
- `state.staff.gms` ist **per Team-Name** gekeyt, nicht per tid.
- `playoffRoundsWon` wird vom Sim **nicht** auto-aktualisiert — explizit in `lazySimRunner` setzen.
- `extractNbaId(imgURL, name)` — Name als 2. Argument für `NAME_TO_ID`-Lookup.
- Retired Players: `tid === -1`, voller `stats[]` intakt. Career-Team = max GP nach tid.
- `GameResult` lebt in **zwei** Files: `src/types.ts` UND `src/services/simulation/types.ts`. Beide updaten.
- `playerDNPs` speichert DNP-Reason zur Sim-Zeit — vor dem aktuellen `player.injury`-State bevorzugen.

---

## 11. Helper-Inventar (NICHT NEU SCHREIBEN)

Bevor du eigenen Helper-Code schreibst, prüf diese Liste — duplizierte Helpers sind der häufigste Refactor-Trigger.

### Year / Phase

| Helper | Wo | Was |
|--------|----|----|
| `getLsYear(state)` | `src/utils/leagueYear.ts` | Single source für `state.leagueStats.year ?? fallback`. Ersetzt 80+ inline `?? 2026` Sites. |
| `getOffseasonState(date, ls, schedule)` | `src/services/offseason/offseasonState.ts` | Single Source of Truth für Phase (`inSeason | preDraft | … | preCamp`). NIEMALS inline-cMonth/cDay-Phase-Tests. |
| `getOffseasonDayPlan(state)` | `src/services/offseason/offseasonPlan.ts` | Was-soll-heute-feuern (`rollover` / `tickFAMarkets` / `runAIFAPass` / `runBirdRightsPass`). Alle Dispatches lesen den Plan. |
| `computeDraftSeasonYear(cMonth, cYear, lsYear)` | `offseasonState.ts` | Pre/post-rollover-aware Draft-Saison-Year. |
| `computeUpcomingSeasonYear(cMonth, lsYear)` | `offseasonState.ts` | Next-Camp/Opener-Year (BBGM-Konvention seasonYear=season-end). |
| `logPlanEvent(caller, action, extra)` | `offseasonPlan.ts` | `[OSPLAN]`-Tagged Logging für Drift-Tracking. |

### Save-Scope / Persistenz

| Helper | Wo | Was |
|--------|----|----|
| `createSaveScopedMapStore<T>(prefix)` | `src/store/saveScopedMapStore.ts` | Factory für `Map<number, T>`-Stores die per `state.saveId` skopt persistieren. **Neuer Per-Save-Store immer hier durch.** |
| `setActiveSaveId(saveId)` | jeder Save-scoped Store exportiert das | GameContext ruft das auf jedem `state.saveId`-Wechsel. |

### Salary / Cap / Contract

| Helper | Wo | Was |
|--------|----|----|
| `getCapThresholds(leagueStats)` | `src/utils/salaryUtils.ts` | salaryCap, luxTax, 1stApron, 2ndApron Thresholds. |
| `getMLEAvailability(tid, payroll, salaryUSD, thresholds, ls)` | `salaryUtils.ts` | MLE-Tier (`room` / `non_taxpayer` / `taxpayer`) + available USD. |
| `getTeamPayrollUSD(players, tid, team, year)` | `salaryUtils.ts` | Aktueller Team-Payroll in USD. |
| `getTeamCapProfileFromState(state, tid, thresholds)` | `salaryUtils.ts` | Vollständiges Cap-Profile inkl. dead money + two-way exclusions. |
| `contractToUSD(amount)` | `salaryUtils.ts` | BBGM-thousands → USD (× 1000). NIE selbst rechnen. |
| `computeContractOffer(player, ls, ctx?)` | `salaryUtils.ts` | Market-Salary für FA basierend auf K2 + Mood + Bird Rights. |
| `getContractLimits(player, ls, ...)` | `salaryUtils.ts` | min/max Salary + Years für ein Sign. |
| `isSalaryLegal(salaryA, salaryB)` | `services/trade/tradeValueEngine.ts` | NBA 125% asymmetrisch — NIE eigene ±30%-Symmetrie schreiben. |
| `hasBirdRights(player)` | `salaryUtils.ts` | Bird-Rights-Check (read flag). |
| `computeBirdRightsForRollover(p, ls, yrsCompleted)` | `services/logic/seasonRollover.ts` | Rollover-spezifische Bird-Rights-Berechnung (file-private). |

### Trade

| Helper | Wo | Was |
|--------|----|----|
| `calcPlayerTV(player, mode, year, ctx?)` | `services/trade/tradeValueEngine.ts` | Trade-Value pro Player. |
| `getPickTV(pick, ctx)` | `tradeValueEngine.ts` | **Bevorzug das, NICHT `calcPickTV`** — handled `originalTid`-Lookup, classStrength, lotterySlot. |
| `validateCBATradeRules(input)` | `src/utils/cbaTradeRules.ts` | Apron, S&T, Same-Day-S&T, Moratorium Validation. |
| `wouldStepienViolateForTid(picks, year, window, tid, leaving)` | `services/trade/stepienRule.ts` | Stepien-Rule per Team. |
| `topNAvgK2(players, n)` | `salaryUtils.ts` | Top-N OVR-K2-Average für Star-Detection. NIEMALS Roster-Average-aller. |
| `getTradeOutlook(team, ...)` | `salaryUtils.ts` | Team-Mode (rebuild / contender / neutral) + Reason. |

### Player / Roster

| Helper | Wo | Was |
|--------|----|----|
| `convertTo2KRating(ovr, hgt, tp)` | `src/utils/helpers.ts` | BBGM 35–82 → K2 66–99. |
| `calcOvr2K(player)` / `calcPot2K(player, year)` | `tradeValueEngine.ts` | K2-Skala Convenience. |
| `hasFamilyOnRoster(player, roster)` | `src/utils/familyTies.ts` | Family-Ties-Protection — vor jedem Trim/Cut Pflicht. |
| `isUntouchable(player, mode, year, mvpRank?)` | `tradeValueEngine.ts` | Star-Protection vor Trade. |
| `isWalkingExpiring(player, year, isPostDeadlinePreFA)` | `tradeValueEngine.ts` | Post-deadline expiring contract excluded from offers. |
| `isRecentlySignedLocked(player, currentDate, ls)` | `tradeValueEngine.ts` | Signing-Moratorium (kann nicht trade-d werden bis tradeEligibleDate). |
| `parseGameDate(d)` | `src/utils/dateUtils.ts` | **NIEMALS** `new Date(state.date).getUTCMonth()` direkt — Manila-Timezone-Bug. Immer durch parseGameDate. |

### Sim

| Helper | Wo | Was |
|--------|----|----|
| `runLazySim(...)` | `services/logic/lazySimRunner.ts` | Multi-Day-Skip, single source for >30-day sim. |
| `computePlayoffMvpFromResults(results, winnerTid, minGames=3)` | `lazySimRunner.ts` | Bag-Aggregation + Score + Tiebreak für Finals/Semifinals MVP. File-private. |
| `buildAutoResolveEvents(...)` | `lazySimRunner.ts` | Calendar-Event-Hooks. **Neue Calendar-Events hier registrieren.** |

### UI

| Helper | Wo | Was |
|--------|----|----|
| `usePlayerQuickActions()` | `src/hooks/usePlayerQuickActions.tsx` | Vereinheitlicht Player-Row-Klicks (view_bio / view_ratings / sign / resign / waive). |
| `useExpiringResignGate()` | `src/hooks/useExpiringResignGate.tsx` | Re-Sign-Gate für expiring Contracts. |
| `useRosterComplianceGate()` | `src/hooks/useRosterComplianceGate.tsx` | Roster-Größe-Compliance-Check. |
| `formatSalaryM(usd)` / `formatSalaryMPrecise(usd)` | `salaryUtils.ts` | Display-Format. |
| `formatGameDateShort(d)` | `dateUtils.ts` | Kurzes Datum-Format ("Jun 29, 2025"). |

### Save / Storage

| Helper | Wo | Was |
|--------|----|----|
| `SaveManager.compress(state)` / `decompress(raw)` | `src/services/SaveManager.ts` | Gzip-Wrapper. **Saves sind gzipped — niemals raw stringify/parse.** |

---

## 12. Open Critical Bugs / Pickup-Ready

Aus `TODO.md` § "BUGS — Open":

1. **LLM-Path im Sign könnte contract.amount mutieren.** Theorie zur Khris-Middleton-Restkorruption: der `Force correct contract amount — LLM generates wrong units`-Override-Block in `playerActions.ts:240` deutet darauf hin, dass die LLM-Pipeline contract.amount in falschen Units re-zurückgibt. Sub-Path durchspüren.
2. **LOAD_GAME-Heal für Ghost-Contracts.** Bestehende Saves mit ge-waiveten Spielern haben noch alten contract.amount + future contractYears intakt (Bug bis Session 55). Brauche eine one-shot Heal-Function in `LOAD_GAME`, die für jeden FA (`tid === -1` && `recentlyWaivedDate`) `contract` resettet und future contractYears strippt.

Plus große Queues für **Coaching Phase 3 Sim-Wiring**, **Team Chemistry**, **Defensive System Library Sim-Bridge**, **CBA P2-Polish** — alle in `TODO.md`.

---

## 13. Quick-Start-Befehlsliste

```bash
npm install
echo "GEMINI_API_KEY=your_key" > .env.local
npm run dev      # Dev-Server, Browser auf http://localhost:3000
npm run lint     # tsc --noEmit (kanonischer Type-Check)
npm run build    # Vite-Bundle
```

DevTools-Konsole für Debugging. `[OSPLAN]`-Filter für Offseason-Dispatch-Timeline.

---

*Last updated: 2026-05-07 (post-Session-55 + Mega-Refactor-Pass).*
