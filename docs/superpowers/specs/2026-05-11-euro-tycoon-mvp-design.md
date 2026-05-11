# Euro-Isolated Tycoon Layer — MVP Spec (T1 + T2 + T8)

> **Scope:** Erste Tycoon-Slice für `uiMode === 'euro_isolated'`. Ersetzt den kosmetischen Fake-Ledger in `TeamFinancesViewDetailed.tsx` durch eine echte Budget-Engine (T1), ein 3-Slot-Sponsoring-System mit Renewals (T2) und year-over-year persistierten Annual Ledger (T8). NBA-Mode bleibt unangetastet.
>
> **Follow-up Slices (eigene Specs):** T5 Facilities mit Sim-Hooks · T17 Board Confidence · T16 FFP · T7 Bankruptcy-Ladder.

## Goal

Ein Spanish-Endesa-GM-Save mit `tycoonEnabled === true` zeigt im TeamFinancesView keinen Fake-Ledger mehr, sondern echte Einnahmen-/Ausgaben-Zahlen, die aus Klub-Tier, sportlichem Erfolg, drei aktiv verhandelbaren Sponsoring-Slots und der laufenden Saison berechnet werden. Year-Ends persistieren einen historischen Ledger; Cash-on-Hand und 3-Year-FFP-Defizit werden gepflegt, damit die späteren Stack-Slices darauf aufsetzen können.

## Acceptance Criteria

- [ ] **AC-1** Real Madrid Saison 2026: TeamFinancesView Euro-Branch zeigt `Revenue ~€56M`, `Wages ~€35M`, `Profit ~+€14M`. Alle Werte aus echten Quellen (Matchday + Sponsorship-Verträge + Prize Pool + TV + Erfolg-Multiplikator), nicht aus `payroll × Faktor`.
- [ ] **AC-2** Burgos in derselben Saison: `Revenue ~€4.5M`, `Profit ~−€700K`. Der Spread Real Madrid ↔ Burgos kommt nicht aus Payroll-Größe, sondern aus Tier × Matchday × Sponsorship × Erfolg.
- [ ] **AC-3** Sponsorship-Card zeigt 3 echte Slots (Kit / Sleeve / Stadium) mit `valuePerYear`, `yearsRemaining`, Sponsor-Name. Keine "Tycoon placeholder"-Strings mehr.
- [ ] **AC-4** Year-End-Rollover schreibt einen `AnnualLedger` in `team.tycoon.ledgerHistory`. Nach drei simulierten Saisons zeigt die Ledger-History-Card drei Zeilen mit Profit/Cash-Verlauf.
- [ ] **AC-5** Wenn ein Sponsoring-Slot `yearsRemaining === 0` erreicht, taucht im Year-End in der Offseason-Aufgaben-Sidebar eine `sponsorRenewal<Slot>`-Row auf. Klick darauf öffnet `SponsorshipNegotiationModal` für genau diesen Slot. Nach Decision verschwindet die Row.
- [ ] **AC-6** "Renew" akzeptiert ein Angebot zum berechneten Marktwert, schreibt neuen Vertrag mit `yearsRemaining = 3–4` Jahren in `team.tycoon.sponsorships[slot]`. "Decline" setzt den Slot auf den Default-Fallback (Tier-Base × 0.5).
- [ ] **AC-7** Nach Endesa-Titel feuert eine News-Mail "Emirates bietet Mid-Term-Verlängerung +20%" mit Accept/Decline-Buttons. Accept verlängert sofort um +2 Jahre zum aktuellen valuePerYear × 1.20.
- [ ] **AC-8** `team.tycoon.cashOnHand` wird nach jedem Year-End um `ledger.profit` angepasst und über Saves hinweg persistiert.
- [ ] **AC-9** `team.tycoon.ffpRollingDeficit` summiert `min(profit, 0)` der letzten 3 Saisons. Wird im UI als kleines Banner in der Ledger-History-Card angezeigt (Vorbereitung für Slice T16; keine Strafen in dieser MVP-Slice).
- [ ] **AC-10** NBA-Saves zeigen keine Verhaltensänderung: TeamFinancesView NBA-Branch unverändert, kein `team.tycoon`-Zugriff auf NBA-Teams, kein Performance-Hit beim Year-End-Rollover für NBA-Pfad.
- [ ] **AC-11** Bestehende Euro-Saves ohne `team.tycoon`-Feld werden beim `LOAD_GAME` migriert: Defaults seedet + 3 Sponsoring-Slots mit `yearsRemaining` zufällig 1–4 Jahre, damit Renewals nicht alle gleichzeitig kommen.

## Architektur

### Datenmodell — neue Felder auf `team`

Alle Felder optional. Nur in Euro-Saves befüllt. Vorbereitung für Slice T5/T16/T17 ist in dieser Struktur enthalten, auch wenn die Werte hier noch nicht ausgewertet werden.

```ts
// src/types/tycoon.ts (NEUE DATEI)
export type SponsorshipSlot = 'kit' | 'sleeve' | 'stadium';

export interface Sponsorship {
  sponsor: string;
  valuePerYear: number;        // EUR
  yearsRemaining: number;
  signedYear: number;
}

export interface FacilityState {
  level: number;                // 1–5
  upgradePending?: {
    targetLevel: number;
    finishYear: number;
    cost: number;
  };
}

export interface AnnualLedger {
  year: number;
  revenue: {
    matchday: number;
    sponsorship: number;
    prize: number;
    tv: number;
    transfer: number;             // MVP = 0, T10 später
  };
  expenses: {
    wages: number;
    staff: number;
    facility: number;
    scouting: number;
    travel: number;
    financeCosts: number;         // MVP = 0, T7 später
  };
  profit: number;                 // sum(revenue) - sum(expenses)
  cashOnHandEnd: number;
  ffpDeficitContribution: number; // min(profit, 0)
}

export interface TycoonState {
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  sponsorships: {
    kit: Sponsorship | null;
    sleeve: Sponsorship | null;
    stadium: Sponsorship | null;
  };
  facilities: {
    stadium: FacilityState & { capacity: number };
    trainingCenter: FacilityState;
    academy: FacilityState;
  };
  ledgerHistory: AnnualLedger[];  // letzte 10 Saisons, FIFO
  cashOnHand: number;             // EUR, kann negativ werden
  boardConfidence: number;        // 0–100, MVP = static 60
  ffpRollingDeficit: number;      // sum negative profits letzter 3 Jahre
}

// extension auf existierendes Team-Type
declare module './nba' {
  interface NBATeam {
    tycoon?: TycoonState;
  }
}
```

### Neue Files (Greenfield)

```
src/types/tycoon.ts
src/services/tycoon/
  budgetEngine.ts           — computeAnnualBudget(team, leagueStats, competitionResults) → AnnualLedger
  sponsorshipEngine.ts      — getMarketOffer(team, slot), generateRenewal(team, slot), applyDecision(...)
  ledgerEngine.ts           — snapshot(team, ledger) → pushes into ledgerHistory + updates cash/FFP
  facilityEngine.ts         — STUB für MVP; computeFacilityOps(team) → expenses.facility, computeMatchdayCapacity(team)
  eventChecker.ts           — In-Season-Events (Sponsor-Mid-Term, Bank-Alarm-Stubs)
  specs/spain.ts            — Tier-Mapping, Tier-Base-Werte, initial Sponsorship-Seed-Pool
src/components/tycoon/
  SponsorshipNegotiationModal.tsx
  SponsorshipCard.tsx       — pro Slot, ersetzt 3 "Tycoon placeholder" divs
  LedgerHistoryCard.tsx     — Tabelle letzte 5 Saisons + FFP-Banner
  AnnualLedgerCard.tsx      — Revenue/Expenses-Breakdown, ersetzt Z. 83–125 Body
```

### Hook-Coats (Patches in existierenden Files)

| File | LOC | Was |
|------|-----|-----|
| `src/components/central/view/TeamFinancesViewDetailed.tsx` Z. 83–125 | ~50 LOC | Fake-Ledger raus, drei neue Cards rein (AnnualLedger / Sponsorship / History) |
| `src/services/seasonRollover.ts` | ~15 LOC | `if (tycoonEnabled) { ledger = budgetEngine.compute(...); ledgerEngine.snapshot(team, ledger); }` |
| `src/store/reducers/LOAD_GAME` | ~25 LOC | Migration: Euro-Saves ohne `team.tycoon` → seed Defaults aus `specs/spain.ts` |
| `src/services/offseason/offseasonState.ts` | ~10 LOC | Neue Rows `sponsorRenewalKit/Sleeve/Stadium` in `OFFSEASON_ROW_ORDER`, gated auf Euro-mode + `yearsRemaining === 0` |
| `src/services/offseason/getStepConfirmSpec.ts` | ~15 LOC | `case`-Einträge für die 3 neuen Rows (öffnet `SponsorshipNegotiationModal`) — siehe CLAUDE.md Bug #8 |
| `src/services/simulation/simulationHandler.ts` | ~8 LOC | Daily-Tick: `if (tycoonEnabled) eventChecker.tick(team, gameDate)` |

## Budget-Engine (T1) — Formel

```
revenue.matchday    = stadium.capacity × averageAttendancePct(tier, successMultiplier)
                       × ticketPriceTier × 30 (Heimspiele inkl. EL)
// averageAttendancePct enthält den successMultiplier bereits; nicht zusätzlich draufmultiplizieren
revenue.sponsorship = sum of 3 slots; falls Slot null → tierBase.sponsorshipFloor × 0.5
revenue.prize       = competitionResults.endesa.prize + .euroleague.prize
revenue.tv          = tierBase.tv (statisch, spanische TV-Rechte zentral)
revenue.transfer    = 0  // T10 future

expenses.wages       = sum of contract.amount für tid === team.tid in EUR
expenses.staff       = wages × 0.10  // T6 future macht das aus echten Staff-Verträgen
expenses.facility    = sum of facility-levels × tierBase.facilityOpsPerLevel
expenses.scouting    = tierBase.scoutingBudget (statisch in MVP)
expenses.travel      = tierBase.travelBase + (EL-Auswärts-Spiele × €40K)
expenses.financeCosts = max(0, -cashOnHand) × 0.05   // 5% Zins auf Schulden; MVP = 0 falls cashOnHand ≥ 0

profit = sum(revenue) - sum(expenses)
```

### successMultiplier
- Endesa-Platz 1–4: ×1.25
- Endesa-Platz 5–8: ×1.10
- Endesa-Platz 9–14: ×1.00
- Endesa-Platz 15–18: ×0.85
- Plus: EL-Final-Four = +0.20, EL-QF = +0.10, EL-Teilnahme = +0.05

### Tier-Base-Werte (`specs/spain.ts`)

| Tier | Klubs | Stadium-Cap | TicketPrice | TV-Base | Sponsor-Floor / Slot | FacilityOpsPerLevel | TravelBase | ScoutBudget |
|------|-------|-------------|-------------|---------|----------------------|---------------------|------------|-------------|
| S    | Real Madrid, FC Barcelona | 15.000 | €45 | €8M | €3M | €400K | €800K | €600K |
| A    | Valencia, Baskonia, Joventut, Unicaja | 10.000 | €30 | €3M | €1M | €200K | €500K | €300K |
| B    | Gran Canaria, Tenerife, Bilbao, Murcia, Zaragoza, Burgos | 7.500 | €22 | €1.5M | €400K | €120K | €350K | €150K |
| C    | Manresa, Andorra, Breogán, Granada | 5.500 | €18 | €800K | €200K | €80K | €250K | €80K |
| D    | Aufsteiger / kleinste Klubs | 4.500 | €15 | €400K | €100K | €50K | €180K | €40K |

## Sponsoring (T2)

### Marktwert-Formel

```
marketValue(team, slot) =
    tierBase.sponsorshipFloor[slot]
  × (1 + recentSuccessBonus)        // sum 1-Saison-Bonus aus letzten 3 Saisons (max +0.45)
  × (1 + prestigeFactor[tier])      // S: 0.5, A: 0.3, B: 0.1, C: 0.0, D: -0.1
  × (existingSponsor ? 1.10 : 1.00) // Loyalty-Bonus bei Renewal
  × randomNoise(0.95..1.05)
```

### Renewal-Flow

1. Year-End checkt jeden Slot. Falls `yearsRemaining === 0`:
2. `eventChecker` queued neue `OffseasonRow` `sponsorRenewal<Slot>`
3. User öffnet Sidebar → klickt Row → `SponsorshipNegotiationModal` öffnet sich
4. Modal zeigt: aktueller Sponsor (oder "auslaufend"), Markt-Angebot mit `valuePerYear`, `years (3–4 random)`, Default-Fallback-Vergleich
5. User wählt **Accept** → neuer Vertrag in `team.tycoon.sponsorships[slot]` geschrieben, Row als done markiert
6. User wählt **Decline** → Slot bleibt `null`, Default-Fallback greift in nächster Revenue-Berechnung (tier-base × 0.5)

### In-Season-Events (`eventChecker.tick`)

| Event | Trigger-Bedingung | Action |
|-------|-------------------|--------|
| `sponsorMidTermBonus` | Endesa-Titel just gewonnen oder EL-Final-Four-Sieg | News-Mail mit Accept/Decline; Accept = `valuePerYear × 1.20`, `+2 yearsRemaining` |
| `sponsorPoachingOffer` | EL-Final-Four-Run + bestehender Sleeve-Vertrag noch ≥ 2 Jahre | News-Mail; Accept = bestehenden brechen, Penalty = `valuePerYear × yearsRemaining × 0.30` als One-Time-Cost, neuer Vertrag startet |
| `sponsorWarning` | 5+ Niederlagen in Folge | News-Mail (passiv): "Sponsor signalisiert Sorge, nächste Renewal -10%" → setzt ein One-Off-Flag, der die nächste Marktwert-Berechnung dämpft |
| `crisisMeeting` | Platz 16+ bei Saisonhälfte (Januar) | News-Mail (passiv): "Vorstand-Krisensitzung" → Vorbereitung Slice T17, hier nur Flavor |
| `bankAlarm` | `cashOnHand < 0` für 30+ Spieltage in Folge | News-Mail: "Bank-Alarm" + setzt `financeCosts`-Flag (passiv in MVP; T7 Bankruptcy aktiviert die Stack-Stufen) |

## Year-End-Rollover-Sequenz

In `seasonRollover.ts`, hinzugefügt nach CompetitionResults-Resolution und vor Offseason-Start:

```ts
if (state.leagueStats.tycoonEnabled) {
  for (const team of state.teams) {
    if (!team.tycoon) continue;  // NBA-Teams oder un-migrierte Teams

    // 1. Berechne aktuellen Ledger
    const ledger = budgetEngine.computeAnnualBudget(team, state.leagueStats, competitionResults);

    // 2. Snapshot
    ledgerEngine.snapshot(team, ledger);  // pushes into history, updates cashOnHand, recalc ffpRollingDeficit

    // 3. Dekrementiere alle Sponsoring-yearsRemaining
    for (const slot of ['kit', 'sleeve', 'stadium'] as const) {
      const s = team.tycoon.sponsorships[slot];
      if (s) {
        s.yearsRemaining -= 1;
        if (s.yearsRemaining <= 0) {
          team.tycoon.sponsorships[slot] = null;  // Slot wird leer, Offseason-Row triggert Renewal
        }
      }
    }

    // 4. Facility-Upgrades, deren finishYear erreicht ist, abschließen
    facilityEngine.completeFinishedUpgrades(team, state.leagueStats.year);
  }
}
```

## UI-Layout (TeamFinancesView Euro-Branch)

```
┌─────────────────────────────────────────────────────────┐
│  ← Back            EURO FINANCE                          │
│  Real Madrid                                             │
│  ┌─Wage Bill─┬─Utilization─┬─Projected Profit─┐         │
│  │ €30.59M   │ 87%         │ +€14.2M ✓        │         │
│  └───────────┴─────────────┴──────────────────┘         │
├─────────────────────────────────────────────────────────┤
│  ┌─Annual Ledger (2026)──────┐ ┌─Sponsorship Deals────┐ │
│  │ Revenue                    │ │ Kit:    Emirates     │ │
│  │  Matchday    €21.5M        │ │         €15M  4y    │ │
│  │  Sponsorship €24.0M        │ │ Sleeve: Plus500      │ │
│  │  Prize Pool   €3.0M        │ │         €5M   2y    │ │
│  │  TV           €8.0M        │ │ Stadium:WiZink       │ │
│  │  Total       €56.5M        │ │         €4M   6y    │ │
│  │                            │ │ [Negotiate]          │ │
│  │ Expenses                   │ └──────────────────────┘ │
│  │  Wages      −€35.0M        │ ┌─Ledger History──────┐ │
│  │  Staff       −€3.5M        │ │ 2024: +€11M  €36M    │ │
│  │  Facility    −€2.0M        │ │ 2025: −€2M   €34M ⚠  │ │
│  │  Travel      −€1.2M        │ │ 2026: +€14M  €48M    │ │
│  │  Scouting    −€0.6M        │ │ FFP 3y Defizit: €2M  │ │
│  │                            │ │ Cash on Hand: €48M   │ │
│  │ Profit       +€14.2M       │ └──────────────────────┘ │
│  └────────────────────────────┘                          │
│  ContractTimeline (unverändert, bleibt)                  │
└─────────────────────────────────────────────────────────┘
```

## Migration

`LOAD_GAME` reducer:
1. Falls `state.leagueStats.uiMode === 'euro_isolated'` UND mindestens ein Team hat kein `tycoon`-Feld:
2. Lade Tier-Mapping aus `specs/spain.ts`
3. Pro Team: seed `tycoon: {...}` mit:
   - `tier` aus Klub-Mapping
   - `sponsorships`: 3 Slots gefüllt aus Initial-Pool, `yearsRemaining` random 1–4
   - `facilities`: `stadium.capacity` aus Tier, `level: 1` für alle
   - `ledgerHistory: []`
   - `cashOnHand`: Tier-spezifischer Start-Cash (S: €40M, A: €15M, B: €5M, C: €2M, D: €500K)
   - `boardConfidence: 60`
   - `ffpRollingDeficit: 0`
4. `state.leagueStats.tycoonEnabled = true` setzen, falls noch nicht gesetzt

## Was diese Slice NICHT macht

- Keine Facility-Upgrade-UI / keine Sim-Hooks für Facility-Levels (Slice T5)
- Kein Board-Confidence-Drift / kein `BoardReviewModal` (Slice T17)
- Keine FFP-Strafen — `ffpRollingDeficit` wird nur gepflegt, nicht ausgewertet (Slice T16)
- Keine Bankruptcy-Ladder — `financeCosts` bleibt 0 in MVP (Slice T7)
- Keine FM-Sponsor-Bidding-Wars (Backlog "New Features")
- Kein NBA-Tycoon-Import (User-Mandate: erst Euro fertig, dann NBA-Port)

## Folgespecs (eigene Docs)

- `2026-XX-XX-tycoon-t5-facilities.md` — Stadium/TC/Academy Upgrades mit Sim-Hooks
- `2026-XX-XX-tycoon-t17-board.md` — Confidence-Skala + Entlassung
- `2026-XX-XX-tycoon-t16-ffp.md` — Strafen-Stufen + UI-Banner
- `2026-XX-XX-tycoon-t7-bankruptcy.md` — Ladder mit Auto-Player-Sale
