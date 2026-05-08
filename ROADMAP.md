# Product Roadmap: NBA Commish Sim

## 1. Product Vision

Eine Endgame-würdige NBA-Management-Simulation, die jahrzehntelange Liga-Evolution simuliert ohne Ökonomie-Drift, Roster-Korruption oder Cap-Bugs. Tiefer als 2K MyGM in CBA-Detail, leichter als BBGM in Bedienung, mit LLM-Narrative-Layer der jede Saison eine eigene Geschichte erzählt. Beide Modi (Commissioner + GM) gleichwertig polished, ohne dass einer den anderen als Stiefkind behandelt.

## 2. Intended Users and End State

- **Sim-Enthusiast:** Kann 25+ Saisons am Stück durchsimulieren ohne dass Cap-Floor-Violations oder Roster-Korruption auftreten. Hall-of-Fame baut sich glaubhaft auf.
- **Liga-Architekt:** Kann jede Regel toggle-n und sofort sehen welche Spieler/Teams das beeinflusst (Live-Validation statt Save-und-Pray).
- **GM-Spieler:** Kann ein Bottom-Tier-Team in 5–7 Saisons zum Contender bauen mit nachvollziehbarem Trade-Markt, FA-Bidding-Wars und Draft-Pick-Akkumulation.
- **Story-Spieler:** Bekommt jede Saison eine kohärente Narrative ohne Repetition (LLM-generierte Headlines, Tweets, Coach-Quotes spiegeln tatsächliche Liga-Events).

## 3. Strategic Principles

1. **Save-Integrität ist nicht verhandelbar.** Jede neue Persistence muss save-scoped sein. Keine Save-Migrations für reversible Bugs.
2. **Single-Source-of-Truth über Parallel-Computation.** Wenn zwei Pfade dieselbe Entscheidung treffen, nimmt einer den Plan vom anderen ab (siehe `[OSPLAN]`-Refactor).
3. **Realismus-Skala vor Hand-Tuning.** OVR-Skalen, Salary-Tiers, Trade-Values per Formula derived statt mit Magic Numbers gepflegt.
4. **Pickup wo der Bug brennt, nicht wo der Code-Schmerz ruft.** Refactors landen nur wenn ein Bug oder Feature sie verlangt.
5. **Sessions sind die Working-Unit.** Jede landed Change → CHANGELOG-Eintrag mit Root-Cause + File-Pfaden.

## 4. Current Phase

**Phase: Coaching-Depth Phase 3 Sim-Wiring + Offseason-2K Hardening.**

Mai 2026: Offseason-Orchestrator (Sessions 52/53) ist gelandet, Phase A–D Tasks-Checklist plus 25 Polish-Commits (Session 54 Hardening). Parallel die Coaching-Welle: Phase 1 (Tooltips, Recovery-Lock) + Phase 2 (AI Coach Paradigm) + Phase 3 (Defense Gameplan, Defender Detail, Rival Gameplan, Matchup Assignments) sind als UI + Persistenz shipped — fehlen nur die Sim-Knobs in `GameSim`. Nächste Schritte: Sim-Wiring der Coaching-Stores, Throne-Watch-Overlay-Polish, weiteres Offseason-Stabilisieren via `[OSPLAN]`-Drift-Sweep.

## 5. Near-Term Priorities

(Reihenfolge: Bug-Last → Foundation-Sweetener → Feature)

1. **Coaching Phase 3 Sim-Wiring.** `GameSim` muss `defenseGameplanStore` (Team-Base) + `defenderDetailStore` (Per-Defender-Override) + `rivalGameplanStore` (Per-Opp-Targets) + `matchupAssignmentsStore` (Lockdown/Hide) lesen und auf Possession-Outcomes mappen. StatGenerator-Knob-Pass — separate Iteration pro Store.
2. **Offseason-Validation-Sweep.** Browser-Sim Juli → Okt mit DevTools-`[OSPLAN]`-Filter; jede Drift-Warning ist ein Bug. Coverage in `autoResolvers` ist seit Session 54 vollständig (autoRunLottery / autoRunDraft / autoInductHOFClass / Throne-Trio / autoSimAllStarWeekend instrumentiert).
3. **Pass 5 Shortfall-Distribution.** Teams 15/15 mit Cheap-Deals brauchen NBA-Style Bonus-Spread an Roster-Players. Function-Stub in `seasonRollover.ts` zum Jahresende.
4. **Hard-Cap-Konzept (CBA #9).** `team.hardCapForSeason: { applied, ceiling, reason }` Schema + Validator + UI in EconomyTab. Foundation für Apron-Polish-Items P2.
5. **All-Star Satellite-Events End-to-End** (per Event eine Iteration: Shooting Stars, Skills, HORSE, 1v1) — DayView-Card + News + Awards + History-Spalte + Contestants-Announce.
6. **Round-Robin Rising-Stars-Format.** `simulateRisingStarsBracket` Round-Robin-Branch implementieren — Toggle ist schon im UI.
7. **Throne Watch-Live Overlay Polish.** ThroneWatchOverlay shipped Session 54 — Commentary-Pools erweitern, Skip-to-End Cap, Seed-Randomizer für Replays.
8. **Team Chemistry als trainbarer Meter.** `TEAM_TRAINING_PLAN.md` "Future Updates" definiert Sessions die Chemistry treiben (Bonding/Film/Light) vs erodieren (Hi-Intensity/Strength H). Hook in mood/role-stability als Team-Multiplier.

## 6. Later Opportunities

- **Team Training Engine deeper integration** (Foundation Session 50 + AI Coach Session 54 shipped) — Drill-Picker, Opponent-Comparison-Sim-Bias, Coach-System-Library-Expansion.
- **Re-Signing-Pfad Refactor** — keine neue Surface (SigningModal kann schon re-signen), nur Aufräumen / Vereinheitlichung der bestehenden Pfade. Kein neuer Portal-Screen.
- **FA Portal mit Live-Bid-Feed** — News-Ticker während FA ("Shai signs with OKC — 4yr $180M"). Aktuell sieht User nur Day-Counter.
- **`state.phase` als gespeichertes Field** — Nächster Step im Offseason-Orchestrator-Refactor (Session 6+ deferred). Erlaubt das Löschen von `isInFreeAgencyWindow` & Co.
- **3-of-5 Second-Apron Pick-Relegation** (CBA #10) — `team.apronHistory[]` + Draft-Order-Rewrite.
- **Stretch-Provision × TPE** (CBA #12) — 2nd-Apron-Stretch suppress TPE-Generation.
- **Echtes Elam-Ending in GameSim** — `targetScore` wird heute gesetzt aber ignoriert.
- **Coaching Depth Phase 5+** (`COACHING_DEPTH_ROADMAP.md`) — Defender Detail tiefere Schichten, mehr Paradigmen.

## 7. Explicit Non-Priorities

- **Multi-User / Online-Liga.** Single-Player-Save bleibt.
- **Mobile-Native-App.** Web-PWA optional; Desktop-First.
- **Echte NBA-Lizenz / offizielle Daten-Partnerschaften.** Best-Effort über öffentliche Gists / CDN.
- **Pre-1996 Historical-Replay-Mode.** BBGM-Imports gehen, kein Investment in eigenen Pfad.
- **Salary-Forecasting over Year-N+5.** Cap-Inflation-Editor reicht.
- **Live-Coach-Name-Customization für Rising Stars.** Legend-Pool-Rotation reicht.

## 8. Relationship To Other Control Documents

- `PRODUCT.md` — Wo wir gerade stehen (aktuelle Capabilities, Limits).
- `ARCHITECTURE.md` — Wie das System aussieht heute.
- `TODO.md` — Operationale Backlog-Liste; Roadmap-Items fließen dort als QUEUED-Sections ein, sobald sie Pickup-ready sind.
- `NEW_FEATURES.md` — Aspirational Wunschliste; Roadmap nimmt nur das auf, was strategisch priorisiert ist.
- `CHANGELOG.md` — Wo wir herkommen.

## 9. Open Questions

- Wann sollte `state.phase` zum gespeicherten Field promoted werden? (Bricht Save-Forwards-Compat — wann lohnt sich der Cut?)
- Lohnt sich ein In-App-Debug-Panel für `[OSPLAN]`-Drift-Warnings, oder reicht DevTools?
- Sollen Auslandsligen langfristig eigene Sim-Engines bekommen (heute alle BBGM-Adapter), oder bleibt es ein Adapter-Layer?
- Welche All-Star-Satellite-Events landen Saison 2026–27, welche bleiben deferred?
