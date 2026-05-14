# NBA Commish — TODO

> Geshippte Sessions liegen in [CHANGELOG.md](./CHANGELOG.md). Dort prüfen, bevor ein Item unten als offen angenommen wird.

---

## 🟡 IN PROGRESS — Sponsor Portfolio Polish (May 14, 2026, paused mid-Task-10)

**Spec:** `docs/superpowers/specs/2026-05-14-sponsor-portfolio-polish-design.md`
**Plan:** `docs/superpowers/plans/2026-05-14-sponsor-portfolio-polish.md`
**Workflow:** Subagent-driven, direct-to-master commits.

### ✓ Shipped (commits)
- **T1** `570636d` `scripts/build-sponsor-catalog.ts` — builder script that emits `sponsor-catalog.json` from `SPAIN_INITIAL_SPONSORS` + `KNOWN_DOMAINS` map (~37 brands) for the gist upload.
- **T2** `b884685` `src/utils/sponsorLogos.ts` — `resolveSponsorLogoUrl(meta)` chain (override → logo.dev w/ token → null), `getIndustryLabel`, `BrandMeta` type.
- **T3** `0be7d5e` `src/components/tycoon/SponsorIndustryIcon.tsx` — 8 inline-SVG industry tiles + Tailwind gradient tints.
- **T4** `2e0fe84` `src/components/tycoon/SponsorLogo.tsx` — `<img onError>` fallback to `SponsorIndustryIcon`.
- **T5** `9c743f8` `src/data/sponsorCatalogFetcher.ts` + `scripts/test-sponsor-catalog.ts` — fetch + cache + singleflight + `pickSponsorName(league,tier,slot,existing?)` + `getBrandMeta(league,name)` + `OFFLINE_FALLBACK` to `SPAIN_INITIAL_SPONSORS`.
- **T6** `ef1b621` `sponsorshipEngine.ts` `pickSponsorName` delegates to catalog fetcher; `specs/spain.ts` gets "offline fallback only" comment. (Bundle commit pulled in pre-existing unstaged Spain-MVP changes — acceptable per direct-to-master workflow.)
- **T7** `343dbed` `App.tsx` boot `useEffect` appends `loadSponsorCatalog()` fire-and-forget next to existing data kickoffs.
- **T8** `a077d64` `.env.example` (committed); local `.env` got `VITE_LOGODEV_TOKEN=pk_fgsxuNS4R2KmpzsdyrF6LQ` appended (gitignored).
- **T9** `be90cbe` `SponsorshipSection.tsx` — card layout swapped to 56px logo tile + `text-base font-bold line-clamp-2` + industry sub-label + 7-unit grade chip. No more `Town Sup...` truncation.
- **T10** `13ac28a` `SponsorshipNegotiationModal.tsx` — `NegotiationMode = 'renegotiate' | 'details' | 'replacement' | 'find-new'` prop, 3 conditional banners, `find-new` auto-pick first open slot, all-slots-full short-circuit, `Control` got `disabled`, replacement-checkbox gate, action-row split per mode.

### 🟡 Where we left off
- **T10 spec+quality review noch nicht gemacht.** Commit ist drin, Lint clean — aber kein Reviewer-Subagent gegen 13ac28a gelaufen. Beim Wiederaufnehmen: erst T10-Spec-Review + Quality-Review dispatchen, dann T11.

### 📋 Offen
- **T11** `onAction(slot, mode)` wiring: 4 Next-Action-Buttons (Renegotiate Deal / View Contract Details / Find Replacement / Find New Sponsors) mit Disabled-State + Tooltip. `FrontOfficeView` modal state braucht `mode`-Field. `SponsorshipCard` (Overview) bleibt mit `onNegotiate(slot)`-Wrapper, der `mode: 'renegotiate'` setzt.
- **T12** `SponsorshipCard.tsx` (Overview-Tile) bekommt 32px Logo + Industry-Label im SlotTile.
- **T13** Final smoke: `npm run lint` + `npx tsx scripts/test-sponsor-catalog.ts` + `npx tsx scripts/test-tycoon-sponsor.ts` + Browser-Walkthrough (8 Cards, 4 Buttons → 4 Modes, all-slots-full disabled state, overview tiles).

### 🌐 Externe Aufgabe für den User
- **sponsor-catalog.json zum Gist hochladen.** Builder läuft sauber:
  ```bash
  npx tsx scripts/build-sponsor-catalog.ts > sponsor-catalog.json
  ```
  Dann hochladen zu `https://github.com/aljohnpolyglot/nba-store-data` (gleiches Pattern wie `nbacontractsdata`). Final-URL muss erreichbar sein: `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json` (`curl -I` → HTTP/2 200). Solange das nicht passiert, läuft die App stabil über `OFFLINE_FALLBACK` (fetcher fängt 404 ab + logged warn, kein Crash).

### 🪲 Pre-existing concerns (nicht blockierend)
- T6 hat pre-existing unstaged Spain-MVP changes mit-committet (303/49 diff). Direkt-auf-master-Workflow vom User explizit OK'd.
- T9 commit war 264 insertions / 0 deletions — Datei war seit Session-Start untracked (vermutlich aus früherer uncommitted Worktree-Arbeit), nicht "modified". Inhalt korrekt verifiziert.

---

## 🟡 IN PROGRESS — Euro-Setup-Hybrid (May 14, 2026, Phase 1.A done, Task 5 done, cancelled mid-Task-6)

**Specs:** `docs/superpowers/specs/2026-05-14-euro-setup-hybrid-design.md` + `…ai-economy-balance-design.md`
**Plan:** `docs/superpowers/plans/2026-05-14-euro-setup-hybrid.md` (32 tasks, 9 phases, TDD)
**Workflow:** Subagent-driven, direct-to-master. Strikt 1:1 (Implementer → Spec-Review → Quality-Review pro Task).

### ✓ Shipped (commits)
- **T1** `0ac94b2` `src/types.ts` — `OwnerProfile` interface + `OwnerWealthTier/Patience/Vision` unions + `SetupTierLabel` + `NBATeam.ownerProfile/startingTier/startingBudget` optional fields. **Bundle commit** zog parallel-WIP mit ein (transferMarket config, transferListings/Bids/Activity types, pendingEuroBankruptcy, StaffMember.face, euroMinSalaryUSD/euroMaxSalaryUSD/euroleagueBRL, trainingCampMonth/Day, Expansion+TransferMarket ActionTypes, Front Office Sub-Tabs) — 120 insertions, vom User explizit OK'd.
- **T2** `e55e0cd` `src/types.ts` — `GameState.staffFreeAgents/euroSetupSeed`, `LeagueStats.autoOwnerSeeded/staffPoolSeeded`. 13 insertions.
- **T3** `ba5515c` + `be603b6` `src/utils/tierMapping.ts` + tests — `mapSetupTierToTycoonTier` + `getTycoonTierUILabel`. **TycoonTier-Reuse:** import aus `src/types/tycoon.ts` statt redeclariert (gleiche shape). 9 Tests (4 setup→tycoon + 5 tycoon→Label inkl. B→'Mid-Tier'-Hyphen-Drift-Test aus Quality-Review).
- **T4** `588b72d` `src/services/euro/sponsorSeedTypes.ts` — `SponsorSlot` type + `leagueIdToKey` adapter (endesa+euroleague → 'spain' LeagueKey). 18 LOC.
- **T5** `f5e0fab` + `f70ee14` `src/services/euro/nationalityPool.ts` + tests — `buildCoachNationalityPool(state, leagueId)` mit TID-range filter (endesa 5000-5100 etc), top-15 countries weighted, FALLBACK_POOL, cache mit `${leagueId}-${players.length}-${sample}` key. 3 Tests pass. **Plan-Drift dokumentiert:** Plan-Prosa nannte `<30` als Fallback-Schwelle, aber Plan-Test 1 erwartet Filter-Result bei 3 Matches — Implementer wählte `< 1` (Test gewinnt), Inline-Kommentar erklärt warum.

### 🟡 Where we left off
- **Task 6 cancelled mid-flight (background agent stopped).** Kein Commit. Sub-agent's last status: `staffFallback.ts` Edits noch nicht applied (Type-Check zeigte unrelated tsconfig-Probleme in anderen Files, nicht in der zu modifizierenden Datei). Beim Wiederaufnehmen: Task 6 Implementer neu dispatchen.

### 📋 Offen (Phase 1 tracker — TaskList #6–#32)
- **1.A** Types + Infra (T1–T4) — **✓ DONE**
- **1.B** Nationality Pool (T5–T6) — **T5 done**, **T6 staffFallback dynamic pool — Pending (cancelled mid-dispatch)**
- **1.C** Seed Generators (T7–T11): tierBudget, staff×6, owner, sponsor, careerSeed orchestrator — Pending
- **1.D** Reducer + LOAD_GAME (T12–T13): INIT_EURO_CAREER + heal — Pending
- **1.E** Review UI (T14–T23): SectionGroup + 4 Cards + EuroSetupReviewScreen + 4 Edit-Modals — Pending
- **1.F** App wiring (T24): App.tsx `euroReview` phase — Pending
- **1.G** Staff-Pool (T25–T27): seed staffFreeAgents @ INIT, monthly refill, last-resort in modal — Pending
- **1.H** Owner Mechanics (T28–T30): evaluateSeasonForOwner, seasonRollover patience tick, cash-injection modal — Pending
- **1.I** Smoke (T31–T32): migration snapshot test + manual QA — Pending
- Final code review — Pending

### Plan adaptations done
- Task 12 reducer sets `state.gameDate = YYYY-07-01` (real ACB summer window) — see [[feedback_euro_game_start_date]]
- Tasks 4 + 10 use parallel agent's `sponsorCatalogFetcher.pickSponsorName(league, tier, slot)` instead of obsolete stub
- Task 5 threshold: `< 1` (Test gewinnt über Plan-Prosa `<30`). Real-world equivalent — Endesa-Save hat ~200 Spieler, Fallback feuert nie in Produktion.
- Task 3 TycoonTier: reused statt redeclared.

### Reusable from parallel agent
- `GameState.pendingEuroBankruptcy` field (in T1 bundle) — Phase 1.H Owner-Game-Over hooks into it
- `sponsorCatalogFetcher.ts` `loadSponsorCatalog` + `pickSponsorName` — Phase 1.C `sponsorSeed.ts` calls into it

### Cross-agent touchpoint
`src/App.tsx` setup-phase routing — Phase 1.F (T24) muss prüfen, ob parallel-agent's setup-phase schon dort etwas geändert hat.

### 🐛 Drive-by bug fix this session
- `9edca53` `src/components/schedule/view/components/CalendarView.tsx` — Euro Schedule UI leaked in NBA mode. Tabs `['Endesa', 'EuroLeague', 'Copa del Rey', 'Supercopa']` und Legend-Chips waren unconditionally hardcoded. Fix: `euroIsolated ? [...7 Tabs] : ['Overview', 'Calendar', 'All Fixtures']`, Legend in NBA mode zeigt nur `<N> games`. **Bundle commit** zog auch parallel-WIP von CalendarView.tsx mit (euroIsolated/userInEL derivations + visibleSchedule filter + competitionTabId routing) — 367 insertions / 25 deletions. NextFixturesAside.tsx hat sich silent durch `competitionStats.length > 0` Gate selbst gegated, kein Fix nötig.

### Memory notes locked (this session)
- [[feedback_euro_game_start_date]] — Euro saves start 1 July
- [[project_born_loc_fallback]] — missing `born.loc` → 🏳️ (intentional, NOT 🌐)
- [[project_fa_transfer_market_parity]] — FA + Transfer Market are separate rows, but mirror instruction-modal + bidding-engine + window-check helper
- [[project_euro_setup_hybrid]] · [[project_ai_economy_balance]] — spec indexes

### Phase 2 (queued, after Phase 1 ships)
AI-Economy-Balance spec is final-locked (S=€4–6M med → D=€300–500K, Endesa €40M / EL €100M TV pool 60/40, ±25%/±0.5★/±10% tightening). Write plan after Phase 1 lands.

---

## NEXT SESSION — Codex `/goal` Overnight Run

> **Codex Handoff**: paste prompt from `plans/codex-overnight-goal.md` into Codex CLI. User schläft, Codex erledigt Phase 2+3+Extras autonom.

### Progress update (May 13, 2026)
- **Shipped in worktree:** Euro salary settings UI, medical core mechanics, injury hooks, sponsor-floor formula, SigningModal cash gate, AI cash hard-block, bankruptcy choose-team modal, and `plans/euro-hotel-mood.md`.
- **Additional shipped in worktree:** Euro GM sidebar route split, top-bar cash chip, Front Office detail sections, persisted travel preferences in ledger, deep sponsor negotiation shell, and league-aware regular-season start helper.
- **UI convergence shipped in worktree:** wider Front Office shell, mockup-style financial KPI/cashflow panel, full Medical route polish, dedicated Sponsorships route with portfolio/selected-sponsor rail, and Schedule Calendar header/tab/KPI frame.
- **Additional UI convergence shipped in worktree (May 14):** Schedule right rail + competition-detail dashboards, Staff route + staff-signing modal shell with facesjs portraits, Finance Overview/Graphs/Spreadsheet tabs, Facilities action modals, and Scouting investment/uncertainty-band route.
- **Tycoon mechanics shipped in worktree (May 14):** board promises/confidence, finance recap modal, 14-day payroll cadence, staff hiring persistence, player-drama press conference modal, sponsor archetype/conflict/offseason review hooks, and global non-own scouting fuzz.
- **Verified:** `npm run lint`, `npx tsx scripts/test-tycoon-sponsor.ts`, and `npm run build` pass after the Scouting checkpoint; `npm run lint` also passes after the tycoon mechanics checkpoint.
- **Still open from mega-scope:** loan system. Keep UI copy in English.

### Just shipped (May 12, 2026)
- Phase 1 Sponsorship redesign (`plans/euro-sponsorship-phase1.md`): 8 Slots (kit/sleeve/back/shorts/training/court/stadium/practice), Tier-Lookup-Bug fix, cityPrestige Tabelle, realistische €-Werte, Signing-Bonus mit Sofort-Cashout, Ticket-Price-Slider (50–200%), Stadium-Sponsor-Attendance-Boost, Marquee-Match-Boost (own × avg opp prestige), Star-Power-Boost (NBA-MVP +150%, NBA-Allstar +80%, Euro-Star K2≥80 +30% — "Dominique Wilkins-Effekt"). Neue `Front Office` Sidebar (MY TEAM group, editierbar) + read-only Modus in `TeamFinancesViewDetailed`.
- **Phase 1 Min-Salary Fix (AC-S1/S2/S5 from `plans/euro-medical-dynamic-tier.md`)**: `getContractLimits` + `getMinSalaryUSD` lesen jetzt `euroMinSalaryUSD` / `euroMaxSalaryUSD` in Euro-Mode. SigningModal MIN/MAX = ~€266K – €5M statt NBA-€1.06M – €14.52M. Override-Felder + `euroleagueBRL` in `EURO_ISOLATED_DEFAULTS` (constants.ts) + `LeagueStats` Typ.

### Locked Design (Memory: project_euro_bankruptcy_progression)
- **Tier ist statisches Startlabel**, KEIN prestigeScore/promotion-Mechanik
- **Bankruptcy = natural Cap** (User-override mit boardConfidence-Hit, AI hard block, GAME OVER → "choose your next team" Modal)
- **Sponsor-Floor Tier-Label-unabhängig**: `baseFloor × (1 + 0.10×stadium + 0.15×success + 0.20×city)`
- **Verträge bleiben 1:1** (kein /3 oder /8 wage-scaling)

### Codex `/goal` Scope (5 Goals)
1. **AC-S3/S4** Euro-Mode Commissioner Settings UI (`EconomyContractsSection.tsx`)
2. **AC-M1–M7** Medical Budget Slider + Injury-Hooks + Front Office UI
3. **AC-C1–C6** Cash-Gate Banner + AI block + Sponsor-Floor + Bankruptcy-Game-Over Modal
4. **Cash Indicator** in Top-Nav (€X.XM chip, green/yellow/red, click → Front Office)
5. **Brainstorm-only**: `plans/euro-hotel-mood.md` (Stars verlassen 1-Star-Hotel-Teams)

Stopping conditions + verification in `plans/codex-overnight-goal.md`. User reviews progress in `plans/euro-medical-dynamic-tier-PROGRESS.md` morgens.

### 🔥 Critical — Euro Wage Inflation (LOCKED-IN DESIGN, May 12 2026)

**User-Reframe (wichtig!):** Der eigentliche Bug ist nicht *dass Rio Breogan LeBron für €52M signt*, sondern **dass LeBron überhaupt als Euro-FA-Option sichtbar ist** während er noch im NBA-Prime ist. Die Wage-Inflation ist Symptom, nicht Ursache.

**Symptom**: Rio Breogan (Tier D) zeigt €60M Wages mit NBA-Roster (LeBron/AD/Duren). `budgetEngine.wagesEUR` rechnet `contract.amount × 1000` → behandelt BBGM-Thousands 1:1 als EUR.

**Locked-in Approach (User-Bestätigt: Verträge bleiben 1:1, NO scaling — nur Gates):**

1. **FA-Pool-Gate (Hauptverteidigung, Upstream)**
   - In Euro-Mode: NBA-Prime-Stars (age ≤32 UND (MVP-Award ODER Multi-Allstar)) erscheinen **nicht** im Euro-FA-Pool
   - Sie können *erwogen* werden (`considerOffers: true`) aber `preferStayInNBA = true` → AI-FA-Handler skipped sie
   - Spätkarriere-Stars (age 33+) oder Single-Allstars dürfen rein (Wilkins-Twilight-Path bleibt offen)
   - **Wo:** wahrscheinlich `externalSigningRouter` oder neuer Filter in `AIFreeAgentHandler` für Euro-Mode

2. **Cash-Gate (Soft Warning + Owner-Mood-Hit)**
   - Beim Signing: projected year-end cash = current cash + projected annual budget profit − new contract first-year wage
   - Wenn negativ: **User kann override**, aber Banner zeigt "Vertrag verursacht €Xm Defizit"
   - Owner-Mood -10 pro Override; bei zweitem Override in Saison: GM-Firing-Risiko +20%
   - AI-Mode: Hard block — AI signt nie über Cash hinaus
   - **Wo:** `SigningModal` (User-Path) + `AIFreeAgentHandler` (AI-Path)

**Was wir bewusst NICHT machen:** Vertragsskalierung (kein /3, kein /8). Wenn LeBron im Twilight zu Madrid kommt, verdient er seine vollen €40M+ — das ist *realistic und Teil des Risikos*. Das Cash-Gate macht die Konsequenz sichtbar (Pleite-Banner), nicht die Skalierung versteckt sie.

**Implementation Order:**
1. Layer 1 (FA-Pool-Gate) zuerst — größter Realismus-Gewinn, schließt 90% der Cases
2. Layer 2 (Cash-Gate + Owner-Mood) — UI-Slice mit Banner + Mood-Hit

**Akzeptanz-Checks:**
- [ ] Neue Euro-Save: keine NBA-Prime-MVPs/Multi-Allstars im FA-Pool sichtbar
- [ ] LeBron in Spätkarriere (age 34+, post-prime) erscheint, aber Rio Breogan-Signing zeigt Defizit-Banner
- [ ] Madrid (S-Tier, viel Cash) kann signen ohne Banner wenn Cash ausreicht
- [ ] Override-Path: User kann trotzdem signen, Owner-Mood-Hit sichtbar in Front Office
- [ ] AI signt niemals über Cash hinaus (Hard block für KI-Teams)

### Phase 1.5 — Practice → Player Progression Wiring
- Practice-Sponsor-Quality (`tycoon.sponsorships.practice.valuePerYear / floor`) → small bonus auf `progressionEngine` rate für eigenes Team
- Cap: max +10% Progression-Rate
- UI: SponsorshipCard Practice-Stub-Label durch echten Hinweis ersetzen ("Adds +X to player development this season")

### Phase 2 — Industries + Conflicts (deferred from Phase 1)
- Branchen-Tag pro Sponsor (`SponsorIndustry` ist schon im Type, leer)
- Konflikt-Regeln (kein 2× Bier, kein Bier+Wasser im selben Outfit-Slot, Gambling-Sponsoren payen +50% aber FUTURE Skandal-System)
- Negotiate-Modal zeigt 3–4 konkurrierende Offers aus verschiedenen Branchen (statt single offer)

### Phase 3 — Offseason Task + TV-Market-Share + Scandals
- `SPONSORSHIPS_REVIEW` Offseason-Aufgabe in Sidebar — Outlook-Karte mit Bullets ("Capital-city prestige · EL Final Four · LeBron draws premium sponsors")
- TV-Rights als Market-Share-Pool (Liga Endesa €40M Pool, EL A-License Floor + Performance-Pool) statt flat tier value
- Skandal-System: Gambling-Sponsor → Liga-Reputation-Penalty, kann Boykotte triggern, Doping-Scandal → Sponsor-Exits

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
- Elam/Target-Score sim-wiring is shipped in Session 59. Follow-up only if the live-watch presentation needs a richer dedicated Elam phase UI than the current appended closing segment.

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
