# utils/mood — Player Mood System (TODO / Brainstorm)

> **Status:** Not yet implemented. This file is a design spec for when transactions / free agency arrive.
> Today the system drives **drama stories only** (discipline, agent agitation, trade demands).
> Later it will drive **contract willingness, FA targeting, and re-sign difficulty**.

---

## 1. Why a mood system?

BBGM's mood system gates free-agent negotiations — a player who hates your team simply won't sign.
Our sim currently has no player interiority: every player is equally likely to appear in a drama story,
regardless of situation. The mood system will fix that and unlock the "feel" of managing real NBA relationships.

**Phase 1 (drama-only, implement now-ish):**
- Mood score → probability weight for each drama story generator
- Mood score → which story *type* fires (trade demand vs. social media rant vs. skipping practice)
- Already powers `playerDisciplineGenerator.ts` implicitly via archetype/context — mood is the next layer

**Phase 2 (free agency, implement when transactions exist):**
- Gate FA negotiations (player won't sign with teams below mood threshold)
- Mood = contract ask multiplier (bad mood → demands more money)
- Trade value affected (disgruntled player fetches less in negotiations)

---
constants from bbgm ts

const MOOD_TRAITS: Record<MoodTrait, string> = {
	F: "Fame",
	L: "Loyalty",
	$: "Money",
	W: "Winning",
};playerMoodTraits: true,

export type MoodComponents = {
	marketSize: number;
	facilities: number;
	teamPerformance: number;
	hype: number;
	loyalty: number;
	trades: number;
	playingTime: number;
	rookieContract: number;
	difficulty: number;
	relatives: number;
	custom?: {
		text: string;
		amount: number;
	}[];
};

export type MoodTrait = "F" | "L" | "$" | "W";

## 2. Mood Score (−10 to +10 continuous)

| Range | Label | What it means |
|-------|-------|---------------|
| +8 to +10 | Content | Thriving — ambassador opportunities, no drama risk |
| +4 to +7 | Happy | Normal operations — low drama probability |
| 0 to +3 | Neutral | Default state |
| −3 to −1 | Restless | Minor noise — social media side-eyes, agent whispers |
| −6 to −4 | Unhappy | Active drama risk — burner accounts, skipped practice |
| −10 to −7 | Disgruntled | Trade demand territory — public blowups, meeting requests |

---

## 3. Mood Components (additive)

Each component returns a delta that sums to the overall score.
Inspired by BBGM's `moodComponents.ts` but simplified for commissioner perspective.

### 3a. Playing Time
```
const ptsDelta = clamp((actualMPG - expectedMPG) / 3, -3, +3)
```
- Expected MPG by archetype: superstar=34, star=28, rotation=22, fringe=12
- Injured player: expected MPG resets to 0 — no penalty during injury
- If returning from injury and immediate role cut → big negative spike

### 3b. Team Success
```
const winPct = team.wins / (team.wins + team.losses)
const winDelta = (winPct - 0.5) * 4   // −2 to +2
```
- Contender: +1 floor bonus
- Rebuilding team with vet > 30: additional −1 (frustration)

### 3c. Contract Satisfaction
```
const marketValue = estimateMarketValue(player)  // from rating + age
const contractValue = player.contract?.amount ?? 0
const ratio = contractValue / marketValue
const contractDelta = clamp((ratio - 1.0) * 4, -2, +2)
```
- Underpaid superstar: strong negative
- Rookie contract: neutral (expected); expiring underpaid: strong negative
- Overpaid role player: slight positive (they know it)

### 3d. Commissioner Relationship
```
let relDelta = 0
// +1 if commissioner visited team recently (TRAVEL action)
// +1 if commissioner endorsed player for HoF / award
// −1 if player was suspended/fined by commissioner
// −2 if player was subject of a covert SABOTAGE action (discovered)
```

### 3e. Role Stability (starter vs. bench)
```
const roleDelta = isStarter ? +0.5 : isStar && !isStarter ? -1.5 : 0
```

### 3f. Random Noise (per-day fluctuation)
```
const seed = player.internalId + state.date  // deterministic per player/day
const noiseDelta = seededRandom(seed) * 2 - 1  // −1 to +1
```
Use a seeded PRNG so the mood doesn't flicker on every re-render.

---

## 4. Mood Traits (modifier layer)

Each player gets 1–2 traits at generation time. Traits are persistent personality multipliers.

| Trait | Effect |
|-------|--------|
| `VOLATILE` | Negative components are 1.5× as impactful; mood swings faster |
| `LOYAL` | Base score floored at −2; slower decay; commissioner relationship +1 always |
| `DIVA` | Playing-time component is 2× as impactful; extra −1 if not top-3 in usage on team |
| `COMPETITOR` | Win-delta component is 2×; rebuilding team context adds extra −2 |
| `MERCENARY` | Contract component is 2×; no loyalty bonus; easier to lose to FA |
| `AMBASSADOR` | Commissioner relationship component +1; drama probability halved |
| `DRAMA_MAGNET` | Drama story probability doubled; severity always escalates one step |

**Generation:** assign 1 trait always, 50% chance of a 2nd. No contradictory pairs
(e.g. LOYAL + MERCENARY are mutually exclusive). Store in `player.moodTraits?: string[]`.

---

## 5. Drama Probability Formula

```typescript
function dramaProbability(mood: number, trait: string[]): number {
  // Base: inverted mood curve
  const base = 0.5 / (1 + Math.exp(0.6 * mood))  // 0.01 at +10, 0.49 at −10
  const volatile = traits.includes('VOLATILE') ? 1.5 : 1
  const drama = traits.includes('DRAMA_MAGNET') ? 2 : 1
  const ambassador = traits.includes('AMBASSADOR') ? 0.5 : 1
  return clamp(base * volatile * drama * ambassador, 0.01, 0.95)
}
```

Replace the current flat `rand < 0.80 → generatePlayerDisciplineStory` in `actionProcessor.ts`
with a weighted draw over all active players using this probability.

---

## 6. Story Type Routing by Mood

| Mood Range | Story Pool |
|------------|-----------|
| 0 to +3 | `generatePlayerAppealStory` (positive outreach to commish) |
| −3 to 0 | `generateAgentAgitationStory` |
| −6 to −4 | `generatePlayerDisciplineStory` (fine/warn tier) |
| −10 to −7 | `generatePlayerDisciplineStory` (suspend tier) + trade demand flag |

---

## 7. File Plan

```
src/utils/mood/
  moodScore.ts        — computeMoodScore(player, team, state) → number
  moodTraits.ts       — MOOD_TRAITS map + genMoodTraits()
  dramaProbability.ts — dramaProbability(mood, traits) → number
  moodTypes.ts        — MoodTrait type, MoodComponents interface
  index.ts            — barrel export
```

---

## 8. State / Types Changes Needed (Phase 1)

```typescript
// In NBAPlayer interface (types.ts)
moodTraits?: MoodTrait[];
```

No persistent `moodScore` field needed in Phase 1 — compute it fresh each time.
In Phase 2, cache it in `player.mood?: number` updated during `ADVANCE_DAY`.

---

## 9. Integration Points

| File | Change |
|------|--------|
| `src/store/logic/actionProcessor.ts` | Replace flat discipline roll with weighted player-mood draw |
| `src/store/logic/gameLogic.ts` | Generate mood traits for new players on roster load |
| `src/services/playerDisciplineGenerator.ts` | Accept `mood` as param → use to pick severity tier |
| `src/services/storyGenerators.ts` | `generateAgentAgitationStory` filter by restless mood |
| `src/components/view/PlayerBioView.tsx` (future) | Show mood indicator on player card |

---

## 10. What NOT to implement yet

- ❌ Contract ask multiplier (needs FA system)
- ❌ FA negotiation gating (needs FA system)
- ❌ Trade value penalty (needs trade evaluation system)
- ❌ Persistent per-day mood history chart
- ❌ Commissioner direct mood manipulation action (could be fun later — "Meet with player")

---

## Reference Files (BBGM)
- `moodInfo.ts` — full willingness + contract adjustment formula
- `moodInfos.ts` — dual-team comparison (user team vs current team)
- `genMoodTraits.ts` — trait generation pattern
- `updateOwnerMood.ts` — season-end owner satisfaction (separate from player mood)

import { idb } from "../../db/index.ts";
import { g, local } from "../../util/index.ts";
import type { OwnerMood } from "../../../common/types.ts";
import { bySport } from "../../../common/index.ts";

/**
 * Update teamSeason.ownerMood based on performance this season, only for user's team.
 *
 * This is based on three factors: regular season performance, playoff performance, and finances. Designed to be called after the playoffs end.
 *
 * @memberOf core.season
 * @return {Promise.Object} Resolves to an object containing the changes in teamSeason.ownerMood this season.
 */
const updateOwnerMood = async (): Promise<
	| {
			cappedDeltas: OwnerMood;
			deltas: OwnerMood;
	  }
	| undefined
> => {
	// If auto play seasons or multi team mode, no messages - keep in sync with genMessage
	if (
		local.autoPlayUntil ||
		g.get("spectator") ||
		g.get("userTids").length > 1
	) {
		return;
	}

	const t = await idb.getCopy.teamsPlus(
		{
			seasonAttrs: ["won", "playoffRoundsWon", "profit"],
			season: g.get("season"),
			tid: g.get("userTid"),
		},
		"noCopyCache",
	);

	if (!t) {
		return;
	}

	const teamSeason = await idb.cache.teamSeasons.indexGet(
		"teamSeasonsByTidSeason",
		[g.get("userTid"), g.get("season")],
	);

	if (!teamSeason) {
		return;
	}

	const salaryCapFactor =
		g.get("salaryCap") /
		bySport({
			// defaultGameAttributes.salaryCap, but frozen in time because otherwise various coefficients below would need to be updated when it changes
			baseball: 175000,
			basketball: 90000,
			football: 200000,
			hockey: 80000,
		});

	const expectedProfit = 15 * salaryCapFactor;

	const numPlayoffRounds = g.get("numGamesPlayoffSeries", "current").length;

	// Some sports are more random than others, so like a 60% winning percentage is more impressive then. I think it only matters a lot for baseball, so I picked that coeffiient by determining what factor is needed to make 110/162 wins as valuable as 70/82 wins, then adding a little more so like 95 win seasons are still pretty good.
	const winsFactor = bySport({
		baseball: 2.2,
		basketball: 1,
		football: 1,
		hockey: 1,
	});

	const deltas = {
		wins:
			(winsFactor * (0.25 * (t.seasonAttrs.won - g.get("numGames") / 2))) /
			(g.get("numGames") / 2),
		playoffs: 0,
		money: g.get("budget")
			? (t.seasonAttrs.profit - expectedProfit) / (100 * salaryCapFactor)
			: 0,
	};

	if (t.seasonAttrs.playoffRoundsWon < 0) {
		deltas.playoffs = -0.2;
	} else if (t.seasonAttrs.playoffRoundsWon < numPlayoffRounds) {
		deltas.playoffs =
			(0.16 / numPlayoffRounds) * t.seasonAttrs.playoffRoundsWon;
	} else {
		deltas.playoffs = 0.2;
	}

	if (!teamSeason.ownerMood) {
		teamSeason.ownerMood = (g as any).ownerMood
			? (g as any).ownerMood
			: {
					money: 0,
					playoffs: 0,
					wins: 0,
				};
	}

	// This is just for TypeScript
	const ownerMood = teamSeason.ownerMood;
	if (!ownerMood) {
		throw new Error("Should never happen");
	}

	// Bound only the top - can't win the game by doing only one thing, but you can lose it by neglecting one thing
	const cappedDeltas = { ...deltas };

	if (ownerMood.money + cappedDeltas.money > 1) {
		cappedDeltas.money = 1 - ownerMood.money;
	}

	if (ownerMood.playoffs + cappedDeltas.playoffs > 1) {
		cappedDeltas.playoffs = 1 - ownerMood.playoffs;
	}

	if (ownerMood.wins + cappedDeltas.wins > 1) {
		cappedDeltas.wins = 1 - ownerMood.wins;
	}

	// Only update owner mood if grace period is over
	if (g.get("season") >= g.get("gracePeriodEnd") && !g.get("godMode")) {
		// Bound only the top - can't win the game by doing only one thing, but you can lose it by neglecting one thing
		ownerMood.money += cappedDeltas.money;
		ownerMood.playoffs += cappedDeltas.playoffs;
		ownerMood.wins += cappedDeltas.wins;
		await idb.cache.teamSeasons.put(teamSeason);
	}

	return {
		cappedDeltas,
		deltas,
	};
};

export default updateOwnerMood;
import { MOOD_TRAITS } from "../../../common/index.ts";
import type { MoodTrait } from "../../../common/types.ts";
import { helpers, random } from "../../util/index.ts";

const MOOD_TRAIT_KEYS = helpers.keys(MOOD_TRAITS);

const genMoodTraits = () => {
	const moodTraits: MoodTrait[] = [random.choice(MOOD_TRAIT_KEYS)];
	if (Math.random() < 0.5) {
		moodTraits.push(
			random.choice(MOOD_TRAIT_KEYS.filter((trait) => trait !== moodTraits[0])),
		);
	}
	moodTraits.sort();

	return moodTraits;
};

export default genMoodTraits;
import { bySport, isSport, PHASE, PLAYER } from "../../../common/index.ts";
import { g, helpers, random } from "../../util/index.ts";
import { idb } from "../../db/index.ts";
import moodComponents from "./moodComponents.ts";
import type { Player } from "../../../common/types.ts";

const hasActiveNegotiation = async (tid: number, pid: number) => {
	const teamNegotiations = (await idb.cache.negotiations.getAll()).filter(
		(negotiation) => negotiation.tid === tid,
	);

	return teamNegotiations.some((negotiation) => negotiation.pid === pid);
};

const moodInfo = async (
	p: Player,
	tid: number,
	overrides: {
		contractAmount?: number;
	} = {},
) => {
	const components = await moodComponents(p, tid);
	let probWilling = 0;

	const phase = g.get("phase");
	const season = g.get("season");

	const resigning = phase === PHASE.RESIGN_PLAYERS;
	const rookie =
		phase >= PHASE.DRAFT &&
		phase <= PHASE.RESIGN_PLAYERS &&
		p.draft.year === season;

	let firstSeasonAfterExpansionOverride = false;
	if (
		(p.contract.exp === season &&
			phase >= PHASE.PLAYOFFS &&
			phase <= PHASE.RESIGN_PLAYERS) ||
		(phase === PHASE.RESIGN_PLAYERS && p.tid === PLAYER.FREE_AGENT)
	) {
		const t = await idb.cache.teams.get(tid);
		if (
			t &&
			t.firstSeasonAfterExpansion !== undefined &&
			t.firstSeasonAfterExpansion - 1 === season
		) {
			firstSeasonAfterExpansionOverride = true;
		}
	}

	let sumComponents = 0;
	for (const key of helpers.keys(components)) {
		if (key === "custom") {
			for (const row of components.custom!) {
				sumComponents += row.amount;
			}
		} else {
			sumComponents += components[key];
		}
	}

	// Add some based on how long free agency has lasted and how good/bad the player is
	let sumAndStuff = sumComponents - 0.5;
	if (p.tid === PLAYER.FREE_AGENT) {
		sumAndStuff += helpers.bound(p.numDaysFreeAgent, 0, 30) / 3;
	}

	let valueDiff =
		(p.value -
			bySport({ baseball: 75, basketball: 65, football: 85, hockey: 75 })) /
		2;

	// It's annoying to root against your player improving, but you do that for very good players sometimes. This prevents that from happening by capping valueDiff, but only when you're re-signing your own player
	const MAX_RESIGNING_VALUE_DIFF = 4;
	if (valueDiff > MAX_RESIGNING_VALUE_DIFF) {
		// Is player really re-signing? Otherwise do nothing.
		if (
			p.tid === tid ||
			(resigning &&
				p.tid === PLAYER.FREE_AGENT &&
				(await hasActiveNegotiation(tid, p.pid)))
		) {
			valueDiff = MAX_RESIGNING_VALUE_DIFF;
		}
	}

	sumAndStuff -= valueDiff > 0 ? Math.sqrt(valueDiff) : valueDiff;

	const thisIsAUserTeam = g.get("userTids").includes(tid);

	// More AI players testing free agency
	if (!thisIsAUserTeam) {
		sumAndStuff -= 3;
	}

	let contractAmount = overrides.contractAmount ?? p.contract.amount;

	// Up to 50% penalty for bad mood, except if this is a rookie contract
	const autoRookieContract =
		components.rookieContract > 0 && g.get("draftPickAutoContract");
	if (!autoRookieContract && contractAmount > g.get("minContract")) {
		contractAmount *= helpers.bound(1 + (0.5 * -sumComponents) / 10, 1, 1.5);
	}

	contractAmount = helpers.bound(
		helpers.roundContract(contractAmount),
		g.get("minContract"),
		g.get("maxContract"),
	);

	let willing = false;
	if (
		!g.get("playersRefuseToNegotiate") ||
		rookie ||
		firstSeasonAfterExpansionOverride ||
		(contractAmount === g.get("minContract") && p.tid === PLAYER.FREE_AGENT)
	) {
		probWilling = 1;
		willing = true;
	} else if (components.rookieContract > 0 && !g.get("rookiesCanRefuse")) {
		probWilling = 1;
		willing = true;
	} else {
		// Decrease that 0.7 to make players less likely to be at extremes (1% or 99%) in mood
		probWilling = 1 / (1 + Math.exp(-0.7 * sumAndStuff));

		let seed =
			tid +
			p.pid +
			p.stats.length +
			p.ratings.at(-1).ovr +
			(p.stats.at(-1)?.min ?? 0);

		if (isSport("baseball")) {
			// Since min is 0 in baseball
			seed += (p.stats.at(-1)?.pa ?? 0) + (p.stats.at(-1)?.outs ?? 0);
		}

		const rand = random.uniformSeed(seed);
		willing = rand < probWilling;
	}

	// Outside the above if/else so it plays nice with any branch
	if (
		g.get("challengeNoFreeAgents") &&
		!resigning &&
		contractAmount * 0.99 > g.get("minContract")
	) {
		willing = false;
	}

	return {
		components,
		traits: g.get("playerMoodTraits") ? p.moodTraits : [],
		probWilling,
		willing,
		contractAmount,
	};
};

export default moodInfo;
import { g } from "../../util/index.ts";
import moodInfo from "./moodInfo.ts";
import type { Player } from "../../../common/types.ts";

// Computes moodInfo for both userTid and current team
const moodInfos = async (
	p: Player,
	overrides: {
		contractAmount?: number;
	} = {},
) => {
	const userTid = g.get("userTid");

	const user = await moodInfo(p, userTid, overrides);

	let current;
	if (p.tid === userTid) {
		current = user;
	} else if (p.tid >= 0) {
		current = await moodInfo(p, p.tid, overrides);
	}

	return {
		user,
		current,
	};
};

export default moodInfos;
import { finances } from "../index.ts";
import { isSport, PHASE, PLAYER } from "../../../common/index.ts";
import { facilitiesEffectMood } from "../../../common/budgetLevels.ts";
import type { MoodComponents, Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import { getNegotiationPids } from "../../views/negotiationList.ts";

const getMinFractionDiff = async (pid: number, tid: number) => {
	if (!isSport("basketball")) {
		return 0;
	}

	if (!local.minFractionDiffs) {
		const season = g.get("season");
		const playersAll = await idb.cache.players.getAll();

		const players = [];
		for (const p of playersAll) {
			let stats;
			for (let i = p.stats.length - 1; i >= 0; i--) {
				if (p.stats[i].season === season && !p.stats[i].playoffs) {
					stats = p.stats[i];
				} else if (p.stats[i] < season) {
					break;
				}
			}

			if (stats) {
				if (stats.minAvailable !== undefined && stats.minAvailable > 500) {
					players.push({
						pid: p.pid,
						tid: stats.tid,
						value: p.valueNoPot,

						// Fraction of available minutes that this player played
						fraction: stats.min / stats.minAvailable,
					});
				}
			}
		}

		players.sort((a, b) => b.value - a.value);

		local.minFractionDiffs = {};

		if (players.length < 100) {
			return 0;
		}

		// Logistic regression would be better than binning to find expected value, but no good library
		const BIN_SIZE = 20;
		const numBins = Math.ceil(players.length / BIN_SIZE);
		for (let i = 0; i < numBins; i++) {
			const binPlayers = players.slice(i * BIN_SIZE, (i + 1) * BIN_SIZE);
			let average = 0;
			for (const p of binPlayers) {
				average += p.fraction;
			}
			average /= binPlayers.length;
			for (const p of binPlayers) {
				local.minFractionDiffs[p.pid] = {
					tid: p.tid,
					diff: p.fraction - average,
				};
			}
		}
	}

	const p = local.minFractionDiffs[pid];
	if (!p || p.tid !== tid) {
		return 0;
	}

	return p.diff;
};

// Make components -2 to 2, then scale with traits to -5 to 5
const moodComponents = async (
	p: Player,
	tid: number,
): Promise<MoodComponents> => {
	const season = g.get("season");
	const phase = g.get("phase");

	const teamSeasons = await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsByTidSeason",
		[
			[tid, season - 2],
			[tid, season],
		],
	);
	const currentTeamSeason = teamSeasons.find((ts) => ts.season === season);

	const teams = helpers.addPopRank(await idb.cache.teams.getAll());
	const t = teams.find((t) => t.tid === tid);
	if (!t) {
		throw new Error(`tid ${tid} not found`);
	}

	const components: MoodComponents = {
		marketSize: 0,
		facilities: 0,
		teamPerformance: 0,
		hype: 0,
		loyalty: 0,
		trades: 0,
		playingTime: 0,
		rookieContract: 0,
		difficulty: 0,
		relatives: 0,
	};

	if (p.customMoodItems) {
		for (const row of p.customMoodItems) {
			if (row.tid === undefined || row.tid === tid) {
				if (!components.custom) {
					components.custom = [];
				}

				components.custom.push({
					amount: row.amount,
					text: row.text,
				});
			}
		}
	}

	{
		// MARKET SIZE: -2 to 2, based on population rank
		const marketSize0to1 = (teams.length - t.popRank) / (teams.length - 1);
		components.marketSize = -2 + marketSize0to1 * 4;
	}

	{
		// FACILITIES: -2 to 2, based on facilities level
		const facilitiesLevel = await finances.getLevelLastThree("facilities", {
			t,
			teamSeasons,
		});
		components.facilities = facilitiesEffectMood(facilitiesLevel);
	}

	{
		// TEAM PERFORMANCE: -2 means no playoffs and 25% winning percentage. +2 means championship and 60% winning percentage, or 75% winning percentage
		if (currentTeamSeason) {
			const projectedRecord = {
				won: currentTeamSeason.won,
				lost: currentTeamSeason.lost,
				tied: currentTeamSeason.tied,
				otl: currentTeamSeason.otl,
			};

			// If a custom league file starts after the regular season, don't assume all teams have 0 winning percentage
			const leagueFileFromAfterSeason =
				g.get("phase") >= PHASE.PLAYOFFS &&
				projectedRecord.won === 0 &&
				projectedRecord.lost === 0 &&
				projectedRecord.tied === 0 &&
				projectedRecord.otl === 0;
			if (!leagueFileFromAfterSeason) {
				let wonTitle = false;

				// If season ongoing, project record and playoff success based on last year
				if (phase < PHASE.PLAYOFFS) {
					const previousSeason = teamSeasons.find(
						(ts) => ts.season === season - 1,
					);
					const previousRecord = {
						won: previousSeason ? previousSeason.won : 0,
						lost: previousSeason ? previousSeason.lost : 0,
						tied: previousSeason ? previousSeason.tied : 1,
						otl: previousSeason ? previousSeason.otl : 0,
					};

					const fractionComplete =
						(projectedRecord.won +
							projectedRecord.lost +
							projectedRecord.tied +
							projectedRecord.otl) /
						g.get("numGames");

					const currentGames =
						projectedRecord.won +
						projectedRecord.lost +
						projectedRecord.tied +
						projectedRecord.otl;
					const previousGames =
						previousRecord.won +
						previousRecord.lost +
						previousRecord.tied +
						previousRecord.otl;

					const remainingGames = helpers.bound(
						g.get("numGames") - currentGames,
						0,
						Infinity,
					);

					for (const key of ["won", "lost", "tied", "otl"] as const) {
						const currentFraction =
							currentGames > 0 ? projectedRecord[key] / currentGames : 0;
						const previousFraction =
							previousGames > 0 ? previousRecord[key] / previousGames : 0;

						projectedRecord[key] +=
							(currentFraction * fractionComplete +
								previousFraction * (1 - fractionComplete)) *
							remainingGames;
					}

					if (previousSeason) {
						wonTitle =
							previousSeason.playoffRoundsWon >=
							g.get("numGamesPlayoffSeries", season - 1).length;
					}
				} else {
					wonTitle =
						currentTeamSeason.playoffRoundsWon >=
						g.get("numGamesPlayoffSeries", "current").length;
				}

				let winp = helpers.calcWinp(projectedRecord);
				if (wonTitle) {
					// If won title, equivalent to extra 15%, so 60% winp and title maxes it out
					winp += 0.15;
				}

				if (isSport("hockey")) {
					// 40% to 60% -> -2 to 2
					components.teamPerformance = -2 + ((winp - 0.4) * 4) / 0.2;
				} else {
					// 25% to 75% -> -2 to 2
					components.teamPerformance = -2 + ((winp - 0.25) * 4) / 0.5;
				}

				// Negative matters more
				if (isSport("basketball") && components.teamPerformance < 0) {
					components.teamPerformance *= 2;
				}

				// Set upper bound, in case went over due to playoff bonus
				components.teamPerformance = helpers.bound(
					components.teamPerformance,
					-Infinity,
					2,
				);
			}
		}
	}

	{
		// HYPE
		if (currentTeamSeason) {
			components.hype = -2 + 4 * currentTeamSeason.hype;
		}
	}

	{
		// LOYALTY
		const numSeasonsWithTeam = p.stats.filter((row) => row.tid === tid).length;
		components.loyalty = numSeasonsWithTeam / 8;

		let wantsToReSign = p.tid === tid;
		if (
			!wantsToReSign &&
			p.tid === PLAYER.FREE_AGENT &&
			phase === PHASE.RESIGN_PLAYERS
		) {
			// Is this a free agent that a user team can re-sign? If so, apply bonus only for that team.
			const negotiationPids = await getNegotiationPids(tid);
			wantsToReSign = negotiationPids.has(p.pid);
		}

		if (wantsToReSign) {
			components.loyalty += isSport("football") ? 5 : 2;
		}
	}

	{
		// TRADES
		let numPlayersTradedAwayNormalized = 0;
		for (const teamSeason of teamSeasons) {
			if (teamSeason.season === season - 2) {
				numPlayersTradedAwayNormalized +=
					teamSeason.numPlayersTradedAway * 0.25;
			} else if (teamSeason.season === season - 1) {
				numPlayersTradedAwayNormalized += teamSeason.numPlayersTradedAway * 0.5;
			} else if (teamSeason.season === season) {
				numPlayersTradedAwayNormalized +=
					teamSeason.numPlayersTradedAway * 0.75;
			}
		}

		components.trades = helpers.bound(
			-(numPlayersTradedAwayNormalized - 5) / 4,
			-Infinity,
			0,
		);
	}

	{
		// PLAYING TIME
		const diff = await getMinFractionDiff(p.pid, tid);
		components.playingTime = diff * 10;
	}

	{
		// ROOKIE CONTRACT
		if (
			p.contract.rookieResign ||
			p.contract.rookie ||
			p.tid === PLAYER.UNDRAFTED
		) {
			components.rookieContract = 8;
		}
	}

	{
		// Relatives
		if (p.relatives.length > 0) {
			const relativePids = new Set(p.relatives.map((relative) => relative.pid));
			const players = await idb.cache.players.indexGetAll("playersByTid", tid);
			const teamPids = new Set(players.map((p) => p.pid));
			const relativesOnTeam = teamPids.intersection(relativePids);
			components.relatives = 2 * relativesOnTeam.size;
		}
	}

	// Apply difficulty modulation
	const difficulty = g.get("difficulty");
	if (g.get("userTids").includes(tid)) {
		if (difficulty !== 0) {
			for (const key of helpers.keys(components)) {
				if (key === "custom") {
					continue;
				}

				// Higher difficulty should result in lower mood, but we don't want to swap signs because that'd make for weird output (like complaining about team success when you won the title... but it's okay to just have it at 0 and say nothing)
				if (difficulty > 0) {
					if (components[key] > 0) {
						components[key] /= 1 + difficulty;
					} else {
						components[key] *= 1 + difficulty;
					}
				} else {
					if (components[key] > 0) {
						components[key] *= 1 - difficulty;
					} else {
						components[key] /= 1 - difficulty;
					}
				}
			}
		}
	} else {
		// At default difficulty, make players more likely to refuse. Decrease this, and players will be more likely to enter free agency
		const amount = 0.5 - helpers.bound(difficulty / 2, -0.25, 0.25);
		for (const key of helpers.keys(components)) {
			if (key === "custom") {
				continue;
			}

			if (amount > 0) {
				if (components[key] > 0) {
					components[key] /= 1 + amount;
				} else {
					components[key] *= 1 + amount;
				}
			} else {
				if (components[key] > 0) {
					components[key] *= 1 - amount;
				} else {
					components[key] /= 1 - amount;
				}
			}
		}
	}

	// Bound all components - they don't all have the same bounds!
	components.marketSize = helpers.bound(components.marketSize, -2, 2);
	components.facilities = helpers.bound(components.facilities, -2, 2);
	components.teamPerformance = helpers.bound(
		components.teamPerformance,
		-Infinity,
		2,
	);
	components.hype = helpers.bound(components.hype, -2, 2);
	components.loyalty = helpers.bound(components.loyalty, 0, Infinity);
	components.trades = helpers.bound(components.trades, -Infinity, 0);
	components.playingTime = helpers.bound(components.playingTime, -Infinity, 2);
	components.rookieContract = helpers.bound(
		components.rookieContract,
		0,
		Infinity,
	);

	// Apply traits modulation
	if (g.get("playerMoodTraits")) {
		if (p.moodTraits.includes("F")) {
			components.marketSize *= 2.5;
			components.hype *= 2.5;
			components.playingTime *= 2.5;
		}
		if (p.moodTraits.includes("L")) {
			components.marketSize *= 0.5;
			components.loyalty *= 2.5;
			components.trades *= 2.5;
		}
		if (p.moodTraits.includes("$")) {
			components.facilities *= 1.5;
			components.marketSize *= 0.5;
			components.teamPerformance *= 0.5;
		}
		if (p.moodTraits.includes("W")) {
			components.marketSize *= 0.5;
			components.playingTime *= 0.5;
			components.teamPerformance *= 2.5;
		}
	}

	return components;
};

export default moodComponents;
