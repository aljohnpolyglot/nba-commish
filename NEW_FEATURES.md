# New Features -- NBA Commish Sim

Active/upcoming work, backlog ideas, and feature planning.

---

## HoopsGM — Team Training Engine (NEXT UP — May 2026)

**Status:** Architecture complete (`ARCHITECTURE.md`). Standalone NBA team training sim — wire into nba-commish as a new top-level view or embedded Team Office tab.

**What exists (standalone app):**
- `Dashboard` — 30-day calendar with clickable daily training config (`DailyPlanModal`, paradigm presets, 5-system minimum)
- `Roster` — Player table with dev focus (`TrainingFocusModal` 2-phase archetype selector), intensity, mentorship
- `Systems` — 20 tactical systems scored via `getSystemProficiency()`, tiers (Mastery/Competence/Dissonance), `SystemModal` + `ArchetypeTrainingModal` chain
- `simulation.ts` — monthly sim engine consuming `dailyPlans`, `archetypes`, `staffing`
- Two separate archetype systems: `ARCHETYPE_PROFILES` (display/eligibility) + `TRAINING_WEIGHTS` (sim engine) — must never be merged
- Rating bridge: BBGM 0–100 ↔ K2 60–99 via `convertTo2KRating` (same formula as nba-commish `ratingUtils`)

**Wiring plan into nba-commish:**
1. Mount `ScheduleView` + `DailyPlanModal` inside `TeamOffice` as a new **Training** tab — reads `state.players` for user team roster
2. Pipe `Player[]` through `mapPlayerToK2()` → `calculateCoachSliders()` → `getSystemProficiency()` (already compatible with nba-commish K2 scale)
3. Persist `dailyPlans` + `devFocus` per player on `state.teams[userTeamId]` — new fields `trainingCalendar` + `playerDevPaths`
4. Hook monthly sim output into `ProgressionEngine` — `simulation.ts` produces attribute deltas; apply as `ovrAdjustment` on top of existing `calcBaseChange`
5. `SystemProficiencyView` → surface top-3 systems in Team Intel / Coaching gameplan tab
6. `TrainingFocusModal` archetype selection → write `player.devFocus` (already used by progression system)

**Key files to touch on integration:**
- `src/components/central/view/TeamOffice/pages/CoachingView/` — add Training tab
- `src/services/progressionEngine.ts` — read `player.devFocus` + `team.trainingCalendar` deltas
- `src/types/` — extend `NBATeam` with `trainingCalendar`, extend `NBAPlayer` with `devFocus`

**What must NOT change during wiring:**
- `FrontOfficePanel` commented-out code (future feature)
- `generateStaff.ts` (Front Office dependency)
- Normalization loop at bottom of `archetypes.ts`
- `TRAINING_WEIGHTS` — separate from `ARCHETYPE_PROFILES`
- `ArchetypeTrainingModal` + `initialArchetype` prop chain

See `ARCHITECTURE.md` for full file map, data flow, archetype system rules, and styling conventions.

---

## HORSE Contest — IN ISOLATION DEV (May 2026)

**Status:** Actively being built as standalone minigame + All-Star Saturday integration. Same end-to-end pattern as Dunk/3PT: picker → interactive play-by-play → result saved to `state.allStar.horseTournament`. Headless sim (`AllStarHorseSim.ts`) already exists.

---

## Shooting Stars Shootout — IN ISOLATION DEV (May 2026)

**Status:** Actively being built as standalone minigame + All-Star Saturday integration. Team-based shooting relay. Headless sim (`AllStarShootingStarsSim.ts`) already exists, result shape on `state.allStar.shootingStars`.

---

## Satellite events one-by-one buildout (QUEUED — Session 31 foundations laid)

**Status:** sim services + rules-UI toggles + orchestrator wiring shipped Session 31 (Apr 29 2026). Per-event UI surfaces are intentionally deferred so each event ships end-to-end on its own iteration.

**Foundations (already in place):**
- Sim services: `AllStarShootingStarsSim`, `AllStarSkillsChallengeSim`, `AllStarHorseSim`, `AllStarOneOnOneSim` in `src/services/allStar/`
- Result shapes typed on `AllStarState` (`shootingStars`, `skillsChallenge`, `horseTournament`, `oneOnOneTournament`)
- `AllStarWeekendOrchestrator.simulateWeekend` calls all four on Saturday (gated by `leagueStats.allStar*` toggles)
- `AllStarEventsSection.tsx` no longer stubbed — toggles + participant inputs render and persist via `useRulesState`

**Per-event checklist (apply each pass to one event end-to-end):**

1. **DayView result card** — `AllStarDayView.tsx` Saturday section currently shows dunk + 3PT only. Add a card per enabled event with winner + brief result (time, bracket, score). Pre/post-event states: "Coming Saturday → {N} contestants" and final-score variant.
2. **News headlines** — add `all_star_shooting_stars_winner` / `_skills_winner` / `_horse_winner` / `_oneonone_winner` template categories in `newsTemplates.ts` + register in `NewsFeed.tsx CATEGORY_DISPLAY`. Wire generation in `autoSimAllStarWeekend` (`autoResolvers.ts`) following the same pattern as `all_star_bracket`/`all_star_mvp`.
3. **Awards write-back** — extend the `awardEntries` block in `autoSimAllStarWeekend` to push winner IDs into `player.awards` with award types (e.g. `'Shooting Stars Winner'`, `'Skills Challenge Winner'`, `'HORSE Champion'`, `'1v1 Champion'`).
4. **Detail/log view** — equivalent to dunk-contest's modal log. Render bracket/round results from the result type stored on `state.allStar.<event>`.
5. **Contestants-announced plumbing** — currently sims pull contestants at runtime. Mirror dunk/3PT's pre-announce pattern: a date constant in `getAllStarWeekendDates`, a `*Announced` flag on `AllStarState`, and a tab section that surfaces selected participants ahead of Saturday.
6. **History surface** — `AllStarHistoryView` columns for new events (winner per year), driven by award lookup like the existing dunk/3PT columns.

**Recommended order** (lowest → highest scope):
- HORSE & 1v1 first (simplest: single-elimination winner only, no team logic)
- Skills Challenge next (round-1 + final, similar to 3PT)
- Shooting Stars last (team-based, needs team-aware UI)

Each event lands as one self-contained PR touching DayView + news + awards + history. Sim service is already done so each iteration is pure presentation/plumbing work.

**Remaining cosmetic polish (not blocking):**
- **Champion box-score MVP highlight** — surface RR-stage standout performances beyond final-game MVP
- **Voting by team bucket** — currently by conference; bucket assignment is announce-time only (no fan vote)
- **Captain veto / live-draft UI** — captain pick order auto-generated by snake; no commissioner control
- **Pre-existing TS errors** in AllStarGameSection / AllStarTab (props mismatch on setNumQuarters, startOfPossessionMethod/possessionPattern)

**Shipped (uncommitted — Session 31 additions):**
- ✓ **AllStarHistoryView multi-game support** — bracket recap (RR records) + BRACKET badge
- ✓ **Calendar tile event-count badge** — "{N} games" pill for multi-game All-Star Sundays
- ✓ **Multi-game bracket card team logos** — per-matchup cards with logos + W-L records

See TODO.md "QUEUED — All-Star cosmetic polish" for full context.

---

## Prompt L — Bidding-war refactor remaining phases (QUEUED)

**Status:** PR1 shipped (Session 27), design doc complete. PR2–PR4 + PR6 pending user approval of 8 Open Questions in [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md).

**PR2 — Escalation rounds** 
- 3-round parallel bid window (Days 1–2 / 3–4 / 5), sealed re-bids (Round 2/3 teams commit to floors from Round 1)
- Tier-based round count: K2 ≥ 88 → 3 rounds, K2 80-87 → 2 rounds, K2 70-79 → 1 round
- Shams tweet templates for escalation updates (per-tier gating, off by default)

**PR3 — Resolution formula upgrade**
- Highest $ × `legacyMult` (super-vet multiplier) × `championshipMult` (recent champion bonus) × `moodMult` (trait-driven preference)
- Bird Rights tiebreak (prior-team gets +15% final-offer floor) before RNG
- LOYAL trait override: any prior-team bid wins regardless of $ amount

**PR4 — Gut sequential pipeline**
- Pass 1 → Bird Rights re-sign only (Jul 1, `runAIBirdRightsResigns`)
- Pass 4 candidate filter restricted to K2 < 70 OR (market-unsigned AND date >= Aug 1)
- All K2 ≥ 70 FAs route through `faMarketTicker` exclusively
- Remaining passes (2, 3, 5) unchanged

**PR6 — LOAD_GAME save migration**
- Backfill new `FreeAgentMarket` schema fields for existing save markets
- Backfill `pendingMatch` state for any in-progress RFA markets from prior versions

---

## Tournament Engine Refactor — Multi-tournament architecture (QUEUED)

**Status:** design-complete, not started. Full spec in [`docs/tournament-refactor.md`](./docs/tournament-refactor.md). Depends on NBA Cup shipping first as the reference implementation.

**Why:** NBA Cup works, but every piece is hardcoded to NBA — 30 teams, East/West conferences, Tue/Fri Cup Nights, in-season weave, group IDs `'East-A' | ... | 'West-C'`. The moment we add Summer League, FIBA World Cup, EuroBasket, or Olympics we'd be copy-pasting `nbaCup/` six times. Refactor makes the engine **format-agnostic** with NBA Cup as the first preset.

**Reuse audit:**
- *Reusable as-is:* `drawGroups.ts`, `resolveGroupStage.ts` (W → H2H → PD → PF tiebreakers), `advanceKnockoutBracket()`, `updateCupStandings.ts`, `awards.ts` (MVP + All-Tournament Team), `seededRandom.ts`, view primitives (`GroupTable`, `BracketDisplay`, `CupBracketLayout`, year-nav).
- *Tightly coupled (must refactor):* group ID type union, Tue/Fri date logic, in-RS schedule weave, `state.teams` as sole team source, `excludeFromRecord` flag, hardcoded 8-team KO, Vegas venue, conference-balanced QF seeding, prize money values, single `inSeasonTournament` toggle.

**Target architecture:**
- `TournamentSpec` describes any tournament's shape: `groupCount`, `teamsPerGroup`, `groupGamesPerTeam`, `groupIdScheme` (`'letter' | 'east-west-letter' | 'pool-number'`), `knockoutSize`, `knockoutAdvancePerGroup`, `wildcardCount`, `scheduleMode` (`'in-season-weave' | 'standalone-block'`), `scheduleWindow`, `countsTowardRecord`/`countsTowardStats` per phase, `teamSource` (`'nba' | 'national' | 'summer-roster'`), award-type strings, optional prize pool, rule-toggle key.
- `TournamentInstance` replaces `NBACupState`: generic groups/knockout/wildcards/champion/runnerUp/third/MVP/AllTeam, keyed under `state.tournaments[specId]` and `state.tournamentHistory[specId][year]`.
- One service in `src/services/tournament/` (`drawTournamentGroups`, `injectTournamentGames`, `applyTournamentResult`, `resolveGroupStage`, `computeAwards`) plus per-tournament `specs/{nbaCup,summerLeague,fibaWorldCup,olympics}.ts`.
- One `<TournamentView specId="..." />` replaces `NBACupView`; sim hook iterates `ALL_SPECS` instead of branching on `inSeasonTournament`.

**PR sequence:** (1) generic types coexist with old; (2) extract NBA Cup as a spec, generic engine wraps existing logic; (3) state migration `state.nbaCup → state.tournaments['nba-cup']` with LOAD_GAME backfill; (4) generic view; (5) Summer League (rookies + invitees, July, no record/stats); (6) FIBA infra (national-team registry, player nationality, top-N by K2 OVR); (7) Olympics (12 teams, 3 groups of 4, top 2 + best 2 thirds, gold/silver/bronze).

**Effort:** ~1 day per PR for 1–4, 3–4 days for Summer League, ~1 week for FIBA national teams, 1.5 weeks for Olympics. Total ~3–4 weeks for all four. Worth-it threshold: refactor pays off if shipping any **two** of {Summer League, FIBA, Olympics}; skip and one-off if only Summer League.

**Out of scope (defer):** WNBA Commissioner's Cup (drop-in spec later), G-League Showcase, HS/college brackets, commissioner-defined custom tournaments.

**Open questions:** NBA-player release for FIBA/Olympics windows (likely just an `isInternationalDuty` flag, no roster impact v1); FIBA stat bucketing (probably keyed by `tournamentId` in box scores, not in `player.stats[]`); per-tournament historical gist URLs + parsers; annual national-team roster refresh by K2 OVR before each tournament; naturalized-player eligibility (FIBA = 1 per country, defer to v2).

### National-team eligibility — dual-nationality gist convention

Players in the ratings gist with two countries in the bio location field follow this rule: **the second country wins for FIBA/Olympics eligibility.** Examples:

```
A.J. Edu     Toledo        Cyprus / Philippines    → suits up for Philippines
Alex Kirk    New Mexico    United States / Japan   → suits up for Japan
```

The convention encodes either a **naturalized passport** (FIBA "1 per roster" rule) or a **heritage/dual-citizen** player who's clearly committed to the second federation (parents, residency, prior Federation appearances). Either way: country #2 is where they're playing. National-team roster builder should parse `player.born.loc` on `' / '`, take the **last segment**, and assign that as the FIBA-eligible nation. The first country can be retained as `player.born.loc` for display ("Cyprus / Philippines" still shows in PlayerBio) but `nationalTeamCountry` derives from the trailing segment.

Edge cases to watch:
- Single-country players (`United States`) → eligibility = that country, no parsing needed.
- Three-country chains (rare, e.g. heritage immigrant w/ passport) — take the **last** segment; if FIBA rules later need full lineage, store the full split as `eligibleCountries: string[]`.
- `naturalizedFor: countryCode` (deferred to v2 per the open questions) is what enforces the FIBA "1 naturalized per roster" cap; for v1 just count anyone whose first listed country isn't the second as occupying the naturalized slot.

---

## Backlog idea — Apron-tier cap mechanics (Football Manager-tier depth)

**Status:** intentionally NOT shipped. Sim is currently fast and approachable; full apron rules would push it toward Football Manager territory (deep but slower, more gates, more "you can't do that" friction). File for a hypothetical future "Hardcore Mode" toggle.

Real NBA 2024+ CBA introduced staircase cap penalties — luxury tax → 1st apron → 2nd apron — each adding stricter restrictions. Currently we model the dollar thresholds but not the *behavioral consequences*.

Symptom that motivated this entry: LAL retained LeBron + Reaves + Mark Williams in the same offseason post-Bird-Rights Pass 0 → roster steamroll. Real NBA: 2nd-apron teams literally can't aggregate contracts in trades, can't sign waived players to MLE, can't include cash, etc. Those frictions ARE what stops super-team stacking.

If we ever build the hardcore mode, the cleanest scope:

**Cap thresholds (already modeled):** salary cap → luxury tax → 1st apron → 2nd apron

**1st apron team restrictions:**
- Can't acquire players via sign-and-trade (receiver side)
- MLE capped to taxpayer MLE (~$5M instead of $14M)
- Can't take back more salary than sent in trades (currently can up to 125%)
- Bird Rights premium tapers from +15% to +5% (so re-signs are still possible but less aggressive)

**2nd apron team restrictions (the real teeth):**
- Can't aggregate contracts in trades — only 1-for-1 swaps
- 1st-rd picks 7 yrs out frozen (can't trade them)
- Can't include cash in trades
- Bird Rights premium → 0% (no incumbent over-pay)
- MLE eliminated entirely
- Picks freeze if 2 of 4 future seasons end above 2nd apron → pick moves to back of round

**Per-team Bird Rights cap (separate but related):**
- First 2 retentions per offseason → full +15% premium
- 3rd retention → +5% premium  
- 4th+ retention → 0% premium (the "you can't keep everyone" reality check)

**UI surface:**
- Cap ticker shows current tier with color thread (green / yellow / orange / red)
- Trade Machine + SigningModal disable affected actions when over 2nd apron with explanatory tooltip
- New Settings toggle: "Hardcore Cap Rules (NBA 2024 CBA)" — default OFF

Why deferred: this is a 200-300 line implementation across `salaryUtils`, `tradeFinderEngine`, `freeAgencyBidding`, `runAIBirdRightsResigns`, plus matching UI gates and tooltips everywhere. Pays off only for users who want NBA-realism over fluid gameplay. Most casual users want to build their super-team without the league preventing it.

The current "Lakers re-sign all their stars" outcome is closer to NBA 2010s than NBA 2024 — defensible as design (super-team narratives sell) until a "Realism" mode toggle exists.

---

## Backlog idea — "Aspire" tab (Kawhi-Aspiration cap-circumvention play)

Hidden tab next to **Team Offers** in `SigningModal`. GM-mode only and can be commisoner mode as well. Surfaces a covert salary-cap-circumvention mechanic — modeled directly on the real Kawhi Leonard / Aspiration / Ballmer scandal.

```
Real-world inspiration:
  Apr 2024 — Aspiration (green fintech, Ballmer-invested) signs Kawhi
  to a 4yr/$28M endorsement deal via "KL2 Aspire LLC"
  Allegations: no-show job, Ballmer paying Kawhi outside cap rules
  Sep 2025 — NBA opens investigation
  Apr 2026 — Kawhi: "not stressing, I'll be in the clear"
  diabolical af
```

**Mechanic:**
- A new "Off-Books" tab appears on the SigningModal for any teams!
- Slider: **"Endorsement supplement"** $0–$30M/yr (percentage base on cap as well for the max) total over the contract length
-also company name of the money laundering company user input.
- The supplement adds **+15-30% offer strength** (slider scales) without showing on the cap sheet, but writes a hidden flag on `state.investigations[]`


**UI surfaces:**
- Shams template lib gets a "investigation" type with quote variants


**Why it's worth building:**
- Real NBA has *exactly this happening right now* (per the Kawhi case) — and we have the news/Shams/Events infrastructure to surface it dramatically
- Creates a tradeoff for over-the-cap contender GMs: take the legal route and lose your guy to a cap-rich rival, or risk it for the bag and pray the league doesn't find out
- Generates the kind of story arcs ("Aspiration probe enters month 4, owner Ballmer 


---

## Backlog idea — Contract Thoughts (FA bidding-period flavor)

During the bidding window, surface a short first-person quote on each FA's bio header — varies by status + traits + age:

```
Contract Expired · Unrestricted Free Agent
"I'm a free agent. Keeping my options open — a good locker room,
real minutes, a clear role. That's what I'm listening for."
```

Variations by trait + tier:
- **LOYAL veteran**: "I've been a {City} guy my whole career. Hard to picture wearing anything else."
- **MERCENARY star**: "I bet on myself. Whoever brings the bag and the role, that's who I'm signing with."
- **COMPETITOR mid-career**: "I want to win. Show me a real path to a ring and we can talk."
- **RFA (offer sheet pending)**: "Y'all know how this works — they've got 48 hours."
- **Aging vet**: "Last contract probably. I want to play meaningful basketball for the team that wants me."

Source from a small templated lib (mirror existing Shams/Woj template pattern in `src/services/social/templates/`). Surface in PlayerBio header during FA window only.

Cheap dynamic-narrative win — no game-logic impact, pure flavor.

---

## Backlog idea — Force-out trade demands (Harden / KD / AD leverage plays)

Currently the trade engine prices every player by team-mode value alone — there's no mechanism for a player to *demand* out and force their team to move them at a discount. Real NBA superstar movement runs on this dynamic: Harden→Sixers, KD→Suns, AD→Lakers, Dame→Bucks, Butler→Heat. The team's hand is forced.

**Mechanic:**
- New `tradeRequest?: { date: string; severity: 'public' | 'private' | 'ultimatum' }` field on `NBAPlayer`
- Triggered by mood system: when `mood < -6` for `>30` consecutive sim days, OR a scandal/feud/role-loss event resolves with "force-out" outcome
- DIVA + MERCENARY traits double the request probability; LOYAL trait suppresses it entirely

**Trade engine effect (when `tradeRequest` is set):**
- The player's TV is priced in the **buyer's** mode regardless of seller's strategy (rebuilders selling don't get to peg him at rebuild prices — the market knows they're forced sellers)
- Ratio gate loosens to **1.55** for any basket including this player (vs. default 1.40)
- `isUntouchable` returns false regardless of OVR — the team CAN'T protect him
- 30-day shot clock: if not traded by `tradeRequest.date + 30`, severity escalates `private → public → ultimatum`. Each tier widens the discount further.

**Drama surface:**
- Shams: "Sources: [Player] has informed [Team] of his desire to be moved by the trade deadline."
- News cycle, Events log, mood penalty bleeds onto teammates (`drama_magnet` trait amplifies)
- Commissioner-mode override: "Resolve dispute" action lets the commissioner force a sit-down meeting (RNG-resolved)

**UI:**
- Red ▼ icon next to player name in TradeMachine + TradeFinder + Trade Proposals
- `tradeRequest` tooltip: "{Player} has requested a trade — discount applies, untouchable protections waived"
- Optional GM-mode pop-up notification when one of your players files a request

**Why worth building:**
- Currently every star moves at fair-market value — sim feels sterile vs. NBA reality
- Mood system is shipped but only affects on-court chemistry; force-out wires it into the *transaction layer* where consequences are loudest
- Pairs perfectly with **Off-Books** (above) — owner takes off-books risk to AVOID a force-out, force-out triggers when off-books deal gets caught

---

## Backlog idea — Scandal-driven TV haircut

Off-court drama tanks a player's market value temporarily — modeled directly on real NBA precedents (Sheed's anger management contract, Westbrook post-Houston, Russell post-LAL trade rumor cycles).

**Mechanic:**
- New `scandals?: { type: ScandalType; severity: 1-5; date: string; resolvedDate?: string }[]` on player
- Scandal types: `arrest`, `feud_public`, `coach_clash`, `social_media_blowup`, `gambling_probe`, `domestic`, `media_meltdown`
- Triggered by Mood/Fight system, scheduled news events, or commissioner-action consequences

**TV penalty formula:**
```
scandalPenalty = max(0, severity × 0.08 × (1 - daysSinceScandal / 90))
val *= (1 - scandalPenalty)
```
- Severity 5 scandal day-1: 40% TV haircut
- Decays linearly to 0 over 90 days (PR cycle half-life)
- Multiple active scandals stack multiplicatively (compounding "headache premium")

**Cap:** total haircut floor at 0.45× (no player drops below 45% of fair value — even Sheed got moved)

**Drama surface:**
- Visible "headache risk" badge in Trade Machine & TradeFinder (only when `scandalPenalty > 0.10`)
- Tooltip shows active scandals + days remaining: "Public feud with coach (Day 12 / 90)"
- Trade execution writes scandal context to history log: "BKN sent [Player] to MIA — sources cite ongoing investigation"

**Settings:**
- `scandalsEnabled: boolean` (EconomyTab toggle, default ON)
- `scandalDecayDays: 30-180` slider (default 90 — adjusts how long PR hits linger)

**Why worth building:**
- Front offices do this in real life (every "we like the player but the headache risk gives us pause" leak)
- Gives mood/fight/feud systems tangible *transaction-layer* consequences beyond just on-court chemistry
- Composes with **Force-out** above: a scandal can trigger a trade request, and the resulting trade is at a stacked discount

---

## Milestone — Apr 23, 2026: Past BBGM on feature surface

Snapshot of what's shipped vs. what BBGM ships:

**Contract system** — supermax eligibility, Rose Rule rookie extensions, Bird Rights, MLE (non-taxpayer / taxpayer / room / bi-annual), team options, player options, two-way contracts, non-guaranteed training camp deals, external-league buyouts with FIBA cap. BBGM has a simpler flat contract model.

**Multi-league ecosystem** — NBA + WNBA + Euroleague + PBA + B-League + G-League + Endesa + China CBA + NBL Australia, all with their own rosters, ratings, bios, preseason schedules, and economy tiers. BBGM is single-league.

**Mood & drama** — 7 traits (DIVA / LOYAL / MERCENARY / COMPETITOR / VOLATILE / AMBASSADOR / DRAMA_MAGNET / FAME), mood score -10 to +10, drama probability weighting, fight generator with severity tiers, family ties / nepotism system.

**Media surface** — Shams Charania posts, NBA Central, Legion Hoops, Hoop Central, NBA Official in-season social feed, daily vs. weekly news split, Events (Commissioner's Diary) separate from Transactions, staggered award announcements Apr-May, Season Preview, live Award Races projections.

**All-Star Weekend** — Dunk Contest + 3PT Contest with 2K-style dunk/vertical ratings, Celebrity Game, Rising Stars, All-Star Rig Voting, replacement flow, history browser, configurable host city with 10-season cooldown.

**Draft & scouting** — Draft Combine, DraftScouting big board (70% value + 30% fit), infinite simulated draft classes via `genDraftPlayers.ts`, multiple historical lottery presets (1966-2019) with exact Plackett-Luce odds, lottery UI with ball reveal animation.

**Economy** — phase-weighted season revenue, `EXTERNAL_SALARY_SCALE` caps, broadcasting cap inflation, media rights deals, transaction calendar (trade deadline / FA start / moratorium) fully commissioner-editable, minimum payroll + luxury tax + apron hierarchy.

**Trade systems** — Trade Finder (all 29 teams scanned), Trade Machine with salary eyebrow + pick sweeteners + 3rd player gap-fill, AI-AI trade execution with GM personalities (trade_aggression / scouting_focus), dynamic ratio thresholds by TV, pick protection.

**UX** — IndexedDB portrait cache (5-concurrent auto-download on load), BBGM → CDN → initials fallback chain, facesjs for generated players, responsive mobile refactors across 15+ views, GM mode vs. Commissioner mode with differentiated UI.

BBGM's strength is its deep sim engine and 20-year polish. This game now matches the sim depth and exceeds it on UX, multi-league scope, media immersion, and contract sophistication. The remaining multi-season cap/FA bugs (documented in TODO.md) are the last structural items before the sim is genuinely beyond BBGM on every axis.

For detailed session-by-session work, see CHANGELOG.md.

---

## Design Docs (In Planning)

- **[Loan System](./docs/loan-system.md)** — Regular-season player rentals with playoff ineligibility (keystone rule). Slot caps (2 in/out), unregulated fees, injury handoff, 48h waive grace on return. Phase 1: manual GM flow; Phase 2: AI-initiated loans; Phase 3: conditional fees + pick swaps. Status: design-complete, greenfield.

- **[Tournament Refactor](./docs/tournament-refactor.md)** — Multi-tournament architecture (NBA Cup + future playoff variants). Decouples tournament logic from hardcoded "playoffs are March KO games." Enables Euros-style group stages, African championship brackets, FIBA Cup. Status: design-complete, depends on Cup implementation polish.

- **[Feature: Any NBA Year](./docs/feature-any-nba-year.md)** — Load/new-game UI expansion: pick any real NBA season (1946–2026) as starting point. Pre-populated rosters, historical trades, era-accurate rules. Replaces "stuck on 2026" genesis. Status: design-complete, data-fetching phase.

---

## Future Features (Backlog)

- **Dual-affiliation academy prospects (Luka-Real-Madrid model)** — architectural upgrade over BBGM's college-as-metadata model. Pre-assign `draft.year` at generation for academy youth so they're simultaneously at their youth club (`tid = clubTid`, `status = 'Euroleague' / 'B-League' / etc.`) AND tagged for a future draft class. Real Luka was playing Real Madrid senior at 16 while everyone knew he was declaring 2018 — sim can model that. Replaces the Prompt C age-19 status-flip mechanism with a pre-committed draft year. DraftScouting surfaces prospects 1-4 years out with club attached ("Alejandro Garcia — Real Madrid Youth → declares 2032"). Enables scouting-budget expansion (commit to follow a prospect years ahead for better intel). BBGM can't do this because it treats college as string metadata only — this sim's first-class `nonNBATeams` makes youth-club-as-playable-team possible.

- **Scouting staff & spending** — `getFuzzedOvr` is already implemented (dead code) and `rating.pot` now drifts via seasonRollover, so the infrastructure is ready. Scouting budget unlocks tighter fuzz ranges: low budget shows opponents as "75 | 82" when reality is "75 | 75" (at-ceiling bust); high budget reveals the gap, letting you distinguish a genuine breakout candidate from a stalled player. Visible bust signal already works (OVR|POT converge over seasons, never shown below OVR in UI); scouting spend determines how early and accurately the GM sees it for non-owned players.

- **FA pool debug dashboard** (FreeAgentsView header) — OVR tier counters: K2 >90 / >85 / >80 / >75 / total, each updating live as filters change. League column on each FA row showing their current league (NBA FA, G-League, Euroleague, etc.). Bottom summary strip per external team: "FC Barcelona — Spain ×5, France ×2, USA ×1" showing nationality breakdown of that club's roster. Same panel for all external leagues. Pure debug/transparency tool — great for catching routing inflation and nationality drift at a glance.

- **Progression / Regression sliders in Settings** — Commissioner-only sliders to globally tune player development speed and aging decline. Two independent dials: Progression (young player growth rate, default 1.0x) and Regression (35+ aging curve harshness, default 1.0x). Multiplies the existing `calcBaseChange` per-age values. Lets commissioners run high-development "everyone develops" leagues or 90s-style "cliff at 33" leagues without code edits. Reuses existing `inflationEditor` pattern in SettingsModal.

- **Coaching / Training Dev staff** — GM-mode staff hire system tied directly to the progression/regression engine. Spend cap-room or owner budget on player-development coaches: each tier provides a multiplier to your team's young players' progression rate (Progression Coach: +5% to +25%) and slows aging decline for vets (Athletic Trainer: -5% to -20% regression). Modeled after real NBA Player Development departments (e.g. Sam Cassell-tier developer hires). Reuses the `getFuzzedOvr` scouting-staff infrastructure. Integration point: ProgressionEngine reads `team.staffMultipliers.progression` and `team.staffMultipliers.regression` per player. Free agency competition between teams for elite dev coaches creates strategic depth.

---

### FGA v3 known gaps (Session 28)

- **60+ pt outliers unreachable.** EXPLOSION ceiling caps at `1.15 + ovr/100 × 0.80` ≈ 1.91× for OVR 95. Need separate "VOLUME EXPLOSION" archetype gated on `ins`/`stre`/`tp>85`.
- **Pure 3PT specialist nights (0 2PA).** No archetype produces "100% 3PT shot diet." `shotDietShift` maxes at +0.20. <1% of games.
- **fgaFloor over-volumes ultra-quiet blowout games.** Reaves Nov 11 `1/2, 22 min, +17` — current floor (~9 FGA) prevents this. Could add blowout-aware floor reduction (`lead > 15 && winning → halve floor`).
- **Reduce floor coefficient 0.40 → 0.30?** Would allow 6-7 FGA bench cameos while still floor=10.5 at 35 min. Pending user call.

*Last updated: 2026-04-18 (session 25)*
