# NBA Commish — TODO

> Geshippte Sessions liegen in [CHANGELOG.md](./CHANGELOG.md). Dort prüfen, bevor ein Item unten als offen angenommen wird.

---

## ✓ SHIPPED — Session 56 (May 7, 2026)

### Critical: NBA Draft konnte mit "Mark Done" geskippt werden
- `OffseasonAufgaben.tsx` Sidebar zeigte "Mark Done"-Button für JEDE in-progress Row. User klickt "Enter" auf NBA Draft → Status `in-progress` → "Mark Done" sichtbar → Klick = Draft geskippt mit `OFFSEASON_COMPLETE_PHASE` ohne dass die Engine wirklich gepickt hat.
- Fix: Engine-driven Phasen (`draftLottery`, `draft`, `freeAgency`, `trainingCamp`) zeigen jetzt einen disabled "In Progress"-Pill statt Mark-Done. Sie auto-completen über `draftLotteryResult` / `draftComplete` / `faTagCounter`-Exhaustion / Oct-21+-Calendar-Check.
- Soft Phasen (`options`, `qualifyingOffers`, `myFAs`, `rookieContracts`) bleiben manuell mark-done-bar (sind real Skip-bar weil deren Engine-Defaults trivial sind).

### Waive→Sign ghost-contract cleanup
- AI roster-trim waives now clear the waived player's live `contract` and current/future `contractYears`, matching the manual waive handler. Dead money remains on `team.deadMoney`, so the next signing team no longer inherits the old team's salary/option rows.
- Signing paths clear stale `recentlyWaivedBy` / `recentlyWaivedDate` once the player actually signs.
- `LOAD_GAME` heals existing saves where `tid === -1`, `status === 'Free Agent'`, and `recentlyWaivedDate` still carried a live ghost contract.

## ✓ SHIPPED — Session 55 (May 7, 2026)

### Trade- & Signings-Audit (16 Bug-Fixes)
- Roster-Slot-Check vor Sign (`faMarketTicker`) — phase-aware (15 reg-season / 21 training camp)
- Cap-Skala-Bug `AITradeHandler:340` (BBGM-thousands × 1000 fehlte)
- `inboundProposalGenerator` CBA + Stepien Validation als `cbaValid`-Flag (NICHT-filtern); UI-Filter "Legal only" + "Needs Adjust" Badge
- `salariesFit` symmetrisch ±30% → `isSalaryLegal` 125% (asymmetrisch, NBA-konform)
- Bird-Rights `priorTid=-1` Guard — G-League/CBA call-ups verlieren `yearsWithTeam` nicht mehr
- `minSalary` Konstante (9 Sites einheitlich `1.273`, $73k Drift weg)
- Log-Tag `[autoRunDraft]` → `[AI-FA]` in FA-Code
- `canCut`-Twin-Funktion (preseason+regular) → `buildForcedTrimPool` Helper (~30 LOC weg)
- `pickOpts` 3× dupliziert → `getPickTV(pick, ctx)` Helper (+ Bug-Fix: `originalTid` statt `tid` für Rank-Lookup, ehemals OKC holding LAC's pick wurde mit OKC-rank statt LAC-Lottery-Curve bewertet)
- `tradablePickWindow` magic `7` → `DEFAULT_TRADABLE_PICK_SEASONS` Konstante (7 Sites)
- `capSpaceTeams` Cap-Room-Sort (DESC) — Dumps gehen jetzt zum richtigen Cap-Space-Team

### Game-Sim-Audit (Bonus)
- `possessionBuilder.ts:148` `q` → `quarter` (Reference-Error, Q4-Late-Game-Crash)
- `engine.ts` 4× hardcoded `2026` → `currentSeason` (ab Saison 2027 hätten falsche Ratings/Gameplay-Daten gezogen)
- `engine.ts` `try/catch` um internen `getDefenseGameplan` entfernt
- `initial.ts` `_unused`-Prefixes weg
- `coordinated.ts:256` Rebound-Drift — sowohl `s.reb` als auch `s.trb` setzen

### UX/UI (Khris Middleton Saga)
- FA-Sidebar season-aware via `getOffseasonState`: "Cap Space" (in-season) statt "Projected cap (post-rollover)"; Shortlist + Room-After hidden in-season (`TeamIntel.tsx` + `TeamIntelFreeAgency.tsx`)
- Transactions-Log nutzt strukturierten `signingOutcomeText` statt LLM-Narrative ("championship experience and clutch scoring..." raus)
- `commissioner: true` Flag jetzt `gameMode`-aware (false in GM mode)
- **Waive Handler clear-cut**: `playerActions.ts:555-573` strippt jetzt `contract` (`amount: 0, exp: currentSeasonYear`) und future `contractYears`. Vorher blieb der alte Mavs-$33.3M-Vertrag als Ghost an Middleton hängen
- SigningModal `mleType` Auto-Stamp Gate — nur stampen wenn salary tatsächlich `<= mle.available`. Ehemals: jede guaranteed signing wurde auto-MLE-flagged → Cap-Check umgangen
- `handleSignFreeAgent` Defense-in-Depth: server-side block wenn client `signedMleType` claimed aber salary > MLE.available (Diff-Log)

### Refactor / Tooling
- `createSaveScopedMapStore<T>(prefix)` Factory in `src/store/saveScopedMapStore.ts` — 4 Defense-Stores (defenseGameplan, defenderDetail, rivalGameplan, matchupAssignments) konsolidiert (−75 LOC, −15%)
- `[OSPLAN]`-Coverage erweitert: `autoOpenThroneSignups`, `autoCloseThroneSignups`, `autoOpenThroneVoting`, `autoLockThroneField`, `autoSimAllStarWeekend` instrumentiert
- `.claude/agents/code-simplifier.md` + `.claude/commands/code-review.md` aus anthropic/claude-plugins-official geclont, an Repo-Konventionen adaptiert
- README/PRODUCT/ROADMAP/ARCHITECTURE/AGENTS nach `xklob/codex-repo-template` Pattern angelegt

---

## BUGS — Open

### LLM-Path im Sign könnte contract.amount mutieren
Theorie zur Khris-Middleton-Restkorruption: der `Force correct contract amount — LLM generates wrong units`-Override-Block in `playerActions.ts:240` deutet darauf hin, dass die LLM-Pipeline contract.amount in falschen Units re-zurückgibt. Sub-Path durchspüren wenn der Bug nochmal auftritt.

---

## HANDOFF — Fictional League / Doku Cleanup (May 10, 2026)

### Bereits erledigt im Worktree
- Fictional League hat jetzt lokalen Generator für Teams, aktive Spieler, FAs, Rookie-Class, Staff und Referees.
- Fictional Setup skippt die externen Roster-Fetches.
- Fictional Preview und tatsächlich gestarteter Save sind jetzt per Seed synchronisiert. Vorher wurde im Setup und in `handleStartGame()` doppelt neu generiert.
- Fictional Branding ist auf die zentralen sichtbaren Flächen erweitert: Setup-Timeline, Jump-Review, Schedule-DayView, All-Star-DayView, Playoffs, Historical Finals, Rules/Honors/Awards, Draft-Eligibility und Cup-Change-Messages sind jetzt `leagueType`-aware statt hart NBA-gebrandet.
- High-Level-Doku (`README.md`, `PRODUCT.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `AGENTS.md`) ist auf denselben Sprachstand zu `Fictional` vs `Modded` sowie `Fast` vs `Realistic` gebracht.
- `docs/simulator-guide.md` ist als Guide für `Fast` vs `Realistic` vorhanden.

### Noch offen
- **Residual Fictional String Sweep:** Es gibt noch vereinzelte harte `NBA`-Strings in Randflächen wie Dashboard-/Calendar-/Modal-Texten und teils in bewusst historischen/modded Spezialfällen. Die großen sichtbaren Fictional-Brecher sind aber abgearbeitet.
- **Browser-Check für Fictional-Flow fehlt noch:** kein visueller Durchlauf der Fictional-League-Startstrecke nach Seed-Fix plus Branding-Sweep in dieser Session.
- **Commit-/Push-Split sauber halten:** Worktree enthält parallel viel Simulator-/UI-Arbeit. Beim Committen dieser Session darauf achten, Fictional/Doku-Handoff nicht mit fremden in-flight Änderungen zu vermischen.

### Wichtige Einordnung
- Die letzten **committeten** Änderungen vom `2026-05-08` sind Simulator-Arbeit, nicht Fictional-League-Arbeit.
- Ein großer Teil der Fictional-League-Verbesserungen ist aktuell **Worktree-Stand**, also noch nicht durch die jüngsten Commits repräsentiert.

---

## QUEUED — Coaching Phase 3 Sim-Wiring (Session 54 Follow-up)

UI + Persistenz für `defenseGameplanStore`, `defenderDetailStore`, `rivalGameplanStore`, `matchupAssignmentsStore` ist shipped (Session 54). Sim-Wiring ist die nächste Iteration:

- **Defense Gameplan → GameSim:** `pnrBallHandler`/`pnrRollMan` skewed BallScreen-Outcomes; `iso`/`doubleOnPost`/`doubleOnDrive` skewed Iso-Possession-FT-Rate; `pickup` modifies Half-Court vs Transition-Rate; `zoneVsMan` toggle für Zone-Coverage-Bias.
- **Defender Detail → StatGenerator-Knobs:** `bodyPressure` → Closeout-Speed-Multiplier; `denyLevel` → Off-Ball-Catch-Rate; `closeout` → Foul-Rate + Closeout-Speed; `help` → Drive-Help-Probability; `rebound` → DREB-Multiplier per Defender.
- **Rival Gameplan → Matchup-Time:** `RivalAction` Targets bekommen `defaultDoubleTeamRate += 0.4` (Always Double), `extraBlitzOnPnR = true` (Blitz on PnR), etc. Aktiv nur in Spielen vs der spezifischen Opponent-tid.
- **Matchup Assignments → Defender-vs-Scorer-Probability:** Lockdown-Defender bekommen +Cross-Match-Bias gegen Top-Scorer; Hide-Defender bekommen Schutz davor.
- **Trade/Coach-Fire Clean-Slate:** `seasonRollover.ts` muss bei Coach-Fire `team.systemFamiliarity` und alle vier Stores für das Team auf 0 setzen (siehe `docs/training.md` §2).

---

## QUEUED — Team Chemistry Trainable Meter (Session 54 Follow-up)

`TEAM_TRAINING_PLAN.md` "Future Updates" definiert Mechanik:
- Sessions die Chemistry treiben: Bonding, Film, Light Practice, Low-Intensity Team-System.
- Sessions die erodieren: Hi-Intensity Conditioning, Strength H, repeated Full Training ohne Rest.
- Chemistry-Meter als Multiplier auf Team-Cohesion (nicht individuelle Mood-Scores).
- Display in Training-Effects-Panel B3 neben System / Fitness / Offense / Defense.

Vorab: `team.chemistry: number` als gespeichertes Field. Tick in `trainingTick.ts` als 5. Meter neben den existierenden vier.

---

## QUEUED — Defensive System Library Sim-Bridge (Session 54 Follow-up)

`defensiveSystemDescriptions.ts` + `defensiveSystemFit.ts` shipped als Catalog + Roster-Fit-Scorer. Trainbar via System Practice (offense+defense parallel). Was fehlt:

- **Defensive Aura Multiplier** liest die MOST-PRACTICED Defensive-System-Familiarity. Sim-Wiring shipped Session 54 (`engine.ts`), aber nur als grober Multiplier — noch nicht per-System-spezifische Stat-Effekte (Box-and-One sollte z.B. Top-Scorer-Volume hart cappen, Press sollte Turnover-Rate hochziehen).
- Per-System sim-effects als Knob-Pass.

---

## QUEUED — Rising Stars Multi-Format (Deferred)

Voller Writeup CHANGELOG Session 36. Hier nur out-of-scope:

- **Round-robin-Format** (alle 4 Teams gegeneinander, Top-2 ins Final) — Toggle `risingStarsEliminationEndings: false` ist im UI exposed, nur der `simulateRisingStarsBracket`-Branch braucht den Round-Robin-Path.
- **Live-Coach-Name-Customization im Commissioner-UI** — aktuell Legend-Pool-Rotation (Carmelo / T-Mac / Vince Carter Cycle by Year). User-editable Names brauchen Settings-Field + Form.
- **Echtes Elam-Ending in der GameSim-Engine** — `targetScore` auf Bracket-Games ist gesetzt (40 SF, 25 Final), GameSim ignoriert es; Spiele sind getimed, nicht Elam.

---

## QUEUED — Throne Standalone-Polish

Throne als All-Star-Saturday-Event ist live (CHANGELOG Session 27). Offen für den Standalone-Code-Path `src/throne/`:

- Sim Round / Sim Tournament Buttons
- skipToEnd Cap-Fix
- Reichere Commentary-Pools
- Seed-Randomizer

---

## QUEUED — All-Star Cosmetic Polish

Sekundärer Polish; Satellite-Event-UI in `NEW_FEATURES.md`.

- Champion-Box-Score-MVP-Highlight in Roster-View — aktuell zeigt nur der Final-Game-MVP, RR-Stage-Standouts könnten surfacen.
- Voting per Team-Bucket — aktuell noch by Conference; Bucket-Assignment ist announce-time only.
- Captain-Veto / Live-Draft-UI — Captain-Pick-Order ist auto-snake; kein Commissioner-Live-Draft.

---

## QUEUED — Pick-only Trades Follow-ups (aus Session 29)

- **"Better-of" / "worse-of" Pick-Swap-Rights** — Schema-Field auf `DraftPick` (oder `PickSwap`-Join-Entity), Evaluation zur Draft-Time.
- **`DraftPick.protection`-Field** — Rendering im Modal + Evaluation (z.B. "top-4 protected, conveys in 2028").
- **Trade-Finder "picks only" Filter-Chip** — UI-Toggle, der nur Pick-für-Pick / Pick-für-Cash-Counter-Offers surfaced.
- **Luxury-Tax-Integration** — `cashUsedInTrades` wird gebookkept, fließt aber noch nicht in den Tax-Bill. NBA-Reality: gesendetes Cash zählt GEGEN den Sender.

---

## QUEUED — CBA / Apron Rules P2-Polish (P0+P1 in Session 36)

- **#8 Mid-season-Waiver-Claim-Block (1st Apron).** 1st-Apron-Teams können keinen Spieler vom Waiver claimen, dessen Pre-Waive-Salary > NT-MLE. Blocked: kein Waiver-Claim-Flow vorhanden (Waivers gehen direkt in den FA-Pool per `simulationHandler.ts`). Implementieren wenn Claim-Flow landet.
- **#9 Hard-Cap-Triggers.** Taxpayer-MLE / S&T-Receive / Salary-Aggregation / BAE-Use → Hard-Cap am 1./2. Apron für die Saison. Aktuell existiert Hard-Cap nicht. Fix: `team.hardCapForSeason: { applied, ceiling, reason }`-Flag + Validator-Check; UI-Section in `EconomyTab`.
- **#10 3-of-5 Second-Apron Pick-Relegation.** 3 von 5 Saisons über 2nd Apron → R1-Pick ans Round-Ende. Persistence-Arbeit + Draft-Order-Rewrite. `team.apronHistory`-Array in `seasonRollover`. Nicht dringend.
- **#11 BAE 1st-Apron-Gated.** `biannualEnabled`/`biannualAmount` existieren als Free-for-All. Fix: gaten in MLE/BAE-Allocation; Eyebrow wie MLE-Tier-Rows.
- **#12 Stretch-Provision × TPE.** 2nd-Apron-Stretch darf keine TPE aus stretched Portion erzeugen. Block im Waive-Handler.

---

## QUEUED — 2K-style Sandboxed Offseason Phases (Vision)

> **Status:** Phase A–D (8-Aufgaben-Checklist + FA-Tag-Counter + Auto-Resolve) shipped Session 53.

### Phase Portals — noch nicht shipped

1. **FA Portal mit Live-Bid-Feed** — News-Ticker während FA ("Shai signs with OKC — 4yr $180M"). Aktuell sieht der User nur den Tag-Counter, kein Live-Feed der KI-Signings.
2. **Pre-Camp Portal** — vereinfachte Trainings-Camp-Roster-Übersicht + One-Click "Advance to Opening Night". Heute geht das via "Auto-Resolve all".
3. **Re-Sign Refactor** — kein eigener Portal-Screen (SigningModal kann das schon), nur Aufräumen / Vereinheitlichung der bestehenden Pfade.

### Pre-requisite

`state.phase` als gespeichertes Field mit explizitem `enterPhase()`-Übergang (Session 6 des Orchestrator-Refactors, deferred — siehe unten).

---

## QUEUED — Offseason-Orchestrator (Sessions 1–5 shipped, Follow-ups deferred)

Sessions 1–5 (CHANGELOG Session 52) bauten `services/offseason/offseasonState.ts` + `offseasonPlan.ts` und routeten `simulationHandler`, `lazySimRunner`, `faMarketTicker`, `AIFreeAgentHandler`, `seasonRollover`, `externalSigningRouter`, `PlayButton` durch den Plan. Tag `[OSPLAN]` deckt alle Dispatch-Decisions + Drift-Warnings.

### Open Follow-ups

- **Session 6 (deferred):** `state.phase` zum gespeicherten Field promoten mit explizitem `enterPhase()`, atomar staleness clearen (z.B. leftover playoff `series.status` beim Eintritt in postDraft wegwischen). Erster verhaltens­ändernder Schritt.
- **Session 7 (deferred, abhängig von 6):** `isInFreeAgencyWindow`, `isInPostDeadlinePreFAWindow`, `isDraftBlockedByUnresolvedPlayoffs` löschen, sobald Rest des Codebase aus `state.phase` liest.
- **Validation-Gap:** Keine Browser-Sim-Verifikation seit Sessions 3–5 die Authority von Inline-Gates auf Plan-Derived-Dispatch geswapped haben. Browser-Sim Juli → Okt sollte null `[OSPLAN] DRIFT` und `[OSPLAN] SHADOW-DRIFT` warnen.

### Pre-existing Economy Issues (vom Orchestrator unverändert)

- **Pass 5 kann vollen Rostern nicht helfen** — Teams 15/15 mit Cheap-Deals brauchen NBA-Style Shortfall-Distribution (Bonus-Payments an existing Players). Funktion noch nicht geschrieben. Sollte aus `seasonRollover.ts` zum Jahresende feuern.
- **`playerCurrentSeason` derived aus `player.stats` MAX-Year, nicht `state.leagueStats.year`** — stale für retired/revived Players. In `salaryUtils.ts`.

---

## SEPARATE DEVELOPMENTS

| Projekt | Account |
|---------|---------|
| Draft Lottery / Draft | princealjohnmogatas@gmail.com |
| Coaching | lemakicatta@gmail.com |
| GrubHub | mogatas.princealjohn.05082003@gmail.com |
| FranchiseHub | lemakicatta@gmail.com |
| Restaurants gist | https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbarestaurantsdata |
| Hall of Fame UI | princealjohnmogatas@gmail.com |
| Team Office | mogatas.princealjohn.05082003@gmail.com |

---

## History

Session-by-Session-Fixed-Lists in [`CHANGELOG.md`](./CHANGELOG.md) und [`NEW_FEATURES.md`](./NEW_FEATURES.md). Vor Annahme, ein Item sei offen, dort prüfen.
