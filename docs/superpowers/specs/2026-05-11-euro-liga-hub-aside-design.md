# Euro Liga-Hub mit Aside (Phase 3) — Design

**Datum:** 2026-05-11
**Scope:** UI-Refactor für `euroIsolated`-Mode (Spain-Save). NBA-Mode bleibt unangetastet.
**Vorgänger:** Phase 2.5 (Sim+W-L) — gleaming-wibbling-sky.md.

## Problem

Im Spain Euro-Isolated Save fehlen Hubs für Euroleague und Liga Endesa. Die existierende `CompetitionView` zeigt nur Standings + Recent-Results, kein Bracket, keine Comp-spezifischen Analytics. NBA-Sidebar-Sections (NBA Cup, All-Star, NBA Central, Draft, Hall of Fame, Trade-Stack) sind in Spain entweder nicht relevant oder reduziert. Der User will eine schlankere, FM-style Hub-Architektur.

## Ziel-Architektur

### Linke Sidebar (in `euroIsolated` Mode, 6 Sections)

1. **MY TEAM** — Schedule · Team Office · Coaching · Training Center
2. **MY LEAGUES** — Euroleague · Liga Endesa
3. **COMMUNICATIONS** — Inbox · Messages · Social Feed · League News
4. **PLAYERS** — Transactions · Player Search · Player Comparison · Free Agents
5. **OPERATIONS** — Team Finances
6. **SPORTSBOOK** — Sports Book

NBA-Mode behält die existierende Multi-Group-Struktur. Gating per `euroIsolated && getEffectiveUiMode === 'euro_isolated'` in `NavigationMenu.tsx:128-281`.

### Liga-Hub Layout (Euroleague + Liga Endesa)

```
┌─ Sidebar ────┐ ┌─ Main ─────────────────┐ ┌─ Aside ─────────────┐
│ My Team      │ │ Euroleague · Bracket    │ │ LEAGUE              │
│ My Leagues   │ │                         │ │  ▸ Bracket (default)│
│  ★ Euroleague│ │ [QF] [SF] [Final 4]     │ │  ▸ Standings        │
│  Liga Endesa │ │  cards                  │ │ ANALYTICS           │
│ Comms        │ │                         │ │  ▸ Player Stats     │
│ Players      │ │                         │ │  ▸ Team Stats       │
│ Operations   │ │                         │ │  ▸ Top Scorers      │
│ Sportsbook   │ │                         │ │  ▸ MVP Race         │
└──────────────┘ │                         │ │ DRAMA               │
                 │                         │ │  ▸ News             │
                 │                         │ │  ▸ Recent Results   │
                 │                         │ │  ▸ Awards           │
                 └─────────────────────────┘ └─────────────────────┘
```

Aside erscheint NUR wenn `currentView ∈ {'Euroleague', 'Liga Endesa'}`. Andere Tabs (Team Office, Sportsbook, etc.) rendern volle Main-Breite ohne Aside.

Aside-Click ersetzt die Main-Area (bleibt im Liga-Hub-Kontext). Sub-View-State lebt lokal im Hub-Component (per Liga gekeyed).

## Reused Components

- **`CompetitionView`** (`src/components/competition/CompetitionView.tsx`) — wird zur Standings-Sub-View hinter dem Aside-Item "Standings".
- **`SeriesCard`, `BracketColumn`** (`src/components/playoffs/bracket/`) — direkt in CompetitionBracketView importiert. Akzeptieren `series: PlayoffSeries`, `teams: NBATeam[]` — wir bauen Adapter, der `competitionResolver`-Output → `PlayoffSeries`-Shape mappt und `nonNBATeams` als `NBATeam[]`-Slot übergibt.
- **`competitionResolver.resolveCompetitionSeason()`** (`src/services/competition/competitionResolver.ts:397`) — liefert `standings + knockoutMatches + playInMatches + championTid + …`. Bracket-View ruft das auf, generiert Round-Spalten daraus.
- **`PlayerStatsView`, `TeamStatsView`, `LeagueLeadersView`, `AwardRacesView`** — werden mit comp-Filter (tid-Range pro spec.id) gerendert. Wo Filter-Prop nicht existiert, thin Wrapper bauen, der `state.players` lokal vorfiltert.

## New Files

```
src/components/competition/
├── CompetitionHubLayout.tsx       # Wrapper mit Aside + Sub-View-Switcher
├── CompetitionAside.tsx           # Right Aside — Sub-Item-Liste
├── CompetitionBracketView.tsx     # Liga-Bracket aus competitionResolver
└── (CompetitionView.tsx)          # bestehend, wird Standings-Sub-View
```

## Changed Files

```
src/types.ts                                    # Tab union: 'Liga Endesa' (neu), 'Euroleague' (existiert)
src/components/sidebar/NavigationMenu.tsx       # 6-Section euroIsolated-Branch
src/components/layout/MainContent.tsx           # Routing: 'Euroleague' + 'Liga Endesa' → CompetitionHubLayout
```

## Sub-View Routing (im Hub)

| Aside-Item | Component | Filter |
|---|---|---|
| Bracket (default) | `CompetitionBracketView` | `competitionId` |
| Standings | `CompetitionView` (existing) | `specId` |
| Player Stats | `PlayerStatsView` wrapped | tid range pro Liga (Endesa: 5000-5999, EL: 1000-1999) |
| Team Stats | `TeamStatsView` wrapped | tid range |
| Top Scorers | `LeagueLeadersView` wrapped | tid range |
| MVP Race | `AwardRacesView` wrapped | tid range |
| News | New stub: filter `state.news` by competitionId | competitionId |
| Recent Results | Reuses CompetitionView's recent-results panel | competitionId |
| Awards | New stub | competitionId |

**Phase-1-Scope:** Bracket + Standings live, Rest als "Coming Soon"-Stubs (außer wenn der existing View einen `compFilter`-Prop schon hat → dann live wired).

## Slices

1. **Slice 1 — Sidebar 6-Section:** `NavigationMenu.tsx` euroIsolated-Branch. Type-Union ergänzt um `'Liga Endesa'`. Keine Verhaltensänderung in NBA-Mode.
2. **Slice 2 — `CompetitionBracketView`:** Adapter `competitionResolver → PlayoffSeries-shape`, `BracketColumn` direkt importiert. Bracket zeigt "TBD"-Karten während Group Stage, real-Karten nach KO-Start.
3. **Slice 3 — `CompetitionHubLayout` + `CompetitionAside`:** Layout-Wrapper, Sub-View-State lokal, Aside-Items mit aktive-Highlights.
4. **Slice 4 — MainContent Routing:** `case 'Euroleague'` + `case 'Liga Endesa'` → `CompetitionHubLayout specId={…}`.
5. **Slice 5 — Sub-View Stubs:** Standings live, Rest "Coming Soon". Folge-Slice für Analytics-Wiring.

## Out of Scope (Folge-Slices)

- Comp-spezifische Player/Team-Stats-Wiring (Slice 5 nur Stub).
- Mobile-Layout der Aside (initial: Aside collapse auf <md).
- News-Filter pro Liga (Stub).
- All-Tournament-Team UI für EL Final Four.
- Saisonende-Snapshot in `competitionHistory.standings`.

## Verification

1. `npx tsc --noEmit` → keine neuen Errors.
2. Spain-Save laden → Sidebar zeigt 6 Sections.
3. Euroleague-Tab → Hub mit Bracket + Aside (Bracket aktiv).
4. Aside → Standings → Tabelle erscheint in Main.
5. Liga Endesa-Tab → analoger Hub, Endesa-Bracket-Format (Bo3/Bo5/Bo5).
6. NBA-Save laden → Sidebar unverändert (alte Multi-Group-Struktur).
