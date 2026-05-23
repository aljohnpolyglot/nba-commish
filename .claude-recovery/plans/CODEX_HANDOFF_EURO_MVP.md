# Codex Handoff — Euro Isolated Spain MVP (alle offenen Slices)

> **Lies das einmal komplett, dann arbeite stur top-down ohne Pause.**
> **Ende-Bedingung:** *alle* in diesem File gelisteten Slices haben Code im Tree UND `npx tsc --noEmit` zeigt keine NEUEN Errors in deinen geänderten Files. Erst dann: ein einziges Final-Summary, fertig.

---

## 1) Autonomie-Regeln (nicht verhandelbar)

Du wirst NICHT:
- zwischen Slices pausieren, um auf "weitermachen?" zu warten
- den User nach Klärung fragen — entscheide mit den Prinzipien unten, lass eine 1-Zeilen-Code-Kommentar-Begründung da, mach weiter
- früh aufhören weil "der nächste Slice hängt vom vorherigen ab" — er hängt nicht in einer blockierenden Weise
- aufhören weil Browser-Test erwähnt wird — Browser-Tests sind User-Aufgabe, du machst sie nie
- aufhören weil pre-existing Type-Errors auftauchen (Expansion-Actions, Draft-Generators, fictional Generator haben alte Errors — die sind KEINE Regressionen, lass sie liegen)
- zwischen Slices summarisieren — nur EINE Final-Summary am Ende
- committen außer der User fordert es explizit nach Ende auf
- Tests schreiben (keine Test-Infra existiert, lass es)
- LLM-Rebranding-Arbeit machen
- Tycoon-Layer-Slices anfassen (separate Datei `plans/euro-fm-tycoon-layer.md`, NICHT MVP)

Du WIRST:
- jeden Slice unten in der gegebenen Reihenfolge angehen
- nur neue Dateien anlegen + ≤20-LOC Hooks in NBA-Files (User-Mandat)
- nach jedem Slice den Status-Block im `plans/euro-isolated-spain-mvp.md` updaten auf `Status (YYYY-MM-DD): shipped. <1-2 Zeilen what landed>.`
- am Ende einmal `npx tsc --noEmit` laufen lassen, Output auf deine Dateien filtern, Fehler in deinen Files fixen, pre-existing Fehler ignorieren
- am Ende ein Summary listen: alle Slices shipped, alle neuen Files, alle gepatchten NBA-Files

---

## 2) Entscheidungs-Prinzipien (still anwenden, nicht fragen)

1. **NBA-Mode unberührt.** Jede Euro-Änderung gated auf `isEuroIsolatedMode(state)`, `isNoDraftLeague(state.leagueStats)`, oder `state.leagueStats?.tradesAllowed === false`. Nach jedem Slice muss NBA-Default-Save identisch funktionieren.
2. **Meiste neue Files.** NBA-Files bekommen ≤20-LOC bedingte Hooks. Nichts mehr.
3. **Euro liest aus CompetitionSpec, nie aus `leagueStats.gamesPerSeason` / `numGamesPlayoffSeries`** etc. NBA-Globals bleiben NBA-Default.
4. **Keine Hardcodes von "Spain" / "Endesa" / "Euroleague".** Alles geht via CompetitionSpec-id / `state.activeCompetitions`.
5. **Tournament-refactor.md align:** wir liefern PR 1-4 dieses Refactors implizit mit. `CompetitionSpec` ist die Generalisierung von `TournamentSpec`.
6. **Bei unklarem Pfad:** kleinste Änderung die AC erfüllt, Muster der bereits-shipped Slices kopieren (Phase 1 / Phase 2 / Slice 1 / 1a / 1c).
7. **Bei unklarer Typ-Definition:** Type lokal definieren statt cross-file zu refaktorieren.

---

## 3) Was schon shipped ist (NICHT erneut machen)

Pre-existing (Commits `6ee9d66` + `a31940f`):
- `LeagueStats.uiMode | currency | tradesAllowed` (`src/types.ts`)
- `EURO_ISOLATED_DEFAULTS` (`src/constants.ts`)
- Spain Save seedet Defaults bei init (`src/store/logic/initialization.ts`)
- `isEuroIsolatedMode` (`src/utils/uiMode.ts`)
- `isNoDraftLeague` (`src/services/offseason/offseasonState.ts`)
- `getTeamFullName` / `getTeamNickname` (`src/utils/teamNames.ts`)
- `resolveAnyTeam` / `getActiveLeagueTeams` / `isOnRoster` / `isNonNBATid` (`src/utils/teamLookup.ts`)
- `makePlaceholderGM` / `makePlaceholderCoach` (`src/services/staff/staffFallback.ts`)
- `NavigationMenu.tsx` 3-Gate-Setup (draft / trades / euroIsolated)
- `formatCurrency` Helper (`src/utils/helpers.ts:452`) — initial in `financeActions.ts` + `TransferFundsModal.tsx` ausgerollt, REST muss gemacht werden (Slice 1b Rest)
- Slice 1 (uiMode flag + clubAliasMap merge, Endesa+EL duplicate-team drop) — shipped
- Slice 1a (`CompetitionSpec` schema in `src/services/competition/types.ts`, `state.activeCompetitions` gesetzt) — shipped
- Slice 1c (Endesa + Euroleague pop overrides in `src/data/templates/spain/teamPopulations.ts`, gehookt in `externalRosterService.ts`) — shipped
- Slice 2 (NavigationMenu 3 gates) — shipped
- Phase 1 + Phase 2 komplett (resolveAnyTeam-Sweep über ~22 Team-Office/Coaching/Training Sites)

**Noch offen (deine Arbeit):** 1b Rest, 2b, 2c, 3, 4, 4b, 5, 6, 6b, 7, 8, 8b, 9, 9b, 9c, 9d, 10, 10b, 10c.

---

## 4) Slice-Reihenfolge (top-down, ohne Pause)

### Slice 1b — Currency rollout abschließen + Apply-Euro-Defaults-Preset

**Pfad:**
- `formatCurrency(amount, leagueStats)` ist in `src/utils/helpers.ts` schon definiert. Roll sie aus auf JEDE verbleibende Money-Render-Site:
  - `src/components/central/view/TeamFinancesView*.tsx` (Total Payroll, Cap Utilization, Position pie Tooltips)
  - `src/components/central/view/LeagueFinancesView.tsx` (alle $-Spalten)
  - `src/components/players/view/FreeAgentsView.tsx` (Salary-Spalte, Offer-Buttons)
  - `src/components/modals/SigningModal.tsx` (Offer-Felder)
  - `src/components/modals/TradeMachineModal.tsx` (Salary-Eyebrow, Player-Cards)
  - `src/components/players/view/PlayerStatsView.tsx` (Salary-Spalte falls vorhanden)
  - `src/components/central/view/TeamOffice/pages/GeneralManager.tsx` (Cap-Linie)
  - `src/components/central/view/TeamOffice/pages/TeamIntel.tsx` (Cap-Space-Banner)
  - Suche selbst nach weiteren via `Grep` pattern `\$\{.*\.toLocaleString\(\)|\$\{.*amount|formatSalary|toFixed.*M`
- Falls eine Stelle noch kein leagueStats lesen kann (z.B. tief in einer pure util), ändere Signatur oder import via Context.
- `EconomyTab.tsx` + `RulesHeader.tsx`: Currency Dropdown + Trades-Allowed-Checkbox prüfen ob schon da; Preset-Button "Apply Euro Defaults" prüfen. Wenn nicht ganz fertig, ergänzen.

**AC:** `git grep -n '\$' src/components | head -50` zeigt keine Salary-Hardcodes mehr in den oben gelisteten Files.

### Slice 2b — Reusable `<TeamSelector>` Komponente

**Pfad:**
- Neue Datei `src/components/shared/TeamSelector.tsx`:
  ```tsx
  type Variant = 'grid' | 'dropdown' | 'list';
  type Scope = 'active' | 'nba' | 'all' | 'nonNba';
  interface Props {
    variant: Variant;
    value: number | null;
    onChange: (tid: number) => void;
    scope?: Scope;                  // default 'active'
    showFlag?: boolean;             // default: auto (Slice 2c)
    excludeTids?: number[];
    className?: string;
  }
  ```
- Logik:
  - `scope === 'active'` → `getActiveLeagueTeams(state)`
  - `scope === 'nba'` → `state.teams`
  - `scope === 'nonNba'` → `state.nonNBATeams` mapped via `resolveAnyTeam`
  - `scope === 'all'` → beide concat
- Drei Varianten:
  - `grid` — responsive Tile-Grid mit Logo + Name + record (verwendet `getTeamFullName(team)`, NIE `${team.region} ${team.name}`)
  - `dropdown` — `<select>` flach, optional gruppiert nach Conference wenn NBA-scope
  - `list` — vertikale flex column mit Logo + Name + sub-line
- Nutze überall den canonical helper `getTeamFullName` aus `src/utils/teamNames.ts`.
- Ersetze NICHT alle ~12 Picker — nur die kritischsten in dieser Slice (Plan macht das in Spätslices):
  - `src/components/central/view/TeamOffice/pages/Home.tsx` (30-Team-Grid → `<TeamSelector variant="grid">`)
  - `src/components/training/TrainingFranchisePicker.tsx` (East/West-Split-Grid → variant=grid)
  - `src/components/players/view/PlayerStatsView.tsx` Team-Filter-Dropdown → variant=dropdown
- Andere Sites werden in 9b/9d/10c gesweept.

**AC:** Spain-Save: alle 3 patched Sites zeigen Endesa+EL Teams. NBA-Default: alle 3 zeigen 30 NBA-Teams.

### Slice 2c — Country flags

**Pfad:**
- Neue Datei `src/utils/countryFlags.ts`:
  ```ts
  const FLAGS: Record<string, string> = {
    Spain: '🇪🇸', Greece: '🇬🇷', France: '🇫🇷', Germany: '🇩🇪',
    Italy: '🇮🇹', Turkey: '🇹🇷', Serbia: '🇷🇸', Lithuania: '🇱🇹',
    Israel: '🇮🇱', Monaco: '🇲🇨', UAE: '🇦🇪',
    USA: '🇺🇸', Philippines: '🇵🇭', China: '🇨🇳', Australia: '🇦🇺',
    Japan: '🇯🇵',
  };
  export const getCountryFlag = (country?: string) => FLAGS[country ?? ''] ?? '🏳️';
  ```
- `<TeamSelector>` aus 2b: `showFlag` prop, default `true` wenn scope === 'active' && active competitions sind multi-country (Euroleague), sonst `false`.
- Hook `getTeamCountry(team, state)`: Endesa-tids → 'Spain', EL-tids → Lookup via `EUROLEAGUE_TEAM_COUNTRIES` (existiert schon), NBA → 'USA', etc.
- Setup-Picker (`src/components/setup/CommissionerSetup.tsx` Europe-Country-Dropdown): jeder Eintrag bekommt Flag-Prefix.

**AC:** Setup → Europe → Country-Dropdown: 🇪🇸 Spain. Euroleague-Kontext-Picker: jedes Team hat sein Flag.

### Slice 3 — Generic schedule generator engine

**Pfad:**
- Neue Datei `src/services/competition/competitionScheduler.ts`:
  ```ts
  import type { CompetitionSpec } from './types';
  import type { Game } from '../../types'; // oder wo Game definiert ist

  export function generateForCompetition(
    spec: CompetitionSpec,
    teams: { tid: number }[],
    seasonStart: Date,
  ): Game[] { ... }
  ```
- Switch auf `spec.format`:
  - `'regular-league'` → double round-robin (jedes Team-Paar 2× = home+away), Spiele auf `spec.daysOfWeek` placen
  - `'group-knockout'` → group stage round-robin innerhalb groups (spec.groups), dann knockout
  - `'knockout'` → single-elim aus selectedTeams (use spec.teamSelector)
  - `'tournament'` → 2 SF + 1 Final (Supercopa-/Final-Four-style)
- Datum-Placement: pro Spieltag-Slot iteriere Wochen ab `seasonStart`, finde nächsten valid `daysOfWeek` ohne `blackoutPeriods`.
- Game-Records taggen mit `competitionId` + `phase` (`'group'` / `'qf'` / `'sf'` / `'final'` / `'regular'` / `'r{week}'`).
- KEIN Hook in existing `gameScheduler.ts` in dieser Slice — Slice 5 wired den auf.

**AC:** Pure-function call mit 18 Teams + Endesa spec → ~306 games (18*17), alle getagged `competitionId: 'endesa'`, alle auf Sa/So.

### Slice 4 — Spain competitions specs (Data only)

**Pfad:**
- `src/data/templates/spain/competitions.ts` existiert schon mit Skelett (Commit `a31940f`). Erweitere zu vollen Spec-Records:
  - **endesa**: `format: 'regular-league'`, 18 teams, gamesPerTeam: 34, daysOfWeek: `['Fri','Sat','Sun']`, seasonStart Sep 28, seasonEnd May 30. `playoffFormat: { qfBest: 3, sfBest: 5, finalBest: 5 }`. `prizePool: { winner: 500_000, runnerUp: 200_000, semi: 100_000, qf: 50_000 }` (EUR).
  - **euroleague**: `format: 'group-knockout'`, 20 teams in 1 group (Real-Life-Format double RR), gamesPerTeam: 38, daysOfWeek: `['Tue','Thu']`, seasonStart Oct 1, seasonEnd Apr 30. `playoffFormat: { qfBest: 5, finalFormat: 'final-four' }`. `prizePool: { winner: 1_000_000, runnerUp: 500_000, semi: 250_000, qf: 100_000, groupParticipation: 200_000 }`.
  - **copa-del-rey**: `format: 'knockout'`, 8 teams (top-8 standings stand mid-season), gamesPerTeam: undefined, daysOfWeek: `['Thu','Fri','Sat','Sun']` (3-Tage-Turnier), seasonStart Feb 13, seasonEnd Feb 16. `prizePool: { winner: 200_000, runnerUp: 100_000 }`.
  - **supercopa**: `format: 'tournament'`, 4 teams (top-4 prior Endesa + Cup winner), daysOfWeek: `['Fri','Sat','Sun']`, seasonStart Sep 22, seasonEnd Sep 24. `prizePool: { winner: 100_000, runnerUp: 50_000 }`.
- Falls `CompetitionSpec` Type das nicht alles trägt, erweitere `src/services/competition/types.ts` minimal.
- Setup-Init (`src/store/logic/initialization.ts`) — Spain-Euro-Isolated-Path setzt `state.activeCompetitions = SPAIN_COMPETITIONS` (prüfe ob schon, sonst ergänzen).

**AC:** Spain-Save: `state.activeCompetitions.length === 4`, alle 4 ids vorhanden.

### Slice 4b — `<CompetitionBadge>` eyebrow

**Pfad:**
- Neue Datei `src/components/competition/CompetitionBadge.tsx`:
  ```tsx
  <CompetitionBadge competitionId={...} phase={...} state={state} />
  ```
- Renders pill mit `accentColor` background + `shortName` + optional phase-suffix (`"EL Group Stage"` / `"ACB R20"` / `"Copa SF"`).
- Lookup `spec = state.activeCompetitions.find(c => c.id === competitionId)`.
- Hook in `src/components/schedule/view/DayView.tsx` (oder analog) als eyebrow über Match-Card.
- Hook in `src/components/schedule/view/ScheduleView.tsx` calendar dots: color = `spec.accentColor`.
- Hook in `GameBar` (falls vorhanden).

**AC:** Schedule auf Spain-Save: Tuesday-Karten haben orange "EL Group" eyebrow, Saturday rote "ACB R{n}" eyebrows.

### Slice 5 — Schedule View / DayView multi-competition

**Pfad:**
- In `src/components/schedule/view/ScheduleView.tsx` + `DayView.tsx`: wenn `isEuroIsolatedMode(state)`, filtere `state.schedule` auf nicht-NBA-`competitionId`s (NBA-Spiele simulieren weiter, sind nur unsichtbar).
- Gruppiere Daily-Liste nach `competitionId` (Endesa-Block + Euroleague-Block).
- Hook `gameScheduler.ts` (NBA-File, ≤20 LOC): nach NBA-Schedule-Gen, iteriere `state.activeCompetitions` und rufe `generateForCompetition` (Slice 3); merge Result in `state.schedule`.

**AC:** Real-Madrid-Save, Schedule-Tab auf einen Tuesday im November: 1 EL-Karte. Auf Samstag: 1 Endesa-Karte. Real-Madrid-Woche zeigt 1 EL + 1 Endesa.

### Slice 6 — Standings competition-aware

**Pfad:**
- In `src/components/standings/view/StandingsView.tsx` (oder analog): wenn `isEuroIsolatedMode(state)`:
  - Render Endesa-Tabelle: `state.boxScores.filter(b => b.competitionId === 'endesa')` → W/L pro Endesa-Team → Punktrechnung 2-pro-Win / 1-pro-Loss → sort → single table.
  - KEIN East/West Toggle.
- NBA-Pfad unverändert.

**AC:** Sim eine Endesa-Woche → Standings-Tab zeigt aktualisierte W/L für 18 Endesa-Teams als single ranked table.

### Slice 6b — TeamIntel Euro

**Pfad:**
- `src/components/central/view/TeamOffice/pages/TeamIntel.tsx`: branch `if (isEuroIsolatedMode(state))`:
  - Banner: zwei Boxen "Endesa #N" + "EL #N (Group X)" statt Conf/Div.
  - "Cap Space" Label → "Wage Headroom", Wert via `formatCurrency`.
  - Trading-Block `Picks`-Row weglassen.
- NBA-Pfad unverändert.

**AC:** Real Madrid TeamIntel zeigt "Endesa #1 · EL #2 · Wage Headroom €18.4M".

### Slice 7 — `<CompetitionView>` (NBACupView Repurpose) + Euroleague Tab

**Pfad:**
- Extrahiere generic chrome aus `src/components/central/view/NBACupView.tsx` in neue Datei `src/components/competition/CompetitionView.tsx`:
  ```tsx
  <CompetitionView specId="euroleague" />
  ```
- Sub-Components `GroupTable`, `BracketDisplay`, `MatchCard`, `PrizePool`, `CupChampionHero`, `CupAllTournamentSection` — falls in NBACupView inline, in eigene Files unter `src/components/competition/` extracten und parametrisieren.
- NBACupView wird thin wrapper: `<CompetitionView specId="nba-cup" />`.
- Sidebar: füge in `NavigationMenu.tsx` (im euroIsolated-block) Tab "Euroleague" hinzu, routet zu `<CompetitionView specId="euroleague" />`.
- Routing in `MainContent.tsx` (≤10 LOC Hook): neuen case für `'Euroleague'` → `<CompetitionView specId="euroleague" />`.

**AC:** Spain-Save: Euroleague-Tab in Sidebar. Click → Group-Standings füllen während sim. Nach Group-Stage: Bracket. Orange-rotes Palette.

### Slice 8 — Offseason wires Endesa Playoffs + EL Final Four

**Pfad:**
- `src/store/logic/seasonRollover.ts` (oder analog): am Saisonende iteriere `state.activeCompetitions`:
  - Für `endesa`: top-8 standings → 8-team bracket → QF Bo3, SF Bo5, Final Bo5 → simulate via existing playoff machinery (use `competitionId` tag).
  - Für `euroleague`: nach group: top-8 → QF Bo5 → top-4 → Final Four (2 SF + 1 Final, single-game neutral site).
  - Champion-Records in `state.history` mit `competitionId`.
- Reuse existing playoff state shape, pro Competition gekeyed.

**AC:** Sim past June: `state.history` enthält Endesa-Champion + EL-Final-Four-Winner Entries.

### Slice 8b — TeamFinancesViewDetailed Euro variant

**Pfad:**
- `src/components/central/view/TeamFinancesViewDetailed.tsx`: branch auf `isEuroIsolatedMode(state)`:
  - "Total Payroll" → "Annual Wage Bill" (in EUR via `formatCurrency`).
  - "Cap Utilization" → "Budget Utilization" 4-segment bar (Wage / Operating / Prize / Profit).
  - Contract Timeline: bleibt.
  - Position Pie: bleibt (EUR).
  - High-Earners-Pie: threshold `>2_000_000` statt `>8_000_000`.
  - Two-Way / Non-Guaranteed / Dead Money Panels: verstecken.
  - NEU "Annual Ledger" Card: Lines Revenue/Wages/Staff/Facility/Scouting/Travel/Prize/Sponsorships/Profit. Falls Tycoon-T1-Felder noch nicht da, fülle mit Defaults (Revenue = Total Payroll × 1.15 / Profit = Revenue - Wages) damit nichts crasht.
  - NEU "Sponsorship Deals" Card: 3 leere Slots (Tycoon-T2 Platzhalter).
- NBA-Pfad unverändert.

**AC:** Real Madrid TeamFinances zeigt Annual Wage Bill / Budget Utilization / Annual Ledger / Sponsorship Deals Cards. NBA-Save zeigt alte View.

### Slice 9 — Player views default Euro pool

**Pfad:**
- `PlayerStatsView`, `PlayerBiosView`, `PlayerRatingsView`: existing league-filter dropdown — wenn `isEuroIsolatedMode(state)` und kein User-Override gesetzt, default-Filter = `['Euroleague', 'Endesa']` statt NBA.
- KEINE neue UI — nur default-Value flippen.

**AC:** Open Player Stats fresh in Spain-Save → Top 50 sind EL+Endesa-Players.

### Slice 9b — Draft-UI deletion sweep

**Pfad:** Audit alle Sites die `DraftPick`-shape rendern oder Draft-Begriffe haben. Gate auf `isNoDraftLeague(state.leagueStats)`:
- `src/components/central/view/TeamOffice/pages/DraftPicks.tsx` — top-level `if (isNoDraftLeague(state.leagueStats)) return null;`
- `src/components/central/view/TeamOffice/pages/DraftScouting.tsx` — top-level guard
- `src/components/central/view/TeamOffice/pages/TradingBlock.tsx` — Picks-Subsection in `!isNoDraft && (...)`
- `src/components/modals/TradeMachineModal.tsx` — Pick-Asset-Selector gated
- `src/components/central/view/TradeFinderView.tsx` — Pick-Suggestions gated
- `src/components/central/view/TradeProposalsView.tsx` (falls existiert) — Pick-Rows gated
- `TeamIntel.tsx` — Trading-Block Picks-Row gated (auch via Slice 6b)
- Grep nach `draftPick` / `dpid` / `Round 1 Pick` etc. und gate jedes Render-Site.

**AC:** NBA-Default: alle Draft-UI da. NBA + draftType=no_draft: alles weg. Spain: alles weg.

### Slice 9c — Offseason Aufgaben Euro structure

**Pfad:**
- `src/services/offseason/offseasonState.ts` (oder wo `OffseasonChecklistRow` definiert): füge neue Enum-Werte `'sponsorRenewals' | 'facilityUpgrades' | 'preseasonFriendlies'`.
- `getVisibleOffseasonRows(state)`: wenn `isEuroIsolatedMode(state)` → return `['options', 'qualifyingOffers', 'myFAs', 'freeAgency', 'sponsorRenewals', 'facilityUpgrades', 'preseasonFriendlies', 'trainingCamp']`.
- `OFFSEASON_ROW_LABELS` + `OFFSEASON_ROW_DESCRIPTIONS`: drei neue Entries (placeholder Labels: "Sponsor Renewals" / "Facility Upgrades" / "Preseason Friendlies").
- **Wichtig (CLAUDE.md §8):** jeder neue Row braucht `case` in `getStepConfirmSpec()` und allen anderen exhaustiven `switch(row)`s. Greppe nach `switch (row)` in `src/services/offseason/` + `src/components/offseason/` und füge cases hinzu (kann auch nur `return undefined` sein für jetzt; Slice 11 / User testet).
- Click-Handler für die 3 neuen Rows: deep-link via existing nav-dispatcher zu Finances-Sponsorship-Card / Facility-Page / Schedule-Filter-Supercopa. Falls Targets noch nicht existieren, console.log Stub akzeptabel — vermerke per Code-Kommentar.

**AC:** Spain-Offseason-Sidebar listet 8 actionable rows, keine draft-related.

### Slice 9d — Trade-UI deletion sweep

**Pfad:** Audit alle Sites die Trade-Logik rendern/dispatchen. Gate auf `state.leagueStats?.tradesAllowed === false`:
- `TeamIntel.tsx` — Trading-Block / Untouchables / Targets sub-block: `!tradesDisabled && (...)`
- `TeamOffice/pages/TradingBlock.tsx` — top-level guard
- Trade-Buttons in `PlayerActionModal.tsx` / `PlayerBioView.tsx` "Propose Trade", "Add to Trade Block": gated
- `src/services/AITradeHandler.ts` (oder analog) `runDailyTradeCycle` — am Anfang: `if (state.leagueStats?.tradesAllowed === false) return {};`
- `inboundProposalGenerator.ts` (falls existiert) — same gate
- Trade-Finder `findOffers` — same gate
- Inbox-Event-Generator: bei `tradesAllowed === false` kein neuer Event-Typ `'Trade'` mehr emittieren
- `TeamFinancesViewDetailed.tsx` — Recent-Trades-Panel falls vorhanden gated
- `state.history` Render — historische `'Trade'`-Entries WEITER zeigen (nicht löschen!), nur keine neuen mehr generieren

**AC:** NBA-Default: full Trade-UX. NBA + tradesAllowed=false: kein Trade-Button/Tab/Panel. AI sim generiert keine Trades. Spain: same wie NBA-disabled.

### Slice 10 — Free Agents pool merge

**Pfad:**
- `src/components/players/view/FreeAgentsView.tsx`: Default-Filter inkludiert NBA-FA + Endesa-FA + EL-FA wenn `isEuroIsolatedMode(state)`.
- Audit existing FA-Filter: irgendwo gibt's `p.tid === -1 && p.status === 'Active'` oder `tid >= 0 && tid < 30` — ersetze durch `p.tid === -1` (status-agnostisch für FAs) und entferne den NBA-Range-Gate.
- Vorsicht (CLAUDE.md §2): External-League-Players mit `tid +1000/+2000/+3000/...` haben eigene status-tags. FAs aus deren League sind `tid === -1` mit `status: 'Euroleague FA'` o.ä. — check via Save-Inspector wenn unsicher.

**AC:** Spain Free Agents Tab zeigt ~200+ Players spanning all loaded leagues.

### Slice 10b — League Portal Sidebar Footer

**Pfad:**
- Neue transient field `portalTarget?: 'nba' | string | null` in `GameContext` reducer state (NICHT persistiert — Add zu `LOAD_GAME` als reset to `null`).
- Neue Action `SET_PORTAL_TARGET` mit payload `string | null`.
- Neue Hook-Datei `src/utils/useEffectiveUiMode.ts`:
  ```ts
  export const useEffectiveUiMode = (state) =>
    state.portalTarget === 'nba' ? 'nba' : (state.leagueStats?.uiMode ?? 'nba');
  ```
- Update `isEuroIsolatedMode` (oder neuer Wrapper): konsultiere `portalTarget` falls gesetzt. Vorsicht: bestehender Helper bleibt für Logik die "echten" Mode braucht — der Effective-Helper ist nur für UI-Rendering.
- Alle Slice-2 Sidebar-Gates / Standings / PlayerStats / CompetitionView-Routing konsultieren `useEffectiveUiMode` statt `leagueStats.uiMode`.
- Neue Komponente `src/components/sidebar/LeaguePortalButton.tsx`:
  - `portalTarget === null && uiMode === 'euro_isolated'`: Button "🌐 Open NBA Portal" → dispatch `SET_PORTAL_TARGET: 'nba'`
  - `portalTarget === 'nba'`: Button "← Back to Liga ACB" → dispatch `SET_PORTAL_TARGET: null`
  - sonst: null
- Rendere in NavigationMenu unter Finances-Group.
- Read-only enforcement: in zentrale reducer-mutations (SIGN_FA, SAVE_GAMEPLAN, EDIT_ROSTER, etc.) early-return wenn `state.portalTarget !== null` + Toast-Dispatch "Close the Portal to make changes". Implementiere nur in 3-4 Haupt-Mutationen — Rest folgt User-Report. **Wichtig:** keine readonly-blocks für sim-tick / day-advance / NBA-background, sonst friert alles ein.

**AC:** Spain Save: Sidebar-Footer "🌐 Open NBA Portal". Click → NBA-Sidebar erscheint (Cup/All-Star/Central), Standings → NBA, PlayerStats → NBA. Button reads "← Back". Sign-FA-Versuch im Portal → Toast, kein State-Change. Back-Click → zurück, nichts mutiert.

### Slice 10c — LeagueFinances View Euro variant

**Pfad:**
- `src/components/central/view/LeagueFinancesView.tsx`: branch auf `isEuroIsolatedMode(state)`:
  - Replace columns Cap-status/MLE/TPE/expiring mit Budget-tier/Sponsorship-value/EL-appearance-3yr/Profit-projection.
  - Rows = Endesa-clubs (18) via `getActiveLeagueTeams(state)`.
  - Sort/Filter-Chrome bleibt.
  - Currency überall `formatCurrency`.
- NBA-Pfad unverändert.

**AC:** Spain GM öffnet League Finances → 18 Endesa-Clubs ranked, columns in EUR, sort funktioniert.

---

## 5) Nach allen Slices

```bash
npx tsc --noEmit 2>&1 | grep -E "^(plans|src)" | grep -v "expansion-actions\|fictionalGenerator\|draftGenerator"
```

- Filter die obigen pre-existing-Error-Files raus.
- Falls Error in DEINEN neuen / gepatchten Files: fix it, re-run.
- Falls keine Errors mehr in deinen Files: fertig.

**Final Summary (genau einmal, am Ende, dann Stop):**
```
✅ Euro Isolated Spain MVP — Slices 1b–10c shipped

New files:
- src/components/shared/TeamSelector.tsx
- src/utils/countryFlags.ts
- src/services/competition/competitionScheduler.ts
- src/components/competition/CompetitionView.tsx
- src/components/competition/CompetitionBadge.tsx
- src/components/competition/{GroupTable,BracketDisplay,...}.tsx
- src/utils/useEffectiveUiMode.ts
- src/components/sidebar/LeaguePortalButton.tsx

Patched NBA files (≤20 LOC each):
- <list>

Plan updated: plans/euro-isolated-spain-mvp.md slice statuses marked SHIPPED.

Type-check: clean in changed files. Pre-existing errors in expansion-actions / fictional generator left untouched.

Ready for browser smoke test (Slice 11, user-owned).
```

---

## 6) Wenn du absolut blockiert bist

Nur wenn ein Slice WIRKLICH nicht ohne User-Input geht (z.B. fehlende externe Daten, kaputter shared State den du selbst gebrochen hast):
- **Slice überspringen**, im Plan-File `Status: BLOCKED — <reason>` setzen
- weitermachen mit dem nächsten Slice
- am Ende im Summary listen welche Slices blocked sind

**Niemals** wegen Unklarheit / Stylefrage / unbekannter Helper-Signatur stoppen — entscheide selbst, kommentiere, weiter.

---

## 7) Befehle die du nutzt

- `Read` für Files anschauen
- `Grep` für Pattern-Suche (vorgehen wie `git grep` aber via Tool)
- `Edit` für surgical Patches in existing Files
- `Write` für neue Files
- `Bash`: nur `npx tsc --noEmit` am Ende. Kein npm run dev. Kein npm test. Kein git commit.
