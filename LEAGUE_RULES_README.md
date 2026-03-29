# League Rules → Sim Wiring Guide

This is the **step-by-step reference** for wiring a commissioner rule setting to the
game simulation engine. Read this before touching any rule ↔ sim code.

For the master table of what is already wired vs. stored-only, see
**[RULES_SIM_CONNECTION_PLAN.md](./RULES_SIM_CONNECTION_PLAN.md)**.

---

## How the pipeline works (read this first)

```
Commissioner Rules UI
        ↓  user changes a toggle/input
leagueStats (src/types.ts  LeagueStats interface)
        ↓  stored in GameState
simulationRunner.ts  (src/services/logic/simulationRunner.ts)
        ↓  pulls fields from state.leagueStats, passes as leagueStats object
simulateGames()  (src/services/simulationService.ts)
        ↓  forwards leagueStats unchanged
GameSimulator.simulateDay()  (src/services/simulation/GameSimulator/engine.ts)
        ↓  reads leagueStats, builds leagueBaseKnobs using getKnobs()
SimulatorKnobs  (src/services/simulation/SimulatorKnobs.ts)
        ↓  knob struct passed into every individual game
StatGenerator.generateStatsForTeam()  (src/services/simulation/StatGenerator/initial.ts)
        ↓  pace, shot location, FT rate, efficiency — per-player stat targets
StatGenerator.generateCoordinatedStats()  (src/services/simulation/StatGenerator/coordinated.ts)
        ↓  blocks, steals, assists, rebounds — team-level distribution
```

Every wired rule **must travel this entire chain**. Missing any step means the rule
has no effect even if it looks correct on both ends.

---

## Step-by-step: wiring a new rule

### Step 1 — Confirm the field exists in `leagueStats`

**File:** `src/types.ts`
**Search for:** `LeagueStats` interface (around line 195–420)

The field must already be declared here. If not, add it:
```typescript
// in the relevant section comment block (e.g. // Fouls & Limits)
myNewRule?: boolean;   // or number if it's a slider value
```

Also check `src/constants.ts` for `INITIAL_LEAGUE_STATS` — add a default value if the
field should have a non-undefined starting state.

---

### Step 2 — Decide what SimulatorKnob to affect

**File:** `src/services/simulation/SimulatorKnobs.ts`

Ask: what does this rule change about how basketball is played?

| If the rule affects... | Relevant knob(s) |
|---|---|
| How many points are scored | `paceMultiplier` or `efficiencyMultiplier` |
| How fast the game is played | `paceMultiplier` |
| 3-point shot frequency | `threePointRateMult`, `threePointAvailable` |
| Rim/paint attack frequency | `rimRateMult` |
| Low-post / post-up frequency | `lowPostRateMult` |
| Free throw frequency | `ftRateMult` |
| How many blocks occur | `blockRateMult` |
| Quarter length / total minutes | `quarterLength` |
| Per-player minute distribution | `rotationDepthOverride`, `starMpgOverride`, `flatMinutes` |

If no existing knob fits, **add a new knob to the interface** (see Step 2b).

#### Step 2b — Adding a brand-new knob

1. Add the field to the `SimulatorKnobs` interface with a JSDoc comment:
```typescript
/** What this knob does. 1.0 = NBA default.
 *  Set via rule: myNewRule=true → 1.5 */
myNewKnob: number;
```

2. Add a default `1.0` (or appropriate value) to `KNOBS_DEFAULT`:
```typescript
export const KNOBS_DEFAULT: SimulatorKnobs = {
  ...
  myNewKnob: 1.0,
};
```

3. Add the same value to **all four explicit presets** that don't spread `KNOBS_DEFAULT`:
   - `KNOBS_ALL_STAR`
   - `KNOBS_RISING_STARS`
   - `KNOBS_CELEBRITY`
   - `KNOBS_PRESEASON`

   (`KNOBS_NO_THREE` and `KNOBS_FIBA_QUARTERS` spread `...KNOBS_DEFAULT` so they
   inherit automatically — no change needed there.)

---

### Step 3 — Apply the knob in the stat generator

Pick the right file based on what the knob affects:

#### `initial.ts` — per-player stats (scoring, shot selection, FT rate, efficiency)

**File:** `src/services/simulation/StatGenerator/initial.ts`

This is where shot-location weights (`wAtRim`, `wLowPost`, `wMidRange`, `wThree`),
`ftRateMult`, `efficiencyMultiplier`, and `paceMultiplier` are consumed.

The `knobs` object is passed in as the last parameter of `generateStatsForTeam`.
Access it directly:

```typescript
// Example: applying a new rimRateMult
wAtRim *= (knobs.myNewKnob ?? 1.0);
```

Where to insert:
- **Shot location changes** → after the interior-D modifier block, before the shot
  distribution is finalized (look for the `wAtRim *= ...` block added for rimRateMult)
- **FT rate changes** → in the FTA calculation section
- **Efficiency changes** → multiplied onto `efficiencyMultiplier` before it's applied
- **Pace changes** → `paceMultiplier` is applied to `totalScore` at the top of the function

#### `coordinated.ts` — team-level stats (blocks, steals, assists, rebounds)

**File:** `src/services/simulation/StatGenerator/coordinated.ts`

`availableBlocks`, `availableSteals`, and `availableRebounds` are the pool sizes
passed in as parameters. The knob is NOT passed to this function directly — instead
it must be **applied at the call site in `engine.ts`** before passing the value in.

```typescript
// In engine.ts, before the generateCoordinatedStats call:
const homeBlkMult = homeKnobs.blockRateMult ?? 1.0;
// Then pass:
awayInteriorMisses * 0.33 * awayBlkMult,  // the availableBlocks argument
```

#### `nightProfile.ts` — per-player per-game variance

**File:** `src/services/simulation/StatGenerator/nightProfile.ts`

Only needed for rules that change variance (e.g. a rule that makes games more chaotic).
Most rules don't need this file.

---

### Step 4 — Wire the rule in `engine.ts`

**File:** `src/services/simulation/GameSimulator/engine.ts`

Find the `leagueBaseKnobs` block (search for `// Build league-rules base knobs`).
This is where all rule fields are read from `leagueStats` and converted to knob values.

Pattern:
```typescript
// 1. Read the field
const myNewRule = leagueStats?.myNewRule ?? false;  // default = NBA default behavior

// 2. Compute the knob value
const myNewKnobValue = myNewRule ? 1.5 : 1.0;  // active vs. inactive

// 3. Pass it into getKnobs()
const leagueBaseKnobs = getKnobs({
  ...existing fields...
  myNewKnob: myNewKnobValue,
});
```

**Important:** multipliers from different rules stack. If two rules both affect
`rimRateMult`, multiply them: `rimMult * chargingRimBump * myNewRimBump`.

Also expand the `leagueStats?:` type annotation on `simulateDay()` to include the new field:
```typescript
static simulateDay(
  ...
  leagueStats?: {
    quarterLength?: number;
    ...
    myNewRule?: boolean;   // ← add here
  }
)
```

---

### Step 5 — Thread the field through `simulationService.ts`

**File:** `src/services/simulationService.ts`

The `simulateGames()` function has its own `leagueStats?:` inline type. Add the new
field there too — identical to what you added in `engine.ts`:

```typescript
leagueStats?: {
    quarterLength?: number;
    ...
    myNewRule?: boolean;   // ← add here
}
```

---

### Step 6 — Pass the field from `simulationRunner.ts`

**File:** `src/services/logic/simulationRunner.ts`

Find the `simulateGames(...)` call at the bottom. The last argument is the object
that gets built from `state.leagueStats`. Add the new field:

```typescript
{
    quarterLength:               state.leagueStats.quarterLength,
    shotClockValue:              state.leagueStats.shotClockValue,
    ...
    myNewRule:                   state.leagueStats.myNewRule,    // ← add here
}
```

---

### Step 7 — Add UI comment in the rules section component

**Files:** `src/components/commissioner/rules/view/game-rules/*.tsx`

Find the component that renders the toggle/input for this rule. Add a JSX comment
on the same line as the `<RuleToggle>` or `<RuleInput>`:

```tsx
{/* myNewRule ✅ wired: enabled → 1.5× myNewKnob (brief description of effect) */}
<RuleToggle id="myNewRule" value={myNewRule} onChange={setMyNewRule} />
```

For rules that are NOT wired yet, use `TODO(sim)` style:
```tsx
{/* TODO(sim): myUnwiredRule not wired — stored only */}
```

---

### Step 8 — Update the connection plan

**File:** `RULES_SIM_CONNECTION_PLAN.md`

Move the rule from the `❌ STORED ONLY` table into the `✅ WIRED` table.

---

### Step 9 — Run the TypeScript check

```bash
npx tsc --noEmit
```

Filter out known pre-existing errors (DunkContest, StandingsView, TradeMachineModal,
llm/generators, main.tsx) and fix any new errors that appeared in:
- `engine.ts`
- `simulationService.ts`
- `simulationRunner.ts`
- `SimulatorKnobs.ts`
- `initial.ts` or `coordinated.ts`

---

## Key files quick-reference

| What you need to do | File |
|---|---|
| Check or add a leagueStats field | `src/types.ts` → `LeagueStats` interface |
| Set the default value for a field | `src/constants.ts` → `INITIAL_LEAGUE_STATS` |
| Add or edit a SimulatorKnob | `src/services/simulation/SimulatorKnobs.ts` |
| Apply knob to per-player stats (pace, shots, FTs) | `src/services/simulation/StatGenerator/initial.ts` |
| Apply knob to team stats (blocks, steals, assists) | `src/services/simulation/GameSimulator/engine.ts` (at call site) |
| Apply per-game variance changes | `src/services/simulation/StatGenerator/nightProfile.ts` |
| Read leagueStats → build leagueBaseKnobs | `src/services/simulation/GameSimulator/engine.ts` |
| Thread leagueStats through simulateGames | `src/services/simulationService.ts` |
| Pass leagueStats fields from state | `src/services/logic/simulationRunner.ts` |
| Add ✅ / TODO(sim) UI comment | `src/components/commissioner/rules/view/game-rules/*.tsx` |
| Update the wired/stored-only table | `RULES_SIM_CONNECTION_PLAN.md` |

---

## Currently wired rules and their exact math

These are the formulas in `engine.ts` as of the last update. Useful when tuning
multiplier values:

```typescript
// Shot clock
const shotClockPace = shotClockOn
  ? Math.min(2.0, 24 / Math.max(8, shotClock))  // 24s=1.0x, 12s=2.0x
  : 0.78;                                         // no shot clock → slow-down ball

// 3-second violations
const rimMult    = def3sec ? 1.0 : 0.72;    // def3sec off → paint clogged → fewer drives
const threeBumpD = def3sec ? 1.0 : 1.22;   // more perimeter shooting when lane is clogged
const lowPostMult = off3sec ? 1.0 : 1.35;  // off3sec off → post camping → more post-ups
const rimBumpO   = off3sec ? 1.0 : 1.15;   // drives off post catches

// Handchecking
const handcheckFtMult = handchecking ? 0.82 : 1.0;  // 18% fewer FTA when physical play allowed

// Goaltending
const blockMult       = goaltending ? 1.0 : 1.6;    // defenders swat freely at rim
const goaltendEffMult = goaltending ? 1.0 : 0.93;   // harder to score near rim

// Charging
const chargingRimBump = charging ? 1.0 : 1.12;      // more drives without charge risk

// No-dribble rule
const noDribblePaceMult = noDribble ? 0.72 : 1.0;   // slow catch-and-shoot game
const noDribbleRimMult  = noDribble ? 0.65 : 1.0;   // can't drive
const noDribble3PMult   = noDribble ? 1.40 : 1.0;   // all perimeter shooting

// Final combined knobs (multipliers stack)
rimRateMult:  rimMult * rimBumpO * chargingRimBump * noDribbleRimMult
threePointRateMult: 1.0 * threeBumpD * noDribble3PMult  (or 0 if line disabled)
paceMultiplier: shotClockPace * noDribblePaceMult
```

---

## Adding a new knob that affects coordinated stats (blocks/steals)

`generateCoordinatedStats` receives three pool-size parameters:
- `availableRebounds` — `awayMisses * 0.69`
- `availableSteals` — `awayTov * 0.60`
- `availableBlocks` — `awayInteriorMisses * 0.33`

To affect one of these pools with a knob, **multiply at the call site in engine.ts**:

```typescript
const homeBlkMult = homeKnobs.blockRateMult ?? 1.0;
const awayBlkMult = awayKnobs.blockRateMult ?? 1.0;

// Home team's blocks come from away team's interior misses
awayInteriorMisses * 0.33 * awayBlkMult,

// Away team's blocks come from home team's interior misses
homeInteriorMisses * 0.33 * homeBlkMult,
```

Note the direction: `home team blocks = away team's missed interior shots * blockRateMult`.
The `blkTalentFactor` inside `coordinated.ts` still applies on top of this.

---

## Exhibition presets (All-Star, Celebrity, Rising Stars)

These **bypass all commissioner rules entirely**. They are hardcoded in `SimulatorKnobs.ts`:
- `KNOBS_ALL_STAR`
- `KNOBS_RISING_STARS`
- `KNOBS_CELEBRITY`
- `KNOBS_PRESEASON`

If `leagueStats.allStarMirrorLeagueRules = true` is set, the intention is to merge
`leagueBaseKnobs` with the All-Star preset instead of replacing it — but this is
**not implemented yet** (marked as future work).

When you add a new knob, always add it to all four explicit presets with a sensible
value (usually `1.0` unless the exhibition context warrants something different).

---

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Added knob to interface but not to `KNOBS_DEFAULT` | TypeScript error: missing property on explicit presets | Add `myKnob: 1.0` to `KNOBS_DEFAULT` and all 4 explicit presets |
| Added field to `engine.ts` but not `simulationService.ts` or `simulationRunner.ts` | Field always arrives as `undefined` in engine → always uses default | Thread through all 3 files |
| Multiplied knob in `coordinated.ts` instead of at call site | TypeScript: `knobs` is not available in `coordinated.ts` | Apply the multiplier in `engine.ts` on the argument before passing |
| Used curly/smart quotes `'` in string literals in `.ts` files | TypeScript string literal termination errors (unterminated string) | Always use straight quotes `'` or escape with `\'` |
| Forgot to handle `?? 1.0` fallback when reading knob | Rule has no effect when leagueStats is undefined (exhibition games) | Always use `knobs.myKnob ?? 1.0` |
