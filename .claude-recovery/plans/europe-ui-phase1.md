# Plan — Europe UI Phase 1: Reusable Domestic/Continental Defaults

> **Scope:** in Euro-Isolated Saves zeigen alle Player-/Transactions-/Injuries-/Standings-Views standardmäßig nur die aktive **domestic league** (Endesa) + **continental cup** (Euroleague). Logik liest aus `state.activeCompetitions` (CompetitionSpec) — Greece/France/Italy ziehen später ohne Code-Edit an, nur via neuer Specs. Außerdem Logos in Euroleague-/Endesa-Standings.
>
> **Phase 1** = nur Default-Werte + Logo-Rendering. Keine UI-Rebuilds, keine neuen Filter-Modi.

## Acceptance Criteria

- [ ] **AC-1** Spain Euro-Isolated Save: `PlayerBiosView` startet mit `league = 'Endesa'` (statt aktuell 'All' im Euro-Pfad).
- [ ] **AC-2** `UniversalPlayerSearcher` startet mit `selectedLeagues = ['endesa', 'euroleague']` (statt `['nba']`).
- [ ] **AC-3** `PlayerComparisonView` Modal startet mit `modalLeague = 'Endesa'` (statt 'NBA').
- [ ] **AC-4** `InjuriesView`:
  - Spieler-Pool berücksichtigt zusätzlich `p.status ∈ {'Endesa', 'Euroleague'}` (nicht nur `p.tid >= 0`).
  - Team-Gruppierung resolved auch nicht-NBA tids → Endesa-/Euroleague-Teams werden mit Logo gezeigt.
  - Team-Dropdown listet Endesa-Teams (+ Euroleague-shared clubs).
- [ ] **AC-5** `TransactionsView` startet mit `filterLeague = 'Endesa'` (statt 'nba').
- [ ] **AC-6** Logos rendern:
  - `StandingsView` Euro-Pfad zeigt `<img team.logoUrl>` links neben jedem Club-Namen.
  - `CompetitionView` (Euroleague-Tab) zeigt `<img team.logoUrl>` in der Standings-Tabelle.
- [ ] **AC-7** NBA Saves: **keine Verhaltensänderung.** `uiMode === 'nba'` bzw. fehlende `activeCompetitions` → Helper liefert `null`, jeder View fällt auf bestehenden NBA-Default zurück.
- [ ] **AC-8** Keine hartkodierten Strings `'Endesa'` / `'Euroleague'` in den geänderten View-Defaults — alles über den neuen Helper. (Bestehende externe-League-Konstanten in `EXTERNAL_LEAGUES`/`EXTERNAL_STATUSES` bleiben unberührt.)
- [ ] **AC-9** Helper-API ist datengetrieben aus `state.activeCompetitions`:
  - `getDomesticCompetition(state)` → erste Spec mit `format === 'regular-league'`.
  - `getContinentalCompetition(state)` → erste Spec mit `format === 'group-knockout'`.
  - `getDomesticPlayerStatus(state)` → mapped status string oder `null`.
  - `getContinentalPlayerStatus(state)` → mapped status string oder `null`.
  - `getDefaultEuroLeagueIds(state)` → ['endesa', 'euroleague'] für UniversalPlayerSearcher.
- [ ] **AC-10** Type-check bleibt grün auf den geänderten Dateien.

## Reusability-Mechanismus (für spätere Templates)

```ts
// src/utils/euroLeagueDefaults.ts
const COMPETITION_ID_TO_PLAYER_STATUS: Record<string, string> = {
  endesa: 'Endesa',
  euroleague: 'Euroleague',
  // future: 'lbs': 'LBS', 'a1': 'A1', 'lnb': 'LNB Pro A', 'bbl': 'BBL', ...
};
```

Greece-Template fügt später `'a1': 'A1'` hinzu, definiert eine `a1` `CompetitionSpec` mit `format: 'regular-league'` — alle Views ziehen automatisch um. Kein Touch in den View-Files.

## Slice Ordering

```
1. Helper module (src/utils/euroLeagueDefaults.ts) — pure functions, no UI
2. Logo rendering (StandingsView Euro-Pfad + CompetitionView)
3. Player-View defaults (PlayerBiosView, UniversalPlayerSearcher, PlayerComparison)
4. TransactionsView default
5. InjuriesView pool + dropdown extension
```

Jede Slice = 1 mergebare Einheit, type-check muss nach jeder grün bleiben.

## File Touch Summary

- **New (1):** `src/utils/euroLeagueDefaults.ts` (~60 LOC)
- **Edit (7):**
  - `src/components/central/view/StandingsView.tsx` (Logo in Euro-Pfad, ~6 LOC)
  - `src/components/competition/CompetitionView.tsx` (Logo in Standings-Tabelle, ~6 LOC)
  - `src/components/central/view/PlayerBiosView.tsx` (Default `league`, 1 LOC)
  - `src/components/central/view/UniversalPlayerSearcher.tsx` (Default `selectedLeagues` + Reset, 2–3 LOC)
  - `src/components/central/view/PlayerComparison.tsx` (Default `modalLeague`, 1 LOC)
  - `src/components/central/view/TransactionsView.tsx` (Default `filterLeague`, 1 LOC)
  - `src/components/central/view/InjuriesView.tsx` (Pool + Team-Gruppierung + Dropdown, ~30 LOC)

Gesamt < 110 LOC Change.

## Explizit out-of-scope (Phase 2+)

- Trade-Views (TradeHub / TradeMachine) → bereits in Phase 1 vom Plan euro-isolated-spain-mvp.md über `tradesAllowed` gegated.
- Free Agents View → bereits in MVP-Slice 10 behandelt.
- Multi-Select League-Filter in TransactionsView (würde Refactor von `LeagueFilter` Type erfordern).
- LeagueOfficeSearcher / PersonnelBioView / LeagueLeadersView Defaults → eigene Slice falls noch nötig.
- Schedule / DayView Logos → bereits separat (DayView wurde schon angefasst).
