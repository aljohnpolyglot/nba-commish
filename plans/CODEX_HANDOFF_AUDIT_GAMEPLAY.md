# Codex Handoff — Euro-Isolated Audit & Gameplay (UPDATE 2026-05-11)

**Repo:** `C:/Users/user-MSI/Downloads/nba-commish` (NBA Commish Sim — React + TS + Vite, IDB save)
**Branch:** `master` — recent commits in `git log --oneline | head -30`. The Tycoon MVP (T1+T2+T8), Euro-cleanup sweep, FIBA-cadence fix, setup-flow Euro-bypass, sponsor-renewal gates, in-season event toast, year-end gate are all shipped.
**Mode in scope:** `uiMode === 'euro_isolated'` GM saves (Spain template). User has been browser-testing for days and the UX is **still unusable** — too many remaining bugs to chase in a single-agent conversation. Hand-off to Codex for an autonomous audit + fix pass.

> **Read this file in full before touching anything.** Then read `plans/euro-isolated-spain-mvp.md` (the master plan) and `plans/CODEX_HANDOFF_EURO_MVP.md` (the original handoff with autonomy rules + decision principles — those rules still apply verbatim here).

---

## Top-priority blockers (from user, 2026-05-11 session)

These are observed in actual gameplay — user copied screen text directly. They are NOT cosmetic; they break the user's understanding of game state. Fix in this order:

### P0-A: `LeagueFinancesView` Euro-branch renders NBA teams

**Symptom (verbatim from user save):**
```
League Finances
Euro budget overview for active domestic clubs.

#    Club                       Budget Tier   Wage Bill   Sponsorship   EL 3yr   Profit Projection
1    Houston Rockets            A             €218.60M    €39.35M       0        €52.46M
2    New York Knicks            A             €213.18M    €38.37M       0        €51.16M
3    Golden State Warriors      A             €203.55M    €36.64M       0        €48.85M
4    Cleveland Cavaliers        A             €201.78M    €36.32M       0        €48.43M
…
10   Los Angeles Lakers         A             €191.74M    €34.51M       0        €46.02M
```

**What's broken (multiple layers):**

1. `state.teams` contains **NBA teams** in this Euro save. The Euro-branch at `LeagueFinancesView.tsx:480-489` correctly checks `isEuroIsolatedMode(state)` and calls `getActiveLeagueTeams(state).map(...)`, but `getActiveLeagueTeams` returns whatever `state.teams` contains — and in this save that's still the NBA 30. The root cause is **either** the Spain setup never replaced `state.teams` with Endesa clubs, **or** a LOAD_GAME path left NBA teams in state when the save was migrated.
2. Even if teams were right, the Euro-branch math is fake:
   - `sponsorship = payroll × 0.18` — payroll-derived, ignores `team.tycoon.sponsorships`
   - `profit = payroll × 0.24` — same problem
   - `budgetTier = payroll > 25M ? 'A' : ...` — payroll-derived, ignores `team.tycoon.tier`
3. `payroll` is `getTeamPayrollUSD(...)` which returns USD numbers but they get formatted as EUR via `formatCurrencyWithCode(value, 'EUR', false)`. That's why Houston shows €218M — it's actually $218M of NBA payroll mis-labeled.

**Required fix:**

- a) **Audit `state.teams` after a fresh Spain setup.** Use the DevTools snippet from `CLAUDE.md` to dump `state.teams.map(t => ({ id: t.id, name: t.name, region: t.region }))` from a newly-created Spain save and from a "broken" save like the user's. Identify whether the setup pipeline actually loads Endesa rosters or whether the bug is in `getActiveLeagueTeams`.
- b) **Make `LeagueFinancesView` Euro-branch read from `team.tycoon`** — sponsorship from `team.tycoon.sponsorships` (sum of 3 slots), tier from `team.tycoon.tier`, profit projection from `team.tycoon.ledgerHistory[last]?.profit` (or live-compute via `computeAnnualBudget`).
- c) **If `state.teams` IS supposed to stay NBA** (because we wanted NBA simming silently in background per `plans/euro-isolated-spain-mvp.md` AC-10), then the Euro-branch should source from `state.nonNBATeams` filtered to active competition. **Spec it explicitly in `getActiveLeagueTeams` doc-comment.**

**Files to touch:**
- `src/utils/teamLookup.ts` — `getActiveLeagueTeams` definition + behavior
- `src/components/central/view/LeagueFinancesView.tsx:480-516` — rewire the Euro-branch
- `src/store/logic/initialization.ts` — verify Spain setup replaces or augments state.teams correctly
- `src/store/GameContext.tsx LOAD_GAME` — verify Euro migration doesn't leak NBA teams

---

### P0-B: User has no idea what phase the game is in

**Verbatim:**
> "ich weiss nicht playoff schedule. kein user friendly. weiss nicht wenn elimination oder copa sind. ux ist shit"
> "warum gibs zwei playoffs. kalender weiss nicht wenn playoffs ist oder offseason aufgabe haben"
> "lazy sim. ich weiss nicht was ist passiert im dem game"

The Euro user can't answer basic questions:
- "Are we in the regular season or the playoffs?"
- "When is the next Endesa playoff game?"
- "Did we get eliminated already?"
- "What is Copa del Rey and when does it happen?"
- "What just happened during that lazy-sim run?"

**Root causes (work through these):**

1. **Calendar has no phase banner.** The DayView shows games but doesn't say "Endesa Regular Season — Round 22 of 34" or "Endesa Playoff Quarterfinal, Game 2". Add a top-of-calendar banner that reads the active competition's current phase.
   - Hook: `src/services/competition/competitionResolver.ts` already knows the phase per spec.
   - Surface: `src/components/central/view/CalendarView.tsx` (or wherever the day grid lives).

2. **PlayButton has Euro-aware labels** (per `session_2026_04_15` notes) but doesn't tell the user **what just happened** when sim runs across a phase boundary. Add a brief modal/toast after every lazy-sim run that crosses a milestone (regular-season-end, QF-start, Copa-final, season-end).
   - Hook: `lazySimRunner.ts` already breaks on tycoon events; add a similar break-and-notify for competition phase transitions.

3. **Bracket view exists but is buried.** `CompetitionBracketView` is in the Aside, the Aside is one click deep from `Euroleague` / `Liga Endesa` tabs. Users don't browse there until they're already lost. Add a "Next Big Game" card to the **TeamOffice → Home** page that pulls from the user team's upcoming fixtures and labels the competition + round/stage. Real Madrid sees "Endesa Round 22 vs. Joventut — Friday" AND "EuroLeague QF Game 2 vs. Olympiacos — Tuesday".

4. **Two playoffs?** User reports seeing what looks like two playoff brackets simultaneously. Likely cause: when Spain save is created, the **NBA playoffs ALSO get scheduled** because `state.teams` is NBA and the NBA playoff generator still fires at April 16. In a Euro save the user shouldn't see NBA playoffs at all. Audit `src/services/playoffs/playoffGenerator.ts` (or wherever the NBA playoff scheduler lives) and gate it behind `!isEuroIsolatedMode(state)`. Same for the bracket UI route.
   - Suspected files: `playoffGenerator.ts`, `seasonRollover.ts`, `autoResolvers.ts` playoff event.

5. **Lazy sim is silent.** When user clicks "Sim to End of Endesa" the loading screen runs, then drops them back at a date with no recap of what happened. Add a post-sim summary card: "Sim ran Dec 1 → Apr 15. Real Madrid finished 24-10 (3rd in Endesa). Eliminated in EuroLeague QF by Olympiacos. Won Copa del Rey."
   - Hook: `lazySimRunner.ts` collects `simResults`; add a summary aggregator and surface it via existing `LazySimLoadingScreen` end-card OR a new modal.

---

### P0-C: Offseason in Euro is fragmented

User can't tell when offseason starts, what tasks are pending, what's been auto-completed. The sidebar (`OffseasonAufgabenSidebar`) is supposed to be Euro-aware (slices 14+15 of Tycoon MVP), but:

- The sidebar only shows when `state.offseasonChecklist` is initialized. Verify Spain saves initialize it at the right moment (Endesa final / EL Final Four).
- Some rows still wrap NBA-only flows (`options`, `qualifyingOffers` exist in Euro list but underlying handlers are NBA-tuned).
- The `facilityUpgrades` row auto-completes on click because no UI exists — that's MVP-stub but confusing. Either build a placeholder FacilityUpgradeModal (read-only "coming soon" card) or drop the row from `getVisibleOffseasonRows`.

**Required:**
- Walk through the entire offseason sequence in a Spain GM save, document each row's actual behavior, and tighten any NBA leak. Document the expected sequence + flow in this file as "Definition of Done — Euro Offseason".

---

### P0-D: `tradesAllowed === false` kills NBA-background trades too

**Verbatim from user:**
> "trades are off. eben im NBA gameplay im background hat keine trades! lol wtf!!! musst anders sein dem rules"

**The bug:** `EURO_ISOLATED_DEFAULTS.tradesAllowed = false` (set in `src/constants.ts:504`) was meant to disable the user-facing Trade Machine / Trade Hub / Trade Finder / Trade Proposals in Euro mode. **But it also short-circuits the AI trade handler that runs the simulated NBA league in the background.** That means: in a Spain save, NBA teams sim full 82-game seasons but **make zero trades** all season. NBA stops feeling like a real league.

**Required architectural fix:** `tradesAllowed` is currently a **single global flag**. It needs to be split into two concepts:

1. **`tradesUIVisible`** (or `userCanTrade`): controls whether the user sees trade UI surfaces (Trade Machine, Trade Hub, Trade Finder, Trade Proposals, "Propose Trade" buttons everywhere). Defaults to `false` in Euro mode.
2. **`backgroundTradesEnabled`** (or `aiTradesEnabled`): controls whether the AITradeHandler runs its internal NBA-league simulation. Should be `true` in Euro mode for NBA-background, `true` in NBA mode.

Or more semantically: keep `tradesAllowed` as user-visible toggle but **make the AITradeHandler always run for NBA teams** regardless of `tradesAllowed` (since the user never sees those NBA trades in Euro UI anyway — they're invisible state changes).

**Audit checklist:**
- `src/services/AITradeHandler.ts` — find every check that uses `state.leagueStats?.tradesAllowed === false` and decide: is this user-facing, or background? Background → remove the gate.
- `src/services/simulationHandler.ts` / `lazySimRunner.ts` — same check; the AI trade tick should run for NBA tids (0–99 in NBA mode; 100+/-1 not applicable) even when uiMode=euro_isolated.
- Search `grep -rn "tradesAllowed" src/` and audit each match.

**User-facing surfaces that must STAY gated (don't regress):**
- `NavigationMenu.tsx` — hide Trade Hub / Trade Finder / Trade Proposals tabs
- `PlayerActionsModal.tsx` / `TradingBlock.tsx` — hide "Trade Player" action
- All trade-related modals — block opening in Euro
- News templates — don't push NBA trade news to the Euro user's feed (their feed should be Endesa-centric)

**Files likely to touch:**
- `src/services/AITradeHandler.ts`
- `src/services/simulationHandler.ts`
- `src/services/logic/lazySimRunner.ts`
- `src/constants.ts` (split flag, plus migration in LOAD_GAME for old saves)
- `src/types.ts` (LeagueStats flag definition)

---

### P0-E: No service years / contract progression for Endesa players

**Verbatim:**
> "kein service years contracts und so weiter"

**The bug:** Endesa players' `stats[]` arrays are static after initial roster load. No new season rows get appended, no contract years tick down, no `yearsOfService` accumulates. Result:
- Player Bio shows the same "3 years experience" forever even after sim'ing 5 seasons
- Re-sign offers can't compute based on tenure (because `yearsOfService = stats.filter(s => !s.playoffs && (s.gp ?? 0) > 0).length` returns the same number every year)
- Contracts don't expire → roster never churns → Endesa clubs play the same 12 guys for a decade
- Aging is invisible to the user

**Required:** treat Endesa/EuroLeague players like NBA players in **all per-season ticks**:

1. **Stats append:** After each Endesa/EL season, every player on the active roster needs a new `player.stats[]` row appended with their season totals. Currently the box-score writer writes per-game stats but doesn't roll them up to season totals for Euro tids. Check `src/services/simulation/MinutesPlayedService.ts` and the stats aggregator in `simulationService.ts`.

2. **Contract expiry tick:** `seasonRollover.ts` already handles contract expiry for NBA tid (0–99). Confirm it ALSO ticks contracts on Endesa-tid players. If `tid` lookup is filtered to `tid >= 0 && tid < 100`, Euro players sit on a separate offset and miss the tick. Audit `seasonRollover.ts` contract-expiry block.

3. **Age tick:** `player.age` and `player.born.year` (`leagueYear - born.year` is canonical per CLAUDE.md). Confirm `state.leagueStats.year` advances each season AND nothing about Endesa players prevents the age calc from working. Spot-check: take a 26-year-old Endesa player in a save, advance 3 seasons, verify the Bio shows 29.

4. **Free agency for Endesa:** when a contract expires, the player either re-signs with the same club (loyalty-based) or hits the Euro FA pool. Currently `AIFreeAgentHandler` runs only NBA. Either:
   - Extend `AIFreeAgentHandler` to handle Endesa/EL pools (probably overkill for MVP — Endesa has different contract conventions)
   - Or write a minimal `EuroAIFreeAgentHandler` that does same-club re-sign with 90% probability, else churns to a different Euro club or retires.

5. **Retirements + Hall of Fame:** Euro players should retire at age 35+ with declining ratings. `retirementChecker.ts` should run on Endesa/EL tids too. Hall of Fame entries for legendary Euro players could be wired later (P2).

**Files likely to touch:**
- `src/services/logic/seasonRollover.ts` — extend contract-expiry + age tick to Euro tids
- `src/services/simulation/MinutesPlayedService.ts` (or wherever stats roll-up happens) — append per-season stats for Euro tids
- `src/services/playerDevelopment/retirementChecker.ts` — extend to Euro tids
- `src/services/AIFreeAgentHandler.ts` OR a new `src/services/EuroAIFreeAgentHandler.ts`
- `src/types.ts` — verify `NBAPlayer.stats[]` schema includes a `season` field that survives the Euro path (it does, but confirm)

**Verification:**
- Take a Spain save at season 1, dump a Real Madrid player's `stats[]`, `contract`, `age`, `born.year`
- Advance 3 seasons via lazy-sim
- Re-dump: `stats[]` should have 3 new entries, `contract.exp` should have ticked down or rolled, `age` should be +3

---

### P0-G: Non-EuroLeague clubs as the test path (domestic-only mode)

**Verbatim from user:**
> "macht non-eligible. vielleicht ich teste zu erst mit non-eligible Euroleague Spain Teams, nur domestic um das zu testen. kein EuroLeague im UI und danach in der Zukunft ein EuroCup-Qualifikation um EuroLeague zu erreichen"

**The insight:** Real Madrid / FC Barcelona play BOTH Endesa AND EuroLeague — that's the most complex case (dual competition, alias-map between tids, roster sync between leagues, two parallel brackets). The user wants to test the simpler case FIRST: a mid-tier Endesa club that is **NOT in EuroLeague**, so the entire EL hub / EL schedule / EL-related UI is suppressed for that save. Get domestic-only working clean, then layer EL on top.

**Required (MVP test path):**

When the user picks a club that has no EuroLeague entry for the current season (e.g. Burgos, Granada, Manresa, Andorra in most years), the save should:

1. **Hide the Euroleague tab entirely** in NavigationMenu / sidebar. Only Liga Endesa shows.
2. **Suppress EuroLeague schedule generation** for this save (`competitionScheduler` should skip the EL spec if the user's club isn't an active EL team AND no other Endesa club is — but for solo testing, even with Real Madrid + Barça's EL games, the USER's hub UI just shouldn't surface EL).
3. **Configurable per-save:** the user could pick Real Madrid and still want "domestic-only test mode" — so this should be a setup-time toggle OR a club-eligibility lookup driven from the Spain template.
4. **Schedule cadence stays the same:** Endesa games weekly, no midweek EL game for the user's club. Roster doesn't need EL-side sync.

**Two implementation paths — pick the simpler one for MVP:**

- **Path A (eligibility-driven):** Spain template lists each club's `competitions: ['endesa', 'euroleague']` or `competitions: ['endesa']`. The user's selected team's `competitions` list determines what UI / schedule surfaces. Real Madrid → both. Burgos → only Endesa. Cleanest semantically.
- **Path B (setup toggle):** Setup adds an "include EuroLeague?" checkbox in the Spain franchise picker. Defaults to YES for EL-eligible clubs, allows the user to opt-out for any club. Easier to ship, but requires a per-save flag.

**Recommendation: Path A.** It mirrors real life (Burgos genuinely isn't in EL) and avoids a "fake test mode" feel. Path B can be added later as a debug-only override.

**Files likely to touch:**
- `src/services/competition/specs/spain.ts` — add `eligibleClubs: ['Real Madrid', 'Barcelona', 'Valencia', …]` to the EL spec
- `src/utils/uiMode.ts` — add `userClubInCompetition(state, competitionId)` helper
- `src/components/sidebar/NavigationMenu.tsx` — hide EL tab when user-club isn't EL-eligible
- `src/services/competition/competitionScheduler.ts` — skip EL fixture-generation for clubs not in `eligibleClubs`
- `src/components/setup/FranchisePicker.tsx` (Spain branch) — show a small "EuroLeague" badge or omit for non-EL clubs
- (Future P2:) `src/services/competition/specs/eurocup.ts` — new EuroCup spec for the qualification path

---

### Future P2: EuroCup as the qualification path

**Verbatim from user:**
> "in der Zukunft ein EuroCup-Qualifikation um EuroLeague zu erreichen"

Real European basketball has three continental tiers: EuroLeague (top 16) → EuroCup (~20 mid-tier) → FIBA Champions League (lower). The user wants the **EuroCup**: mid-tier Endesa clubs (e.g. Bilbao, Burgos, Gran Canaria) play in EuroCup, and the EuroCup winner gets a wild-card slot to next-season's EuroLeague.

**Scope for future slice (NOT for this MVP):**

- New `CompetitionSpec` for EuroCup: 24 teams, group stage → eighthfinals → bracket → final, ~30-game season
- Promotion mechanic at season rollover: EuroCup champion auto-included in next season's EL `eligibleClubs`, while one EL bottom-table club gets relegated TO EuroCup
- UI: new "EuroCup" tab/hub, parallel to Liga Endesa + Euroleague
- Schedule cadence: EuroCup midweek games on Wednesdays (different from EL Tue/Thu) to avoid calendar collision
- News: "Burgos qualifies for next season's EuroLeague!" headline at season end

**Codex: don't ship this in the current pass.** Document it in `plans/euro-isolated-spain-mvp.md` as a future slice (Phase 5+) and move on.

---

### P0-F: User-friendliness — expand tutorial coverage + Tycoon integration

**Verbatim from user:**
> "musst user friendly sein mit tutorial modals und so viele und tycoon integration und so weiter"

Existing tutorial scaffold (already shipped, do NOT redo):
- `src/components/tycoon/TycoonWelcomeModal.tsx` — 3-slide intro on first Euro-Isolated save load (localStorage gate, `tycoon_welcome_seen_v1`)
- `src/components/tycoon/HelpIconPopover.tsx` — (?) icons in AnnualLedgerCard / SponsorshipCard / LedgerHistoryCard

**User wants more.** Build out a per-concept walkthrough system. Reuse the existing `HelpIconPopover` for static help; add **first-time tour modals** for the bigger surfaces.

**Surfaces that need their own onboarding tour or help-icon (priority order):**

1. **Calendar / DayView** — first time user lands on calendar in a Euro save, show a 2-slide tour: "This is the Endesa + EuroLeague calendar. Endesa games on weekends, EL midweek. Click a day to see fixtures." localStorage flag `euro_calendar_tour_seen_v1`.
2. **TeamOffice → Home** — first-time tour explains the "Next Big Game" card, GM attributes, etc. Add a help-icon for the Wage Headroom widget.
3. **Standings (Liga Endesa)** — short help: "Top 8 make playoffs. Top 4 get bye to QF. Bottom 2 relegate at season end." (assuming relegation is in scope — if not, drop that line).
4. **Euroleague Hub** — help-icon for Group Stage / Play-In / Play-Off / Final Four structure.
5. **SponsorshipNegotiationModal** — first-time tour: "This is your sponsorship deal. Accept the market offer, or decline and fall back to default. New deal sets fresh yearsRemaining."
6. **Year-End-Gate modal** (already shipped) — verify the copy is clear; user feedback if it's confusing.
7. **OffseasonAufgaben sidebar** — when a Euro save reaches its first offseason, surface a "Welcome to Offseason" panel explaining what each row means (Options, QO, MyFAs, FA, Sponsor Renewals, etc.).

**Tutorial-system architecture:**

Don't proliferate copy-pasted modals. Build a small reusable system:

- `src/components/tutorial/Tour.tsx` — generic tour component, takes `{ id, slides: Slide[], onClose }`, manages the localStorage gate internally
- `src/utils/tutorialFlags.ts` — `hasSeen(id)` + `markSeen(id)` helpers (a single map in localStorage, easier to reset all tours at once)
- Use it like: `<Tour id="euro_calendar_tour_v1" slides={CALENDAR_SLIDES} />` mounted in App.tsx with `<Tour>` only rendering when in the right view + not-yet-seen

**Tycoon-integration polish:**

The Tycoon layer (T1+T2+T8) is wired but its UI presence is shallow. Expand:

- **TeamOffice → Home** should surface the latest year's profit/loss as a top KPI card, with click-through to TeamFinances.
- **Calendar phase banner (P0-B)** should also surface FFP-deficit warning when relevant ("FFP 3y Deficit: €25M — approaching transfer-ban threshold").
- **In-Season Toast (already shipped) — verify Discord-style stacking** if multiple events fire on the same day. Currently the toast shows one at a time; if 3 events queue up, the user must dismiss each individually.
- **TeamFinancesView** — the help-icon explanation should reference real numbers from the user's save ("Real Madrid Tier S → €X.XM matchday").

**This is a UX investment slice. Don't shortcut.** Pair with the existing `superpowers:brainstorming` workflow (user-preferred per memory): AskUserQuestion for axes that aren't pre-decided, write spec + plan, ship in 4–6 small commits, each browser-testable.

---

## Critical secondary issues (P1)

### P1-A: NBA playoff scheduling fires in Euro saves
Already covered in P0-B item 4. Standalone here because it may need a dedicated commit.

### P1-B: Roster sync between Endesa and EuroLeague tids
Real Madrid plays both Endesa and EuroLeague. Per `clubAliasMap`, the EL tid maps to the Endesa tid. But the user has reported "weird two roster" issues. Audit:
- `state.players` filter: does `tid === <userTeamId>` catch both EL and Endesa game appearances?
- Stat aggregation: do EL stats get logged under the same `tid` as Endesa stats? Or under the EL-side tid (+5000 offset) without alias resolution?
- Roster transactions: signing a player in Endesa adds them to EL roster automatically?

### P1-C: Calendar event icons don't differentiate competitions
Day cells show a generic basketball icon for any game. In a Euro save the user can't tell which icon is Endesa, which is EuroLeague, which is Copa, which is preseason friendly. Add competition-aware icon/color in `CalendarView.tsx` day-cell rendering.

### P1-D: Schedule continuity past `seasonEnd`
After Endesa regular season ends, are there spurious regular-season games on the schedule that the engine still tries to sim? `competitionScheduler.ts` should hard-stop at `seasonEnd`; verify no leak.

### P1-E: AI free-agency for Endesa / EuroLeague rosters
`AIFreeAgentHandler` is NBA-tuned. In a 5-year Spain save, do Endesa rosters churn realistically? Or do clubs keep the same 12 players forever? If churn is dead, write a minimal Euro-FA pass: each summer, X% of player contracts expire and rotate to other Euro clubs or NBA.

### P1-F: Award races for EL/Endesa pools
Per the original handoff: many awards show empty pools in the EL/Endesa hubs. Calculators iterate `state.teams` instead of the alias-resolved pool. Already documented in `plans/CODEX_HANDOFF_EURO_MVP.md` audit checklist item 2 — pick that up.

### P1-G: MVP Ladder leaks NBA candidates in Euro hubs (but other Euro awards are clean)

**Verbatim from user:**
> "die andere mvp ladder, hat NBA leaks, aber die unique euroleague award sind okay wie top scorer und so weiter"

So the **PPG-Leader / Rebounds / Assists / PIR / Top-Scorer** awards correctly filter to the EL or Endesa pool (per existing alias-map fixes). But the **MVP Race** specifically still shows NBA players (e.g. Jokić, Embiid) leaking into the EL hub's MVP Ladder.

**Probable cause:** the MVP calculator in `src/services/awards/calculators.ts` either:
- Reads `state.players` without the `getTeamsForLeagueTab(state, hubLeagueTab)` filter that the unique Euro awards use, or
- Uses a BPM/EWA/PER-based scoring that pulls from NBA-only stat aggregators, returning candidates with the highest NBA BPM regardless of the active hub.

**Required:**
- Audit `calculators.ts` — find the `mvp` calculator (or whatever id maps to "MVP Ladder")
- Apply the same alias-resolved pool filter that PPG/Top-Scorer / PIR use
- Confirm the candidate list, once filtered, includes both Endesa-tid Real Madrid players AND EL-tid Real Madrid players (alias map) without dedup-mismatches

**Files likely to touch:**
- `src/services/awards/calculators.ts` (MVP calculator)
- `src/services/awards/pool.ts` (verify the `euroleague` / `endesa` pool returns the right tid union)
- Maybe `src/components/central/view/awardsView` or wherever MVP Ladder is rendered (if the filtering happens client-side too)

**Verification:** in a Spain save with mid-season simmed, open EL hub → MVP Race. Top 5 should all be EL players (Tornike Shengelia, Mike James, etc.), zero NBA names.

### P1-H: Award race player rows show "Unknown · 0-0" for Euro players

**Verbatim from user (Rebound Leader screen):**
```
1   Giorgi Shermadini      C      Unknown · 0-0       PTS 25.2  REB 12.2  AST 1.5  70% Odds
2   Walker Kessler         C      Utah Jazz · 27-55   PTS 11.1  REB 12.2  AST 1.7  26% Odds
3   Chris Boucher          FC     Unknown · 0-0       PTS 19.3  REB 11.8  AST 3.1  15% Odds
4   Juancho Hernangomez    PF,C   Unknown · 0-0       PTS 13.6  REB 11.8  AST 1.2  +860 Odds
…
```

Walker Kessler (NBA tid 0–29) resolves to "Utah Jazz · 27-55" correctly. Every Euro player (Endesa/EL tid 5000+ offset) resolves to "Unknown · 0-0". That's a **team-name + record lookup bug** in the award-race row renderer — it uses `state.teams.find(t => t.id === player.tid)` instead of the alias-aware `resolveAnyTeam(player.tid, state.teams, state.nonNBATeams)`.

(Also: when the user is in the EL/Endesa hub, this row shouldn't even SHOW Walker Kessler — that's the same P1-F pool-filter issue. Two bugs in one screen.)

**Required:**
- Find the award-race row component (likely in `src/components/central/view/awardsView` or wherever the award-race renders) and switch the team lookup from `state.teams.find` → `resolveAnyTeam` (already imported elsewhere in the codebase).
- Add the W-L record from the resolved team (Endesa clubs have W-L too once games are simmed).
- Combine with P1-F pool-filter fix so the row list itself is pool-correct first.

**Files likely to touch:**
- `src/components/central/view/awardsView` (or the file rendering "Rebound Leader" etc.)
- Possibly `src/services/awards/poolResolver.ts` if there's a team-resolver helper

**Verification:** Rebound Leader in EL hub shows only EL players (zero NBA names), and every row shows "Real Madrid · 22-12" / "Olympiacos · 18-16" instead of "Unknown · 0-0".

---

## Tertiary polish (P2)

- PIR (FIBA Performance Index Rating) as the canonical EL/Endesa stat — calculator missing
- Coach of the Year for EL/Endesa — staff data missing
- Champion history persistence to `state.competitionHistory[specId][season]`
- Real club logos for smaller Endesa clubs
- EL Final Four label (currently shows "Semifinal" header)
- "Open Bio" clickable in `CompetitionHistoryView` players list

(See original `CODEX_HANDOFF_AUDIT_GAMEPLAY.md` v1 for P3 architecture items — they still apply.)

---

## What's already shipped — DON'T redo

Recent commits (read `git log --oneline | head -30` for full list):

- `02e5f1a` SigningModal + PlayerBio Contract tab: strip NBA cap UI (FINANCES tab hidden, Bird Rights / Supermax / Rookie Ext grid hidden, contract-history badges gated)
- `c2cd4de` Scrub NBA UI from Euro: TeamIntel Conf/Div, TeamIntelFreeAgency cap ticker, RosterView contract-mix, GeneralManager contract-mix, PlayerActionsModal eligibility for own-team Endesa players, LOAD_GAME auto-twoway skip in Euro + heal pass
- `7d8034f` Seed FIBA 4×10 cadence into EURO_ISOLATED_DEFAULTS + heal saves
- `eb17ee8` Skip Timeline + JumpReview in Euro setup, default start Sept 15
- `30cc692` Tycoon in-season event toast + sim breaks
- `9b5f324` PlayButton year-end gate for unrenewed sponsor slots
- `6f639bd` Sponsor-renewal row polish (X/3 badge, dynamic body, only complete on all-resolved)
- `0f3c304` HelpIconPopover integrated into 3 finance cards
- `4ef1de3` Welcome tutorial + scrub "Tycoon" from user-facing copy
- `8bec821` FinancesWidget renders in active currency (Sidebar)
- `0fb3fd4` Daily tycoon eventChecker tick in euro mode
- `65a8c98` sponsorRenewals offseason row opens negotiation modal
- `aaafdbe` sponsorRenewals row visible only when slot expired
- `e38aaa5` LOAD_GAME migration seeds team.tycoon for Euro saves
- `a1a9825` Year-end ledger snapshot + sponsor decrement in seasonRollover
- `0288f65` Wire TeamFinances Euro-branch to real tycoon engines
- `db55b15` SponsorshipNegotiationModal + applyTycoonMutation action
- Plus all the Tycoon Phase 1 commits going back through `08f10fa` types foundation

Don't re-implement any of this. Don't touch any user-facing "Tycoon" string (the user-facing label is "Front Office" or "Euro Finance" or "Club Finance"; "Tycoon" is dev-only).

---

## Decision principles (still verbatim from v1 handoff)

1. **NBA-Mode unberührt.** Every Euro change gated on `isEuroIsolatedMode(state)` (or equivalent uiMode check). NBA save must remain identical after every commit.
2. **Most code in new files.** NBA files get ≤20-LOC hook-coats, nothing more.
3. **Euro reads from CompetitionSpec, never from NBA-globals.**
4. **No hard-coded "Spain" / "Endesa" / "Euroleague" strings.** Everything via `competitionSpec.id` / `state.activeCompetitions`.
5. **Smallest change that fixes the symptom.** Don't refactor adjacent code.
6. **Bei unklarem Pfad:** kleinste Änderung die AC erfüllt, bestehende Slice-Patterns kopieren.
7. **Bei unklarer Typ-Definition:** Type lokal definieren statt cross-file zu refaktorieren.

---

## Test sequence (run after fix pass)

1. Fresh Spain save (Setup → Modded → Europe → Spain → Real Madrid → Start). Console should log:
   - `[LOAD_GAME] [euro] healed quarterLength 12 → 10` (or already 10 in new save)
   - `[LOAD_GAME] [tycoon] migrated N teams to tycoon state`
   - `[LOAD_GAME] [euro] stripped twoWay flag from N roster players` (only on migrated saves; new saves: 0)

2. Verify `state.teams` content — should be the 18 Endesa clubs. If it's NBA teams, **STOP and fix P0-A first.**

3. Navigate through every menu surface:
   - Sidebar Left: Finances → "Personal €X.XXM" (Euro symbol)
   - Team Office → Home: shows Real Madrid, no NBA-cap widget
   - Team Office → General Manager: GM attributes, no "Contract Mix" Two-Way / NG / Guaranteed grid
   - Team Office → Roster: 12-ish players, NO "12/15 guaranteed · 4/3 two-way · 0 non-guaranteed" footer
   - Team Office → Coaching → Gameplan: 200-minute budget (not 240)
   - Team Office → Team Intel: NO Conf / NO Div, Wage Headroom in EUR
   - Team Office → Team Intel → Free Agency: NO Cap Space / NO MLE Available / NO Room After Shortlist ticker
   - Team Office → Team Finances: real Annual Ledger from `team.tycoon` (not payroll × 0.18)
   - League Finances: 18 Endesa clubs (NOT NBA), real budget tiers, real sponsorship from each club's `tycoon` state
   - Euroleague tab: group stage table + bracket
   - Liga Endesa tab: single 18-team table
   - Calendar: phase banner shows current state
   - Click a player on user team → Player Actions Modal: NO "Sign Free Agent" option (he's on the team, not a FA)

4. Advance time to:
   - Endesa preseason → friendlies fire
   - Endesa regular season start → games sim correctly, scores in 70-95 range (FIBA pace)
   - Mid-season → no NBA Cup / no Christmas Games / no All-Star events
   - Endesa regular season end → playoff bracket injects, generates QF Bo3 etc.
   - Endesa playoffs run → no NBA playoffs appear simultaneously
   - Season end → champion crowned, year-end ledger snapshot, sponsor years decrement, offseason starts
   - Offseason: SponsorRenewals row appears IF slots expired, X/3 badge accurate, PlayButton year-end gate fires for unrenewed slots

5. `npx tsc --noEmit` — no NEW errors. Pre-existing errors in `DraftSimulatorView`, `fictionalLeagueGenerator`, `GameContext.tsx EXPANSION` cases, and `initialization.ts` (`NonNBATeam.cid` optional) are NOT yours.

---

## Definition of done

- P0-A fixed: League Finances Euro-branch shows Endesa clubs with real Tycoon-derived numbers (NOT payroll-multiplied fake numbers).
- P0-B fixed: Phase banner on calendar, "Next Big Game" card on Team Office Home, lazy-sim summary card after multi-day sims, NBA playoffs gated off in Euro.
- P0-C fixed: Offseason sequence in Spain save walks cleanly from Endesa Final → EL Final Four → Year-End → Sponsor Renewals → Friendlies → Training Camp → Regular Season Start, with no broken row.
- P1-A through P1-F either fixed or escalated as `## Open Question` blocks in this file.
- One full season simulated end-to-end without console errors.
- `git log --oneline` shows clean commits per slice with feat(euro) or fix(euro) prefix.

---

## How to start

```bash
git log --oneline | head -30  # see recent work
git status                    # likely clean
npx tsc --noEmit 2>&1 | grep -v "expansion\|DraftSimulatorView\|fictionalLeagueGenerator\|initialization.ts"  # baseline error set
npm run dev                   # browser-test path
```

Read in this order:
1. `CLAUDE.md` (project conventions, DevTools snippet, "STOP and ask first" rule — Codex variant: STOP and inspect via DevTools snippet before code-reading)
2. `plans/euro-isolated-spain-mvp.md` (master plan + status snapshots)
3. `plans/CODEX_HANDOFF_EURO_MVP.md` (autonomy rules + decision principles — apply verbatim)
4. `docs/superpowers/specs/2026-05-11-euro-tycoon-mvp-design.md` (Tycoon MVP spec — done, reference only)
5. `docs/superpowers/plans/2026-05-11-euro-tycoon-mvp.md` (Tycoon MVP plan — done, reference only)
6. This file.

Then go.

---

## Catch-all — scope is bigger than what's listed

User noted (verbatim): *"immer noch fehlt viele Dinge"* — there are more bugs than fit in this file. After you fix P0-A through P0-F (the explicit blockers), do a deep self-audit by playing the save end-to-end yourself:

1. Fresh Spain GM save, Real Madrid.
2. Click into every visible UI surface (every sidebar item, every tab, every card, every modal, every button). Take notes.
3. Lazy-sim 30 days at a time. After each batch:
   - Did anything happen the user wouldn't know about?
   - Are stats updating? Standings? Player ages?
   - Are there ghost references to "NBA" / "$" / "cap space" / "two-way" anywhere?
4. Simulate to season end. Did the playoff bracket trigger? Did the right team win? Was the user kept informed?
5. Roll over to next season. Did rosters age, contracts roll, sponsors renew?
6. Simulate a second full season. Compare to first season — should feel different.

**Add every issue you find as a new `### P?-X` block in this file before fixing.** If the issue is fast-fix, do it. If it's an architecture decision (`PlayoffSpec` vs `CompetitionSpec` knockout), surface as `## Open Question` block and pick the conservative path.

The user has been browser-testing for days. Their tolerance for "I think it works" is zero. Get to a state where YOU as the agent have personally walked through 2 simulated seasons end-to-end in DevTools state-inspection mode (via the gunzip snippet) and verified no NBA leak, no broken state transition, no silent sim run.

---

## Open questions for the user (only if blocked)

Don't ask preemptively — but if you genuinely hit a fork where a wrong choice would be a multi-day rebuild, surface it here and continue with the safest interpretation:

- **P0-A root cause:** is the Spain setup intended to REPLACE `state.teams` with Endesa clubs, or AUGMENT it (NBA stays in background per AC-10)? The plan says NBA stays in background, but every UI Euro-branch currently expects `state.teams` to be Endesa-only. Reconcile in one of the two directions.
- **Two-playoffs source:** is the NBA playoff schedule actually being created, or is the user seeing a UI duplication of the SAME bracket? Verify via DevTools `state.playoffs` vs `state.competitionHistory['endesa']` content before patching.
