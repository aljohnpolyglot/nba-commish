# Simulator Guide

## Overview

NBA Commish Sim has two game simulators:

- `Realistic` = possession-by-possession, stronger rotation feel, richer box-score timing
- `Fast` = stat-generator driven, cheaper for long sims, broader legacy hook coverage

Both modes use the same league state, schedule, rules, injuries, and save system. The difference is how one individual game is produced.

## Realistic

Use `Realistic` when you care about how a game feels.

- Runs a possession loop with live on-court units.
- Respects saved `Gameplan` and locked `Ideal Rotation` ordering/minutes before tip-off.
- Tracks actual played seconds and renders box scores in `MM:SS`.
- Uses live substitution logic with foul trouble, stretch fatigue, minute targets, role-compatible swaps, and closing-lineup bias.
- Generates highlights, DNP reasons, playing-hurt markers, mid-game injuries, and fights after the possession sim.

Best for:

- Watching games
- Checking whether your coaching rotation actually behaves correctly
- Playoff series
- Debugging realism issues in one team or one matchup

Tradeoffs:

- Slower than `Fast`
- Still lighter than a full play-by-play engine with explicit sets/matchups on every possession
- Some old stat-generator-only flavor still calibrates a bit differently in `Fast`

## Fast

Use `Fast` when you care about throughput.

- Builds the game from `StatGenerator/initial.ts` and `StatGenerator/coordinated.ts`.
- Pulls heavily from night-profile variance, pool-based rebounds/steals/blocks/assists, and existing stat-distribution knobs.
- Also respects coaching/gameplan context, but through aggregate stat generation rather than live on-court possessions.
- Shares the same downstream outputs: injuries, highlights, DNPs, advanced stats, game-winner, and stored box score.

Best for:

- Multi-day or multi-season sims
- Benchmarking distributions
- Large commissioner saves
- Background progression where exact on-court flow matters less than speed

Tradeoffs:

- Less tactile lineup flow
- Less natural substitution texture
- Minute patterns are generated, not played possession by possession

## What Both Modes Respect

- League rules from commissioner settings
- Team strength and roster quality
- Coaching/gameplan minute intent
- Training fatigue / play-through injuries
- Advanced stats and stored game results
- Post-game hooks like highlights and injury records

## Recommended Use

- `Realistic` for user-team games, playoffs, and "watch this matchup" sessions
- `Fast` for long calendar skips, AI-vs-AI bulk sim, and offseason throughput

## Known Gap

The defense coaching layer is still mid-rollout.

- `Defense Gameplan`
- `Defender Detail`
- `Rival Gameplan`
- `Matchup Assignments`

These systems exist in UI/persistence already, but their full possession-level wiring is still being expanded. See `TODO.md` "Coaching Phase 3 Sim-Wiring".
