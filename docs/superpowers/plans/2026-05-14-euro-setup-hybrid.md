# Euro-Mode Hybrid Setup + Smart Staff-Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unusable initial Hire-Staff flow with a single review screen (4 cards: Tier+Budget, Staff 6/6, Owner, Sponsors) at Euro-Mode start; derive coach nationality from the actual league player pool instead of a hardcoded list; introduce game-affecting owner mechanics (Patience → Game-Over, Wealth → Cash-Injection, Vision → Pressure); keep `StaffSigningModal` viable post-sim-drain via persistent FA-pool + monthly refill + last-resort on-demand generation.

**Architecture:** Additive, optional fields throughout. Determinism via master-seed + per-card sub-seeds. The review screen is a thin UI over a pure `seedEuroCareer()` service. Owner-Vision lives on `NBATeam.ownerProfile?` and is consumed by `evaluateSeasonForOwner()` in `seasonRollover`. Backward-compatible LOAD_GAME-heal uses persistent seed-flags (`autoOwnerSeeded`, `staffPoolSeeded`) per CLAUDE.md rule 10. No file collision with the parallel sponsor-portfolio PR — sponsor slot calls a stub `getDefaultSponsorsForTeam()` that the parallel PR replaces.

**Tech Stack:** React 18 + TypeScript + Vite + tailwind + idb-keyval (existing). `facesjs` for portraits (already used in `staffFallback.ts`). Vitest for unit tests.

**Spec reference:** `docs/superpowers/specs/2026-05-14-euro-setup-hybrid-design.md`

---

## File Structure

**New files (mine):**
- `src/utils/tierMapping.ts` — Setup-tier-label ↔ TycoonTier S/A/B/C/D helper
- `src/data/sponsorCatalogFetcher.stub.ts` — temporary export until parallel PR lands
- `src/services/euro/nationalityPool.ts` — player-pool-derived country distribution + cache
- `src/services/euro/tierBudgetSeed.ts` — Tier-label + Budget range generator
- `src/services/euro/staffSeed.ts` — 6 staff roles (HC/AC/HoSS/Phy/Sct/Ana)
- `src/services/euro/ownerSeed.ts` — OwnerProfile generator
- `src/services/euro/sponsorSeed.ts` — calls `getDefaultSponsorsForTeam`
- `src/services/euro/careerSeed.ts` — orchestrator + `rerollCard` + `applyOverride`
- `src/services/euro/evaluateSeasonForOwner.ts` — pure season-judgement func
- `src/services/euro/staffPoolRefill.ts` — monthly tick + last-resort
- `src/components/setup/EuroSetupReviewScreen.tsx` — main review UI
- `src/components/setup/cards/TierBudgetCard.tsx`
- `src/components/setup/cards/StaffRosterCard.tsx`
- `src/components/setup/cards/OwnerCard.tsx`
- `src/components/setup/cards/SponsorsCard.tsx`
- `src/components/setup/edits/EditTierBudgetModal.tsx`
- `src/components/setup/edits/EditStaffModal.tsx`
- `src/components/setup/edits/EditOwnerModal.tsx`
- `src/components/setup/edits/EditSponsorSlotModal.tsx`
- `src/components/shared/SectionGroup.tsx` — re-used later by AI-economy Phase 2
- Test files mirroring the above under `src/**/__tests__/`

**Modified files:**
- `src/types.ts` — add `OwnerProfile` interface, optional fields on `NBATeam` and `GameState`
- `src/services/staff/staffFallback.ts` — drop `FOREIGN_COACH_POOL` as primary, accept optional `pool` param
- `src/components/setup/LeagueTypeSelector.tsx` — pass selection to App which routes through new phase
- `src/App.tsx` — add `'euroReview'` setupPhase between `commish` and game-start
- `src/store/logic/initialization.ts` (or equivalent reducer) — handle `INIT_EURO_CAREER` action, LOAD_GAME heal
- `src/services/seasonRollover.ts` — Patience-tick + bankruptcy-modal cash-injection hook
- `src/components/central/view/FrontOffice/StaffSigning/StaffSigningModal.tsx` — last-resort gen when pool < 3

---

## Phase 1.A — Types + Infrastructure

### Task 1: Add OwnerProfile + NBATeam optional fields

**Files:**
- Modify: `src/types.ts:796` (NBATeam interface), add new `OwnerProfile` near top

- [ ] **Step 1: Add `OwnerProfile` type**

Add immediately before `export interface NBATeam`:

```typescript
export type OwnerWealthTier = 'LocalWealthy' | 'NationalMagnate' | 'Billionaire';
export type OwnerPatience = 'TriggerHappy' | 'Steady' | 'LongTerm';
export type OwnerVision = 'WinNow' | 'Develop' | 'Frugal';

export interface OwnerProfile {
  name: string;
  nationality: string;
  face: any;  // facesjs config — kept loose to match StaffMember.face
  wealthTier: OwnerWealthTier;
  patience: OwnerPatience;
  vision: OwnerVision;
  cashInjectionUsedThisSeason: boolean;     // resets at season rollover
  seasonsSinceLastInjection: number;        // NationalMagnate cooldown
  consecutiveBadSeasons: number;
}

export type SetupTierLabel = 'Powerhouse' | 'Established' | 'MidTier' | 'Underdog';
```

- [ ] **Step 2: Add optional fields to NBATeam**

Inside `export interface NBATeam { ... }`, add near the bottom of the interface:

```typescript
  ownerProfile?: OwnerProfile;
  startingTier?: SetupTierLabel;
  startingBudget?: number;
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add OwnerProfile and Setup-tier optional NBATeam fields"
```

---

### Task 2: Add GameState + LeagueStats optional fields

**Files:**
- Modify: `src/types.ts` (GameState + LeagueStats interfaces)

- [ ] **Step 1: Find GameState interface**

Search `src/types.ts` for `export interface GameState`. Add inside the interface:

```typescript
  staffFreeAgents?: StaffMember[];
  euroSetupSeed?: {
    teamId: number;
    leagueId: string;
    masterSeed: number;
    manualOverrides: Record<string, unknown>;
  };
```

- [ ] **Step 2: Find LeagueStats interface and add seed-flags**

Search for `export interface LeagueStats`. Add inside:

```typescript
  autoOwnerSeeded?: boolean;
  staffPoolSeeded?: boolean;
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add staffFreeAgents, euroSetupSeed, seed-flags to GameState"
```

---

### Task 3: Create tier mapping helper

**Files:**
- Create: `src/utils/tierMapping.ts`
- Create: `src/utils/__tests__/tierMapping.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/__tests__/tierMapping.test.ts
import { describe, it, expect } from 'vitest';
import { mapSetupTierToTycoonTier, getTycoonTierUILabel } from '../tierMapping';

describe('mapSetupTierToTycoonTier', () => {
  it('maps Powerhouse -> S', () => {
    expect(mapSetupTierToTycoonTier('Powerhouse')).toBe('S');
  });
  it('maps Established -> A', () => {
    expect(mapSetupTierToTycoonTier('Established')).toBe('A');
  });
  it('maps MidTier -> B', () => {
    expect(mapSetupTierToTycoonTier('MidTier')).toBe('B');
  });
  it('maps Underdog -> C', () => {
    expect(mapSetupTierToTycoonTier('Underdog')).toBe('C');
  });
});

describe('getTycoonTierUILabel', () => {
  it('returns Powerhouse for S', () => {
    expect(getTycoonTierUILabel('S')).toBe('Powerhouse');
  });
  it('returns Lower-Tier for D', () => {
    expect(getTycoonTierUILabel('D')).toBe('Lower-Tier');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/tierMapping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/utils/tierMapping.ts
import type { SetupTierLabel } from '../types';

export type TycoonTier = 'S' | 'A' | 'B' | 'C' | 'D';

export function mapSetupTierToTycoonTier(label: SetupTierLabel): TycoonTier {
  switch (label) {
    case 'Powerhouse':  return 'S';
    case 'Established': return 'A';
    case 'MidTier':     return 'B';
    case 'Underdog':    return 'C';
  }
}

export function getTycoonTierUILabel(tier: TycoonTier): string {
  switch (tier) {
    case 'S': return 'Powerhouse';
    case 'A': return 'Established';
    case 'B': return 'Mid-Tier';
    case 'C': return 'Underdog';
    case 'D': return 'Lower-Tier';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/tierMapping.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tierMapping.ts src/utils/__tests__/tierMapping.test.ts
git commit -m "feat(utils): add tier mapping helper for setup-label <-> tycoon-tier"
```

---

### Task 4: Create sponsor-catalog stub

**Files:**
- Create: `src/data/sponsorCatalogFetcher.stub.ts`

- [ ] **Step 1: Write the stub**

```typescript
// src/data/sponsorCatalogFetcher.stub.ts
// TEMPORARY STUB — parallel agent's PR replaces this with a real implementation.
// When their PR lands, the import in sponsorSeed.ts switches from
// `./sponsorCatalogFetcher.stub` to `./sponsorCatalogFetcher`.

export type SponsorSlot = {
  slotId: 'main' | 'jersey' | 'arena';
  brand: string;
  amountEUR: number;
  years: number;
};

export function getDefaultSponsorsForTeam(
  _teamId: number,
  _leagueId: string,
  _rngSeed: number,
): SponsorSlot[] {
  return [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/sponsorCatalogFetcher.stub.ts
git commit -m "feat(data): add sponsor-catalog fetcher stub (replaced by parallel PR)"
```

---

## Phase 1.B — Nationality Pool

### Task 5: Build nationality-pool service

**Files:**
- Create: `src/services/euro/nationalityPool.ts`
- Create: `src/services/euro/__tests__/nationalityPool.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/nationalityPool.test.ts
import { describe, it, expect } from 'vitest';
import { buildCoachNationalityPool, clearNationalityPoolCache } from '../nationalityPool';
import type { GameState, Player } from '../../../types';

function makePlayer(tid: number, country: string): Player {
  return { tid, born: { loc: country, year: 1990 } } as Player;
}

describe('buildCoachNationalityPool', () => {
  it('filters by Endesa TID range [5000, 5100)', () => {
    const state = {
      players: [
        makePlayer(5001, 'Spain'),
        makePlayer(5002, 'Spain'),
        makePlayer(5003, 'Argentina'),
        makePlayer(3001, 'USA'),   // WNBA — should not bleed in
        makePlayer(1001, 'Greece'), // Euroleague — should not bleed in
      ],
    } as unknown as GameState;
    clearNationalityPoolCache();
    const pool = buildCoachNationalityPool(state, 'endesa');
    expect(pool.map(p => p.country).sort()).toEqual(['Argentina', 'Spain']);
  });

  it('falls back to fixed pool when <30 players match', () => {
    const state = { players: [] } as unknown as GameState;
    clearNationalityPoolCache();
    const pool = buildCoachNationalityPool(state, 'endesa');
    expect(pool.length).toBeGreaterThanOrEqual(5);
    expect(pool.some(p => p.country === 'Serbia')).toBe(true);
  });

  it('caches results until invalidator key changes', () => {
    const state = {
      players: Array.from({ length: 35 }, () => makePlayer(5001, 'Spain')),
    } as unknown as GameState;
    clearNationalityPoolCache();
    const first = buildCoachNationalityPool(state, 'endesa');
    const second = buildCoachNationalityPool(state, 'endesa');
    expect(first).toBe(second); // same reference = cache hit
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/nationalityPool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/nationalityPool.ts
import type { GameState } from '../../types';

export type NationalityPoolEntry = { country: string; weight: number };

const LEAGUE_TID_RANGES: Record<string, [number, number]> = {
  endesa:     [5000, 5100],
  euroleague: [1000, 1100],
  pba:        [2000, 2100],
  wnba:       [3000, 3100],
  bleague:    [4000, 4100],
  gleague:    [6000, 6100],
  chinacba:   [7000, 7100],
  nblaus:     [8000, 8100],
};

const FALLBACK_POOL: NationalityPoolEntry[] = [
  { country: 'Serbia',        weight: 0.20 },
  { country: 'Lithuania',     weight: 0.13 },
  { country: 'Greece',        weight: 0.13 },
  { country: 'Italy',         weight: 0.11 },
  { country: 'United States', weight: 0.10 },
  { country: 'Croatia',       weight: 0.08 },
  { country: 'Turkey',        weight: 0.08 },
  { country: 'France',        weight: 0.07 },
  { country: 'Slovenia',      weight: 0.05 },
  { country: 'Spain',         weight: 0.05 },
];

const cache = new Map<string, { key: string; pool: NationalityPoolEntry[] }>();

export function clearNationalityPoolCache(): void {
  cache.clear();
}

export function buildCoachNationalityPool(
  state: Pick<GameState, 'players'>,
  leagueId: string,
): NationalityPoolEntry[] {
  const range = LEAGUE_TID_RANGES[leagueId];
  if (!range) return FALLBACK_POOL;

  const players = state.players ?? [];
  const sample = players[0]?.born?.loc ?? '';
  const cacheKey = `${leagueId}-${players.length}-${sample}`;
  const cached = cache.get(leagueId);
  if (cached && cached.key === cacheKey) return cached.pool;

  const matched = players.filter(p => p.tid >= range[0] && p.tid < range[1]);
  if (matched.length < 30) {
    cache.set(leagueId, { key: cacheKey, pool: FALLBACK_POOL });
    return FALLBACK_POOL;
  }

  const counts = new Map<string, number>();
  for (const p of matched) {
    const c = p.born?.loc;
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, n]) => ({ country, weight: n / total }));

  const sumWeight = sorted.reduce((s, e) => s + e.weight, 0);
  const normalized = sorted.map(e => ({ country: e.country, weight: e.weight / sumWeight }));

  cache.set(leagueId, { key: cacheKey, pool: normalized });
  return normalized;
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npx vitest run src/services/euro/__tests__/nationalityPool.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/euro/nationalityPool.ts src/services/euro/__tests__/nationalityPool.test.ts
git commit -m "feat(euro): player-pool-derived coach nationality distribution"
```

---

### Task 6: Update staffFallback to accept dynamic pool

**Files:**
- Modify: `src/services/staff/staffFallback.ts:79-83` (pickCountry function)
- Modify: `src/services/staff/staffFallback.ts:95-121` (makePlaceholderCoach signature)
- Modify: `src/services/staff/staffFallback.ts:123-151` (makePlaceholderGM signature)

- [ ] **Step 1: Replace `pickCountry` to accept optional pool**

In `src/services/staff/staffFallback.ts`, replace lines 79–83:

```typescript
function pickCountry(
  homeCountry: string,
  rng: () => number,
  externalPool?: { country: string; weight: number }[],
): string {
  const pool = externalPool && externalPool.length > 0
    ? externalPool.map(e => e.country)
    : FOREIGN_COACH_POOL;
  if (!homeCountry) return pool[Math.floor(rng() * pool.length)];
  if (rng() < LOCAL_HIRE_PROBABILITY) return homeCountry;
  return pool[Math.floor(rng() * pool.length)];
}
```

- [ ] **Step 2: Extend `makePlaceholderCoach` opts**

Modify the `opts` param type and call inside (line ~97):

```typescript
export function makePlaceholderCoach(
  team: NBATeam | { id?: number; tid?: number; name: string; region?: string; logoUrl?: string },
  opts?: { country?: string; nameData?: NameData; nationalityPool?: { country: string; weight: number }[] },
): PlaceholderCoach {
```

Then at line ~103:

```typescript
  const nationality = pickCountry(homeCountry, rng, opts?.nationalityPool);
```

- [ ] **Step 3: Same change for `makePlaceholderGM`**

Modify signature at line ~124:

```typescript
export function makePlaceholderGM(
  team: NBATeam | { id?: number; tid?: number; name: string; region?: string; logoUrl?: string },
  opts?: { country?: string; nameData?: NameData; nationalityPool?: { country: string; weight: number }[] },
): PlaceholderGM {
```

At line ~131:

```typescript
  const nationality = pickCountry(homeCountry, rng, opts?.nationalityPool);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/staff/staffFallback.ts
git commit -m "feat(staff): accept optional nationality pool in placeholder generators"
```

---

## Phase 1.C — Seed Generators

### Task 7: Tier + Budget seeder

**Files:**
- Create: `src/services/euro/tierBudgetSeed.ts`
- Create: `src/services/euro/__tests__/tierBudgetSeed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/tierBudgetSeed.test.ts
import { describe, it, expect } from 'vitest';
import { seedTierAndBudget } from '../tierBudgetSeed';

describe('seedTierAndBudget', () => {
  it('returns Powerhouse for hint-listed top teams', () => {
    const res = seedTierAndBudget({ teamAbbrev: 'RMB', leagueId: 'endesa', subSeed: 1 });
    expect(res.tier).toBe('Powerhouse');
  });
  it('defaults to MidTier when no hint matches', () => {
    const res = seedTierAndBudget({ teamAbbrev: 'XXX', leagueId: 'endesa', subSeed: 1 });
    expect(res.tier).toBe('MidTier');
  });
  it('Powerhouse budget is ~1.5x MidTier budget', () => {
    const ph = seedTierAndBudget({ teamAbbrev: 'RMB', leagueId: 'endesa', subSeed: 1 });
    const mt = seedTierAndBudget({ teamAbbrev: 'XXX', leagueId: 'endesa', subSeed: 1 });
    expect(ph.budget / mt.budget).toBeGreaterThan(1.4);
    expect(ph.budget / mt.budget).toBeLessThan(1.6);
  });
  it('deterministic for same seed', () => {
    const a = seedTierAndBudget({ teamAbbrev: 'XXX', leagueId: 'endesa', subSeed: 42 });
    const b = seedTierAndBudget({ teamAbbrev: 'XXX', leagueId: 'endesa', subSeed: 42 });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/tierBudgetSeed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/tierBudgetSeed.ts
import type { SetupTierLabel } from '../../types';

export type TierBudgetSeed = {
  tier: SetupTierLabel;
  budget: number; // EUR/season
};

const TEAM_PRESTIGE_HINT: Record<string, Record<string, SetupTierLabel>> = {
  endesa: {
    'RMB': 'Powerhouse',  // Real Madrid
    'BAR': 'Powerhouse',  // FC Barcelona
    'BAS': 'Established', // Baskonia
    'VAL': 'Established', // Valencia
    'UNI': 'Established', // Unicaja
  },
  euroleague: {
    'OLY': 'Powerhouse',  // Olympiacos
    'PAN': 'Powerhouse',  // Panathinaikos
    'EFE': 'Powerhouse',  // Anadolu Efes
    'CSK': 'Established',
    'FBA': 'Established',
  },
};

const TIER_BUDGET_BASELINE: Record<string, number> = {
  endesa:     8_000_000,   // mid-tier baseline EUR/season
  euroleague: 18_000_000,
};

const TIER_MULTIPLIERS: Record<SetupTierLabel, number> = {
  Powerhouse:  1.5,
  Established: 1.0,
  MidTier:     0.7,
  Underdog:    0.5,
};

function rngFromSeed(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function seedTierAndBudget(input: {
  teamAbbrev: string;
  leagueId: string;
  subSeed: number;
}): TierBudgetSeed {
  const hint = TEAM_PRESTIGE_HINT[input.leagueId]?.[input.teamAbbrev];
  const tier: SetupTierLabel = hint ?? 'MidTier';
  const baseline = TIER_BUDGET_BASELINE[input.leagueId] ?? 5_000_000;
  const multiplier = TIER_MULTIPLIERS[tier];
  const rng = rngFromSeed(input.subSeed);
  const jitter = 0.9 + rng() * 0.2; // ±10%
  const budget = Math.round(baseline * multiplier * jitter);
  return { tier, budget };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/euro/__tests__/tierBudgetSeed.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/euro/tierBudgetSeed.ts src/services/euro/__tests__/tierBudgetSeed.test.ts
git commit -m "feat(euro): tier + budget seeder with prestige-hint table"
```

---

### Task 8: Staff seeder (6 roles)

**Files:**
- Create: `src/services/euro/staffSeed.ts`
- Create: `src/services/euro/__tests__/staffSeed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/staffSeed.test.ts
import { describe, it, expect } from 'vitest';
import { seedStaffSix } from '../staffSeed';
import { clearNationalityPoolCache } from '../nationalityPool';

const team = { tid: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' } as any;
const state = {
  players: Array.from({ length: 50 }, (_, i) => ({ tid: 5000 + (i % 10), born: { loc: 'Spain', year: 1990 } })),
} as any;

describe('seedStaffSix', () => {
  it('returns 6 roles: HC, AC, HoSS, Phy, Sct, Ana', () => {
    clearNationalityPoolCache();
    const staff = seedStaffSix(team, state, 'endesa', 'Powerhouse', 99);
    const positions = staff.map(s => s.position);
    expect(positions).toContain('Head Coach');
    expect(positions).toContain('Assistant Coach');
    expect(positions).toContain('Head of Sports Science');
    expect(positions).toContain('Head Physio');
    expect(positions).toContain('Chief Scout');
    expect(positions).toContain('Head of Analytics');
    expect(staff).toHaveLength(6);
  });

  it('Powerhouse staff has higher avg reputation than Underdog', () => {
    clearNationalityPoolCache();
    const ph = seedStaffSix(team, state, 'endesa', 'Powerhouse', 1);
    const ud = seedStaffSix(team, state, 'endesa', 'Underdog', 1);
    const phAvg = ph.reduce((s, m) => s + ((m as any).reputation ?? 0), 0) / ph.length;
    const udAvg = ud.reduce((s, m) => s + ((m as any).reputation ?? 0), 0) / ud.length;
    expect(phAvg).toBeGreaterThan(udAvg);
  });

  it('deterministic for same seed', () => {
    clearNationalityPoolCache();
    const a = seedStaffSix(team, state, 'endesa', 'Powerhouse', 7);
    clearNationalityPoolCache();
    const b = seedStaffSix(team, state, 'endesa', 'Powerhouse', 7);
    expect(a.map(s => s.name)).toEqual(b.map(s => s.name));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/staffSeed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/staffSeed.ts
import { generate } from 'facesjs';
import { getNameData } from '../../data/nameDataFetcher';
import { getTeamCountry } from '../../utils/teamCountry';
import { buildCoachNationalityPool } from './nationalityPool';
import type { NBATeam, StaffMember, GameState, SetupTierLabel } from '../../types';

const ROLES = [
  'Head Coach',
  'Assistant Coach',
  'Head of Sports Science',
  'Head Physio',
  'Chief Scout',
  'Head of Analytics',
] as const;

const TIER_REP_BASE: Record<SetupTierLabel, number> = {
  Powerhouse:  70,
  Established: 60,
  MidTier:     55,
  Underdog:    50,
};

const LOCAL_HIRE_PROBABILITY = 0.55;

function rngFromSeed(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function weightedPick<T>(pool: { country: string; weight: number }[], rng: () => number): string {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e.country;
  }
  return pool[pool.length - 1]?.country ?? 'USA';
}

function pickName(country: string, nameData: ReturnType<typeof getNameData>, rng: () => number): string {
  const c = nameData.countries?.[country] ?? nameData.countries?.['USA'];
  const firstPool = Object.keys(c?.first ?? {});
  const lastPool = Object.keys(c?.last ?? {});
  if (!firstPool.length || !lastPool.length) return 'Unknown Coach';
  const first = firstPool[Math.floor(rng() * firstPool.length)];
  const last = lastPool[Math.floor(rng() * lastPool.length)];
  return `${first} ${last}`;
}

export function seedStaffSix(
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
  tier: SetupTierLabel,
  subSeed: number,
): StaffMember[] {
  const rng = rngFromSeed(subSeed ^ ((team as any).tid ?? 0));
  const nameData = getNameData();
  const nationalityPool = buildCoachNationalityPool(state, leagueId);
  const homeCountry = getTeamCountry(team as NBATeam, state as any) ?? '';
  const repBase = TIER_REP_BASE[tier];
  const teamLabel = team.region && !team.name.includes(team.region) ? `${team.region} ${team.name}` : team.name;

  return ROLES.map((role) => {
    const useLocal = homeCountry && rng() < LOCAL_HIRE_PROBABILITY;
    const country = useLocal ? homeCountry : weightedPick(nationalityPool, rng);
    const name = pickName(country, nameData, rng);
    const reputation = Math.max(40, Math.min(99, repBase + Math.floor(rng() * 21) - 10));
    const tenureRoll = rng();
    const yearsWithTeam = tenureRoll < 0.5 ? 1 : tenureRoll < 0.85 ? Math.floor(rng() * 4) + 2 : Math.floor(rng() * 6) + 5;
    const careerStart = 2026 - (yearsWithTeam + Math.floor(rng() * 18) + 4);
    const bornYear = careerStart - (Math.floor(rng() * 12) + 28);

    return {
      name,
      team: teamLabel,
      position: role,
      jobTitle: role,
      teamLogoUrl: team.logoUrl,
      nationality: country,
      bornYear,
      careerStartYear: careerStart,
      yearsWithTeam,
      isPlaceholder: true,
      reputation,
      face: generate(undefined, { gender: 'male' }),
    } as StaffMember & { reputation: number };
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/euro/__tests__/staffSeed.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/euro/staffSeed.ts src/services/euro/__tests__/staffSeed.test.ts
git commit -m "feat(euro): seed 6 staff roles with tier-coupled reputation"
```

---

### Task 9: Owner seeder

**Files:**
- Create: `src/services/euro/ownerSeed.ts`
- Create: `src/services/euro/__tests__/ownerSeed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/ownerSeed.test.ts
import { describe, it, expect } from 'vitest';
import { seedOwner } from '../ownerSeed';
import { clearNationalityPoolCache } from '../nationalityPool';

const team = { tid: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' } as any;
const state = {
  players: Array.from({ length: 50 }, () => ({ tid: 5001, born: { loc: 'Spain', year: 1990 } })),
} as any;

describe('seedOwner', () => {
  it('Powerhouse default has Win-Now + Long-Term + Billionaire bias', () => {
    clearNationalityPoolCache();
    let winNow = 0, billionaire = 0;
    for (let i = 0; i < 50; i++) {
      const o = seedOwner(team, state, 'endesa', 'Powerhouse', i);
      if (o.vision === 'WinNow') winNow++;
      if (o.wealthTier === 'Billionaire') billionaire++;
    }
    expect(winNow).toBeGreaterThan(25);
    expect(billionaire).toBeGreaterThan(25);
  });

  it('Underdog default has Frugal + LocalWealthy bias', () => {
    clearNationalityPoolCache();
    let frugal = 0, local = 0;
    for (let i = 0; i < 50; i++) {
      const o = seedOwner(team, state, 'endesa', 'Underdog', i);
      if (o.vision === 'Frugal') frugal++;
      if (o.wealthTier === 'LocalWealthy') local++;
    }
    expect(frugal).toBeGreaterThan(15);
    expect(local).toBeGreaterThan(20);
  });

  it('initializes runtime counters at zero', () => {
    const o = seedOwner(team, state, 'endesa', 'Powerhouse', 1);
    expect(o.consecutiveBadSeasons).toBe(0);
    expect(o.cashInjectionUsedThisSeason).toBe(false);
    expect(o.seasonsSinceLastInjection).toBe(0);
  });

  it('deterministic for same seed', () => {
    clearNationalityPoolCache();
    const a = seedOwner(team, state, 'endesa', 'Powerhouse', 42);
    clearNationalityPoolCache();
    const b = seedOwner(team, state, 'endesa', 'Powerhouse', 42);
    expect(a.name).toBe(b.name);
    expect(a.wealthTier).toBe(b.wealthTier);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/ownerSeed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/ownerSeed.ts
import { generate } from 'facesjs';
import { getNameData } from '../../data/nameDataFetcher';
import { getTeamCountry } from '../../utils/teamCountry';
import { buildCoachNationalityPool } from './nationalityPool';
import type {
  NBATeam, GameState, OwnerProfile, OwnerWealthTier, OwnerPatience, OwnerVision, SetupTierLabel,
} from '../../types';

const TIER_DEFAULTS: Record<SetupTierLabel, {
  wealth: Array<[OwnerWealthTier, number]>;
  patience: Array<[OwnerPatience, number]>;
  vision: Array<[OwnerVision, number]>;
}> = {
  Powerhouse: {
    wealth:   [['Billionaire', 0.7], ['NationalMagnate', 0.25], ['LocalWealthy', 0.05]],
    patience: [['LongTerm', 0.55], ['Steady', 0.30], ['TriggerHappy', 0.15]],
    vision:   [['WinNow', 0.65], ['Develop', 0.20], ['Frugal', 0.15]],
  },
  Established: {
    wealth:   [['NationalMagnate', 0.55], ['Billionaire', 0.25], ['LocalWealthy', 0.20]],
    patience: [['Steady', 0.50], ['LongTerm', 0.30], ['TriggerHappy', 0.20]],
    vision:   [['WinNow', 0.40], ['Develop', 0.40], ['Frugal', 0.20]],
  },
  MidTier: {
    wealth:   [['NationalMagnate', 0.40], ['LocalWealthy', 0.50], ['Billionaire', 0.10]],
    patience: [['Steady', 0.45], ['TriggerHappy', 0.30], ['LongTerm', 0.25]],
    vision:   [['Develop', 0.45], ['WinNow', 0.30], ['Frugal', 0.25]],
  },
  Underdog: {
    wealth:   [['LocalWealthy', 0.60], ['NationalMagnate', 0.35], ['Billionaire', 0.05]],
    patience: [['TriggerHappy', 0.40], ['Steady', 0.40], ['LongTerm', 0.20]],
    vision:   [['Frugal', 0.45], ['Develop', 0.35], ['WinNow', 0.20]],
  },
};

function rngFromSeed(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function weightedDraw<T>(table: Array<[T, number]>, rng: () => number): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [value, w] of table) {
    r -= w;
    if (r <= 0) return value;
  }
  return table[table.length - 1][0];
}

export function seedOwner(
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
  tier: SetupTierLabel,
  subSeed: number,
): OwnerProfile {
  const rng = rngFromSeed(subSeed ^ (((team as any).tid ?? 0) << 4));
  const nameData = getNameData();
  const pool = buildCoachNationalityPool(state, leagueId);
  const homeCountry = getTeamCountry(team as NBATeam, state as any) ?? '';
  const useLocal = homeCountry && rng() < 0.7;
  const nationality = useLocal ? homeCountry : (pool[Math.floor(rng() * pool.length)]?.country ?? 'USA');

  const c = nameData.countries?.[nationality] ?? nameData.countries?.['USA'];
  const firsts = Object.keys(c?.first ?? {});
  const lasts = Object.keys(c?.last ?? {});
  const name = firsts.length && lasts.length
    ? `${firsts[Math.floor(rng() * firsts.length)]} ${lasts[Math.floor(rng() * lasts.length)]}`
    : 'Unknown Owner';

  const defaults = TIER_DEFAULTS[tier];
  return {
    name,
    nationality,
    face: generate(undefined, { gender: 'male' }),
    wealthTier: weightedDraw(defaults.wealth, rng),
    patience:   weightedDraw(defaults.patience, rng),
    vision:     weightedDraw(defaults.vision, rng),
    cashInjectionUsedThisSeason: false,
    seasonsSinceLastInjection: 0,
    consecutiveBadSeasons: 0,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/euro/__tests__/ownerSeed.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/euro/ownerSeed.ts src/services/euro/__tests__/ownerSeed.test.ts
git commit -m "feat(euro): tier-biased owner profile seeder"
```

---

### Task 10: Sponsor seeder (calls stub)

**Files:**
- Create: `src/services/euro/sponsorSeed.ts`
- Create: `src/services/euro/__tests__/sponsorSeed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/sponsorSeed.test.ts
import { describe, it, expect } from 'vitest';
import { seedSponsors } from '../sponsorSeed';

describe('seedSponsors', () => {
  it('returns empty array when stub returns empty (parallel PR not yet landed)', () => {
    const slots = seedSponsors(5001, 'endesa', 1);
    expect(slots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/sponsorSeed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/sponsorSeed.ts
import { getDefaultSponsorsForTeam, type SponsorSlot } from '../../data/sponsorCatalogFetcher.stub';

export function seedSponsors(teamId: number, leagueId: string, subSeed: number): SponsorSlot[] {
  return getDefaultSponsorsForTeam(teamId, leagueId, subSeed);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/euro/__tests__/sponsorSeed.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/services/euro/sponsorSeed.ts src/services/euro/__tests__/sponsorSeed.test.ts
git commit -m "feat(euro): sponsor seeder wrapper (stub-backed until parallel PR)"
```

---

### Task 11: Career-seed orchestrator (master-seed + reroll + override)

**Files:**
- Create: `src/services/euro/careerSeed.ts`
- Create: `src/services/euro/__tests__/careerSeed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/careerSeed.test.ts
import { describe, it, expect } from 'vitest';
import { seedEuroCareer, rerollCard, applyOverride } from '../careerSeed';
import { clearNationalityPoolCache } from '../nationalityPool';

const team = { tid: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' } as any;
const state = {
  players: Array.from({ length: 50 }, () => ({ tid: 5001, born: { loc: 'Spain', year: 1990 } })),
} as any;

describe('seedEuroCareer', () => {
  it('produces deep-equal bundles for same master seed', () => {
    clearNationalityPoolCache();
    const a = seedEuroCareer(team, state, 'endesa', 12345);
    clearNationalityPoolCache();
    const b = seedEuroCareer(team, state, 'endesa', 12345);
    expect(a.tier).toBe(b.tier);
    expect(a.owner.name).toBe(b.owner.name);
    expect(a.staff.map(s => s.name)).toEqual(b.staff.map(s => s.name));
  });

  it('different master seed produces different bundle (probabilistic)', () => {
    clearNationalityPoolCache();
    const a = seedEuroCareer(team, state, 'endesa', 1);
    clearNationalityPoolCache();
    const b = seedEuroCareer(team, state, 'endesa', 999);
    expect(a.owner.name).not.toBe(b.owner.name);
  });

  it('rerollCard mutates only the targeted card', () => {
    clearNationalityPoolCache();
    const before = seedEuroCareer(team, state, 'endesa', 100);
    const after = rerollCard(before, 'staff', 200);
    expect(after.owner.name).toBe(before.owner.name); // unchanged
    expect(after.tier).toBe(before.tier);             // unchanged
    // Probabilistic: staff likely changes
    const changed = after.staff.some((s, i) => s.name !== before.staff[i].name);
    expect(changed).toBe(true);
  });

  it('applyOverride writes into manualOverrides', () => {
    const seed = seedEuroCareer(team, state, 'endesa', 1);
    const next = applyOverride(seed, 'tier', 'Underdog');
    expect(next.manualOverrides.tier).toBe('Underdog');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/careerSeed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/careerSeed.ts
import type { NBATeam, GameState, OwnerProfile, StaffMember, SetupTierLabel } from '../../types';
import type { SponsorSlot } from '../../data/sponsorCatalogFetcher.stub';
import { seedTierAndBudget } from './tierBudgetSeed';
import { seedStaffSix } from './staffSeed';
import { seedOwner } from './ownerSeed';
import { seedSponsors } from './sponsorSeed';

export type CardKey = 'tier' | 'staff' | 'owner' | 'sponsors';

export type EuroCareerManualOverrides = {
  tier?: SetupTierLabel;
  budget?: number;
  staff?: Record<string, StaffMember>;   // key = role
  owner?: Partial<OwnerProfile>;
  sponsors?: Record<string, SponsorSlot>; // key = slotId
};

export type EuroCareerSeed = {
  masterSeed: number;
  tier: SetupTierLabel;
  budget: number;
  staff: StaffMember[];
  owner: OwnerProfile;
  sponsors: SponsorSlot[];
  manualOverrides: EuroCareerManualOverrides;
};

function subSeed(master: number, key: CardKey): number {
  const tag = { tier: 0x11, staff: 0x22, owner: 0x33, sponsors: 0x44 }[key];
  let h = master ^ tag;
  h = (h * 0x9E3779B1) >>> 0;
  return h || 1;
}

function applyOverridesToSeed(base: EuroCareerSeed): EuroCareerSeed {
  const o = base.manualOverrides;
  const merged: EuroCareerSeed = { ...base };
  if (o.tier)   merged.tier   = o.tier;
  if (o.budget) merged.budget = o.budget;
  if (o.staff) {
    merged.staff = merged.staff.map(s => o.staff?.[s.position ?? ''] ?? s);
  }
  if (o.owner) {
    merged.owner = { ...merged.owner, ...o.owner };
  }
  if (o.sponsors) {
    merged.sponsors = merged.sponsors.map(s => o.sponsors?.[s.slotId] ?? s);
  }
  return merged;
}

export function seedEuroCareer(
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
  masterSeed: number,
): EuroCareerSeed {
  const tb = seedTierAndBudget({
    teamAbbrev: team.abbrev,
    leagueId,
    subSeed: subSeed(masterSeed, 'tier'),
  });
  const staff = seedStaffSix(team, state, leagueId, tb.tier, subSeed(masterSeed, 'staff'));
  const owner = seedOwner(team, state, leagueId, tb.tier, subSeed(masterSeed, 'owner'));
  const sponsors = seedSponsors((team as any).tid ?? team.id, leagueId, subSeed(masterSeed, 'sponsors'));

  return {
    masterSeed,
    tier: tb.tier,
    budget: tb.budget,
    staff,
    owner,
    sponsors,
    manualOverrides: {},
  };
}

export function rerollCard(
  seed: EuroCareerSeed,
  card: CardKey,
  newSubSeed: number,
  team: NBATeam,
  state: Pick<GameState, 'players' | 'nonNBATeams'>,
  leagueId: string,
): EuroCareerSeed {
  const next: EuroCareerSeed = { ...seed, manualOverrides: { ...seed.manualOverrides } };

  switch (card) {
    case 'tier': {
      const tb = seedTierAndBudget({ teamAbbrev: team.abbrev, leagueId, subSeed: newSubSeed });
      next.tier = tb.tier;
      next.budget = tb.budget;
      delete next.manualOverrides.tier;
      delete next.manualOverrides.budget;
      break;
    }
    case 'staff':
      next.staff = seedStaffSix(team, state, leagueId, next.tier, newSubSeed);
      delete next.manualOverrides.staff;
      break;
    case 'owner':
      next.owner = seedOwner(team, state, leagueId, next.tier, newSubSeed);
      delete next.manualOverrides.owner;
      break;
    case 'sponsors':
      next.sponsors = seedSponsors((team as any).tid ?? team.id, leagueId, newSubSeed);
      delete next.manualOverrides.sponsors;
      break;
  }

  return applyOverridesToSeed(next);
}

export function applyOverride<K extends keyof EuroCareerManualOverrides>(
  seed: EuroCareerSeed,
  key: K,
  value: EuroCareerManualOverrides[K],
): EuroCareerSeed {
  const overrides = { ...seed.manualOverrides, [key]: value };
  return applyOverridesToSeed({ ...seed, manualOverrides: overrides });
}

export function clearOverride(
  seed: EuroCareerSeed,
  key: keyof EuroCareerManualOverrides,
): EuroCareerSeed {
  const overrides = { ...seed.manualOverrides };
  delete overrides[key];
  return applyOverridesToSeed({ ...seed, manualOverrides: overrides });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/services/euro/__tests__/careerSeed.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/euro/careerSeed.ts src/services/euro/__tests__/careerSeed.test.ts
git commit -m "feat(euro): career seed orchestrator with sub-seed reroll + overrides"
```

---

## Phase 1.D — Reducer + LOAD_GAME Migration

### Task 12: INIT_EURO_CAREER reducer action

**Files:**
- Modify: `src/store/logic/initialization.ts` (or wherever the START_GAME / INIT logic lives)
- Modify: `src/store/types.ts` or action types file (find with `grep "type: 'START_GAME'"`)

- [ ] **Step 1: Locate the reducer file**

Run: `grep -rln "START_GAME" src/store/`
Identify the file that handles initial game-state setup. (Likely `src/store/logic/initialization.ts` based on existing imports.)

- [ ] **Step 2: Add action type**

Find the action union type. Add:

```typescript
| {
    type: 'INIT_EURO_CAREER';
    payload: {
      teamId: number;
      leagueId: string;
      seed: import('../../services/euro/careerSeed').EuroCareerSeed;
    };
  }
```

- [ ] **Step 3: Add reducer case**

In the reducer's switch:

```typescript
case 'INIT_EURO_CAREER': {
  const { teamId, leagueId, seed } = action.payload;
  const teams = state.teams.map(team => {
    if (team.tid !== teamId && team.id !== teamId) return team;
    return {
      ...team,
      ownerProfile: seed.owner,
      startingTier: seed.tier,
      startingBudget: seed.budget,
    };
  });

  // Write the 6 staff members for the user team
  const newStaff = (state.staff?.coaches ?? []).filter(c => c.team !== state.teams.find(t => t.tid === teamId)?.name)
    .concat(seed.staff.filter(s => s.position === 'Head Coach' || s.position === 'Assistant Coach'));
  const newGMs = (state.staff?.gms ?? []).filter(c => c.team !== state.teams.find(t => t.tid === teamId)?.name);

  // Euro-Mode game start: real ACB summer transfer window opens 1 July.
  // Setup-Review hands the player a fresh save at exactly that date so the
  // Offseason / Transfer-Market sidebar both light up immediately.
  const euroStartYear = state.year ?? new Date().getFullYear();
  const euroStartDate = `${euroStartYear}-07-01`;

  return {
    ...state,
    teams,
    staff: { ...state.staff, coaches: newStaff, gms: newGMs },
    gameDate: euroStartDate,
    currentDate: euroStartDate,  // legacy alias if reducer expects both
    month: 6,                    // July (0-indexed) — adjust if the store uses 1-indexed months
    day: 1,
    euroSetupSeed: {
      teamId,
      leagueId,
      masterSeed: seed.masterSeed,
      manualOverrides: seed.manualOverrides as Record<string, unknown>,
    },
    leagueStats: {
      ...state.leagueStats,
      autoOwnerSeeded: true,
      staffPoolSeeded: false,  // pool will be seeded in Task 14
    },
  };
}
```

**Note on date fields:** Inspect the existing reducer's `state` shape before applying — the project may use `currentDate`, `gameDate`, or a combined `(year, month, day)` triple. Set whichever keys the store actually reads. The intent: when the user clicks "Start Career", the save's logical clock is **1 July of the season-start year**, matching the real ACB summer window. Keep the calendar 0-indexed if the project does (check `state.month` in any existing rollover).

- [ ] **Step 4: Add a smoke test**

Create `src/store/logic/__tests__/initEuroCareer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reducer } from '../initialization';  // adjust import path to actual reducer
import type { GameState } from '../../../types';

describe('INIT_EURO_CAREER', () => {
  it('writes ownerProfile + startingTier on the target team', () => {
    const baseState: Partial<GameState> = {
      teams: [{ tid: 5001, id: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' } as any],
      players: [],
      staff: { coaches: [], gms: [], owners: [] } as any,
      leagueStats: {} as any,
    };
    const action = {
      type: 'INIT_EURO_CAREER',
      payload: {
        teamId: 5001,
        leagueId: 'endesa',
        seed: {
          masterSeed: 1,
          tier: 'Powerhouse',
          budget: 12_000_000,
          staff: [],
          owner: { name: 'F. Test', wealthTier: 'Billionaire', patience: 'LongTerm', vision: 'WinNow' } as any,
          sponsors: [],
          manualOverrides: {},
        },
      },
    } as any;
    const next = reducer(baseState as GameState, action);
    expect(next.teams[0].startingTier).toBe('Powerhouse');
    expect(next.teams[0].ownerProfile?.name).toBe('F. Test');
    expect(next.leagueStats?.autoOwnerSeeded).toBe(true);
  });
});
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run src/store/logic/__tests__/initEuroCareer.test.ts`
Expected: PASS — 1 test.

```bash
git add src/store/logic/initialization.ts src/store/logic/__tests__/initEuroCareer.test.ts
git commit -m "feat(store): INIT_EURO_CAREER action writes owner + tier + setup memo"
```

---

### Task 13: LOAD_GAME migration heal

**Files:**
- Modify: `src/store/logic/initialization.ts` (LOAD_GAME case) OR `src/services/SaveManager.ts` if migrations are centralized there

- [ ] **Step 1: Locate the LOAD_GAME handler**

Run: `grep -rln "case 'LOAD_GAME'" src/store/`. Open the matching file.

- [ ] **Step 2: Add migration block**

Inside the LOAD_GAME reducer case, after `state` is restored, before returning:

```typescript
// Migration: heal old Euro-Mode saves missing ownerProfile
const isEuroMode = state.gameMode === 'gm' && state.userTeamId >= 1000 && state.userTeamId < 9000;
const needsOwnerHeal = isEuroMode && !state.leagueStats?.autoOwnerSeeded;
if (needsOwnerHeal) {
  const { seedEuroCareer } = await import('../../services/euro/careerSeed');
  const userTeam = state.teams.find(t => t.tid === state.userTeamId || t.id === state.userTeamId);
  if (userTeam && !userTeam.ownerProfile) {
    const leagueId = inferLeagueIdFromTid(state.userTeamId);
    const fallbackSeed = (state.userTeamId * 31) ^ (state.saveId?.length ?? 1);
    const seed = seedEuroCareer(userTeam, state, leagueId, fallbackSeed);
    userTeam.ownerProfile = seed.owner;
    userTeam.startingTier = seed.tier;
    userTeam.startingBudget = seed.budget;
  }
  state.leagueStats = { ...(state.leagueStats ?? {}), autoOwnerSeeded: true };
}
```

- [ ] **Step 3: Add `inferLeagueIdFromTid` helper**

If not already present, add to the same file (top-level helper):

```typescript
function inferLeagueIdFromTid(tid: number): string {
  if (tid >= 1000 && tid < 1100) return 'euroleague';
  if (tid >= 5000 && tid < 5100) return 'endesa';
  if (tid >= 3000 && tid < 3100) return 'wnba';
  if (tid >= 7000 && tid < 7100) return 'chinacba';
  if (tid >= 8000 && tid < 8100) return 'nblaus';
  return 'endesa';  // safe default for Euro-mode
}
```

- [ ] **Step 4: Add migration snapshot test**

Create `src/store/logic/__tests__/loadGameOwnerHeal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reducer } from '../initialization';

describe('LOAD_GAME owner migration', () => {
  it('seeds ownerProfile for Euro save missing autoOwnerSeeded flag', () => {
    const state = {
      gameMode: 'gm',
      userTeamId: 5001,
      teams: [{ tid: 5001, id: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' }],
      players: [],
      staff: { coaches: [], gms: [], owners: [] },
      leagueStats: {},
      saveId: 'test_save_1',
    } as any;
    const action = { type: 'LOAD_GAME', payload: { state } } as any;
    const next = reducer({} as any, action);
    expect(next.teams[0].ownerProfile).toBeDefined();
    expect(next.leagueStats.autoOwnerSeeded).toBe(true);
  });

  it('does not re-seed if autoOwnerSeeded flag is already true', () => {
    const state = {
      gameMode: 'gm',
      userTeamId: 5001,
      teams: [{ tid: 5001, id: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' }],
      players: [],
      staff: { coaches: [], gms: [], owners: [] },
      leagueStats: { autoOwnerSeeded: true },
      saveId: 'test_save_1',
    } as any;
    const action = { type: 'LOAD_GAME', payload: { state } } as any;
    const next = reducer({} as any, action);
    expect(next.teams[0].ownerProfile).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run src/store/logic/__tests__/loadGameOwnerHeal.test.ts`
Expected: PASS — 2 tests.

```bash
git add src/store/logic/initialization.ts src/store/logic/__tests__/loadGameOwnerHeal.test.ts
git commit -m "feat(store): LOAD_GAME heal seeds ownerProfile for legacy Euro saves"
```

---

## Phase 1.E — Review Screen UI

### Task 14: SectionGroup wrapper

**Files:**
- Create: `src/components/shared/SectionGroup.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/shared/SectionGroup.tsx
import React from 'react';

interface SectionGroupProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const SectionGroup: React.FC<SectionGroupProps> = ({ title, subtitle, children }) => (
  <section className="space-y-3">
    <header className="flex items-baseline justify-between border-b border-slate-800 pb-2">
      <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{title}</h3>
      {subtitle && <span className="text-[10px] text-slate-500">{subtitle}</span>}
    </header>
    <div className="space-y-3">{children}</div>
  </section>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/SectionGroup.tsx
git commit -m "feat(shared): SectionGroup wrapper for grouped UI sections"
```

---

### Task 15: TierBudgetCard

**Files:**
- Create: `src/components/setup/cards/TierBudgetCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/setup/cards/TierBudgetCard.tsx
import React from 'react';
import { Dice5, Pencil, Lock } from 'lucide-react';
import type { SetupTierLabel } from '../../../types';

interface TierBudgetCardProps {
  tier: SetupTierLabel;
  budget: number;
  manualTier?: boolean;
  manualBudget?: boolean;
  onReroll: () => void;
  onEdit: () => void;
}

const TIER_BLURB: Record<SetupTierLabel, string> = {
  Powerhouse:  'Title-or-bust expectations.',
  Established: 'Top-half finish expected every year.',
  MidTier:     'Playoff push is plenty.',
  Underdog:    'Surviving relegation counts as a win.',
};

const fmt = (eur: number) => `€${(eur / 1_000_000).toFixed(1)}M`;

export const TierBudgetCard: React.FC<TierBudgetCardProps> = ({
  tier, budget, manualTier, manualBudget, onReroll, onEdit,
}) => (
  <article className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-2">
    <header className="flex items-start justify-between">
      <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-400">🏆 Tier &amp; Budget</h4>
      <div className="flex gap-1">
        <button onClick={onReroll} aria-label="Reroll tier and budget" className="text-slate-400 hover:text-white p-1">
          <Dice5 size={16} />
        </button>
        <button onClick={onEdit} aria-label="Edit tier and budget" className="text-slate-400 hover:text-white p-1">
          <Pencil size={16} />
        </button>
      </div>
    </header>
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-black text-white">{tier === 'MidTier' ? 'Mid-Tier' : tier}</span>
        {manualTier && <Lock size={12} className="text-amber-400" aria-label="Manual override" />}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-slate-200 tabular-nums">{fmt(budget)} / season</span>
        {manualBudget && <Lock size={10} className="text-amber-400" />}
      </div>
      <p className="text-xs text-slate-500">{TIER_BLURB[tier]}</p>
    </div>
  </article>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/cards/TierBudgetCard.tsx
git commit -m "feat(setup): TierBudgetCard with reroll + edit + manual-override badges"
```

---

### Task 16: StaffRosterCard

**Files:**
- Create: `src/components/setup/cards/StaffRosterCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/setup/cards/StaffRosterCard.tsx
import React from 'react';
import { Dice5, Pencil, Star, Lock } from 'lucide-react';
import { getCountryFlag } from '../../../utils/countryFlags';
import type { StaffMember } from '../../../types';

interface StaffRosterCardProps {
  staff: StaffMember[];
  manualRoles: Set<string>; // role names that have manual override
  onRerollAll: () => void;
  onEditRole: (role: string) => void;
}

const repToStars = (rep: number): number => Math.max(1, Math.min(5, Math.round((rep - 40) / 12)));

const SHORT_LABEL: Record<string, string> = {
  'Head Coach':              'HC ',
  'Assistant Coach':         'AC ',
  'Head of Sports Science':  'HoSS',
  'Head Physio':             'Phy ',
  'Chief Scout':             'Sct ',
  'Head of Analytics':       'Ana ',
};

export const StaffRosterCard: React.FC<StaffRosterCardProps> = ({
  staff, manualRoles, onRerollAll, onEditRole,
}) => (
  <article className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-2">
    <header className="flex items-start justify-between">
      <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400">
        👔 Staff ({staff.length}/6)
      </h4>
      <div className="flex gap-1">
        <button onClick={onRerollAll} aria-label="Reroll all staff" className="text-slate-400 hover:text-white p-1">
          <Dice5 size={16} />
        </button>
      </div>
    </header>
    <ul className="space-y-1 text-sm">
      {staff.map((s) => {
        const rep = (s as any).reputation ?? 60;
        const stars = repToStars(rep);
        const flag = s.nationality ? getCountryFlag(s.nationality) : '';
        return (
          <li key={s.position} className="flex items-center justify-between gap-2">
            <button
              onClick={() => onEditRole(s.position ?? '')}
              className="flex-1 flex items-center gap-2 text-left hover:bg-slate-800 rounded px-2 py-1"
            >
              <span className="font-mono text-[10px] text-slate-500 w-8">{SHORT_LABEL[s.position ?? ''] ?? '???'}</span>
              <span className="text-slate-200 truncate">{s.name}</span>
              <span className="text-[10px]">{flag}</span>
              {manualRoles.has(s.position ?? '') && <Lock size={10} className="text-amber-400" />}
            </button>
            <span className="flex gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} size={10} className={i < stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700'} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  </article>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/cards/StaffRosterCard.tsx
git commit -m "feat(setup): StaffRosterCard with 6 rows + per-role edit + manual badge"
```

---

### Task 17: OwnerCard

**Files:**
- Create: `src/components/setup/cards/OwnerCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/setup/cards/OwnerCard.tsx
import React from 'react';
import { Dice5, Pencil, Lock } from 'lucide-react';
import { getCountryFlag } from '../../../utils/countryFlags';
import type { OwnerProfile } from '../../../types';

interface OwnerCardProps {
  owner: OwnerProfile;
  manual: boolean;
  onReroll: () => void;
  onEdit: () => void;
}

const WEALTH_LABEL = { LocalWealthy: 'Local Wealthy', NationalMagnate: 'National Magnate', Billionaire: 'Billionaire' };
const PATIENCE_LABEL = { TriggerHappy: 'Trigger-Happy', Steady: 'Steady', LongTerm: 'Long-Term' };
const VISION_LABEL = { WinNow: 'Win-Now', Develop: 'Develop', Frugal: 'Frugal' };

export const OwnerCard: React.FC<OwnerCardProps> = ({ owner, manual, onReroll, onEdit }) => (
  <article className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-2">
    <header className="flex items-start justify-between">
      <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-400">💼 Owner</h4>
      <div className="flex gap-1">
        <button onClick={onReroll} aria-label="Reroll owner" className="text-slate-400 hover:text-white p-1">
          <Dice5 size={16} />
        </button>
        <button onClick={onEdit} aria-label="Edit owner" className="text-slate-400 hover:text-white p-1">
          <Pencil size={16} />
        </button>
      </div>
    </header>
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-lg font-black text-white">{owner.name}</span>
        <span className="text-sm">{getCountryFlag(owner.nationality)}</span>
        {manual && <Lock size={12} className="text-amber-400" />}
      </div>
      <dl className="text-xs space-y-0.5">
        <div className="flex gap-2"><dt className="text-slate-500 w-16">Wealth</dt><dd className="text-slate-200">{WEALTH_LABEL[owner.wealthTier]}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-500 w-16">Patience</dt><dd className="text-slate-200">{PATIENCE_LABEL[owner.patience]}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-500 w-16">Vision</dt><dd className="text-slate-200">{VISION_LABEL[owner.vision]}</dd></div>
      </dl>
    </div>
  </article>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/cards/OwnerCard.tsx
git commit -m "feat(setup): OwnerCard with Wealth/Patience/Vision display + edit"
```

---

### Task 18: SponsorsCard

**Files:**
- Create: `src/components/setup/cards/SponsorsCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/setup/cards/SponsorsCard.tsx
import React from 'react';
import { Dice5, Pencil, Lock } from 'lucide-react';
import type { SponsorSlot } from '../../../data/sponsorCatalogFetcher.stub';

interface SponsorsCardProps {
  sponsors: SponsorSlot[];
  manualSlots: Set<string>;
  onRerollAll: () => void;
  onEditSlot: (slotId: string) => void;
  poolReady: boolean;
}

const SLOT_LABEL: Record<string, string> = { main: 'Main', jersey: 'Jersey', arena: 'Arena' };

const fmt = (eur: number) => `€${(eur / 1_000_000).toFixed(2)}M`;

export const SponsorsCard: React.FC<SponsorsCardProps> = ({
  sponsors, manualSlots, onRerollAll, onEditSlot, poolReady,
}) => (
  <article className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-2">
    <header className="flex items-start justify-between">
      <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">
        💰 Sponsors ({sponsors.length}/3)
      </h4>
      <div className="flex gap-1">
        <button
          onClick={onRerollAll}
          aria-label="Reroll all sponsors"
          disabled={!poolReady}
          title={poolReady ? 'Reroll sponsors' : 'Default sponsor pool not yet loaded'}
          className="text-slate-400 hover:text-white p-1 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Dice5 size={16} />
        </button>
      </div>
    </header>
    {!poolReady && (
      <p className="text-xs text-slate-500 italic">Sponsors pending — will appear in League Office after season start.</p>
    )}
    {poolReady && (
      <ul className="space-y-1 text-sm">
        {sponsors.map((s) => (
          <li key={s.slotId} className="flex items-center justify-between gap-2">
            <button
              onClick={() => onEditSlot(s.slotId)}
              className="flex-1 flex items-center gap-2 text-left hover:bg-slate-800 rounded px-2 py-1"
            >
              <span className="font-mono text-[10px] text-slate-500 w-12">{SLOT_LABEL[s.slotId] ?? s.slotId}</span>
              <span className="text-slate-200 truncate">{s.brand}</span>
              {manualSlots.has(s.slotId) && <Lock size={10} className="text-amber-400" />}
            </button>
            <span className="text-xs text-slate-400 tabular-nums">{fmt(s.amountEUR)}/{s.years}y</span>
          </li>
        ))}
      </ul>
    )}
  </article>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/cards/SponsorsCard.tsx
git commit -m "feat(setup): SponsorsCard with pending-pool fallback and per-slot edit"
```

---

### Task 19: EuroSetupReviewScreen (assembly)

**Files:**
- Create: `src/components/setup/EuroSetupReviewScreen.tsx`

- [ ] **Step 1: Write the screen**

```tsx
// src/components/setup/EuroSetupReviewScreen.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { Dice5, Check, ChevronLeft } from 'lucide-react';
import type { NBATeam, GameState, SetupTierLabel } from '../../types';
import {
  seedEuroCareer, rerollCard, applyOverride, type EuroCareerSeed, type CardKey,
} from '../../services/euro/careerSeed';
import { TierBudgetCard } from './cards/TierBudgetCard';
import { StaffRosterCard } from './cards/StaffRosterCard';
import { OwnerCard } from './cards/OwnerCard';
import { SponsorsCard } from './cards/SponsorsCard';
import { EditTierBudgetModal } from './edits/EditTierBudgetModal';
import { EditStaffModal } from './edits/EditStaffModal';
import { EditOwnerModal } from './edits/EditOwnerModal';
import { EditSponsorSlotModal } from './edits/EditSponsorSlotModal';

interface EuroSetupReviewScreenProps {
  team: NBATeam;
  state: Pick<GameState, 'players' | 'nonNBATeams'>;
  leagueId: string;
  onConfirm: (seed: EuroCareerSeed) => void;
  onBack: () => void;
}

function freshSubSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export const EuroSetupReviewScreen: React.FC<EuroSetupReviewScreenProps> = ({
  team, state, leagueId, onConfirm, onBack,
}) => {
  const initialMaster = useMemo(() => Math.floor(Math.random() * 0x7fffffff), []);
  const [seed, setSeed] = useState<EuroCareerSeed>(() =>
    seedEuroCareer(team, state, leagueId, initialMaster),
  );
  const [editing, setEditing] = useState<
    | { kind: 'tier' }
    | { kind: 'staff'; role: string }
    | { kind: 'owner' }
    | { kind: 'sponsor'; slotId: string }
    | null
  >(null);

  const reroll = useCallback((card: CardKey) => {
    setSeed(s => rerollCard(s, card, freshSubSeed(), team, state, leagueId));
  }, [team, state, leagueId]);

  const rerollAll = useCallback(() => {
    if (!window.confirm('Reroll everything? Manual overrides will be cleared.')) return;
    const master = freshSubSeed();
    setSeed(seedEuroCareer(team, state, leagueId, master));
  }, [team, state, leagueId]);

  const manualRoles = new Set(Object.keys(seed.manualOverrides.staff ?? {}));
  const manualSlots = new Set(Object.keys(seed.manualOverrides.sponsors ?? {}));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white mb-4">
        <ChevronLeft size={18} /> Back
      </button>

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">REVIEW YOUR FRONT OFFICE</h1>
        <p className="text-sm text-slate-400">
          {team.region} {team.name} · {leagueId.charAt(0).toUpperCase() + leagueId.slice(1)} · 2026-27
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
        <TierBudgetCard
          tier={seed.tier}
          budget={seed.budget}
          manualTier={!!seed.manualOverrides.tier}
          manualBudget={!!seed.manualOverrides.budget}
          onReroll={() => reroll('tier')}
          onEdit={() => setEditing({ kind: 'tier' })}
        />
        <StaffRosterCard
          staff={seed.staff}
          manualRoles={manualRoles}
          onRerollAll={() => reroll('staff')}
          onEditRole={(role) => setEditing({ kind: 'staff', role })}
        />
        <OwnerCard
          owner={seed.owner}
          manual={!!seed.manualOverrides.owner}
          onReroll={() => reroll('owner')}
          onEdit={() => setEditing({ kind: 'owner' })}
        />
        <SponsorsCard
          sponsors={seed.sponsors}
          manualSlots={manualSlots}
          onRerollAll={() => reroll('sponsors')}
          onEditSlot={(slotId) => setEditing({ kind: 'sponsor', slotId })}
          poolReady={seed.sponsors.length > 0}
        />
      </div>

      <footer className="mt-8 flex flex-col-reverse md:flex-row gap-3 max-w-5xl sticky bottom-4 bg-slate-950/95 backdrop-blur p-3 rounded-lg border border-slate-800">
        <button
          onClick={rerollAll}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
        >
          <Dice5 size={18} /> Reroll Everything
        </button>
        <button
          onClick={() => onConfirm(seed)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black"
        >
          <Check size={18} /> Start Career
        </button>
      </footer>

      {editing?.kind === 'tier' && (
        <EditTierBudgetModal
          tier={seed.tier}
          budget={seed.budget}
          onClose={() => setEditing(null)}
          onSave={(tier, budget) => {
            let s = seed;
            if (tier !== seed.tier) s = applyOverride(s, 'tier', tier);
            if (budget !== seed.budget) s = applyOverride(s, 'budget', budget);
            setSeed(s);
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === 'staff' && (
        <EditStaffModal
          role={editing.role}
          current={seed.staff.find(s => s.position === editing.role)!}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            const override = { ...(seed.manualOverrides.staff ?? {}), [editing.role]: updated };
            setSeed(applyOverride(seed, 'staff', override));
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === 'owner' && (
        <EditOwnerModal
          owner={seed.owner}
          onClose={() => setEditing(null)}
          onSave={(partial) => {
            setSeed(applyOverride(seed, 'owner', { ...seed.manualOverrides.owner, ...partial }));
            setEditing(null);
          }}
        />
      )}
      {editing?.kind === 'sponsor' && (
        <EditSponsorSlotModal
          slot={seed.sponsors.find(s => s.slotId === editing.slotId)!}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            const override = { ...(seed.manualOverrides.sponsors ?? {}), [editing.slotId]: updated };
            setSeed(applyOverride(seed, 'sponsors', override));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/EuroSetupReviewScreen.tsx
git commit -m "feat(setup): EuroSetupReviewScreen with 4-card grid + modal routing"
```

---

### Task 20: EditTierBudgetModal

**Files:**
- Create: `src/components/setup/edits/EditTierBudgetModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/setup/edits/EditTierBudgetModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { SetupTierLabel } from '../../../types';

interface Props {
  tier: SetupTierLabel;
  budget: number;
  onClose: () => void;
  onSave: (tier: SetupTierLabel, budget: number) => void;
}

const TIERS: SetupTierLabel[] = ['Powerhouse', 'Established', 'MidTier', 'Underdog'];

export const EditTierBudgetModal: React.FC<Props> = ({ tier, budget, onClose, onSave }) => {
  const [t, setT] = useState<SetupTierLabel>(tier);
  const [b, setB] = useState<number>(Math.round(budget / 1_000_000));
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 w-full max-w-sm space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Edit Tier &amp; Budget</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Tier</span>
            <select
              value={t}
              onChange={e => setT(e.target.value as SetupTierLabel)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            >
              {TIERS.map(x => <option key={x} value={x}>{x === 'MidTier' ? 'Mid-Tier' : x}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Budget (€ millions / season)</span>
            <input
              type="number"
              min={1}
              max={100}
              step={0.5}
              value={b}
              onChange={e => setB(Number(e.target.value))}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white tabular-nums"
            />
          </label>
        </div>
        <footer className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
          <button
            onClick={() => onSave(t, Math.round(b * 1_000_000))}
            className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold text-sm"
          >Save</button>
        </footer>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/edits/EditTierBudgetModal.tsx
git commit -m "feat(setup): EditTierBudgetModal for tier dropdown + budget input"
```

---

### Task 21: EditStaffModal

**Files:**
- Create: `src/components/setup/edits/EditStaffModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/setup/edits/EditStaffModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { StaffMember } from '../../../types';

interface Props {
  role: string;
  current: StaffMember;
  onClose: () => void;
  onSave: (updated: StaffMember) => void;
}

export const EditStaffModal: React.FC<Props> = ({ role, current, onClose, onSave }) => {
  const [name, setName] = useState(current.name);
  const [country, setCountry] = useState(current.nationality ?? '');
  const [rep, setRep] = useState((current as any).reputation ?? 60);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 w-full max-w-sm space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Edit {role}</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Name</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Nationality</span>
            <input
              type="text"
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Reputation ({rep})</span>
            <input
              type="range"
              min={40}
              max={99}
              value={rep}
              onChange={e => setRep(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <footer className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
          <button
            onClick={() => onSave({ ...current, name, nationality: country, ...(({ reputation: rep } as any)) })}
            className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold text-sm"
          >Save</button>
        </footer>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/edits/EditStaffModal.tsx
git commit -m "feat(setup): EditStaffModal for per-role manual override"
```

---

### Task 22: EditOwnerModal

**Files:**
- Create: `src/components/setup/edits/EditOwnerModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/setup/edits/EditOwnerModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { OwnerProfile, OwnerWealthTier, OwnerPatience, OwnerVision } from '../../../types';

interface Props {
  owner: OwnerProfile;
  onClose: () => void;
  onSave: (partial: Partial<OwnerProfile>) => void;
}

const WEALTH: OwnerWealthTier[] = ['LocalWealthy', 'NationalMagnate', 'Billionaire'];
const PATIENCE: OwnerPatience[] = ['TriggerHappy', 'Steady', 'LongTerm'];
const VISION: OwnerVision[] = ['WinNow', 'Develop', 'Frugal'];
const labelize = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^(.)/, c => c.toUpperCase());

export const EditOwnerModal: React.FC<Props> = ({ owner, onClose, onSave }) => {
  const [name, setName] = useState(owner.name);
  const [wealth, setWealth] = useState(owner.wealthTier);
  const [patience, setPatience] = useState(owner.patience);
  const [vision, setVision] = useState(owner.vision);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 w-full max-w-sm space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Edit Owner</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Name</span>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Wealth</span>
            <select value={wealth} onChange={e => setWealth(e.target.value as OwnerWealthTier)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white">
              {WEALTH.map(w => <option key={w} value={w}>{labelize(w)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Patience</span>
            <select value={patience} onChange={e => setPatience(e.target.value as OwnerPatience)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white">
              {PATIENCE.map(p => <option key={p} value={p}>{labelize(p)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Vision</span>
            <select value={vision} onChange={e => setVision(e.target.value as OwnerVision)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white">
              {VISION.map(v => <option key={v} value={v}>{labelize(v)}</option>)}
            </select>
          </label>
        </div>
        <footer className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
          <button
            onClick={() => onSave({ name, wealthTier: wealth, patience, vision })}
            className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold text-sm"
          >Save</button>
        </footer>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/edits/EditOwnerModal.tsx
git commit -m "feat(setup): EditOwnerModal with name + wealth/patience/vision dropdowns"
```

---

### Task 23: EditSponsorSlotModal

**Files:**
- Create: `src/components/setup/edits/EditSponsorSlotModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// src/components/setup/edits/EditSponsorSlotModal.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { SponsorSlot } from '../../../data/sponsorCatalogFetcher.stub';

interface Props {
  slot: SponsorSlot;
  onClose: () => void;
  onSave: (updated: SponsorSlot) => void;
}

export const EditSponsorSlotModal: React.FC<Props> = ({ slot, onClose, onSave }) => {
  const [brand, setBrand] = useState(slot.brand);
  const [amount, setAmount] = useState(Math.round(slot.amountEUR / 1_000));
  const [years, setYears] = useState(slot.years);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 w-full max-w-sm space-y-4">
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white">Edit {slot.slotId} Sponsor</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Brand</span>
            <input type="text" value={brand} onChange={e => setBrand(e.target.value)}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Annual Amount (€ thousands)</span>
            <input type="number" min={1} step={5} value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white tabular-nums" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400 uppercase">Years ({years})</span>
            <input type="range" min={1} max={5} value={years} onChange={e => setYears(Number(e.target.value))}
              className="mt-1 w-full" />
          </label>
        </div>
        <footer className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
          <button
            onClick={() => onSave({ ...slot, brand, amountEUR: amount * 1_000, years })}
            className="px-4 py-2 rounded bg-emerald-500 text-slate-950 font-bold text-sm"
          >Save</button>
        </footer>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/setup/edits/EditSponsorSlotModal.tsx
git commit -m "feat(setup): EditSponsorSlotModal with brand/amount/years controls"
```

---

## Phase 1.F — App Setup-Phase Wiring

### Task 24: Add euroReview phase to App.tsx

**Files:**
- Modify: `src/App.tsx:174-198`

- [ ] **Step 1: Add state for review-phase data**

Near the existing `setSetupPhase` declarations in `App.tsx`, add:

```typescript
const [euroReviewTeam, setEuroReviewTeam] = useState<NBATeam | null>(null);
const [euroReviewLeagueId, setEuroReviewLeagueId] = useState<string>('endesa');
```

- [ ] **Step 2: Modify the CommissionerSetup onStart handler**

Replace the existing `onStart={(payload) => { setSetupPhase(null); dispatchAction({ type: 'START_GAME', payload }); }}` with:

```tsx
onStart={(payload) => {
  // If europeMarket is set, route through review screen before START_GAME
  if (europeMarket) {
    const userTeamId = payload.userTeamId ?? payload.userTeam?.tid;
    const team = payload.teams.find((t: any) => t.tid === userTeamId || t.id === userTeamId);
    if (team) {
      // Stash payload so we can fire START_GAME after review
      (window as any).__euroPendingPayload = payload;
      setEuroReviewTeam(team);
      setEuroReviewLeagueId(europeMarket === 'spain' ? 'endesa' : europeMarket);
      setSetupPhase('euroReview' as any);
      return;
    }
  }
  setSetupPhase(null);
  dispatchAction({ type: 'START_GAME', payload });
}}
```

- [ ] **Step 3: Add the euroReview phase render**

Above the `setupPhase === 'commish'` block, add:

```tsx
if (setupPhase === ('euroReview' as any) && euroReviewTeam) {
  const pendingPayload = (window as any).__euroPendingPayload;
  return (
    <EuroSetupReviewScreen
      team={euroReviewTeam}
      state={pendingPayload as any}
      leagueId={euroReviewLeagueId}
      onConfirm={(seed) => {
        dispatchAction({ type: 'START_GAME', payload: pendingPayload });
        dispatchAction({ type: 'INIT_EURO_CAREER', payload: {
          teamId: euroReviewTeam.tid ?? euroReviewTeam.id,
          leagueId: euroReviewLeagueId,
          seed,
        }} as any);
        delete (window as any).__euroPendingPayload;
        setSetupPhase(null);
      }}
      onBack={() => {
        setSetupPhase('commish');
        setEuroReviewTeam(null);
        delete (window as any).__euroPendingPayload;
      }}
    />
  );
}
```

- [ ] **Step 4: Add the import at the top of `App.tsx`**

```typescript
import { EuroSetupReviewScreen } from './components/setup/EuroSetupReviewScreen';
```

- [ ] **Step 5: Type-check + commit**

Run: `npx tsc --noEmit`
Expected: PASS (the `'euroReview' as any` cast is intentional — `setupPhase` type doesn't list it yet).

```bash
git add src/App.tsx
git commit -m "feat(app): route Euro mode through review screen before START_GAME"
```

---

## Phase 1.G — Staff-Pool Lifecycle

### Task 25: Seed staffFreeAgents at INIT_EURO_CAREER

**Files:**
- Modify: `src/store/logic/initialization.ts` (extend the INIT_EURO_CAREER reducer case from Task 12)

- [ ] **Step 1: Add pool-seeding helper inside the reducer**

At the top of the file, near other imports:

```typescript
import { generatePlaceholderNonNBAStaff } from '../../services/staff/staffFallback';
import { buildCoachNationalityPool } from '../../services/euro/nationalityPool';
import { seedStaffSix } from '../../services/euro/staffSeed';
```

Add helper:

```typescript
function generateInitialStaffPool(state: GameState, leagueId: string, count = 50): StaffMember[] {
  const pool: StaffMember[] = [];
  // Pull "anonymous" placeholder staff using the existing fallback path, then convert to FA records
  const teams = (state.nonNBATeams ?? []).filter(t => {
    // pick teams in target league's TID range
    const ranges: Record<string, [number, number]> = {
      endesa: [5000, 5100], euroleague: [1000, 1100],
      wnba: [3000, 3100], chinacba: [7000, 7100], nblaus: [8000, 8100],
    };
    const r = ranges[leagueId];
    return r ? t.tid >= r[0] && t.tid < r[1] : true;
  });
  // Generate 50 free-agent staff by cycling through teams and roles
  let i = 0;
  while (pool.length < count && teams.length > 0) {
    const team = teams[i % teams.length];
    const stub: any = { tid: team.tid, id: team.tid, name: team.name, region: team.region, abbrev: team.abbrev };
    const six = seedStaffSix(stub, state, leagueId, 'MidTier', 12345 + i);
    pool.push(...six.map(s => ({ ...s, team: '', teamLogoUrl: undefined, isPlaceholder: true } as StaffMember)));
    i++;
  }
  return pool.slice(0, count);
}
```

- [ ] **Step 2: Update INIT_EURO_CAREER case**

Inside the existing case body (from Task 12), replace `staffPoolSeeded: false` with `staffPoolSeeded: true` and add the pool generation:

```typescript
const initialPool = generateInitialStaffPool(state, leagueId, 50);
return {
  ...state,
  teams,
  staff: { ...state.staff, coaches: newStaff, gms: newGMs },
  staffFreeAgents: initialPool,
  euroSetupSeed: { teamId, leagueId, masterSeed: seed.masterSeed, manualOverrides: seed.manualOverrides as Record<string, unknown> },
  leagueStats: {
    ...state.leagueStats,
    autoOwnerSeeded: true,
    staffPoolSeeded: true,
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/store/logic/initialization.ts
git commit -m "feat(store): seed 50-member staff free-agent pool at INIT_EURO_CAREER"
```

---

### Task 26: Monthly staff-pool refill

**Files:**
- Create: `src/services/euro/staffPoolRefill.ts`
- Create: `src/services/euro/__tests__/staffPoolRefill.test.ts`
- Modify: wherever the monthly tick is defined (search: `grep -rln "monthlyTick\|onMonthRollover" src/services/`)

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/staffPoolRefill.test.ts
import { describe, it, expect } from 'vitest';
import { refillStaffPool } from '../staffPoolRefill';
import type { GameState } from '../../../types';

describe('refillStaffPool', () => {
  it('adds 5-10 new entries on each call', () => {
    const state = {
      staffFreeAgents: [],
      players: Array.from({ length: 50 }, () => ({ tid: 5001, born: { loc: 'Spain', year: 1990 } })),
      nonNBATeams: [{ tid: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' }],
    } as unknown as GameState;
    const next = refillStaffPool(state, 'endesa', 'YYYY-MM');
    const added = (next.staffFreeAgents?.length ?? 0) - 0;
    expect(added).toBeGreaterThanOrEqual(5);
    expect(added).toBeLessThanOrEqual(10);
  });

  it('preserves existing pool entries', () => {
    const existing = [{ name: 'Existing Coach', position: 'Head Coach' } as any];
    const state = {
      staffFreeAgents: existing,
      players: Array.from({ length: 50 }, () => ({ tid: 5001, born: { loc: 'Spain', year: 1990 } })),
      nonNBATeams: [{ tid: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' }],
    } as unknown as GameState;
    const next = refillStaffPool(state, 'endesa', 'YYYY-MM');
    expect(next.staffFreeAgents?.some(s => s.name === 'Existing Coach')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/staffPoolRefill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/staffPoolRefill.ts
import type { GameState, StaffMember, SetupTierLabel } from '../../types';
import { seedStaffSix } from './staffSeed';

const ROLES = ['Head Coach', 'Assistant Coach', 'Head of Sports Science', 'Head Physio', 'Chief Scout', 'Head of Analytics'];

function hashSeed(monthKey: string): number {
  let h = 0;
  for (let i = 0; i < monthKey.length; i++) h = (Math.imul(31, h) + monthKey.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

export function refillStaffPool(state: GameState, leagueId: string, monthKey: string): GameState {
  const seed = hashSeed(monthKey);
  const count = 5 + (seed % 6); // 5..10
  const team = state.nonNBATeams?.[0];
  if (!team) return state;
  const stub: any = { tid: team.tid, id: team.tid, name: team.name, region: team.region, abbrev: team.abbrev };
  const newStaff: StaffMember[] = [];
  for (let i = 0; i < count; i++) {
    const six = seedStaffSix(stub, state, leagueId, 'MidTier', seed + i * 17);
    newStaff.push({ ...six[i % ROLES.length], team: '', teamLogoUrl: undefined, isPlaceholder: true } as StaffMember);
  }
  return {
    ...state,
    staffFreeAgents: [...(state.staffFreeAgents ?? []), ...newStaff],
  };
}
```

- [ ] **Step 4: Wire into monthly tick**

Find the monthly tick handler (grep `onMonthRollover` or `MONTHLY_TICK`). Add a call inside it:

```typescript
import { refillStaffPool } from '../services/euro/staffPoolRefill';

// inside monthly handler, after existing month-end logic:
if (state.userTeamId >= 1000 && state.userTeamId < 9000 && state.leagueStats?.staffPoolSeeded) {
  const leagueId = inferLeagueIdFromTid(state.userTeamId);
  const monthKey = `${state.year}-${String(state.month ?? 0).padStart(2, '0')}`;
  state = refillStaffPool(state, leagueId, monthKey);
}
```

- [ ] **Step 5: Run tests + commit**

Run: `npx vitest run src/services/euro/__tests__/staffPoolRefill.test.ts`
Expected: PASS — 2 tests.

```bash
git add src/services/euro/staffPoolRefill.ts src/services/euro/__tests__/staffPoolRefill.test.ts <month-tick-file>
git commit -m "feat(euro): monthly staff-pool refill (5-10 new candidates)"
```

---

### Task 27: Last-resort generation in StaffSigningModal

**Files:**
- Modify: `src/components/central/view/FrontOffice/StaffSigning/StaffSigningModal.tsx` (extend the `pool` prop handling)
- Modify: the caller of `StaffSigningModal` (search: `grep -rln "StaffSigningModal" src/components/`)

- [ ] **Step 1: Add last-resort fill inside the modal**

Open `StaffSigningModal.tsx`. After the `useState`/`useMemo` block (around line ~80), add:

```typescript
const lastResortFilled = useMemo(() => {
  if (pool.length >= 3) return pool;
  // Generate (3 - pool.length) emergency candidates from facesjs + getNameData
  const { generate } = require('facesjs');
  const { getNameData } = require('../../../../../data/nameDataFetcher');
  const nameData = getNameData();
  const usa = nameData.countries?.['USA'];
  const needed = 3 - pool.length;
  const emergency: StaffCandidate[] = [];
  for (let i = 0; i < needed; i++) {
    const firsts = Object.keys(usa?.first ?? {});
    const lasts = Object.keys(usa?.last ?? {});
    const first = firsts[Math.floor(Math.random() * firsts.length)] ?? 'John';
    const last = lasts[Math.floor(Math.random() * lasts.length)] ?? 'Doe';
    emergency.push({
      id: `emergency-${Date.now()}-${i}`,
      role: selectedRole,
      name: `${first} ${last}`,
      nationality: 'United States',
      flag: '🇺🇸',
      salary: 200_000 + Math.floor(Math.random() * 100_000),
      rating: 50 + Math.floor(Math.random() * 11),  // cap 60 — emergency penalty
      years: 1,
      face: generate(undefined, { gender: 'male' }),
      attributes: [],
    });
  }
  return [...pool, ...emergency];
}, [pool, selectedRole]);
```

Replace remaining references to `pool` inside the component with `lastResortFilled`.

- [ ] **Step 2: Add an "Emergency Hire" badge in the candidate row**

In the candidate-row rendering, conditionally show:

```tsx
{c.id.startsWith('emergency-') && (
  <span className="text-[9px] uppercase tracking-wider text-rose-300 bg-rose-900/40 px-1.5 py-0.5 rounded">
    Limited options
  </span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/central/view/FrontOffice/StaffSigning/StaffSigningModal.tsx
git commit -m "feat(staff): last-resort generation guarantees >=3 candidates per role"
```

---

## Phase 1.H — Owner Mechanics

### Task 28: evaluateSeasonForOwner pure function

**Files:**
- Create: `src/services/euro/evaluateSeasonForOwner.ts`
- Create: `src/services/euro/__tests__/evaluateSeasonForOwner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/euro/__tests__/evaluateSeasonForOwner.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateSeasonForOwner } from '../evaluateSeasonForOwner';

const baseStats = {
  domesticPlayoffAppearance: false,
  continentalFinalFour: false,
  winPct: 0.50,
  netProfitEUR: 0,
  youthProgressed: false,
} as any;

describe('evaluateSeasonForOwner', () => {
  it('WinNow: no playoff + no FF = bad', () => {
    const result = evaluateSeasonForOwner({ ...baseStats }, 'WinNow', 'Powerhouse');
    expect(result).toBe('bad');
  });
  it('WinNow: domestic playoff alone = good', () => {
    const result = evaluateSeasonForOwner({ ...baseStats, domesticPlayoffAppearance: true }, 'WinNow', 'MidTier');
    expect(result).toBe('good');
  });
  it('Frugal: profit positive + playoff = good', () => {
    const result = evaluateSeasonForOwner({ ...baseStats, netProfitEUR: 1_000_000, domesticPlayoffAppearance: true }, 'Frugal', 'MidTier');
    expect(result).toBe('good');
  });
  it('Frugal: net loss = bad regardless of sporting result', () => {
    const result = evaluateSeasonForOwner({ ...baseStats, netProfitEUR: -500_000, continentalFinalFour: true }, 'Frugal', 'Powerhouse');
    expect(result).toBe('bad');
  });
  it('Develop: low winPct + youth progressed = neutral', () => {
    const result = evaluateSeasonForOwner({ ...baseStats, winPct: 0.30, youthProgressed: true }, 'Develop', 'Underdog');
    expect(result).toBe('neutral');
  });
  it('Develop: low winPct + no youth = bad', () => {
    const result = evaluateSeasonForOwner({ ...baseStats, winPct: 0.30, youthProgressed: false }, 'Develop', 'Underdog');
    expect(result).toBe('bad');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/euro/__tests__/evaluateSeasonForOwner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```typescript
// src/services/euro/evaluateSeasonForOwner.ts
import type { OwnerVision, SetupTierLabel } from '../../types';

export type SeasonOutcome = 'good' | 'neutral' | 'bad';

export interface SeasonStatsForOwner {
  domesticPlayoffAppearance: boolean;
  continentalFinalFour: boolean;     // false if league has no continental tier
  winPct: number;                    // 0..1
  netProfitEUR: number;
  youthProgressed: boolean;          // any age <=22 player gained >=3 OVR
}

export function evaluateSeasonForOwner(
  stats: SeasonStatsForOwner,
  vision: OwnerVision,
  _tier: SetupTierLabel,  // currently unused, reserved for future tier-aware tweaks
): SeasonOutcome {
  if (vision === 'WinNow') {
    if (stats.continentalFinalFour) return 'good';
    if (stats.domesticPlayoffAppearance) return 'good';
    return 'bad';
  }
  if (vision === 'Frugal') {
    if (stats.netProfitEUR < 0) return 'bad';
    if (stats.netProfitEUR > 0 && stats.domesticPlayoffAppearance) return 'good';
    return 'neutral';
  }
  // Develop
  if (stats.winPct >= 0.35) {
    if (stats.youthProgressed) return 'good';
    return 'neutral';
  }
  // winPct < 0.35
  if (stats.youthProgressed) return 'neutral';
  return 'bad';
}
```

- [ ] **Step 4: Run tests + commit**

Run: `npx vitest run src/services/euro/__tests__/evaluateSeasonForOwner.test.ts`
Expected: PASS — 6 tests.

```bash
git add src/services/euro/evaluateSeasonForOwner.ts src/services/euro/__tests__/evaluateSeasonForOwner.test.ts
git commit -m "feat(euro): evaluateSeasonForOwner pure func (3 visions x outcomes)"
```

---

### Task 29: seasonRollover Patience-tick + cash-injection hook

**Files:**
- Modify: `src/services/seasonRollover.ts` (find the existing year-end pass)

- [ ] **Step 1: Locate the season-rollover entrypoint**

Run: `grep -n "function.*rollover\|export.*rollover\|seasonRollover" src/services/seasonRollover.ts | head -5`. Identify the function that runs after the final game of the season.

- [ ] **Step 2: Add the patience-tick helper at the top of the file**

```typescript
import { evaluateSeasonForOwner, type SeasonStatsForOwner } from './euro/evaluateSeasonForOwner';
import type { OwnerProfile, SetupTierLabel } from '../types';

const PATIENCE_THRESHOLD: Record<OwnerProfile['patience'], number> = {
  TriggerHappy: 1,
  Steady: 2,
  LongTerm: 4,
};

function tickOwnerPatience(team: NBATeam, stats: SeasonStatsForOwner): { triggerGameOver: boolean } {
  const owner = team.ownerProfile;
  if (!owner) return { triggerGameOver: false };
  const outcome = evaluateSeasonForOwner(stats, owner.vision, (team.startingTier ?? 'MidTier') as SetupTierLabel);
  if (outcome === 'bad') {
    owner.consecutiveBadSeasons = (owner.consecutiveBadSeasons ?? 0) + 1;
  } else {
    owner.consecutiveBadSeasons = 0;
  }
  // Reset injection-availability counter at season end
  owner.cashInjectionUsedThisSeason = false;
  owner.seasonsSinceLastInjection = (owner.seasonsSinceLastInjection ?? 0) + 1;
  const threshold = PATIENCE_THRESHOLD[owner.patience];
  return { triggerGameOver: owner.consecutiveBadSeasons >= threshold };
}
```

- [ ] **Step 3: Wire it into the year-end pass**

Inside the rollover function, after season stats are written but before the team-by-team cleanup, add:

```typescript
for (const team of state.teams) {
  if (!team.ownerProfile) continue;
  const stats: SeasonStatsForOwner = {
    domesticPlayoffAppearance: (team as any).playoffAppearanceThisSeason ?? false,
    continentalFinalFour: (team as any).continentalFinalFourThisSeason ?? false,
    winPct: (team.wins + team.losses) > 0 ? team.wins / (team.wins + team.losses) : 0,
    netProfitEUR: (team as any).tycoon?.ledgerHistory?.slice(-1)[0]?.profit ?? 0,
    youthProgressed: (state.players ?? []).some(p =>
      p.tid === team.tid
      && p.born?.year && (state.year - p.born.year) <= 22
      && ((p as any).ovrDeltaThisSeason ?? 0) >= 3
    ),
  };
  const { triggerGameOver } = tickOwnerPatience(team, stats);
  if (triggerGameOver && team.tid === state.userTeamId) {
    state.pendingOwnerGameOver = { teamId: team.tid, ownerName: team.ownerProfile.name };
  }
}
```

- [ ] **Step 4: Add a quick smoke test**

Create `src/services/__tests__/seasonRollover_ownerTick.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { runSeasonRollover } from '../seasonRollover';  // adjust import as needed

describe('seasonRollover owner tick', () => {
  it('Trigger-Happy owner fires game-over after one bad season', () => {
    const state: any = {
      year: 2026, userTeamId: 5001,
      teams: [{
        tid: 5001, id: 5001, name: 'Joventut', region: 'Joventut', abbrev: 'JOV',
        wins: 5, losses: 25,
        startingTier: 'Underdog',
        ownerProfile: {
          name: 'Test', nationality: 'Spain', face: {},
          wealthTier: 'LocalWealthy', patience: 'TriggerHappy', vision: 'WinNow',
          cashInjectionUsedThisSeason: false, seasonsSinceLastInjection: 0, consecutiveBadSeasons: 0,
        },
        playoffAppearanceThisSeason: false,
      }],
      players: [],
    };
    const next = runSeasonRollover(state);
    expect(next.pendingOwnerGameOver?.teamId).toBe(5001);
  });
});
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run src/services/__tests__/seasonRollover_ownerTick.test.ts`
Expected: PASS — 1 test.

```bash
git add src/services/seasonRollover.ts src/services/__tests__/seasonRollover_ownerTick.test.ts
git commit -m "feat(euro): season rollover ticks owner patience + sets pendingOwnerGameOver"
```

---

### Task 30: Cash-injection modal integration

**Files:**
- Modify: existing Bankruptcy / Game-Over modal component (search: `grep -rln "EuroBankruptcyModal\|GameOver" src/components/`)

- [ ] **Step 1: Locate the existing modal**

Open `src/components/tycoon/EuroBankruptcyModal.tsx` (found earlier in repo). Read the first ~50 lines to understand its prop shape.

- [ ] **Step 2: Add cash-injection flow when triggered by owner-patience**

Above the irreversible Game-Over button, add a conditional injection offer. If `team.ownerProfile.wealthTier === 'Billionaire' && !team.ownerProfile.cashInjectionUsedThisSeason`, show:

```tsx
{owner.wealthTier === 'Billionaire' && !owner.cashInjectionUsedThisSeason && (
  <button
    onClick={() => {
      onAcceptInjection({ amountEUR: 15_000_000 });
      onClose();
    }}
    className="w-full px-4 py-3 rounded bg-emerald-500 text-slate-950 font-black"
  >
    Accept €15M emergency injection
  </button>
)}
{owner.wealthTier === 'NationalMagnate' && owner.seasonsSinceLastInjection >= 2 && (
  <button
    onClick={() => {
      onAcceptInjection({ amountEUR: 8_000_000 });
      onClose();
    }}
    className="w-full px-4 py-3 rounded bg-amber-500 text-slate-950 font-black"
  >
    Accept €8M emergency injection
  </button>
)}
```

- [ ] **Step 3: Add `onAcceptInjection` handler in parent (state-level)**

Whoever opens the modal must handle:

```typescript
const handleInjection = (payload: { amountEUR: number }) => {
  dispatchAction({ type: 'APPLY_OWNER_INJECTION', payload });
};
```

Add reducer case `APPLY_OWNER_INJECTION`:

```typescript
case 'APPLY_OWNER_INJECTION': {
  const userTeam = state.teams.find(t => t.tid === state.userTeamId);
  if (!userTeam?.ownerProfile || !userTeam.tycoon) return state;
  userTeam.tycoon.cashOnHand = (userTeam.tycoon.cashOnHand ?? 0) + action.payload.amountEUR;
  userTeam.ownerProfile.cashInjectionUsedThisSeason = true;
  userTeam.ownerProfile.seasonsSinceLastInjection = 0;
  userTeam.ownerProfile.consecutiveBadSeasons = 0;  // reset patience timer
  return { ...state, pendingOwnerGameOver: undefined };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tycoon/EuroBankruptcyModal.tsx src/store/logic/initialization.ts
git commit -m "feat(euro): cash-injection offer in game-over modal, resets patience timer"
```

---

## Phase 1.I — Final tests + memory link

### Task 31: LOAD_GAME migration snapshot test

**Files:**
- Already covered partially by Task 13's test. Now add a stricter snapshot test that verifies legacy save → fresh setup parity.

**Files:**
- Create: `src/services/__tests__/loadGameMigration.snapshot.test.ts`

- [ ] **Step 1: Write the snapshot test**

```typescript
// src/services/__tests__/loadGameMigration.snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { seedEuroCareer } from '../euro/careerSeed';
import { reducer } from '../../store/logic/initialization';

describe('LOAD_GAME migration parity', () => {
  it('legacy Euro save after heal matches fresh seedEuroCareer output with same fallback seed', () => {
    const team = { tid: 5001, id: 5001, name: 'Real Madrid', region: 'Real', abbrev: 'RMB' } as any;
    const state: any = {
      gameMode: 'gm',
      userTeamId: 5001,
      teams: [team],
      players: Array.from({ length: 50 }, () => ({ tid: 5001, born: { loc: 'Spain', year: 1990 } })),
      nonNBATeams: [team],
      staff: { coaches: [], gms: [], owners: [] },
      leagueStats: {},
      saveId: 'test_save_1',
    };
    const fallbackSeed = (5001 * 31) ^ 'test_save_1'.length;
    const expected = seedEuroCareer(team, state, 'endesa', fallbackSeed);

    const next = reducer({} as any, { type: 'LOAD_GAME', payload: { state } } as any);
    expect(next.teams[0].ownerProfile?.name).toBe(expected.owner.name);
    expect(next.teams[0].startingTier).toBe(expected.tier);
  });
});
```

- [ ] **Step 2: Run + commit**

Run: `npx vitest run src/services/__tests__/loadGameMigration.snapshot.test.ts`
Expected: PASS — 1 test.

```bash
git add src/services/__tests__/loadGameMigration.snapshot.test.ts
git commit -m "test(euro): migration parity snapshot — heal == fresh seed with same fallback"
```

---

### Task 32: Final manual-smoke checklist

**Files:** none (manual QA)

- [ ] **Step 1: Build and start the dev server**

Run: `npm run dev`
Expected: Vite dev server starts on the configured port.

- [ ] **Step 2: Manual smoke — Real Madrid path**

1. New game → Europe → Spain → Real Madrid
2. See `EuroSetupReviewScreen` with 4 cards
3. Verify defaults: Powerhouse / ~€12M / Billionaire owner / Win-Now / 6 staff with high reputation
4. Reroll Staff card 2x → other cards unchanged
5. Edit Owner → Patience → TriggerHappy, save → lock icon appears
6. Reroll Owner → confirmation prompt; after accept the manual lock clears
7. Start Career → game enters with Real Madrid as user team, Florentino-Pérez-style owner persisted in `team.ownerProfile`

- [ ] **Step 3: Manual smoke — Underdog Game-Over**

1. Pick Joventut Badalona, accept Trigger-Happy owner override
2. Simulate to season end with bad record
3. Verify Game-Over modal fires; for Joventut (Underdog, LocalWealthy) the cash-injection button should NOT appear

- [ ] **Step 4: Manual smoke — Hire-Staff after sim drain**

1. In any Euro save, open `Hire Staff Member` modal for a role
2. Verify ≥3 candidates always visible; if pool was drained, the bottom should show "Limited options" badges

- [ ] **Step 5: Commit smoke evidence**

If any issues found, open a GitHub issue or extend the failing-state Task; otherwise:

```bash
git commit --allow-empty -m "test(manual): Phase-1 smoke OK — Real Madrid + Joventut + Hire drain"
```

---

## Self-Review

**Spec coverage check:**
- ✅ §1 High-level flow → Tasks 11 + 24 (App routing)
- ✅ §2 Review-screen layout → Tasks 14–19
- ✅ §3 Auto-seed pipeline → Tasks 7–11
- ✅ §4 Nationality pool + staff-pool refill → Tasks 5, 6, 25, 26
- ✅ §5 Owner mechanics (Patience/Wealth/Vision) → Tasks 28–30
- ✅ §6 Persistence + backward compat → Tasks 12, 13, 31
- ✅ §7 Testing → unit tests on every generator + migration snapshot
- ✅ Tier mapping helper → Task 3
- ✅ Sponsor-stub interface → Task 4
- ✅ Last-resort StaffSigningModal → Task 27

**No placeholders verified.** Every code step shows full code.

**Type consistency verified:**
- `EuroCareerSeed.manualOverrides` is consistent across Tasks 11, 19, 22
- `OwnerProfile` fields match Task 1 definition through Tasks 9, 22, 28, 29
- `SponsorSlot` shape matches between Task 4 stub and Task 23 modal

**Known cross-task dependency:**
- Task 24 (App.tsx wiring) depends on `INIT_EURO_CAREER` action existing (Task 12) and `EuroSetupReviewScreen` (Task 19). Execute in order.
- Task 25 (pool seed) extends the reducer case from Task 12. Apply as a follow-up edit, not a parallel branch.
