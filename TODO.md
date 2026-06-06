# NBA Commish — TODO

# QUICK FIXXES — MAY 15, 2026

**Status 2026-05-16:** Cleared and shipped. See `CHANGELOG.md` Session 62 plus commit `2c6bec3`.
- Endorsement duplicate signing guarded; legacy duplicate display/load cleanup added.
- Coaching and support-staff offseason rows auto-complete once visible role coverage is full, including the third-assistant case.
- Euro signing path no longer applies NBA cap/MLE hard blocks or player/team-option incentives; cash deficit is a notice.
- Euro Team Intel FA shortlist uses direct signing instead of NBA bid-market auto-bids.
- Transfer Market `Mark Done` is available after the parallel staff/sponsor/facility reviews; premature `Sim to Opening Night` auto-resolve is hidden in Euro mode.
- Empty Youth Promotion auto-completes; promoted academy players no longer keep the row alive; Preseason Friendlies opens an in-place game list modal.
- Facility Upgrades and Annual Budget Review use the read-only operating-plan modal; Facility Review still has `Open Sliders`, Budget Review only locks final values.
- Finance overview states Euro deficits are normal owner-supported operating risk.

**Worktree follow-up 2026-05-20:** Euro offseason board is getting one more polish pass: `My Free Agents` should not start pre-skipped in the Euro checklist, and visible offseason copy should read like in-game summer tasks instead of internal dev labels.

**Worktree follow-up 2026-06-04:** PBA schedule specs are simplified in worktree to avoid NBA-length 22-game cups: Philippine Cup 11 games, Commissioner's Cup 11 games with the current 12-team pool, Governors' Cup 10 games via shortened round-robin. Later implement the real 2025-26 details:
- Commissioner's Cup guest-team mode with Macau Black Bears as a 13th team so each PBA team gets 12 regular-season games.
- Governors' Cup two groups of six, double round-robin within group, 10 games per team, top four per group into crossover playoffs.
- Blackout/window polish for FIBA qualifier breaks and compressed Wed/Fri/Sat/Sun double-header game days.

**Worktree note 2026-06-05:** PBA history/awards surfaces got a copy cleanup pass. Player-facing text should not describe gist/archive/save merge mechanics; future PBA UI passes should keep the same rule.


> Geshippte Sessions liegen in [CHANGELOG.md](./CHANGELOG.md). Dort prüfen, bevor ein Item unten als offen angenommen wird.

---

## ✅ FIXED — All-Star Weekend H-O-R-S-E Event

**Status 2026-06-01:** Implemented in worktree. H-O-R-S-E is Commissioner-enabled, inactive by default, supports 3-10 contestants, player/global no-repeat rules, announcement, Saturday live view, LazySim auto-resolution, H-O-R-S-E winner awards, and a contest-results table matching the All-Star event views.

---

## ✅ FIXED — Spain EuroLeague Wildcard Path

**Status 2026-05-30:** Implemented in worktree. Spain Euro GM mode now keeps Real Madrid, FC Barcelona, and Baskonia as permanent EuroLeague clubs, seeds Valencia as the current open Spanish wildcard on fresh saves, and then assigns the next season's open place to the highest Liga Endesa finisher outside the permanent trio. Endesa setup/briefing now tells non-licensed clubs their EuroLeague goal, and qualifying user clubs receive a “Welcome to EuroLeague” GM modal before the next season.

---

## 🔴 NEXT SESSION FIRST — Jersey Retirement Save Audit / Debug Cheats

**Status 2026-05-18:** Worktree has fixes for raw alexnoob `stats[].jerseyNumber`, blank `pid`/`playerId` matching, stricter auto-retirement scoring, Bill Russell `#6` Team History display, and manual Team History retirement modal separation. Next session should start with real-save DevTools verification, not more guessing.

**First step tomorrow:** run/extend `debugCheats.ts` diagnostics:
- `JERSEYHEAL` then `JERSEYAUDIT` on the affected save.
- Confirm CP3/KLove/Klay/Conley/Horford rows show raw team numbers, sane `scheduledYear`, and no `skip_existing` from blank IDs.
- Add a focused debug table for Team History modal candidates by `teamId`, including `player`, `team`, `number`, `retiredYear`, `scheduledYear`, `outcome`, `source` (`auto` vs `manual-save-era`), and raw `stats.tid` counts.
- Specifically verify Memphis does not surface Phoenix-only old legends (Steve Nash/Jason Kidd), and Warriors does not surface Elvin Hayes in the Klay modal.

**Open risk:** old imported/historical retired players may have shifted `stats.tid` in existing saves. If audit confirms contaminated saved stats, add a targeted save-heal cheat before changing UI rules again.

---

## 🟡 IN PROGRESS — Long File Refactor Pass

**Status 2026-05-21:** Started with a dedicated plan in `LONG_FILES_REFACTOR_PLAN.md`.

- Phase 1 targets `src/components/offseason/OffseasonAufgaben.tsx` first.
- Goal: extract shared helper logic and row-signal/date utilities without changing offseason behavior.
- Follow-up phases will cover `AIFreeAgentHandler`, `simulationHandler`, `GameContext`, `useRulesState`, `SigningModal`, `EuroTransferMarketView`, and finally `types.ts`.

**Status 2026-05-23 handoff:** marathon pass paused here by user after verified reductions to `GameplanTab`, `OpenMarketModal`, `DraftSimulatorView`, `CoachingView`, `DefenseTab`, `FreeAgentsView`, `PlayerCreatorView`, `CalendarView`, `PlayButton`, `EuroTransferMarketModals`, `PersonSelectorModal`, `externalRosterService`, and `PlayerBioMoraleTab`. Current evidence:
- `npm run lint` passes.
- `src` files over `499` lines: `41` total.
- `src/components/central/view/PlayerBioMoraleTab.tsx` is now `258`; shared extract `src/components/central/view/playerBioMoraleShared.tsx` is `473`.
- `src/components/central/view/LeagueFinancesView.tsx` is now `257`; shared extract `src/components/central/view/LeagueFinancesViewShared.tsx` is `499`.
- `src/components/central/view/RealStern.tsx` is now `334`; extracts: `realSternShared.tsx` `96`, `realSternCards.tsx` `377`, `realSternViews.tsx` `294`.
- `src/components/central/view/SportsBookView.tsx` is now `305`; extracts: `SportsbookViewSections.tsx` `344`, `SportsbookMyBetsTab.tsx` `200`.
- `src/components/training/TrainingCenterView.tsx` is now `499`; extracts: `trainingCenterShared.ts` `151`, `TrainingCenterChrome.tsx` `256`.
- Large generated/data blobs still above the gate are expected separate work: `src/data/names.json`, `src/data/2kImport/captions.ts`, `src/data/collegeTeamCatalog.json`, `src/data/coaches/nbacoachesratings.json`, and raw `src/data/2kImport/raw/...` text dumps.

**Remaining runtime/source hotspot queue from actual measurement on 2026-05-23:**
- `src/utils/debugCheats/implementation.ts` — `2793`
- `src/store/logic/gameLogic.ts` — `1320`
- `src/throne/components/TheThroneGame/index.tsx` — `925`
- `src/services/simulation/GameSimulator/engine.ts` — `899`
- `src/services/scoutingReport.ts` — `884`
- `src/components/expansion/ExpansionDraftSetupModal.tsx` — `861`
- `src/TeamTraining/components/SystemProficiencyView.tsx` — `841`
- `src/services/news/lazySimNewsGenerator.ts` — `812`
- `src/utils/helpers.ts` — `808`
- `src/services/playerDevelopment/ProgressionEngine.ts` — `804`
- `src/constants.ts` — `797`
- `src/constants/ruleDefinitions.ts` — `793`
- `src/components/central/view/TeamOffice/pages/TradingBlock.tsx` — `791`
- `src/components/commissioner/rules/view/EconomyTab.tsx` — `782`
- `src/components/CommissionerSetup.tsx` — `768`
- `src/components/shared/GameSimulatorScreen.tsx` — `767`
- `src/components/modals/SettingsModal.tsx` — `756`
- `src/services/genDraftPlayers.ts` — `754`
- `src/components/international/InternationalLeagueHub.tsx` — `751`
- `src/services/simulation/StatGenerator/initial.ts` — `745`
- `src/components/central/view/FrontOffice/sections/StaffSection.tsx` — `745`

**Next-session advice:**
- Resume from the measured queue above, not memory.
- Prioritize runtime/UI/service files before data/generated blobs.
- Rerun `npm run lint` after every integration and refresh the over-500 count before claiming progress.

---

## 🟡 FOLLOW-UP — AI Staff Firing Logic

**Status 2026-05-19:** Deferred for a future session. Staff FA backfill, rollover expiries, and commissioner-fire autofill are handled in worktree; this follow-up is only about smarter AI decision-making.

- Add AI staff/coaching firings driven by performance vs expectations instead of only contract expiry/retirement churn.
- Core signals to weigh:
  - actual wins / playoff result vs owner or board expectations
  - repeated losing seasons / patience counters
  - roster quality underperforming results
  - financial stress for Euro clubs
- Expected behavior:
  - impatient owners should fire weak-performing head coaches sooner
  - stable owners should tolerate short slumps and youth-rebuild seasons
  - replacement hiring should reuse the existing `staffFreeAgents` + backfill pipeline, not a separate one-off path
- Scope to inspect when this is picked up:
  - `src/services/staff/nbaRealStaffSeed.ts`
  - `src/services/euro/evaluateSeasonForOwner.ts`
  - `src/store/logic/seasonRollover.ts`
  - `src/store/logic/actions/playerActions.ts`

---

## 🟡 FOLLOW-UP — Post-Career Paths After Staff Join

**Status 2026-05-28:** Retired-player staff-list joins are in-flight in worktree. Future paths should expand the same post-career review/pool model instead of bolting on separate hidden lists.

**Status 2026-05-30:** Staff retirement/age-out model and offseason review UI are now worktree-only. Season rollover stores `staffRetirementAnnouncements`, clears retired staff from active roles, and shows a Staff Retirements task before Staff Signings. Euro isolated mode also has a custom retired-player summary without Hall of Fame or jersey retirement handling.

- Add a broadcasting-list roll after retirements, shown beside HOF/jersey/staff outcomes.
- Expand death probabilities/cause tables toward more realistic age-banded real-world distributions; current daily pass is date-based and save-stable, but the cause mix is still game-tuned rather than actuarial.

---

## 🟡 FOLLOW-UP — Euro Rotation Depth / Minutes Distribution

**Status 2026-05-20:** User-requested gameplay tuning. EuroLeague / ACB rotation logic should reflect deeper European bench usage instead of NBA-style starter overload.

- Enforce a minimum of 8 players at roughly `12+ MPG` in EuroLeague / ACB rotation builds.
- Flatten the minutes cliff between starters and bench so the `6th` and `7th` men land closer to `18-24 MPG`, not token `5-6` minute scraps.
- Keep the Euro/FIBA team minute budget behavior, but distribute it across a deeper playable group by design.
- Expected behavior:
  - Euro rotations should look deeper and flatter than NBA rotations.
  - Bench specialists should stay in the real rotation instead of being functionally unused.
  - Auto-generated rotations, ideal rotations, and any coach/gameplan reseed path should agree on the deeper Euro pattern.
- Scope to inspect when this is picked up:
  - `src/services/simulation/StarterService.ts`
  - `src/components/central/view/TeamOffice/pages/CoachingView/IdealRotationTab.tsx`
  - `src/store/idealRotationStore.ts`
  - `src/store/logic/gameLogic.ts`

---

## 🟡 FOLLOW-UP — Retired Jersey Number Guard Everywhere

**Status 2026-05-18:** Low-priority hardening. Draft picks, FA signings, and roster normalization already route through retired/reserved jersey-number checks. Later, audit the lower-probability write paths (`PlayerCreatorView`, external-league generated fillers, one-off manual roster moves) so every path that assigns a player to a team avoids `team.retiredJerseyNumbers` and reserved future-retirement numbers.

---

## ✅ FIXED — Euro Offseason Starts While Endesa Playoffs Are Still Active

**Status 2026-05-18:** Fixed in worktree. `competitionResolver` now exposes unresolved Euro season-competition detection; `GameContext` and `offseasonPlan` treat active Endesa/EuroLeague completion as postseason-active, blocking Offseason Tasks and rollover until champions resolve. `debugCheats.ts` now surfaces the condition in `STUCK`/`PHASEDUMP`, and PlayButton hides EuroLeague jumps for non-qualified Euro GMs.

**Observed 2026-05-16:** On `Jun 18, 2026`, the Liga Endesa bracket is still visible/in progress (QF complete, semifinals not started), but the right sidebar already shows **Offseason Tasks** (`Transfer Market`, sponsor renewals, facility upgrades, annual budget review, youth promotion, preseason friendlies, training camp). Bottom CTA says transfer window closed / finish staff-sponsors-facilities.

**Bug:** Euro isolated mode can enter offseason-task mode before domestic postseason completion/champion resolution.

**Expected invariant:**
- Do not mount/show offseason checklist rows until all active Euro competitions that define season completion are resolved, especially Liga Endesa playoffs/finals.
- `Transfer Market`, sponsor review, budget review, youth promotion, preseason friendlies, and training camp must remain hidden/locked while the Endesa bracket still has unplayed knockout games.
- `Sim to Champion` / bracket simulation should stay the primary flow until Endesa champion is resolved.
- After champion resolution, then enter offseason task mode and open the correct July transfer-market/offseason sequence.

**Likely files to inspect:**
- `src/services/offseason/offseasonState.ts`
- `src/components/offseason/OffseasonAufgaben.tsx`
- `src/store/logic/seasonRollover.ts`
- `src/components/competition/CompetitionBracketView.tsx`
- `src/services/competition/competitionResolver.ts`

---

## 🆕 PLANNED — Youth Academy → NBA Draft Declaration (Euro-Mode bridge)

**Idee:** Euro-Youth-Spieler (15-19 auf User-Team) "deklarieren" sich für den NBA Draft, sobald sie eligible werden. Reale Vorlage: Luka Dončić verlässt Real Madrid für den 2018 Draft. Aufgabe im Offseason zeigt nur, wenn 1+ Spieler eligibility erreicht.

### Recherche-Notizen (gemacht 2026-05-15)
- **Draft-Eligibility-Regel** liegt in `leagueStats.draftEligibilityRule`. Default `'one_and_done'` (Mindestalter 19). Andere: `prep_to_pro` (17+), `hardship`, `pre_1970s`.
- **100-Player-Cap** ist `TARGET_CLASS_SIZE` in `src/services/draftClassFiller.ts:20`. Filler läuft bei Init + jedem Season-Rollover und füllt 4 Jahre (current + next 3) auf 100 pro Klasse auf. Erkennung: `p.tid === -2 && p.draft.year >= currentYear`.
- **Wann passiert es:** Rollover läuft Mitte Juni (nach Finals). Wenn der Youth-Spieler im aktuellen Offseason "declared", landet er bei `tid = -2` mit `draft.year = currentYear + 1` (also nächstes Jahr Draft). User-Frage "ist das beim Rollover, also nächster Jahr Draft?" → **Ja.** Declaration ist eine Aktion *in der aktuellen Offseason*, der Draft selbst läuft erst nächstes Jahr Juni.
- **Wo Youth lebt:** `AcademySection` filtert `players.filter(p => p.tid === userTeamId && computeAge(p) >= 15 && <= 19)`. Nach Declaration → `tid = -2`, raus von der Team-Roster, rein in den Prospect-Pool.

### Geplante Implementation
- **Detection-Hook** in `OffseasonAufgaben.tsx`: zähle Players mit `tid === userTeamId && age === 19 (oder eligibility-rule-Threshold) && status === 'Active'` für aktuelles Euro-Team. Wenn `>= 1` → Row `draftDeclarations` 'pending' sichtbar; sonst `skipped`.
- **Neuer OffseasonChecklistRow** `'draftDeclarations'`, eingehängt **NACH** `youthPromotion` (Promotion entscheidet erst, ob Spieler in Senior-Squad rückt; Declaration kommt danach für die, die nicht promotet wurden ODER trotz Promotion in NBA wollen).
- **Modal in Sidebar** (Pattern wie `YouthPromotionPanel`): Liste der eligible Players mit Portrait, Age, OVR/POT (K2), Recommendation ("NBA Caliber", "Good Prospect"). Pro Spieler 2 Buttons: **Declare** (→ tid=-2, draft.year=nextYear, status='Draft Prospect') oder **Stay One More Year** (bleibt auf Team-Roster für eine weitere Saison).
- **100-Cap-Check**: vor jedem Declare prüfen `count(tid=-2, draft.year=nextYear) < 100`. Falls voll: Button disabled + Hinweis "Draft class is full this year — try again next offseason." `draftClassFiller` muss beim nächsten Rollover-Run die deklarierten Spieler korrekt mitzählen (tut er bereits, da Counter nur `tid === -2` braucht).
- **Spawn-Pipeline-Adjust**: `draftClassFiller.ensureDraftClasses` subtrahiert deklarierte Spieler vom Need-Count automatisch (current logic: `need = 100 - have`; have inkludiert nun auch declared Euros).
- **AI-Auto-Declare** für nicht-User-Teams: GMs entscheiden basierend auf POT-Threshold + Roster-Position. Liegt in `runAIDraftDeclarations` (neu in `services/AIDraftDeclarationHandler.ts`).

### Offene Fragen (vor Coding klären)
- Soll User-Team-Player **automatisch** declared werden wenn 100-Cap noch nicht erreicht und Recommendation = "NBA Caliber"? Oder immer manuell?
- Was passiert mit `contractYears` und `salary` beim Declare? Free-Agent-Status für den Spieler bis er gedraftet wird, oder fix beendet?
- Soll die Row in NBA-Mode auch sichtbar sein (NBA-Team mit Youth-Academy)? Wenn User-Team NBA ist, brauchen sie keine "declare" — der Spieler ist ja schon im System.

---

## 🆕 PLANNED — Travel Fatigue + Route Visualization

**Spec:** `docs/travel-fatigue-spec.md`

**Why now:** the repo already has `travelPreferences` UI/ledger plumbing and a real `trainingFatigue` simulation path. The missing work is the bridge between schedule travel and existing fatigue systems.

### V1 target
- Compute team-level travel stress from distance, timezone shift, back-to-backs, compressed road stretches, altitude, and international travel.
- Feed that stress into `trainingFatigue` as a small additive daily modifier instead of creating a second fatigue system.
- Surface the impact in Schedule and Front Office with badges like `Jet lag risk`, `Cross-country`, and `3 in 4`.

### Files likely involved
- `src/services/training/trainingTick.ts`
- `src/utils/playerRatings.ts`
- `src/services/simulation/InjurySystem.ts`
- `src/services/simulation/GameSimulator/engine.ts`
- `src/components/central/view/FrontOffice/sections/TravelSection.tsx`
- `src/components/tycoon/TravelLogisticsCard.tsx`
- `src/components/schedule/...`

### Important constraint
- Build the mechanic first.
- Add the route map second.
- Full Three.js globe is polish, not phase 1.

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
- **Worktree continuation (May 15, Codex):** Tasks 6-13 and 25-30 are now implemented in the worktree, not committed.
  - T6 `src/services/staff/staffFallback.ts`: placeholder Coach/GM generators accept optional dynamic nationality pools; generated non-NBA staff uses `buildCoachNationalityPool`.
  - T7 `src/services/euro/tierBudgetSeed.ts`: deterministic tier/budget seeder added.
  - T8 `src/services/euro/staffSeed.ts`: deterministic six-role staff seeder added (HC/AC/Sports Science/Physio/Scout/Analytics), tier affects reputation.
  - T9 `src/services/euro/ownerSeed.ts`: deterministic owner profile seeder added; tier biases wealth/vision/patience, runtime counters start clean.
  - T10 `src/services/euro/sponsorSeed.ts`: sponsor review seed slots wired to `sponsorCatalogFetcher` when catalog is loaded; returns pending/empty before load.
  - T11 `src/services/euro/careerSeed.ts`: career setup orchestrator combines tier/budget, staff, owner, sponsors, rerolls, and manual overrides.
  - T12 `src/types.ts` + `src/store/GameContext.tsx`: `INIT_EURO_CAREER` writes owner profile, tier, starting budget, six staff, seeded sponsors, setup memo, user team, and July 1 Euro start date into the save.
  - T13 `src/store/GameContext.tsx`: `LOAD_GAME` heals legacy Euro GM saves missing `autoOwnerSeeded` by deterministically restoring owner/staff/setup sponsor state and marking the seed flag.
  - Setup wiring `src/components/CommissionerSetup.tsx` + `src/App.tsx`: Endesa franchise pick now opens a minimal Euro Career Setup review, then starts the save and dispatches `INIT_EURO_CAREER`. This is the functional wiring path; the polished standalone card/edit-modal pass remains deferred.
  - T25 `src/services/euro/staffPool.ts` + `src/store/GameContext.tsx`: Euro setup and legacy LOAD_GAME heal now seed a 50-person `staffFreeAgents` pool and mark `staffPoolSeeded`.
  - T26 `src/store/logic/gameLogic.ts`: crossing a calendar month in Euro GM mode refills the generated staff pool with 5-10 new candidates.
  - T27 `src/components/central/view/FrontOffice/sections/StaffSection.tsx`, `StaffSigningModal.tsx`, `FrontOfficeView.tsx`: staff signing uses generated `state.staffFreeAgents`, removes hired staff from the pool, and has a low-rated emergency fallback if a role has fewer than 3 candidates.
  - T28 `src/services/euro/evaluateSeasonForOwner.ts`: owner season outcome evaluator added for WinNow/Frugal/Develop visions.
  - T29 `src/services/logic/seasonRollover.ts`: Euro year-end ledger now ticks owner patience for NBA and non-NBA Euro clubs; user-team owner patience failure routes through the existing Euro game-over modal.
  - T30 `src/components/tycoon/EuroBankruptcyModal.tsx`: modal now includes non-NBA Euro takeover candidates and offers owner cash injections when wealth/cooldown rules allow.
  - Verification mode adjusted per user request: no new test files going forward; previously added T7-T11 test files were removed. Use `npm run lint`, `npm run build`, and in-app Euro setup/manual checks.
  - Verification so far: `npm run lint` PASS after Euro setup/staff/owner wiring and the May 15 Transfer Market/Gameplan recovery patch.
  - Drive-by Euro leak fix: Team Intel Euro mode defaults to `Expiring` and hides the Free Agency board; Transfer Market now renders/listings only for real rostered seller players.
  - May 15 recovery fix: Euro Tasks now include `Transfer Market`, sponsor renewals, facility upgrades, preseason friendlies, and training camp in the checklist order; NBA-only FA/draft/HOF rows are skipped, July 1 starts on Transfer Market, Training Camp stays later, and transfer-window settings are force-enabled on setup/load.
  - May 15 recovery fix: Coaching profile reads generated staff `careerStartYear`/`bornYear`/`nationality`, and Gameplan uses Euro roster-aware starter seeding plus FIBA `200` minute budget instead of NBA `240`.

### 📋 Offen (Phase 1 tracker — TaskList #6–#32)
- **1.A** Types + Infra (T1–T4) — **✓ DONE**
- **1.B** Nationality Pool (T5–T6) — **T5 done**, **T6 done in worktree (uncommitted)**
- **1.C** Seed Generators (T7–T11): **T7/T8/T9/T10/T11 done in worktree (uncommitted)**
- **1.D** Reducer + LOAD_GAME (T12–T13): **T12/T13 done in worktree (uncommitted)**
- **1.E** Review UI (T14–T23): minimal inline review is wired; standalone SectionGroup/cards/edit modals pending
- **1.F** App wiring (T24): functional setup → review → START_GAME → INIT_EURO_CAREER path done in worktree; standalone `euroReview` phase shape pending
- **1.G** Staff-Pool (T25–T27): **T25/T26/T27 done in worktree (uncommitted)**
- **1.H** Owner Mechanics (T28–T30): **T28/T29/T30 done in worktree (uncommitted)**
- **1.I** Smoke (T31–T32): migration snapshot test + manual QA — Pending
- Final code review — Pending

### Plan adaptations done
- Task 12 dispatcher case sets `state.date = Jul 1, {seasonYear - 1}` (real ACB summer window) because this app stores display dates in `GameState.date`, not `gameDate/currentDate`.
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
