# Euro-Mode Hybrid-Setup + Smart Staff-Generator — Design

**Date:** 2026-05-14
**Component scope (mine):**
- New: `src/components/setup/EuroSetupReviewScreen.tsx` (+ Edit-Modals)
- New: `src/services/euro/careerSeed.ts`, `tierBudgetSeed.ts`, `staffSeed.ts`, `ownerSeed.ts`, `sponsorSeed.ts`, `nationalityPool.ts`
- Modified: `src/services/staff/staffFallback.ts` (drop hardcoded `FOREIGN_COACH_POOL`, accept dynamic nationality pool)
- Modified: `src/components/setup/LeagueTypeSelector.tsx` (hand off to review screen instead of starting directly)
- Modified: `src/types.ts` (add `OwnerProfile`, optional `NBATeam.ownerProfile` / `startingTier` / `startingBudget`, optional `GameState.staffFreeAgents` / `euroSetupSeed`)
- Modified: `src/store/logic/initialization.ts` or equivalent reducer (handle `INIT_EURO_CAREER` action; LOAD_GAME migration heal)
- Modified: `src/services/seasonRollover.ts` (Owner Patience-Tick, Vision-Pressure evaluation)
- Modified: `src/components/central/view/FrontOffice/StaffSigning/*` (last-resort generation when pool empty for selected role; persistent pool consumption)

**Read-only interface (parallel agent's scope, do not modify):**
- `src/data/sponsorCatalogFetcher.ts` (called via stable function signature)
- `src/utils/sponsorLogos.ts`
- `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx`
- `src/components/tycoon/SponsorshipNegotiationModal.tsx`
- `src/services/tycoon/specs/spain.ts`

**Out of scope:**
- NBA-Mode owner mechanics (schema allows future port; this PR fills Euro-Mode only).
- New sponsor data / logos / Next-Action button wiring (parallel agent owns).
- Coaching staff effect on sim outcomes beyond what already exists.
- Auto-fire animations / cinematics for Owner Game-Over.

## Problem

Two pain points reported by the user:

1. **Euro-Mode career start is a black box.** Picking a team in `LeagueTypeSelector` drops the user into the game with auto-generated coach/owner/budget/sponsors that they never see or get a chance to alter. The user wants a "review-and-tweak" moment with one-click defaults and per-field reroll/edit before committing.

2. **Hire-Staff flow is unusable after sim drain.** `StaffSigningModal` accepts a `pool: StaffCandidate[]` from outside. AI teams hire from the same pool during sim, so by the time the user opens "Hire Staff Member" the pool is empty and only the "Sign" button exists with nothing meaningful to select. Additionally, the underlying `staffFallback.ts` carries a hardcoded `FOREIGN_COACH_POOL` country list that does not scale when the player dataset changes (new leagues, swapped gists).

The two are linked: the new hybrid setup screen replaces the initial hire flow (so the user starts with 6/6 staff filled and never sees the broken pool screen on day 1), and the smart generator + persistent pool + last-resort generation make the in-game "Hire Replacement" flow viable for the rest of the save.

## Goals

- Euro-Mode start ends on a single **review screen** with 4 cards (Tier+Budget, Staff 6/6, Owner, Sponsors 3/3). Every card has 🎲 reroll-card and ✏️ edit-modal; a footer reroll-everything + start-career.
- Generation is **deterministic** per team: same master-seed → same bundle. Per-card sub-seeds let reroll mutate one card without touching the others.
- **Manual edits persist through reroll** — a user-edited coach name survives 🎲-reroll until "Clear Override" is clicked.
- Staff/Owner **nationality distribution is derived from the actual league player pool** (TID-offset-aware filter), not a hardcoded list. Falls back to a fixed pool if the player dataset is too small.
- Owner has **three game-affecting attributes** (Patience, Wealth, Vision) that hook into existing systems (Bankruptcy/Game-Over modal, season-end evaluation), not pure flavor.
- After save start, the in-game "Hire Staff Member" flow stays functional: a **persistent free-agent staff pool** absorbs AI drain, monthly refill keeps it stocked, and a **last-resort on-demand generation** guarantees ≥3 candidates exist whenever the modal opens.
- All changes are **backward-compatible** for existing Euro-Mode saves: optional fields, LOAD_GAME-heal with a persistent seed-flag (per CLAUDE.md rule 10).

## Non-Goals

- A wizard with multiple screens (the user explicitly chose Hybrid over Wizard).
- GM attributes — the user is the GM in Euro-Mode, so no `GMAttributes` are surfaced on the review screen.
- Replacing synthetic names with real-world coach names (curated DB was rejected as too high-effort).
- New sponsor catalog data or new logo plumbing — parallel agent owns that.
- Per-position coaching effects (Assistant-vs-HeadCoach impact on sim) beyond what `staffFallback` already exposes.

## Design

### 1. High-level flow

```
LeagueTypeSelector (pick league + team)
        │
        ▼
seedEuroCareer(teamId, leagueId, masterSeed)        ← deterministic
        │
        ▼
EuroSetupReviewScreen (single screen, 4 cards)
   - per-card 🎲 reroll  → rerollCard(seed, card, newSubSeed)
   - per-card ✏️ edit     → writes to manualOverrides
   - footer "Start Career"
        │
        ▼
dispatch INIT_EURO_CAREER { seed, overrides } → reducer applies
   - team.ownerProfile, startingTier, startingBudget set
   - 6 staff members written to state.staff for the user team
   - state.staffFreeAgents seeded with ~50 entries (drained later by AI)
   - state.euroSetupSeed memo persisted
   - autoOwnerSeeded: true flag set
```

### 2. Review-screen layout

Single screen, 1-col mobile / 2-col desktop, four cards:

```
┌────────────────────────────────────────────────────┐
│  REVIEW YOUR FRONT OFFICE                          │
│  Real Madrid · Liga Endesa · 2026-27               │
├──────────────────────────┬─────────────────────────┤
│ 🏆 TIER & BUDGET     🎲 │ 👔 STAFF (6/6)     🎲 ✏️ │
│ POWERHOUSE              │ HC  A.Apostolidis  ⭐⭐⭐⭐ │
│ €42M / season           │ AC  M.Tomić        ⭐⭐⭐   │
│ "Title-or-bust"         │ HoSS L.Ivić        ⭐⭐⭐   │
│ ✏️ Tier · ✏️ Budget     │ Phy R.Pérez        ⭐⭐    │
│                         │ Sct N.Vukčević     ⭐⭐⭐   │
│                         │ Ana D.Kostas       ⭐⭐⭐⭐ │
├──────────────────────────┼─────────────────────────┤
│ 💼 OWNER             🎲 │ 💰 SPONSORS (3/3)   🎲   │
│ Florentino Pérez        │ Main  Adidas    €8M/3y   │
│ 🇪🇸 Spain               │ Jersey BBVA     €4M/2y   │
│ Wealth: Billionaire     │ Arena Mahou     €2M/1y   │
│ Patience: Long-Term     │ ✏️ Edit Slot             │
│ Vision: Win-Now         │                          │
│ ✏️ Edit Profile         │                          │
└──────────────────────────┴─────────────────────────┘
       [ 🎲 Reroll Everything ]   [ ✓ Start Career ]
```

Reroll/Edit semantics:
- Card 🎲 → new sub-seed for that card only; manual overrides on that card cleared after a confirmation prompt
- Footer 🎲 → new master-seed; all cards regenerated; overrides cleared after confirmation
- ✏️ on any field opens a small edit modal (text input for names, dropdowns for tier/wealth/patience/vision, slider for budget and sponsor amounts); writes to `manualOverrides`
- After ✏️-edit, the affected field shows a small "🔒 manual" badge and survives subsequent 🎲-rerolls

Edit-modals use existing `src/components/shared/` primitives (Verbatim-Reuse rule from memory) — e.g. coach replacement uses a `PlayerSelectorGrid`-style grid with `maxSelections={1}`.

### 3. Auto-seed pipeline

```
services/euro/
  ├─ careerSeed.ts          ← orchestrator + types + Reroll-Helper
  ├─ tierBudgetSeed.ts      ← Tier label + Budget range
  ├─ staffSeed.ts           ← 6 roles (HC/AC/HoSS/Phy/Sct/Ana); re-uses staffFallback
  ├─ ownerSeed.ts           ← OwnerProfile generator (new)
  ├─ sponsorSeed.ts         ← 3 slots; calls parallel-agent's getDefaultSponsorsForTeam()
  └─ nationalityPool.ts     ← player-pool-derived country distribution + cache
```

Public API:
```ts
type EuroCareerSeed = {
  masterSeed: number;
  tier: 'Powerhouse' | 'Established' | 'MidTier' | 'Underdog';
  budget: number;
  staff: StaffMember[];          // 6 entries: HC, AC, HoSS, Phy, Sct, Ana
  owner: OwnerProfile;
  sponsors: SponsorSlot[];       // 3 entries: Main, Jersey, Arena
  manualOverrides: Partial<{
    tier: ...; budget: number; staff: Record<role, StaffMember>;
    owner: Partial<OwnerProfile>; sponsors: Record<slotId, SponsorSlot>;
  }>;
};

seedEuroCareer(teamId: number, leagueId: string, masterSeed: number): EuroCareerSeed;
rerollCard(seed: EuroCareerSeed, card: 'tier'|'staff'|'owner'|'sponsors', newSubSeed: number): EuroCareerSeed;
applyOverride<K extends keyof EuroCareerSeed['manualOverrides']>(seed, key, value): EuroCareerSeed;
```

Determinism rule: sub-seed = `hash(masterSeed, cardKey)`. Same master-seed always reproduces same bundle. Card reroll mutates only one sub-seed.

**Tier-Berechnung default** (before any reroll):
- Real-world standing read from `state.history` (prior season W-L) if present, else from a curated `TEAM_PRESTIGE_HINT: Record<teamAbbrev, Tier>` table seeded for the launch leagues (Endesa, Euroleague)
- Tier sets budget multiplier (Powerhouse ×1.5 / Established ×1.0 / MidTier ×0.7 / Underdog ×0.5) against the league budget baseline (already exists in `services/tycoon/specs/<league>.ts`)
- Tier also sets owner-patience baseline (intentionally dramatic: Powerhouse defaults to Win-Now+TriggerHappy because expectations outpace any "safe" plan)

### 4. Nationality pool + staff-pool refill

`nationalityPool.ts`:
```ts
buildCoachNationalityPool(state: GameState, leagueId: string):
  { country: string; weight: number }[];
```
- Filter `state.players` by league TID range (Endesa: [5000, 5100); Euroleague: [1000, 1100); WNBA: [3000, 3100); etc. — per CLAUDE.md TID-offset rule)
- Group by `player.born.loc` → frequency map
- Top-15 countries, weights normalized to sum=1
- Cache key: `${leagueId}-${state.players.length}` (cheap invalidator; if a load swaps the player set the cache rebuilds)
- Fallback: if filtered set <30 players → the existing hardcoded `FOREIGN_COACH_POOL` in `staffFallback.ts` (Serbia, Lithuania, Greece, Italy, USA, Croatia, Turkey, France, Slovenia, Spain) is reused as the fallback pool. The hardcoded list stops being the *primary* source but stays as last-resort so generation never produces "Unknown"

`staffFallback.ts` updated: `pickCountry()` accepts an optional `pool` arg; passed in from `staffSeed.ts` with the league-derived pool. The hardcoded `FOREIGN_COACH_POOL` becomes the fallback pool only.

**Pool lifecycle (Hybrid: persistent + Last-Resort):**

| Phase | Action |
|---|---|
| `INIT_EURO_CAREER` | Seed `state.staffFreeAgents` with ~50 members (mixed roles, nationality from pool). Persist `staffPoolSeeded: true` to avoid double-seed on LOAD_GAME |
| AI-Hire (existing or new flow) | AI removes from `staffFreeAgents` when signing |
| Monthly tick (`monthlyTick.ts`) | Append 5–10 fresh candidates with current-month seed |
| User opens Hire-Modal | Filter pool by selected role; if `count < 3` → on-the-fly generate `3 - count` more "Emergency Hire" candidates (marked `isLastResort: true`, UI shows a small badge "Limited Options — emergency hire") |
| User signs | Remove from pool, write to `state.staff`. Last-resort hires get a small reputation handicap (cap at 60) to discourage abuse |

Reputation now **tier-coupled**: `repBase = tier === 'Powerhouse' ? 70 : 'Established' ? 60 : 'MidTier' ? 55 : 50`; add `randomJitter(0, 20)`. Bigger clubs pull bigger names.

### 5. Owner mechanics

Data model:
```ts
type OwnerProfile = {
  name: string;
  nationality: string;
  face: any;                              // facesjs config (per faces-for-staff memory)
  wealthTier: 'LocalWealthy' | 'NationalMagnate' | 'Billionaire';
  patience: 'TriggerHappy' | 'Steady' | 'LongTerm';
  vision: 'WinNow' | 'Develop' | 'Frugal';
  cashInjectionUsedThisSeason: boolean;     // resets at season rollover
  seasonsSinceLastInjection: number;        // for NationalMagnate cooldown
  consecutiveBadSeasons: number;
};
```

Lives on `NBATeam.ownerProfile?: OwnerProfile` (optional; no schema break for NBA-only saves).

Three live hook-points:

**A) Patience → Game-Over trigger** (in `seasonRollover.ts`)
- After season-end stats are written, run `evaluateSeasonForOwner(seasonStats, ownerProfile, tier): 'good' | 'neutral' | 'bad'` (pure function, testable)
- If `bad` → `consecutiveBadSeasons++`; if `good` or `neutral` → reset to 0
- Thresholds by patience:
  - TriggerHappy: 1 bad season → trigger Game-Over flow
  - Steady: 2 consecutive bad seasons
  - LongTerm: 4 consecutive bad seasons
- Trigger reuses the existing Euro-Bankruptcy/Game-Over modal (see `project_euro_bankruptcy_progression.md`) with an owner-specific copy variant ("The board has lost faith." / "Mr. Pérez has called you in for a final meeting.")

**B) Wealth → Cash-injection cushion** (in Bankruptcy/Game-Over modal handler)
- Before showing the irreversible Game-Over modal, check `wealthTier` + `cashInjectionUsedThisSeason`
- Billionaire: offer €15M emergency injection (1×/season). Accept → bankruptcy reset, `cashInjectionUsedThisSeason = true`
- NationalMagnate: offer €8M but only if not used in the past 2 seasons (track via separate counter `seasonsSinceLastInjection`)
- LocalWealthy: no offer, straight to Game-Over

**C) Vision → Expectation pressure** (parameter to `evaluateSeasonForOwner`)
- WinNow: a season is `bad` if no continental Final-Four AND no domestic playoff appearance (regardless of tier — even MidTier gets the heat). For leagues without a continental tier, only the domestic-playoff check applies
- Develop: a season is `bad` only if (i) Win% < 0.35 AND (ii) no youth (age ≤22) progressed OVR by ≥3
- Frugal: a season is `bad` if season net P&L < 0, independent of sporting result; `good` if profit AND playoffs

UI copy follows CLAUDE.md tooltip-style: "Trigger-Happy: The owner runs out of patience after one disappointing season." No numeric thresholds in tooltips.

### 6. Persistence + backward compatibility

State shape additions (all optional):
```ts
// types.ts
NBATeam.ownerProfile?: OwnerProfile;
NBATeam.startingTier?: 'Powerhouse' | 'Established' | 'MidTier' | 'Underdog';
NBATeam.startingBudget?: number;

GameState.staffFreeAgents?: StaffMember[];
GameState.euroSetupSeed?: {
  teamId: number; leagueId: string; masterSeed: number;
  manualOverrides: EuroCareerSeed['manualOverrides'];
};

LeagueStats.autoOwnerSeeded?: boolean;
LeagueStats.staffPoolSeeded?: boolean;
```

LOAD_GAME migration (per CLAUDE.md rule 10 — persistent seed-flag, not existence-check):
- On load: if save is Euro-Mode AND `leagueStats.autoOwnerSeeded !== true` → call `seedEuroCareer()` with a deterministic fallback seed derived from `(userTeamId, save.id)`, write only the *missing* pieces (don't overwrite if user-team already has e.g. a coach), flip `autoOwnerSeeded: true`
- Same pattern for `staffPoolSeeded`
- New saves go through `INIT_EURO_CAREER` reducer which sets both flags atomically

Sponsor interface contract with parallel agent:
```ts
// in src/data/sponsorCatalogFetcher.ts (their file, my read-only)
getDefaultSponsorsForTeam(teamId: number, leagueId: string, rngSeed: number): SponsorSlot[];
```
- If function not yet exported / returns `[]` → setup sponsor card renders "Sponsors pending — will appear in League Office after season start", 🎲/✏️ disabled with tooltip "Default sponsor pool not yet loaded"
- My PR contains a small stub `getDefaultSponsorsForTeam` that returns `[]` so the build does not break if the parallel PR lands later. Their PR will replace the stub.

### 7. Testing

Vitest unit tests:
- `careerSeed.test.ts` — determinism: same master-seed produces deep-equal bundle (50 runs)
- `careerSeed.test.ts` — sub-seed independence: rerolling `staff` does not change `owner`/`sponsors`/`tier+budget` bytes
- `nationalityPool.test.ts` — TID-offset filter correctness (no WNBA bleeding into Endesa pool)
- `nationalityPool.test.ts` — fallback path when player-pool < 30
- `ownerSeed.test.ts` — patience thresholds (1/2/4) trigger Game-Over flag correctly
- `ownerSeed.test.ts` — `evaluateSeasonForOwner` matrix: 3 visions × 3 outcomes × 4 tiers
- `staffPoolRefill.test.ts` — monthly tick adds 5–10 candidates; last-resort fires when pool < 3 for role
- LOAD_GAME-migration snapshot test: an old Euro save without `ownerProfile` loads, migration runs, resulting state matches a fresh Setup with the same fallback seed (proves heal is deterministic)

Manual smoke: Pick Real Madrid in Liga Endesa, see review screen, reroll staff card 3× (other cards unchanged), edit owner-patience to TriggerHappy, start career, sim one bad season, verify Game-Over modal fires with cash-injection option (Real Madrid = Billionaire).

## Risks

1. **`state.history` for tier-default is unreliable for first-save** — fallback to curated `TEAM_PRESTIGE_HINT` table is required. Risk: hint table goes stale when a league expands. Mitigation: keep the table small (top-5 per league, everything else → MidTier default) and gate it behind tier-reroll (user always has 🎲 escape hatch).
2. **`nationalityPool` cache invalidation** — `state.players.length` is a coarse hash; if two different player sets happen to share the same length the cache returns stale data. Mitigation: include `state.players[0]?.born?.loc` in the key as a tie-breaker; acceptable false-positive rate.
3. **Owner Game-Over interplay with existing Bankruptcy** — two paths to Game-Over could race. Mitigation: bankruptcy check stays first (financial collapse is hard); patience-trigger fires only after the bankruptcy check passes.
4. **Sponsor stub conflict** — if both PRs export `getDefaultSponsorsForTeam`, the build breaks at merge. Mitigation: stub lives in a clearly-marked file `src/data/sponsorCatalogFetcher.stub.ts` and the setup imports the stub only via a re-export. When parallel agent's PR lands, they remove the stub re-export and the real one takes over.
5. **Manual-override survives reroll** — easy to leak stale overrides if user changes tier (which would imply different budget range). Mitigation: ✏️-edit on `tier` field also clears budget override (linked-clear rule); document each linked-clear in `careerSeed.ts`.

## Open questions

None — all axes have been answered:
- Start UX: Hybrid (auto + review screen)
- Staff pain: hardcoded country list + reputation range + thin owner data; not GM attributes
- Review fields: 4 cards (Coach/Staff, Budget+Tier, Owner, Sponsors)
- Nationality source: player-pool-derived (self-maintaining)
- Owner mechanics: all three live (Patience → Game-Over, Wealth → Cash-Cushion, Vision → Pressure)
- Pool refill: Hybrid (persistent + last-resort generation)
- Setup vs Hire-Flow: Setup replaces initial hire; Hire-button is for replacements only
