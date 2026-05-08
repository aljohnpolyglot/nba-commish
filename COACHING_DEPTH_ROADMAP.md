# Coaching Depth Roadmap

Festgehalten 2026-05-05. Dieses Dokument fasst den Brainstorm rund um **DailyPlanModal-Tooltips → AI-Coach Saisonphasen-Logik → Matchup Game Planner** zusammen. Drei Phasen, getrennt nach „schon im Code", „kleine Lücke" und „große Zukunfts-Module".

Für die laufende Bug-/Economy-Backlog: weiter `TODO.md`. Für den Status der Trainings-Pipeline-Auslieferung: `TEAM_TRAINING_PLAN.md`. Dieses MD ist additiv und ändert die anderen beiden nicht.

## Status

- [x] Phase 1a — `getIntensityDescription` mit 3-Tier-Copy (low/mid/high) pro Paradigma
- [x] Phase 1b — Recovery-Workload-Slider gesperrt (kein User-Input möglich)
- [x] Phase 1c — `PARADIGM_TEMPLATES` mit Allocations + Tooltip-Strings
- [x] Phase 1d — Info-Icons mit `<Tooltip>` umwickeln (Workload Intensity + System Practice, 2026-05-05)
- [x] Phase 2 — AI-Coach Saisonphasen-Logik **shipped Session 54** (`src/services/training/aiCoachParadigm.ts` — Game-Day skip / Camp 85 / Preseason 60 / Playoffs Recovery 30 oder Offensive 70 / Reg-Saison Tier-by-WinPct). User-Team unverändert.
- [x] Phase 2.5 — AI Auto-Setup **shipped Session 54** (`src/services/training/aiAutoSetup.ts` — One-Shot Dev-Focus + Mentor-Backfill bei Save-Load + Aug 15)
- [x] Phase 3 (UI+Persist) — Matchup Game Planner **shipped Session 54** (4 Stores: `defenseGameplanStore`, `defenderDetailStore`, `rivalGameplanStore`, `matchupAssignmentsStore`; `DefenseTab.tsx` als UI; `CoachingHubView.tsx` als Top-Level Surface)
- [ ] Phase 3 (Sim-Wiring) — `GameSim` muss die vier Stores lesen → siehe TODO.md "QUEUED — Coaching Phase 3 Sim-Wiring"
- [x] Phase 4 (Catalog) — Defensive System Library **shipped Session 54** (`src/utils/defensiveSystemDescriptions.ts` + `defensiveSystemFit.ts`; Defensive Aura via `trainingTick` + `engine.ts`)
- [ ] Phase 4 (Per-System Sim-Effects) — Box-and-One/Press/etc. brauchen spezifische Stat-Effekte über generisches Aura-Multiplier hinaus → siehe TODO.md "QUEUED — Defensive System Library Sim-Bridge"

---

## Phase 1 — DailyPlanModal Tooltips & Slider-Beschreibungen

**Datei:** `src/TeamTraining/components/DailyPlanModal.tsx`

### Schon ausgeliefert

- **`PARADIGM_TEMPLATES`** (Zeilen 36–77) — 5 Paradigmen mit Intensity-Defaults, Allocations und Tooltip-Strings:
  - Balanced 50% / 30·30·20·20
  - Offensive 50% / 60·10·10·20
  - Defensive 50% / 10·60·10·20
  - Biometrics 50% / 10·10·60·20
  - Recovery **15%** / 5·5·10·80 (Hard-coded Intensity)
- **`getIntensityDescription(paradigm, intensity)`** (Zeilen 107–138) — gibt drei Tiers zurück, geroutet an `intensity < 40 → low`, `< 70 → mid`, sonst `high`. Beispiele:
  - Balanced low: „Film study, walk-throughs" / mid: „Competitive drills, balanced reps" / high: „Full-speed 5v5, game intensity"
  - Offensive low: „Offensive film, spacing work" / mid: „Live offensive sets, game speed" / high: „Explosive 5v5 offense, max reps"
  - Defensive low: „Defensive schemes, closeouts" / mid: „Live defensive 5v5, pressure" / high: „Full-speed defense, game intensity"
  - Biometrics low: „Mobility, flexibility, prehab" / mid: „Speed & strength drills" / high: „Max effort vertical, plyometrics"
  - Recovery (alle Tiers): „Film study + treatment / activation / mobility" — bleibt absichtlich konstant, Slider ist gesperrt.
- **Recovery-Slider-Lock** — `disabled={localParadigm === 'Recovery'}` an Zeile 272, plus `opacity-50 grayscale` an Zeile 262. Recovery-Tag fixiert Intensity auf 15 %.
- **`<Tooltip>`-Komponente** existiert in `src/TeamTraining/components/ToolTip.tsx` — 400 ms Hover-Delay, props `text` + `children`, Touch-Friendly mit 2-Sekunden-Auto-Hide.

### Lücke (Phase 1d)

Die Info-Icons sind sichtbar, aber nicht verdrahtet — sie haben `cursor-help`, zeigen aber **keinen Tooltip-Inhalt**:

- `DailyPlanModal.tsx:250-251` — Workload-Intensity Info-Icon
- `DailyPlanModal.tsx:405-407` — System-Practice Info-Icon

**Fix-Skizze:**

```tsx
// Workload Intensity (Zeile ~250):
<Tooltip text="Game-Speed vs. Practice-Speed. Recovery-Tage sind auf 15 % fixiert.">
  <div className="bg-slate-800 p-0.5 md:p-1 rounded-full cursor-help">
    <Info size={10} className="text-slate-400 md:w-3 md:h-3" />
  </div>
</Tooltip>

// System Practice (Zeile ~405):
<Tooltip text="Bis zu 5 Sets, an denen das Team an diesem Tag trainiert. Verbessert System Familiarity.">
  <div className="…">
    <Info size={…} />
  </div>
</Tooltip>
```

Optional: Paradigm-Buttons (`DailyPlanModal.tsx:340-369`) bekommen `template.tooltip` als Hover — die Strings sind in `PARADIGM_TEMPLATES` schon da.

### Nicht-Ziele in Phase 1

- Keine neuen Paradigmen erfinden.
- Keine Allocation-Slider-Logik anfassen — die rebalancen sich bereits zu 100 %.
- Keine „HOW TO USE"-Box. Tooltips reichen — die Box wäre auf Recovery-Tagen sowieso sinnlos.

---

## Phase 2 — AI-Coach Saisonphasen-Logik

**Ziel:** AI-Teams sollen ihren Trainingskalender automatisch passend zur Saisonphase füllen, statt jeden Tag „Balanced 50 %" zu fahren. Default für AI bleibt Balanced (siehe `TEAM_TRAINING_PLAN.md` Guiding Principle), aber Intensity + Paradigma sollen sich an Phase, B2B-Status und Team-Form orientieren.

**Andock-Punkte:**
- `src/services/training/trainingScheduler.ts` — füllt den Trainingskalender. Hier muss die Phasenlogik einhängen.
- `src/services/training/trainingTick.ts` — täglicher Tick. Liest Schedule, könnte hier die „heutige Empfehlung" für AI berechnen.
- `src/utils/dateUtils.ts` — bestehende Helfer für Saisonphasen / FA-Fenster / Playoff-Daten als Quelle für Phasen-Erkennung.

**Pseudocode (aus dem Brainstorm):**

```ts
type SeasonPhase = 'offseason' | 'training_camp' | 'regular_season' | 'playoffs';

function getAICoachIntensity(
  phase: SeasonPhase,
  daysSinceLastGame: number,
  hasGameTomorrow: boolean,
  teamWinPct: number,
  isContender: boolean
): { intensity: number; paradigm: TrainingParadigm } {

  if (phase === 'offseason')      return { intensity: 75, paradigm: 'Biometrics' };
  if (phase === 'training_camp')  return { intensity: 85, paradigm: 'Balanced'   };

  if (phase === 'regular_season') {
    if (daysSinceLastGame === 0)             return { intensity: 15, paradigm: 'Recovery'  }; // Game-Day
    if (hasGameTomorrow)                     return { intensity: 20, paradigm: 'Recovery'  }; // B2B vorne
    if (teamWinPct < 0.400)                  return { intensity: 80, paradigm: 'Defensive' }; // Struggling: Defense lock
    if (isContender && teamWinPct > 0.600)   return { intensity: 50, paradigm: 'Balanced'  }; // Load-Mgmt
    return { intensity: 65, paradigm: 'Balanced' };                                            // Default
  }

  // Playoffs: every-other-day Recovery, sonst Offensive-heavy
  return daysSinceLastGame === 1
    ? { intensity: 30, paradigm: 'Recovery'  }
    : { intensity: 70, paradigm: 'Offensive' };
}
```

**Offene Fragen:**
- Soll der User-eigene Coach das auch optional (Auto-Pilot-Mode) bekommen, oder bleibt das strikt AI-only?
- Wie wird „Contender" definiert — über `MarketSize` + `winPct` oder über bestehende GM-Attribute (`spending`, `work_ethic`)?
- B2B-Erkennung: einfache `schedule[tomorrowISO].games.includes(teamId)`-Abfrage, oder gibt es schon einen `isBackToBack`-Helper?

---

## Phase 3 — Defense & Individual Matchup Game Planner

> **Wichtig: dies ist ein eigener Layer, nicht nur eine Erweiterung der System-Proficiency.**
> `TEAM_TRAINING_PLAN.md` sagt: Schedule/Training berührt **Team-System-Familiarity**, nicht K2-Ratings.
> Der Game Planner hier ist orthogonal dazu — er greift in die **Sim selbst** ein über Coverage-/Matchup-Modifier, und bleibt pro Spiel gesetzt (nicht persistent über die Saison wie System-Proficiency).
>
> Inspiration: Football Manager Tactics + 2K MyTeam Coach-Settings + BBGM-Sim-Tiefe. „Mehr als Minutes-Override."

**Andock-Punkte (Sim-seitig):**
- `src/store/logic/turn/simulationHandler.ts` — Sim-Entry, der den GamePlan beim Spielen liest.
- `calculateTeamStrengthWithMinutes` (über `gameplan minuteOverrides`) — bestehender Hook, an den sich Coverage-Modifikatoren hängen lassen.
- `minutesPlayedService` — schon minute-weighted pro Team-Modus / Record. Coverage-Layer kommt **drüber**, nicht statt.
- Box-Score-Konsumenten (`BoxScoreModal.tsx`, `DayView.tsx` Game-Tiles) müssen die geänderten Stat-Verteilungen nicht selbst kennen — Sim liefert die finalen Zahlen.

**Andock-Punkte (UI-seitig):**
- Game-Tile im `DayView.tsx` → neuer „Game Plan"-Button neben „Play"/„Sim".
- Neues Modal `GamePlanModal.tsx` (parallel zu `DailyPlanModal.tsx` aufgebaut — Header/Sections/Footer-Pattern wiederverwenden).
- Eintrag im `RosterView` für „Defensive Assignments" pro Starter.

---

### 3.1 Defensiv-Schema-Matrix (Team-Level)

Pro Spiel setzbar — gilt als Default, kann pro Spieler oder pro Situation überschrieben werden.

```ts
interface DefensiveScheme {
  // Pick-and-Roll Ball-Handler-Coverage
  pnrBallHandler:
    | 'Drop'           // Big bleibt am Korb, lebt mit Mid-Range
    | 'Soft Hedge'     // Big zeigt sich kurz, recovert
    | 'Hard Hedge'     // Big trapt, Rotation hinten dran
    | 'Ice / Down'     // schiebt PnR zur Baseline, Big bleibt dahinter
    | 'Switch'         // alles getauscht 1-5
    | 'Blitz'          // sofort doppeln, 3rd-Man rotiert
    | 'Veer Switch';   // late switch, nur bei bestimmten Aktionen

  // Pick-and-Roll Roll-Man-Coverage
  pnrRollMan:
    | 'Tag'            // Wing-Help dropt kurz, recovert
    | 'X-Out'          // Schwerer Helper dreht raus auf Roll-Man
    | 'Nail Help'      // Help kommt aus der Mitte
    | 'No Help';       // Big-on-Big lockt, keine Rotation

  // Off-Ball-Screen-Coverage (für Shooter)
  offBallScreens:
    | 'Lock & Trail'   // hinterher kämpfen
    | 'Top Lock'       // über den Screen drücken, weg vom Ball
    | 'Chase / Top'    // verfolgen, oben rum
    | 'Switch'         // Tausch
    | 'Under';         // unter dem Screen, gibt 3PT

  // Iso-Coverage
  iso:
    | 'Force Baseline'
    | 'Force Middle'
    | 'No Middle'      // Mid-Block, alles auf die Linie
    | 'Force Weak Hand';

  // Doubling-Regeln
  doubleOnPost:        'Never' | 'Stars Only' | 'Always';
  doubleOnDrive:       'Never' | 'Help Only'  | 'Always';
  doubleOnIso:         'Never' | 'Stars Only' | 'Always';

  // Globale Defense-Identity
  pickup:              'Full Court' | '3/4 Court' | 'Half Court' | 'Pack Line';
  switching:           'Full' | '1–4 Switch' | 'Like-Sized Only' | 'None';
  zoneVsMan:           'Man'  | '2-3 Zone' | '3-2 Zone' | 'Match-Up Zone' | 'Box-and-1' | 'Triangle-and-2';

  // Foul-Strategie
  foulManagement:      'Aggressive' | 'Standard' | 'No Reach';
  takeFoulOnFastBreak: boolean;
}
```

**Defensive Templates (analog `PARADIGM_TEMPLATES`):**
- **„Drop & Recover"** — Drop / Tag / Lock & Trail / No Middle / kein Doubling. Klassisch konservativ. Lebt mit Mid-Range.
- **„Switch Everything"** — Switch / No Help / Switch / — / Like-Sized Only. Modern Small-Ball.
- **„Blitz the Stars"** — Blitz / X-Out / Top Lock / — / Always-on-Stars. Aggressives Ball-Pressure-Setup.
- **„Wall Up"** — Ice / Tag / Under / Force Middle / Pack Line / kein Switch. Anti-Drive, gibt 3PT.
- **„No Middle Death"** — Hard Hedge / Nail Help / Chase / No Middle / Always-on-Drive. Foul-Risiko hoch.

---

### 3.2 Individual Matchup Planner (Per-Player)

**Hauptfeature.** Pro Starter (und pro Bench-Rotation) explizite Defensive Assignments + Coverage-Modifier setzen — nicht nur „wer guarded wen", sondern **wie**.

```ts
interface IndividualMatchup {
  ourPlayerId: string;          // unser Defender
  opponentPlayerId: string;     // sein primärer Assignment

  // Body-Position
  bodyPressure: 'Tight (Body-Up)' | 'Standard' | 'Sag Off' | 'Bump-and-Recover';
  ballSidePosition: 'On-Ball' | 'Off-Ball Help' | 'Weak-Side Roamer';

  // Ball-Denial
  denyLevel: 'Full Deny' | 'Standard Deny' | 'Allow Catch';

  // Closeout-Verhalten (für Shooter)
  closeout: 'Hard / Run-By Risk' | 'Controlled (Short)' | 'Stunt & Recover';

  // Schema-Override (überschreibt Team-Default für diesen Defender)
  schemeOverride?: {
    pnrBallHandler?: DefensiveScheme['pnrBallHandler'];
    offBallScreens?: DefensiveScheme['offBallScreens'];
    doublingPolicy?: 'Never Double' | 'Always Double' | 'Inherit Team';
  };

  // Effort
  rebound: 'Crash' | 'Standard' | 'Stay Home for Transition';
  helpFromHere: 'Always Help' | 'Stunt Only' | 'Stay Attached';
}
```

**Beispiel — vs. Luka-Style Iso-Hub:**
```ts
{
  ourPlayerId: 'our_pg',
  opponentPlayerId: 'their_star',
  bodyPressure: 'Standard',
  ballSidePosition: 'On-Ball',
  denyLevel: 'Allow Catch',          // er bekommt den Ball eh
  closeout: 'Controlled (Short)',
  schemeOverride: {
    pnrBallHandler: 'Blitz',          // bei jedem Screen sofort doppeln
    doublingPolicy: 'Always Double'   // auch im Iso wenn er drauf geht
  },
  helpFromHere: 'Stay Attached'       // unsere Wings dürfen ihre Männer nicht verlassen
}
```

**Beispiel — vs. Steph-Style Off-Ball-Sniper:**
```ts
{
  ourPlayerId: 'our_sg',
  opponentPlayerId: 'their_shooter',
  bodyPressure: 'Tight (Body-Up)',
  ballSidePosition: 'Off-Ball Help',
  denyLevel: 'Full Deny',             // Catch verhindern
  closeout: 'Hard / Run-By Risk',
  schemeOverride: {
    offBallScreens: 'Top Lock',
    doublingPolicy: 'Never Double'    // nicht doppeln, sonst kickout
  },
  helpFromHere: 'Stunt Only'
}
```

---

### 3.3 Preferred Matchups (Hunt / Avoid)

Wer soll **wen** angreifen? Wer wird **versteckt**?

```ts
interface PreferredMatchup {
  ourPlayer: string;
  opponentPlayer: string;
  priority: 'hunt' | 'avoid' | 'neutral';
  context?: 'iso' | 'pnr_attack' | 'post_attack' | 'transition';
}
```

**Use-Cases:**
- `hunt` — bevorzugt diesen Defender im PnR/Iso. Sim-Effekt: erhöht usage-rate gegen diesen Gegner.
- `avoid` — verstecken (z. B. unser kleiner PG nicht auf ihrem Big). Sim-Effekt: bei Switch/Cross-Match wird gewechselt zurück.
- Multiple Hunt-Targets möglich → Priority-Queue.

---

### 3.4 Offensive Game-Plan (kürzer, aber nicht ignoriert)

Der Konvo-Fokus war Defense. Offensive bleibt schlanker:

```ts
interface OffensiveGamePlan {
  primaryScheme: 'Triangle' | 'P&R Heavy' | 'Dribble Drive' | 'High-Low' | 'Five-Out Spacing' | 'Princeton';
  pace:          'Push (Run-and-Gun)' | 'Standard' | 'Half-Court Slow';
  threePointVolume: 'Hunt 3s' | 'Standard' | 'Limit 3s';
  postUsage:     'Feed the Post' | 'Standard' | 'Skip Post';
  screenAssignments: { screener: string; ballHandler: string; priority: number }[];
}
```

---

### 3.5 Komplette `GamePlan`-Struktur

```ts
interface GamePlan {
  matchup: { home: TeamId; away: TeamId; gameDate: ISO };

  defense: {
    teamScheme: DefensiveScheme;             // 3.1 Default
    individualMatchups: IndividualMatchup[]; // 3.2 Per-Player
  };

  matchupPlanning: PreferredMatchup[];       // 3.3 Hunt/Avoid

  offense: OffensiveGamePlan;                // 3.4

  // Quality-of-Life
  template?: 'Drop & Recover' | 'Switch Everything' | 'Blitz Stars' | 'Wall Up' | 'No Middle Death' | 'Custom';
  notes?: string;                            // Coach-Memo, optional
}
```

---

### 3.6 Sim-Integration — welche Modifier wirken wie?

**Aktuell nicht vorhanden** — `simulationHandler.ts` muss um eine Coverage-Modifier-Layer erweitert werden. Designvorschlag:

| Setting                    | Sim-Effekt                                                                |
|----------------------------|---------------------------------------------------------------------------|
| `Drop` (PnR)               | +Mid-Range-Attempts Gegner, –Rim-Attempts, –Big-Foul-Rate                 |
| `Hard Hedge` / `Blitz`     | –Ball-Handler-Effizienz, +Roll-Man-Open-Shots, +TO-Rate                   |
| `Ice / Down`               | +Baseline-Drives, +Corner-3 vom Strong-Side-Helper                        |
| `Switch Everything`        | –PnR-Effizienz, +Mismatch-Hunt-Effizienz (gegen Switch-resistente Stars)  |
| `No Middle`                | +Foul-Rate Defense, –Rim-Attempts, +Sideline-TOs                          |
| `Pack Line`                | –Drives, +Open-3s                                                         |
| `Full Deny` (Off-Ball)     | –Catches für Target, +Backdoor-Cuts vom Target                            |
| `Crash` (Reb-Setting)      | +OREB / DREB, –Transition-Defense                                         |
| `Hunt`-Matchup             | +Usage gegen Target-Defender, +FT-Rate falls schwächer                    |
| `Always Double` on Star    | –Star-Scoring, +3PT-Attempts vom Rest des Teams (Kickout)                 |

**Counter-Mechanik:** der Plan soll **nicht** dominant sein. Wenn Gegner-Coach-IQ + passende Roster-Tools ihn auseinandernehmen können, muss der Sim das modellieren (z. B. Pack-Line gegen Elite-Shooting-Team → Gegner schießt sich heiß).

---

### 3.7 UX-Skizze GamePlanModal

- **Header**: Matchup („SAS @ DAL — May 12"), Vorschau-Strength beider Teams.
- **Tab 1 — Defense Scheme**: Template-Picker (5 Defaults), darunter die DefensiveScheme-Matrix als Dropdowns. Live „Was bedeutet das?"-Tooltip pro Setting (analog Phase 1d).
- **Tab 2 — Individual Matchups**: 5 Slots (unsere Starter) ↔ 5 Slots (ihre Starter). Drag-and-Drop für Assignment-Override, dann pro Pair die `IndividualMatchup`-Felder als kompakte Pill-Selectors.
- **Tab 3 — Hunt/Avoid**: Roster-Overlay, Hunt = grün, Avoid = rot. Click-to-Toggle.
- **Tab 4 — Offense (slim)**: 5 Dropdowns aus 3.4.
- **Footer**: „Apply to Series" (für Playoffs / B2B-Rematch), „Save as Template", „Reset to Default".

---

### 3.8 Rollout-Reihenfolge (wenn implementiert wird)

1. **Datenmodell + Persistenz** — `GamePlan` in `team.upcomingGamePlans[gameId]`, Default „inherit team scheme".
2. **Sim-Modifier-Layer** — neue Funktion `applyGamePlanModifiers(simState, plan)` in `simulationHandler.ts`. Erst Team-Scheme-Multiplier, dann Individual, dann Hunt/Avoid.
3. **GamePlanModal v1** — nur Tab 1 (Defense Scheme) mit den 5 Templates. Versand, testen, Box-Score-Diffs validieren.
4. **Individual Matchups** — Tab 2.
5. **Hunt/Avoid + Offense** — Tab 3+4.
6. **AI-Counter-Coach** — Gegner-AI baut eigenen `GamePlan` als Antwort. Schwierigkeit/IQ skaliert über Head-Coach-Attribute.

### 3.9 Nicht-Ziele Phase 3

- Keine Live-Adjustments während des Spiels (Halftime-Adjust kommt evtl. in Phase 3.5).
- Kein Possession-by-Possession Play-Calling. Plan ist Strategie, nicht Taktik pro Possession.
- Phase 3 setzt nur **welches Schema** das Team in einem Spiel laufen lässt. **Wie gut** sie es laufen → Phase 4 (Proficiency).

---

## Phase 4 — Defensive System Library + Proficiency-Bridge

> **Das ist der Bridge-Layer zwischen Phase 1 (Training) und Phase 3 (Game Plan).**
> Du wählst im Game Plan ein Schema (z. B. „Switch Everything" oder „2-3 Zone" oder „Full-Court Press") — aber die Sim-Wirkung ist nur so stark wie deine **Defensive System Familiarity** in genau diesem Schema. Cold-call ein Press-Defense in Game 1 ohne ein einziges Press-Drill im Training? Wirkungslos. Drei Wochen jeden Tag Press-Drills + dann im Spiel ausgepackt? Volles Multiplier-Potenzial.
>
> Aktuell trainiert der `System Practice`-Picker im DailyPlanModal **nur offensive Sets** (`systemDescriptions` in `src/utils/systemDescriptions.ts`). Phase 4 spiegelt das auf der Defensiv-Seite.

**Quelle:** `TEAM_TRAINING_PLAN.md` §„Future Updates — Defensive Systems & Team Chemistry" (Zeilen 39–57) hat den Plan bereits skizziert. Phase 4 hier macht ihn konkret, verbindet ihn mit dem Game Planner aus Phase 3 und legt die Sim-Mathematik fest.

### 4.1 Trainierbare Defensive Systems

Parallel zur offensiven `systemDescriptions` wird eine `defensiveSystemDescriptions`-Map angelegt. Vorgeschlagene Systeme (1:1 nutzbar als Schema-Auswahl im Game Planner):

**Base Coverage (Man):**
- **Man-to-Man** — jedes Team startet hier mit einer Mindest-Familiarity ≥ 30 (kostenlos, „kann jeder").
- **Switch Everything** — modern small-ball, alles 1–4 oder 1–5 getauscht.
- **Drop Coverage** — Big bleibt am Korb bei Pick-and-Rolls.
- **Hedge / Show** — Soft- und Hard-Hedge zusammen als ein trainierbares Setup.
- **Ice / Down** — PnRs zur Baseline drücken.
- **Blitz / Trap** — sofort doppeln am Ball-Screen.
- **Pack Line** — alles in der Mitte komprimieren, gibt 3PT.
- **No Middle** — Sideline-and-Baseline forcieren.

**Zone Defenses:**
- **2-3 Zone**
- **3-2 Zone**
- **1-3-1 Zone**
- **Match-Up Zone** — schwerer zu trainieren, höherer Skill-Floor.

**Junk Defenses (gegen einen Star):**
- **Box-and-One**
- **Triangle-and-Two**

**Presses:**
- **Full-Court Press** (1-2-1-1, Diamond, Run-and-Jump)
- **Half-Court Trap**
- **3/4-Court Pickup**

Jeder Eintrag bekommt — analog `systemDescriptions` — `desc`, `pos`, `neg`, `requirements` (welche Archetypen das Team braucht, damit das System überhaupt funktioniert; z. B. Press braucht aktive Guards mit Defensive-Pest-Anlagen, Box-and-One braucht einen Lockdown-Wing).

### 4.2 DailyPlanModal-Erweiterung

Der `System Practice`-Picker (`DailyPlanModal.tsx:396-435`) bekommt **zwei Tabs** oder einen **Toggle**:
- „Offensive Systems" (bestehend) — bis zu 5 Sets aus `systemDescriptions`.
- „Defensive Systems" (neu) — bis zu 5 Sets aus `defensiveSystemDescriptions`.

`Allocations.systemFocus` wird zu `Allocations.offensiveSystemFocus` + `Allocations.defensiveSystemFocus` (oder ein zusammengesetztes Objekt). Migration: alte saves mit `systemFocus`-Array → Default in `offensiveSystemFocus`, `defensiveSystemFocus = []`.

**Welcher Paradigm-Tag drillt was?**
- `Offensive` → höherer Beitrag auf offensiveSystemFocus, minimaler auf defensiveSystemFocus.
- `Defensive` → höherer Beitrag auf defensiveSystemFocus.
- `Balanced` → gleicher Anteil.
- `Biometrics` / `Recovery` → kein System-Drill (wie heute schon).

### 4.3 Proficiency-Datenmodell

```ts
interface TeamSystemProficiency {
  offensive: Record<OffensiveSystemName, number>;   // 0–100
  defensive: Record<DefensiveSystemName, number>;   // 0–100
}
```

In `team.systemProficiency` persistiert. Pro Trainingseinheit wird der Familiarity-Wert für jedes ausgewählte System inkrementiert — analog zur bestehenden Offensive-Familiarity-Tick-Logik (siehe `TEAM_TRAINING_PLAN.md` Phase 3 — „daily familiarity/fatigue ticks").

**Decay & Clean-Slate:**
- Tägliches Mini-Decay auf alle nicht-trainierten Systeme, damit Specialization belohnt wird (siehe `TEAM_TRAINING_PLAN.md` §"Future Updates" — *„Spreading across all 5 evenly produces a flatter aura than concentrating"*).
- Bei Trade / Coach-Fire fällt die System-Familiarity auf 0 zurück (`docs/training.md` §2-Regel gilt 1:1 für Defense).

### 4.4 Proficiency × Game Plan — Sim-Multiplier

**Das ist der Loop, den Phase 1 und Phase 3 erst zusammen sinnvoll macht:**

```ts
function applyDefensiveSchemeWithProficiency(
  baseSchemeEffect: SchemeModifier,   // aus Phase 3.6 Tabelle
  proficiency: number                  // 0–100, aus team.systemProficiency.defensive[scheme]
): SchemeModifier {
  const profFactor = 0.4 + (proficiency / 100) * 0.6;
  // Bei 0 Proficiency: 40 % Wirkung (das Schema „existiert", aber Spieler stolpern).
  // Bei 100 Proficiency: 100 % Wirkung.
  return scaleModifier(baseSchemeEffect, profFactor);
}
```

**Konkret:**
- „Blitz the Stars" mit Proficiency 90 → fast voller Defensive-Pressure-Effekt, hoher TO-Forcing-Bonus.
- „Blitz the Stars" mit Proficiency 5 (cold call) → nur 43 % Wirkung, Roll-Man steht bei jedem zweiten Possession frei → Gegner trifft Open-3s aus dem Kickout. Die Schema-Schwächen aus Phase 3.6 (Roll-Man-Open-Shots, Kickout-3PT) sind aktiv, aber die Stärken (Ball-Handler-Pressure) sind reduziert. → realistischer „falsche Defense ohne Training"-Bestrafungs-Loop.

**UI-Folge:**
- Im GamePlanModal Tab 1 (Defense Scheme): bei jedem Schema-Eintrag rechts ein Proficiency-Balken („Switch Everything — 67 %"). User sieht sofort, welches seiner Schemata einsatzbereit ist.
- Warning-Tooltip wenn Proficiency < 25 %: „Cold call — your team has barely practiced this. Expect mistakes."

### 4.5 Defensive Aura (aus dem bestehenden Plan)

`TEAM_TRAINING_PLAN.md` Phase 4 hat bereits ausgeliefert: „defensive aura, fatigue performance debuff". Die Defensive-Aura ist heute ein einzelner Multiplier auf Team-Defense-Strength.

**Phase-4-Erweiterung:** die Aura wird gesplittet in:
- **Base Defensive Aura** = max(`defensiveSystemFamiliarity`) — der höchste Wert über alle defensiven Systeme. Belohnt Specialization.
- **Scheme-spezifischer Multiplier** im Spiel (siehe 4.4 oben). Der gewählte Schema-Slot, nicht das Maximum, zählt.

So gibt's zwei Wege ein gutes Defense-Team zu bauen: ein Schema sehr tief drillen (hohe Aura + immer voller Schema-Effekt wenn man es benutzt), oder mehrere Schemata mittel (flachere Aura, aber Anti-Adjustment-Flexibilität gegen unterschiedliche Gegner-Typen in Playoff-Series).

### 4.6 Andock-Punkte

- **Datenmodell:** neue Datei `src/utils/defensiveSystemDescriptions.ts`, parallel zu `src/utils/systemDescriptions.ts`.
- **DailyPlanModal:** `src/TeamTraining/components/DailyPlanModal.tsx` — System-Practice-Sektion (Zeilen 396–435) bekommt Offense/Defense-Toggle.
- **Familiarity-Tick:** bestehende daily-tick-Logik aus `TEAM_TRAINING_PLAN.md` Phase 3 erweitern, dass sie auch defensive Systeme tickt.
- **Sim-Layer:** `src/store/logic/turn/simulationHandler.ts` — Phase-3-Multiplier-Layer liest `team.systemProficiency.defensive[gameplan.defenseScheme]` und skaliert wie in 4.4.
- **GamePlanModal (Phase 3):** Proficiency-Anzeige pro Schema-Option in Tab 1.

### 4.7 Rollout-Reihenfolge

1. `defensiveSystemDescriptions` Map anlegen (nur Daten, kein UI-Effekt).
2. `team.systemProficiency.defensive` ins Save-Schema (Migration: alle 0).
3. DailyPlanModal-Toggle Offense/Defense + Daily-Tick erweitern.
4. Decay + Clean-Slate-Regel.
5. Defensive Aura split in 4.5.
6. Game-Plan-Modal-Proficiency-Anzeige + Sim-Multiplier-Skalierung aus 4.4.

### 4.8 Nicht-Ziele Phase 4

- Keine offensive System-Library-Erweiterung (die ist schon da).
- Kein Auto-Picking durch AI-Coach für Defensive Systems — AI nutzt initial Default-Setup („Man-to-Man" + 1 zusätzlicher Trainings-Slot je nach Roster-Archetypen). Smart-Picking kommt mit Phase 2.
- Kein Übergreifen auf Individual-K2-Stats. System-Familiarity bleibt Team-Layer (Konsistenz mit `TEAM_TRAINING_PLAN.md` Guiding Principle).

---

## Notes & Wiederverwendbares

- **Bestehende Strukturen, an die sich die Roadmap hängt:**
  - `PARADIGM_TEMPLATES` (`DailyPlanModal.tsx:36-77`) — Pattern für Phase-3 Defensiv-Templates kopierbar.
  - `calculateTeamStrengthWithMinutes` — bereits minute-weighted, akzeptiert `gameplan minuteOverrides`. Coverage-Modifier-Layer setzt darauf auf.
  - `<Tooltip>` (`src/TeamTraining/components/ToolTip.tsx`) — fertig für Phase 1d.
  - `trainingScheduler` + `trainingTick` — für Phase 2 die einzigen Touchpoints.
- **Nicht-Ziele dieser Roadmap:**
  - Career Mode, Trade-Logik, Skill-Progression — eigene Tracks.
  - Individuelle K2-Stat-Buffs aus dem Game-Plan — bleibt beim `TEAM_TRAINING_PLAN.md`-Prinzip „Schedule = Team-System-Layer", Sim-Effekte bleiben auf Team-Ebene + Coverage-Multiplier.
  - User-vs-AI Asymmetrien — User behält volle Kontrolle, AI-Phasenlogik (Phase 2) gilt nur für nicht-User-Teams (Sentinel `userTeamId`-Check).

## Verification

- **Phase 1d**: Hover über die Info-Icons in DailyPlanModal zeigt nach 400 ms Tooltip-Inhalt; Touch (Mobile) zeigt 2 s an.
- **Phase 2**: AI-Teams produzieren in einem 7-Tage-Sim-Fenster einen Mix aus Recovery (Game-Days/B2B) und Balanced/Defensive (Mid-Week). Audit über `audit-economy.js` oder direkten `team.trainingCalendar`-Dump.
- **Phase 3**: Game-Plan-Modal speichert in den State, simulationHandler liest es vor jedem Spiel. End-to-End-Test: Plan setzen → Spiel simulieren → Box-Score zeigt veränderte Verteilung (z. B. mehr 3-PT-Attempts beim Gegner bei `doubleOnPost: 'Always'`).
