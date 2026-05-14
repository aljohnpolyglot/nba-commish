# Sponsor Portfolio Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Front-Office Sponsorship Portfolio UI (truncated names, no logos, decorative Next-Action buttons) and migrate Spain sponsor data into a GitHub-hosted gist with logo metadata.

**Architecture:** Card layout grows a 56×56 logo tile with industry SVG fallback; logos resolve through a deterministic chain (gist override → logo.dev → industry SVG). Default sponsor data moves from `specs/spain.ts` to a JSON file in the existing `aljohnpolyglot/nba-store-data` repo, fetched at boot with the in-source spec staying as offline fallback. The single `SponsorshipNegotiationModal` gains a `mode` prop (`renegotiate` | `details` | `replacement` | `find-new`) so the four Next-Action buttons each open distinct flows.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind, no test framework (lint via `tsc --noEmit`, scripts via `tsx`).

**Related spec:** `docs/superpowers/specs/2026-05-14-sponsor-portfolio-polish-design.md`

---

## File Structure

**Created:**
- `src/utils/sponsorLogos.ts` — `resolveSponsorLogoUrl`, `getIndustryLabel`, types
- `src/components/tycoon/SponsorIndustryIcon.tsx` — 8 inline-SVG industry tiles
- `src/components/tycoon/SponsorLogo.tsx` — `<img>` chain + onError fallback
- `src/data/sponsorCatalogFetcher.ts` — fetch + module cache + sync getters
- `scripts/test-sponsor-catalog.ts` — script-based test for the fetcher and resolver
- `scripts/build-sponsor-catalog.ts` — emits `sponsor-catalog.json` from `specs/spain.ts` so the user can copy/paste into the gist repo

**Modified:**
- `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx` — card layout + `onAction(slot, mode)`
- `src/components/tycoon/SponsorshipCard.tsx` — matching card layout for the overview page
- `src/components/tycoon/SponsorshipNegotiationModal.tsx` — `mode` prop, banner, disabled state, replacement gate, find-new auto-pick
- `src/components/central/view/FrontOfficeView.tsx` — modal state grows `mode`, callback wired
- `src/services/tycoon/sponsorshipEngine.ts` — `pickSponsorName` delegates to fetcher with `specs/spain.ts` fallback
- `.env` — add `VITE_LOGODEV_TOKEN=pk_fgsxuNS4R2KmpzsdyrF6LQ`
- `.env.example` (create if missing) — `VITE_LOGODEV_TOKEN=`

**Unchanged source-of-truth fallback:**
- `src/services/tycoon/specs/spain.ts` — stays in repo, demoted to offline fallback (one-line comment added)

---

## Task 1: Author the sponsor-catalog JSON payload (data file only)

**Files:**
- Create: `scripts/build-sponsor-catalog.ts`
- Output (manual): `sponsor-catalog.json` to be uploaded by the user to `https://github.com/aljohnpolyglot/nba-store-data`

- [ ] **Step 1: Write the builder script**

`scripts/build-sponsor-catalog.ts`:

```ts
// Run with: npx tsx scripts/build-sponsor-catalog.ts > sponsor-catalog.json
// Then upload sponsor-catalog.json to https://github.com/aljohnpolyglot/nba-store-data/blob/main/sponsor-catalog.json
import { SPAIN_INITIAL_SPONSORS } from '../src/services/tycoon/specs/spain';
import { classifySponsor } from '../src/services/tycoon/sponsorshipEngine';
import type { TycoonTier, SponsorshipSlot } from '../src/types/tycoon';

const KNOWN_DOMAINS: Record<string, string> = {
  'Emirates': 'emirates.com',
  'Adidas': 'adidas.com',
  'Herbalife': 'herbalife.com',
  'Plus500': 'plus500.com',
  'Mahou': 'mahou-sanmiguel.com',
  'Iberdrola': 'iberdrola.com',
  'BBVA': 'bbva.com',
  'Endesa': 'endesa.com',
  'Mapfre': 'mapfre.com',
  'Banco Santander': 'santander.com',
  'Repsol': 'repsol.com',
  'Iberia': 'iberia.com',
  'Nike': 'nike.com',
  'Adidas Training': 'adidas.com',
  'Under Armour': 'underarmour.com',
  'Movistar': 'movistar.es',
  'Coca-Cola': 'coca-cola.com',
  'Spotify': 'spotify.com',
  'Bankia': 'bankia.es',
  'Caixa': 'caixabank.es',
  'Acciona': 'acciona.com',
  'Naturgy': 'naturgy.com',
  'Cetelem': 'cetelem.es',
  'EVO Banco': 'evobanco.com',
  'Liberbank': 'liberbank.es',
  'Ibercaja': 'ibercaja.es',
  'Mahou Regional': 'mahou-sanmiguel.com',
  'Tecnocasa': 'tecnocasa.es',
  'Joma': 'joma-sport.com',
  'Kelme': 'kelme.com',
  'Macron': 'macron.com',
  'Telefónica': 'telefonica.com',
  'Reale': 'reale.es',
  'Hipercor': 'hipercor.es',
  'Hummel': 'hummel.net',
  'Spalding': 'spalding.com',
  'Damm': 'damm.com',
  'Cabify Regional': 'cabify.com',
};

type Brand = { industry: string; domain: string | null; logoOverride: string | null };
const brands: Record<string, Brand> = {};

const tiers: Record<TycoonTier, Record<SponsorshipSlot, string[]>> = SPAIN_INITIAL_SPONSORS;
for (const tier of Object.keys(tiers) as TycoonTier[]) {
  for (const slot of Object.keys(tiers[tier]) as SponsorshipSlot[]) {
    for (const name of tiers[tier][slot]) {
      if (brands[name]) continue;
      const { industry } = classifySponsor(name);
      brands[name] = {
        industry: industry ?? 'generic',
        domain: KNOWN_DOMAINS[name] ?? null,
        logoOverride: null,
      };
    }
  }
}

const payload = {
  version: 1,
  leagues: {
    spain: { tiers, brands },
    france: null,
    italy: null,
    greece: null,
    germany: null,
    turkey: null,
    israel: null,
  },
};

process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
```

- [ ] **Step 2: Run the builder and save its output**

Run:

```bash
npx tsx scripts/build-sponsor-catalog.ts > sponsor-catalog.json
```

Expected: file `sponsor-catalog.json` appears in repo root with `version`, `leagues.spain.tiers` (5 tiers × 8 slots × 3 names), and `leagues.spain.brands` (~30 unique brands with domain filled where `KNOWN_DOMAINS` has it).

- [ ] **Step 3: User uploads sponsor-catalog.json to the gist repo**

Action for the user (NOT an automated step):

> Upload `sponsor-catalog.json` to `https://github.com/aljohnpolyglot/nba-store-data` so it is served at `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json`. Pull-request acceptable; same pattern as `nbacontractsdata`.

Verify with:

```bash
curl -I https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json
```

Expected: `HTTP/2 200`.

- [ ] **Step 4: Delete the local sponsor-catalog.json from the repo root**

The builder output is a one-shot for uploading. It must not be committed alongside the source. Run:

```bash
rm sponsor-catalog.json
```

- [ ] **Step 5: Commit the builder script**

```bash
git add scripts/build-sponsor-catalog.ts
git commit -m "feat(tycoon): add sponsor catalog builder script"
```

---

## Task 2: Sponsor logo resolver utility

**Files:**
- Create: `src/utils/sponsorLogos.ts`

- [ ] **Step 1: Write the resolver**

`src/utils/sponsorLogos.ts`:

```ts
import type { SponsorIndustry } from '../types/tycoon';

export interface BrandMeta {
  industry: SponsorIndustry | 'generic';
  domain: string | null;
  logoOverride: string | null;
}

const INDUSTRY_LABELS: Record<SponsorIndustry, string> = {
  airline: 'Airline',
  tech: 'Tech',
  fashion: 'Fashion',
  bank: 'Bank',
  auto: 'Auto',
  telecom: 'Telecom',
  beer: 'Beer',
  water: 'Water',
  energy_drink: 'Energy Drink',
  gambling: 'Gambling',
  sportswashing: 'State Partner',
  generic: 'Local Partner',
};

export function getIndustryLabel(industry: SponsorIndustry | 'generic' | undefined): string {
  if (!industry) return INDUSTRY_LABELS.generic;
  return INDUSTRY_LABELS[industry as SponsorIndustry] ?? INDUSTRY_LABELS.generic;
}

/** Returns the URL to render in <img>, or null when the SVG fallback should be used. */
export function resolveSponsorLogoUrl(meta: BrandMeta | undefined): string | null {
  if (!meta) return null;
  if (meta.logoOverride) return meta.logoOverride;
  if (meta.domain) {
    const token = import.meta.env.VITE_LOGODEV_TOKEN as string | undefined;
    const tokenParam = token ? `&token=${token}` : '';
    return `https://img.logo.dev/${meta.domain}?size=128&format=png${tokenParam}`;
  }
  return null;
}
```

- [ ] **Step 2: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/sponsorLogos.ts
git commit -m "feat(tycoon): add sponsor logo resolver util"
```

---

## Task 3: Industry icon component

**Files:**
- Create: `src/components/tycoon/SponsorIndustryIcon.tsx`

- [ ] **Step 1: Write the component with 8 inline SVGs**

`src/components/tycoon/SponsorIndustryIcon.tsx`:

```tsx
import React from 'react';
import type { SponsorIndustry } from '../../types/tycoon';

type IndustryKey = SponsorIndustry | 'generic';

const TINT: Record<IndustryKey, string> = {
  airline:        'from-sky-500/30 to-sky-900/50 text-sky-200',
  tech:           'from-violet-500/30 to-violet-900/50 text-violet-200',
  fashion:        'from-pink-500/30 to-pink-900/50 text-pink-200',
  bank:           'from-emerald-500/30 to-emerald-900/50 text-emerald-200',
  auto:           'from-orange-500/30 to-orange-900/50 text-orange-200',
  telecom:        'from-blue-500/30 to-blue-900/50 text-blue-200',
  beer:           'from-amber-500/30 to-amber-900/50 text-amber-200',
  water:          'from-cyan-500/30 to-cyan-900/50 text-cyan-200',
  energy_drink:   'from-red-500/30 to-red-900/50 text-red-200',
  gambling:       'from-rose-500/30 to-rose-900/50 text-rose-200',
  sportswashing:  'from-yellow-500/30 to-yellow-900/50 text-yellow-200',
  generic:        'from-slate-500/30 to-slate-900/50 text-slate-300',
};

const PATHS: Record<IndustryKey, React.ReactNode> = {
  airline: <path d="M2 16l20-7-9 20-2-9-9-4z" />,
  tech: <path d="M4 7h16v10H4zM2 17h20v2H2z" />,
  fashion: <path d="M7 4l2 4 3-2 3 2 2-4 4 4-4 4v8H6v-8L2 8z" />,
  bank: <path d="M3 10h18l-9-6zM5 11v7M11 11v7M17 11v7M3 20h18v2H3z" />,
  auto: <path d="M3 14l2-5h14l2 5v5h-2v-1H5v1H3zm3.5 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm11 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
  telecom: <path d="M12 3a9 9 0 019 9h-2a7 7 0 00-7-7zm0 4a5 5 0 015 5h-2a3 3 0 00-3-3zM4 5l3 1 2 4-2 1c1 3 4 6 7 7l1-2 4 2 1 3-2 2c-9 0-16-7-16-16z" />,
  beer: <path d="M5 4h11v3h2a3 3 0 010 6h-2v8H5zm11 8h2a1 1 0 000-2h-2z" />,
  water: <path d="M12 2c4 5 6 9 6 12a6 6 0 11-12 0c0-3 2-7 6-12z" />,
  energy_drink: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  gambling: <path d="M12 2l3 5h-2v3h-2V7H9zm-7 9h5v5H5zm9 0h5v5h-5zm-4.5 7h5v4h-5z" />,
  sportswashing: <path d="M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z" />,
  generic: <path d="M12 2l10 6v8l-10 6L2 16V8z" />,
};

export const SponsorIndustryIcon: React.FC<{ industry?: IndustryKey; size?: number }> = ({ industry, size = 56 }) => {
  const key: IndustryKey = (industry ?? 'generic') as IndustryKey;
  return (
    <div
      className={`rounded-lg bg-gradient-to-br ${TINT[key] ?? TINT.generic} flex items-center justify-center border border-white/10`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor" aria-hidden>
        {PATHS[key] ?? PATHS.generic}
      </svg>
    </div>
  );
};
```

- [ ] **Step 2: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tycoon/SponsorIndustryIcon.tsx
git commit -m "feat(tycoon): add sponsor industry icon tiles"
```

---

## Task 4: SponsorLogo component (img chain + fallback)

**Files:**
- Create: `src/components/tycoon/SponsorLogo.tsx`

- [ ] **Step 1: Write the component**

`src/components/tycoon/SponsorLogo.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { resolveSponsorLogoUrl, type BrandMeta } from '../../utils/sponsorLogos';
import { SponsorIndustryIcon } from './SponsorIndustryIcon';
import type { SponsorIndustry } from '../../types/tycoon';

interface Props {
  name: string;
  meta?: BrandMeta;
  industry?: SponsorIndustry | 'generic';
  size?: number;
}

export const SponsorLogo: React.FC<Props> = ({ name, meta, industry, size = 56 }) => {
  const url = resolveSponsorLogoUrl(meta);
  const fallbackIndustry = meta?.industry ?? industry ?? 'generic';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return <SponsorIndustryIcon industry={fallbackIndustry} size={size} />;
  }

  return (
    <div
      className="rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      <img
        src={url}
        alt={`${name} logo`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
};
```

- [ ] **Step 2: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tycoon/SponsorLogo.tsx
git commit -m "feat(tycoon): add SponsorLogo with img-chain fallback"
```

---

## Task 5: Sponsor catalog fetcher

**Files:**
- Create: `src/data/sponsorCatalogFetcher.ts`

- [ ] **Step 1: Write the fetcher**

`src/data/sponsorCatalogFetcher.ts`:

```ts
import type { SponsorshipSlot, TycoonTier, SponsorIndustry } from '../types/tycoon';
import { SPAIN_INITIAL_SPONSORS } from '../services/tycoon/specs/spain';
import type { BrandMeta } from '../utils/sponsorLogos';

export type LeagueKey = 'spain' | 'france' | 'italy' | 'greece' | 'germany' | 'turkey' | 'israel';

interface LeagueData {
  tiers: Record<TycoonTier, Record<SponsorshipSlot, string[]>>;
  brands: Record<string, { industry: SponsorIndustry | 'generic'; domain: string | null; logoOverride: string | null }>;
}

interface SponsorCatalog {
  version: number;
  leagues: Partial<Record<LeagueKey, LeagueData | null>>;
}

const CATALOG_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json';

let cache: SponsorCatalog | null = null;
let inflight: Promise<SponsorCatalog> | null = null;

export async function loadSponsorCatalog(): Promise<SponsorCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SponsorCatalog;
      cache = json;
      return json;
    } catch (err) {
      console.warn('[sponsorCatalog] fetch failed, using offline fallback', err);
      cache = OFFLINE_FALLBACK;
      return OFFLINE_FALLBACK;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getSponsorCatalogSync(): SponsorCatalog | null {
  return cache;
}

export function pickSponsorName(
  league: LeagueKey,
  tier: TycoonTier,
  slot: SponsorshipSlot,
  existing?: string | null,
): string {
  const data = (cache ?? OFFLINE_FALLBACK).leagues[league];
  const pool = data?.tiers?.[tier]?.[slot] ?? SPAIN_INITIAL_SPONSORS[tier]?.[slot] ?? ['Default Sponsor'];
  const filtered = existing ? pool.filter((n) => n !== existing) : pool;
  if (filtered.length === 0) return pool[0];
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getBrandMeta(league: LeagueKey, sponsorName: string): BrandMeta | undefined {
  const data = (cache ?? OFFLINE_FALLBACK).leagues[league];
  return data?.brands?.[sponsorName];
}

const OFFLINE_FALLBACK: SponsorCatalog = {
  version: 0,
  leagues: {
    spain: { tiers: SPAIN_INITIAL_SPONSORS, brands: {} },
  },
};
```

- [ ] **Step 2: Write the script-based test**

`scripts/test-sponsor-catalog.ts`:

```ts
// Run with: npx tsx scripts/test-sponsor-catalog.ts
import {
  loadSponsorCatalog,
  getSponsorCatalogSync,
  pickSponsorName,
  getBrandMeta,
} from '../src/data/sponsorCatalogFetcher';

async function main() {
  // 1. Sync getter returns null before load
  if (getSponsorCatalogSync() !== null) throw new Error('cache should start null');

  // 2. Offline fallback path: pickSponsorName works even before fetch resolves
  const beforeFetchName = pickSponsorName('spain', 'S', 'kit');
  if (typeof beforeFetchName !== 'string' || beforeFetchName.length === 0) {
    throw new Error('pickSponsorName must return a string before fetch resolves');
  }

  // 3. Load real catalog (or fall back if offline)
  const catalog = await loadSponsorCatalog();
  if (catalog.version === undefined) throw new Error('catalog must have a version');
  if (!catalog.leagues.spain) throw new Error('spain league must be populated');

  // 4. Cache populated
  if (getSponsorCatalogSync() === null) throw new Error('cache should be populated after load');

  // 5. pickSponsorName respects exclusion
  const first = pickSponsorName('spain', 'S', 'kit', null);
  for (let i = 0; i < 30; i++) {
    const next = pickSponsorName('spain', 'S', 'kit', first);
    if (next === first) throw new Error(`pickSponsorName must exclude existing: got ${next} same as ${first}`);
  }

  // 6. getBrandMeta returns undefined for unknown brand
  if (getBrandMeta('spain', '__nonexistent__') !== undefined) {
    throw new Error('unknown brand should return undefined');
  }

  console.log('PASS: sponsor catalog fetcher');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Run the test**

Run:

```bash
npx tsx scripts/test-sponsor-catalog.ts
```

Expected: `PASS: sponsor catalog fetcher`. Network failure is tolerated (the script tests the offline-fallback path on the same code path).

- [ ] **Step 4: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/sponsorCatalogFetcher.ts scripts/test-sponsor-catalog.ts
git commit -m "feat(tycoon): add sponsor catalog fetcher with offline fallback"
```

---

## Task 6: Wire sponsorshipEngine to the fetcher

**Files:**
- Modify: `src/services/tycoon/sponsorshipEngine.ts:52-57` (pickSponsorName)
- Modify: `src/services/tycoon/specs/spain.ts:93` (add fallback comment)

- [ ] **Step 1: Replace the local pickSponsorName**

In `src/services/tycoon/sponsorshipEngine.ts`, replace the existing function:

```ts
function pickSponsorName(tier: TycoonTier, slot: SponsorshipSlot, existing?: string | null): string {
  const pool = SPAIN_INITIAL_SPONSORS[tier]?.[slot] ?? ['Default Sponsor'];
  const filtered = existing ? pool.filter(n => n !== existing) : pool;
  if (filtered.length === 0) return pool[0];
  return filtered[Math.floor(Math.random() * filtered.length)];
}
```

with:

```ts
import { pickSponsorName as pickSponsorNameFromCatalog } from '../../data/sponsorCatalogFetcher';

function pickSponsorName(tier: TycoonTier, slot: SponsorshipSlot, existing?: string | null): string {
  return pickSponsorNameFromCatalog('spain', tier, slot, existing);
}
```

(Place the `import` near the top with other imports; the wrapper stays so the rest of the file's call-sites remain untouched.)

- [ ] **Step 2: Add fallback-only comment to spain.ts**

In `src/services/tycoon/specs/spain.ts`, just above the `SPAIN_INITIAL_SPONSORS` export (line 93), add:

```ts
// Offline fallback only. The gist at https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json
// is the source of truth at runtime. Edit there, not here.
```

- [ ] **Step 3: Re-run the catalog test**

Run:

```bash
npx tsx scripts/test-sponsor-catalog.ts
```

Expected: still `PASS`.

- [ ] **Step 4: Run the existing tycoon sponsor test**

Run:

```bash
npx tsx scripts/test-tycoon-sponsor.ts
```

Expected: same output as before this task (no regression). If the script prints `PASS` or a known summary, the renewal/decline pipeline still works.

- [ ] **Step 5: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/tycoon/sponsorshipEngine.ts src/services/tycoon/specs/spain.ts
git commit -m "feat(tycoon): wire pickSponsorName through catalog fetcher"
```

---

## Task 7: Boot-time catalog load

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Locate the existing data-fetch kickoff block**

Run:

```bash
grep -n "fetch\|loadEuroleague\|loadAllStar\|useEffect" src/App.tsx
```

Identify the `useEffect` near app boot that triggers data fetches. (If there is no such effect, place the call near the top of the `App` component body inside a `useEffect(() => { ... }, [])`.)

- [ ] **Step 2: Add the catalog kickoff**

In `src/App.tsx`, near the existing boot-time fetch effect, add:

```tsx
import { loadSponsorCatalog } from './data/sponsorCatalogFetcher';

// inside the existing boot useEffect, or in a new one:
useEffect(() => {
  loadSponsorCatalog();
}, []);
```

If a boot `useEffect` already exists, just append `loadSponsorCatalog();` to its body. Do not block any other init on it — it is fire-and-forget.

- [ ] **Step 3: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(tycoon): preload sponsor catalog at boot"
```

---

## Task 8: env wiring for logo.dev

**Files:**
- Modify: `.env`
- Create: `.env.example` (only if not present)

- [ ] **Step 1: Add the token to .env**

Append to `.env`:

```
VITE_LOGODEV_TOKEN=pk_fgsxuNS4R2KmpzsdyrF6LQ
```

(If `.gitignore` already excludes `.env`, this is user-machine-only. The repo never sees the token.)

- [ ] **Step 2: Add .env.example with placeholder**

If `.env.example` does not exist, create it:

```
VITE_LOGODEV_TOKEN=
```

If it exists, append the same line.

- [ ] **Step 3: Restart dev server**

Run:

```bash
npm run dev
```

In the browser console, after the app loads, run:

```js
console.log(import.meta.env.VITE_LOGODEV_TOKEN)
```

Expected: `pk_fgsxuNS4R2KmpzsdyrF6LQ` (or whatever the user pasted).

Stop the dev server with Ctrl+C.

- [ ] **Step 4: Commit .env.example only**

```bash
git add .env.example
git commit -m "chore: add VITE_LOGODEV_TOKEN to env example"
```

(Do NOT `git add .env` — it should be gitignored.)

---

## Task 9: Card layout in SponsorshipSection

**Files:**
- Modify: `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx`

- [ ] **Step 1: Add imports and update the inner card render**

Open `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx`. At the top imports, add:

```tsx
import { SponsorLogo } from '../../../../tycoon/SponsorLogo';
import { getIndustryLabel } from '../../../../../utils/sponsorLogos';
import { getBrandMeta } from '../../../../../data/sponsorCatalogFetcher';
```

Replace the inner card body (lines ~143-159 — the `<button key={slot}>` block) with:

```tsx
return (
  <button
    key={slot}
    onClick={() => setSelectedSlot(slot)}
    className={`min-h-[190px] rounded-xl border p-4 text-left transition ${
      active ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
    }`}
  >
    <div className="flex items-start justify-between">
      <div className="text-xs font-black uppercase tracking-widest text-slate-400">{SPONSOR_SLOT_LABELS[slot]}</div>
      <span className={`w-3 h-3 rounded-full ${deal ? 'bg-emerald-400' : 'bg-amber-300'}`} />
    </div>
    <div className="mt-4 flex items-start gap-3">
      {deal ? (
        <SponsorLogo
          name={deal.sponsor}
          meta={getBrandMeta('spain', deal.sponsor)}
          industry={deal.industry ?? 'generic'}
          size={56}
        />
      ) : (
        <div className="w-14 h-14 rounded-lg border border-dashed border-slate-700 flex items-center justify-center text-slate-500 text-2xl">+</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold text-white leading-tight line-clamp-2 break-words">
          {deal?.sponsor ?? 'Open Slot'}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {deal ? getIndustryLabel(deal.industry) : 'Available'}
        </div>
      </div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div>
        <div className="uppercase tracking-widest text-slate-500">Value</div>
        <div className="text-sm font-black text-white tabular-nums">{fmt(deal?.valuePerYear ?? 0)} / year</div>
      </div>
      <div>
        <div className="uppercase tracking-widest text-slate-500">Contract End</div>
        <div className="text-sm font-black text-white">{deal ? String(deal.signedYear + deal.yearsRemaining) : 'Market'}</div>
      </div>
    </div>
    <div className="mt-3 inline-flex h-7 min-w-7 items-center justify-center rounded-lg border border-amber-400/60 px-2 text-sm font-black text-amber-300">{SLOT_GRADES[slot]}</div>
  </button>
);
```

- [ ] **Step 2: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual UI smoke**

```bash
npm run dev
```

Load a Spain save → Front Office → Sponsorships. Verify:
- Each card shows a logo tile (logo.dev image OR colored industry SVG) on the left.
- Sponsor names render in full or wrap to 2 lines (no `Town Sup...` ellipsis).
- Open slots show a dashed "+" tile.
- Industry sub-label appears under the name ("Bank", "Airline", "Tech", etc.).

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx
git commit -m "feat(tycoon): sponsor portfolio card uses logo tile + readable name"
```

---

## Task 10: Add NegotiationMode to the modal

**Files:**
- Modify: `src/components/tycoon/SponsorshipNegotiationModal.tsx`

- [ ] **Step 1: Extend Props with mode**

Open `src/components/tycoon/SponsorshipNegotiationModal.tsx`. At the top, add the mode type and extend Props:

```ts
export type NegotiationMode = 'renegotiate' | 'details' | 'replacement' | 'find-new';

interface Props {
  open: boolean;
  onClose: () => void;
  initialSlot?: SponsorshipSlot;
  mode?: NegotiationMode;
}
```

Update the destructure on the component:

```tsx
export const SponsorshipNegotiationModal: React.FC<Props> = ({ open, onClose, initialSlot, mode = 'renegotiate' }) => {
```

- [ ] **Step 2: Auto-pick first open slot for find-new**

Below the existing `useEffect(() => { if (initialSlot) setActiveSlot(initialSlot); }, [initialSlot, open]);` add:

```tsx
useEffect(() => {
  if (!open) return;
  if (mode !== 'find-new') return;
  if (!tycoon) return;
  if (!tycoon.sponsorships[activeSlot]) return;
  const firstOpen = ALL_SLOTS.find((s) => !tycoon.sponsorships[s]);
  if (firstOpen) setActiveSlot(firstOpen);
}, [open, mode, tycoon, activeSlot]);
```

- [ ] **Step 3: Add a confirm-replacement state**

Above `const offer = activeOffer;` (around line 83), add:

```tsx
const [confirmCancel, setConfirmCancel] = useState(false);
useEffect(() => { setConfirmCancel(false); }, [activeSlot, mode, open]);
```

- [ ] **Step 4: Add the all-slots-full short-circuit**

Right after `if (!open || !team || !tycoon) return null;`, add:

```tsx
if (mode === 'find-new' && ALL_SLOTS.every((s) => tycoon.sponsorships[s])) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-amber-500/30 rounded-2xl max-w-md w-full p-6">
        <div className="text-xs font-black uppercase tracking-widest text-amber-300">Commercial Department</div>
        <h2 className="text-2xl font-black text-white mt-1">All slots full</h2>
        <p className="text-sm text-slate-400 mt-2">Every sponsorship slot has an active deal. Use Renegotiate or Find Replacement on the relevant slot.</p>
        <button onClick={onClose} className="mt-5 w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl">Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add a mode banner above the existing offer block**

Locate the `<div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mb-5">` block (line ~146). Replace its inner content depending on mode by inserting **before** it:

```tsx
{mode === 'replacement' && (
  <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
    Replacing current sponsor <span className="font-bold">{current?.sponsor ?? '—'}</span>. Confirming below will void the existing deal.
  </div>
)}
{mode === 'details' && (
  <div className="mb-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
    Read-only view of the current deal. Use Renegotiate to change terms.
  </div>
)}
{mode === 'find-new' && !current && (
  <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
    Opening market for <span className="font-bold">{SLOT_LABEL[activeSlot]}</span>.
  </div>
)}
```

Place these directly inside `<main className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">` as its first children, before the existing "Negotiating with Sponsor" panel.

- [ ] **Step 6: Disable controls in details mode**

The four input controls and stance buttons live around lines 152-185. For each, add `disabled={mode === 'details'}`:

- `<Control label="Annual Value" ... disabled={mode === 'details'} />` — and update `Control` to accept `disabled` and forward to the `<input>`.
- `<Control label="Signing Bonus" ... disabled={mode === 'details'} />`.
- The contract-length `<input type="range" ... disabled={mode === 'details'} />`.
- The performance bonus `<input type="checkbox" ... disabled={mode === 'details'} />`.
- The stance `<button ... disabled={mode === 'details'}>` buttons.

Update the `Control` definition near the bottom of the file:

```tsx
const Control: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, min, max, step, fmt, onChange, disabled }) => (
  <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
    <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
      <span>{label}</span><span className="text-amber-300">{fmt(value)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseInt(e.target.value, 10))} className="w-full accent-amber-400" disabled={disabled} />
  </div>
);
```

- [ ] **Step 7: Adjust the action-button row by mode**

Replace the action button row (lines ~238-245) with:

```tsx
<div className="flex gap-3 mt-5">
  {mode === 'details' ? (
    <button onClick={onClose} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 rounded-xl">
      Close
    </button>
  ) : (
    <>
      {mode === 'replacement' && (
        <label className="flex items-center gap-2 px-4 py-3 text-xs text-rose-200">
          <input type="checkbox" checked={confirmCancel} onChange={(e) => setConfirmCancel(e.target.checked)} className="accent-rose-400" />
          <span>I confirm canceling the current contract with {current?.sponsor ?? '—'}</span>
        </label>
      )}
      <button
        onClick={() => {
          if (mode === 'replacement') {
            applyTycoonMutation(userTeamId, (t: any) => applyDecline(t.tycoon, activeSlot));
          }
          handleAccept();
        }}
        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
        disabled={!evaluation.willAccept || (mode === 'replacement' && !confirmCancel)}
      >
        <Check size={16} /> {mode === 'replacement' ? 'Replace Sponsor' : 'Accept Deal'}
      </button>
      <button onClick={handleDecline} className="flex-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
        <XCircle size={16} /> Decline
      </button>
    </>
  )}
</div>
```

- [ ] **Step 8: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/tycoon/SponsorshipNegotiationModal.tsx
git commit -m "feat(tycoon): add mode prop to SponsorshipNegotiationModal"
```

---

## Task 11: Wire onAction in FrontOfficeView and SponsorshipSection

**Files:**
- Modify: `src/components/central/view/FrontOfficeView.tsx`
- Modify: `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx`

- [ ] **Step 1: Update SponsorshipSection props**

In `SponsorshipSection.tsx`, change the prop type from:

```tsx
onNegotiate: (slot: SponsorshipSlot) => void;
```

to:

```tsx
import type { NegotiationMode } from '../../../tycoon/SponsorshipNegotiationModal';
// ...
onAction: (slot: SponsorshipSlot, mode: NegotiationMode) => void;
```

Remove the old `onNegotiate` from the destructure and replace with `onAction`. Replace every call to `onNegotiate(...)` inside the component:

- `View Brand Profile →` header button: `onAction(selectedSlot, 'renegotiate')`
- The `+` open-slot tile button: `onAction(selectedSlot, 'find-new')`

- [ ] **Step 2: Replace the Next Actions block**

Locate the "Next Actions" block (lines ~227-237 in the original file — now shifted). Replace it with:

```tsx
<div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
  <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Next Actions</div>
  {(() => {
    const firstOpen = ALL_SLOTS.find((s) => !tycoon.sponsorships[s]);
    const allFull = !firstOpen;
    const items: Array<{ label: string; mode: NegotiationMode; slot: SponsorshipSlot; disabled: boolean; tooltip?: string }> = [
      { label: 'Renegotiate Deal',      mode: 'renegotiate', slot: selectedSlot, disabled: !selected, tooltip: !selected ? 'Slot is open — use Find New Sponsors' : undefined },
      { label: 'View Contract Details', mode: 'details',     slot: selectedSlot, disabled: !selected, tooltip: !selected ? 'No active contract' : undefined },
      { label: 'Find Replacement',      mode: 'replacement', slot: selectedSlot, disabled: !selected, tooltip: !selected ? 'No active contract to replace' : undefined },
    ];
    return (
      <>
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => !item.disabled && onAction(item.slot, item.mode)}
            disabled={item.disabled}
            title={item.tooltip}
            className={`w-full h-12 mb-2 rounded-xl border border-slate-800 bg-slate-950/70 px-4 flex items-center justify-between text-sm text-slate-200 hover:border-amber-400/60 ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {item.label}<span>→</span>
          </button>
        ))}
        <button
          onClick={() => !allFull && onAction(firstOpen ?? selectedSlot, 'find-new')}
          disabled={allFull}
          title={allFull ? 'All slots full' : undefined}
          className={`mt-3 w-full h-14 rounded-xl border border-amber-400/50 bg-amber-400/15 text-amber-200 font-black ${allFull ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Find New Sponsors →
        </button>
      </>
    );
  })()}
</div>
```

(Ensure `ALL_SLOTS` is already imported at the top of the file — line 4 of the original already imports it.)

- [ ] **Step 3: Update FrontOfficeView callers**

In `src/components/central/view/FrontOfficeView.tsx`, change the modal state:

```tsx
import type { NegotiationMode } from '../../tycoon/SponsorshipNegotiationModal';
// ...
const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot; mode: NegotiationMode }>({
  open: false, slot: 'kit', mode: 'renegotiate',
});
```

Update both call-sites (lines ~184 and ~234):

```tsx
<SponsorshipSection
  tycoon={tycoon}
  currency={currency}
  avgOpponentPrestige={avgOpponentPrestige}
  marqueeOpponents={marqueeOpponents}
  onAction={(slot, mode) => setSponsorModal({ open: true, slot, mode })}
  onTicketMultChange={handleTicketMultChange}
/>
```

```tsx
<SponsorshipCard
  tycoon={tycoon}
  currency={currency}
  onNegotiate={(slot) => setSponsorModal({ open: true, slot, mode: 'renegotiate' })}
  onTicketMultChange={handleTicketMultChange}
  avgOpponentPrestige={avgOpponentPrestige}
  marqueeOpponents={marqueeOpponents}
/>
```

(`SponsorshipCard` keeps its original `onNegotiate(slot)` signature — it does not get the four-button refactor; only the FrontOfficeView wrapper that calls it widens the modal state.)

Update the close handler:

```tsx
onClose={() => setSponsorModal({ open: false, slot: 'kit', mode: 'renegotiate' })}
```

And pass `mode` to the modal:

```tsx
<SponsorshipNegotiationModal
  open={sponsorModal.open}
  onClose={() => setSponsorModal({ open: false, slot: 'kit', mode: 'renegotiate' })}
  initialSlot={sponsorModal.slot}
  mode={sponsorModal.mode}
/>
```

- [ ] **Step 4: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual UI smoke**

```bash
npm run dev
```

In Front Office → Sponsorships:
- Select a slot with an active deal.
- Click **Renegotiate Deal** → modal opens with sliders enabled, no banner color change beyond default.
- Close, click **View Contract Details** → modal opens with sliders/buttons disabled, "Close" button shown.
- Close, click **Find Replacement** → amber-rose banner at top, checkbox required, "Replace Sponsor" button label on accept.
- Close, click **Find New Sponsors** → modal jumps to the first open slot; banner says "Opening market for {slot}". With all slots full, the button is disabled with tooltip "All slots full".
- Open the slot picker (`+` Available Slot tile) → opens the modal in `find-new` mode on the same first-open slot.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx src/components/central/view/FrontOfficeView.tsx
git commit -m "feat(tycoon): wire Next-Action buttons to negotiation modes"
```

---

## Task 12: Apply card-tile treatment to SponsorshipCard overview

**Files:**
- Modify: `src/components/tycoon/SponsorshipCard.tsx:34-90` (the `SlotTile` component)

- [ ] **Step 1: Update SlotTile to render a SponsorLogo**

Open `src/components/tycoon/SponsorshipCard.tsx`. Add imports near the top:

```tsx
import { SponsorLogo } from './SponsorLogo';
import { getIndustryLabel } from '../../utils/sponsorLogos';
import { getBrandMeta } from '../../data/sponsorCatalogFetcher';
```

Replace the body of the `SlotTile` component (the `<div>` returned from `SlotTile`) to insert a logo row above the existing fields. Concretely, replace:

```tsx
{deal ? (
  <>
    <p className="text-sm font-bold text-white">{deal.sponsor}</p>
```

with:

```tsx
{deal ? (
  <>
    <div className="flex items-center gap-2">
      <SponsorLogo
        name={deal.sponsor}
        meta={getBrandMeta('spain', deal.sponsor)}
        industry={deal.industry ?? 'generic'}
        size={32}
      />
      <div className="min-w-0">
        <p className="text-sm font-bold text-white leading-tight line-clamp-2 break-words">{deal.sponsor}</p>
        <p className="text-[10px] uppercase tracking-widest text-slate-500">{getIndustryLabel(deal.industry)}</p>
      </div>
    </div>
```

The closing fragments of the existing `<>` block stay intact.

- [ ] **Step 2: Lint passes**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual UI smoke**

```bash
npm run dev
```

On the Front Office overview (not the dedicated section), the SponsorshipCard tiles should now show small (32×32) logos and an industry sub-label. Sponsor names wrap instead of getting cut off.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/components/tycoon/SponsorshipCard.tsx
git commit -m "feat(tycoon): sponsor overview tile uses logo + industry label"
```

---

## Task 13: Final integration smoke + commit

**Files:** none — verification only

- [ ] **Step 1: Full lint**

Run:

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 2: Catalog test still green**

Run:

```bash
npx tsx scripts/test-sponsor-catalog.ts
```

Expected: `PASS: sponsor catalog fetcher`.

- [ ] **Step 3: Existing sponsor pipeline test still green**

Run:

```bash
npx tsx scripts/test-tycoon-sponsor.ts
```

Expected: same output as before the change set started (no regression).

- [ ] **Step 4: Browser walkthrough**

```bash
npm run dev
```

Load a Spain Tycoon save:

1. Front Office → Sponsorships: 8 cards, all names readable, logos present (logo.dev fetch OR SVG fallback).
2. Click Kit Sponsor → Renegotiate Deal → modal renegotiation flow works (slider, Accept, Decline).
3. View Contract Details → modal is read-only, Close returns.
4. Find Replacement → checkbox gate, accepting wipes-and-replaces.
5. Find New Sponsors → jumps to first open slot.
6. With every slot signed, Find New Sponsors is disabled.
7. Overview SponsorshipCard tiles show small logos and industry labels.
8. Open a save with NO Spain context (NBA save) and verify no console errors from `getBrandMeta` returning undefined or `pickSponsorName` falling back.

Stop the dev server.

- [ ] **Step 5: Final commit if anything dangling**

```bash
git status
```

If anything is untracked or modified, decide whether it belongs to a prior task and amend by re-committing into that task's scope, or open a follow-up commit:

```bash
git add -A
git commit -m "chore(tycoon): final integration tweaks"
```

(Only commit if there are remaining changes; otherwise skip.)

---

## Self-Review Notes

**Spec coverage:**
- §1 Card layout → Task 9 (section card), Task 12 (overview card).
- §2 SponsorLogo + fallback chain → Tasks 2, 3, 4.
- §3 Sponsor catalog + fetcher → Tasks 1, 5, 6, 7.
- §4 Next-Action button modes → Tasks 10, 11.
- §5 File-by-file map → Plan file structure matches.
- §6 Edge cases (gist 404, missing token, missing brand entry) → handled in resolver (`token ? ...` ternary, `meta ?? undefined`, onError fallback) and fetcher (try/catch + OFFLINE_FALLBACK).
- §7 Testing notes → Task 13 walkthrough mirrors them.
- §8 UI-internals rule → no formulas/deltas added; industry labels are descriptive words only.

**Placeholder scan:** no TBD/TODO. All code blocks are complete and self-contained.

**Type consistency:**
- `BrandMeta` from `sponsorLogos.ts` is reused by fetcher (`getBrandMeta` returns it) and `SponsorLogo` (consumes it).
- `NegotiationMode` exported from `SponsorshipNegotiationModal.tsx` is consumed by `SponsorshipSection.tsx` and `FrontOfficeView.tsx`.
- `LeagueKey` is local to the fetcher; only `'spain'` is used in call-sites — no other league is referenced.
- The fetcher's `pickSponsorName` (named `pickSponsorNameFromCatalog` at the import site to disambiguate the engine wrapper) is the only public name-picker; the engine's local function becomes a thin delegate.
