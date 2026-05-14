# Inline PBP Engine — Replace post-hoc PBP synthesis with ZenGM-style inline emission

**Author:** Claude (mit User Feedback 2026-05-11)
**Status:** Draft — awaiting AC sign-off
**Trigger-Bug:** GameWatch zeigt PBP-Endstand HOME 82 / AWAY 98, aber `precomputedResult` Engine sagt HOME 107 / AWAY 99. AWAY ist nahe konsistent, HOME driftet ~25 Punkte. Reproduzierbar (User-Log 2026-05-11, Sacramento Kings @ Memphis Grizzlies).

## Wurzelursache (verifiziert)

1. `GameSimulator.simulateGame()` produziert Final-Stats per Spieler + `quarterScores`.
2. `genPlays()` (simulationService.ts) versucht **rückwirkend** ein PBP zu synthetisieren, das diese Targets trifft.
3. `buildPossessions` (possessionBuilder.ts:46) läuft pro Quarter eine While-Loop mit **`MAX_ATTEMPTS = 120`** Hard-Cap.
4. `pickOutcome` (possessionBuilder.ts:139) returnt `null`, wenn das **aktive 5er-Lineup** keine Shot-Budgets mehr hat — auch wenn team-weit noch welche da sind.
5. Konsequenz: HOME-Starters scoren in Q1–Q3 ihre Budgets leer → Q4-Lineup pleite → `pickOutcome` returnt `null` → Team-Swap → AWAY scort weiter → `attempts` rennt auf 120 → HOME-Quarter unter Target abgebrochen.
6. AWAY 98 vs. 99 = praktisch ok; HOME 82 vs. 107 = 25-Punkte-Drift weil HOME-spezifisch (Tip-Winner-Asymmetrie).

## Architektureller Grund

ZenGM (Basketball-GM) emittiert PBP-Events **inline mit der Sim**: `recordStat()` schreibt `team.stat.pts += amt` UND `playByPlay.logEvent(...)` in derselben Codezeile. Box-Score und PBP **können** nicht driften, weil sie dieselbe Datenquelle sind. Wir machen PBP als Reconstruction — strukturell fragil.

## Lizenz-Constraint

ZenGM-Code hat eine **proprietäre Custom License** von ZenGM, LLC. 1:1-Code-Copy ist verboten (auch non-commercial). User-Entscheidung: **eigene Inline-PBP-Engine, ZenGM-Architektur als Inspiration**. Algorithmen/Architektur sind nicht urheberrechtlich geschützt, nur konkreter Code.

## Goal

Eine **einzige Simulation-Engine**, die für jedes Spiel deterministisch sowohl Box-Score als auch (optional) PBP-Event-Stream aus **derselben** internen State-Maschine produziert. Beide Modi (Fast/Lazy-Sim und Realistic/GameWatch) nutzen dieselbe Engine — Fast verwirft den Event-Stream, Realistic gibt ihn an `useLiveGame` weiter.

## Acceptance Criteria

- [ ] **AC1:** GameWatch-PBP-Endstand und Box-Score-Endstand sind in jedem Spiel exakt gleich (cs === finalResult.homeScore, ds === finalResult.awayScore). Verifizierbar via Console-Assert nach Spielende.
- [ ] **AC2:** Quartal-Totals im PBP (Summe der `pts` pro Quarter pro Team) === `quarterScores.home[q]` / `quarterScores.away[q]` aus Engine.
- [ ] **AC3:** Fast Mode (Lazy-Sim, `simulateGameStats(...)` ohne `genPlays`-Aufruf) liefert dieselben Box-Scores wie Realistic Mode — beide laufen durch die neue Inline-Engine, nur das PBP-Sink ist anders (null-sink vs. Array).
- [ ] **AC4:** Spieler-Stats (pts/fgm/fga/3pm/3pa/ftm/fta/ast/orb/drb/stl/blk/tov/pf/min) im Box-Score sind aus dem **Event-Stream akkumuliert**, nicht aus separater `StatGenerator`-Logik. d.h. `sum(player.pts) === team.pts` IMMER.
- [ ] **AC5:** `MIN`-Spalte stimmt: `sum(player.min) === 240` (oder 240+25×OT) pro Team. Aktuell driftet das via `sec`-vs-`min`-Confusion (siehe useLiveGame.ts:222 Workaround).
- [ ] **AC6:** Existierende Saves zeigen kein PBP-Replay mehr (Hard-Cut akzeptiert). Box-Score historischer Games bleibt aus persisted Stats lesbar — keine Re-Simulation alter Spiele.
- [ ] **AC7:** `genPlays`, `buildPossessions`, `playRenderer`, `simulationService`, `possessionBuilder`, `clockAssigner`, `foulTracker` sind **gelöscht** (~2900 Zeilen weg, Hard-Cut).
- [ ] **AC8:** `genericCommentary.ts` und `badgeCommentary.ts` bleiben — die Texte/Phrasen werden vom neuen Renderer wiederverwendet (Text-Pool ist Asset, kein Logikfehler).
- [ ] **AC9:** Determinismus via Seed pro `game.gid`. Zweimaliges Simulieren desselben Spiels = identischer Box-Score + identischer PBP.
- [ ] **AC10:** Performance: Lazy-Sim eines Saison-Tages (15 Spiele) muss innerhalb von ≤ 1.5× der aktuellen Lazy-Sim-Zeit liegen. Realistic Mode darf nicht spürbar langsamer werden.

## Non-Goals (explizit ausgeschlossen)

- **Kein** Port des ZenGM-Code (lizenzrechtlich verboten — siehe oben).
- **Kein** Backward-Compat für alte Save-PBPs (Hard-Cut akzeptiert, alte Saves zeigen nur Box-Score).
- **Keine** Hook-Architektur über bestehender Engine (User-Entscheidung gegen "Engine-Wrapper").
- **Keine** Änderung an Ratings/Player-Modell — die Engine konsumiert NBAPlayer wie bisher.
- **Keine** Änderung am Schedule, Rotation Editor, Coaching-Schemes — die werden weiter als Inputs in die Sim gefüttert.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│  GameSimulator.simulateGame(home, away, players, ...)       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  InlineEngine                                        │   │
│  │  ─ Per-Tick: Possession-Loop                         │   │
│  │  ─ recordStat(team, player, stat, amt) →             │   │
│  │       updates internal box-score                     │   │
│  │       sink.logEvent({ type, t, pid, pts, clock })    │   │
│  │  ─ Reading from sink AFTER: box-score === Σ events   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                  │
│              ┌───────────┴───────────┐                      │
│              ▼                       ▼                      │
│  ┌──────────────────┐    ┌─────────────────────┐            │
│  │  NullSink        │    │  ArraySink          │            │
│  │  (Fast Mode)     │    │  (Realistic Mode)   │            │
│  └──────────────────┘    └─────────────────────┘            │
│                                      │                      │
│  return { boxScore,                  ▼                      │
│           plays?: PlayLine[] }    PlayLine[] mit cs/ds      │
│                                   derived consumer-side     │
└─────────────────────────────────────────────────────────────┘
```

## Phasen (vertical slices)

### Phase 1 — Skelett & Test-Harness (1 Tag)
- Neuer Ordner: `src/services/simulation/inline/`
- `InlineEngine.ts` — Stub, leeres Possession-Loop, returnt empty boxScore
- `eventSink.ts` — `NullSink`, `ArraySink` Interfaces
- `types.ts` — `InlineEvent`, `InlineBoxScore`, `InlinePlay`
- Test-File: `__tests__/inline-engine.test.ts` mit AC1/AC2 als noch-failende Tests
- **Slice-Output:** Test läuft, fällt erwartungsgemäß rot. Architektur steht.

### Phase 2 — Score-Events inline (2 Tage)
- Possession-Schleife mit deterministischem Seed (game.gid als Seed via mulberry32 oder ähnlich)
- Outcome-Pick aus dem aktuellen Lineup (BBGM-OVR-gewichtete Shot-Frequenzen ableiten — Rates aus historischen BBGM-Daten, keine Reverse-Engineering)
- `recordStat(t, p, 'fg' | 'fg3' | 'ft' | 'tov' | 'fou' | 'pts', amt)` — single source of truth
- `sink.logEvent({ type: 'made_fg', t, pid, pts: 2|3, clock })`
- **Slice-Output:** AC1/AC2 grün — PBP-Endstand === Box-Score-Endstand, immer.

### Phase 3 — Volle Stat-Palette (2 Tage)
- Rebounds (orb/drb), Assists, Steals, Blocks, Turnovers, Personal Fouls
- Lineup-Time-Tracking (min/sec) auf Tick-Basis statt Post-hoc
- Bench-Subs basierend auf Foul-Trouble + Minutes-Budget aus Gameplan
- **Slice-Output:** AC4, AC5 grün — alle Stats konsistent, MIN-Spalte korrekt.

### Phase 4 — Clutch/Walkoff/Game-Winner-Logik (1 Tag)
- Late-game-Tilt (Foul-Multiplier, brick-rate-Tilt), aber: nur als kontinuierlicher Bias im Outcome-Pick, NICHT als post-hoc Override
- Walkoff-Detect: wenn letzter Score-Event innerhalb der letzten 5s den Lead flippt → `isGameWinner = true` im Event
- **Slice-Output:** `gameWinner` aus Event-Stream ableitbar, keine separate `clutch.ts`-Logik mehr nötig.

### Phase 5 — Realistic-Mode Wire-Up (1 Tag)
- `useLiveGame.ts` konsumiert `result.plays` aus `simulateGame()` direkt — KEIN `genPlays`-Aufruf mehr
- Running-Score `cs`/`ds` consumer-side aus Event-Stream akkumuliert (so wie ZenGM es macht)
- `liveStats`/`teamStats`/`quarterScores`-Memos in useLiveGame nehmen das Event-Array als Input
- **Slice-Output:** GameWatch-Screen zeigt korrekten Stand bis zum Buzzer.

### Phase 6 — Fast-Mode Wire-Up (1 Tag)
- `simulateGameStats()` (Lazy-Sim-Pfad) ruft `InlineEngine` mit `NullSink` auf — derselbe Code-Pfad, nur kein PBP-Output
- `seasonRollover.ts`, `lazySim.ts`, `simulateToDate` werden geprüft: ist `quarterScores`-Konsistenz erfüllt?
- **Slice-Output:** AC3 grün — Fast und Realistic produzieren bit-identische Box-Scores für dieselbe game.gid.

### Phase 7 — Hard-Cut Cleanup (0.5 Tage)
- Lösche: `simulationService.ts`, `possessionBuilder.ts`, `playRenderer.ts`, `clockAssigner.ts`, `foulTracker.ts`, `possessionTypes.ts`
- Behalte: `badgeCommentary.ts`, `genericCommentary.ts`, `dunkData.ts`, `rotationService.ts` (Asset/Reuse)
- `engine.ts` (1643L im alten GameSimulator/) wird durch InlineEngine ersetzt — alter `engine.ts` löschen, `clutch.ts`/`syntheticPM.ts`/`quarters.ts` evaluieren (vermutlich weg)
- **Slice-Output:** AC7 grün, ~2900 Zeilen Code weg, Build clean, Lint clean.

### Phase 8 — Determinismus + Perf (0.5 Tage)
- Seed-Hashing pro game.gid stabilisiert (verifizieren: zweimal selbe Saison = bit-identische Box-Scores)
- Profil-Run: Lazy-Sim 1 Saison-Tag (15 Spiele) — Zeit < 1.5× alter Lazy-Sim
- **Slice-Output:** AC9, AC10 grün.

## Aufwand-Schätzung

**~8 Tage** vertical, eine Phase pro Tag mit AC-Verifikation. Risiko-Puffer +2 Tage.

## Risiken

1. **Outcome-Distribution-Tuning** — die heuristischen Multiplier (Late-Game-Tilt, ORB-Rate etc.) aus dem alten possessionBuilder waren teilweise gegen Bugs kalibriert. Neuer Code muss von BBGM-Statistiken aus neu kalibriert werden, sonst sehen Quartal-Stats unrealistisch aus. **Mitigation:** Snapshot-Test mit 100 Sim-Games, Vergleich Mittelwerte gegen NBA-Saisondurchschnitt.
2. **Rotation-Service-Integration** — InlineEngine muss bei jedem Tick wissen, wer auf dem Feld ist. Aktuelle `RotationService.getLineupAtTime()` ist budget-basiert (nimmt Min-Budget des Spielers an), nicht event-basiert. **Mitigation:** Reuse `RotationService`, aber Tick-driven (jeden ~60s Game-Time-Sub-Check).
3. **Gameplan-Integration** — Coaching-Schemes/Defense-Familiarity beeinflussen Outcomes. Aktuelle Logik in `engine.ts` ist 1643 Zeilen tief. **Mitigation:** Erst zentrale Sim-Loop bauen, dann Gameplan-Hooks als Modifier-Funktionen einhängen (Slice nach AC1 läuft).
4. **Determinismus mit Math.random** — alle existierenden `Math.random()`-Aufrufe in alten Helper-Files (z.B. `dunkData.ts`) müssen via seedeable RNG ersetzt werden. **Mitigation:** Globaler RNG via DI in der Engine, alte `pick()`-Helpers nehmen RNG-Instance als Argument.
5. **PBP-Texte** — `genericCommentary.ts`/`badgeCommentary.ts` haben Renderer-Calls die das alte `PlayLine`-Schema erwarten. Neues `InlinePlay`-Schema muss ähnliche Felder anbieten oder die Renderer werden angepasst. **Mitigation:** `InlinePlay`-Schema als Superset des alten `PlayLine`, Renderer-Calls minimal anpassen.

## Offene Fragen für User

- [ ] **Q1:** Soll der bestehende `engine.ts` (1643L, Stat-Generator-Logik) als Algorithmus-Inspiration für die InlineEngine dienen, oder von Grund auf neu? (Empfehlung: Inspiration nehmen — Rates/Distributionen sind dort gegen unsere BBGM-Daten kalibriert.)
- [ ] **Q2:** Coaching-Schemes / Defense-Familiarity / Gameplan-MinuteOverrides — alle in Phase 1 schon einbauen oder als Phase 9 nachschieben? (Empfehlung: nachschieben, sonst staut sich der Critical-Path AC1.)
- [ ] **Q3:** PBP-Persistenz — User-Antwort war "Nur User-Game, andere ephemeral". d.h. AI-AI-Spiele bekommen `NullSink`, User-Game bekommt `ArraySink`. Korrekt verstanden? Oder: User-Game läuft Realistic durch Engine, AI-AI läuft Fast durch Engine — beide ephemeral PBP, kein Save-Persist.
