# Travel Fatigue + Route Visualization

**Status:** Planned design doc

**Inspiration:** https://cypherpoet.github.io/THREE-JS-NFL-Flight-Paths/

## Summary

The repo already has two halves of this feature:

- a **travel budget / comfort** layer (`travelPreferences`, travel ledger cost, travel UI)
- a **fatigue-sensitive simulation** layer (`trainingFatigue` affects ratings, injuries, and progression)

The missing piece is the bridge between them.

This document proposes a narrow v1:

1. compute **travel stress** from the schedule
2. convert that stress into small `trainingFatigue` deltas
3. surface the result in Schedule / Front Office
4. add a route visualization after the mechanic feels good

The key principle is simple: **do not invent a second big fatigue system if `trainingFatigue` already does the job.**

## Why this fits the repo

Existing hooks already support this direction:

- `src/services/training/trainingTick.ts`
  daily `trainingFatigue` accumulation / decay
- `src/utils/playerRatings.ts`
  fatigue lowers effective ratings
- `src/services/simulation/InjurySystem.ts`
  fatigue raises injury risk
- `src/services/simulation/GameSimulator/engine.ts`
  fatigue impacts fast-sim team strength and in-game injury rolls
- `src/services/simulation/realistic/RealisticEngine.ts`
  fatigue impacts realistic-engine injury exposure
- `src/components/central/view/FrontOffice/sections/TravelSection.tsx`
  already sells the fantasy: premium travel reduces road fatigue
- `src/components/tycoon/TravelLogisticsCard.tsx`
  explicitly says recovery/fatigue impact is a future update

That means travel fatigue is a systems-integration task, not a new simulation stack.

## Goals

- Make travel matter without dominating outcomes
- Reward premium travel standards with measurable but modest gains
- Make road stretches legible in the UI
- Reuse existing fatigue and schedule systems
- Create a clean substrate for later route-map visuals

## Non-goals

- No giant v1 Three.js globe dependency
- No second persistent fatigue meter separate from `trainingFatigue`
- No arcade penalties that swing games by themselves
- No mandatory per-player itinerary micromanagement

## Core model

### 1. Travel stress sources

Each away segment produces a small `travelStress` score. Suggested inputs:

- **Distance band**
  short / medium / long trip
- **Timezone shift**
  0 / 1 / 2 / 3+ zones crossed
- **Rest disadvantage**
  road back-to-back, 3-in-4, 4-in-6
- **Altitude**
  Denver-style bump
- **International travel**
  preseason / cup / Euro-style long-haul spike
- **Return-home recovery**
  modest relief on long homestands or off-days after travel

### 2. Travel standards mitigation

Use the existing `travelPreferences` stars:

- `flight` softens long-haul and timezone stress
- `hotel` softens overnight recovery loss
- `bus` softens short domestic turnaround stress

Average comfort should not erase bad scheduling. It should only shave the edges off.

### 3. Convert stress into fatigue

Do not store a new player-facing meter first.

Instead, transform travel stress into a small additive modifier on the daily fatigue tick:

- no travel: normal `trainingFatigue` behavior
- rough road leg: `+0.5` to `+2.0` style fatigue bump
- severe spot: capped extra bump
- premium travel: reduce the bump, never fully cancel it

This keeps the whole feature inside the current sim logic:

- lower effective ratings
- slightly higher injury risk
- slower development when players stay worn down

### 4. Team-level, not player-level, in v1

V1 should apply one travel profile per team per day, not custom travel stress per player.

That keeps the system cheap, readable, and stable. Injured players, stars, and vets already diverge later because the fatigue-sensitive systems downstream are player-aware.

## Proposed formulas

These are starting points, not final balancing:

### Travel stress per trip

```ts
travelStress =
  distanceStress
  + timezoneStress
  + scheduleCompressionStress
  + altitudeStress
  + internationalStress
  - travelComfortMitigation
```

### Daily fatigue application

```ts
extraFatigueDelta = clamp(travelStress * 0.8, 0, 4)
```

Applied on the relevant day windows:

- arrival day before game
- second night of B2B after travel
- optionally reduced carryover next day

### Comfort mitigation

```ts
travelComfortMitigation =
  flightWeight * normalizedFlight
  + hotelWeight * normalizedHotel
  + busWeight * normalizedBus
```

Keep mitigation intentionally smaller than raw stress.

## Data requirements

### Required for v1

- team city / arena coordinates for all NBA teams
- helper to estimate trip distance and timezone delta between consecutive games

The type layer already allows `lat` / `lng` on expansion specs. The main missing piece is a clean canonical coordinate source for active team travel calculations.

### Optional later

- altitude flags per arena
- international route metadata
- cached season travel summaries

## UI surfaces

### Schedule

Add light-weight travel context:

- `B2B`
- `3 in 4`
- `Cross-country`
- `Jet lag risk`
- `High-altitude road game`

This belongs in schedule cards, day view, and team-side previews.

### Front Office / Travel

Promote travel from flavor text to real ops:

- projected season miles
- toughest road stretch
- average rest disadvantage
- travel recovery grade
- expected fatigue impact by current travel standards

### Training dashboard

Show when fatigue is being driven by travel, not just practice intensity:

- `Fatigue rising: 4-game road swing`
- `Recovery boost: 3 home games`

### Route visualization

V1 visual should be **team-centric**, not globe-first:

- season route map for one team
- arcs between consecutive games
- color by fatigue severity
- scrub by month or road trip

A full 3D globe is a phase-2 polish item after the mechanic is proven.

## Implementation plan

### Phase 1 — Travel substrate

- add a travel calculator module
- resolve coordinates for NBA teams / arenas
- compute trip distance, timezone delta, and schedule compression

Suggested file:

- `src/services/travel/travelFatigue.ts`

### Phase 2 — Sim integration

- feed travel stress into `trainingFatigue` daily updates
- keep all logic behind one helper so balancing is centralized

Primary touchpoint:

- `src/services/training/trainingTick.ts`

### Phase 3 — UI visibility

- schedule badges
- travel summary card
- fatigue source messaging

Primary surfaces:

- `src/components/schedule/...`
- `src/components/central/view/FrontOffice/sections/TravelSection.tsx`
- `src/components/training/...`

### Phase 4 — Visualization

- build 2D or light 3D route explorer
- only after Phase 2/3 produce fun gameplay

Possible surfaces:

- dedicated travel page
- schedule overlay
- team-office map card

## Balancing guardrails

- Travel should be a **margin system**, not a hard override
- A brutal trip should matter across several games, not as a giant single-game nerf
- Premium travel should feel worth paying for, but never become a win button
- Home-heavy stretches should recover fatigue, but not zero out poor training decisions

## Risks

### Risk: double-counting fatigue

Travel and training can stack too hard if both add aggressive fatigue on the same day.

Mitigation:

- keep travel deltas small
- cap additive spikes
- test B2B and long-road-trip edge cases first

### Risk: data quality

Bad coordinates create bad distances and fake jet-lag signals.

Mitigation:

- centralize team coordinate data
- avoid scattered per-component maps

### Risk: visual-first distraction

A globe can ship before the mechanic is useful.

Mitigation:

- mechanic first
- route visual second

## Open questions

- Should v1 calculate travel by **team city** or by **arena location**?
- Does the feature apply only to NBA saves first, or also to Euro/PBA isolated modes?
- Should altitude be a hidden multiplier or a visible schedule badge?
- Should AI teams adjust `travelPreferences` strategically in future seasons based on budget pressure?

## Recommendation

Build this in the following order:

1. travel-stress calculator
2. fatigue integration through `trainingFatigue`
3. schedule / front-office visibility
4. route-map visual
5. optional full 3D globe

The route map is what makes the feature feel cool. The fatigue bridge is what makes it belong in this game.
