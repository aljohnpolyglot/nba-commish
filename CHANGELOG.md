# Changelog — NBA Commish Sim

Historical bug fixes, session notes, and architecture discoveries.

## Session 27 (Apr 25, 2026) — Prompt I rewrite: FA pipeline realism pass

### Hotfix 27h — RFA matching offer-sheet mechanic

User flagged the missing real-NBA Restricted Free Agent matching window — Ayton-Suns-Pacers flow, where prior team can match an offer sheet within a 48-hour window to retain the player.

**Resolution flow** (`faMarketTicker.ts`):
1. When a market resolves with a non-prior team winning AND `player.isRestrictedFA === true` AND `rfaMatchingEnabled` setting is on → market enters pending-match state instead of finalizing
2. New schema fields on `FreeAgentMarket`: `pendingMatch`, `pendingMatchExpiresDay`, `pendingMatchPriorTid`, `pendingMatchOfferBidId`, `matchedByPriorTeam`
3. New section `1a. RFA pending-match resolution` runs each tick; AI prior teams decide via seeded random + budget gate; user prior teams skip (handled by reducer)
4. Window expiry (default 2 days) → auto-decline → signing team gets the player
5. Match acceptance pct: K2 ≥ 85 → 0.85, K2 80-84 → 0.70, K2 70-79 → 0.55. 2nd-apron teams auto-decline (when `rfaAutoDeclineOver2ndApron` setting on).
6. **History entries fire as a chain** — first the offer sheet ("X signs offer sheet with Y — prior team has 2 days to match") then either the match override ("Y matched X's offer sheet") or the move-on ("X signs with signing team — prior team declined to match")

**User UX** (`ToastNotifier.tsx` + `GameContext.tsx`):
- New toast type `'rfa-offer-received'` — fuchsia theme, FileSignature icon, **inline Match/Decline buttons**, 12s persistence
- New `MATCH_RFA_OFFER` / `DECLINE_RFA_OFFER` reducers — apply contract directly (Match) or short-circuit pending state (Decline)
- Outcome toasts: `'rfa-matched'` (emerald) / `'rfa-not-matched'` (rose) — fired when user is signing OR prior team
- New state fields drained by ToastNotifier: `pendingRFAOfferSheets[]` + `pendingRFAMatchResolutions[]`

**EconomyTab settings** (deferred to next pass) — three settings still need wiring on the rules screen:
- `rfaMatchingEnabled` (default `true`)
- `rfaMatchWindowDays` (default `2`)
- `rfaAutoDeclineOver2ndApron` (default `true`)

Currently respect inline defaults in code; commissioner can't yet toggle them. Will land in the next bundle alongside the parallel signing-difficulty agent's settings work to keep useRulesState clean.

### Hotfix 27g — Bird Rights re-sign Pass 0

Real NBA: prior team gets a Jul 1 first-look on expiring stars before the open market opens. Without this, expiring stars who declined a mid-season extension (one bad seeded roll → `midSeasonExtensionDeclined: true` blocks season-end retry) fall straight into the FA market — where their incumbent team often can't bid (over-cap, lux-tax). Result: Finals contenders lose their own players for nothing (Jalen Duren on DET case).

**Fix** (new `runAIBirdRightsResigns()` in `AIFreeAgentHandler.ts`, wired in `simulationHandler.ts` rollover branch):
- Fires once on Jul 1 right after `applySeasonRollover` returns, before any FA market opens
- Eligible: FAs with `hasBirdRights: true`, K2 ≥ 75, prior NBA team known, mood ≥ -2 (or LOYAL trait), prior team not over 2nd apron, has open roster slot
- Offers `computeContractOffer × 1.10` (Bird Rights premium) up to player's max contract
- Acceptance: 95% LOYAL, 65% MERCENARY, 85% default — seeded `bird_rights_${playerId}_${year}` for replay determinism
- Clears `midSeasonExtensionDeclined` flag — fresh slate
- Emits history entry: "X re-signs with the Y via Bird Rights: $XM/Yyr (player option) (Supermax)"

After this, Duren-tier expiring stars get a guaranteed first-look at +10% premium. The 15% of stars who still hit FA represent legitimate departures (LOYAL trait absent + mood drop / MERCENARY chasing money / 2nd-apron team) — Myles Turner pattern, realistic but rare.

### Hotfix 27f — Bird Rights re-sign in the bid pool

User flagged: Jalen Duren (K2 90, age 23) hit FA after DET made the 2025-26 Finals. DET didn't show up in his bid pool. Cause: `generateAIBids` filtered teams by `capSpace >= minSalary || payroll < luxuryTax`. Finals contenders run hot payrolls (DET over-tax) → filtered out → no bid. But real NBA: Bird Rights lets the prior team sign their own player over the cap regardless of payroll. The whole reason teams re-sign their stars instead of losing them.

**Fix** (`freeAgencyBidding.ts:206-232, 268-272, 282-296`):
- Compute `priorTid` for the player (most-recent NBA tid via transactions or stats with gp > 0)
- `playerHasBirdRights = (player.hasBirdRights === true) && priorTid >= 0`
- Eligibility filter now whitelists the Bird Rights holder unconditionally
- Sort puts the Bird Rights team at the top of the candidate slice so they don't get squeezed out
- Cap-affordability gate inside the bid loop allows the Bird Rights team to bid up to player's max contract
- Bid pct gets +15% multiplier for the Bird Rights team — incumbents over-pay to retain (Mavs/Lakers max-deal pattern)

After this DET will show up in Duren's bid pool with an inflated offer that reflects them having his Bird Rights — closer to the real-NBA "over-cap re-sign your own stars" dynamic.

### Hotfix 27e — wider bid pool for stars (post-PR1 polish)

User saw every star post-Jul 1 2026 rollover getting the same 3-team market: BKN/LAL/LAC offering, repeated bid amounts, no real war. Cause: `generateAIBids` slice took `maxBids * 2 = 6` candidates and locked the same 3 cap-rich teams every time. After multi-season sim only ~3 teams have real cap room; desirability tiebreak put the same trio at the top for every market.

**Fix #1** (`faMarketTicker.ts:362-368`): `maxBids` now tier-based. K2 ≥ 88 → 5 bids, K2 80-87 → 4, else → 3. Stars get a real bidding war (Reaves / Harden / LeBron tier should attract 5 suitors, not 3).

**Fix #2** (`freeAgencyBidding.ts:227`): bidder candidate pool widened from `maxBids × 2` to `max(maxBids × 3, 12)`. With more candidates feeding the affordability filter, mid-cap teams that get filtered for star bids can still surface for K2 80-84 mid-tier markets. No more "every K2 ≥ 80 player has the same 3 bidders."

### Hotfix 27d — Bidding-war refactor PR1 + Free Agency scouting tab

User green-lit the bidding-war refactor. Shipping PR1 (threshold drop + cap-threshold cleanup + offseason burst window) plus a new GM-mode Free Agency scouting tab.

**PR1: Lower market threshold to K2 ≥ 70** (`faMarketTicker.ts:24-39, 271-280, 357-365`)
- `MARKET_K2_THRESHOLD = 80 → 70` so K2 70-79 mid-tier rotation FAs see multi-team bidding instead of going silently through `runAIFreeAgencyRound`.
- `MAX_NEW_MARKETS_PER_DAY = 6 → 8` baseline. New `MAX_NEW_MARKETS_BURST = 30` for Jul 1-3 (offseason FA flood — without burst, K2 70 threshold would leave 100+ FAs sitting until late July).
- `MAX_MARKETS_RESOLVING_PER_DAY` bumped 10 → 20 to handle the extra throughput.
- Replaced hardcoded `luxTax = cap × 1.18, mleUSD = cap × 0.085` with `getCapThresholds()` + `getMLEAvailability()` so commissioner-tuned cap settings (lux pct, MLE pct) are respected.

**Free Agency scouting tab** (new `TeamIntelFreeAgency.tsx`, wired in `TeamIntel.tsx`)
- Sub-tab pill at top of TeamIntel switches between Trades (existing) and Free Agency (new). Shared team banner, conditional body.
- Cap Ticker: cap room, MLE available, total shortlist commit, projected room after winning all shortlist bids — color-coded amber when commit > available.
- My Shortlist: up to 15 starred FAs persisted on `tradingBlockStore.faShortlistIds[]`. Per-row portrait, K2 OVR, asking price (`computeContractOffer`), trait badge (LOYAL/MERCENARY/COMPETITOR). Amber-pill Edit button opens existing `PlayerSelectorGrid` modal.
- Live Bid Tracker: every active market involving a shortlisted FA OR where the user has bid. Color-thread: amber when user is leading, red when outbid, slate when no bid. Stage indicator ("Resolves in 3d" / "Resolves today"). Top bid + user bid side-by-side with team abbrev.
- Top FAs scouting drawer: sortable read-only table with tier filter chips (All / 90+ / 80-89 / 70-79 / Under 25). Star toggle adds/removes from shortlist.

**Persistence**: `TradingBlockEntry.faShortlistIds` is optional — old saves load without migration; new shortlists save back to the same per-saveId localStorage entry as trade targets/untouchables.

**What's deferred to later PRs**:
- PR2: parallel bid collection with 3-round escalation window
- PR3: resolution formula upgrade (`legacyMult`, `championshipMult`, `moodMult`, Bird-Rights tiebreak before RNG)
- PR4: gut sequential pipeline (Pass 1 → Bird Rights re-sign only)
- PR6: LOAD_GAME save migration

### Hotfix 27c — autoResolvers post-draft 2W sneak path

User's TWOWAYAGE audit showed 13 vets on 2W contracts (age 25-29, YOS 3+) post 27a/27b. Pass 2 in `runAIFreeAgencyRound` was correctly rejecting them, but `autoResolvers.ts:996-1003` runs a *separate* post-draft 2W auto-assignment every Jul 1 that gated only on OVR ≤ 45 — the sneak path.

**Fix** (`autoResolvers.ts:996-1018`): mirrored the AIFreeAgentHandler Pass 2 age/YOS gate. Plus added a `draft.year` YOS backup (`max(yosFromStats, yosFromDraft)`) so real-player gist imports whose `stats[]` lack `gp` counts still register as veterans. Same backup wired into Pass 2 (`AIFreeAgentHandler.ts:367-376`) and the TWOWAYAGE cheat (`debugCheats.ts:563-572`) so all three use identical logic.

After this, no signing path can land an age ≥ 30 player on a 2W deal, and 25-29 players require YOS ≤ 2 by either stats OR draft-year reckoning.

### Hotfix 27b — date clamp plumbed into runAIFreeAgencyRound

User sim'd 2 more years post-27a, surfaced 2 more mid-season offenders:
```
Oct 26, 2027 — Cameron Johnson → BOS $42M/3yr (MLE)
Nov 22, 2027 — Landry Shamet  → HOU $52M/3yr (PO)
```
Root cause: Session 27's mid-season cooldown lived only in `faMarketTicker.ts` + `freeAgencyBidding.ts`. Players with K2 < 92 don't open markets post-Oct 21 (they're below the late-season threshold) — so they fall to `runAIFreeAgencyRound` Pass 1 / Pass 4 / Pass 5 + `runAIMleUpgradeSwaps`, where `computeContractOffer` returns full 3-4yr deals year-round with NO date awareness.

**Fix** (`AIFreeAgentHandler.ts:13, 22-69`): added a `clampOfferForDate` helper at the file boundary that applies the same date gates as `faMarketTicker` + `generateAIBids`:
- **Length cap**: post-Oct 21 → 2yr; post-deadline + `postDeadlineMultiYearContracts: false` → 1yr.
- **Salary decay**: late-Oct/Nov/Dec ×0.55, Jan ×0.35, Feb-Jun ×0.20. Floored at league min.
- Returns offer unchanged in offseason (Jul 1–Oct 21).

Wired into 4 sites:
- Pass 1 best-fit signing path (`:331`)
- Pass 4 mid-tier candidate map (`:570`)
- Pass 5 floor-enforcement candidate map (`:724`)
- `runAIMleUpgradeSwaps` candidate filter + final offer (`:1316, 1325`)

Both pipelines (markets + sequential round) now honor identical mid-season gates. Forward-only — existing mid-season contracts remain on the books until they expire.

### Hotfix 27a — post-sim regressions (same day)

User sim'd forward and surfaced 4 regressions Session 27 didn't catch:

- **Years cap leaked through pre-cutoff markets** (`faMarketTicker.ts:103-115, 158`) — `maxYearsThisTick` only fired at market *open*. A market opened Sep 30 with 3yr bids resolving Nov 5 (Quentin Grimes $96M/3yr) honored the original 3yr. Added `resolutionMaxYears` clamp at resolution time using the same date gate. Also propagated `finalYears` to history text, news content, Shams post, contract years array (option flag was tied to `winner.years - 1` but should be `finalYears - 1` to land on the actual last year).
- **Same-player double-sign** (`simulationHandler.ts:1046-1055`) — Gary Harris signs CHA + MIA same day Oct 12. `runAIFreeAgencyRound` returned a results array; `state.players.map(...find(...))` only applied the first, but `signings.map(...)` over history wrote both. Added `seenSignIds` dedup at the simulationHandler boundary so multi-pass collisions can't double-emit.
- **2W promotion at $10.8M** (`AIFreeAgentHandler.ts:881-892`) — `autoPromoteTwoWayExcess` paid full `computeContractOffer` market value on promotions. Real NBA 2W→standard is min / pro-rated min. Capped at `2× minSalaryUSD` (~$2.5M). Genuine breakouts can still earn a real standard deal next FA window.
- **2W age gate weak against real-player imports** (`AIFreeAgentHandler.ts:357-377`) — gist-fetched real players (e.g., Jarrett Culver age 28, 8 YOS) have `stats[]` entries without `gp` counts, so the YOS check returned 0 and the vet passed through. Added a hard `age ≥ 30 → reject` ceiling regardless of YOS. Age <25 still auto-passes; 25-29 still requires YOS ≤ 2.



Original Prompt I (Bird Rights re-sign Pass 0, rookie-ext retry, waive-to-sign) became largely moot once Prompt M shipped — stars no longer sit unsigned with a realistic talent pool. Re-scoped against a user-provided 2029-30 transaction log audit. 4 fixes + 3 new debug cheats.

**Audit findings (transactions that didn't make sense):**
- Tre Jones → TOR **$123M/4yr Feb 8, 2030**, Diabate → HOU **$108M/4yr Dec 18**, Jakucionis → WAS **$111M/4yr Dec 2** — mid-season mega contracts from `faMarketTicker` opening K2 ≥ 80 markets all season
- 80+ two-way signings stamped same day (Jun 27, 2030) — markets converge
- Mathurin / Rozier / Christian Wood / Bol Bol on $0.6M two-ways — vets sweeping into 2W slots gated only by OVR
- Aaron Bradshaw "re-signed" CLE $31M, then "re-signed" WAS 2W $0.6M, then "re-signed" WAS $24M same offseason — extension fired immediately after fresh waiver-and-resign chain
- Dylan Cardwell $106M/4yr (NOT a bug — real Auburn/SAC player at K2 86 coming off breakout starter year, fair-market deal that aged poorly: realistic Tobias Harris pattern)

**Fix #1 — Mid-season market cooldown** (`src/services/faMarketTicker.ts:25-50, 282-340`)
- New `LATE_SEASON_K2_THRESHOLD = 92` + `MAX_MARKETS_RESOLVING_PER_DAY = 10` constants
- New `isPostPreseason(stateDate)` helper — true after Oct 21
- Market open gate: post-preseason only K2 ≥ 92 stars open new markets (rest sit until next offseason or sign min/NG via Pass 4)
- Mid-season `years` capped at 2 — no 4yr December contracts
- Resolution stagger: when more than 10 markets resolve within next 3 days, push new market `decidesOnDay` further out

**Fix #2 — Mid-season bid decay** (`src/services/freeAgencyBidding.ts:241-262`)
- `generateAIBids` salary pct multiplier by date:
  - Late Oct (22+) / Nov / Dec: ×0.55
  - Jan: ×0.35
  - Feb-Jun: ×0.20 (trade deadline+ — fringe-only money)
- Already-open markets that resolve mid-season honor the discount via this path — `tickFAMarkets` regenerates bids if needed; existing bids stand at their original pct (acceptable: those already committed to the player when offers were generated)

**Fix #3 — Two-way age/YOS gate** (`src/services/AIFreeAgentHandler.ts:357-372`)
- Pass 2 candidates must satisfy `age ≤ 24` OR `yearsOfService ≤ 2`
- Aging vets fall through to Pass 4 min-deal path (real $1.27M minimum, not $0.6M two-way)
- OVR cap (≤ 60 BBGM) unchanged

**Fix #4 — Extension `yearsWithTeam ≥ 1` gate** (`src/services/AIFreeAgentHandler.ts:973-986, 1091-1102`)
- Both `runAIMidSeasonExtensions` and `runAISeasonEndExtensions` require player has been with team at least 1 year
- Eliminates duplicate "re-signed" labels in same offseason — a player picked up from waivers in November can no longer get an extension days later
- Bird Rights flag is already cleared on waiver via 3 paths (`simulationHandler.ts` waiver block, `playerActions.ts:handleWaivePlayer`, `simulationHandler.ts` autoTrim waiver block) — verified during audit

**Debug cheats** (`src/utils/debugCheats.ts`)
- **MIDSEASON** — flags any `signs with` or `has re-signed` history entry > $10M annual dated Nov 1+
- **TWOWAYAGE** — 2W age distribution buckets (≤21 / 22-24 / 25-27 / 28-30 / 31+) + flags vets (age ≥ 25 AND YOS ≥ 3) on 2W deals — should always be 0 post-fix
- **RESIGNS** — groups "has re-signed" entries by playerName + offseason year; flags any player with ≥2 entries in same offseason

**LOAD_GAME migration**: NONE. Forward-only. Existing 2W vet contracts remain until they expire; existing mid-season mega contracts stay on the books. Verifying via `MIDSEASON` after a future season's FA cycle should show no new offenders.

**DevTools verification**:
```
> // After 1 full season post-Prompt-I:
> [check via cheats] MIDSEASON   → 0 new $10M+ deals dated Nov 1+
> [check via cheats] TWOWAYAGE   → "Vets on 2W" table empty
> [check via cheats] RESIGNS     → "Players with ≥2 re-signed" empty
```

---

## Session 26 (Apr 24, 2026) — Prompt J: External-league ecosystem sustainer

**New file: `src/services/externalLeagueSustainer.ts`**

Fixes foreign leagues shrinking to <6 players/team over 5-year sims (B-League lost ~40% of population), retirement never firing for external players, and undrafted internationals bloating the NBA FA pool.

**Fix #1 — External retirement (standalone, replaces bridge in `retirementChecker.ts`)**
- `retireExternalLeaguePlayers(players, year, stateDate)` — extracts the per-league curves (G-League aggressive/35+, PBA lenient/44+, pro leagues moderate/42+) from the inline bridge that lived in `retirementChecker.ts`
- Emits `historyEntries` with `playerIds` per retiree: `"${name} retired from the ${league} after ${gp} career games."`
- Same `seededRandom('retire_ext_${internalId}_${year}')` seed — fully deterministic replay
- `retirementChecker.ts`: inline external branch removed; comment points to new helper. NBA/FA path unchanged.

**Fix #2 — Minimum 12 per external team (safety net)**
- `enforceExternalMinRoster(state, year)` — journeymen fill (age 26-30), runs last in rollover after all other flows, also wired at initial load point
- Caps at 15, targets 12. OVR skewed toward lower-mid (70% bottom half, 30% top half of league range)

**Fix #3 — Two-track repopulation**
- `repopulateExternalLeagues(state, retirees, year, nextYear)` — outflow tracking: retirees per league + 19y auto-declarers (born.year === year-18, matching NATIONALITY_LEAGUE_BIAS)
- Track A (Euroleague/Endesa/NBL Australia/B-League/G-League): spawn 15-18yo at youth-club teams (FC Barcelona, Chiba Jets, etc.)
- Track B (PBA/China CBA): spawn 22-26yo adult-direct; nationality overridden to Philippines/China
- OVR caps: Euroleague ≤68 … G-League ≤55 (BBGM raw). Youth POT cap = ovrCap+8, adult = ovrCap+4

**Fix #3b — Undrafted-returns-home**
- `returnUndraftedToHomeLeague(players, draftYear, state)` — runs after `autoRunDraft` in `autoResolvers.ts`
- Finds `tid=-1, status=FA, draft.year=draftYear, round=0` players with non-US/Canada `born.loc`
- Routes via `NATIONALITY_LEAGUE_BIAS` to least-rostered team in home league
- Entry-level salary (scale.minPct × 1.5 of salaryCap), 1-year contract
- History entries: `"${name} returned to the ${league} after going undrafted in the ${year} NBA Draft."`

**Integration**
- `seasonRollover.ts`: imports + calls `retireExternalLeaguePlayers` → `runRetirementChecks` → `repopulateExternalLeagues` → `enforceExternalMinRoster`; ext retire history merged into returned `history[]`
- `autoResolvers.ts`: `returnUndraftedToHomeLeague` called after two-way assignment, before return

**DevTools verification** (paste after 1-season rollover):
```js
const leagues = ['Euroleague','Endesa','China CBA','NBL Australia','PBA','B-League','G-League'];
leagues.forEach(lg => {
  const players = state.players.filter(p => p.status === lg);
  const teams = state.nonNBATeams.filter(t => t.league === lg);
  const under = teams.filter(t => state.players.filter(p => p.tid === t.tid).length < 12);
  console.log(lg, '| players:', players.length, '| teams <12:', under.length);
});
```
Target: zero teams below 12 per league.

---

## Session 26 (Apr 24, 2026) — Prompt K: fetch resilience + storage quota

**Fix #1 — Robust gist fetch (retry + 24h IDB cache)**
- New `src/services/utils/fetchWithCache.ts`: 4-attempt exponential backoff (0/500ms/1s/2s), 24h TTL, separate `gist-cache` IDB DB, stale-cache fallback on total failure.
- All 7 optional fetchers migrated: `fetchAvatarData`, `fetchPlayerInjuryData`, `loadRatings` (NBA2k), `fetchStatmuseData`, `fetchNBAMemes`, `fetchCharaniaPhotos`, `fetchInjuryData`. Intermittent CORS/network failures no longer degrade app state on reload — stale gist data serves until fresh fetch succeeds.

**Fix #2 — Quota-aware imageCache + LRU eviction**
- `imageCache.ts` bumped to DB v2 with new `lru` object store tracking `lastAccessed` per cached URL.
- Before downloading/caching a blob: `navigator.storage.estimate()` gate — skip caching at >80% quota usage; at >95% evict oldest 20% of portrait cache (by LRU) and still skip the new blob. Blob URLs in `blobUrlMap` revoked on eviction.
- IDB hits now update LRU so recently-accessed portraits survive eviction longer.

**Fix #3 — Non-blocking init** (already in place)
- All 7 optional fetches in `App.tsx` were already fire-and-forget; `state.isDataLoaded` is gated by the reducer, not by optional asset loads. No App.tsx changes needed.

**Fix #4 — QuotaExceededError UX**
- `SaveManager.saveGame()` wraps `set(id, state)` in try-catch. On `QuotaExceededError` (name or code 22): `window.confirm()` asks user to clear portrait cache; if confirmed, deletes `nba_commish_image_cache` DB and retries the save. Private `_deleteImageCacheDB()` helper does the deletion without importing imageCache.ts (avoids circular deps).

## Session 25 (Apr 24, 2026) — Multi-season economy sweep + delegated agents

Shipped 11 bugs across Opus inline work and Sonnet delegation (Prompts A–H). Full 5-year-sim audit drove discovery.

**Playoff / draft scheduling**

- **2029 Finals stranded at Game 7** — `PlayoffAdvancer.ts` June 10 Finals-start cap clamped backward even when the cap was already behind the feeders' last game, placing games on dates lazy-sim had already passed. Now only clamps when `juneMaxStart > laterEnd`.
- **Draft duplicated + hardcoded date** — lazy sim fired `draft_execute` before `runSimulation`, which then ran `applySeasonRollover` Jun 30 and reset `draftComplete: undefined`; next iteration saw rolled-over year and re-fired. Fix: `lazySimRunner.ts:559` clamps `batchDays` to land exactly on the earliest unfired event date. Also `dateUtils.getDraftDate()` rewritten to compute **last Thursday of Finals-ending month** (June default; shifts +1 month per extra playoff round). Explicit `stats.draftMonth/draftDay` overrides respected. Call sites wired: `lazySimRunner`, `gameLogic`, `autoResolvers`, `seasonRollover`, `DraftSimulatorView`, `MainContent`.
- **Draft card rendering on two days** — one-day fix in `DraftSimulatorView` + ADVANCE_DAY `autoDraftComplete` gate verified idempotent across both paths.

**External leagues / FA purgatory**

- **External-league contracts never expire** — `seasonRollover.ts:280` EXTERNAL_LEAGUES short-circuit returned `{...p, age+1}` unconditionally, so Barcelona 1-year deals with `exp=2026` stayed "current" in 2030+. Split the branch: retired/no-contract/FA still short-circuit; WNBA explicit age-only (separate pipeline, no NBA leak); men's external leagues with `contract.exp <= currentYear` flip to `tid:-1, status:'Free Agent', twoWay:undefined, nonGuaranteed:false, gLeagueAssigned:false, hasPlayerOption:false` so `routeUnsignedPlayers` (Oct 1) and `runAIFreeAgencyRound` can re-route.
- **FA purgatory ('FreeAgent' typo)** — `simulationHandler.autoTrimOversizedRosters` wrote `status: 'FreeAgent'` (no space); every FA signing filter compares `status === 'Free Agent'`. Trim-released players invisible to Pass 1–5 forever. Also surfaced as "Lg: FreeAgent" literal in PlayerBioContractTab salary view. Fix: all three waive paths (`handleWaivePlayer`, auto-trim, MLE-swap waive) write canonical `'Free Agent'` + clear team-tied flags (`twoWay`, `nonGuaranteed`, `gLeagueAssigned`, `mleSignedVia`, `hasBirdRights`, `superMaxEligible`, `yearsWithTeam`). Contract.amount kept so salary history still renders. LOAD_GAME migration in `GameContext.tsx` normalizes existing saves.
- **K2 85+ internationals never signed by NBA teams** — flip-then-route-back cycle: contract expires → becomes FA → `routeUnsignedPlayers` ranks 31+ in highTier → `pickDestination(OVR 99 → Euroleague)` → fresh 2-year contract → repeat. Fix: one-line `externalSigningRouter.ts:152` — `if (k2Ovr >= 85) return p;`. Side-effect: K2 70–84 players have less competition for the 30 protection slots, mid-range overseas talent also stays signable.
- **Under-19 international progression + no draft declaration** — `progressPlayer:259` already froze sub-19 generic progression; added external-league short-circuit in `applyDailyProgression` for clarity. `seasonRollover.ts` men's-external branch now auto-declares players turning 19 as `tid: -2, status: 'Draft Prospect', draft.year: nextYear, contract: undefined, contractYears: []`. Ricky-Rubio-pattern: young foreign prospects no longer progress past K2 85 in Hokkaido forever.
- **Nationality → home-league bias** — `pickDestination` now applies 70/30 weighted override using existing `NATIONALITY_LEAGUE_BIAS` (constants.ts:474–489). Japanese K2 72 player: 70% B-League, 30% G-League (was 100% G-League). Deterministic via `seededRandom(seed+3)`. Preserves K2 ≥ 85 early-return and wash-out skip.

**Retirement**

- **Late-career vets stuck as FA instead of retiring** — Lowry (46, K2 57), Tucker (47), Lopez (44), Gibson (46), Green (45) cluster. Retirement didn't fire because `ACTIVE_STATUSES = {'Active','Free Agent','Prospect'}` missed the legacy `'FreeAgent'` typo. Fix: added `'FreeAgent'` alias + hard force-retire gate in `retirementChecker.ts` for `tid === -1 AND age >= 40 AND 0 GP in last 2 seasons` with proper retiree record + transaction log.
- **LOYAL badge ignored in FA** — Curry signed LAC $91M/4yr after GSW contract ended, played one fringe age-40 season, retired. `AIFreeAgentHandler.ts` got `getLoyalPriorTid` + `isLoyalBlocked` helpers (age 30+, LOYAL trait, 3+ YOS; prior team derived from `transactions[]` → `stats[]` fallback, no `prevTid` field exists). Gate applied to all 5 passes + `runAIMleUpgradeSwaps`. `faMarketTicker` skips markets for LOYAL players whose prior team isn't bidding; closes rival-only markets as unsigned. Oct 1 block in `simulationHandler` graceful-retires any LOYAL FA still unsigned with `"has retired rather than sign with another team — a career [Team Name]."`

**Contracts / bio display**

- **Rookie salary years missing from PlayerBioView** — Yovel Levy (2029 R1 P16), Sadiq White (2028 R1 P6) cases. Root cause was draft-time seeding, NOT team-option rebuild. Both `computeDraftPickFields` (`DraftSimulatorView`) and `autoRunDraft` (`autoResolvers.ts`, lazy-sim path) wrote `contract` but never `contractYears[]`. Nothing in `src/` ever writes BBGM's `player.salaries[]`. PlayerBioContractTab Path B looped `currentYear..exp`, dropping every rookie year before "now". Fix: both draft paths seed per-season `contractYears[]` with 5% escalator + `option: 'Team'` on option years. LOAD_GAME backfill in `GameContext.tsx` synthesizes `contractYears[]` for already-drafted rookies (`contract.rookie && !contractYears`) using `draft.year`, `contract.exp`, `contract.amount`, `contract.teamOptionExp`.
- **Kenny Woodard / Essengue pre-draft transactions** — undrafted prospect had transactions predating his own draft, simultaneous NG+two-way on draft day, Jan 10 guarantee against the wrong team. Root cause was NOT internalId collision, NOT Jan 10 attribution — it was **name-substring filtering** in `PlayerBioTransactionsTab.tsx:51-64`. `HistoryEntry` stored `{text, date, type}` with no player reference; filter matched `player.name.toLowerCase()` substring. When two Kenny Woodards existed (generated draft class + imported), both bios showed both players' transactions interleaved. Fix: added `playerIds?: string[]` to `HistoryEntry` (`types.ts:526`); filter prefers `playerIds.includes(internalId)`, falls back to text match only for legacy entries. Populated `playerIds` at every emission site: Jan 10 guarantee, trim waivers, AI FA signings, 2W promotions, external routing, MLE swap sign/waive, player options, rookie extensions, retirements, farewells, HOF inductions, draft picks, undrafted, FA market resolutions, trades. Forward-only — legacy entries on existing saves still text-match.
- **PlayerBioView cache merge overwrites game-state fields** — `setBioData({...prev, ...payload})` let bioCache clobber `n/m/stats/h/w/a/d/e` (identity, meta, stats, physical, experience). Fix: pin those fields from `baseData` after the merge. Cache still enriches `bio/imgHD/b/c/s` (narrative, portrait, formatted birthdate, country, school).

**Schedule**

- **Preseason international games missing season +1** — `autoResolvers.autoScheduleIntlPreseason` hardcoded `2025-10-02..15` and the "already scheduled" guard had no season scope, so prior-year entries blocked every subsequent rollover. Fix: dates now `${y1}-10-xx` where `y1 = leagueStats.year - 1`; guard scoped to `g.date >= ${y1}-10-01`.

**Waive / roster state**

- **Waive paths leave stale team-tied flags** — `handleWaivePlayer`, `autoTrimOversizedRosters`, MLE-swap waive all now strip `twoWay`, `nonGuaranteed`, `gLeagueAssigned`, `mleSignedVia`, `hasBirdRights`, `superMaxEligible`, `yearsWithTeam` on release. `contract.amount` + `contractYears[]` kept for salary-history rendering.

**Architecture notes (Session 25)**

- **Canonical status string is `'Free Agent'` with a space** (per `types.ts:699`). Any path writing `'FreeAgent'` (no space) creates invisible FAs. Grep before adding new waive/FA paths.
- **WNBA must not leak into the NBA FA pool.** The rollover expiry flip excludes `status === 'WNBA'` explicitly — women's-league players stay age-only, need a separate WNBA FA pipeline (still open TODO).
- **`routeUnsignedPlayers` (Oct 1) routes NBA FAs back to foreign leagues if they clear K2 55.** For elite talent this creates an infinite flip-back loop. The `k2Ovr >= 85` guard breaks it, but any future router changes need to preserve that early-return.
- **History entries need `playerIds` attribution.** PlayerBioTransactionsTab's text-substring filter is now a fallback only — every new emission site must populate `playerIds: [internalId]`. Pre-migration saves will keep the name-collision bug on old entries; accept forward-only resolution.
- **`pickDestination` is deterministic via `seededRandom(seed+offset)`.** Never introduce `Math.random()` there — it'd desync replays across saves.
- **Last Thursday of Finals-ending month is flexible.** `getDraftDate` derives month from `numGamesPlayoffSeries.length` (+1 month per extra round). Related Jun 30 assumptions still exist in `constants.ts:381`, `seasonRollover.ts:731` (`shouldFireRollover`), `DraftPickGenerator` comment — revisit when rollover date goes dynamic.

---

## Session 23 (Apr 17, 2026)

**Retirement** — `legendMult` (0.30 for 15+ All-Stars) now applied to ALL OVR tiers. Previously calculated but never used. LeBron/Curry survival rate dramatically improved.

**Two-way contracts** — 3 bugs: (1) `twoWay: true` flag never transferred from signing result to player object in simulationHandler, (2) `maxTwoWay` defaulted to 2 instead of 3, (3) `TWO_WAY_OVR_CAP` raised from 45 to 52 for more candidates.

**Rookie team options** — `teamOptionExp` was `season + baseYrs - 1` (off-by-1), causing options to fire the same summer as the draft. Fixed to `season + baseYrs` in both autoResolvers and DraftSimulatorView.

**Player option chronology** — Options now dated Jun 29 (before FA signings Jun 30+). `getSeasonYear` boundary moved to Jun 28+ so options appear in the new season's transaction view.

**Draft pick trading** — Completed draft picks (`draftComplete`) now filtered from TradeFinderView, TradeMachineModal, and AI findOffers. Past-season picks always excluded.

**Playoff game log** — `isPreseason` detection now computes opening night per-game's own season instead of using current season's opening night. Previous-season playoff games no longer mislabeled as PRE.

**G-League as overseas** — `simulationHandler.ts` now checks `r.league === 'G-League'` and uses "signs with" instead of "signs overseas with".

**Image caching** — New `imageCache.ts` service: IndexedDB-backed blob cache, auto-downloads all player portraits on game load (5-concurrent, 50ms delay). Toggle in Settings > Performance. Default ON. Clear cache button.

**Live Trade Debug UI** — Done via Team Office update (session 22).

## Session 22 (Apr 17, 2026)

70+ items fixed. Highlights:

**Root cause: Age system** — ALL progression + UI used stale `player.age`. Now uses `born.year`. `computeAge()` helper created.

**Retirement** — BBGM-scale thresholds, born.year fallback, debug logging.

**Options** — player/team options check `nextYear` (gist labels option on the season it applies to). `autoRunDraft` sets hasTeamOption/teamOptionExp/restrictedFA.

**Simulation** — unified engine (runLazySim), ADVANCE_DAY `>=`, Finals G7 fix (sim target day), overlay for all sim-to-date.

**Economy** — MLE 3-pass FA signing, MLE column in Cap Overview, broadcasting cap inflated at rollover, save isolation (unique saveId).

**Draft** — draft picks in TransactionsView, Draft History includes FAs, rookie contracts match Economy tab, Nick Smith Jr. dedup.

**UI** — year chevrons (Standings, League Leaders, Statistical Feats), playoff bracket (BracketLayout everywhere), Award Races offseason, Power Rankings preseason, game log PLF/PI labels, progression dark colors, career OVR snapshot, training camp shuffle, Shams transactions, social feed perf, Season Preview Oct 1.

**Rollover** — team W-L reset, streak reset, July games guard, player options Jul 1 date, bioCache age, vet age gate, two-way OVR cap, double team name, B-League bio gist URL, transaction amounts (sub-$1M), storyGenerator crash, COY case-insensitive, roster trim logging.

**Plus 146+ items from sessions 8–21.**

---

## Discovered Bugs & Fixes (Mar-Apr 2026)

| Date | Issue | Fix |
|------|-------|-----|
| Mar 2026 | Sportsbook player props crashed — `team.players` undefined | `NBATeam` has no `players` array. Players live in `state.players` (top-level). Props tab now filters `state.players` by `tid` matching today's game teams. `team.players` will always be undefined — never try to read it. |
| Mar 2026 | Props used wrong player ID field (`pid`) | `NBAPlayer` uses `internalId`, not `pid`. All bet leg IDs, slip dedup logic, and `playerId` fields in `placeBet` now use `player.internalId`. |
| Mar 2026 | `getBestStat` was a naive `.find(season)` — wrong for mid-season | Mirrored `AwardService.getBestStat` exactly: filter `s.season === season && !s.playoffs`, then reduce to the entry with the highest `gp`. This handles players who appear multiple times in the stats array (e.g. after a trade mid-season). |
| Mar 2026 | `getTrb` was `s.trb ?? (s.orb + s.drb)` — crashed when both undefined | Use the full fallback chain: `s.trb ?? s.reb ?? ((s.orb ?? 0) + (s.drb ?? 0))`. Matches AwardService. Apply this same pattern anywhere you're reading rebounds off a raw stat object. |
| Mar 2026 | Sportsbook redesign — tabs, player props, parlay builder | `SportsbookView.tsx` rebuilt. Three tabs: **Today's Lines** (moneyline + O/U per game), **Player Props** (pts/reb/ast O/U for top 4 active players per team playing today), **My Bets** (history with P&L bar + win rate). Bet slip supports **Single / Parlay toggle** — parlay mode accumulates legs and shows combined decimal odds. Conflicting legs (same game moneyline, same player same stat) are auto-replaced. |
| Mar 2026 | Sportsbook odds were loose vig (implied 47.6% each side) | O/U props now use `-110` equivalent: `1 / (0.52 + 0.005) = 1.909` over, `1 / (0.48 + 0.005) = 2.062` under. Moneyline juice applied as `+0.05` added to each team's implied probability before converting to decimal. Real books run ~4.5–5.5% vig — this is in range. |
| Mar 2026 | Injured players appeared in Player Props | Props now filter `state.players` by `p.injury?.gamesRemaining === 0` (or falsy). No point showing a line for someone DNP. |
| Mar 2026 | Mood system added (Phase 1 — drama-only) | `src/utils/mood/` barrel: `moodScore.ts` (computeMoodScore), `moodTraits.ts` (genMoodTraits), `dramaProbability.ts`, `moodTypes.ts`. 7 traits: DIVA/LOYAL/MERCENARY/COMPETITOR (4 core, BBGM-inspired F/L/$/W) + VOLATILE/AMBASSADOR/DRAMA_MAGNET. `NBAPlayer.moodTraits?: MoodTrait[]` in `types.ts`. Backfill runs lazily in `gameLogic.ts` after `processSimulationResults`. `generatePlayerDisciplineStory` now does mood-weighted player selection + mood-based severity routing. Pass `state.date` and `state.endorsedPlayers` from `actionProcessor.ts`. |
| Mar 2026 | In-game fights added (FightGenerator.ts) | `src/services/FightGenerator.ts` — base 0.4% per game, boosted by VOLATILE/DRAMA_MAGNET traits and real-player propensity map. Returns `FightResult` attached to `GameResult.fight`. Story seed injected into `actionProcessor.ts` story loop so LLM narrates brawls. Both `GameResult` types updated (`src/types.ts` + `src/services/simulation/types.ts`). |
| Mar 2026 | LLM hallucinated "Christmas games upcoming" in February | Added `buildSeasonCalendarContext()` to simulation prompt + gated Christmas context to only appear pre-Dec 25 |
| Mar 2026 | Steve Ballmer email said personal gifts used league funds | System prompt now explicitly separates `personalWealth` vs `leagueFunds`; personalWealth cap reduced from $50M to $8M/day |
| Mar 2026 | Lazy sim stacked all paychecks for collection on next real day | Added `generatePaychecks` call per batch in `lazySimRunner.ts` with `lastPayDate` tracking |
| Mar 2026 | "Week in Review" showed single-game stats (not weekly) | Added `newsType: 'daily' | 'weekly'` to `NewsItem`; NewsFeed now has Daily/Period Recaps tabs; batch_recap template reworded |
| Mar 2026 | Club debuff applied as rating reduction (broken pipeline) | Moved debuff to `nightProfile.ts` as multiplier penalties; removed `R()` reduction from helpers |
| Mar 2026 | `ChevronDown is not defined` in TradeMachineModal | Added `ChevronDown` to lucide-react import |
| Mar 2026 | Gift confirm button greyed out in PersonSelectorModal | Changed `actionType="give_money"` to `actionType="general"` in AssetActionModal |
| Mar 2026 | TransactionsView mixed commissioner diary entries with roster moves | Created EventsView (Commissioner's Diary) — League Events go there; Transactions stays clean for roster moves only. History entries now stored as structured `{text, date, type}` objects. |
| Mar 2026 | All-Star game score too low (115-129 instead of ~163-175 per team) | Added `exhibitionScoreMult: 1.48` to `KNOBS_ALL_STAR`. Engine now applies this to actual game scores BEFORE stat generation. Set `paceMultiplier: 1.0` to avoid double-counting. |
| Mar 2026 | All-Star rotation broken — stars got 36+ min, bench players got 2-3 min | Changed `flatMinutes: false` → `flatMinutes: true, flatMinutesTarget: 20` in `KNOBS_ALL_STAR`. Rating-weighted distribution now gives stars ~26-30 min and role players ~12-16 min. |
| Mar 2026 | BoxScoreModal showed broken image for All-Star East/West logos | Added `renderTeamLogo()` helper in `BoxScoreModal.tsx` — when `team.id < 0`, renders a styled E/W conference badge instead of the broken Wikipedia img. |
| Mar 2026 | Season revenue chart was flat then spiked (static linear accrual) | Replaced `(days/365)*annualRev` with phase-weighted formula in `Dashboard.tsx`. Finals days earn ~3–6x more daily revenue than Preseason. Uses `VIEWERSHIP_MEANS` weights from `ViewershipService.ts`. |
| Mar 2026 | "Revenue" label misleading — no sponsor system yet | Renamed to "Total Expected Rev" / "Expected Annual Revenue" across `Dashboard.tsx`, `StatsCards.tsx`, `BroadcastingView.tsx`, `RevenueChart.tsx`. Placeholder for future sponsor integration. |
| Mar 2026 | Season actions (celebrity, christmas, global games) cluttering Actions tab | Moved all seasonal actions to new `SeasonalView.tsx` with deadline banners + chronological sort. `actionConfig.ts` season array is now empty `[]`. |
| Mar 2026 | Rig All-Star Voting, Dunk/3PT Contestants, Replacement — no UI existed | Added 4 new seasonal actions in `SeasonalView.tsx`. Rig voting is immediate + `ADVANCE_DAY`. Dunk/3PT use `SET_DUNK_CONTESTANTS` / `SET_THREE_POINT_CONTESTANTS` (immediate, no day advance). Replacement uses `ADVANCE_DAY`. |
| Mar 2026 | Sidebar was flat — Approvals/Viewership/Finances buried in Command Center | Restructured sidebar: Command Center (Schedule+Actions only), Seasonal, Events, Commish Store, Legacy (Approvals+Viewership+Finances) groups. |
| Mar 2026 | Social thread "Load More Replies" silently failed when LLM off | Modal now shows "Enable AI in settings to load more replies" when `enableLLM: false`. Also fixed duplicate `key=""` React warning — replies with missing IDs get fallback keys (index+handle). `saveSocialThread` now patches missing IDs before saving. |
| Mar 2026 | Dunk/3PT contestant modals capped at top-30, no search, no portraits | Both modals now show all active NBA players with search filter (name/pos/team) and PlayerPortrait avatars. `.slice(0, 30)` removed. Cards no longer lock after announcement — show "Editing" banner + "Update Contestants" button. |
| Mar 2026 | Rig voting available before starters announced (wrong gate) | Changed lock condition: rig voting now requires `allStar.startersAnnounced === true`. Previously gated on voting window dates only. |
| Mar 2026 | Celebrity game crashed when LLM off + custom (non-rated) roster names | Added LLM-off fallback in `AllStarCelebrityGameSim`: fills unknown names with `hgt/attrs=20` and runs `simulateCelebrityWithGameSim` instead of attempting LLM call. |
| Mar 2026 | Win streaks only reported at 5/8/12 games; no "streak snapped" news | Thresholds changed to `[5, 7, 10, 14]`. Added `long_win_streak` category (8+, more dramatic language). Added `streak_snapped` category: fires when a team had a 5+ W streak last batch and is now on L. `lazySimRunner` + `socialHandler` now pass `prevTeams` for comparison. |
| Mar 2026 | Timeline crash `undefined is not an object (evaluating 'r.type')` | `resolveEntry` in `LeagueEvent.tsx` was casting null/undefined history entries directly to `HistoryEntry`. Added null guard + `.filter((e): e is HistoryEntry => e != null)` in the events useMemo chain. |
| Mar 2026 | Trade machine showing hardcoded "22.3 PER / 19.1 PTS" for all players | Replaced with live `player.stats` lookup: finds current season stats, computes PPG/RPG/APG from `pts/gp`, `trb/gp`, `ast/gp`. Both PlayerRow usages pass `currentSeason={state.leagueStats.year}`. |
| Mar 2026 | All-NBA cards only showed PPG (missing REB/AST) | `AwardRacesView.tsx` AllNBASection cards now render a 3-column PPG+RPG+APG stat block. Uses `trb \|\| (orb+drb)` fallback for total rebounds. |
| Mar 2026 | BoxScore/game log showed "Coach's Decision" for historically injured players | DNP reason was read from current `player.injury` state, not from game time. Fixed with `playerDNPs?: Record<string, string>` on `GameResult` (both `src/types.ts` AND `src/services/simulation/types.ts`). `engine.ts` populates it at sim time; `BoxScoreModal` + `PlayerBioView` use it first, fall back to current state. |
| Mar 2026 | SIMULATE_TO_DATE crossing Apr 13–20 didn't generate/simulate play-in | `runSimulation` day loop in `simulationHandler.ts` didn't run bracket injection (that happened in `gameLogic.ts` after the loop returned). Fixed by extracting `applyPlayoffLogic()` and calling it BEFORE each day (inject games) and AFTER (advance bracket). `gameLogic.ts` now prefers `stateWithSim.playoffs` over `state.playoffs` to prevent double-generation. |
| Apr 2026 | Team minutes total drifting below 240 after foul redistribution | `coordinated.ts` hard cap (clip to 48 min) ran after the foul-stolen-minutes correction block but could still leave the total short. Added a final enforcer pass AFTER the hard cap: sum all minutes, distribute the remainder to the highest-minute player not at the per-game cap. Guarantees exact total = 240 + (otCount x 25). |
| Apr 2026 | Players exceeding 48 min in non-OT games (KD 51:53, Sengun/Amen 48+ on same team) | `initial.ts` wrote raw float `playerMinutes[i]` (e.g. 51.88) directly to the stat object's `min` field BEFORE `coordinated.ts` could clip it — frontend reads `min` from that unclipped object. Two-layer fix: (1) `GamePlan.ts` raw minutes draw capped at `1.50` (was unbounded Box-Muller tail); (2) iterative per-player enforcer added in `initial.ts` after re-normalization — clips each player to `48 + otCount x 5`, re-normalizes to maintain 240 total, repeats up to 4 passes. `playerMinutes[i]` can never exceed the per-game ceiling before being written to `min`. |
| Apr 2026 | League-wide 3P% 4pp below target for all player tiers | `threePmBase` default was `0.27` — produced ~33% for elite shooters and ~22-25% for low-tp players. Bumped to `0.31` (+4pp flat). |
| Apr 2026 | tp 30-60 players still shooting 3-8pp below expected after threePmBase bump | Three compounding mechanisms: (1) `volDecay` per-attempt penalty `0.025` too steep — KAT (tp=51, 11 3PA, naturalVol=6) lost 12.5% efficiency from volume alone; (2) `naturalVol` thresholds too low for the tp 55-70 bracket (got vol=6 but naturally shoots 9-11 3PA); (3) `tpFloorPenalty` coefficient `0.0045` too aggressive (tp=35 lost 6.75pp). Fixes: naturalVol `tp>85->11, tp>70->9, tp>60->8, tp>50->6, else 4`; volDecay coefficient `0.025->0.018`; tpFloorPenalty coefficient `0.0045->0.003`. |
| Apr 2026 | League assists 4+ too high; leader averaging 14-17 ast (should be ~10-12) | `assistRatio` was `0.77` — real NBA teams assist on ~62% of FGM not 77%. Soft cap at 14 was too lenient. Fixed: `assistRatio` `0.77->0.62`, floor `0.55->0.42`; soft cap threshold `14->11` with `0.55->0.45` survival factor. |
| Apr 2026 | `fgaMult` knob added to NightProfile — FGA attempt volume independent of pts/efficiency | Night tiers had no way to express "jacking shots into a slump" vs "efficient scoring" independently of `ptsTargetMult`. Added `fgaMult: number` to `NightProfile` interface and all 20+ return paths. Tier values: BRICKFEST x1.60, DESPERATE CHUCKER x1.45, OFF-NIGHT x1.40, COREY BREWER x1.40, SIMMONS EFFECT x0.72, HUSTLE GOD x0.75, TORCH x0.88, HOT x0.90. Normal night path computes `fgaMult` inversely from `ptsTargetMult` so bad pts nights produce more attempts. Wired in `initial.ts`: `estimatedFga = (ptsTarget / 1.1) * nightProfile.fgaMult`. |
| Apr 2026 | League rebounds inflated ~4/game after fgaMult added (Jokic averaging 15 REB) | Bad-night tiers (BRICKFEST x1.60, etc.) increased team misses ~25% -> DRB and ORB pools grew proportionally. Fixed by scaling DRB multiplier `0.69->0.56` in `engine.ts` (both home and away miss pools) and ORB multiplier `0.25->0.20` in `coordinated.ts`. |
| Apr 2026 | First-option scoring too high (Edwards 35+ PPG); star players not soft-capped effectively | `initial.ts` soft cap was triggering at `rawTarget > 30` with only 50% survival — stars above 24 PPG range were not being throttled. Tightened: threshold `30->24`, surplus shaved at 60% to `teamBonusBucket` (redistributed to supporting cast) with 40% survival. Puts realistic ceiling around 28-30 PPG for the biggest games. |
| Apr 2026 | Team FGA not correlating with team score (111 FGA on 154 pts, 55-111 shooting) | High-efficiency teams would have correct `efficiencyMultiplier` from `getEfficiencyMultFromScore` but `fgaMult` was applied without an efficiency offset. Fixed: `estimatedFga = (ptsTarget / 1.1) * (nightProfile.fgaMult / effScore)` where `effScore = clamp(efficiencyMultiplier, 0.88, 1.12)`. High-scoring nights now naturally produce fewer attempts at higher efficiency, not more attempts at the same rate. |
| Apr 2026 | Mid-game injuries not surfaced (Randle's random 12-min game had no injury explanation) | Any player can now roll for a mid-game injury. Probability is weighted by minutes played: `<15 min -> 20%, <25 min -> 7%, <35 min -> 2%, 35+ min -> 0.6%`. Rolling uses `getRandomInjury()` from `injuryService.ts` with a duration multiplier based on minutes (low-minute players get shorter injuries). Result stored in `playerInGameInjuries: Record<string, string>` on `GameResult` — this plugs into the existing injury pipeline (post-processor applies it to player state, `lazySimRunner` generates Shams news). BoxScoreModal now shows `Left early (InjuryName)` in orange on the player's played row. |
| Apr 2026 | `null is not an object (evaluating 't.id')` crash watching preseason intl games | `getTeamForGame(tid, state.teams)` returns null for tid >= 100 (non-NBA / international teams). Added `resolveTeam(tid)` helper in `ScheduleView.tsx` that checks `state.nonNBATeams` first, builds a fake `NBATeam` shape from the nonNBA record (id, name, abbrev, imgURL), then falls back to `getTeamForGame`. All `WatchGamePreviewModal` and `GameSimulatorScreen` team props now call `resolveTeam()` instead of `getTeamForGame()`. |
| Apr 2026 | Intrasquad scrimmage `WatchGamePreviewModal` showed same team on both sides | Intrasquad games have `homeTid === awayTid` by design. Preview can't show two different teams in this case. Fix: `handleWatchGame` in `ScheduleView.tsx` now detects `homeTid === awayTid` and skips the preview entirely — dispatches `ADVANCE_DAY` directly to simulate. |
| Apr 2026 | `ProfileView` showed no banners/headers; own avatar/banner missing after EditProfile | Two separate bugs: (1) For non-own profiles, `fetchProfileData` was never called if the handle wasn't in `state.cachedProfiles`. Added `useEffect` with `isFetching` state to trigger a fetch on mount for uncached handles. Skeleton `animate-pulse` shown on banner, avatar, name block, and follower counts during fetch. (2) Own profile reads `state.userProfile` (set by `EditProfile`) but `ProfileView` was reading `cached?.avatarUrl` which only reflects the social API cache, not the locally saved profile. Fix: `ownAvatarUrl = isOwnProfile ? (state.userProfile?.avatarUrl \|\| cached?.avatarUrl) : cached?.avatarUrl`. Same pattern for `bannerUrl`, `name`, `bio`. |
| Apr 2026 | "Leave Game" button in watch game triggered re-simulation -> game duplication | Watch game flow restructured: when user confirms "Watch Live" in the preview modal, `GameSimulator.simulateGame` runs immediately and `RECORD_WATCHED_GAME` + `ADVANCE_DAY` are dispatched BEFORE the watch screen opens. The watch screen is now pure visual playback of the precomputed result. "Leave Game" (and the X button) call `onClose()` only — no re-simulation possible. The "other events today" confirmation dialog is also gone (irrelevant since ADVANCE_DAY already ran). `precomputedResult` prop carries the result into `useLiveGame` which skips its own simulation when a result is provided. |
| Apr 2026 | Under-19 players appearing in Free Agent market (unrealistic) | Added age filter to `FreeAgentsView.tsx`: computes player age from `p.born?.year` vs current year from `state.date`, falls back to `p.age ?? 99`. Players under 19 filtered out of the FA list. They remain visible in Universal Player Search and on their team roster. |
| Apr 2026 | Playoff series showing "2-0 after Game 1" (double-counting) | `gameLogic.ts` called `PlayoffAdvancer.advance()` with `allSimResults` AFTER `runSimulation` had already advanced the bracket per-day in `simulationHandler.ts`. Each game's wins were counted twice. Fix: guard step 3 in `gameLogic.ts` with `const simHandledPlayoffs = stateWithSim.playoffs != null && stateWithSim.playoffs !== state.playoffs` — only re-advance if `simulationHandler` didn't already handle it. |
| Apr 2026 | Play-in/playoff games using exhibition-style rotations (12-deep, 26 MPG stars) | After 82 regular-season games, `buildStandingsContext()` sets `gamesRemaining = 0` for every team. `standingsProfile()` treats `gbFromLeader > gamesRemaining` (any GB > 0) as "eliminated" -> 12-player rotation, 26 MPG stars — same profile as garbage-time. Fix: in `engine.ts`, playoff/play-in games override `gbFromLeader: 0, gamesRemaining: 7` before building knobs, preventing the elimination branch. |
| Apr 2026 | Playoff bracket showing wrong seeds in rounds 2+ (HOU shown as #2 seed instead of #5) | `PlayoffGenerator.buildNextRound()` hardcoded `higherSeed: 1, lowerSeed: 2` for all semi/finals matchups. Fix: added `getWinnerSeed()` helper that looks up the winner's original seed in `prevSeries`, then assigns the lower-numbered seed as `higherSeedTid` and correct `higherSeed`/`lowerSeed` values. |
| Apr 2026 | Feb 12 games missed by simulation (day before All-Star break) | `getAllStarSunday()` used `new Date(year, 1, 1)` + `setDate()` (local time), causing `breakStart.toISOString()` to shift one day earlier in UTC+8 timezones — Feb 12 instead of Feb 13 — making the All-Star break filter skip Feb 12 games. Fix: (1) Rewrite `getAllStarSunday` with `Date.UTC` + `setUTCDate/getUTCDate`. (2) Extended `breakStart` from Friday (Feb 13) to Thursday (Feb 12) so the scheduler also redistributes games away from that slot, preventing future misses. |
| Apr 2026 | All-Star injury replacements not triggered in lazy sim | `autoSimAllStarWeekend` (called on `2026-02-13`) didn't check for injured roster members before simulating. Fix: loop through `allStar.roster` pre-simulation, mark injured players `isInjuredDNP: true`, then find and add conference-matched healthy replacement (sorted by OVR) as `isInjuryReplacement: true`. |
| Apr 2026 | All-Star Game not indicated in PlayerBio game log | Game log rows showed rank/PRE label but no All-Star indicator. Fix: detect `schedGame.isAllStar` during log entry construction, set `isAllStar` flag + override `teamAbbrev: 'ASG'`. Row renders star in the rank column when `log.isAllStar` is true. |
| Apr 2026 | Series score in playoff detail panel displayed horizontally ("1 -- 4") | Redesigned `SeriesDetailPanel.tsx` header: replaced side-by-side team columns with two stacked rows (logo + abbrev on left, win count on right per row), separated by a divider. Winner's count highlighted in emerald. Also removed the "View Box Score" button from `SeriesActionMenu.tsx`. |
| Apr 2026 | `LeagueHistoryDetailView` — award winner photos missing, All-NBA shows no avatars, wrong schema detection | Same dual-schema bug as LeagueHistoryView. `getDetailAwardObj` used broken pid lookup; `hasAllLeague` only checked BBGM nested `allLeague` not flat autoResolver entries; `resolveTeamArray` had no imgURL fallback; `semifinalsMvps` used broken pid check. Fixed: `findPlayer()` with string-pid-first logic; `hasAllLeague` also checks for `All-NBA*`/`All-Defensive*`/`All-Rookie*` flat types; `buildFlatTeams(prefix, names[])` helper assembles autoResolver flat entries into AllTeamSection shape; bref fallback now also looks up player photos via name matching in `state.players`; all missing imgURLs fall back to `ui-avatars`. |
| Apr 2026 | `brefFetcher.ts` — manual async loops in each consumer, no shared cache access | Added `useBRefSeason(year)` and `useBRefSeasonsBatch(years[])` hooks directly in `brefFetcher.ts`. Both hooks read from the module-level `_cache` Map first (instant, no re-fetch). `LeagueHistoryDetailView` replaced its `useEffect+setState` pattern with `useBRefSeason`. `LeagueHistoryView` replaced its manual batch loop with `useBRefSeasonsBatch`. |
| Apr 2026 | `LeagueHistoryView` player photos showing initials (ui-avatars) instead of headshots | Root cause: `a.pid` (BBGM integer) never matched `p.internalId` (string "nba-Name-tid"), and the name fallback was only reached when `a.pid` was falsy. Fix: `findPlayer()` now checks string `pid` against `internalId` first (catches autoResolver entries), then falls back to exact name match, then case-insensitive name match. AutoResolver awards use `internalId` as pid -> direct match -> real imgURL. |
| Apr 2026 | `LeagueHistoryView` runner up always "--"; best record columns missing | `state.teams` objects were built without `seasons` data — `playoffRoundsWon` was always undefined. Fix: `rosterService.ts` now includes `seasons: t.seasons.map(...)` in `processedTeams`. Runner up is now found via `playoffRoundsWon === maxRounds - 1`. Added "Best (E)" and "Best (W)" columns using the same `seasons` data. |
| Apr 2026 | `LeagueHistoryView` not showing current-season awards even after announcement | Two schemas coexist in `state.historicalAwards`: BBGM format (`{ season, mvp: {...}, dpoy: {...} }` — no `type` field) and autoResolver/lazySimRunner format (`{ season, type: 'MVP', name, pid, tid }` — flat). LeagueHistoryView only handled BBGM format. Fix: split by presence of `type` field, resolve each award via `flat(type) ?? bbgmRecord?.[key]`. Champion/Runner Up also resolved from autoResolver `'Champion'`/`'Runner Up'` type entries first (most reliable), falling back to `playoffRoundsWon`. COY now also resolved (was hardcoded to null). |
| Apr 2026 | International team logos missing in NBA Central preseason schedule | `DailyGamesBar` and `GameBar` (via `TeamDetailView`) received only `state.teams` — nonNBATeams (tid >= 100) were never found, so cards returned null. Fix: `NBACentral.tsx` now passes a merged array `[...state.teams, ...nonNBATeams.map(t => ({ id: t.tid, logoUrl: t.imgURL, ... }))]` to both components. `DailyGamesBar` guard changed from `return null` (both missing) to rendering a text-initial fallback badge when `logoUrl` is empty. |
| Apr 2026 | International preseason game modal showed nonsensical starters (5 best by OVR, no positional logic) | `WatchGamePreviewModal` for `team.id >= 100` used `.sort().slice(0,5)`. Now picks 1C -> 2F -> 2G by `p.pos` (all sorted by OVR), with fallback fill from remaining roster if a position slot is empty. |
| Apr 2026 | `LeagueHistoryView` — `historicalAwards` always empty | `UPDATE_STATE` was in `ActionType` but had no handler in `GameContext.tsx` `dispatchAction`. It fell through to the `else` branch -> `processTurn()` which ignores it -> no state update. Fix: added explicit `UPDATE_STATE` guard before the `isProcessing` block: `setState(prev => ({ ...prev, ...payload })); return;`. Now the safety-net fetch in `LeagueHistoryView` correctly backfills `historicalAwards` for saved games. |
| Apr 2026 | `LeagueHistoryView` runner-up always "--" after lazy sim | `lazySimRunner.ts` derived `loserTid` from `finalsSeries.winnerId` which could be unset even after `bracketComplete`. Fix: derive loser directly from `champTid` — `finalsSeries.higherSeedTid === champTid ? lowerSeedTid : higherSeedTid`. No longer depends on `winnerId` or `status === 'complete'`. |
| Apr 2026 | Added **Player Bios** sidebar view (`PlayerBiosView.tsx`) | Filterable/sortable table of all players (NBA + intl + retired) with search, league/team/pos/college/country dropdowns, column filters (`>80`, `!USA`, etc.), OVR badge coloring, and HOF badge. Click any row -> `PlayerBioView`. "Players" sidebar tab renamed to "Player Search". `Tab` type updated. Draft prospects (`tid === -2`) are **excluded** — they are incoming NBA rookies (appear next to Free Agents in BBGM data) who haven't officially entered the league yet. Their BBGM data does include bio info — future work can build a dedicated prospect bio view for them. |
| Apr 2026 | Rookie jersey numbers missing in `PlayerBioView` | `rosterService.ts` extracted jersey number only from `p.stats[last].jerseyNumber`. Rookies with no season stats yet (empty `stats[]`) have `jerseyNumber` at the **top-level** BBGM player object (`p.jerseyNumber`). Fix: fallback to `String(p.jerseyNumber)` when stats-based lookup yields nothing. |
| Apr 2026 | `LeagueHistoryDetailView` players not clickable | Added `onClick` handlers to all player cards in detail view: Awards (MVP, DPOY, SMOY, MIP, ROY, Finals MVP chip), All-NBA/Defensive/Rookie cards, Stat Leaders, Semifinals MVPs, All-Stars. Clicking navigates to `PlayerBioView` via `setViewingPlayer`. Players not found in `state.players` (historical BBGM players) show a "Records not available" toast instead of crashing. `PlayerBioView` renders at Historical Data tab (default), not Awards tab. |
| Apr 2026 | `PlayerBioView` showed "FREE AGENT" for retired legends (Tim Duncan, Kobe, etc.) | `team` useMemo only checked `player.tid` — retired players have `tid: -1`. Fix: when no current team found, aggregate career regular-season GP by tid from `player.stats`, and return the team with the most GP. Tim Duncan correctly shows SAN ANTONIO SPURS with Spurs colors as the background. |
| Apr 2026 | `PlayerBioView` padding too tight; content felt claustrophobic | Bumped `Historical Data` and `Game Log` tab wrapper from `p-4` to `p-4 md:p-8`. Tab bar gets `px-4 md:px-8 mt-5` (was `px-2 mt-4`). Mobile spacing preserved — extra padding only kicks in at `md:` breakpoint. |
| Apr 2026 | Hall of Fame players had no badge in `PlayerBioView` | Added HoF badge (Naismith Basketball Hall of Fame logo) as a circular overlay on the player portrait — bottom-right corner, `w-10 md:w-14`. Only renders when `player.hof === true`. Passed via `isHoF` prop to `PlayerBioHero`. |
| Apr 2026 | `PlayerBiosView` team dropdown showed only nickname (e.g. "Heat"), not full team name | Non-NBA teams (Euroleague, PBA, B-League) have both `region` and `name` fields. The dropdown was only using `t.name`. Fix: render `{t.region ? \`${t.region} ${t.name}\` : t.name}` in the NonNBA option. |
| Apr 2026 | `PlayerBiosView` college/country dropdowns reset when switching leagues | `allColleges` and `allCountries` were derived from `filtered` (all active filters). Switching league cleared the college list -> selected college disappeared from dropdown. Fix: derive from `filteredBase` (all filters except college/country), so dropdowns stay populated while still reflecting league/team/pos constraints. |
| Apr 2026 | External roster players showed `--` for college, weight, and experience in `PlayerBiosView` | Gist data (PBA/Euroleague/B-League bio) was fetched in `PlayerBioView` but never in the list view. Fix: `useEffect` calls `ensureNonNBAFetched` for all external leagues on mount. `gistVersion` state increments after each fetch completes, triggering a useMemo re-run. `enriched` useMemo reads `getNonNBAGistData` per player and fills college (`gist.s`), weight (`gist.w`), experience (derived from `gist.d` draft year), and country. |
| Apr 2026 | `PlayerBiosView` OVR values different from `FreeAgentsView` and `UniversalPlayerSearcher` | `convertTo2KRating(ovr, hgt, tp)` was being called with `p.hgt` (bio inches ~78) instead of the BBGM attribute `lastRating.hgt` (0-100 scale). Result: height multiplier always applied at max, inflating OVR for tall players. Fix: use `lastRating?.hgt ?? 50` and `lastRating?.tp` as the second and third args. |
| Apr 2026 | Draft prospects in `PlayerBiosView` showing draft info as "2026 RundefinedPundefined" | `player.draft.round` and `player.draft.pick` are `undefined` for unassigned prospects. Fix: separate path — if `isProspect`, show `"Draft Eligible: YEAR"` or `"Draft Prospect"`; otherwise show `"YEAR R? P?"` with `?? '?'` guards. |
| Apr 2026 | Non-NBA class suffix `(So)` showing in "Last Attended" field | `nonNBACache.ts` `buildFlatEntry` set `s = item.pre_draft` raw. PBA/Euroleague data includes class year in parens, e.g. `"Texas Tech (So)"`. Fix: strip with `.replace(/\s*\([^)]*\)\s*$/, '').trim()`. |
| Apr 2026 | `PlayerBioView` portrait grey silhouette for retired BBGM legends (KG, etc.) | `PlayerBioHero.tsx` portrait `onError` compared `img.src !== playerImgURL` to decide whether to try the BBGM fallback. After browser URL normalization, equality can fail and the image is hidden before the BBGM URL is tried. Fix: use `img.dataset.triedFallback` flag instead of URL equality — first `onError` always tries `playerImgURL`, second `onError` hides. Also added `referrerPolicy="no-referrer"` to the portrait img (BBGM CDN requires it). |
| Apr 2026 | `PlayerBioView` hero stats showed `0.0/0.0/0.0` for retired players | `getBestStat(player.stats, curYear)` returns null when no stats exist for `curYear` (retired player's last season was before current sim year). Fix: when `ss` is null, aggregate career regular-season totals across all `player.stats` entries where `!s.playoffs && s.tid >= 0`, then divide by total GP. Career averages now show instead of zeros. |
| Apr 2026 | Clicking historical BBGM legends in `LeagueHistoryDetailView` showed "Records not available" | `handlePlayerClick` called `findPlayer(awardEntry)` which searched `state.players`. Retired legends (Manu Ginobili, etc.) from pre-sim BBGM history are not in `state.players`. Fix: when `findPlayer` returns null but `awardEntry.name` is known, build a minimal `NBAPlayer` stub (`tid: -1`, `stats: []`, `ratings: []`, `imgURL: undefined`) and open `PlayerBioView` with it. `PlayerBioView` then uses `extractNbaId("", player.name)` (now name-aware) which checks `NAME_TO_ID` — if the player is in the map, their NBA CDN portrait and full bio are fetched. |
| Apr 2026 | `LeagueHistoryView` runner-up missing for current sim season | After lazy sim completes, `historicalAwards` has the `Runner Up` flat entry but `LeagueHistoryView`'s `playoffRoundsWon` fallback is skipped because `t.seasons[season].playoffRoundsWon` stays `-1` (never updated by the sim). Fix: in `lazySimRunner.ts`, when the championship fires, mutate `stateWithSim.teams` to set `playoffRoundsWon: 4` on the champion and `playoffRoundsWon: 3` on the runner-up for the current season. Both the flat-award path AND the `playoffRoundsWon` fallback now work independently. |
| Apr 2026 | **Added `LeagueHistoryView` + `LeagueHistoryDetailView`** — wiki-backed season browser | Two new views under Analytics sidebar. `LeagueHistoryView` lists all sim seasons with champion, runner-up, best records (E/W), COY, MVP, DPOY, SMOY, MIP, ROY, Finals MVP — pulled from `state.historicalAwards` (both BBGM + flat schemas). `LeagueHistoryDetailView` drills into a single season: award cards with portraits, All-NBA/Defensive/Rookie teams, statistical leaders, All-Stars, semifinals MVPs. Wikipedia bref data supplements sim history (real NBA seasons before sim start). |
| Apr 2026 | `LeagueHistoryView`/`DetailView` historical teams unmatched (relocated franchises) | Manual `.includes()` matching failed for "Minneapolis Lakers", "Seattle SuperSonics", "Baltimore Bullets", etc. Fix: `FRANCHISE_MERGE` constant in `brefFetcher.ts` maps ~25 historical franchise names to their modern successor nickname. `matchTeamByWikiName()` checks the merge map first, then falls back to exact full-name and nickname-endsWith matching. `generateAbbrev()` utility auto-generates abbreviations for teams missing one (3+ words -> first letters, 2 words -> 2+1 chars). |
| Apr 2026 | `LeagueHistoryView` runner-up Nx badge missing | Finals appearances count (runner-up) wasn't tracked. Fix: `ruYearsByTeamId` map built from flat 'Runner Up' awards + Wikipedia `bref.runnerUp` data (franchise-merge aware). `countRunnerUp(teamId)` helper returns count. Displayed as `Nx Finals` badge alongside champion ring count. |
| Apr 2026 | **Added `TeamHistoryView`** — per-franchise deep-dive | New sidebar view under Analytics -> "Team History". Team grid with logo, color-coded accent, search. Per-team tabs: **Overview** (retired jersey numbers + all-time top players sorted by WS composite), **Records** (gist franchise records — regular/playoff toggle, top 5 per stat), **Leaders** (career totals + per-game averages from gist + live sim override), **Season History** (W-L table per season with playoff round, champion/runner-up highlight). `Tab` type updated, BookOpen icon added to NavigationMenu, case added to MainContent. |
| Apr 2026 | `TeamHistoryView` everyone showing Atlanta Hawks leaders | `filterToTeam` used `fr.includes(region.toLowerCase())` — when region was empty string, `fr.includes('')` is always `true`. Every gist row matched every team. Fix: use `fr.endsWith(' ' + nameLower)` with a length guard (`nameLower.length >= 4`) and exact full-name match. Exact TM abbreviation match is the primary path. |
| Apr 2026 | `TeamHistoryView` season history empty (0-0 all seasons) + retired jerseys missing | `rosterService.ts` mapped teams to `NBATeam` objects without including `seasons[]` or `retiredJerseyNumbers[]`. Both were stripped. Fix: added `seasons: t.seasons.map(s => ({ season, won, lost, playoffRoundsWon, imgURLSmall }))` and `retiredJerseyNumbers: t.retiredJerseyNumbers ?? []` to `processedTeams` mapping. Affects new game loads only — existing saves won't have this data in state. |
| Apr 2026 | `TeamHistoryView` career leaders name duplication ("Dominique Wilkins D. Wilkins") | Gist data appends abbreviated form after full name. Fix: `cleanName()` in `franchiseService.ts` — strips `X. LastName` suffix when second-to-last word matches `^[A-Z]\.$`, and deduplicates "Reggie Miller Reggie Miller"-style strings. Applied to all name display in Leaders and Records tabs. |
| Apr 2026 | `TeamHistoryView` top players sorted by GP instead of meaningful metric | `totalWS` is 0 for most BBGM sim players (WS not stored by default). Fallback was `totalGP` — not a useful ranking. Fix: composite score: `WS * 100` when WS > 0, else `PTS + 0.5*REB + 0.5*AST + STL + BLK`. Display shows `X.X WS` when WS available, `X,XXX PTS` otherwise. |
| Apr 2026 | `TeamHistoryView` career leaders show only gist data — active sim players don't update | Curry's 3PM, Jokic's REB, etc. were frozen at their pre-sim gist values. Fix: `computeLiveTotals(state.players, teamId)` aggregates career stats per player from `player.stats[]` (non-playoff, same tid). `mergeCareerLeaders(gistRows, liveTotals)` and `mergeAverageLeaders(gistRows, liveTotals)` take max-per-player per category, then re-rank. Both are computed as useMemos in `TeamHistoryView` — live stats flow through automatically as the sim advances. |
| Apr 2026 | Non-NBA preseason schedule only generated 3 games (not 9) | `generateSchedule` in `gameScheduler.ts` required >=9 NBA teams per pairing before adding non-NBA games. With intl tid offsets, the `nbaTeams.length` check was blocking entries. Fix: removed the `nbaTeams.length >= 9` guard for intl preseason; each non-NBA team now gets its own games entry directly. |
| Apr 2026 | League Leaders required >=10 GP minimum — filter too aggressive early in preseason | `LeagueLeadersView` filtered `gp >= 10`. In preseason only 4-6 games had been played. Fix: lowered minimum to `gp >= 3` for preseason (detect via phase), and `gp >= 10` remains for regular season. |
| Apr 2026 | Assist leaders averaging 14-17 APG in sim (should be ~10-12) | `assistRatio` in `engine.ts` was `0.77` (77% of FGM assisted), real NBA is ~62%. Soft cap at 14 was too lenient. Fix: `assistRatio 0.77->0.62`, floor `0.55->0.42`, soft cap threshold `14->11`, survival factor `0.55->0.45`. |
| Apr 2026 | **Weekly OVR progression chart — garbled x-axis "0, 20 7,20 4,20"** | `ProgressionEngine` was storing dates as locale strings (`"Apr 20, 2026"`) from the game state. Chart code did `s.date.slice(5, 10)` on that format -> garbage. Fix: store dates as YYYY-MM-DD via `normalizeDate(date)` in `ProgressionEngine` before saving to `ovrTimeline`. Chart splits on `'-'` and builds `"Jan 5"` labels cleanly. |
| Apr 2026 | **Weekly OVR progression chart — flat for all players** | `convertTo2KRating()` rounds to integer; weekly progression deltas are ~0.07-0.14 BBGM points/week -> always rounds to same integer. Fix: store raw `overallRating` float in `ovrTimeline` (not rounded K2). Chart converts with `parseFloat((0.88 * s.ovr + 31).toFixed(2))` — sub-1pt weekly changes now visible as smooth curves. |
| Apr 2026 | **OVR badge discrepancy between list view (95) and modal (72)** | List used `convertTo2KRating(player.overallRating, hgt, tp)` directly. Modal used `k2Overall` = average of all K2 category OVRs — a very different number. Fix: modal and BioView OVR badge now both use `overall2k = convertTo2KRating(player.overallRating, lastRating.hgt, lastRating.tp)`. `k2Overall` is still used for category-level display only. |
| Apr 2026 | **POT (Potential) showing stored value (always 0 for NBA players)** | `currentRatings.pot` was being read directly — this field is 0 or unset for all NBA players. POT in BBGM is a derived metric, not stored. Fix: compute POT fresh everywhere via BBGM `potEstimator` formula: age < 29 -> `72.31428908571982 + (-2.33062761 * age) + (0.83308748 * rawOvr)`, clamped with `Math.max(rawOvr, formula)`. Age >= 29: POT = OVR (peaked). Then convert to 2K scale via `convertTo2KRating(potBbgm, hgt, tp)`. Implemented in `PlayerRatingsModal`, `PlayerBioView`, `PlayerBiosView`, `PlayerRatingsView`. |
| Apr 2026 | **`PlayerBiosView` OVR inflated for tall players** | `convertTo2KRating(ovr, p.hgt, p.tp)` was using `p.hgt` (bio inches ~78) instead of BBGM attribute `lastRating.hgt` (0-100 scale). Height bonus applied at max, inflating OVR for tall players. Fix: use `lastRating?.hgt ?? 50` and `lastRating?.tp` as args. |
| Apr 2026 | **Column filters added to PlayerStatsView, PlayerRatingsView, PlayerBiosView** | All three views now support per-column filter inputs. `evaluateFilter()` utility supports operators: `>=`, `<=`, `>`, `<`, `\|` (OR), `!` (NOT/exclude). PlayerRatingsView got a new Filter toggle button (SlidersHorizontal icon) + filter row in `<thead>` (as `<th>` cells — not between `</thead>` and `<tbody>` which is invalid HTML). |
| Apr 2026 | **AI FA signings ignored entirely (everyone signed for ~$2M flat)** | `runAIFreeAgencyRound` used `p.contract.amount * 1_000_000` (stale BBGM value, not a real market offer) for cap-space filtering, and `SigningResult` carried no salary/years. When applying signings, `simulationHandler` only set `tid` + `status`, leaving the player's old rookie/stale contract in place. Fix: (1) `computeContractOffer(player, leagueStats, moodTraits, moodScore)` added to `salaryUtils.ts` — uses formula `score = OVR*0.5 + POT*0.5; salary = MAX(min, maxContract*((score-68)/31)^1.6)` with service-tiered max/min tables that scale with cap inflation. (2) `SigningResult` now carries `salaryUSD`, `contractYears`, `contractExp`. (3) `getBestFit` uses `computeContractOffer` for affordability check. (4) `simulationHandler` applies `contract: { amount, exp }` when stamping the signed player. (5) `runAIMidSeasonExtensions` switched from `estimateMarketValueUSD` to `computeContractOffer`. Hardcoded `2026 - born.year` in the legacy helper also fixed to use `state.leagueStats.year`. |
| Apr 2026 | **Draft lottery results ignored by draft board (wrong teams assigned picks)** | `DraftSimulatorView` picked teams by standings order, not lottery order. `state.draftLotteryResult` held the correct reordered picks but was never read. Fix: `DraftSimulatorView` reads `draftLotteryResult` from state and uses it as the pick-order source; `lotterifiedPicks` maps lottery slots 1-14 to the winning team, then appends playoff teams in seed order for picks 15-30. |
| Apr 2026 | **`PlayerBioHero` defaulting to NBA CDN instead of BBGM imgURL** | The hero component's primary `src` was set to `cdnUrl` (NBA CDN) and `imgURL` was only tried on CDN error — reversing the intended priority. Fix: primary src = `player.imgURL` (BBGM), fallback = NBA CDN, final fallback = ui-avatars initials. |
| Apr 2026 | **Mid-season extension contract stored as $3,200 instead of $3.2M** | `simulationHandler.ts` applied `amount: ext.newAmount` directly but `newAmount` is in millions (e.g. 3.2). BBGM convention is thousands. Fix: `amount: Math.round(ext.newAmount * 1_000)`. Existing saves with old entries can't be retroactively fixed — they'll show garbage in TransactionsView but new sims are clean. |
| Apr 2026 | **All hardcoded 2025/2026 date literals removed for multi-season** | `START_DATE_STR` removed from `constants.ts`. New `src/utils/dateUtils.ts`: `resolveSeasonDate()`, `getSeasonSimStartDate()`, `getOpeningNightDate()` all derive from `leagueStats.year`. Fixed in: `initialState.ts`, `initialization.ts`, `CommissionerSetup.tsx`, `Dashboard.tsx`, `PlayerBioView.tsx`, `StatisticalFeatsView.tsx`, `lazySimNewsGenerator.ts` (added `seasonYear` param), `GlobalGamesModal.tsx` (added `seasonYear` prop). `BroadcastingView.tsx` deal summary string now uses dynamic season label. |
| Apr 2026 | **`seasonHistory[]` not written during normal day-by-day sim** | `lazySimRunner.ts` wrote `seasonHistory` at `bracketComplete`, but `gameLogic.ts` (regular `ADVANCE_DAY` sim) had no equivalent. Result: playing through the playoffs manually would never append to `seasonHistory` — LeagueHistoryView would miss the season. Fix: added the same `bracketComplete` guard + `SeasonHistoryEntry` construction to `gameLogic.ts` return block. Now fires in ALL sim paths. |
| Apr 2026 | **`TransactionsView` showed all seasons mixed together** | No way to see just this season's trades/signings vs last season. Added left/right chevron year picker at top-right of the view header. `getSeasonYear(dateStr)` converts transaction dates to NBA season year (Oct-Dec -> calYear+1, else -> calYear). Initialized to `leagueStats.year`. Navigates through all seasons that have transaction entries. |
| Apr 2026 | **Calendar events (All-Star, awards, schedule gen) missed when using day-view sim or SIMULATE_TO_DATE** | `processTurn` in `gameLogic.ts` called `runSimulation` directly — a batch that had no auto-resolve event loop. Unlike `runLazySim`, no All-Star votes, schedule generation, or award announcements fired. Two fixes: (1) Eager preflight — if no regular-season schedule exists and target is past Aug 14, fire broadcasting/global_games/intl_preseason/schedule_generation before the sim runs. (2) Post-sim event sweep — after `runSimulation` returns, fire all `buildAutoResolveEvents` entries whose date fell within the sim window. All resolvers are idempotent (guarded by state flags), so re-firing is safe. `buildAutoResolveEvents` exported from `lazySimRunner.ts`. |
| Apr 2026 | **Real contract data (China CBA / NBL Australia / etc.) — leagues renamed with spaces** | `ChinaCBA` -> `China CBA`, `NBLAustralia` -> `NBL Australia` everywhere in display strings. Code identifiers kept camelCase (`fetchChinaCBARoster`, `calculateChinaCBAOverall`). All object literal keys with spaces now quoted. |
| Apr 2026 | **Real per-season contract amounts from nbacontractsdata gist** | `applyContractOverrides` now stores ALL seasons as `contractYears[]` on each player. `PlayerBioContractTab` uses real per-year guaranteed amounts (path A) vs `annualRaise` escalator only for game-generated contracts (path B). `TeamFinancesViewDetailed` shows Player Option (dashed yellow) / Team Option (dashed blue) cell styling. |
| Apr 2026 | **Draft board missing external league players who were NBA-drafted** | `latestDraftClass` only looked at `player.draft.round/pick` from BBGM data. Players whose draft info comes from bio gists (e.g. Willy Hernangomez "2015 Round 2, Pick 5, Philadelphia Sixers") had no draft fields in their BBGM object. Fix: for external league players, fall back to `getNonNBAGistData` -> `parseBioDraftStr()` to extract year/round/pick/team. Draftee team resolved by fuzzy-matching team name against `state.teams`. Current team logo from `nonNBATeams` for overseas players. |
| Apr 2026 | **Market size percentile — all 30 teams showing "High"** | `TeamDetailView.tsx` computed `marketTier` percentile using `allTeams` which included non-NBA external teams (CBA/NBL/WNBA with `pop: 0`). This flattened the distribution making every NBA team's pop land in the top tier. Fix: filter to `conference === 'East' \|\| 'West'` before building the percentile array. |
| Apr 2026 | **TransactionsView stops showing entries after Jun 30 offseason** | `selectedYear` was initialized with `useState(state.leagueStats.year)` — React only runs the initializer once. After rollover bumped `leagueStats.year` to 2027, `selectedYear` stayed 2026, and all Jul+ entries (season=2027) were filtered out. Fix: `useEffect(() => setSelectedYear(state.leagueStats.year), [state.leagueStats.year])` in `TransactionsView`, `TeamTransactionsTab`, and `TeamStatsView`. |
| Apr 2026 | **G-League assignments appearing in Commissioner Diary for everyone** | `LeagueEvent.tsx` `TRANSACTION_TYPES` set didn't include `'g-league assignment'` / `'g-league callup'`. History entries bypassed the `commissioner: true` gate and fell through to the text-based catch-all regex — `'assigned'` didn't match `\bsigned?\b` so they appeared everywhere. Fix: add both keys to `TRANSACTION_TYPES`. |
| Apr 2026 | **FA pool drains entirely to external leagues** | `externalSigningRouter.ts` routed all K2 55+ unsigned players overseas on every offseason cycle, leaving zero good players for NBA FAs. Fix: protect top 30 K2 >= 70 players and top 30 K2 60-69 players as NBA FAs before routing the remainder. |
| Apr 2026 | **Two-way contracts not detected on first-season load** | BBGM data loads players with ~$625K salaries (two-way scale) but no `twoWay: true` flag. `autoTrimOversizedRosters` counted them as standard roster spots -> teams with 15+3 two-way players got their two-way slots incorrectly waived. Fix: `rosterService.ts` detects `contract.amount < 800` (< $800K) on load and sets `twoWay: true`. Same detection runs in `LOAD_GAME` migration in `GameContext.tsx`. |
| Apr 2026 | **Season 2 unplayable — schedule never generates after rollover** | `applySeasonRollover` returned no `schedule` key — old season's games stayed in state. `autoGenerateSchedule`'s guard `state.schedule.some(regularGame)` found those stale games and returned `{}` without generating the new season. Additionally, `lazySimRunner.ts` never called `applySeasonRollover` — simming past Jun 30 via lazy sim left `leagueStats.year` stuck at 2026 forever. Three-part fix: (1) `seasonRollover.ts` now returns `schedule: []` to clear old games. (2) `autoGenerateSchedule` guard is year-scoped — only counts games within `Oct(year-1)..Jun(year)` date range. (3) `lazySimRunner.ts` main loop now calls `applySeasonRollover` / `shouldFireRollover` when crossing Jun 30. |
| Apr 2026 | **"Left early" label in box score for healthy players** | `engine.ts` added players to `playerInGameInjuries` unconditionally when rolling an in-game injury. In edge cases `gamesRemaining` could be 0 (minor bruise, immediate recovery) — player showed "Left early" in the box score but appeared healthy in subsequent games. Fix: guard `playerInGameInjuries[id] = injuryName` with `if (gamesRemaining > 0)`. |
| Apr 2026 | **TradeProposals shows "AI GM" instead of real GM name** | `AITradeHandler.ts` hardcoded `proposingGMName: 'AI GM'`. Fix: `getGMName(state, teamId)` helper looks up `state.staff.gms` by team name / city / abbrev, falls back to `"${team.name} GM"`. |
| Apr 2026 | **Player option history missing from TransactionsView** | `seasonRollover.ts` opt-in branch added no history entry. Opt-out branch said "exercised his player option" (should be "declined"). Fix: added `playerOptionHistory[]` written to `state.history` for both decisions; corrected wording; added `playerOptionNewsItems[]` to the rollover news array. |
| Apr 2026 | **Commissioner signing (`SignFreeAgentModal`) missing `contractYears`** | `playerActions.ts` `handleSignFreeAgent` stamped `contract: { amount, exp }` but no `contractYears[]`, so `PlayerBioContractTab` showed the old pre-signing deal. Fix: build a 1-year minimum `contractYears[]` entry (`$1.3M`) alongside the minimum contract in both result.players branches. |

---

## Session Apr 8, 2026 — Playoff Engine + Award System + League History

### All items from the Apr 8 to-do list — status:

| # | Issue | Status | Fix |
|---|-------|--------|-----|
| 1 | Feb 12 games missed by simulation | Done | `AllStarWeekendOrchestrator.getAllStarSunday()` rewrote to use `Date.UTC` throughout. Also extended break start from Feb 13 -> Feb 12 so scheduler redistributes games away from that slot. |
| 2 | All-Star injury replacements in lazy sim | Done | `autoSimAllStarWeekend` pre-sim loop marks injured All-Stars `isInjuredDNP: true`, finds healthy same-conference replacements sorted by OVR. |
| 3 | Game log star icon for All-Star games | Done | `PlayerBioView.tsx` sets `isAllStar=true` + `teamAbbrev: 'ASG'` on log entries where `schedGame.isAllStar`. Renders star in rank column. |
| 4 | Play-In "? TBD" for one team in loser game | Done | `PlayoffAdvancer.resolvePlayInLoserGame()` now partially populates: team1 (loser of 7v8) set as soon as 7v8 resolves; team2 (winner of 9v10) set when 9v10 resolves. Previously required both games done. |
| 5 | Playoff cards not appearing in daily view | Done | Root cause: `simulationHandler.ts` already advances bracket per-day; `gameLogic.ts` also ran `PlayoffAdvancer.advance` -> double-counted every win. Added guard: only re-advance in `gameLogic.ts` when `stateWithSim.playoffs !== state.playoffs`. |
| 6 | Simulating play-in doesn't trigger next phase | Done | Same fix as above — double-count guard. |
| 7 | "2-0 after Game 1" double-count | Done | Same fix as above. |
| 8 | Exhibition rotations in play-in/playoff games | Done | `engine.ts` — after 82 reg-season games, `gamesRemaining=0` -> all teams appear "eliminated" -> 12-deep rotation, 26 MPG. Added `isPlayIn || isPlayoff` branch that overrides `gbFromLeader: 0, gamesRemaining: 7` before building knobs. |
| 9 | Incorrect seeding when advancing rounds 2+ | Done | `PlayoffGenerator.buildNextRound()` hardcoded `higherSeed: 1, lowerSeed: 2`. Added `getWinnerSeed()` helper that looks up original seed from `prevSeries`. |
| 10 | Series score vertically stacked + remove "View Box Score" | Done | `SeriesDetailPanel.tsx` replaced horizontal "1 -- 4" with two stacked team rows. `SeriesActionMenu.tsx` removed "View Box Score" button. |
| 11 | Award announcements in league news | Done | `autoAnnounceAwards` auto-resolver fires April 13. Calculates MVP/DPOY/ROY/SMOY/MIP/All-NBA winners, stores in `state.historicalAwards[]`, updates `player.awards[]`, generates `award_mvp` / `award_dpoy` / `award_roty` / `award_allnba` news items. |
| 12 | Regular-season templates deactivate in playoffs (news) | Done | `lazySimNewsGenerator.ts` accepts `playoffs?` param. Drama suppressed; standings fallback replaced with active series status during playoffs. |
| 13 | Staggered award announcement dates | Done | 7 separate auto-resolvers: COY Apr 19, SMOY Apr 22, MIP Apr 25, DPOY Apr 28, ROY May 2, All-NBA May 7, MVP May 21. Each is idempotent (checks `historicalAwards` before running). Award Races UI shows "Projected Winner" / "Winner" per tab independently. |
| 14 | League news: playoff advances, eliminations, Finals MVP, championship | Done | `lazySimRunner.ts` `generatePlayoffSeriesNews()` detects newly-completed series each batch -> fires `playoff_series_win`, `playoff_elimination`, `nba_champion`, `finals_mvp` news. Championship winner + Finals MVP stored in `historicalAwards`. |
| 15 | Playoff-aware social feed (series leads, WCF/ECF/Finals context) | Done | `SocialEngine.generatePlayoffPosts()` fires for every playoff game. Posts: official series score (NBA Official), series lead / tied reactions (NBA Central), top performer shoutouts (Legion Hoops / Hoop Central), series-clinching / elimination posts, "one away" dramatic moments. Regular-season social templates remain active alongside. |

### New features added this session:

| Feature | Files | Notes |
|---------|-------|-------|
| `historicalAwards` state field | `src/types.ts` | `HistoricalAward { season, type, name, pid?, tid? }`. Authoritative store for past award winners. |
| `LeagueHistoryView` | `src/components/central/view/LeagueHistoryView.tsx` | Per-season table: Champion, Runner Up, Finals MVP, MVP, **COY**, DPOY, SMOY, MIP, ROY. Current season always shown as top row with "NOW" badge and TBA cells. Clicking any season opens `LeagueHistoryDetailView`. Sources `historicalAwards[]` first, falls back to `player.awards[]`. Accessible via Analytics -> League History. |
| `LeagueHistoryDetailView` | `src/components/central/view/LeagueHistoryDetailView.tsx` | Per-season detail page. Sections: Champion hero (logo + Finals MVP), Season Awards grid (MVP/DPOY/COY/SMOY/MIP/ROY/Finals MVP with player portraits + PPG/RPG/APG stat line), All-NBA First Team gallery, All-Stars roster (East/West, current season only), Stat Leaders in 6 categories (PPG/RPG/APG/SPG/BPG/3PM, top 5, computed from `player.stats[]`). |
| Award Races "Winner" / "Projected Winner" label | `src/components/view/AwardRacesView.tsx` | Each tab independently checks `historicalAwards` for its own award. Shows "Projected Winner" (indigo) before announcement date, "Winner" (amber) after. |
| 65-Game Rule (real NBA) | `src/services/logic/AwardService.ts` | Hard minimum at season end, proportional mid-season. Injury exception: `minGames - 3` with active injury qualifies. Commissioner-configurable via `leagueStats.minGamesRequirement`. |
| 7 staggered award resolvers | `src/services/logic/autoResolvers.ts` + `lazySimRunner.ts` | COY Apr 19 -> SMOY Apr 22 -> MIP Apr 25 -> DPOY Apr 28 -> ROY May 2 -> All-NBA May 7 -> MVP May 21. Each is idempotent. |
| 7 new news template categories | `src/services/news/newsTemplates.ts` | `award_mvp`, `award_dpoy`, `award_roty`, `award_allnba`, `award_smoy`, `award_mip`, `award_coy` |
| Playoff social posts | `src/services/social/SocialEngine.ts` | `generatePlayoffPosts()` fires for every playoff game result. Official scoreline (NBA Official), series lead/tied reactions (NBA Central), performer callouts (Legion Hoops / Hoop Central), series-clinching posts, elimination posts, "one win away" dramatic moments. |
| NBA Official multi-player "FINAL SCORES" template | `src/services/social/templates/nbaOfficial.ts` | `nba_final_scores_multi` — fires once per game (home ctx only). "DAY'S FINAL SCORES" format: star headline + win streak (if 3+) + 3-4 performer stat lines. Career-high flag when `pts >= 30` and new career best. |
| NBA Official seeding clinch template | `src/services/social/templates/nbaOfficial.ts` | `nba_clinch_seeding` — fires when winning team has `clinchedPlayoffs` set. Describes what was clinched (#1 seed / top-2 / playoff spot / play-in spot). Priority 102. |
| `LeagueHistoryDetailView` | `src/components/central/view/LeagueHistoryDetailView.tsx` | Per-season detail: Champion hero (logo + Finals MVP), Awards grid (7 awards with player portraits + stat lines), All-NBA First Team gallery, All-Stars East/West (current season), Stat Leaders 6 categories (PPG/RPG/APG/SPG/BPG/3PM top 5 computed from `player.stats[]`). |

### Architecture notes (Apr 8):

- **`historicalAwards` vs `player.awards`** — `historicalAwards` is the new authoritative source for current-season winners (set by `autoAnnounceAwards`). `player.awards[]` contains normalized strings like "Most Valuable Player" for voter fatigue calculations. Both coexist; `LeagueHistoryView` checks `historicalAwards` first.
- **Finals MVP timing** — determined in `lazySimRunner.ts` when `bracket.bracketComplete` flips. Uses highest `gameScore` from the championship-winning batch (approximation, since we don't have series-long playoff stats isolated at that moment).
- **Award announcement dates** — 7 separate auto-resolvers fire on their real NBA dates (COY Apr 19 -> MVP May 21). Each checks `historicalAwards` for idempotency. `AwardRacesView.tsx` `AWARD_DATES` shows these same dates in the UI tab bar.
- **PlayoffAdvancer double-count guard** — Never re-advance the bracket in `gameLogic.ts` if `stateWithSim.playoffs !== state.playoffs`. The `simulationHandler.ts` already runs `applyPlayoffLogic` per-day.
- **standingsProfile "eliminated" trap** — Any team with `gbFromLeader > gamesRemaining` gets 12-man roster + 26 MPG. After 82 games, every non-#1 team hits this. Always override `isPlayIn || isPlayoff` before building knobs.
- **`autoAnnounceAllNBA` now stores all 9 award types** — All-NBA 1st/2nd/3rd (15 entries), All-Defensive 1st/2nd (10 entries), All-Rookie 1st/2nd (10 entries). All written into `historicalAwards` in a single resolver call so idempotency check (`'All-NBA First Team'` already stored) covers the whole batch.
- **`LeagueHistoryDetailView` stat rebound fix** — Season stats in `player.stats[]` may use `reb` (game-level field) OR `trb` (post-processor output) depending on whether the row came from the simulator or from a roster import. Always use `getStatValue(stat, 'REB')` from `statUtils.ts` which handles the `trb || reb || orb+drb` fallback chain.
- **`PlayerPortrait` OVR badge is current-season data** — For historical season detail views, never pass `overallRating` to `PlayerPortrait`. The badge would show the player's *current* OVR, not their rating during the displayed season. Use `MiniPortrait` (photo + team badge only) for any historical context.
- **COY award has no `pid`** — COY is stored as `{ type: 'COY', name: coachName, tid: teamId }` with no `pid`. Resolve it via `tid` -> team record; display team logo + W-L instead of a player portrait.

---

## Architecture Lessons (from BBGM reference, Apr 2026)

- **`idb.getCopy.playersPlus`** — BBGM's player enrichment pipeline (attrs + ratings + stats). Used as reference for multi-season stat/rating hydration. Our equivalent is reading `player.stats[]` directly since we don't have a DB layer.
- **`mergeByPk` + cache/league split** — BBGM separates hot data (IndexedDB cache) from cold data (IndexedDB league store) and merges them per-request. We use a single in-memory Redux-style `GameState`. Good to know for when we add IndexedDB persistence.
- **`getTeamInfoBySeason`** — BBGM has per-season team metadata (abbrev, colors) since teams can relocate. Our teams are static objects. For multi-season, we'll need `team.seasons[].abbrev` stored so historical views show the right city.
- **`fixRatingsStatsAbbrevs`** — Retroactively patches team abbrev on all stat/rating rows after a team relocation. Worth keeping in mind for our multi-season `ADVANCE_SEASON` rollover.
- **`playersPlus` career stats** — BBGM computes `careerStats`, `careerStatsCombined`, `careerStatsPlayoffs` on the fly by summing per-season rows. Our `computeCareerStats(player)` util (planned in `multiseason_todo.md`) should follow the same pattern: sum totals, then derive per-game averages.
- **`p.stats.filter(row => row.gp > 0)`** — BBGM always filters zero-GP rows before exposing stats. We should do the same in any stat-aggregation utility to avoid dividing by zero.
- **Per-season `AwardsAndChamp` layout** — Champion + Finals MVP hero -> Best Record (by conf) -> MVP -> DPOY/SMOY/MIP/ROY -> All-League/All-Defensive/All-Rookie. This is the canonical BBGM history layout; our `LeagueHistoryDetailView` mirrors it.
- **`groupAwards` for player profiles** — BBGM groups `player.awards[]` by type and counts them ("3x MVP (2022, 2024, 2026)"). Our `PlayerBioView` already does this in a simpler way; formalize when building player profile pages.
