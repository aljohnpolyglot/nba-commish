# Plan — Europe UI Phase 2: Drei-Tab League-Splits + SportsBook Hook

> **Scope:** In Euro-Isolated Saves bekommen die zentralen "Listen"-Views einen **3-Tab-Switcher** (Endesa | Euroleague | NBA) am Header. Statistical Feats wird **merged** mit Liga-Column. SportsBook bekommt **2 Tabs** (Endesa | Euroleague) + EUR-Währung. NBA-Tab dient als schneller Sprung, ist aber auch über das NBA Portal erreichbar.

## Reusable Foundation (Slice 1)

### Helper-Erweiterung (`src/utils/euroLeagueDefaults.ts`)
```ts
export type LeagueTabId = 'domestic' | 'continental' | 'nba';

export interface LeagueTab {
  id: LeagueTabId;
  label: string;          // 'Liga Endesa' | 'EuroLeague' | 'NBA'
  competitionId?: string; // 'endesa' | 'euroleague' | undefined (NBA)
  league?: NonNBATeam['league']; // 'Endesa' | 'Euroleague' | undefined (NBA)
}

getLeagueTabs(state): LeagueTab[];                            // [Endesa, Euroleague, NBA] in Euro; [] in NBA
getDefaultLeagueTabId(state): LeagueTabId;                    // 'domestic' in Euro, 'nba' sonst
getTeamsForLeagueTab(state, tabId): NBATeam[];                // active-league + resolveAnyTeam
filterScheduleByLeagueTab(state, tabId, schedule): Game[];    // competitionId === tab.competitionId
filterBoxScoresByLeagueTab(state, tabId, boxScores): BoxScore[];
```

### Shared Component (`src/components/shared/LeagueTabSwitcher.tsx`)
- Props: `value: LeagueTabId; onChange: (id: LeagueTabId) => void; tabs?: LeagueTab[]`
- Rendert nichts wenn `getLeagueTabs(state).length === 0` (NBA-only).
- Sonst eine Pill-Strip mit den Tab-Labels.

## Acceptance Criteria

- [ ] **AC-1 PowerRankingsView** — Euro-Save: Tab-Strip [Endesa | Euroleague | NBA], default 'Endesa'. Endesa-Tab listet 18 ACB-Clubs mit W/L aus competitionId='endesa' Spielen. Euroleague-Tab → 20 EL-Clubs aus competitionId='euroleague'. NBA-Tab unverändert.
- [ ] **AC-2 LeagueLeadersView** — Selber Tab-Strip, default 'Endesa'. Leaders rechnen pro Tab nur über zugehörige BoxScores.
- [ ] **AC-3 TeamStatsView** (team-stats/) — Selber Tab-Strip. Team-Liste + Stats pro Tab.
- [ ] **AC-4 PlayerStatsView** — Selber Tab-Strip. Player-Pool wird pro Tab auf die Spieler der Liga-Clubs reduziert; current-season Stats werden aus BoxScores mit passender `competitionId` aggregiert.
- [ ] **AC-5 StatisticalFeatsView** — **kein Tab-Strip**; stattdessen merged Liste (Endesa + Euroleague + NBA in Euro Mode), neue Spalte `Liga` zeigt zu welcher Competition jedes Feat gehört. NBA-Feats nicht in Liga-Column gefiltert raus, sondern als `'NBA'` markiert (nur Euro-Mode wenn user NBA Portal nutzt). Phase 2 Variante: NBA Feats verstecken; nur Endesa+Euroleague in Liste.
- [ ] **AC-6 PlayerRatingsView** — Selber Tab-Strip falls Pool spezifisch ist; ansonsten skip Slice (Ratings sind nicht liga-spezifisch).
- [ ] **AC-7 SportsBookView** — 2 Tabs (Endesa | Euroleague). NBA-Spiele werden in Euro-Mode nicht gewettet. Quoten/Wallets in EUR über `formatCurrency(state.leagueStats)`.
- [ ] **AC-8 NBA Save (uiMode='nba'):** Keine Verhaltensänderung. `getLeagueTabs(state)` → `[]`, Tab-Strip rendert nichts, Views laufen NBA-only weiter.
- [ ] **AC-9** Type-Check bleibt grün auf geänderten Files; keine neuen Errors außerhalb der bereits dokumentierten pre-existing (DraftSim/initialization/GameContext expansion).

## Slice Ordering

```
1. Foundation: euroLeagueDefaults Erweiterung + LeagueTabSwitcher (Component)
2. PowerRankingsView (kleinste — proof of pattern, 306 LOC)
3. LeagueLeadersView (434 LOC)
4. StatisticalFeatsView (merged + Liga-Column, 600 LOC) — Sonderfall ohne Tabs
5. TeamStatsView (704 LOC, in team-stats/)
6. PlayerStatsView (1456 LOC — größte, Stats per competitionId neu aggregieren)
7. PlayerRatingsView (538 LOC — falls erforderlich)
8. SportsBookView (835 LOC, 2 Tabs + EUR)
```

Jede Slice = ein Commit-fähiger Stand. Type-Check zwischen Slices.

## Architectural Notes

- **NonNBA Team-Liste:** in Tabs muss `state.nonNBATeams.filter(t => t.league === tab.league)` resolved via `resolveAnyTeam(...)` zu einer `NBATeam`-Shape (Logo/Region/wins/losses) gemappt werden — wins/losses kommen für non-NBA aktuell direkt aus dem schedule + boxScore-loop.
- **Schedule / BoxScore Filter:** `g.competitionId === 'endesa'` ist seit Session 60 verlässlich gesetzt; NBA-Spiele haben kein `competitionId`.
- **Player.stats[] vs BoxScore-Aggregation:** Phase 2 aggregiert für die aktuelle Saison **direkt aus state.boxScores** (gleiches Pattern wie `cupStatsByPlayer` in PlayerStatsView). Historische Splits per Competition über player.stats[] sind nicht in Scope (würde Backend-Migration brauchen).

## Out of scope (Phase 3+)

- Multi-Season Stats-Splits nach Competition (player.stats[] Schema-Migration).
- Liga-Filter im PlayerRatingsView falls nicht zwingend.
- SportsBook Quoten-Modell mit FIBA-spezifischen Margen.
- Power Rankings Cross-Liga (z.B. "wie würde Real Madrid in NBA ranken").
