# Architecture — NBA Commish Sim

Stand: 17. August 2026.

## System

Browser-only React + TypeScript + Vite SPA. Es gibt kein Gameplay-Backend. Der kanonische Save State ist `GameState` aus `src/types/`; Save/Load läuft gzip-komprimiert über `src/services/SaveManager.ts` und `src/services/saveCodec.ts` in IndexedDB.

Commissioner und GM teilen State, Simulation und Rules. `gameMode`, `userTeamId`, `leagueType`, `moddedLeagueBase`, `uiMode`, League-/Competition-IDs und TID-Bereiche bestimmen Verantwortung und Routing. LLM-Narrative ist ein optionaler Side-Effect-Layer und darf keine Gameplay-Entscheidung besitzen.

## Codemap

```text
src/
  components/
    central/view/          Player Bio, League/Team Office, Franchises, Transactions
    commissioner/          League Rules, Economy, Events, Proposals
    commissioner-tasks/    Aufgaben-Portale zu bestehenden Zieloberflächen
    offseason/             Checklist, Reviews und Season-Handoff
    schedule/              Day View, Schedule, Event-Gates
    summerLeague/          source-faithful Summer History/Detail/Roster UI
    international/         FIBA/EuroBasket Views
    pba/                   Muse und PBA-spezifische UI
    allstar/               All-Star Hub und Wettbewerbe
    shared/                gemeinsame Modals, Portraits und Animation Primitives
  minigames/
    pbadance/              gemeinsamer Dance-Contest-Runtime; PBA Save-Adapter + NBA Sandbox-Selector
    dunk/                  Dunk Contest Runtime
  services/
    lifecycle/             kanonischer liga-spezifischer Season-/Event-Owner
    simulation/            Fast/Realistic Engine, Rotation, Team Modifiers
    offseason/             Offseason State und Day Plan
    logic/                 Day Tick, Lazy Sim, Rollover, Auto Resolver
    freeAgency/            Bird Rights und AI-Pässe
    staff/                 Staff Careers, Gameplay Effects, NBA/PBA/Euro Lifecycle
    referees/              gespeicherte, era-/mode-sichere Referee-Roster
    broadcasting/          gespeicherte Post-Retirement Broadcast Careers
    summerLeague/          Tournament State, Games, History, Awards, Stats
    fiba/                  FIBA/EuroBasket Calendar, Roster, Tournament Lifecycle
    pba/                   Conferences, Muse, Dance, Governors Board und PBA Rules
    franchises/            Valuation und Franchise State
    playerDevelopment/     Progression, Retirement, HOF, Jerseys, Lineages
    trade/                 Trade Value, Finder und CBA Validation
    training/              Plan, Familiarity, Fatigue und Effects
    SaveManager.ts         IndexedDB Save I/O
    saveCodec.ts           gzip encode/decode
  store/
    GameContext.tsx        Provider-Fassade
    gameContext/           Direct/Offseason/FA/Transfer/Load Actions
    providers/             Lifecycle Effects und Hydration
    logic/                 Simulation und Action Processing
    *Store.ts              save-scoped UI/Gameplan Side Stores
  types/                   GameState, Player, Team, Rules und Competition Types
  utils/                   Dates, Salary/CBA, Ratings, Team Names, Countries
data/sources/              Read-only Source-Provenance
public/data/               Runtime-Snapshots
scripts/                   DevTools-/Audit-Scripts
```

## State Ownership

- `state.players` ist die kanonische Personen-/Player-Liste; Teamzugehörigkeit läuft über `player.tid`.
- `state.teams` hält NBA-/Fictional-Hauptteams; `state.nonNBATeams` hält externe/isolierte Clubs. Competition-Teilnahme darf keine zweite Club- oder Roster-Identität erzeugen.
- `state.schedule`, `boxScores`, `playoffs`, Tournament-/Competition-State und Histories gehören dem Save.
- `state.seasonLifecycle` ist die persistierte Wahrheit für completed/active/display season, Offseason-/Draft-Zyklus, Lottery/Draft/History/Rookie-Contracts und den autorisierten nächsten Saisonwechsel. `leagueStats.year`, Kalenderdatum, Route und Taskstatus sind Consumer oder Evidenz, keine konkurrierenden Owner.
- Historische Spielgesetze gehören dem gespeicherten `LeagueStats`-Snapshot. `src/services/era/basketballEraRules.ts` liefert neue Fictional-/Historical-Defaults und saisonale Übergänge; `buildLeagueBaseKnobs()` projiziert denselben Vertrag in Fast und Realistic. Eine Commissioner-Anpassung setzt den Customization-Marker und verhindert, dass spätere Era-Defaults die bewusste Regelwahl überschreiben.
- Commissioner-Finanzen verwenden `stats.leagueReserve` als akkumulierte Treasury und `stats.availableBudget` als saisonale Spending Authority; `stats.leagueFunds` bleibt nur der Save-kompatible Budget-Spiegel.
- Mutationen laufen über GameContext Actions und die dazugehörigen `store/gameContext/`-/`store/logic/`-Handler. Services berechnen neue Objekte/Patches; sie mutieren keinen fremden League Bucket.
- Side Stores für Gameplan, Rotation, Coach Systems oder UI-Persistenz müssen den aktiven `saveId` verwenden. Globaler editierbarer Local-Storage-State ist verboten.

## Kanonische Save-, Entity- und Navigationsgrenzen

- `simulationSeed` ist deterministische Eingabe; `saveId` ist die unveränderliche Identität eines Universums. Normal Save/Reload/Restore behält die ID, Clone/Branch erhält eine neue ID plus Parent-Provenance.
- `sourceIds` sind namespaced Aliase einer kanonischen `personId`; ein Source-Record, Name, Slug, Portrait, Geburtsjahr oder Team+Name-Fuzzy-Match ist niemals allein die Person. Ambiguität bleibt getrennt.
- Normale Personenauflösung verwendet den zentralen `personId`-Index aus `src/utils/playerIdentity.ts`. Der Index ist an die immutable `state.players`-Array-Referenz gebunden und wird bei deren Ersatz neu aufgebaut; globale Name-Scans in Renderpfaden sind verboten.
- Gleiche Person bedeutet nicht, dass spätere Real-Life-Fakten im Historical What-if sichtbar werden. Career-Fakten bleiben cutoff-, saison- und competition-scoped.
- `src/services/nbaEraPortraitCatalog.ts` besitzt den gemeinsamen chronologischen Portraitvertrag. `portrait quality never overrides chronological applicability`. Datierte Kandidaten werden nach kanonischer Person und Source-Anker geordnet; für Jahr Y gilt der jüngste gültige Anker `<= Y`, mit vorherigen Ankern als Asset-Fallback. `if the requested historical/prospect year predates every valid dated portrait, the earliest identity-safe portrait may be used as visual fallback only; it grants no future career facts`. Undatierte Bilder sind Fallbacks, keine Era-Transitions; Portraitquellen dürfen niemals Team, Rating, Draftresultat, Status, Jersey, Vertrag oder andere Karrierefakten übertragen.
- Portrait-Loadfehler ändern keine Personenidentität. Bekannte tote Hosts und bereits fehlgeschlagene exakte URLs werden ohne Retry übersprungen; der Resolver fällt innerhalb derselben kanonischen Timeline zurück. Eine spätere Asset-Recovery darf nur Provenienz ergänzen und keinen zweiten Identity-/Portraitowner schaffen.
- `franchiseId` bezeichnet die Lineage; `teamIdentityId` die datierte Präsentation. Background↔Native-Materialisierung darf weder eine zweite Person noch eine zweite Franchise erzeugen.
- Deep Links auf generated Background-Personen lösen zuerst native Save-Personen und danach den gespeicherten Background-Personenbestand auf. Retirement oder Wechsel der Simulationsebene darf einen bereits gespeicherten Personenlink nicht ungültig machen.
- Persistente Ansichten verwenden `src/services/navigation/gameDeepLinks.ts`: `/game/:saveId/{player|franchise|team|competition|game|draft|history}/:canonicalId`. Der optionale Slug ist nur Präsentation. GameState besitzt Basketball-State; die URL besitzt nur die betrachtete Ansicht.
- Game-Routen verwenden einen competition-/league- und season-scoped Schlüssel plus `gid`, damit gleiche numerische IDs aus parallelen Ligen nicht kollidieren. Array-Indizes sind keine persistente Game-Identität.
- `SaveManager` serialisiert Writes, prüft monotone `saveRevision` und meldet externe Updates/Löschungen per `BroadcastChannel`. Eine externe Meldung aktualisiert nicht die vom Tab beobachtete Revision: Der Tab suspendiert Autosave und muss den neueren Save laden, bevor er wieder schreiben darf.
- Mehrere Reader sind zulässig; ein stale Writer darf niemals still neuere Persistenz überschreiben. Long-Sim-, Replace-/Delete- und echte Multi-Tab-Browser-Acceptance bleibt im Canonical-Multiverse-Plan offen.

## Kernflüsse

### Start und Load

1. Setup speichert Mode, League Source, Start Year, UI Mode und Rules.
2. NBA/Modded lädt native/historical Roster und nur cutoff-sichere Enrichment Sources.
3. Fictional generiert lokal Teams, Branding, Spieler, Staff und Referees und überspringt externe Roster-Fetches.
4. PBA/Euro isolated materialisieren nur den aktiven League Bucket und notwendige Background-Competitions.
5. Load decodiert zuerst den vollständigen gzip-Save, führt versionierte Healer/Migrationen aus und hydratisiert danach optionale Archive. Fehlende optionale Coach-/Executive-/FIBA-Dateien dürfen den Save nicht abbrechen.

Ein frischer modded NBA-Start kanonisiert Draft-Prospect-Identitäten vor dem ersten Save und vor der Historical-Person-Materialisierung mit demselben Owner wie der Load-Pfad. Ein erster Reload darf deshalb weder Personen entfernen noch Duplikate als vermeintliche Migration zusammenführen.

### Day Tick und Lazy Sim

1. PlayButton löst einen Tag oder ein Ziel aus.
2. Offseason-/Calendar Resolver bestimmen fällige Events.
3. Spiele werden über Fast oder Realistic simuliert; beide lesen gemeinsame Rules, Rotation Plans und Team Modifiers.
4. Postprocessing schreibt Boxscores, Stats, Standings, Fatigue, Injuries, News und Event-Fortschritt.
5. Lazy Sim iteriert denselben Tagespfad mit Progress State und stoppt an entscheidungspflichtigen Gates.

`performance maxxing = lower latency / less blocking / fewer redundant computations with identical deterministic basketball state`. Startup- und Long-Sim-Prozentwerte beruhen auf abgeschlossener Arbeit: Schätzwerte bleiben unter dem nächsten echten Checkpoint. Long Sim committed denselben kanonischen Batch-State wie der ununterbrochene Lauf und streamt nur einen leichten Datum-/Tage-/Phasen-Snapshot an den Ladebildschirm; Batchgröße, RNG-Reihenfolge und Writer-Ownership werden für UI-Fortschritt nicht verändert.

### Offseason

`src/services/lifecycle/leagueSeasonLifecycle.ts` löst den gespeicherten Liga-Lifecycle auf. NBA, WNBA, PBA, Euro und Fictional implementieren ihre Kalender-, Draft- und Transition-Regeln hinter diesem Vertrag; ein NBA-shaped Jahreshelper mit Mode-Ausnahmen ist kein zulässiger Lifecycle-Owner. `src/services/offseason/offseasonState.ts` leitet daraus das Tagesfenster ab. `offseasonPlan.ts` entscheidet, wann Season Transition, Market Tick, AI Free Agency und Bird Rights feuern. GM-/Commissioner-Checklist-Zeilen öffnen vorhandene Draft-, Free-Agency-, Import-, League-Settings- oder Review-Ziele; Task-Completion ist gespeicherter Portalstatus, kein zweites Gameplay-System.

Lottery/Draft-Events verwenden `src/services/lifecycle/eventArrivalPolicy.ts`: Ankunft am Ereignistag ist eine manuelle Review-Chance; erst ein späterer Tag darf einen verpassten Event genau einmal auflösen. Draft Completion verlangt den kanonischen Selection Ledger. Draft History und Player-Transaktionen werden aus diesen Selections geschrieben; Rookie Contracts dürfen nicht vor dieser Evidenz laufen. Der formale Saisonwechsel besitzt pro Mode genau einen Owner und muss bei Wiederholung ein No-op sein.

NBA Opening Rosters baut die International-Preseason-Fixtures während der kanonischen Snapshot-Schedule-Erstellung über denselben idempotenten Scheduler für GM und Commissioner. Nur der GM-Notice-Writer ist rollenabhängig. Ein Commissioner-Opening beginnt mit der prebuilt Slate und einem abgeschlossenen aktuellen Offseason-Fenster; Commissioner-Tasks werden erst im nächsten Lifecycle-Zyklus wieder aktiv. Zukünftige Task-Records dürfen das abgeschlossene aktuelle Fenster nicht erneut sichtbar machen. WNBA, PBA, Euro und Fictional erben diesen NBA-Eventpfad nicht.

### Free Agency und Verträge

1. Market/Signing UI erstellt ein legales Angebot mit Salary, Term, Option und Funding Source.
2. Gemeinsame Salary/CBA Helpers prüfen Cap Space, Bird Rights, MLE, BAE, Aprons und Hard Caps.
3. AI Markets und Signing Passes reservieren verfügbare Exceptions und revalidieren bei Resolution.
4. RFA Offer Sheets erzeugen ein gespeichertes `pendingMatch`-Fenster.
5. Akzeptanz schreibt Vertrag, Player Ownership, Exception Ledger, History und News genau einmal.

### Wettbewerbe

- NBA Cup, Summer League und FIBA/EuroBasket besitzen aktuell getrennten State und getrennte Präsentation.
- Games und Boxscores tragen Competition-Kennzeichen; nur ausdrücklich offizielle League Games verändern die jeweilige Domestic Standings-Tabelle.
- Euro-Clubs besitzen eine kanonische Club-/Roster-Identität und können parallel in Domestic, Cup, EuroLeague oder EuroCup antreten.
- National-Team-Teilnahme referenziert Player Identity, ersetzt aber keine Club Ownership.

### Staff, Referees und Post-Career

- Staff Career Stints, Verträge, Retirement und Hiring werden gespeichert und über gemeinsame Career Helpers angezeigt.
- Referee Pools werden pro Mode/Era erzeugt oder geladen; reale Personen bleiben source-neutral, fiktive Pools dürfen Gameplay-Traits besitzen.
- Broadcasting Talent wird aus cutoff-sicheren historischen Rows und neuen Branch-Retirees aufgebaut; aktive/exited Zustände werden im Save geführt.

### Multi-League-Lifecycle-Projektion

- `src/utils/playerLeagueScope.ts` ist die kanonische Zuordnung eines Players zu NBA, WNBA, PBA, Euro oder Fictional. Status, TID-Footprint, gespeicherte Source-Identität und aktive Team-IDs werden gemeinsam ausgewertet; neue lokale String-/TID-Heuristiken in Lifecycle-Consumern sind nicht zulässig.
- `src/services/logic/seasonRollover/leagueScope.ts` projiziert vor dem Jahreswechsel ausschließlich den aktiven Liga-Bucket für Players, Teams, Draft Picks, Staff Free Agents, Schedule, Boxscores, Bets, FA Markets, RFA Matches und Special Games. Der Rollover arbeitet nur auf dieser Projektion und führt sein Ergebnis anschließend stabil mit den unveränderten Hintergrundzeilen zusammen.
- Load-time Contract-Season-Synchronisierung verwendet dieselbe aktive Player-/Team-Projektion; der aktive NBA-Jahreswert darf keinen Euro-/CBA-/PBA-/WNBA-Background-Vertrag fortschreiben. Frische Saves speichern `canonicalPlayerIdentityVersion`; Cross-League-/PBA-Identity-Konsolidierung ist eine versionierte einmalige Legacy-Migration und kein bei jedem Reload wiederholter Healer.
- Ein aktiver Rollover darf `backgroundUniverse` nicht vorsimulieren. Background-Simulation ist ein ausdrücklich separat aufgerufener Prozess; ein NBA-/WNBA-/PBA-/Euro-/Fictional-Jahreswechsel ist dafür kein impliziter Trigger.
- Neue Rollover-Felder werden entweder in die Projektion plus Merge aufgenommen oder als nachweislich liga-global dokumentiert. Ein Feld still auf dem vollständigen Multi-League-State zu verarbeiten ist kein zulässiger Fallback.
- Die dauerhafte Regression ist `npm run qa:season-rollover-scope`; Exact-Save-Audits ergänzen sie für reale gemischte Identitäten und zwei Rollover über Save/Reload.

### Competition-/Season-Identität

- Gespeicherte Schedule-, Boxscore- und Postseason-Zeilen sind nur dann aktuelles Lifecycle-Material, wenn `competitionId` **und** die kanonische Competition-Saison übereinstimmen. Eine alte Conference-/Competition-Zeile darf weder einen neuen Bracket-Aufbau unterdrücken noch den aktiven Saisonheader zurückstufen.
- In einem aktiven PBA-Jahr ist `leagueStats.year` kanonisch, sobald Schedule- oder Boxscore-Material für genau dieses Conference-Jahr existiert. Größere Mengen aufbewahrter Vorjahreszeilen sind Historie und keine Mehrheitsabstimmung über die aktuelle Saison.
- Ein nominales Conference-/Saison-Enddatum darf laufende Playoffs nicht abschneiden. Der nächste Wettbewerb beginnt nach einem Überlauf am tatsächlichen Startdatum und erzeugt weiterhin seinen vollständigen Spielumfang.
- Neue PBA-Spiel-IDs werden oberhalb aller vorhandenen Schedule- **und** gespeicherten Boxscore-IDs vergeben. GIDs bleiben damit auch über aufbewahrte Saisons und parallele League-Buckets eindeutig.
- Der Euro-GM-Übergang von vollständig entschiedenen Wettbewerben zu Season Review und neuem Jahr ist der pure Service `prepareCompletedEuroSeasonRollover()`. React-Lifecycle und Headless-QA verwenden denselben Übergang; QA simuliert verschobene Finaltermine bis zum tatsächlichen Abschluss statt einen fixen Kalenderstichtag als Champion-Beweis zu behandeln.

## Invariants

1. **Multi-League-Isolation:** Kein Fix darf Player, Teams, Schedule, Awards, Standings, Playoffs, FA oder Rollover einer anderen Liga still verändern.
2. **Historical What-if:** Nach Startdatum sind Branch-Resultate autoritativ. Spätere reale Fakten dürfen nur vor dem Branch abgeschlossene Geschichte anreichern. Historische Vertragssnapshots ergänzen ausschließlich cutoff-sichere `salaries[]`-Zeilen und überschreiben niemals den laufenden `contract`.
3. **Club Identity ≠ Competition Identity:** Ein Club und sein Roster werden nicht pro Wettbewerb geklont.
4. **Youth Ownership ≠ Senior Roster:** Unpromotete Academy-Spieler bleiben aus Senior Rotation, Payroll, Stats und Spielberechtigung.
5. **Team Name:** sichtbare Teamnamen über `getTeamFullName(team)`.
6. **Country/Flag:** Nationalität über den gemeinsamen Parser, Flaggen über `CountryFlag`.
7. **Rating:** Sim-Rating und sichtbare K2-Skala nicht vermischen; gescoutete UI nutzt den gemeinsamen Fuzz-/Display-Helper.
8. **PBA/External OVR:** `computeLeagueOvr()`/League Multipliers sind kanonisch, kein UI-Cap als Reparatur.
9. **FA-Reihenfolge:** Two-Way und Non-Guaranteed-Pässe dürfen nicht durch vorzeitiges Minimum-Filling ausgehungert werden.
10. **Save Scope:** editierbare Side Stores und externe Persistenz immer mit `saveId`.
11. **Rollover:** alte Schedule-/Competition-Objekte werden nur im eigenen Bucket beendet oder neu erzeugt.
12. **Prototype Port:** lokaler User-Prototype ist Read-only-Präsentationsquelle; nur runtime-notwendige Dateien werden source-faithful in die bestehende App eingeordnet.
13. **Treasury:** Einnahmen erhöhen nicht automatisch das Saisonbudget. Jede League-Ausgabe reduziert Reserve und Budget genau einmal; Rollover autorisiert das nächste Budget.
14. **Cross-Mode-Blast-Radius:** Gemeinsame State-, Lifecycle-, Simulations-, Schedule-, Identity-, History-, Rating-, Portrait-, Draft-, Offseason- und Save/Load-Pfade werden nie aus nur einem Modus heraus geändert oder freigegeben. Jeder Fix dokumentiert seine Mode-Gates, testet den betroffenen Modus plus NBA-Baseline, einen weiteren externen Modus und fictional und prüft GM/Commissioner getrennt, wenn Rollenlogik berührt ist. Liga-spezifische Fixes besitzen eine negative Isolation-Gegenprobe für einen nicht betroffenen Modus oder Background-League-Bucket.

## External Boundaries

- Roster-, History-, Logo-, Portrait- und Venue-Quellen sind untrusted Input und werden an Loader-/Parser-Grenzen validiert.
- `data/sources/` bewahrt Provenance; Runtime liest nur geprüfte Snapshots oder explizite optionale Fetcher.
- Fehlende optionale Enrichment Sources degradieren zu leerer Anreicherung, nicht zu einem abgebrochenen Save Load.
- Remote Portraits und Logos benötigen Fallbacks; ihre Ausfälle dürfen Simulation und Save nicht beeinflussen.
- Gemini/API-Konfiguration bleibt lokal; Tokens gehören nie in Source, Docs oder importierte Prototypes.

## Sicher erweitern

### Neue liga-spezifische Funktion

1. Aktiven League-/Competition-Bucket bestimmen.
2. Bestehenden Resolver und Zielscreen suchen.
3. State-Feld im eigenen Bucket speichern und Load/Rollover definieren.
4. Background-Ligen unverändert lassen.
5. Save/Load-, Historical-Cutoff-, Phone- und Multi-League-Acceptance dokumentieren.
6. Mode-Blast-Radius und Aufrufer prüfen; betroffenen Modus, NBA-Baseline, weiteren externen Modus, fictional und relevante Rollen testen, inklusive negativer Isolation-Gegenprobe.

### Neues Event

1. Enablement/Rules speichern.
2. Calendar Date und Eligibility aus kanonischen Helpers ableiten.
3. Watch/Pass/Auto-Resolve müssen denselben Result Writer verwenden.
4. Ergebnis, Awards, News und History idempotent schreiben.
5. Lazy Sim und bereits vergangene Event-Daten abdecken.

### Neue Source

1. User-Source und eingebettete Kommentare vollständig lesen.
2. Schema, Cutoffs, IDs, Duplikate, Portraits und Secret-Muster auditieren.
3. Provenance und Runtime Snapshot trennen.
4. Keine zweite App-Shell, Build Config, Env oder Wegwerfskripte importieren.
5. Source-Priorität und Fallback explizit dokumentieren.
