# Product State: NBA Commish Sim

## 1. Product Summary

NBA Commish Sim ist eine browser-basierte Tiefen-Management-Simulation der NBA-Saison. Zwei vollwertige Spielmodi: **Commissioner** (gesamte Liga steuern — Regeln, Suspensionen, Trades, Ökonomie, Narrative) und **GM** (ein Team — Roster, Trades, Free Agency, Draft, Extensions). Zielgruppe: Strategie-/Sport-Sim-Spieler, die NBA-CBA-Realismus + langfristige Liga-Evolution + LLM-erzeugtes Storytelling wollen. Erfolgskriterium: Mehrere Saisons ohne Ökonomie-Drift, ohne Roster-Korruption, ohne FA-Pool-Hunger durchspielbar mit kohärenter Narrative.

Produktreife: **Beta**. Kern-Loops (Sim, Trades, Draft, FA, All-Star, Playoffs, Rollover) laufen. Offseason-Orchestrierung wurde Mai 2026 (Sessions 52/53) auf einen Single-Source-of-Truth-Plan umgestellt. Bekannte Drift-Quellen werden über `[OSPLAN]`-Drift-Warnings im DevTools-Log getrackt.

## 2. Users and Jobs To Be Done

| Nutzertyp | Job |
|-----------|-----|
| **Sim-Enthusiast** | Realistische NBA-Saison ohne Ökonomie-Bugs durchsimulieren, Hall-of-Fame-Karrieren tracken |
| **Liga-Architekt** | Eigene Regelsets ausprobieren (4PT-Linie, Apron-Tweaks, Format-Mods, Custom All-Star-Events) |
| **Story-Spieler** | LLM-generierte News, Tweets, Player-Quotes als Narrative-Layer über klassischen Box-Scores |
| **GM-Spieler** | Eine Franchise über mehrere Saisons aufbauen, Cap-Management, Trade-Hunt, Draft-Picks rebuilden |

## 3. Current Capabilities

### Spielmodi
- **Commissioner Mode** (Core) — Vollzugriff auf alle 30 Teams, alle Trades genehmigen/forcen, alle Regeln editieren, AI-Aktionen überschreiben.
- **GM Mode** (Core) — Ein Team unter den Augen einer KI-Liga; AI verwaltet die anderen 29; User-Aktionen werden gegen CBA-Regeln und Cap-Limits validiert.

### Ökonomie & CBA
- **CBA Apron P0+P1** (Core) — 1st-Apron-Trade-Aggregation-Block, taxpayer MLE Gating, S&T-Restrictions, Hard-Cap-Triggers Section 36.
- **Multi-Season-Pipeline** (Core) — 5-Pass-Signing-System (Best-Fit → Two-Way → NG-Camp → Min-Roster-Fill → Floor) in `AIFreeAgentHandler.runAIFreeAgencyRound`.
- **Bird Rights / Supermax** (Core) — `superMaxEligible` und `hasBirdRights` automatisch computed bei Rollover und Team-Option-Exercise.
- **External-League-Ökonomie** (Core) — 8 Auslandsligen (Euroleague/PBA/B-League/Endesa/G-League/CBA/NBL/WNBA) mit eigenem Salary-Scale, Mother-Team-Interest, Buyout-Slider.

### Sim-Engine
- **Game Sim** (Core) — Quartersweise Possession-basiert, mit Coach-Decisions, DNPs, Injury-Roll, Fatigue-Multiplier.
- **Lazy Sim** (Core) — `runLazySim` für >30-Tage-Skips, mit `[OSPLAN]`-Plan-derived-Dispatch.
- **Calendar Events** (Core) — Lottery, Draft, Trade Deadline, All-Star Weekend, Playoffs, Rollover, External Routing — alle automatisch via `buildAutoResolveEvents` orchestriert.

### All-Star Weekend
- **Bracket-Events** (Core) — Dunk Contest, 3PT Contest, Rising Stars (5 Formate inkl. 4-Team-Tournament + USA-vs-World), All-Star Game.
- **The Throne** (Core, opt-in) — Saturday 1v1 Tournament mit composite voting (Fan/Player/Media/Coach), mandatory title defense, gold-pulsing UI.
- **Satellite Events** (Experimental) — Shooting Stars, Skills Challenge, HORSE, 1v1 — Sim-Services + Toggles vorhanden, UI-Surfaces per Event noch in Entwicklung.

### Draft & Player Development
- **Generated Draft Classes** (Core) — Infinite-Sim-Support via `genDraftPlayers.ts` mit realistischer Path-Mix (College/Europe/G-League/Endesa/NBL/B-League).
- **Faces.js** (Core) — ZenGM-Pattern Face-Generation mit reject-loop für non-basketball Accessories.
- **Progression Engine** (Core) — Age + OVR-Viability Retirement, BBGM-style Growth + Decline Curves.
- **Team Training** (Core, neu Session 50) — Per-Team-Trainingsplan beeinflusst Familiarity, Defensive Aura, Fatigue, Injury-Risk; affektiert tatsächliche Spielergebnisse.

### UI & Storytelling
- **Player Portraits** (Core) — `imgURL` → NBA-CDN → Faces.js → Initialen Fallback-Kette mit IndexedDB-Bild-Cache.
- **LLM Narrative** (Core) — Gemini-driven News, Player-Quotes, Charania-Tweets, Coach-Reactions.
- **Mood System** (Core) — 7 BBGM-inspirierte Traits (LOYAL, DIVA, MERCENARY, COMPETITIVE, FAMOUS, HOMEBODY, …) beeinflussen Trade-Acceptance, FA-Bidding, Re-Signing-Probability.
- **Family Ties** (Core, Session ~Apr 19) — Sibling/Relative-Field, Trade-Block-Protection, Mood-Bonus, Family Tree Tab in PlayerBio.

### Offseason (GM Mode)
- **2K-Style Tasks-Checklist** (Core, Session 53/54) — 8-Row-Checklist (Lottery/Options/QO/MyFAs/Draft/Rookie-Contracts/FA/Camp) statt Tag-für-Tag-Klicks. Sidebar-Label EN: "Tasks" (vorher AUFGABEN). Auto-Checkmark fired für `pending` UND `in_progress` Rows.
- **FA-Day-Counter** (Core, Session 54) — 1/13-Step-Through der FA-Window mit Auto-Skip der Moratorium-Phase. Footer-Label EN: "Day" (vorher Tag).
- **Auto-Resolve-All** (Core) — One-Click bis Opening Night via `assistantGM=true`.
- **Calendar-Advance auf Event-Daten** (Core, Session 54) — Klick auf Lottery/FA-Row sprint `state.date` direkt zum Event-Tag.
- **RFA-Pending-Badge auf QO-Row** (Core, Session 54) — sichtbar wenn restricted FAs offen sind.
- **Expiring-Contracts-Headsup-Banner** (Core, Session 54) — Anzahl Player-Options + Team-Options + Bird-Rights vor Options-Row-Klick.
- **Full Qualifying Offer Modal** (Core, Session 54) — pro Spieler Tender / Match-Eligibility / Decline statt Auto-Resolve-Placeholder.
- **Rookie-Contracts Auto-Disclaimer** (Core, Session 54) — informiert User dass R1-Picks per CBA auto-guaranteed sind, dismissable.
- **Enter-Preseason CTA** (Core, Session 54) — beendet Offseason-Mode atomar (`OFFSEASON_EXIT`); Calendar-UI kommt zurück.

### Coaching (neu Session 54)
- **Coaching Hub** (Core) — eigene Top-Level-View `CoachingHubView` (Sidebar-Eintrag). GM-Mode öffnet auf User-Team direkt; Commissioner zeigt Team-Picker. Mirror des TeamOffice-Pattern.
- **Defense Gameplan** (Core, Phase 1: UI+Persist) — Team-Level-Defense-Base. 5 Templates (Drop & Recover / Switch Everything / Blitz the Stars / Wall Up / No Middle Death) + Custom. 8 Felder (PnR-BallHandler/Roll-Man, Off-Ball-Screens, ISO-Coverage, Double-Policy Post/Drive, Pickup, Zone-vs-Man). Sim-Wiring Phase 3 deferred.
- **Defender Detail** (Core, Phase 1) — Per-Defender-Baseline (NICHT per-Opponent). Body-Pressure / Deny-Level / Closeout-Style / Help-Behavior / Rebound-Behavior + optional Per-Defender Scheme-Override.
- **Rival Gameplan** (Core, Phase 1) — Per-Opponent-Targeting (max 2 Targets pro Rival). 6 Actions (Always Double / Blitz on PnR / Force Weak Hand / Top Lock Off-Ball / Switch & Hunt / Pack & Sag). Set once per Season, Auto-Reconcile bei Trade/Cut/Retire.
- **Matchup Assignments** (Core, Phase 1) — Lockdown (Top-3 Defender für toughste Assignments) + Hide (Top-3 weg von Elite-Scorers). FIRST/SECOND/THIRD Chevron-Pattern.
- **Defensive System Library** (Core) — Man / Zones / Junk-Defenses / PnR-Variants / Press inkl. Roster-Fit-Scorer.
- **AI Coach Paradigm** (Core, Session 54 Phase 2) — Context-aware tägliche Plans pro AI-Team basierend auf Saisonphase + W-L (Game-Day skip / Camp 85 / Preseason 60 / Playoffs Recovery 30 oder Offensive 70 / Reg-Saison Tier-by-WinPct). User-Team unverändert.
- **AI Auto-Setup** (Core, Session 54) — One-Shot Dev-Focus + Mentor-Backfill bei Save-Load (empty-only) + Aug 15. Pos × Top-Attribut → Archetype; ≤23-jähriger paart mit höchst-OVR ≥28-jährigem same Pos same Team.

### All-Star Weekend
- **Throne Watch-Live Overlay** (Core, Session 54) — `ThroneWatchOverlay.tsx`, Round-by-Round Replay mit Per-Match-Commentary. Wired in AllStarDayView "Open Throne" CTA.

### Training (neu Session 54 Tier A)
- **Defensive Aura** (Core) — Multiplier scaled mit MOST-PRACTICED Defensive-System-Familiarity. Belohnt Spezialisierung.
- **Dashboard Status Bar** (Core) — Top-of-Dashboard Summary mit heutigem Plan + Top-3 Familiarities (Off+Def interleaved) + B2B-Default + Normal-Default Quick-Presets (next 14 Tage).

## 4. Core Workflows

### 4.1 Reguläre Saison simulieren (Commissioner)
PlayButton → 1 Tag / 1 Woche / Bis Trade-Deadline / Bis Playoffs → Game-Result-Modal pro Tag → User kann jeden Tag in Trade-Machine, Free-Agents-View, Settings springen.

### 4.2 Trade ausführen
TradeMachineModal → Team 1 + Team 2 wählen (auto-sortiert nach Standings) → Spieler/Picks/Cash hinzufügen → Salary-Eyebrow zeigt Live-CBA-Validität → "Propose" oder "Override Deadline & Confirm" (Commissioner-only past Feb 15).

### 4.3 Offseason GM-Mode (2K-Style)
Calendar erreicht Jun 15 → AUFGABEN-Sidebar erscheint rechts → User klickt Row für Row durch (Modal-Stacks für Options + QOs, eingebettete Views für Draft + FA + Camp) → "Auto-Resolve all remaining" springt zu Opening Night.

### 4.4 All-Star Weekend
February-Mid → Calendar erreicht Friday → User watcht Rising Stars → Saturday → Dunk + 3PT + Throne (wenn aktiviert) → Sunday → All-Star Game → Awards in `player.awards` geschrieben → AllStarHistoryView updated.

### 4.5 Draft
DraftLottery (May 14) auto-fired → DraftSimulatorView (June 26) → Pick-für-Pick interactive oder "Sim to Pick X" / "Sim All" → `draftComplete = true` → Rookie-Contracts auto-seeded.

## 5. Product Constraints and Known Limits

- **Coaching Phase 3 Sim-Wiring noch deferred** — Defense Gameplan / Defender Detail / Rival Gameplan / Matchup Assignments persistieren und renderen, aber `GameSim` liest sie noch nicht. StatGenerator-Knob-Pass folgt.
- **Save-Format ist gzipped** — Roh-IndexedDB-Reads zeigen `{__gz, data}`, nicht das State-Objekt. `DecompressionStream('gzip')` ist Pflicht.
- **Per-Save-Persistenz** — Alle Side-Stores (Gameplan, Rotation-Presets, Image-Cache) MÜSSEN auf `state.saveId` skopt sein, sonst leakt zwischen Saves.
- **Pass 5 cannot help full rosters** — Teams 15/15 mit Cheap-Deals brauchen NBA-Style Shortfall-Distribution. Funktion noch nicht geschrieben.
- **`playerCurrentSeason` derived aus `player.stats` MAX-Year** — stale für retired/revived Players.
- **Hard-Cap-Triggers (CBA #9)** — Konzept fehlt noch; Teams sind aktuell nur über/unter Apron via raw Payroll.
- **Round-Robin Rising-Stars-Format** — Toggle exposed, Sim-Logik deferred.
- **Echtes Elam-Ending in GameSim** — `targetScore`-Field auf Bracket-Games gesetzt aber von GameSim ignoriert.
- **Browser-only** — Keine Server-Komponente, kein Multi-User. Alles in IndexedDB im Browser.

## 6. Non-Goals

- Multi-User / Online-Liga (Single-Player-Save).
- Mobile-Native-App (Web-PWA optional, aber Desktop-First-UI).
- Echte Lizenz-Daten (NBA-Player-Photos werden best-effort über CDN gefetcht; offiziell ungelizenziert).
- Salary-Forecasting über mehrere Jahre (Cap-Inflation editor existiert, Year-N-Projections nicht).
- Pre-1996 Historical-Replays als First-Class-Mode (BBGM-Imports gehen, sind aber kein Hauptpfad).

## 7. Relationship To Other Control Documents

- `ROADMAP.md` — Wo wir hinwollen (Phasen, Near-Term, Later-Opportunities).
- `ARCHITECTURE.md` — Wie das System gebaut ist (Codemap, Invariants, Boundaries).
- `CLAUDE.md` — Operational Anweisungen für Coding-Agents (Pipeline-Reihenfolge, Save-Format, Debug-Snippet).
- `TODO.md` — Was als Nächstes zu tun ist (Bugs, Deferred-Items, QUEUED-Listen).
- `CHANGELOG.md` — Was schon gemacht wurde (Sessions 1–53).

## 8. Open Questions

- Wann landet GM-Mode-Mehrteam-Switch (z.B. Trade-Force-Approval als ehemaliger Commissioner)?
- Soll der `[OSPLAN]`-Drift-Tracker zu einem In-App-Debug-Panel ausgebaut werden?
- Welche Auslandsliga sollte als nächstes integriert werden? (BSL Türkei? VTB Russia?)
- Soll Pass-5-Shortfall-Distribution NBA-genau implementiert werden, oder reicht ein simpler Bonus-Pool-Spread?
