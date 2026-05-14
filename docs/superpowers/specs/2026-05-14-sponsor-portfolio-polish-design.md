# Sponsor Portfolio Polish — Design

**Date:** 2026-05-14
**Component scope:** `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx` (primary), `src/components/tycoon/SponsorshipNegotiationModal.tsx` (tab-mode wiring), `src/services/tycoon/specs/spain.ts` (sponsor data migration), new `src/data/sponsorCatalogFetcher.ts` + new `src/utils/sponsorLogos.ts`.
**Out of scope:** Bigger Euro-Tycoon layer (France/Italy data, board promises, sponsor conflict scoring tweaks). Only Spain plus a structural placeholder.

## Problem

The Front-Office → Sponsorships portfolio (Image attached by user) has three concrete issues:

1. **Sponsor card title overflows** — `text-2xl font-black truncate` on names like `Town Sup...` cuts the brand off. Users cannot read the sponsor identity in a glance.
2. **No visual brand presence** — the cards are pure text. There are no logos or industry cues, so all eight slots look identical and the "premium-vs-local" feel that the sponsor system models internally never surfaces in UI.
3. **Next-Action buttons are decorative** — Renegotiate Deal, View Contract Details, Find Replacement, Find New Sponsors all call the same `onNegotiate(slot)` and open the same modal in the same default mode. Three of the four labels are misleading.

Adjacent ask: pull default Spanish sponsor data out of `specs/spain.ts` and into the existing `aljohnpolyglot/nba-store-data` data repo so it can be edited without a code release and so logos can ride along.

## Goals

- Sponsor cards render a logo tile + readable name without truncation, in a layout that still fits all 8 slots in the existing grid.
- Logos resolve through a deterministic priority chain: **manual override (gist) → logo.dev → industry SVG icon**, with graceful `onError` fallback at runtime.
- Default Spain sponsor catalog (names + industry hints + optional domain + optional override) lives in a gist that the app fetches on first save creation, with a Spain-only payload now and an explicit `leagues` key that holds empty/null slots for `france`, `italy`, `greece`, `germany`, `turkey`, `israel` so a later PR only adds data, not schema.
- The four Next-Action buttons each open the `SponsorshipNegotiationModal` in a distinct **mode** that controls which tab is preselected and which controls are enabled.
- No regression on existing flows: AI sponsor renewal, sponsor-review banner, ticket-multiplier slider, brand profile button.

## Non-Goals

- Adding new sponsor industries or scoring math.
- Migrating `specs/spain.ts` city-prestige / tier maps.
- Real-time logo CDN caching across saves (browser HTTP cache is enough).
- A "manage your sponsor catalog" in-app editor — the catalog is curated outside the app, via the gist file.

## Design

### 1. Card layout — logo tile + smaller text

The card grows from a single text column to **logo-tile + body**:

```
┌──────────────────────────────┐
│ KIT SPONSOR              ●   │   ← label row (unchanged)
│ ┌────┐  Emirates             │   ← 56×56 logo tile + name in text-base
│ │LOGO│  Airline              │   ← industry sub-label, text-xs slate-500
│ └────┘                       │
│ VALUE          CONTRACT END  │
│ €95.34K/yr     2028          │   ← unchanged
│ A                            │   ← grade chip, unchanged
└──────────────────────────────┘
```

- `min-h-[190px]` stays.
- Sponsor name: `text-2xl font-black truncate` → `text-base font-bold leading-tight line-clamp-2`. No truncate, wraps to 2 lines, ellipsizes on the 3rd line. Long names like "Banco Santander" render in full.
- Logo tile: 56×56 rounded square, `bg-slate-900 border border-slate-800`, content from `<SponsorLogo name={deal.sponsor} industry={deal.industry} />`. Open slots show an outline-only "+" tile (existing pattern).
- Industry sub-label: `getIndustryLabel(deal.industry ?? 'generic')` returns "Airline" / "Bank" / "Tech" / "Beer" / "Local Partner" / etc. Replaces nothing; it is added under the name.

### 2. SponsorLogo component

New `src/components/tycoon/SponsorLogo.tsx`:

```tsx
<SponsorLogo name="Emirates" industry="airline" size={56} />
```

Resolution order (computed in `src/utils/sponsorLogos.ts` `resolveSponsorLogoUrl(name, catalogEntry)`):

1. `catalogEntry?.logoOverride` — full URL from the gist (`logoOverride: "https://raw.githubusercontent.com/.../emirates.png"`). Highest priority so the user can hand-pick a clean asset.
2. `https://img.logo.dev/${catalogEntry.domain}?token=${VITE_LOGODEV_TOKEN}&size=128&format=png` — only fires if a `domain` is set in the catalog. Token publishable (`pk_fgsxuNS4R2KmpzsdyrF6LQ`), client-side safe per logo.dev firewall.
3. `null` — caller renders the industry SVG fallback.

At render time `SponsorLogo`:
- If URL is non-null: `<img src={url} loading="lazy" onError={() => setFailed(true)} />`. On error, swaps to the SVG fallback. This handles 404, rate-limit, offline, etc.
- If URL is null OR `failed === true`: renders `<IndustryIcon industry={industry} />` — a small set of inline SVGs (airline ✈, bank 🏦-as-SVG, tech ◇, beer 🍺-as-SVG, gambling ♣, auto 🚗, generic ◆) on a tinted gradient (`from-{industryColor}-500/20 to-{industryColor}-800/40`). 7 industries plus generic = 8 SVGs total, hand-authored, kept in `src/components/tycoon/SponsorIndustryIcon.tsx`.

The SVG fallback is **the floor**, not a network call, so the UI is never blank even in tests or offline.

### 3. Sponsor catalog — gist + fetcher

**Gist location:** new file `sponsor-catalog.json` in the existing `aljohnpolyglot/nba-store-data` repo (same pattern as `nbacontractsdata`, `nbaallstarhistory`, `nbastore_master_database.json`). URL: `https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/sponsor-catalog.json`.

**Schema (Spain populated, others empty):**

```jsonc
{
  "version": 1,
  "leagues": {
    "spain": {
      "tiers": {
        "S": {
          "kit":     ["Emirates", "Adidas", "Herbalife"],
          "sleeve":  ["Plus500", "Mahou", "Iberdrola"],
          "back":    ["BBVA", "Endesa", "Mapfre"],
          "shorts":  ["Banco Santander", "Repsol", "Iberia"],
          "training":["Nike", "Adidas Training", "Under Armour"],
          "court":   ["Movistar", "Coca-Cola", "Spotify"],
          "stadium": ["WiZink Center", "Spotify Arena", "Movistar Arena"],
          "practice":["Real Madrid City", "Sports Hub Valdebebas", "Adidas Center"]
        },
        "A": { /* ... migrated from SPAIN_INITIAL_SPONSORS.A */ },
        "B": { /* ... */ },
        "C": { /* ... */ },
        "D": { /* ... */ }
      },
      "brands": {
        "Emirates":        { "industry": "airline", "domain": "emirates.com",        "logoOverride": null },
        "BBVA":            { "industry": "bank",    "domain": "bbva.com",            "logoOverride": null },
        "Banco Santander": { "industry": "bank",    "domain": "santander.com",       "logoOverride": null },
        "Mahou":           { "industry": "beer",    "domain": "mahou-sanmiguel.com", "logoOverride": null },
        "Movistar":        { "industry": "telecom", "domain": "movistar.es",         "logoOverride": null }
        // ... one entry per unique brand string used in any tier above
      }
    },
    "france":  null,
    "italy":   null,
    "greece":  null,
    "germany": null,
    "turkey":  null,
    "israel":  null
  }
}
```

`tiers` carries the name lists (mirrors today's `SPAIN_INITIAL_SPONSORS`). `brands` carries the per-name metadata for logo resolution. A name that appears in `tiers` but has no `brands` entry falls straight to industry-icon fallback — that is intentional and keeps the gist incrementally fillable.

**Fetcher:** `src/data/sponsorCatalogFetcher.ts` follows the pattern of `src/data/euroleagueHistoryFetcher.ts`:

- Module-level in-memory cache: `let cache: SponsorCatalog | null = null; let inflight: Promise<SponsorCatalog> | null = null;`.
- `loadSponsorCatalog(): Promise<SponsorCatalog>` — singleflight on `inflight`, sets `cache`.
- `getSponsorCatalogSync(): SponsorCatalog | null` — returns `cache` (may be null on first paint).
- `pickSponsorName(league, tier, slot, existing?)` — replaces the same-named function in `sponsorshipEngine.ts`. Reads `cache` if loaded; falls back to `SPAIN_INITIAL_SPONSORS` from `specs/spain.ts` if not (keeps `npm test` deterministic and avoids a hard network dep on save creation).
- `getBrandMeta(league, sponsorName)` — `{ industry, domain, logoOverride } | undefined`. Used by `SponsorLogo`.

**When is it called?**
- App boot: `App.tsx` triggers `loadSponsorCatalog()` as fire-and-forget, parallel to existing roster/contracts fetches.
- Save creation (`CommissionerSetup`): if Euro mode and league has a catalog, prefer catalog names; otherwise fall back to specs/spain.ts.
- Sponsor renewal / market-offer (`sponsorshipEngine.getMarketOffer`): same fallback chain.

**`specs/spain.ts` stays** as the offline fallback so unit tests and the existing Spain MVP keep passing if the gist 404s. It is no longer the *source of truth* — the gist is — but it stays in the repo as a safety net for the same reason `ROSTER_URL` has a bundled roster fallback elsewhere.

### 4. Next-Action buttons — modal mode prop

The modal today is a single-form layout (no tabs). The mode prop changes **banner copy, control enabled-state, and which slot is preselected** — it does not add a tab bar.

```ts
type NegotiationMode =
  | 'renegotiate'      // current default; sliders enabled; banner "Renegotiating {sponsorName}"
  | 'details'          // sliders + action buttons disabled (read-only summary); banner "Current deal — read only"
  | 'replacement'      // sliders enabled; amber banner "Replacing {sponsorName} — confirm to void current deal" + checkbox gate on Accept
  | 'find-new';        // sliders enabled; activeSlot forced to firstOpenSlot on mount; banner "Open the market for {slotLabel}"
```

`FrontOfficeView` is the only call-site. It passes `mode` through:

```tsx
const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot; mode: NegotiationMode }>({
  open: false, slot: 'kit', mode: 'renegotiate',
});

<SponsorshipSection
  ...
  onAction={(slot, mode) => setSponsorModal({ open: true, slot, mode })}
/>
```

`SponsorshipSection` exposes `onAction(slot, mode)` instead of `onNegotiate(slot)`. The four `Next Actions` buttons each call:

| Button label              | `onAction` call                              | When disabled                          |
|---------------------------|----------------------------------------------|----------------------------------------|
| Renegotiate Deal          | `onAction(selectedSlot, 'renegotiate')`      | `!selected` (slot is open)             |
| View Contract Details     | `onAction(selectedSlot, 'details')`          | `!selected`                            |
| Find Replacement          | `onAction(selectedSlot, 'replacement')`      | `!selected`                            |
| Find New Sponsors         | `onAction(firstOpenSlot ?? selectedSlot, 'find-new')` where `firstOpenSlot = ALL_SLOTS.find(s => !tycoon.sponsorships[s])` | all 8 slots filled (disabled, tooltip "All slots full") |

Disabled buttons use `opacity-50 cursor-not-allowed` and a `title` attribute for hover-tooltip.

The existing "View Brand Profile →" header button keeps its current behavior (`onAction(selectedSlot, 'renegotiate')`) — it is unrelated to the Next-Actions list.

**Modal internal changes:**
- `SponsorshipNegotiationModal` accepts `mode` prop, defaults to `'renegotiate'`.
- A new top-of-modal `<ModeBanner mode={mode} sponsorName={selected?.sponsor} slotLabel={SLOT_LABEL[activeSlot]} />` renders the per-mode header (color + copy varies).
- On `mode === 'details'`: all form inputs (`stance` buttons, `years` slider, `annualValue` slider, `signingBonus` slider, `performanceBonus` checkbox) are `disabled`; action buttons (Accept/Counter/Decline) are hidden; a single "Close" button is shown. The existing offer/impact panels stay visible so the user can read the current terms.
- On `mode === 'replacement'`: amber banner; a checkbox "I confirm canceling the current contract with {sponsorName}" must be ticked before "Accept" enables. On accept, the engine path calls `applyDecline(slot)` first, then `applyRenewal(slot, offer)` (both already exist in `sponsorshipEngine.ts`).
- On `mode === 'find-new'`: on mount, if `tycoon.sponsorships[initialSlot]` is non-null, the modal computes `firstOpenSlot = ALL_SLOTS.find(s => !tycoon.sponsorships[s])` and sets `activeSlot` to it. If `firstOpenSlot === undefined` (all 8 slots full), the modal short-circuits to a single message "All slots full — try Renegotiate or Find Replacement" and a Close button.

### 5. File-by-file change summary

| File                                                                                     | Change                                                                                   |
|------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `src/components/central/view/FrontOffice/sections/SponsorshipSection.tsx`                | Card layout with logo tile; Next-Action buttons wired to `onAction(slot, mode)`; signature change. |
| `src/components/central/view/FrontOfficeView.tsx`                                        | `sponsorModal` state grows a `mode` field; `onAction` callback wired in two call-sites.  |
| `src/components/tycoon/SponsorshipNegotiationModal.tsx`                                  | Accepts `mode` prop; renders disabled state for `'details'`; banner+checkbox for `'replacement'`; auto-slot-pick for `'find-new'`. |
| `src/components/tycoon/SponsorshipCard.tsx`                                              | Same card-tile + logo update as `SponsorshipSection` (this is the overview-page card variant). |
| `src/components/tycoon/SponsorLogo.tsx`                                                  | **New.** Renders `<img>` chain with industry-icon fallback.                              |
| `src/components/tycoon/SponsorIndustryIcon.tsx`                                          | **New.** 8 inline SVGs + tinted backgrounds.                                             |
| `src/utils/sponsorLogos.ts`                                                              | **New.** `resolveSponsorLogoUrl`, `getIndustryLabel`.                                    |
| `src/data/sponsorCatalogFetcher.ts`                                                      | **New.** Fetch + cache + sync getters; `pickSponsorName` re-export.                      |
| `src/services/tycoon/sponsorshipEngine.ts`                                               | `pickSponsorName` delegates to fetcher with `specs/spain.ts` fallback; no signature change. |
| `src/services/tycoon/specs/spain.ts`                                                     | Unchanged content; stays as offline fallback (commented as "fallback only — gist is source of truth"). |
| `src/App.tsx`                                                                            | One-line `loadSponsorCatalog()` kickoff next to existing data fetches.                   |
| `.env.example`                                                                           | Add `VITE_LOGODEV_TOKEN=pk_xxx` placeholder.                                              |
| `.env.local` (user-side, not committed)                                                  | User adds `VITE_LOGODEV_TOKEN=pk_fgsxuNS4R2KmpzsdyrF6LQ`.                                |

### 6. Edge cases

- **Gist 404 or offline:** Fetcher rejects; `pickSponsorName` falls back to `SPAIN_INITIAL_SPONSORS`; `getBrandMeta` returns `undefined`; `SponsorLogo` renders industry-icon fallback. Save creation never blocks on the network.
- **Brand name in gist `tiers` but not in `brands` map:** treated as `industry: 'generic'`, no domain, no override → icon fallback. By design.
- **logo.dev token missing (`VITE_LOGODEV_TOKEN` empty):** `resolveSponsorLogoUrl` skips step 2, goes domain→null. UI shows industry icons. Local dev without `.env.local` still looks good.
- **Existing saves:** Their `Sponsorship.sponsor` strings are stable across this change. Logos are derived live from the (gist-or-fallback) `brands` map by name lookup; nothing in the save needs migration.
- **AI auto-renewals (`sponsorshipEngine.applyRenewal`):** unchanged. They still write the same `Sponsorship` object; we don't need `industry` to be re-derived because `classifySponsor()` already handles it from the name string.

### 7. Testing notes

- Manual UI: load an existing Spain save in `npm run dev`, open Front Office → Sponsorships, verify:
  - All 8 cards render full names (no `Town Sup...` ellipsis on tiles ≥420px wide).
  - Cards show a logo or an industry icon (never blank).
  - Open slot card shows the "+" outline tile.
  - Each Next-Action button opens the modal in the correct mode (verified by which tab is preselected and whether inputs are enabled).
  - "Find New Sponsors" with all 8 slots filled is disabled and shows tooltip.
- Catalog fetcher unit test (`scripts/test-tycoon-sponsor.ts` pattern): mock fetch with a payload, assert `pickSponsorName('spain', 'S', 'kit')` returns from the mocked tiers; assert offline-mode falls back to `SPAIN_INITIAL_SPONSORS`.
- Run `scripts/test-tycoon-sponsor.ts` to confirm renewal/decline pipeline still passes.

### 8. UI-internals rule check

Per CLAUDE.md "UI surface — internals stay internal": no multipliers, deltas, or formula numbers are surfaced. `industry` is a descriptive label ("Airline", "Bank") — that is allowed. The card grade chip (A/B/B+) is already in production and not changed.
