# Plan — Euro FM Tycoon Layer

> **Scope:** add Football-Manager-style depth to Euro Isolated mode — real budgeting, facilities, scouting fuzz, ratings fuzz, sponsorships, travel costs, injury management. Each Euro every counts. No billionaire-owner shortcuts.
> **Prerequisite:** `plans/euro-isolated-spain-mvp.md` must ship first. This plan layers on top — it does not replace MVP work.
> **Isolation:** every feature here is gated by `isEuroIsolatedMode(state)` so NBA mode behavior is unchanged.

## Goal

Running an Endesa club feels like Football Manager: real three-budget separation (Transfer / Wage / Balance), wage structure discipline, contract amortisation, Financial Fair Play limits, installment payments, sponsor renewals tied to performance, and consequences for overspending — embargoes, sackings, even liquidation. Bad decisions cause real downstream effects; smart cash-flow management compounds advantages.

## Current status snapshot (2026-05-10)

- **Prerequisite not met yet:** `plans/euro-isolated-spain-mvp.md` is still in roadmap state, so this Tycoon layer is not implementation-ready as a whole.
- **Shipped overlap so far:** none of the Tycoon-specific finance systems in this file are live yet. There is no Euro-only budget framework, no sponsorship model, no FFP ledger, no facilities economy, no staff salary market, and no GM-sacked flow.
- **Recommended interpretation:** treat this file as post-MVP phase planning. The only current action is to keep it aligned with MVP dependencies and avoid marking Tycoon slices as active before the Euro Isolated gameplay/schedule foundation exists.

> Reference: FM26 finance model (transfer + wage budget split, amortisation, FFP embargoes, board relationships, wage structure inflation). The user dropped the full FM26 finance guide as the design target.

## Acceptance Criteria

### Core finance plumbing
- [ ] **AC-T1** A Real Madrid GM sees three separate budgets prominently: **Transfer Budget** (one-time), **Wage Budget** (recurring weekly cost), **Balance** (overall club bank). Wage bill + facility spend + scouting spend + travel cost all roll up.
- [ ] **AC-T1b** A budget slider lets the GM move funds between Transfer ↔ Wage at season start, with a board-approval check (must hit recent performance threshold to shift big amounts).
- [ ] **AC-T1c** Every signing's annual cost on the books is computed via amortisation (€30M / 5-year contract = €6M/year on the P&L), separate from cash paid this year.

### Wage structure
- [ ] **AC-T1d** Each club has a visible wage tier table (Top Earner, First XI, Rotation, Youth) with current %-of-top-earner ratios. Signing a player above the Top Earner tier triggers parity demands from senior players.
- [ ] **AC-T1e** Bonus-sweetened offers (appearance, win, championship) are visible separately from base wage — used to reduce wage-structure pressure.

### Player movement
- [ ] **AC-T2** Player ratings in scout-driven views (Free Agents, opposition rosters, prospect lists) show fuzzed values (true ± noise). Noise band shrinks with `team.expenses.scouting` investment.
- [ ] **AC-T3** Own roster always shows true ratings.
- [ ] **AC-T4** Sponsorship contracts: kit / sleeve / stadium-naming, each with yearly value tied to club prestige + recent results. Expiring deals fire inbox events with renewal options.
- [ ] **AC-T4b** Commercial revenue grows automatically when the club wins trophies / qualifies for Euroleague Final Four / signs a marquee player.
- [ ] **AC-T9** Player loans: lend a player out for one season, original club retains contract minus a wage split, player returns at year end.
- [ ] **AC-T10** European buyout clauses: contracts optionally carry a fixed buyout amount; any rival club paying that fee acquires the player unilaterally. Distinct from existing NBA-style mutual buyout.

### Cash flow
- [ ] **AC-T5** Travel cost line item: Euroleague away = flight + hotel (distance/tier-driven). Endesa = bus, lower. Visible in season ledger.
- [ ] **AC-T6** Facility upgrades (training, medical, youth, scouting) cost upfront, take 1–2 seasons, pay back via concrete bonuses (injury reduction, progression speed, scouting accuracy, FA-pool quality).
- [ ] **AC-T7** Injury rate scales with `team.facilities.medical` tier and player workload (minutes, back-to-backs, international duty).
- [ ] **AC-T11** Transfer fees can be structured as installments (40% upfront + 30% Y2 + 30% Y3). Selling clubs accept lower total amount for installments, OR demand premium for upfront.
- [ ] **AC-T12** Loaning out fringe players generates loan fees + reduces wage commitment (loanee club pays a wage share).

### Financial Fair Play + consequences
- [ ] **AC-T8** Going negative triggers escalating consequences:
  - −€2M deficit → board warning inbox event
  - −€10M → forced wage cuts (auto-renegotiation pass)
  - −€20M → transfer ban + GM sacking screen
- [ ] **AC-T13** Three-year-rolling FFP balance shown; persistent overspending triggers EuroLeague sanctions (points deduction, fine, ban from continental qualification).
- [ ] **AC-T14** Board relationships dashboard: confidence, recent promises (top-3 finish, EuroLeague qualification), takeover events. Failed promises damage confidence; high confidence → easier budget requests.

## Slices

Each slice is independent and merges on its own. Each only fires its logic in `isEuroIsolatedMode(state)` — NBA mode unaffected.

### Slice T1 — Real budgeting framework (incl. staff wages)

- **One sentence:** Add `state.teams[i].budget: { revenue, playerWages, staffWages, facilityOps, scoutingOps, travel, prizePoolEarnings, profit }` recomputed each rollover, surfaced in TeamFinancesView. Staff (head coach, GM, assistants, scouts) carry real salaries that hit the budget.
- **Value:** AC-T1, AC-T8 foundation. Numbers exist before any UI mutation. Staff wages are a real FM-style line item — firing the head coach and hiring a more expensive one creates a budget hit.
- **Path:**
  - New `services/clubFinances/budgetCompute.ts`. Annual rollover invokes for every Euro club.
  - **Revenue inputs**:
    - Base from `team.pop` (population proxy — Madrid 6.7M ≫ Burgos 0.18M, see MVP Slice 1c).
    - **Prize-pool earnings** from previous season's competition results (see MVP Slice 4 prize-pool config). Champion EL ≈ +€1M, Final Four ≈ +€500K, Endesa title ≈ +€500K. Major YoY revenue swing — winning EL inflates next year's transfer budget.
    - Sponsorships (Slice T2) layered in.
    - Matchday revenue (`team.pop` × stadium attendance × ticket price) layered in.
  - **Cost inputs**:
    - **Player wages** — sum of active contracts on roster, in EUR (uses MVP Slice 1b's currency setting).
    - **Staff wages** — head coach, GM, assistant coaches, scouts each carry a `salary` field on the staff record. Auto-seeded at setup based on tier (head coach ~€200K–€2M depending on rep, scout ~€50K, assistant ~€80K).
    - Facility ops, scouting ops, travel — Slices T4/T5/T6 own these.
  - **Future hook:** Slice T9b (below) opens an active staff signing market where the user *hires* coaches/scouts, with the salary commitment tied directly into this budget.
- **Notes:**
  - NBA path unchanged — NBA teams keep their existing finance code (richer, progression-engine-driven).
  - Staff wages line exists from day 1 even before active hiring is built (Slice T9b). Initial seeding gives every Euro team realistic staff salaries so the budget math is honest.

### Slice T9b — Active staff hiring market (future-flagged sub-feature)

- **One sentence:** A free-agent market for staff (head coach, assistant coaches, scouts, physios) where each candidate has a `salary demand` + reputation tier; user hires/fires through Team Office → Staff, every change updates `team.budget.staffWages` immediately.
- **Value:** AC-T1 staff side. Closes the "hire your coach" loop FM players expect. Without this, staff are static seeded data — adding it makes staff a genuine GM decision.
- **Path:**
  - Build on existing `state.staff.gms[]` / `coaches[]` (synthetic placeholders from Phase 2 `staffFallback.ts`).
  - Each staff record gains `salary`, `tier` (1–5), `currentContract: { team, expiry }`, `available: boolean`.
  - New free-agent staff pool — generated like player FAs at season-end based on rep/age/cycling.
  - UI in Team Office → Staff: list current staff with salary + contract years; "Browse Available" opens a staff market modal with salary demands.
  - Cap-style check: hiring a coach above current `staffWages` budget triggers a board confidence hit (ties into Slice T17 board relations).
- **AC:** Real Madrid GM fires their head coach (severance hits balance), browses 12 available coaches with demands ranging €300K–€2M, hires one for €1.5M/yr. Next season's `team.budget.staffWages` reflects the new commitment.
- **Notes:** This is **future-flagged in MVP** — the Tycoon Layer can ship Slices T1–T18 without T9b, with staff salaries baked in but unedited by the user. T9b lights up staff as an active GM decision once T1's budget framework is solid.

### Slice T2 — Sponsorship contracts (FM-style: rep-driven, slow burn, locked-in deals)

> Mechanic distilled from FM26 community wisdom: sponsorship is **reputation-driven, slow to move, and locked in** for years at a time. The user does not directly negotiate — they influence inputs (results, signings, facilities, affiliates) and the renewal formula does the rest. Mid-table grind alone won't move the needle; outliers (EL Final Four, marquee foreign signings) shift the curve.

- **One sentence:** Each Euro club gets 3 sponsor slots (kit / shirt sleeve / stadium-naming) carrying multi-year locked-in deals; deals auto-renew on expiry at a computed value driven by reputation, recent continental success, foreign-market exposure, and front-office facility tier — all of which the user influences over many seasons rather than negotiates directly.
- **Value:** AC-T4. Primary income stream. Realistic FM-style depth: small clubs feel trapped for years on shitty deals, big wins (EL title, marquee signing) move the needle but slowly.
- **Path:**
  - `state.teams[i].sponsors: { kit, shirtSleeve, stadiumNaming }` — each is `{ valuePerYear, yearsRemaining, signedYear, signedReputation }`.
  - Setup seeds with multi-year deals (3–5 yr) at values tied to current `team.pop` + base reputation. Big clubs (Real Madrid 6.7M pop) start with ~€8M/yr kit deals; small clubs (Burgos 0.18M) at ~€500K. **Important:** the *current* deal is locked in no matter how the club performs — see "slow burn" below.
  - **Renewal formula** when a deal expires:
    ```
    newValue = baseValue(team.pop, team.prestige)
             × continentalMultiplier(EL finishes last 3 seasons)  // 0.8–1.8×
             × foreignMarketingMultiplier(starPlayersFromKeyMarkets)  // 0.95–1.30×
             × facilityMultiplier(team.facilities.frontOffice)         // 0.9–1.15×
             × randomCommercialNoise()                                 // ±10%
    ```
  - **Slow-burn nature:** because deals lock for 3–5 years, a club that wins EL once doesn't see the full sponsorship boost until that year's deals expire. A small club grinding mid-table for 5 years sees marginal gains; one EL run mid-decade can re-baseline them upward.
  - Inbox events: 1-year warning before deal expires, renewal announcement at expiry, "trailing peers" warning when total sponsorship income falls below 50% of league median.
- **Inputs the user influences (sub-features of this slice):**
  - **Reputation** — accrues from results, slowly. Existing `team.prestige` field if present, else add.
  - **Continental success** — read from competition history; EL Champion = +0.8× multiplier for 5 yrs.
  - **Foreign marketing** — count star players (`OVR ≥ 75`) from "key markets" outside Europe (USA, Australia, China, Latin America, Africa). Each adds a small renewal multiplier — explains the "sign Asian player for Asian market" advice from the FM community.
  - **Front-office facility tier** — added to Slice T5's facility tiers as a new track (was 4 tracks, now 5: training / medical / youth / scouting / **front-office**).
- **Notes:** Reuse the existing inbox + LLM narrative pipeline for renewal flavor. Renewal formula's coefficients commissioner-overridable.

### Slice T2b — Foreign club affiliates (sponsorship+marketing booster)

- **One sentence:** Establish formal affiliate links with foreign clubs — costs nothing financially but improves the foreign-marketing multiplier in T2's renewal formula and unlocks loaned-player exchange paths.
- **Value:** Adds the "FM affiliate" mechanic the community calls out as a sponsorship booster. Cheap depth feature.
- **Path:** New `state.teams[i].affiliates: string[]` (foreign club tids). UI in Team Office → Operations: list affiliates, "Establish Affiliation" action. Each affiliate adds a small constant to the foreign-marketing multiplier in T2's renewal formula.
- **AC:** Real Madrid GM establishes affiliate with a Korean K-League team. 3 years later, kit-deal renewal is ~5% higher than it would have been without affiliates.

### Slice T3 — Ratings fuzz for non-own players

- **One sentence:** A new `getDisplayRating(player, viewerTid, scoutLevel)` returns true rating for own roster, fuzzed (true ± noise) for everyone else, with noise band shrinking as `team.expenses.scouting` increases.
- **Value:** AC-T2, AC-T3.
- **Path:** New helper in `utils/scoutingFuzz.ts`. Player Stats / Free Agents / Opponent Player Bio views consume it. Own-team views bypass the fuzz.
- **Notes:** BBGM player.ratings already has a `fuzz` field — reuse if compatible, otherwise add a derived display value.

### Slice T4 — Travel cost line item (synthetic flat for MVP)

- **One sentence:** Each away game accrues a flat travel cost — Euroleague away ≈ €40K (international flight + hotel), Endesa away ≈ €5K (domestic bus); both summed into the season ledger.
- **Value:** AC-T5.
- **Path:** Hook in simulation-completion path. When an away game is logged for a Euro user team, increment `team.budget.travel` by a flat amount keyed off the game's `competitionId` (read from CompetitionSpec or a lookup like `TRAVEL_COST_PER_AWAY: { euroleague: 40_000, endesa: 5_000, copa: 8_000, supercopa: 8_000 }`).
- **Future flag (NOT in MVP):** distance-based travel cost using city-pair coordinates. BBGM has a `src/common/geographicCoordinates.ts` reference table for that approach — port the pattern when this slice gets a polish pass. For now, synthetic flat is enough to give the user a meaningful budget line.
- **Notes:** No flight-day UI overlay in MVP; just the cost accrual. Flat cost coefficients are commissioner-overridable (`leagueStats.flightCostPerKmEUR` field reserved but unused until distance-based ships).

### Slice T5 — Facility upgrade flow

- **One sentence:** Team Office gains a "Facilities" sub-page where the GM can spend money to upgrade Training / Medical / Youth Academy / Scouting tiers, each tier taking 1–2 seasons to complete and unlocking concrete bonuses.
- **Value:** AC-T6.
- **Path:** `state.teams[i].facilities: { training: 1-5, medical: 1-5, youth: 1-5, scouting: 1-5, pendingUpgrades: { ... } }`. Construction queue advances at rollover. Bonus wiring: medical tier → injury rate multiplier, training tier → progression speed multiplier, scouting tier → fuzz reduction multiplier, youth tier → external-FA-pool quality tilt.
- **Notes:** Can ship without all four bonus wirings — each is its own follow-up slice if needed.

### Slice T6 — Injury system tweaks for Euro mode

- **One sentence:** Injury frequency and recovery time scale by `team.facilities.medical` tier; high workload (back-to-back games, intl. duty) raises injury risk.
- **Value:** AC-T7.
- **Path:** Augment existing injury roll in `playerDevelopment` or `simulation/injury` — read the team's medical tier when rolling per-game injury chance.
- **Notes:** The existing system has a base injury rate; we just multiply by `1 - (medicalTier - 1) * 0.08` or similar.

### Slice T7 — Bankruptcy + GM-sacked → pick-new-team modal

- **One sentence:** Going negative triggers inbox events at warning (−€2M) and wage-cut (−€10M) thresholds; at −€20M three-year cumulative the GM is **fired** at the next offseason rollover, surfacing a "You're Fired — Pick Your Next Club" modal that lets the user select any other Endesa club to manage going forward (no save-end, just team switch).
- **Value:** AC-T8 with FM-style consequence flow. The fired-GM modal is the *durable surface* — same flow will be reused by NBA-mode firing in a future update.
- **Path:**
  - Rollover-time check against `team.budget.profit` 3-year-rolling (overlaps with Slice T16 FFP rolling balance — same underlying number).
  - Threshold ladder fires inbox events at −€2M (warning) and −€10M (forced wage cuts auto-renegotiation pass).
  - At −€20M cumulative: rollover suppresses the normal offseason-aufgaben flow and renders a `<GMSackedModal>` instead (NOT as a row in the aufgaben sidebar — it's a forced full-screen interrupt).
  - Modal shape: title "You're Fired", retrospective summary (deficits per year, biggest decisions that hurt), then a `<TeamSelector variant="grid">` of all Endesa+Euroleague clubs. User picks → `dispatchAction({ type: 'UPDATE_STATE', payload: { userTeamId: pickedTid }})` and the save continues with the new club. Old club gets a fresh AI-controlled GM.
  - **Same modal is built once** here; future NBA-mode firing reuses the same component when board sacking is added on the NBA side.
- **Notes:** NBA mode unaffected today because NBA path doesn't compute `team.budget.profit`. The GMSackedModal component is built league-agnostic so the future NBA wiring is just gating + hookup.

### Slice T8 — UI integration: TeamFinancesView Euro variant

- **One sentence:** TeamFinancesView in Euro mode shows a single annual ledger (revenue / wages / facilities / scouting / travel / sponsorships / profit) instead of the NBA cap-centric view, in EUR.
- **Value:** AC-T1 visible. Brings everything together.
- **Path:** Branch in TeamFinancesView on `isEuroIsolatedMode(state)`. Pull from the data slices T1–T5 produce.

### Slice T9 — Player loan system (Euro-flavored)

- **One sentence:** A club can loan a player to another club for 1 season — original club retains contract ownership, loanee club pays a portion of wages and gets the player on roster.
- **Value:** Core European mechanic. Real Madrid lends a young guard to Tenerife for development minutes; player returns next summer.
- **Path:** Build on the existing NBA "future loans" TODO already in the backlog. New `state.players[i].loan?: { fromTid, toTid, returnSeason, wageSplit }`. UI in Team Office: "Loan Out" / "Loan In" tabs. Year-end auto-return.
- **AC:** A loaned player counts on loanee's roster for play, but original club's books carry the contract minus wage-split share. Returns automatically at season end.

### Slice T10 — European buyout clauses (extend existing buyout)

- **One sentence:** Contracts in Euro mode optionally carry a buyout-clause amount; any club can pay that fee to sign the player out of contract, regardless of the holding club's wishes.
- **Value:** European-realistic. Differs from existing NBA-style buyout (mutual agreement → FA pool); the European version is unilateral by the buying club.
- **Path:** Extend `Contract` shape with `buyoutClauseUSD?: number`. New action `EXECUTE_BUYOUT_CLAUSE { playerId, payingTid }`. Existing NBA-buyout path untouched.
- **AC:** Real Madrid signs a player with €30M clause. Barcelona pays €30M cash, player joins Barcelona, contract reset on new terms. NBA mode unaffected.

### Slice T11 — Three-budget split + budget slider

- **One sentence:** Replace single-budget model from Slice T1 with FM-style three pots: `transferBudget` (one-time, refreshed on revenue), `wageBudget` (weekly cap), `balance` (cash bank); add a slider letting the GM shift funds between transfer and wage at season start.
- **Value:** AC-T1, AC-T1b. Foundation FM mechanic.
- **Path:** Refactor `state.teams[i].budget` from Slice T1 into `{ transfer, wage, balance, transferToWageHistory }`. New TeamFinancesView panel: slider + "Apply" button. Board-approval gate proportional to club performance over the last 2 seasons.
- **AC:** Real Madrid season-start: see €40M transfer / €60M wage / €120M balance. Slider lets GM shift €10M from transfer to wage subject to board OK.

### Slice T12 — Contract amortisation on the books

- **One sentence:** When signing a player for a multi-year deal, the cash paid this year goes against `balance`, but the annual P&L charges `totalContractValue / years` per season — so a 5-year €25M deal spreads as €5M/year for FFP purposes.
- **Value:** AC-T1c, foundation for AC-T13 (FFP).
- **Path:** New `state.teams[i].amortisationLedger: { signingId, perYearCost, yearsRemaining }[]`. Compute on signing. Decrement at rollover. P&L sums = `wage commitments + amortisation per year + facility ops + scouting + travel - revenue`.
- **AC:** Signing a 4-year €20M deal in Y1: balance −€20M, P&L charge for Y1..Y4 each = €5M.

### Slice T13 — Wage structure tiers + parity demands

- **One sentence:** Each club has a `wageStructure: { topEarner, firstXI, rotation, youth }` table; signing a player at a higher base than the top-earner triggers a parity-demand inbox event from the existing top earner.
- **Value:** AC-T1d. Brings wage discipline gameplay.
- **Path:** New `state.teams[i].wageStructure` recomputed on every roster change. SigningModal flags "this offer breaks structure". Parity demands fire as inbox events with auto-resolution options.
- **AC:** Real Madrid signs a guard at €18M/yr when current top earner is €12M/yr → next day, the existing top earner's agent demands €18M extension or trade request.

### Slice T14 — Bonus-sweetened offers (appearance / win / championship)

- **One sentence:** SigningModal exposes optional bonus structure (appearance fee, win bonus, championship bonus) that's tracked separately from base wage and only paid out on conditions met.
- **Value:** AC-T1e. Lets GM lower base salary without losing player.
- **Path:** Extend `Contract` shape with `bonuses: { appearance?, win?, championship? }`. Engine accrues to a separate ledger, paid at season-end based on actual conditions.
- **AC:** Sign player at €8M base + €5M championship bonus. Win Euroleague → bonus pays out. Lose in Final Four → bonus does not.

### Slice T15 — Installment payments for transfers

- **One sentence:** When negotiating a transfer (loan or buyout), the buying club can structure the fee across years; selling club either accepts lower total for installments OR demands premium for upfront.
- **Value:** AC-T11. Cash-flow management.
- **Path:** Extend the relevant transfer/buyout actions with `paymentSchedule: { upfront, year2, year3, year4 }`. Receiving club's revenue book recognises payments year-by-year. Auto-suggest 30/30/30/10 splits in UI.
- **AC:** Real Madrid signs a player from CSKA for €12M total: €4M upfront, €4M year-2, €4M year-3. Real Madrid's balance shows −€4M now, scheduled −€4M for next two rollovers.

### Slice T16 — Three-year FFP rolling balance + sanctions

- **One sentence:** Each club's three-year rolling P&L tracked; persistent over-deficit triggers EuroLeague sanctions (transfer embargo, points deduction, EL ban).
- **Value:** AC-T13.
- **Path:** Rollover-time check sums last 3 years' P&L. If `< -€30M` cumulative, fire sanction event. Sanction state persists 1 year. Affects `team.transferEmbargoUntil`, `team.euroleagueBanUntil`.
- **AC:** Real Madrid runs −€15M three years running. Year 3 rollover fires "Transfer Embargo" inbox event for next season.

### Slice T17 — Board relationships + promises

- **One sentence:** Each save tracks board confidence (0–100) and active promises ("Top 3 in Endesa", "Qualify for EL Final Four"); failed promises drop confidence, high confidence unlocks easier budget requests.
- **Value:** AC-T14.
- **Path:** New `state.teams[i].boardRelations: { confidence, activePromises, recentPromises }`. Promises fire at season start (board → GM dialog). Outcome resolved at season end.
- **AC:** Promise top-3 finish, finish 5th → −20 confidence. Confidence under 30 → board sack inbox event.

### Slice T18 — Browser smoke test (deferred to user)

- **One sentence:** Walk a Real Madrid save through one full season + offseason and verify all AC-T items observable.
- **Owner:** User. After confirming, delete this plan file.

## Risks & Open Questions

- **R1: Scope creep.** This plan alone is 8 substantive slices. Real FM has years of polish behind these systems. MVP target is "feels FM-like enough to be fun" not "matches FM 1:1".
- **R2: NBA-side regression.** Every slice gates on `isEuroIsolatedMode(state)`. Type-check + a quick NBA-side smoke test required after each slice merges.
- **OQ-1**: Should sponsorship deals also exist in NBA mode (they kind of already do via media-rights)? For now: Euro-only, NBA path unchanged.
- **OQ-2**: Travel-cost lookup table — synthetic by city distance? Or hand-tune the top 20 EuroLeague city pairs and fall back to flat fee? Probably the latter for MVP.
- **OQ-3**: Youth Academy tier in Slice T5 promises "FA-pool quality tilt" — depends on existing `runExternalFreeAgency` offering hooks. May need a small extension there.
- **OQ-4**: Bankruptcy / GM-sacking — does it end the save, or auto-rebuild with a new GM? FM picks the latter; we should match.

## Process

1. Wait until Spain MVP ships (`plans/euro-isolated-spain-mvp.md` Slice 11 closed).
2. Confirm AC-T1..T8 with user.
3. Slices T1–T2 first (data layer). T3–T7 are independent depth additions. T8 brings UI together.
4. Browser test, delete plan.
