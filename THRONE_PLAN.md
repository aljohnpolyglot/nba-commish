# The Throne — Full Design & Implementation Plan

> Single source of truth for the 1v1 tournament event. Covers real-world format, in-game simulation design, commissioner settings, incentive logic, and standalone mini-game polish tasks.

---

## PART 1 — Real-World Format (v2, locked)

### Concept

A single-elimination 1v1 basketball tournament held on All-Star Saturday Night. Open sign-up, fan-driven selection, pick-your-opponent format. Sixteen players, one evening, one champion — crowned with a custom belt: **The Throne**.

---

### Eligibility

Any player on a guaranteed NBA contract during the sign-up window is eligible. Roster status after the window closes does not affect eligibility (snapshot rule).

---

### Selection

**Step 1 — Open Sign-Up Window**
Sign-ups open December 1, close January 15. Public declaration. Names announced live as they sign up. Tracker on NBA.com.

**Step 2 — Composite Vote**
Voting opens January 16, closes January 30.
- 40% fan vote
- 30% player vote
- 20% media vote
- 10% coaches vote

Criteria on every ballot: *"Who do you want to see go 1v1 right now."* Not most deserving, not best player — best 1v1. Top 16 vote-getters make the field. Same vote determines seeding 1–16.

**Step 3 — Field Reveal**
January 30: Top 16 announced live. Selection Special broadcast that evening.

---

### Core Rules

| Rule | Value |
|---|---|
| Target | First to 12, win by 2, hard cap at 16 |
| Scoring | 2s and 3s (full NBA arc) |
| Possession | Make-it-take-it |
| Court | Half court |
| Shot clock | 7 seconds |
| Foul scaling | And-1 = +1 pt, 2-pt foul = 2 pts awarded, 3-pt foul = 3 pts awarded |
| First possession | Free-throw shootout — each player shoots one FT; first to make when the other misses wins it. Repeat on ties. |

**On first possession:** Unrivaled has no public rule. Free-throw shootout is cleaner broadcast theater than a coin toss — 30 seconds of tension, on-brand, tells you something about ice in veins before tip-off.

**On size balance:** Unrivaled tape confirms small-vs-big discrepancy is minimal under a 7-sec clock. Aaliyah Edwards (6'3") beat Breanna Stewart Round 1. Bigs can't grind post-ups, smalls can't bleed clock. No size modifier rules needed — the format handles it.

---

### Tournament Format

Single-elimination · 16 players · 15 games · one evening

**Pick-your-opponent, every round with > 2 players remaining:**

- Top 8 seeds pick their opponent from the remaining pool, in seed order (1 → 8)
- **Pick → Play → Pick → Play** — each seed walks to the podium, announces their pick live, game tips ~10 min later, game ends, next seed walks up
- By the time Seed #8 picks, only one opponent is left (might be a wounded top seed, might be the rested #14 — it's live chess)
- **Point differential tracked** for every winner throughout the tournament

**Reseeding after each round:** winners reordered by cumulative point differential. Tiebreaker: flash game to 5, no FTs, 5-sec shot clock.

**The Final:** Last two standing. No pick needed. Walk out, play.

---

### Round Structure

| Round | Seeds in | Seeds out | Pick order |
|---|---|---|---|
| Round 1 | 16 | → 8 | Top 8 pick from bottom 8 |
| Round 2 | 8 | → 4 | Top 4 pick from bottom 4 |
| Semifinals | 4 | → 2 | Top 2 pick from bottom 2 |
| The Final | 2 | → 1 | No pick |

---

### Why Not 32?

| Factor | 16 | 32 |
|---|---|---|
| Fit in one evening | ✅ 15 games | ❌ 31 games, Unrivaled spreads 3 days |
| R1 quality | Every match meaningful | Top seed vs #32 is a layup |
| Cut line prestige | 27% acceptance (brutal, stakes the vote) | 50%+ get in, vote matters less |
| Pick ceremony | 8 picks, fast, clean | 16 picks, repetitive |
| "Made The Throne" honor | Career-defining | Just "I made it" |

**Stay at 16. Lock it.**

---

### Run of Show

| Time | Segment |
|---|---|
| 4:00 PM | Field introductions — all 16 creative entrances (~25 min) |
| 4:30 – 6:30 PM | Round 1 — 8 pick-and-play sequences |
| 6:30 – 6:45 PM | Round 2 reseeding announced |
| 6:45 – 7:45 PM | Round 2 — 4 pick-and-play sequences |
| 7:45 – 8:00 PM | Semis reseeding |
| 8:00 – 8:30 PM | Semifinals — 2 pick-and-play sequences |
| 8:45 PM | The Final |
| 9:00 PM | Throne presentation + belt ceremony |

**Per-sequence math:** 3 min podium pick + 10 min game + 2 min reset = ~15 min. 8 R1 sequences = 2 hrs. Total event: ~5 hrs primetime. Appointment TV, not endurance TV.

---

### Field Introductions

All 16 players introduced **Round 1 only** — reverse seed order (#16 first, #1 last). Each player gets ~90 seconds: walkout song of their choice, custom jumbotron package, costumes/props/concepts encouraged. Player-led, not league-produced (league supplies pyro/lights/screen support, concept belongs to the player).

Subsequent rounds: walk out, name announced, song clip, play. No repeat production. Not worth the budget for players who won't make the Final.

---

### Incentive Structure

**The core logic (for simulation):** A player signs up if the cash prize is worth more than the opportunity cost. In practice:

- Role players / bench guys: prize pool >> weekly salary slice → sign up for the cash and the platform
- Mid-tier stars: prize + endorsement upside clears the injury-risk calculus
- Superstars: prize alone doesn't clear it → require peer pressure, legacy hooks, or founding-year co-creator status

**Prize pool:**
- Winner: $5M
- Runner-up: $2M
- Semifinalists (×2): $1M each
- All 16 participants: $250K appearance fee (guaranteed, sign-up locks it in)

**Other incentive layers:**
1. Legacy — "King of 1v1" title on Basketball Reference until dethroned. Belt persists across seasons.
2. Charity match — League matches the winner's prize to their chosen cause.
3. Endorsement — Title sponsor provides year-long campaign for the winner (billboards, commercials, signature colorway).
4. Peer pressure — Public tracker. Hard deadline. Missing it becomes the loud choice once stars are in.

**Year 1 strategy:** Lock 3–4 max-contract players as founding participants (producer credit, co-creator status, bigger cut). Once they're in, peer pressure snowballs for Year 2.

---

### Why This Works

1. **Real basketball skill.** 1v1 half-court is the purest isolation test. Nowhere to hide.
2. **Real stakes.** A belt, a title, a permanent legacy mark. Not an exhibition.
3. **Content factory.** Storylines from December through February: sign-up drama, callouts, campaigning (imagine Jarrett Allen running an entire HSM-themed "We're All in This Together" campaign), vote wars, field reveal, creative entrances, live pick ceremonies, upsets.
4. **Player-driven.** Open sign-up. Fan-weighted vote. Player-designed entrances. The league provides the stage; the players provide the show.

---

## PART 2 — Commissioner Settings (in-game)

These are the toggles exposed in the Commissioner UI when `allStarThroneEnabled` is on:

| Setting key | Type | Default | Description |
|---|---|---|---|
| `allStarThroneEnabled` | `boolean` | `false` | Master toggle — shows The Throne tab in AllStarView |
| `allStarThroneFieldSize` | `8 \| 16` | `16` | Tournament bracket size |
| `allStarThroneFormat` | `'mini8' \| 'full16'` | `'full16'` | Alias for field size (standalone mini-game uses `mini8`) |
| `allStarThroneFirstPossession` | `'shootout' \| 'higher_seed_choice'` | `'shootout'` | How first possession is determined |
| `allStarThroneScoring` | `'2s_and_3s' \| '1s_and_2s'` | `'2s_and_3s'` | Shot value system (classic streetball uses 1s/2s) |
| `allStarThroneShotClock` | `number` | `7` | Shot clock in seconds (5–12 range) |
| `allStarThroneTargetScore` | `number` | `12` | First-to score target |
| `allStarThroneHardCap` | `number` | `16` | Hard cap on score (win-by-2 can push past target up to this) |
| `allStarThronePrizePool` | `number` | `5000000` | Winner prize in USD (affects AI sign-up logic) |

**1s and 2s vs 2s and 3s:** The toggle changes whether NBA three-point attempts score 2 or 3, and mid-range/paint shots score 1 or 2. Classic pickup uses 1s/2s. NBA broadcast version uses 2s/3s. Both are valid — user choice.

---

## PART 3 — In-Game Sign-Up Logic

### AI Player Sign-Up Decision

Players auto-decide whether to sign up when the window opens (simulated December 1 of each season). Decision formula:

```ts
function decidesToSignUp(player: Player, state: GameState): boolean {
  const annualSalary = player.contract.amount * 1000; // thousands → USD
  const prizePool = state.leagueSettings.allStarThronePrizePool ?? 5_000_000;
  const appearanceFee = prizePool * 0.05; // $250K on default prize pool

  // Players whose annual salary is less than 5× the prize pool will sign up for the money
  const cashMotivated = annualSalary < prizePool * 5;

  // High-morale / personality players sign up for glory regardless of salary
  const gloryMotivated = (player.moodTraits?.includes('competitive') || player.fame > 70);

  // Injured / high injury risk players opt out
  const injured = player.injury && player.injury.gamesRemaining > 0;

  return !injured && (cashMotivated || gloryMotivated);
}
```

**The key insight from brainstorming:** "If cash prize > their salary, they sign up." Role players and bench guys ($2M–$8M salaries) sign up because the $250K appearance + shot at $5M is real money. Superstars ($40M+) need glory/competitive trait override to join. This naturally creates a field skewed toward hungry mid-tier players + a handful of glory-hunting stars.

### Composite Vote (AI Simulation)

When no human input is available, auto-seed the field:

```ts
// Fan weight (40%): convertTo2KRating(p.overallRating) — fans vote for the best players
// Player weight (30%): peer respect = based on awards + All-Star selections in career
// Media weight (20%): storyline value = morale fame score + narrative hooks
// Coach weight (10%): 1v1 effectiveness = fg + tp + hnd + spd ratings composite
```

---

## PART 4 — In-Game Implementation Architecture

### The exact pattern to follow: DunkContest

The Dunk Contest is the clearest reference for how to hook a standalone interactive event into the All-Star weekend. The Throne follows the same three-layer model:

| Layer | Dunk Contest | The Throne |
|---|---|---|
| **Headless sim** | `AllStarWeekendOrchestrator.simulateDunkContest(state)` | `AllStarWeekendOrchestrator.simulateThroneTournament(state)` |
| **Result persisted on** | `state.allStar.dunkContest` | `state.allStar.throne` |
| **Action to save interactive result** | `SAVE_CONTEST_RESULT { contest: 'dunk', result }` | `SAVE_THRONE_RESULT { result }` |
| **AllStarView tab** | `'dunk'` → `<DunkContestView>` | `'throne'` → `<ThroneContestView>` |
| **"Watch it live" fullscreen overlay** | `watchingDunkContest` state → renders `<DunkContest ...>` in `fixed inset-0 z-[100]` div | `watchingThrone` state → renders `<TheThroneGame ...>` in same pattern |
| **Interactive component** | `src/components/allstar/allstarevents/` DunkContest | `src/throne/components/TheThroneGame/index.tsx` (already built) |

### Existing files — zero duplication needed

All simulation code already exists. No new engine needed.

| Existing file | Role in integration |
|---|---|
| `src/throne/engine/GameSim.ts` | Drop-in headless sim — instantiate directly, no hooks needed |
| `src/throne/engine/commentary.ts` | Commentary pools (do NOT replace) |
| `src/throne/types/throne.ts` | `Player`, `Match`, `GameState`, `GameSettings`, `GameStatus` |
| `src/throne/hooks/useGameSim.ts` | Used by the interactive watch mode only |
| `src/throne/hooks/useTournament.ts` | Used by the interactive watch mode only |
| `src/throne/components/TheThroneGame/index.tsx` | The full interactive UI — mount it fullscreen, same as DunkContest |
| `src/services/allStar/AllStarOneOnOneSim.ts` | **Already exists** — simpler 1v1 sim. Throne replaces it for Saturday when `allStarThroneEnabled`. |

### NBAPlayer → throne Player adapter

`GameSim.ts` uses `src/throne/types/throne.ts Player`, not `NBAPlayer`. One adapter function needed:

```ts
// src/services/allStar/throneOrchestrator.ts
import { Player as ThronePlayer } from '../../throne/types/throne';
import { NBAPlayer } from '../../types';
import { convertTo2KRating } from '../../utils/ratingUtils'; // or calculateK2 path

function toThronePlayer(p: NBAPlayer, seed: number): ThronePlayer {
  const r = p.ratings ?? {};
  return {
    id: p.internalId,
    name: p.name,
    firstName: p.name.split(' ')[0] ?? p.name,
    lastName: p.name.split(' ').slice(1).join(' ') || p.name,
    imgURL: p.imgURL ?? '',
    ovr: p.overallRating,
    pos: p.pos ?? 'F',
    team: String(p.tid),
    seed,
    ratings: {
      tp: r.tp ?? 50, fg: r.fg ?? 50, ins: r.ins ?? 50,
      dnk: r.dnk ?? 50, def: r.def ?? 50, spd: r.spd ?? 50,
      drb: r.drb ?? 50, blk: r.blk ?? 50, reb: r.reb ?? 50,
      jmp: r.jmp ?? 50, hgt: r.hgt ?? 50,
    },
  };
}
```

### GameSettings from commissioner toggles

`GameSim` takes a `GameSettings` object. Map from `state.leagueStats`:

```ts
const settings: GameSettings = {
  targetPoints: state.leagueStats.allStarThroneTargetScore ?? 12,
  winByTwo: true,
  makeItTakeIt: true,
  scoringSystem: state.leagueStats.allStarThroneScoring === '1s_and_2s' ? '1-2' : '2-3',
  isDoubleElim: false,
};
```

### Headless sim — `simulateThroneTournament(state)`

Lives in `src/services/allStar/throneOrchestrator.ts`. Pure function, no React, no hooks — just `GameSim` directly:

```ts
function runMatchSync(p1: ThronePlayer, p2: ThronePlayer, firstPossId: string, settings: GameSettings) {
  const sim = new GameSim(p1, p2, firstPossId, settings);
  let safety = 0;
  while (sim.getState().status !== GameStatus.FINISHED && safety++ < 2000) {
    sim.nextPossession();
  }
  return sim.getState();
}
```

Tournament loop:
1. Selects the field (16 players via composite vote / `convertTo2KRating` fallback)
2. Seeds them 1–16
3. Runs 4 rounds: top half picks opponent from bottom half (AI = weakest remaining seed), runs `runMatchSync`, records winner + point diff
4. Reseeds by cumulative PD after each round
5. Returns `Partial<GameState>` with `allStar.throne` populated

### Persistence shape

```ts
// state.allStar.throne
{
  complete: boolean;
  fieldPlayerIds: string[];           // 16 internal IDs after composite vote
  bracket: {
    round: number;                    // 1–4
    player1Id: string;
    player2Id: string;
    winnerId: string | null;
    score1: number;
    score2: number;
    pd: number;                       // winner's point diff for this match
  }[];
  cumulativePDs: Record<string, number>; // running PD per surviving player
  champion: { playerId: string; playerName: string } | null;
  beltHolderInternalId: string | null;   // persists across seasons in seasonRollover
}
```

`beltHolderInternalId` survives `seasonRollover.ts` — carry it forward so the defending champion gets a "👑 Defending King" callout on the AllStarView Throne tab.

### Watch mode — same flow as DunkContest (fresh sim, NOT prebaked replay)

Confirmed from reading `useDunkContest`: when you click "Watch", the contest runs a **fresh simulation** right then. It is NOT replaying stored results. The `complete` flag prevents re-watching after the first run.

The Throne follows this exactly:

1. User opens AllStar → Throne tab → clicks "Watch The Throne"
2. `TheThroneGame` mounts fullscreen — runs the tournament live via `GameSim`
3. On complete → `onComplete(result)` → `SAVE_THRONE_RESULT` writes to `state.allStar.throne`
4. `allStar.throne.complete = true` → the `!allStar?.throne?.complete` guard prevents remount
5. Post-complete: the Throne tab shows the static bracket/results from `state.allStar.throne`

If the user never watches (lazy sim or commissioner skips) → `AllStarWeekendOrchestrator.simulateThroneTournament(state)` runs headlessly the same way as `simulateDunkContest`.

### AllStarView integration (mirrors DunkContest exactly)

**In `AllStarView.tsx`:**

```tsx
// 1. Add to AllStarTab union
type AllStarTab = '...' | 'throne';

// 2. Add to tabs array
{ id: 'throne', label: 'The Throne', icon: Crown,
  hidden: !state.leagueStats.allStarThroneEnabled,
  locked: !allStar?.throneAnnounced && currentDate < dates.saturday }

// 3. Add watch state (same pattern as watchingDunkContest)
const [watchingThrone, setWatchingThrone] = useState(false);

// 4. Tab content
{activeTab === 'throne' && (
  <ThroneContestView
    allStar={allStar}
    players={state.players}
    ownTid={ownTid}
    onWatch={() => setWatchingThrone(true)}
  />
)}

// 5. Fullscreen overlay — same pattern as DunkContest (fixed inset-0 z-[100])
<AnimatePresence>
  {watchingThrone && !allStar?.throne?.complete && (() => {
    const fieldPlayers = (allStar?.throne?.fieldPlayerIds ?? [])
      .map((id: string) => state.players.find(p => p.internalId === id))
      .filter(Boolean);
    return (
      <div className="fixed inset-0 z-[100] bg-black">
        <TheThroneGame
          initialPlayers={fieldPlayers}
          settings={throneSettings}
          onClose={() => setWatchingThrone(false)}
          onComplete={(result) => {
            dispatchAction({ type: 'SAVE_THRONE_RESULT', payload: { result } });
            setWatchingThrone(false);
          }}
        />
      </div>
    );
  })()}
</AnimatePresence>
```

**`ThroneContestView.tsx`** (new file, mirrors `DunkContestView.tsx`):
- Pre-event: field of 16 cards with seeds + `convertTo2KRating` OVRs + "Watch The Throne" button
- Post-event: bracket tree + champion hero (portrait, belt icon, final score, point differential)
- Belt holder callout if `beltHolderInternalId` matches a prior season

### `AllStarWeekendOrchestrator.simulateWeekend` Saturday block

```ts
if (isSaturday) {
  // ... existing dunk/3PT/satellite events ...

  if (currentState.leagueStats.allStarThroneEnabled) {
    const throneUpdate = this.simulateThroneTournament(currentState);
    currentState = { ...currentState, ...throneUpdate };
  } else {
    const oneOnOneUpdate = this.simulateOneOnOneTournament(currentState);
    currentState = { ...currentState, ...oneOnOneUpdate };
  }
}
```

The Throne replaces `simulateOneOnOneTournament` on Saturday when the toggle is on.

### `SAVE_THRONE_RESULT` in `GameContext.tsx`

Add alongside `SAVE_CONTEST_RESULT` (line ~121):

```ts
if (action.type === 'SAVE_THRONE_RESULT') {
  const { result } = action.payload;
  setState(prev => {
    if (!prev.allStar) return prev;
    return { ...prev, allStar: { ...prev.allStar, throne: result } };
  });
  return;
}
```

---

## PART 6 — Award Integration

### Award written in `autoResolvers.ts → autoSimAllStarWeekend()`

Existing pattern (line ~603): dunk/3PT/MVP winners get pushed to `awardEntries[]`, then applied to players with dedup check. Add Throne winner the same way:

```ts
// In the awardEntries block alongside dunk/3PT:
if (allStarData?.throne?.champion?.playerId)
  awardEntries.push({
    internalId: allStarData.throne.champion.playerId,
    name: allStarData.throne.champion.playerName,
    awardType: 'The Throne',
  });
```

That's it. The existing loop that applies `awardEntries` to `state.players` handles matching by `internalId` with dedup.

### Award display in `PlayerBioView` (AwardsView.tsx)

The `AwardsView` component already renders any `award.type` string. Add an icon mapping entry so it gets a proper icon instead of the default fallback:

```ts
// In the icon mapping (around line 14-68 of AwardsView.tsx):
if (lowerType.includes('the throne')) return { icon: Crown, color: 'text-yellow-400', label: 'The Throne' };
```

The trophy case + career summary count will pick it up automatically — no other changes needed.

### Belt holder visual

`beltHolderInternalId` persists in `seasonRollover.ts`. On the Throne tab in AllStarView, show a "👑 Defending King" badge on the defending champion's player card. On PlayerBioView, the award list naturally accumulates one entry per season won.

---

## PART 7 — AllStarHistoryView Column

### Current columns

`Year | Winner | Score | MVP | Rising Stars MVP | Dunk | 3PT | Host`

### Add `Throne` column when enabled

The `Row` type in `AllStarHistoryView.tsx` (line ~120) needs a new field:

```ts
// Add to Row type:
throneWinner: { name: string; team: string } | null;
```

Populate it in the row-builder loop from `state.allStar.throne?.champion` for the current season, and from season history for past seasons (same way `dunkWinner` reads from stored history).

In the table header / cell:

```tsx
// Header — only render when leagueStats.allStarThroneEnabled
{state.leagueStats.allStarThroneEnabled && (
  <th className="...">Throne</th>
)}

// Cell
{state.leagueStats.allStarThroneEnabled && (
  <td className="...">
    {row.throneWinner?.name ?? <span className="text-zinc-600">—</span>}
  </td>
)}
```

Same conditional-hidden pattern as the `Celebrity Game` column (which uses `hidden: !state.leagueStats.celebrityGameEnabled`).

---

## PART 5 — Standalone Mini-Game Polish (`src/throne/`)

Polish tasks before the standalone graduates to in-game All-Star event. All live in the standalone code path — do not touch AllStar integration files.

### 1. Sim Round / Sim Tournament buttons

**Location:** `src/throne/components/TheThroneGame/index.tsx` — Bracket view, alongside existing "Next" button.

- **Sim Round** — calls `simCurrentRound()` (already exists at line ~147, runs all unplayed matches in `currentRound` synchronously via `runMatchSync`, then calls `advanceRound()`). Just needs a button wired to it and a guard that it's non-destructive (already-played matches are skipped in the existing loop).
- **Sim Tournament** — loops `simCurrentRound()` until `champion` is set, then transitions to `AppView.CHAMPION`.

Both should only render when there are unplayed matches in the current round.

### 2. `skipToEnd` safety cap — **already fixed**

The cap in `useGameSim.ts` is already 2000. ~~TODO item is done.~~ No action needed.

### 3. Richer play-by-play commentary

`GameSim.ts` already uses rating-gated pools: `dunkMake` for high-`dnk` players, `threeCreatorMake` vs `threeCatchMake` based on ball-handle, `stealLine` vs `selfTurnoverLine` split. The commentary system is already good.

Actual gap: the pool functions in `commentary.ts` each return a single hardcoded string. To make them richer, add 3–5 variants per function and pick randomly — no architectural change needed, just expand the string pools.

Example for `dunkMake` in `commentary.ts`:
```ts
// Before:
export const dunkMake = (name: string) => `${name} throws it down!`;

// After:
const DUNK_LINES = [
  (n: string) => `${n} throws it DOWN!`,
  (n: string) => `SLAMS it home — ${n} with the authority!`,
  (n: string) => `${n} goes up and DUNKS it!`,
  (n: string) => `Posterized. ${n} with the emphatic finish.`,
];
export const dunkMake = (name: string) => DUNK_LINES[Math.floor(Math.random() * DUNK_LINES.length)](name);
```

Apply same pattern to: `insideMake`, `midMake`, `threeCreatorMake`, `threeCatchMake`, `insideMiss`, `midMiss`, `threeMiss`, `blockLine`, `turnoverLine`, `stealLine`, `streakSuffix`, `gameEndNailBiter/Close/Dominant`.

### 4. 🎲 Dice button on Seeding screen

**Location:** `src/throne/components/TheThroneGame/index.tsx` — Seeding view, next to "Initialize Bracket" button.

Button calls `Fisher-Yates shuffle` on the `selectedPlayers` array to re-randomize seed order. Same visual pattern as the dunk/3PT contest confirm screens (a small secondary button with the 🎲 emoji).

### 4. Dice / randomize button on Seeding screen

Add a 🎲 button next to "Initialize Bracket" that re-randomizes seed order. Same dice-button pattern as the dunk/3PT contest minigame confirm screens.

---

## Open Questions

- **Belt design.** Physical trophy or new belt each year? Permanent vs annual redesign.
- **Broadcast home.** Standalone TNT/ESPN slot, or folded into existing All-Star Saturday block?
- **Year 1 founding participants.** Which 3–4 max-contract players get co-creator status?
- **Officiating standard.** Standard crew or dedicated tournament crew with adjusted foul calling?
- **Tiebreaker frequency.** If cumulative PD ties become common, does the flash-game tiebreaker hold up under broadcast pressure?
