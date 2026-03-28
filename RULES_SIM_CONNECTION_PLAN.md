# Commissioner Rules → Simulator Knobs — Connection Plan
_Last updated: 2026-03-28_

---

## Overview

The commissioner rules UI (`src/components/commissioner/rules/view/`) lets the user
configure the league.  Several of those settings should feed directly into the
stat-generator engine via **SimulatorKnobs** so that rule changes actually change
how games are simulated, not just how the UI looks.

The stat-generator knobs live in `src/services/simulation/SimulatorKnobs.ts`.

---

## Architecture

```
CommissionerRulesModal
  └─ rules/view/
       ├─ GameplayTab.tsx          ← quarter length, shot clock, 3PT line toggle
       ├─ EconomyTab.tsx           ← salary cap, luxury tax (economy only)
       └─ ...

leagueStats (in Redux store)
  ├─ quarterLength: number        (12 = NBA, 10 = FIBA)
  ├─ shotClockSeconds: number     (24 = NBA, 14 after OR)
  ├─ threePointLineEnabled: bool  (false = no 3PT attempts)
  └─ ...

SimulatorKnobs (per-game struct)
  ├─ quarterLength
  ├─ shotClockSeconds
  ├─ threePointAvailable
  └─ (+ exhibition presets overriding all of the above)

GameSimulator.simulateDay()
  └─ builds knobs from leagueStats + game.type flag
  └─ passes knobs → generateStatsForTeam()
```

---

## Step-by-step

### Step 1 — Add rule fields to `leagueStats` in `types.ts`

```ts
// In LeagueStats interface
quarterLength?:         number;   // 12 (NBA default)
shotClockSeconds?:      number;   // 24 (NBA default)
threePointLineEnabled?: boolean;  // true (NBA default)
```

### Step 2 — Wire GameplayTab to leagueStats

In `GameplayTab.tsx` (or create it if it doesn't exist):
- Quarter length selector: 10 / 12 / custom
- Shot clock input: 14 / 24 / custom
- Three-point line toggle

On save → dispatch `UPDATE_RULES` → writes to `leagueStats`.

### Step 3 — Build knobs from leagueStats in engine

In `GameSimulator.simulateDay()`, read `leagueStats` from state and build a
"league rules knob base":

```ts
// In simulateDay params, add: leagueStats?: LeagueStats
const leagueKnobs = getKnobs({
  quarterLength:       leagueStats?.quarterLength       ?? 12,
  shotClockSeconds:    leagueStats?.shotClockSeconds    ?? 24,
  threePointAvailable: leagueStats?.threePointLineEnabled ?? true,
});

// Exhibition presets override leagueKnobs
const gameKnobs: SimulatorKnobs =
  game.isCelebrityGame ? KNOBS_CELEBRITY  :
  game.isRisingStars   ? KNOBS_RISING_STARS :
  game.isAllStar       ? KNOBS_ALL_STAR   :
  leagueKnobs;                             // ← regular game uses league rules
```

### Step 4 — Pass leagueStats through the call chain

| File | Change |
|---|---|
| `simulationHandler.ts` | pass `state.leagueStats` to `simulateDay` |
| `GameSimulator.simulateDay()` | add `leagueStats?` param, build `leagueKnobs` |
| `GameSimulator.simulateGame()` | already receives `knobs` — no change needed |
| `generateStatsForTeam()` | already uses `knobs.quarterLength` for minute budget |

### Step 5 — Minute budget for non-12 quarter lengths

`initial.ts` already computes:
```ts
const totalMinuteBudget = (knobs.quarterLength * 4 + otCount * 5) * 5;
```
FIBA 10-min quarters → `(10 × 4) × 5 = 200 player-minutes` vs NBA `(12 × 4) × 5 = 240`.
No other changes needed — the minute allocator scales naturally.

### Step 6 — Shot clock → pace modifier (optional enhancement)

The current engine doesn't model pace from shot clock directly.
If you want it:
```ts
// In SimulatorKnobs:
paceMultiplier: shotClockSeconds < 24 ? 0.94 : 1.0,
```
Or expose it as a separate `shotClockPaceMult` that the engine applies to
`expectedTeamScore` before the normal pace roll.

---

## Exhibition Presets — What They Do Today

| Preset | Depth | StarMPG | 3PA Mult | Eff Mult | FT Mult | Flat Min |
|---|---|---|---|---|---|---|
| `KNOBS_DEFAULT` | standings-based | standings-based | ×1.0 | ×1.0 | ×1.0 | no |
| `KNOBS_ALL_STAR` | 12 (all) | 26 | ×1.35 | ×1.22 | ×0.38 | no |
| `KNOBS_RISING_STARS` | 10 | 22 | ×1.20 | ×1.08 | ×0.55 | no |
| `KNOBS_CELEBRITY` | 10 | flat | ×0.35 | ×0.78 | ×0.60 | 14 min |

Celebrity game also sets `ratingFloor: 32` to prevent 0-stat lines for celebs
who have no NBA `ratings` array.

---

## Files Map

| Concern | File |
|---|---|
| Knob interface + presets | `src/services/simulation/SimulatorKnobs.ts` |
| Apply knobs to stats | `src/services/simulation/StatGenerator/initial.ts` |
| Pick knobs per game | `src/services/simulation/GameSimulator/engine.ts` |
| League rules storage | `src/types.ts → LeagueStats` |
| Commissioner UI | `src/components/commissioner/rules/view/GameplayTab.tsx` |
| Save rules → store | `UPDATE_RULES` reducer action |

---

## Checklist

- [x] `SimulatorKnobs.ts` — interface, DEFAULT + exhibition presets
- [x] `initial.ts` — accepts `knobs` param, applies all knob dimensions
- [x] `engine.ts` — detects game type, passes right preset to `simulateGame`
- [ ] `types.ts → LeagueStats` — add `quarterLength`, `shotClockSeconds`, `threePointLineEnabled`
- [ ] `GameplayTab.tsx` — UI for the three rule-change fields above
- [ ] `simulationHandler.ts` — thread `leagueStats` → `simulateDay`
- [ ] `engine.ts simulateDay` — build `leagueKnobs` from `leagueStats`
- [ ] (optional) shot clock → pace multiplier connection
