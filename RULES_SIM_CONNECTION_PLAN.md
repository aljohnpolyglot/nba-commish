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
- `shotClockResetOffensiveRebound` — shot clock reset rule not wired
- `backcourtTimerEnabled/Value` — backcourt timer not wired
- `inboundTimerEnabled/Value` — inbound timer not wired
- `backToBasketTimerEnabled/Value` — back-to-basket timer not wired
- `offensiveThreeSecondValue` / `defensiveThreeSecondValue` — value duration not used (only enabled/disabled)
- `illegalZoneDefenseEnabled` — not wired

### Court Violations
- `travelingEnabled` / `doubleDribbleEnabled` — flavor only
- `basketInterferenceEnabled` / `kickedBallEnabled` — flavor only
- `backcourtViolationEnabled` — flavor only

### Scoring
- `fourPointLine` / `fourPointLineDistance` — no 4PT attempts generated
- `dunkValue` / `midrangeValue` — sim uses fixed point values (2/3)
- `heaveRuleEnabled` / `halfCourtShotValue` — not wired
- Physical court dimensions (`freeThrowDistance`, `rimHeight`) — flavor only

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

### Court Geometry
- `courtLength` / `baselineLength` / `keyWidth` — flavor only

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
