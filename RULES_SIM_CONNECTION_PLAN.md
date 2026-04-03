# Rules → Sim Connection Plan

Tracks which commissioner rule settings are wired to the simulation engine
vs. stored-only (flavor/UI only). Update this file as new rules get wired.

> **How to wire a new rule — step-by-step guide, file list, and common mistakes:**
> see **[LEAGUE_RULES_README.md](./LEAGUE_RULES_README.md)**

**Engine entry point:** `SimulatorKnobs` → `engine.ts` `leagueBaseKnobs` →
passed to `StatGenerator.generateStatsForTeam` + `generateCoordinatedStats`.

---

## ✅ WIRED — rule changes actually affect sim output

| Rule field (`leagueStats.*`) | Knob(s) affected | Effect |
|---|---|---|
| `quarterLength` | `quarterLength` | Scales total minutes budget; shorter = fewer stats |
| `shotClockValue` | `paceMultiplier` | `24/value` → 1.0 at 24s, 2.0 at 12s, capped 2.0× |
| `shotClockEnabled = false` | `paceMultiplier` | 0.78× pace (slow-down ball era) |
| `threePointLineEnabled = false` | `threePointAvailable`, `threePointRateMult` | No 3PA generated; shots redistributed to 2PT |
| `defensiveThreeSecondEnabled = false` | `rimRateMult` ×0.72, `threePointRateMult` ×1.22 | Paint clogged → fewer rim drives, more perimeter |
| `offensiveThreeSecondEnabled = false` | `lowPostRateMult` ×1.35, `rimRateMult` ×1.15 | Post camping → more post-ups + rim via post |
| `handcheckingEnabled = true` | `ftRateMult` ×0.82 | Refs swallow contact fouls → ~18% fewer FTA |
| `goaltendingEnabled = false` | `blockRateMult` ×1.6, `efficiencyMultiplier` ×0.93 | Defenders swat freely at rim → more blocks, lower eFG% |
| `chargingEnabled = false` | `rimRateMult` ×1.12 | No charge calls → aggressive rim drives |
| `noDribbleRule = true` | `paceMultiplier` ×0.72, `rimRateMult` ×0.65, `threePointRateMult` ×1.40 | Catch-and-shoot only → slow/perimeter game |
| `shotClockResetOffensiveRebound = false` | `paceMultiplier` ×0.88 | Off-reb doesn't reset clock → fewer possessions |
| `backcourtTimerEnabled = false` | `paceMultiplier` ×0.90, `tovMult` ×0.85 | No backcourt pressure → slower game, fewer forced TOs |
| `backToBasketTimerEnabled = true` | `lowPostRateMult` ×0.90 | Post timer forces quicker decisions → fewer deep post plays |
| `illegalZoneDefenseEnabled = false` | `rimRateMult` ×0.90, `threePointRateMult` ×1.10 | Zone clogs paint → fewer drives, more perimeter |
| `illegalZoneDefenseEnabled = true` | `rimRateMult` ×1.05 | Mandatory man-to-man → more dribble penetration (guard — NBA default already here) |
| `travelingEnabled = false` | `tovMult` ×0.88 | No travel calls → fewer turnovers |
| `doubleDribbleEnabled = false` | `tovMult` ×0.90 | No double-dribble calls → fewer turnovers |
| `backcourtViolationEnabled = false` | `tovMult` ×0.92 | No backcourt calls → fewer turnovers |
| `freeThrowDistance` (default 15 ft) | `ftEfficiencyMult = clamp(15/dist, 0.65–1.0)` | Farther line → harder shots → lower FT% |
| `rimHeight` (default 10 ft) | `efficiencyMultiplier` × `clamp((10/h)^1.5, 0.5–1.0)` | Taller rim → lower overall FG efficiency |
| `courtLength` (default 94 ft) | `paceMultiplier` × `(94/len)^0.4`, `tovMult` × `(94/len)^0.2` | Bigger court → slower pace, more spacing → fewer TOs |
| `baselineLength` (default 50 ft) | `paceMultiplier` × `(50/baseline)^0.3` | Wider court → slightly slower pace |
| `keyWidth` (default 16 ft) | `lowPostRateMult` × `(16/w)^0.5`, `rimRateMult` × `(16/w)^0.3` | Wider key → harder to camp paint → fewer post/rim plays |

**Note:** All rule multipliers stack with each other (they multiply, not add).
Combined extreme rules (e.g. no shot clock + no 3PT + no goaltending) produce
intentionally chaotic results — that's the point.

---

## ❌ STORED ONLY — saved to leagueStats but engine ignores them

### Game Structure
- `gameFormat` (timed vs target_score) — engine always uses timed format
- `numQuarters` — hardcoded 4 quarters
- All overtime settings (`overtimeDuration`, `overtimeTargetPoints`,
  `overtimeType`, `maxOvertimes`, `overtimeTieBreaker`) — engine uses its own OT logic

### Timing Violations
- `inboundTimerEnabled/Value` — inbound timer not wired
- `offensiveThreeSecondValue` / `defensiveThreeSecondValue` — value duration not used (only enabled/disabled)
- `backcourtTimerValue` — timer value duration not used (only enabled/disabled)
- `backToBasketTimerValue` — timer value duration not used (only enabled/disabled)

### Court Violations
- `basketInterferenceEnabled` / `kickedBallEnabled` — flavor only

### Scoring
- `fourPointLine` / `fourPointLineDistance` — no 4PT attempts generated
- `dunkValue` / `midrangeValue` — sim uses fixed point values (2/3)
- `heaveRuleEnabled` / `halfCourtShotValue` — not wired

### Fouls & Limits
- `foulOutLimit` / `teamFoulPenalty` — not tracked per-player during sim
- `flagrantFoulPenaltyEnabled` / `clearPathFoulEnabled` / `illegalScreenEnabled`
  / `overTheBackFoulEnabled` / `looseBallFoulEnabled` — flavor only
- `techEjectionLimit` / `flagrant1EjectionLimit` / `flagrant2EjectionLimit` — not wired
- `fightingInstantEjection` / `useYellowRedCards` — UI flavor only (FightGenerator is separate)

### Personnel & Subs
- `maxPlayersOnCourt` — hardcoded 5-on-5
- `substitutionLimitEnabled` / `maxSubstitutions` — not wired
- `multiballEnabled` / `multiballCount` — flavor only

---

## 🚧 FUTURE WIRING IDEAS (not started)

| Rule | Sim idea |
|---|---|
| `foulOutLimit` (e.g. 4 instead of 6) | Pull star players earlier → `starMpgOverride` reduction |
| `maxPlayersOnCourt` (e.g. 4-on-4) | Adjust minutes budget total (4×48 instead of 5×48) |
| `fourPointLine = true` | Add 4PA bucket at ~0.05× 3PA rate; value = 4 pts |
| `heaveRuleEnabled` | Add end-of-quarter heave FGA pool with ~10% FG% |
| `dunkValue = 3` | Bump fgm value for interior shots |
| `overtimeTargetPoints` | Target-score OT format in quarters sim |

---

## Architecture

```
simulationRunner.ts
  → simulateGames() [simulationService.ts]
    → GameSimulator.simulateDay() [engine.ts]
        builds leagueBaseKnobs from leagueStats fields (all wired rules)
        exhibition presets (All-Star/Rising Stars/Celebrity) OVERRIDE entirely
        regular games: leagueBaseKnobs + per-team standingsCtx
        calls generateStatsForTeam() → applies knobs to shot location, pace, FT rate
        calls generateCoordinatedStats() → applies blockRateMult to block pool
```

Exhibition presets bypass all commissioner rules — `KNOBS_ALL_STAR` etc. are hardcoded.
To make All-Star game respect commissioner rules, set `allStarMirrorLeagueRules = true`
and pass `leagueBaseKnobs` as the base for the All-Star knob merge (not done yet).
