# Playoffs System — Architecture & Discovery Log

> "In fourteen-hundred-ninety-two, Columbus sailed the playoff view." — Claude, 2026

---

## Overview

The playoffs system covers three stages: **Play-In Tournament → First Round → Semis → Conf. Finals → NBA Finals**. All state lives in `state.playoffs` (a `PlayoffBracket` object on `GameState`). Everything — bracket generation, series advancement, bracket rendering — keys off that single object.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/playoffs/PlayoffGenerator.ts` | Generates the `PlayoffBracket` from final standings (called once on Apr 13) |
| `src/services/playoffs/PlayoffAdvancer.ts` | Advances series wins/losses, detects when a series is complete, promotes winner |
| `src/store/logic/gameLogic.ts` | Calls bracket generation + play-in injection; runs `PlayoffAdvancer` per game result |
| `src/store/logic/turn/simulationHandler.ts` | Runs bracket/play-in logic inside the day loop so lazy-sim crosses Apr 13-20 correctly |
| `src/components/playoffs/PlayoffView.tsx` | Full-screen view: header, bracket, detail panel, sim controls |
| `src/components/playoffs/bracket/` | Bracket UI components (see below) |
| `src/components/playoffs/detail/SeriesDetailPanel.tsx` | Side panel shown when a series card is clicked |

---

## `state.playoffs` — `PlayoffBracket` shape

```ts
interface PlayoffBracket {
  season: number;
  eastTop6: number[];        // tid[] seeded 1-6 East
  westTop6: number[];        // tid[] seeded 1-6 West
  playInGames: PlayInGame[]; // 6 games: E7v8 E9v10 Eloser W7v8 W9v10 Wloser
  playInComplete: boolean;   // true once all 6 play-in games resolve
  series: PlayoffSeries[];   // R1(8) + R2(4) + CF(2) + Finals(1) = up to 15
  currentRound: 1|2|3|4;
  round1Injected: boolean;
  bracketComplete: boolean;
}
```

### Series IDs (hardcoded convention)

| Round | West IDs | East IDs | Finals |
|-------|----------|----------|--------|
| R1 | WR1S1–WR1S4 | ER1S1–ER1S4 | — |
| R2 (Semis) | WR2S1–WR2S2 | ER2S1–ER2S2 | — |
| Conf Finals | WR3S1 | ER3S1 | — |
| Finals | — | — | Finals |

### Play-In Game IDs

`W7v8`, `W9v10`, `Wloser`, `E7v8`, `E9v10`, `Eloser`

---

## Timeline & Trigger Dates

| Date | Event |
|------|-------|
| Apr 12, 2026 | Last regular-season game |
| Apr 13, 2026 | `PlayoffGenerator` fires (`bracket` trigger ≥ Apr 13) |
| Apr 15–19, 2026 | Play-In games injected into schedule |
| Apr 20, 2026 | `playInComplete` becomes true; R1 injected |
| Apr 22, 2026 | Round 1 begins |

### Lazy-sim guard (critical)

`simulationHandler.ts` runs bracket generation + play-in injection + `PlayoffAdvancer` **inside the day loop** — not just at turn end. Without this, `SIMULATE_TO_DATE` that skips Apr 13-20 would generate no bracket and miss all play-in games. Fixed in session 5 (2026-03-29).

---

## Bracket UI Components (`src/components/playoffs/bracket/`)

### `BracketLayout.tsx`
Top-level scroll container. Renders all columns left-to-right:
```
[West Play-In] [West R1] [West Semis] [West Finals] [NBA Finals] [East Finals] [East Semis] [East R1] [East Play-In]
```
- Uses `motion/react` staggered entry animations
- Left/right scroll arrow buttons (hidden on mobile)
- `min-w-max` inner container → horizontal scroll on small screens
- Shows `TBDColumn` placeholders before `playInComplete`
- Trophy icon floats above NBA Finals column

### `BracketColumn.tsx`
Generic column for regular playoff rounds. Props:
- `label` + `labelColor` — header text (`text-blue-400` West, `text-red-400` East, `text-amber-400/80` Finals)
- `seriesIds[]` — ordered list of series IDs to render in this column
- `justify` — `space-between` (R1), `space-around` (Semis), `center` (Finals)
- `baseDelay` — stagger offset for entry animations
- `seriesLabels` — override TBD placeholder text per series

### `SeriesCard.tsx`
Individual matchup card. Matches the reference Matchup design:
- `w-48 shrink-0`, `bg-[#0f131c]`
- Two `TeamRow` sub-components (`bg-[#131823]`): seed + logo (`w-7 h-7`) + abbrev + wins
- Footer bar: "TEAM WINS 4-1", "GAME 3 · TODAY", date, or "NOT STARTED"
- Border pulses `border-indigo-500/40` on active gameday
- `motion.button` with `scale: 0.95 → 1` entry animation
- `ring-1` highlight when selected

### `PlayInCard.tsx`
Same card design as `SeriesCard` but for `PlayInGame`. Shows actual game score when played. Label shown in footer before game starts (e.g. "7 VS 8", "LOSER GAME").

### `PlayInColumn.tsx`
Simplified column: **3 stacked `PlayInCard`s** with `gap-4` (top=7v8, middle=loserGame, bottom=9v10). No connector lines. Matches the reference design.

---

## `PlayoffView.tsx` — Controls

| Control | Action |
|---------|--------|
| **Sim Play-In** (before playInComplete) | `SIMULATE_TO_DATE` → `'2026-04-20'` (hardcoded end for all 3 play-in games) |
| **Sim [Round]** (after playInComplete) | `SIMULATE_TO_DATE` → last unplayed game date in current round |
| **Sim All Playoffs** | `SIMULATE_TO_DATE` → `'2026-06-30'` |
| **Click series card** | Opens `SeriesDetailPanel` in right panel |
| **Watch Game** | Full-screen `GameSimulatorScreen` |

---

## `SeriesDetailPanel`

Located at `src/components/playoffs/detail/`. Shows:
- Series record + home/away split
- Per-game box score tiles (click to open `BoxScoreModal`)
- **Watch next game** button (only if game is today)
- Team stats comparison

---

## `PlayoffAdvancer.ts` — How series complete

On each simulated game result:
1. Match `game.playoffSeriesId` → find series
2. Increment `higherSeedWins` or `lowerSeedWins`
3. If either hits `gamesNeeded` (4): set `winnerId`, `status = 'complete'`
4. Inject next-round game via `PlayoffGenerator.injectNextRoundGame()`
5. When all 8 R1 series done → increment `currentRound`, inject R2 games
6. Repeat through Conf Finals → Finals

---

## Known Quirks / Watch-outs

- **Series IDs are hardcoded strings** (WR1S1, ER2S2, etc.) — they're not derived from team IDs. This means team lookup always goes through `series.higherSeedTid` / `series.lowerSeedTid`, never from the ID string.
- **`playInComplete` gate**: `BracketLayout` and `PlayoffView` both branch heavily on `playInComplete`. Before it's true, all R1-Finals columns show TBD placeholders.
- **Lazy sim crossing Apr 13**: Must run `PlayoffGenerator` and `PlayoffAdvancer` inside `simulationHandler`'s day loop — not just in `gameLogic.ts` at turn end.
- **Play-in game teams**: `loserGame` teams (team1Tid, team2Tid) are injected by `PlayoffGenerator` once `W7v8`/`W9v10` resolve. Before that, both tids will be `0` or `-1`.
- **`bracketComplete`**: Set when `Finals` series status = `'complete'`. No further advancement logic runs after this.
