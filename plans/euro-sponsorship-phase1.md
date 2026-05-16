# Euro Sponsorship Redesign — Phase 1

**Status:** Awaiting AC sign-off
**Date:** 2026-05-12
**Scope:** Foundation layer for the full Deep sponsorship system. Phase 2 (industries + conflicts) and Phase 3 (offseason task + alternatives modal + TV-pool) follow in separate PRs.

## Phase 1 goals

1. Expand from 3 slots to **8 slots** (kit / sleeve / back / shorts / training / court / stadium / practice).
2. **Group slots into 3 functional categories** in the UI:
   - **Cash sponsors (6):** kit, sleeve, back, shorts, training, court — pure annual €/yr into the sponsorship ledger line.
   - **Stadium driver (1):** stadium — pays cash *and* drives matchday (sponsor quality boosts attendance %, user sets ticket price via slider).
   - **Progression driver (1):** practice — pays cash *and* (Phase 1.5) boosts player development. Phase 1 displays a "boosts player development" label only; the actual progression-engine wiring lands in Phase 1.5.
3. **Fix the tier-lookup bug** that seeds Real Madrid as Tier D (currently shows €100k/yr sponsor values instead of €3M).
4. Recalibrate the **tier × slot value tables** to realistic Euroleague levels (Tier S ≈ €13M floor total, Tier D ≈ €0.47M floor total).
5. Add **`cityPrestige` field** to `TycoonState` and use it as a baseline multiplier (decouples value from tier-only).
6. Add **signing bonus** to `Sponsorship` interface (UI display only this phase — math wires up in Phase 2).
7. **Stadium ticket-price slider** (50%–200% of tier base) with live matchday-revenue preview.
8. **Stadium sponsor → attendance multiplier:** the stadium-slot sponsor's `valuePerYear / floor` ratio becomes a small attendance-pct boost (capped at +10pp).
9. UI: `SponsorshipCard` shows the 8 slots in 3 grouped sections. `SponsorshipNegotiationModal` slot-tabs handle 8.
10. Save migration: old 3-slot saves auto-extend to 8 slots; new slots seed at a fallback value (no sudden cash injection); `cityPrestige` backfill; tier-lookup re-resolve.
11. Update `scripts/test-tycoon-sponsor.ts` to cover new schema.

**Explicitly out of scope for Phase 1:**
- Industries + conflict rules (Phase 2)
- Multiple competing offers in modal (Phase 3)
- Offseason `SPONSORSHIPS_REVIEW` task card (Phase 3)
- Star-power detection & multiplier (Phase 2)
- TV-rights market-share pool (Phase 3)
- Practice → `progressionEngine` wiring (Phase 1.5 — label-only this phase)
- Scandal / sponsor-backfire system, including gambling-sponsor penalties (Phase 3). Phase-1 betting/gambling sponsors pay above-market without downsides — "cheat-code" by design until the scandal system lands.

## Acceptance criteria

- **AC1** — A new save with Real Madrid as user team shows sponsor values in the millions (kit ≥ €3M/yr, stadium ≥ €3.5M/yr), not €100k.
- **AC2** — A new save with Granada (Tier D) as user team still shows small sponsor values (kit < €200k/yr).
- **AC3** — `SponsorshipCard` renders all 8 slots in a single card, mobile-friendly (no horizontal scroll on a 360px viewport).
- **AC4** — `SponsorshipNegotiationModal` has 8 slot-tabs, each shows a market offer with `valuePerYear`, `signingBonus`, and `years`. Accept/Decline buttons work.
- **AC5** — An existing 3-slot save loads without crash and now reports 8 slots (the 5 new ones seeded as low-value fallback deals).
- **AC6** — `cityPrestige` is set for every team during migration: Madrid/Barcelona ≈ 1.0, Valencia/Baskonia ≈ 0.8, Bilbao/Gran Canaria ≈ 0.6, Manresa/Andorra ≈ 0.4, Granada/Breogán ≈ 0.3.
- **AC7** — `scripts/test-tycoon-sponsor.ts` passes with the new 8-slot schema.
- **AC8** — `LeagueFinancesView` Euro-branch sums all 8 sponsorship slots (not just the legacy 3) when displaying total sponsorship revenue.
- **AC9** — No regression in NBA-mode finances views — the 8-slot logic is gated by `isEuroIsolatedMode(state)`.
- **AC10** — `SponsorshipCard` renders the 8 slots in 3 grouped sections with section headers: "Sponsors", "Matchday", "Player Development". Each section shows what the group does in plain words (no multiplier numbers — per the CLAUDE.md "internals stay internal" rule).
- **AC11** — Stadium row has a ticket-price slider (50%–200% of `tb.ticketPrice`). Moving the slider updates the matchday-revenue line in the live ledger preview within the card.
- **AC12** — Practice row displays the static text "Boosts player development (coming soon)". No progression-engine wiring this phase.

## Tier × slot value table (€/yr floor)

| Slot      | Tier S | Tier A | Tier B | Tier C | Tier D |
|-----------|--------|--------|--------|--------|--------|
| Kit       | 3,500k | 1,200k | 500k   | 250k   | 120k   |
| Sleeve    | 2,000k | 700k   | 300k   | 150k   | 70k    |
| Back      | 1,500k | 500k   | 200k   | 100k   | 50k    |
| Shorts    | 800k   | 300k   | 100k   | 50k    | 20k    |
| Stadium   | 4,000k | 1,500k | 600k   | 300k   | 150k   |
| Training  | 600k   | 250k   | 100k   | 50k    | 30k    |
| Court     | 400k   | 150k   | 60k    | 30k    | 15k    |
| Practice  | 300k   | 100k   | 40k    | 20k    | 10k    |
| **Total** | **13.1M** | **4.7M** | **1.9M** | **0.95M** | **0.47M** |

## City prestige table

| Tier | Clubs | Prestige |
|------|-------|----------|
| S    | Real Madrid, Barcelona                                    | 1.00 |
| A    | Valencia, Baskonia, Joventut, Unicaja                     | 0.80 |
| B    | Bilbao, Gran Canaria, Tenerife, Murcia, Zaragoza, Burgos  | 0.55 |
| C    | Manresa, Andorra                                          | 0.40 |
| C/D  | Breogán, Granada                                          | 0.30 |

Prestige multiplier applies as `floor × cityPrestige` during seeding and renewal offer generation. (In Phase 1 the formula is `floor × prestige × (0.9 + rand × 0.3)` — the prestige column above replaces the prior implicit tier-only logic.)

## File map

**Modify:**
- `src/types/tycoon.ts` — `SponsorshipSlot` union (3 → 8), `Sponsorship.signingBonus` field, `Sponsorship.industry` field (typed but unused this phase), `TycoonState.cityPrestige` field, `TycoonState.ticketPriceMultiplier` field (0.5–2.0, default 1.0)
- `src/services/tycoon/specs/spain.ts` — `TierBase.sponsorshipFloor` becomes per-slot map (8 entries), new `CITY_PRESTIGE: Record<string, number>` table, new `getCityPrestige(name)` helper
- `src/services/tycoon/sponsorshipEngine.ts` — `getMarketOffer`/`seedInitialSponsorships` iterate over 8 slots, apply `cityPrestige`, include `signingBonus` in offer return
- `src/services/tycoon/migrate.ts` — 3→8-slot upgrade path, `cityPrestige` + `ticketPriceMultiplier` backfill, tier-lookup fix
- `src/services/tycoon/budgetEngine.ts` — `slotRev` 3→8; matchday formula reads `ticketPriceMultiplier` and stadium-sponsor-quality boost
- `src/components/tycoon/SponsorshipCard.tsx` — render 8 slots in 3 grouped sections with section headers ("Sponsors" / "Matchday" / "Player Development"); stadium row includes ticket-price slider; practice row includes "coming soon" label
- `src/components/tycoon/SponsorshipNegotiationModal.tsx` — slot-tab list of 8, signing-bonus row in offer panel
- `src/components/central/view/LeagueFinancesView.tsx` (or equivalent) — sum sponsorship revenue across all 8 slots in the Euro branch
- `scripts/test-tycoon-sponsor.ts` — extend assertions to cover 8 slots + cityPrestige + ticketPriceMultiplier matchday math

**Create:** none in Phase 1.

## Implementation order

1. Types (`SponsorshipSlot` union + `cityPrestige` + `signingBonus`).
2. Specs (`spain.ts` floor table + prestige table + helper).
3. Sponsorship engine (seed + market offer over 8 slots).
4. Migration (3→8 + prestige backfill + tier fix).
5. budgetEngine `slotRev` over 8 slots.
6. UI: `SponsorshipCard` (compact 8-slot layout).
7. UI: `SponsorshipNegotiationModal` (8 tabs + signing-bonus row).
8. UI: `LeagueFinancesView` Euro-branch aggregation fix.
9. Tests in `scripts/test-tycoon-sponsor.ts`.
10. Manual smoke test in browser: start fresh Madrid save → verify AC1; load an old 3-slot save → verify AC5.

## Open questions

None — all axes resolved in the brainstorm. If conflicts arise during implementation, I'll pause and ask before guessing.
