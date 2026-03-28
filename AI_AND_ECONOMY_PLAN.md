# NBA Commish — AI Trades / FA + Economy Connection Plan
_Last updated: 2026-03-28_

---

## 1. Economy — Salary Cap from Revenue (DONE / IN PROGRESS)

### How it works now
```
BroadcastingView.tsx
  totalRev  = mediaRev + lpRev + 3.8  (all in $B)
  salaryCap = 154.6 * (totalRev / 14.3)  ($M)

On lock → UPDATE_RULES → leagueStats.salaryCap (in USD dollars)
                        → leagueStats.luxuryPayroll  ← NEEDS FIX (see §1a)
```

### §1a — luxuryPayroll should derive from percentage, not be hardcoded
**Problem:** When salaryCap changes (due to broadcasting deal), `luxuryPayroll` stays at its INITIAL
value ($171M). All cap thresholds (aprons too) should re-derive from the new cap.

**Fix applied in this session:**
- `getCapThresholds()` now reads `luxuryTaxThresholdPercentage` from leagueStats and computes:
  `luxuryTax = salaryCap * (luxuryTaxThresholdPercentage / 100)`
  falling back to `luxuryPayroll` only if percentage isn't set.
- BroadcastingView lock now also writes updated `luxuryPayroll` value when saving.

### §1b — EconomyFinancesSection cap input
- Salary Cap Amount input shows the current `leagueStats.salaryCap` (already works).
- When broadcasting deal is locked, field shows "(set by Broadcasting Deal)" label.
- Manual override still works when deal is NOT locked.

### §1c — Economy settings → leagueStats (already wired)
All EconomyTab props flow through `UPDATE_RULES` action → `leagueStats`. These are live:
- `firstApronPercentage`, `secondApronPercentage`
- `luxuryTaxThresholdPercentage`, `minimumPayrollPercentage`
- `twoWayContractsEnabled`, `minPlayersPerTeam`, `maxPlayersPerTeam`
- `salaryCapType` (soft/hard)

---

## 2. AI Trade Engine — Implementation Plan

### Data layer (READY ✅)
- `getTeamCapProfile()` — full cap + apron status per team
- `getTradeOutlook()` — standings-aware buyer/seller/rebuilding classification
- `TradeProposal` type in `types.ts`
- `state.tradeProposals` + `handleExecutiveTrade()` action (executes any trade given assets)
- `processAITradeProposals()` — expiry logic skeleton

### What to build (in order)

#### Step 1 — `playerValue(p: NBAPlayer): number`
File: `src/services/AITradeHandler.ts`

```ts
function playerValue(p: NBAPlayer): number {
  const age = p.age ?? 26;
  const rating = p.overallRating ?? 60;
  const yearsLeft = (p.contract?.exp ?? 2026) - currentYear;

  // Age curve: peak 24-29, decline after 30
  const ageMult = age <= 24 ? 0.85 + age * 0.01
                : age <= 29 ? 1.0
                : Math.max(0.5, 1.0 - (age - 29) * 0.07);

  // Contract value: long deals on bad players = negative value for recipients
  const contractMult = rating >= 75 ? 1.0 + yearsLeft * 0.03   // stars want extensions
                     : rating >= 65 ? 1.0                        // neutral
                     : Math.max(0.6, 1.0 - yearsLeft * 0.08);   // bad contract penalty

  return rating * ageMult * contractMult;
}
```

#### Step 2 — `teamNeedsScore(team, roster): Record<string, number>`
```ts
// For each position group (PG/SG/SF/PF/C):
// 1. Count players rated ≥ 70 at that position
// 2. Need score = 10 - (count * 3), clamped 0-10
// 3. Bonus +3 if team is a buyer (playoff seeded, cap space)
```

#### Step 3 — `valueChange(teamId, receiving, giving): number`
```ts
// receivedValue = sum(playerValue(p) for p in receiving.players) + pickValue(receiving.picks)
// givenValue    = sum(playerValue(p) for p in giving.players) + pickValue(giving.picks)
// needBonus     = sum(teamNeedsScore[p.pos] for p in receiving.players) * 0.15
// return (receivedValue - givenValue) + needBonus
// Threshold: deal accepted if valueChange >= -5 for both teams
```

#### Step 4 — Proposal generation loop
```ts
export function generateAIDayTradeProposals(state: GameState): TradeProposal[] {
  // 1. Build cap profiles for all teams (getTeamCapProfile)
  // 2. Get trade outlooks (getTradeOutlook with confRank/GB)
  // 3. For each buyer team: scan seller/rebuilding teams
  //    a. Pick seller's best tradeable player (high value, doesn't fit their timeline)
  //    b. Build offer: matching salary players + picks if needed
  //    c. Run valueChange for both sides
  //    d. If both sides >= -5: create TradeProposal { isAIvsAI: true, status: 'pending' }
  // 4. Return array (max 3 per day to avoid flooding)
}
```

#### Step 5 — Execute accepted proposals
In `simulationHandler.ts` (or a new `aiTradeHandler.ts` called from there):
```ts
// For each accepted isAIvsAI proposal:
//   handleExecutiveTrade(state, proposal.teamAId, proposal.teamBId, assetsA, assetsB)
//   → this already handles: roster mutation, news, social posts, transactions
```

#### Draft pick value table
```ts
const PICK_VALUE: Record<string, number> = {
  'first_top5': 85, 'first_lottery': 72, 'first_mid': 58, 'first_late': 45,
  'second': 20,
};
```

---

## 3. AI Free Agency — Implementation Plan

### Data layer (READY ✅)
- Free agents: `state.players.filter(p => p.tid < 0 && p.status === 'Free Agent')`
- Cap space per team: `getTeamCapProfile()` → `capSpaceUSD`
- Roster size: `state.players.filter(p => p.tid === team.id).length`

### What to build (in order)

#### Step 1 — `playerMoodForTeam(player, team, roster): number` (0-2)
```ts
// Mood factors (each ±0.3):
// + winning team (confRank <= 6)
// + large market (team.pop > 5M)
// + clear PT opportunity (not depth at their position)
// + near-max contract offer
// - losing team
// - second apron team (restricted exceptions)
// Base mood: 1.0. Clamp 0-2.
```

#### Step 2 — `getBestFit(team, roster, freeAgents, maxCapUSD): NBAPlayer | null`
```ts
// 1. Filter: contractToUSD(p.contract.amount) <= maxCapUSD
// 2. Filter: roster.length < maxPlayersPerTeam (from leagueStats)
// 3. Filter: playerMoodForTeam(p, team) >= 1
// 4. Score = p.overallRating + teamNeedsScore[p.pos] * 2
// 5. Return highest-scoring player
```

#### Step 3 — Signing loop
```ts
export function runAIFreeAgencyRound(state: GameState): SigningResult[] {
  const results: SigningResult[] = [];
  const thresholds = getCapThresholds(state.leagueStats);
  const pool = [...freeAgents]; // mutable copy

  // Sort AI teams: best confRank first (contenders get first pick)
  const aiTeams = state.teams
    .filter(t => t.id !== state.userTeamId)
    .sort((a, b) => confStandings[a.id] - confStandings[b.id]);

  for (const team of aiTeams) {
    const profile = getTeamCapProfile(state.players, team.id, ...);
    if (profile.capSpaceUSD < 500_000) continue; // no room

    const roster = state.players.filter(p => p.tid === team.id);
    const maxCap  = profile.capSpaceUSD;
    const best    = getBestFit(team, roster, pool, maxCap);
    if (!best) continue;

    // Sign the player
    results.push({ playerId: best.internalId, teamId: team.id, amount: best.contract.amount });
    pool.splice(pool.indexOf(best), 1); // remove from pool
  }
  return results;
}
```

#### Step 4 — Apply signings to state
In the reducer, `runAIFreeAgencyRound` results update:
- `player.tid = teamId`
- Add transaction entry: `{ type: 'signing', playerId, teamId, date, amount }`
- Inject news: `NewsGenerator.generate('fa_signing', date, { playerName, teamName, amount })`

---

## 4. File Map — Where Everything Lives

| Concern | File |
|---|---|
| Cap thresholds | `src/utils/salaryUtils.ts` |
| Trade outlook (buyer/seller) | `src/utils/salaryUtils.ts → getTradeOutlook()` |
| Attendance estimates | `src/utils/attendanceUtils.ts` |
| AI trade logic | `src/services/AITradeHandler.ts` |
| AI FA logic | `src/services/AIFreeAgentHandler.ts` |
| Trade execution | `src/store/logic/actions/tradeActions.ts → handleExecutiveTrade()` |
| Sim day loop | `src/store/logic/turn/simulationHandler.ts` |
| Broadcasting cap calc | `src/components/operations/BroadcastingView.tsx` |
| Economy settings | `src/components/commissioner/rules/view/EconomyTab.tsx` |
| League-wide finances UI | `src/components/central/view/LeagueFinancesView.tsx` |
| Team detail finances UI | `src/components/central/view/TeamFinancesViewDetailed.tsx` |
| News injection | `src/services/lazySimNewsGenerator.ts → NewsGenerator` |

---

## 5. Session Checklist

- [x] `salaryUtils.ts` — getCapThresholds, getTradeOutlook (standings-aware)
- [x] `attendanceUtils.ts` — per-team attendance + revenue estimates
- [x] `LeagueFinancesView.tsx` — Cap Overview / Trade Board / Attendance tabs
- [x] `TeamFinancesViewDetailed.tsx` — full team breakdown with charts
- [x] `GameContext.tsx` — navigateToTeamFinances()
- [x] `NavigationMenu.tsx` — Finances back to Command Center, Team Finances in Operations
- [x] `tradeActions.ts` — NewsGenerator.generate('trade_confirmed') wired
- [ ] `AITradeHandler.ts` — implement playerValue, teamNeedsScore, valueChange, proposal loop
- [ ] `AIFreeAgentHandler.ts` — implement getBestFit, signing loop, apply signings
- [x] `salaryUtils.ts` — luxuryTax derived from percentage (§1a fix)
- [x] `BroadcastingView.tsx` — persist luxuryPayroll on lock
- [x] `EconomyFinancesSection.tsx` — show cap as broadcasting-derived, live threshold mini-bars
