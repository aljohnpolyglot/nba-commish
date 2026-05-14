# Plan: Euro Hotel / Flight Mood + Survival Downgrade

> Status: Brainstorm-only draft for review
> Created: 2026-05-13
> Scope: No code in this slice. This plan defines acceptance criteria for a later implementation.

## Goal

Travel quality should become a readable Euro-tycoon pressure system: cheap hotels and flights save cash, but repeated low-comfort road trips hurt player mood. If cash collapses, the club can enter survival mode where premium travel is locked away until finances recover.

## Mechanic A — Hotel / Flight Quality Affects Player Mood

- [ ] AC-A1 Travel quality reads from the existing Euro tycoon travel tiers for hotels, flights, and buses.
- [ ] AC-A2 Mood impact only runs in `uiMode === 'euro_isolated'`; NBA mode stays untouched.
- [ ] AC-A3 Low travel quality applies after away games, not immediately when the user changes the setting.
- [ ] AC-A4 Stars react more strongly than rotation players. Suggested tiers: K2 75+ = high sensitivity, K2 68-74 = moderate, below 68 = low.
- [ ] AC-A5 Repeated bad trips accumulate into a short prose event, e.g. "Veterans are frustrated by the club's travel standards after another rough away trip." No raw multipliers in UI.
- [ ] AC-A6 Premium and luxury travel can soften fatigue and reduce bad-trip events, but should cost enough to matter.
- [ ] AC-A7 Family-ties protection remains respected anywhere roster trimming or morale fallout might cascade into player movement.

## Mechanic B — Low-Cash Survival Mode Auto-Downgrade

- [ ] AC-B1 When `cashOnHand` falls below a defined survival threshold, travel settings auto-downgrade to economy hotel / economy flight / basic bus.
- [ ] AC-B2 Premium and luxury options show a lock state while survival mode is active.
- [ ] AC-B3 The Travel & Logistics page shows an English red warning banner: "Survival mode: low cash forces economy travel until finances recover."
- [ ] AC-B4 Survival mode unlocks only after cash recovers above a higher exit threshold, preventing flicker around the boundary.
- [ ] AC-B5 Sponsor coverage can buffer one category. Example: a flight sponsor can prevent forced flight downgrade but not hotel downgrade.
- [ ] AC-B6 Forced downgrade can trigger the same mood pressure as manual cheap travel, creating the intended cash-performance pressure loop.

## Threshold Calibration Suggestions

- Entry threshold: `cashOnHand < €2.0M` or less than one projected monthly wage bill, whichever is higher.
- Exit threshold: `cashOnHand > €4.0M` or two projected monthly wage bills, whichever is higher.
- Emergency severity: if `cashOnHand < €0`, lock all premium travel and add stronger board/owner warning copy.
- Mood hit cadence: max once per player per 14 days to avoid spam during congested road stretches.

## Interaction Matrix

| State | Travel Control | Mood Effect | UI Feedback |
| --- | --- | --- | --- |
| Healthy cash + economy travel | User choice | Small repeated-trip mood pressure | Standard cost-saving warning |
| Healthy cash + premium travel | User choice | Reduced travel fatigue | Positive comfort label |
| Survival mode + no travel sponsor | Locked low tiers | Stronger star complaints after away games | Red survival banner + lock icons |
| Survival mode + flight sponsor | Flight protected, other categories locked | Hotel/bus still create pressure | Banner notes sponsor coverage |
| Negative cash | Locked low tiers | Highest pressure and board concern | Game-over risk copy in Front Office |

## UI Hooks

- Travel & Logistics full page: survival banner, lock icons on premium/luxury, sponsor-buffer note.
- Front Office overview travel card: compact warning badge when survival mode is active.
- Player morale/drama feed: prose event after repeated low-comfort trips.
- Finance recap modal: show travel downgrade as a cash-preservation action.
- Sponsorships page: travel-related sponsors can display "covers flights" or "hotel partner" benefit copy.

## Deferred Decisions

- Whether mood pressure should alter `morale`, `roleStability`, or a new travel-frustration counter.
- Whether stars can request a transfer/loan after repeated survival-mode trips.
- Whether one-off cup final travel should automatically upgrade if cash allows.
