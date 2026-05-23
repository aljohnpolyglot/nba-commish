# Plan: League Profile Pattern — NBA + Europe Entkoppelung

> **Status:** Awaiting AC sign-off. No code touched yet.
> **Scope:** Big-bang refactor — alle Touch-Points in einem Sweep.
> **Migration:** Fresh-Save-only. Kein LOAD_GAME-Migrator.

## Problem

Aktueller Codebase hat **ein** Regelwerk (NBA) als Default. Euromode (Spain) patcht via `isEuroIsolated`-Inseln in ~15+ Files. Konsequenz: jede neue Regel oder UI-Komponente vergisst irgendwo den Euro-Check → silent failures.

Konkrete Bugs aus den letzten Sessions die alle aus dieser Coupling stammen:

| Symptom | Root cause |
|---|---|
| AD signing "transaction recorded" aber kein Roster-Move | `state.teams.find(t => t.id === 5012)` schlug fehl — Endesa-Club nicht in `state.teams` |
| "Bird Rights" / "Max Extension" Badges im Euromode SigningModal | UI-Logik checked Player.contract ohne League-Context |
| Sep-FA-Signings silent geblockt | `currentDate < faStart` Gate (NBA Jul 1) ohne Euro-Bypass |
| "Cap Projection / +5% Escalator" im Endesa-Signing | Cap-UI rendert immer, prüft nicht `salaryCapEnabled` |
| AD "signed for $48M/4yr" (USD) auf Breogan | Display-Layer kennt kein Currency-Routing pro Save |
| Training Camp Sep 29 default | NBA-Datum als globaler Fallback |
| Open-Training-Camp transportiert nach Sep 14, 2026 (next year) | Phase-Marker NBA-zentrisch, kein Euro-Pendant |
| Supercopa hatte Efes/AEK/Pana | `selectCompetitionTeamTids` Fallback "Endesa OR Euroleague" |
| Active 2026-expiring NBA-Player im Sign-Modal akquirierbar | Kein Tampering-Gate für Active-status Players |

## Architecture

Ein **`LeagueProfile`** pro Save in `state.leagueStats.profileId` (`'nba' | 'euro_isolated'`). Der Profile-Resolver liefert struct mit allen verhalten-relevanten Knöpfen:

```ts
// src/profiles/types.ts
export interface LeagueProfile {
  id: 'nba' | 'euro_isolated';

  calendar: {
    seasonStart: { month: number; day: number };
    seasonEnd:   { month: number; day: number };
    trainingCamp:{ month: number; day: number };
    openingNight:{ month: number; day: number } | 'derive-from-comps';
    faStart:     { month: number; day: number } | 'open-continuous';
    tradeDeadline: { month: number; ordinal: number; dayOfWeek: 'Thu' } | null;
    allStar:     { month: number; ordinal: number; dayOfWeek: 'Sun' } | null;
    moratoriumDays: number;
  };

  cap: {
    enabled: boolean;
    capUSD: number | null;
    luxuryTax: boolean;
    apronsCount: 0 | 1 | 2;
    minSalaryRule: 'cba-vii' | 'continuous' | 'open';
    contractTypes: ('GUARANTEED' | 'NON_GUARANTEED' | 'TWO_WAY')[];
    twoWaySlots: number;
    maxRosterSize: number;        // NBA 15, Endesa 14
    campRosterSize: number;       // NBA 21, Endesa 16-17
  };

  fa: {
    hasFixedWindow: boolean;      // NBA true (Jul 1 → Sep), Euro false
    hasBirdRights: boolean;
    hasMaxContract: boolean;
    hasSupermax: boolean;
    hasMLE: boolean;
    hasRestrictedFA: boolean;
    rookieScale: 'cba' | 'none';
  };

  contracts: {
    currency: 'USD' | 'EUR';
    currencySymbol: '$' | '€';
    maxYears: number;
    extensionRules: 'cba' | 'none';
  };

  draft: {
    enabled: boolean;
    rounds: 0 | 2;
    eligibilityAge: number | null;
    pickTradesAllowed: boolean;
    tradablePickSeasons: number;
  };

  rollover: {
    ageProgression: 'standard' | 'euro-veteran-curve';   // Endesa veterans retire ~1y earlier
    retirementCurve: 'nba' | 'euro';
    contractExpirationMonth: number;                     // when contracts flip to FA: NBA=7 (Jul), Euro=6 (Jun end-of-Endesa)
    runNBARolloverEvenInEuroMode: false;                 // = pure split
  };

  ui: {
    showCapProjection: boolean;
    showBirdRightsBadge: boolean;
    showMaxEligibleBadge: boolean;
    showTwoWayToggle: boolean;
    showTradesTab: boolean;
    primaryCompetitions: string[];                        // ['endesa', 'euroleague']
    flagEmoji: string;
  };
}
```

**Profile factory:**

```ts
// src/profiles/nbaProfile.ts
export const NBA_PROFILE: LeagueProfile = { id: 'nba', calendar: { seasonStart: { month: 10, day: 21 }, ... }, ... };

// src/profiles/euroProfile.ts
export const EURO_PROFILE: LeagueProfile = { id: 'euro_isolated', calendar: { seasonStart: { month: 9, day: 28 }, faStart: 'open-continuous', ... }, ... };

// src/profiles/index.ts
export function getLeagueProfile(state: GameState): LeagueProfile {
  return state.leagueStats?.uiMode === 'euro_isolated' ? EURO_PROFILE : NBA_PROFILE;
}
```

Adding France/Italy later = add `franceProfile.ts`, no other code changes.

## Vertical Slices

### Slice 1 — Profile-Module schaffen
**Goal:** `LeagueProfile` type + NBA + Euro Profile + Resolver. Zero call sites yet.

**Files:**
- `src/profiles/types.ts` (NEW)
- `src/profiles/nbaProfile.ts` (NEW)
- `src/profiles/euroProfile.ts` (NEW)
- `src/profiles/index.ts` (NEW)

**AC:**
- [ ] `getLeagueProfile(state)` returns NBA_PROFILE for vanilla NBA save
- [ ] Returns EURO_PROFILE when `state.leagueStats.uiMode === 'euro_isolated'`
- [ ] All fields populated from current `EURO_ISOLATED_DEFAULTS` + NBA defaults from constants.ts
- [ ] Typecheck passes

### Slice 2 — Calendar via Profile
**Goal:** `dateUtils.ts` helpers nehmen optional `profile` Argument, fallen auf NBA default zurück wenn nicht gegeben.

**Files:**
- `src/utils/dateUtils.ts` (MODIFY: `getTrainingCampDate`, `getOpeningNightDate`, `getFreeAgencyStartDate`, `getTradeDeadlineDate`, `getAllStarDate`)
- All call-sites that have access to state (`PlayButton.tsx`, `offseasonState.ts`, `AIFreeAgentHandler.ts`, `OffseasonAufgaben.tsx`, `GameContext.tsx`, `CalendarView.tsx`, `debugCheats.ts`) → pass profile through

**AC:**
- [ ] `getTrainingCampDate(year, profile)` returns Sep 14 for Euro, Sep 29 for NBA
- [ ] `getFreeAgencyStartDate(year, profile)` returns null/null for Euro (continuous), Jul 1 for NBA
- [ ] Euromode TradeDeadline returns null (no trade deadline in Endesa)
- [ ] `offseasonState.getOffseasonState()` reads profile, uses Euro-aware phase markers
- [ ] No NBA dates leak into Euro UI (verified by grepping for hardcoded month/day)

### Slice 3 — Cap & FA Rules via Profile
**Goal:** Signing-Logik, Cap-Math, Bird Rights, MLE — alle lesen Profile statt `isEuroIsolated` Boolean.

**Files:**
- `src/store/logic/actions/playerActions.ts` (MODIFY: SIGN_FREE_AGENT gates)
- `src/utils/salaryUtils.ts` (MODIFY: `getCapThresholds`, `getMLEAvailability`, `getContractLimits`, `hasBirdRights`)
- `src/services/AIFreeAgentHandler.ts` (MODIFY: uses profile.cap + profile.fa)

**AC:**
- [ ] Euromode signing: no FA-window gate, no MLE check, no over-cap rejection
- [ ] NBA signing: same as before (no regression)
- [ ] `getCapThresholds` returns `{ enabled: false }` for Euro, full NBA tier for NBA
- [ ] `hasBirdRights(player)` returns false unconditionally in Euromode (profile.fa.hasBirdRights = false)
- [ ] **Active-player tampering gate**: Sign-FA-Modal refuses `player.status === 'Active'` in both modes (separate fix piggy-backed)

### Slice 4 — SigningModal UI via Profile
**Goal:** SigningModal liest Profile, versteckt NBA-Specifics in Euromode komplett.

**Files:**
- `src/components/modals/SigningModal/SigningModal.tsx` (MODIFY: hide MaxBadge/SupermaxBadge/CapProjection/MLE-buttons/TwoWay-toggle in Euromode via profile.ui)

**AC:**
- [ ] Euro SigningModal: no Max/Supermax badge, no Cap Projection block (Salary Schedule only), no TwoWay tab, no MLE button
- [ ] NBA SigningModal: identical to current
- [ ] Currency: € everywhere in Euro flow, $ everywhere in NBA flow (single rendering helper reads profile.contracts.currencySymbol)
- [ ] "Last salary" formats in original-contract currency (LeBron $52.63M in Euromode shows as $52.63M with USD label, not €)

### Slice 5 — FreeAgentsView via Profile
**Goal:** Upcoming-FAs Liste zeigt entweder Sign-Button (Euro: continuous) oder Tampering-Warning (NBA: must trade).

**Files:**
- `src/components/players/view/FreeAgentsView.tsx` (MODIFY: tampering gate)

**AC:**
- [ ] Click on Active-status "Upcoming FA" player: shows "Player is under contract — try Trade" instead of opening SigningModal
- [ ] True FA pool (`status === 'Free Agent'`) opens SigningModal as before
- [ ] Roster counts read profile.cap.maxRosterSize (15 NBA, 14 Endesa)

### Slice 6 — Schedule + Rollover via Profile
**Goal:** Year-end rollover-Pass läuft pro Profile separat. Euro hat eigene Retirement-Curve, Age-Aging-Modell, contract-expiration-Datum.

**Files:**
- `src/services/logic/seasonRollover.ts` (MODIFY: branch on profile.rollover.runNBARolloverEvenInEuroMode)
- `src/services/logic/autoResolvers.ts` (MODIFY: FA-Pass reads profile.fa.hasFixedWindow)
- `src/store/logic/gameLogic.ts` (MODIFY: schedule generation reads profile.calendar)

**AC:**
- [ ] Euro-Save Year-End (Jun): all Endesa contracts with `exp <= currentYear` flip to FA simultaneously
- [ ] NBA-Save Year-End (Jul 1): same, but with NBA Jul 1 timing
- [ ] **Pure split:** in Euro-save, NBA-side rollover does NOT run (NBA players freeze where they are — they're irrelevant scenery)
- [ ] Year-1 → Year-2 produces sane FA pool for the active league only

### Slice 7 — `isEuroIsolated`-Sweep + Cleanup
**Goal:** Alle `isEuroIsolated`-Checks ersetzt durch Profile-Reads. EURO_ISOLATED_DEFAULTS gelöscht.

**Files:**
- Grep `isEuroIsolatedMode\|euro_isolated\|isEuroIsolated` across codebase, replace with `getLeagueProfile(state).flag`
- Delete: `src/constants.ts:EURO_ISOLATED_DEFAULTS` (move into euroProfile)
- Delete: `src/utils/uiMode.ts` (kept as `isEuroIsolatedMode = getLeagueProfile(state).id === 'euro_isolated'` shim for backward compat OR deleted entirely)

**AC:**
- [ ] `grep -r "isEuroIsolated" src/` returns ≤5 hits (each justified)
- [ ] All Euro behavior derives from Profile, not from boolean checks
- [ ] Typecheck passes, no broken imports

## Critical Files

**New:**
- `src/profiles/types.ts` — `LeagueProfile` interface
- `src/profiles/nbaProfile.ts` — NBA defaults
- `src/profiles/euroProfile.ts` — Euro-isolated (Spain) defaults
- `src/profiles/index.ts` — `getLeagueProfile(state)` resolver

**Heavy modifications:**
- `src/components/modals/SigningModal/SigningModal.tsx` (UI gates → profile)
- `src/store/logic/actions/playerActions.ts` (SIGN_FREE_AGENT gates → profile)
- `src/utils/salaryUtils.ts` (cap/MLE/Bird Rights → profile)
- `src/utils/dateUtils.ts` (calendar helpers → profile)
- `src/services/offseason/offseasonState.ts` (phase markers → profile)
- `src/services/logic/seasonRollover.ts` (rollover split)
- `src/services/AIFreeAgentHandler.ts` (FA handler reads profile)
- `src/components/players/view/FreeAgentsView.tsx` (tampering gate)

**Light modifications (call-site updates):**
- ~20 files that call `getTrainingCampDate`/etc. — add profile argument

## Out of Scope

- **Save-Migration:** Bestehende Spain-Saves kriegen keine automatische Migration. User startet neu.
- **France/Italy/Germany Profiles:** Slice 8+ — separate Plan.
- **NBA-side simulation in Euromode:** Per `rollover.runNBARolloverEvenInEuroMode: false` — NBA-Teams existieren im Euro-Save als statische Szenerie für PlayerBio cross-lookup, aber haben kein eigenes Year-End-Rollover, keine FA-Pass, keine Trades. Wenn du das später willst, neuer Slice.
- **Tampering-Trade-System:** Active-Player über Sign-Modal akquirieren ist hart gegated. Wenn du "tamperen mit Risiko"-Feature willst (LeBron contacted, gets dropped from WAS, signs for Breogan, WAS files complaint) → separater Slice.
- **Currency Conversion Engine:** Cross-Liga Contracts (LeBron's USD-Last → EUR-New) bleibt auf einfacher `EUR ≈ USD * 0.92` Rate hardcoded in profile.contracts. Dynamic FX später.

## Risks

- **Typing-Burden:** ~30 Funktionen kriegen `profile?: LeagueProfile` Argument. Default-Param hilft, aber Call-Sites müssen entweder Profile durchreichen oder NBA-Default akzeptieren.
- **Test-Coverage:** Kein Unit-Test-Pass aktuell. Wir lehnen uns auf In-Game-Verification (User klickt durch beide Modes).
- **Save-Compat:** Existing Saves könnten `state.leagueStats.profileId` nicht haben → muss aus `uiMode` ableiten. Fallback in `getLeagueProfile`.
- **Big-Bang-Risk:** Wenn ein Slice fehlt, fällt das Game vermutlich nicht mehr in den Default-NBA-Pfad zurück. Mitigation: NBA-Profile als komplett-vorhandene Source-of-Truth (= aktuelle Hard-Coded-Werte verbatim).

## Verification

After all slices land:

1. **NBA Sanity:** Start vanilla NBA save → Pick LAL → sim through Jul FA → Trade Deadline → All-Star → Playoffs → Rollover. **Expected:** Identical behavior to before refactor.

2. **Euro Sanity:** Start Spain save → Pick Real Madrid → Sep 14 land → Friendlies sim → Endesa Opening Night → Euroleague Group → Copa del Rey → F4 → Year-End-Rollover. **Expected:** No NBA labels, no Bird Rights/Max badges, no Cap Projection, all € symbols, FA continuous (Sep signing works).

3. **Tampering Gate:** In Euro save, click AD (Active on WAS, exp 2026) in Upcoming FAs list. **Expected:** Modal says "Under contract — try Trade", not SigningModal.

4. **No-leak grep:** `grep -r "Cap Rm\|Max Extension\|Bird Rights\|Two-Way\|MLE" src/components/` should show all hits gated by profile.ui flags.

5. **Currency:** AD signs for Breogan. Transactions log shows "**€48M**/4yr", not $.

## Sign-off

When you've reviewed and want me to start: confirm with "go" and I'll execute Slices 1-7 in sequence. Estimated touch surface: ~40 files, ~600 LOC net change.
