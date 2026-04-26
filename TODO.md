# NBA Commish — TODO

**Session 27 (2026-04-25)** — Massive FA-pipeline realism pass: mid-season market cooldown, K2 ≥ 70 threshold, Bird Rights Pass 0 + bid-pool whitelist, RFA matching offer-sheets, Free Agency scouting tab, + 6 hotfixes (2W vets, clamping, dedup, date gates). [Full details in CHANGELOG.md](./CHANGELOG.md).

**Session 26 (2026-04-24)** — Prompt J (external-league ecosystem sustainer) + Prompt K (fetch resilience + storage quota). [Details in CHANGELOG.md](./CHANGELOG.md).

**Session 25 (2026-04-24)** — 11-bug economy sweep. [Details in CHANGELOG.md](./CHANGELOG.md).

---
### NBA CUP BUGS

- ✅ **Y2 schedule generation broken (only Cup games)** — after Y2 rollover, simulationHandler self-heal injected Cup groups into the empty schedule, then Aug-14 generator's `hasRegularSeasonGames` guard treated Cup games as RS and skipped generation. Fixed: self-heal now requires real RS games to exist; `hasRegularSeasonGames` checks now exclude `isNBACup` in `simulationHandler.ts:325`, `gameLogic.ts:318`, `autoResolvers.ts:20`.

- ✅ **KO games inflated advancers' RS records** — QF/SF games were appended on top of a full 82-game schedule, so advancers ended at 83-84 RS-counted games. Fixed via `trimAndPairReplacements` in `scheduleInjector.ts`: when QF/SF games are injected, each KO team has 1 future unplayed RS game trimmed; orphaned non-KO opponents are paired into replacement games on the KO night (or the trim's original date if conflicting). Final still uses `countsTowardRecord: false` and triggers no trim. Wired in `simulationHandler.ts` after each `buildKnockoutGames` call.

- ✅ **Schedule integrity — missing reg-season games + asymmetric W/L (Session 28 audit, 2026-04-26)** — `SCHEDAUDIT` cheat run on Y2 save dated `2027-02-24` revealed three issues; all fixed:
  - **`trimAndPairReplacements` per-team accounting rewrite** (`scheduleInjector.ts`). Old logic only marked KO teams as "trimmed once" and assumed every removal produced ≤1 orphan; in practice, multiple KO teams' latest unplayed RS could share the same opponent → that opponent lost N games but was paired only once (or zero times if `dateBusy` blocked all candidate dates). Replaced with per-team trim-count + owed-replacement bookkeeping: KO teams target net −1; everyone else targets net 0. Pairing now expands fallback dates to ±21 days around `replacementDate`. Also added Pass A that prefers KO-vs-KO trims (settles two KO teams in one removal, no orphans created). Logs `unmatched=N` when pairing still fails.
  - **All-Star events polluting reg-season filter.** Dunk contest (`gid=90003`, home=−7/away=−7) and 3-Point contest (`gid=90004`, −8/−8) used self-vs-self placeholder ids and lacked an `isAllStar`-style flag, so the audit script counted them as orphaned reg-season games. Audit script (`scripts/audit-schedule.js`) now filters via shared `isExhibitionLike` helper covering `isAllStar/isRisingStars/isCelebrityGame/isDunkContest/isThreePointContest/isExhibition` + any negative-tid sentinel team.
  - **`allStarBreakStart`/`allStarBreakEnd` now populated.** Both `injectAllStarGames` call sites (`gameLogic.ts:614`, `autoResolvers.ts:528`) now write the YYYY-MM-DD blackout window onto `state.leagueStats` via new `AllStarWeekendOrchestrator.getBreakWindowStrings(year)` helper. `LeagueStats` type extended with the two fields. The actual blackout filter in `simulationRunner.ts:14` was already using `getAllStarWeekendDates` directly (so the runtime filter was firing; only the audit field was unset).

---
### LOGIC

**✅ Session 28 (2026-04-26) — Volume-sticky FGA rebuild (v3)**

Original problem: hot nights compressed FGA below baseline; cold nights compressed FGA below baseline. Real NBA pattern is the opposite — efficiency swings, volume stays sticky.

Fixed in 2 files:
- `StatGenerator/initial.ts:263` — FGA now anchors to **baseline pts** (`ptsTarget / ptsTargetMult`), not nightly pts. Decouples volume from the night's scoring.
- `StatGenerator/initial.ts:428` — pct2 floor lowered `0.44 → 0.30`, so cold-night low pct2 actually drives 2PA upward (Brunson 4/20 brick now reachable).
- `StatGenerator/initial.ts:263` — added `fgaFloor = floor(minutes × 0.40 × max(0.65, fgaMult))` to kill the "Brunson 2/6 starter brickfest" pathology while preserving deferring archetypes.
- `StatGenerator/nightProfile.ts` — cold-tier `efficiencyMult` lowered to engage the new floor: BRICKFEST 0.65→0.55, COLD 0.82→0.75, OFF-NIGHT 0.72→0.65, DESPERATE CHUCKER 0.65→0.58, Microwave CHUCKER 0.72→0.65, DISASTER 0.55-0.70 → 0.45-0.60.
- `nightProfile.ts` — `fgaMult` redocumented as a true volume modifier (1.0 = baseline, >1 chucker, <1 deferring).

Verified against real game logs (Brunson, Reaves, bruiser bigs): cold high-volume bricks ✅, hot efficient torches ✅, EXPLOSION 47-pt nights ✅, rim-only bigs preserve efficiency via existing `isRimOnly` path ✅.

**⚠️ Known v3 gaps (not yet addressed):**

- **60+ pt outliers unreachable.** EXPLOSION ceiling caps at `1.15 + ovr/100 × 0.80` ≈ 1.91× for OVR 95. Sengun 63 / Herro 60 / Maxey 55 (high-volume hot games) won't reproduce. Would need a separate "VOLUME EXPLOSION" archetype gated on `ins`/`stre`/`tp>85` etc. — different from current efficiency-driven hot tiers.

- **Pure 3PT specialist nights (0 2PA).** Reaves Jan 19 POR `6/10 all 3s` and similar games — no archetype produces "100% 3PT shot diet." Current `shotDietShift` maxes at +0.20. Minor — these are <1% of games.

- **fgaFloor over-volumes ultra-quiet blowout games.** Reaves Nov 11 `1/2, 22 min, +17 blowout` — current floor (~9 FGA) prevents this. Could add blowout-aware floor reduction (`lead > 15 && winning → halve floor`) but requires plumbing `lead`/`isWinner` into the FGA floor block. Tradeoff vs the 2/6 brickfest fix.

- **Reduce floor coefficient 0.40 → 0.30?** Would allow 6-7 FGA bench cameos while still floor=10.5 at 35 min (still kills Brunson 2/6). Pragmatic middle ground. Pending user call.

---

**Original observation (kept for context — Session 28 prompt):**

On hot nights... they shoudl be more efficeint ! not jacking a lot of shots and still maintainnig efficeicny.. reverse is true when bad nights.. they dont take less shots. just normal shot diet in less efficeicny!!!!!.
50-PT GAMES

33
40-PT GAMES

378
30-PT GAMES

43
TRIPLE-DOUBLES

509
DOUBLE-DOUBLES

3
5×5
Nov 22, 2025	Alperen Sengun	HOU		LAL	L, 103-109 OT	*	45:48	23	42	.548	5	13	.385	18	29	.621	.607	12	15	.800	1	13	14	9	2	1	3	3	63	49.6	-2
Dec 18, 2025	Tyler Herro	CHA		CHI	W, 161-129	*	29:53	22	34	.647	10	17	.588	12	17	.706	.794	6	6	1.000	2	7	9	7	1	0	1	1	60	53.0	+22
Oct 30, 2025	Tyrese Maxey	PHI	@	ATL	L, 113-122	*	37:21	18	40	.450	5	17	.294	13	23	.565	.512	14	17	.824	1	7	8	10	2	2	1	1	55	44.8	+1
Dec 10, 2025	DeMar DeRozan	SAC	@	GSW	W, 122-120	*	33:52	19	28	.679	5	9	.556	14	19	.737	.768	10	14	.714	1	6	7	4	1	0	3	2	53	40.5	+6
Dec 20, 2025	Nikola Jokic	DEN		BOS	L, 100-121	*	35:22	20	40	.500	4	15	.267	16	25	.640	.550	8	9	.889	2	8	10	13	2	2	3	3	52	43.7	+16
Nov 29, 2025	Anthony Edwards	MIN		TOR	W, 111-95	*	39:17	18	34	.529	8	11	.727	10	23	.435	.647	7	7	1.000	2	6	8	4	2	1	4	1	51	36.7	+18
Dec 12, 2025	Victor Wembanyama	SAS	@	BOS	L, 109-111	*	37:59	16	30	.533	7	16	.438	9	14	.643	.650	12	14	.857	3	17	20	7	2	4	3	3	51	48.3	0
Nov 16, 2025	Victor Wembanyama	SAS	@	MIA	W, 116-108	*	39:04	19	37	.514	3	15	.200	16	22	.727	.554	9	12	.750	3	15	18	11	4	7	3	4	50	46.3	+11
Nov 26, 2025	Nikola Jokic	DEN		ORL	L, 131-133	*	43:14	14	31	.452	7	18	.389	7	13	.538	.565	14	17	.824	3	16	19	14	2	3	5	4	49	45.9	+6
Nov 21, 2025	Karl-Anthony Towns	NYK	@	CHI	W, 97-94	*	39:30	13	22	.591	9	16	.563	4	6	.667	.795	13	13	1.000	3	10	13	5	1	2	3	3	48	43.2	+3
Nov 15, 2025	Tyrese Maxey	PHI		SAC	W, 140-130	*	40:21	12	17	.706	7	10	.700	5	7	.714	.912	15	15	1.000	1	6	7	10	1	1	2	1	46	46.3	

Rk	Team		Opp	Result	GS	+/-
38	Dec 31, 2025	CHA	@	IND	L, 118-125	*	42:17	14	34	.412	2	16	.125	12	18	.667	.441	8	8	1.000	2	9	11	10	3	1	3	3	38	29.0	+10
37	Dec 29, 2025	CHA	@	NYK	L, 92-121	*	29:27	7	15	.467	1	3	.333	6	12	.500	.500	4	5	.800	1	4	5	6	1	0	2	3	19	14.8	+20
36	Dec 28, 2025	CHA		WAS	L, 97-129	*	29:09	7	10	.700	6	8	.750	1	2	.500	1.000	7	7	1.000	1	4	5	7	0	0	3	2	27	23.8	+22
35	Dec 27, 2025	CHA		MIA	W, 121-114	*	44:51	8	18	.444	7	16	.438	1	2	.500	.639	5	6	.833	2	6	8	7	1	0	6	3	28	18.7	+10
34	Dec 24, 2025	CHA	@	UTA	L, 123-155	*	26:34	6	11	.545	4	7	.571	2	4	.500	.727	2	4	.500	1	4	5	5	1	0	2	2	18	15.5	+22
33	Dec 23, 2025	CHA	@	CHI	W, 151-143	*	29:26	10	22	.455	3	12	.250	7	10	.700	.523	4	4	1.000	1	2	3	5	0	0	3	2	27	16.6	+11
32	Dec 20, 2025	CHA	@	PHX	L, 113-120	*	30:01	4	10	.400	4	10	.400	0	0	.000	.600	1	1	1.000	2	2	4	3	1	0	2	1	13	10.3	+10
31	Dec 18, 2025	CHA		CHI	W, 161-129	*	29:53	22	34	.647	10	17	.588	12	17	.706	.794	6	6	1.000	2	7	9	7	1	0	1	1	60	53.0	+22
30	Dec 17, 2025	CHA		SAC	L, 108-141	*	29:08	7	12	.583	6	10	.600	1	2	.500	.833	4	4	1.000	1	3	4	3	0	0	3	1	24	18.7	+22
29	Dec 15, 2025	CHA		DEN	L, 102-142	*	26:09	8	17	.471	2	5	.400	6	12	.500	.529	5	7	.714	1	3	4	3	1	0	2	2	23	15.4	+26
28	Dec 14, 2025	CHA	@	TOR	L, 115-148	*	29:01	7	17	.412	4	11	.364	3	6	.500	.529	3	5	.600	1	2	3	4	0	0	2	2	21	12.4	+22
27	Dec 13, 2025	CHA	@	HOU	L, 99-134	*	31:32	7	14	.500	4	10	.400	3	4	.750	.643	9	9	1.000	1	6	7	3	1	0	2	3	27	22.4	+23
26	Dec 12, 2025	CHA		ORL	W, 135-115	*	28:16	11	23	.478	4	10	.400	7	13	.538	.565	4	5	.800	1	4	5	6	0	0	2	1	30	21.6	+2
25	Dec 11, 2025	CHA		MIL	W, 133-126	*	29:59	9	18	.500	5	9	.556	4	9	.444	.639	4	4	1.000	1	5	6	3	0	0	2	2	27	19.5	+1
24	Dec 10, 2025	CHA		LAC	W, 122-110 OT	*	31:29	11	20	.550	3	7	.429	8	13	.615	.625	1	2	.500	1	3	4	6	2	0	3	1	26	20.4	-15
23	Dec 7, 2025	CHA		LAL	L, 93-110	*	30:03	7	15	.467	4	9	.444	3	6	.500	.600	2	3	.667	1	2	3	3	0	0	2	2	20	12.5	-1
22	Dec 6, 2025	CHA	@	PHI	L, 119-127	*	30:14	8	14	.571	7	13	.538	1	1	1.000	.821	13	13	1.000	1	4	5	5	1	0	2	1	36	31.4	-3
21	Dec 5, 2025	CHA	@	NYK	W, 123-103	*	32:35	10	27	.370	5	16	.313	5	11	.455	.463	3	3	1.000	1	2	3	4	0	0	5	1	28	10.4	+22
20	Dec 4, 2025	CHA		MIA	L, 90-102	*	29:23	7	14	.500	3	8	.375	4	6	.667	.607	5	5	1.000	1	2	3	4	1	0	2	2	22	17.3	+15
19	Dec 3, 2025	CHA		GSW	L, 112-137	*	28:57	7	19	.368	2	9	.222	5	10	.500	.421	2	2	1.000	1	8	9	4	1	1	2	2	18	12.3	+18
18	Dec 2, 2025	CHA		PHI	L, 123-127	*	39:19	10	19	.526	7	12	.583	3	7	.429	.711	6	6	1.000	2	6	8	4	1	0	4	2	33	24.9	+8
17	Dec 1, 2025	CHA		CLE	L, 115-163	*	29:04	6	23	.261	3	16	.188	3	7	.429	.326	2	3	.667	1	3	4	2	0	0	3	2	17	2.1	+30
16	Nov 29, 2025	CHA	@	ATL	W, 156-120	*	27:51	10	30	.333	3	14	.214	7	16	.438	.383	3	3	1.000	1	2	3	6	1	0	3	1	26	12.1	+24
15	Nov 27, 2025	CHA	@	OKC	L, 97-112	*	29:52	8	21	.381	3	13	.231	5	8	.625	.452	7	7	1.000	1	3	4	5	0	0	3	2	26	15.8	+18
14	Nov 23, 2025	CHA	@	UTA	W, 102-101	*	31:03	10	15	.667	3	5	.600	7	10	.700	.767	4	5	.800	1	4	5	5	1	0	2	2	27	23.7	+6
13	Nov 22, 2025	CHA		NOP	L, 104-116	*	33:51	9	21	.429	4	11	.364	5	10	.500	.524	3	5	.600	1	5	6	3	1	0	4	1	25	14.0	+15
12	Nov 17, 2025	CHA		DAL	W, 121-111	*	28:32	9	16	.563	1	5	.200	8	11	.727	.594	3	4	.750	1	2	3	7	0	0	1	2	22	18.4	+13
11	Nov 16, 2025	CHA		PHX	W, 129-107	*	27:35	7	13	.538	6	11	.545	1	2	.500	.769	4	5	.800	1	2	3	5	0	0	3	1	24	18.7	+16
10	Nov 14, 2025	CHA	@	BOS	L, 92-107	*	29:58	6	15	.400	3	9	.333	3	6	.500	.500	2	2	1.000	1	3	4	4	1	0	2	1	17	11.9	+18
9	Nov 10, 2025	MIA	@	HOU	L, 106-126	*	27:11	3	6	.500	2	5	.400	1	1	1.000	.667	4	4	1.000	1	2	3	3	0	0	2	2	12	9.6	+22
8	Nov 8, 2025	MIA		OKC	L, 90-140	*	25:55	3	7	.429	1	3	.333	2	4	.500	.500	1	1	1.000	1	5	6	3	0	0	2	1	8	6.2	+32
7	Nov 7, 2025	MIA	@	TOR	L, 116-125	*	47:12	6	19	.316	2	10	.200	4	9	.444	.368	0	1	.000	1	4	5	4	0	0	3	3	14	3.2	+12
6	Nov 5, 2025	MIA		NOP	L, 103-124	*	30:03	7	11	.636	1	4	.250	6	7	.857	.682	2	2	1.000	1	4	5	5	0	0	1	2	17	15.7	+16
5	Nov 2, 2025	MIA		LAL	L, 91-112	*	31:06	3	11	.273	1	6	.167	2	5	.400	.318	1	1	1.000	1	5	6	2	0	0	3	3	8	0.9	+16
4	Nov 1, 2025	MIA	@	CHI	W, 133-125	*	38:07	8	10	.800	8	10	.800	0	0	.000	1.200	7	8	.875	1	4	5	8	1	0	2	4	31	31.7	+11
3	Oct 31, 2025	MIA	@	ATL	L, 118-128	*	37:25	8	16	.500	5	11	.455	3	5	.600	.656	4	4	1.000	1	4	5	6	0	0	2	2	25	20.3	+13
2	Oct 27, 2025	MIA	@	BKN	W, 121-84	*	27:58	6	15	.400	1	9	.111	5	6	.833	.433	4	4	1.000	1	3	4	4	0	0	2	2	17	10.5	+24
1	Oct 25, 2025	MIA	@	GSW	W, 114-113	*	30:48	8	24	.333	2	10	.200	6	14	.429	.375	2	3	.667	1	1	2	3	0	0	2	2	20	6.3	+6
## BUGS — Open

### Session 28 (2026-04-26) — Re-sign UX bugs

- ✅ **Roster-full blocks Bird Rights re-sign of own FA** — Pistons at 18/21 + 3/21 (training-camp cap = 21 total) couldn't re-sign Jalen Duren after his contract expired (tid=-1). Gate at `SigningModal.tsx:609` only bypassed for `isResign` (player.tid === team.id), missed `teamHoldsBirdRights`. Fixed by adding `&& !teamHoldsBirdRights` to the gate condition.

- ✅ **NG → Guaranteed conversion sims a day** — `convert_to_guaranteed` quick action opened SigningModal which dispatched `SIGN_FREE_AGENT` → `advanceDay()`. In-place flag flip should be instant. Same bug for `convert_to_twoway`. Fixed: both quick actions now dispatch `CONVERT_CONTRACT_TYPE` directly (existing handler in `playerActions.ts:490` is a no-day-tick state patch). Trade-off: user can no longer renegotiate years/salary as part of the conversion — if that flow is needed, add a separate "extend" action.

### Audit findings — critical UX/sim bugs (Session 28 audit, queued)

- **FIRE_PERSONNEL / SABOTAGE_PLAYER unconditional advanceDay** (`playerActions.ts:560, 608`) — both tick the sim even when LLM disabled / no narrative. Consider gating on `enableLLM`.
- **SIGN_FREE_AGENT no-op day burn for unknown statuses** (`playerActions.ts:19`) — if player isn't Active/FA/external, handler still calls `advanceDay()` without mutating state. Should short-circuit.
- **EXECUTIVE_TRADE always advanceDay** (`tradeActions.ts:49`) — Commissioner trades during dead periods (off-season editing) shouldn't tick the sim.
- **WAIVE_PLAYER clobbers superMaxEligible** (`playerActions.ts:397`) — re-signed waived player permanently loses supermax flag. Let salary utils recompute instead.
- **TradeSummaryModal Confirm has no debounce** (`TradeSummaryModal.tsx:256`) — double-click can fire two EXECUTIVE_TRADE dispatches.
- **CONVERT_CONTRACT_TYPE 2W downgrade doesn't refresh capHolds** (`playerActions.ts:523`) — payroll/cap-hold accounting goes stale after the flag flip.
- **HYPNOTIZE / HYPNOTIC_BROADCAST always advanceDay** (`eventActions.ts:190, 209`) — even with LLM off (no narrative).
- **TWO_WAY signing blocked by `roster.totalFull` in regular season** (`SigningModal.tsx:609`) — gate collapses standard + 2W buckets; should carve out 2W when only standard slots are full.
- **CAP_WARNING gate uses stale `isResign`** (`SigningModal.tsx:1702`) — doesn't re-check `teamHoldsBirdRights` at submit time, so a Bird Rights signing with a non-rostered player triggers cap warning.

---

- **Audit vs UI FA count mismatch** — `audit-economy-deep.js` strict filter (`p.status === 'Free Agent'`) misses the 833 `'FreeAgent'` legacy-typo players. Forward-healing fix in `simulationHandler.runSimulation` normalizes on next sim tick. LOAD_GAME migration normalizes on next load. Diagnostic snippet at `scripts/audit-fa-status.js`.

- **PBA players have inflated POT** — `getDisplayPotential` prefers `ratings[0].pot` (line 130 `playerRatings.ts`) over the formula, but PBA players imported from the gist carry raw BBGM-export `pot` values (70s–90s) that were never capped. Root cause: `fetchPBARoster` (`externalRosterService.ts:249`) calls `scaleRatings` which skips `pot` (it's in `ATTR_SKIP`), so the inflated gist value passes through unchanged. Fix: after `scaleRatings`, clamp `scaledRatings[0].pot` to `Math.min(50, ovrBbgm + 4)` (matches `spawnExternalPlayer` potCap logic for adult PBA: `ovrCap 46 + 4`). Same fix needed for China CBA if it has the same issue.

---

## Prompt L — Bidding-war refactor (QUEUED)

**Status:** Design doc complete with all 8 Open Questions answered. PR1 (K2 ≥ 70 threshold + cap cleanup) shipped in Session 27. Remaining PR2–PR4 + PR6 queued pending user final approval.

**Full design doc:** [`docs/bidding-war-refactor.md`](./docs/bidding-war-refactor.md) (§1-8: current state, proposed architecture, data structures, resolution formula, edge cases, UX, tradeoffs, migration plan + resolved Open Questions)

---

## KNOWLEDGE GAPS — Hardcoded Jun 30 assumptions

Revisit when rollover date becomes dynamic:

- **`constants.ts:381-383` PHASE table** — `[6, 21]` Lottery, `[6, 25]` Draft. Coarse phase-label bucketing only; breaks if playoff rounds push finals into July.
- **`seasonRollover.ts:731-735` `shouldFireRollover`** — hardcodes Jun 30. With extra playoff rounds, finals end July but rollover fires mid-finals.
- **`DraftPickGenerator.ts`** — "Rollover (Jun 30) resets `draftComplete`" comment carries same assumption.

---

## FEATURES — Backlog (low priority)

### Dual-affiliation academy prospects (Luka-Real-Madrid model)
Pre-assign `draft.year` at generation for youth academy players so they're simultaneously at their youth club AND in a future draft class. Real Luka Doncic at 16 was playing Real Madrid senior AND everyone knew he was declaring 2018 — sim could model that.

Implementation:
- At generateProspect for academy youth: `player.draft.year = currentYear + (19 - age)`
- No Jun 30 status flip needed (currently Prompt C auto-declares at 19)
- Rollover just checks `draft.year === currentYear` → move to draft pool that year
- DraftScouting can surface prospects 1-4 years out with their club attached: "Alejandro Garcia — Real Madrid Youth → declares 2032"
- Enables scouting mechanic expansion (commit scouting budget to follow a prospect's development years ahead)

Preserves Prompt C's `<19` progression freeze (no change there). Replaces the status-flip mechanism with a pre-committed draft year.

### Dead money / ghost contracts (Luol Deng rule)
Waived-player stretch across multiple years. Currently waive zeros team-side contract obligation entirely.

### Top-3 star trade override (topNAvgK2)
From session 16 plan — not yet active. Teams with top-3 average K2 ≥ X should have trade-willingness override relaxed.

### WNBA contract expiry + FA pipeline
WNBA contracts never expire (explicitly guarded in the external-unstick fix so they don't leak into NBA pool). Needs a separate WNBA-specific FA pipeline.

### DraftPicks.tsx — lottery-odds context
`src/components/central/view/TeamOffice/pages/DraftPicks.tsx` shows pick inventory (round + season) but no awareness of active lottery system. No pick-value estimate shown.

---

## SEPARATE DEVELOPMENTS

| Project | Account |
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

Session-by-session fixed lists live in [`NEW_FEATURES.md`](./NEW_FEATURES.md) and [`CHANGELOG.md`](./CHANGELOG.md). Read those before assuming an item is still open.
