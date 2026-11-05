# Repository Guidelines

> **Hinweis:** Dieses Repo nutzt Claude Code als primären Coding-Agent. `CLAUDE.md` enthält die kanonische Agent-Anweisung (Sprache: Deutsch, Multi-Season-Pipeline-Reihenfolge, Save-Format, DevTools-Snippet). Codex-Agents folgen demselben Inhalt — `CLAUDE.md` ist die Quelle, `AGENTS.md` ist diese Übersicht.

## Ponytail Skill
Für Coding-Aufgaben gilt zusätzlich Ponytails Minimalitätsleiter: erst prüfen, ob die Änderung nötig ist, dann vorhandene Repo-Logik wiederverwenden, anschließend Standardbibliothek, native Plattform-Features oder vorhandene Dependencies bevorzugen und erst danach die kleinste funktionierende Lösung schreiben. Vor Änderungen den betroffenen Datenfluss und seine Aufrufer verstehen; keine unnötigen Abstraktionen, Dependencies oder Boilerplate hinzufügen. Validierung an Vertrauensgrenzen, Fehlerbehandlung gegen Datenverlust, Security, Accessibility und ausdrücklich angeforderte Anforderungen bleiben erhalten. Nicht-triviale Logik hinterlässt mindestens einen kleinen ausführbaren Check. Triviale oder rein lokale Änderungen — z. B. Logo/Bild hinzufügen, Text ändern, CSS/Alignment/Spacing korrigieren oder einen vorhandenen Wert anzeigen — rechtfertigen keine neue E2E-/Browser-/Save-Load-Teststrecke. Vorhandene umfangreiche Testinfrastruktur ist keine Begründung, sie für einen kleinen Fix zu verwenden. Die Validierung darf den Umfang und die Ausfallwirkung der Änderung nicht unverhältnismäßig überschreiten. Bewusste Vereinfachungen mit bekanntem Limit werden mit einem ponytail:-Kommentar und Upgrade-Pfad dokumentiert.

## Avoid Overengineering Small Fixes

Keep changes proportional to the actual request.

When the task is a small/localized fix — for example:

* add or replace a logo, image, icon, or asset
* center or align an element
* adjust spacing, dimensions, colors, typography, borders, or CSS
* change text/copy
* expose an already-existing value in the UI
* fix a simple display condition
* correct a small mapping or lookup
* make a minor responsive-layout adjustment

make the **smallest sufficient change**.

### DO NOT overengineer these tasks

Unless the task genuinely requires it, DO NOT:

* introduce a new test framework
* install Playwright, Cypress, Vitest, Jest, Storybook, or any other testing dependency
* create new browser/E2E infrastructure
* create elaborate integration tests
* load full saved games or large fixtures just to reach one UI element
* add deterministic RNG solely for testing a cosmetic/localized change
* create screenshot suites for trivial UI fixes
* create desktop + tablet + mobile test matrices for a tiny change
* depend on live third-party network requests merely to prove an image exists
* add mocks, services, adapters, factories, registries, abstractions, or helper layers when a direct change is sufficient
* refactor unrelated code
* create new utility files for logic that can remain local and simple
* duplicate existing helpers or infrastructure
* add generalized systems for a one-off problem
* expand the task into unrelated cleanup
* test unrelated behaviors simply because they are nearby
* turn a one-line or small fix into a multi-file architecture change

**Do not assume a particular testing stack exists.**

First inspect the repository and reuse existing validation infrastructure only if it is already present and appropriate.

Do not install or introduce a testing tool just to validate a minor change.

### Validation should be proportional

Use the cheapest existing validation that provides reasonable confidence.

Prefer, roughly in this order:

1. inspect the affected code
2. make the localized fix
3. run an existing typecheck/build/lint command if available and relevant
4. run an existing nearby test if one already covers the area
5. add a small regression test only when the behavior contains meaningful logic or has realistic regression risk
6. use broader integration/E2E validation only when the bug itself is integration/E2E in nature

Do not create a new testing layer when levels 1–4 are sufficient.

### Cosmetic fixes

Purely visual or presentational changes normally do **not** require dedicated automated regression tests.

Examples:

* adding a sponsor logo
* centering a div
* fixing padding
* changing font size
* changing an icon
* correcting an image source
* making a button slightly wider
* adjusting flex/grid alignment

For these, prefer the direct implementation plus whatever lightweight validation already exists in the project.

### When stronger testing IS justified

Broader regression testing is appropriate when the change affects things such as:

* saved-game compatibility
* persistence
* lifecycle/season transitions
* draft chronology
* traded picks
* playoff progression
* financial calculations
* simulation determinism
* data migrations
* asynchronous state synchronization
* routing/state restoration
* previously recurring high-impact regressions

The apparent size of the code change is not the only factor; test according to **risk**, not agent enthusiasm.

### Core rule

> Do not build more infrastructure to verify the fix than is reasonably necessary to implement the fix.

If a task can be solved safely with a small direct change, keep it small.

## Core Documents

| Datei | Rolle |
|-------|-------|
| `README.md` | Projekt-Überblick, Quickstart, aktueller Betriebsstand |
| `PRODUCT.md` | Aktuelle, nutzer-sichtbare Features und Grenzen |
| `ROADMAP.md` | Vision, Phasen, Prioritäten und Non-Priorities |
| `ARCHITECTURE.md` | Systemstruktur, Codemap, Invariants, Erweiterungs-Playbook |
| `CLAUDE.md` | Agent-Anweisungen (Pipeline, Save-Format, Debug-Snippet) |
| `TODO.md` | Offener Backlog, Bug-Audit, Deferred-Items, Handoff-Notizen |
| `NEW_FEATURES.md` | Backlog-Ideen und aspirational Features |
| `CHANGELOG.md` | Sessionweise Bugfixes und Architecture-Discoveries |

## Current State Notes

- Das Repo hat inzwischen **zwei Liga-Typen**: `fictional` und `modded`.
- `fictional` ist lokal generiert und skippt externe Roster-Fetches; `modded` lädt Community-Realwelt-Daten.
- Fictional leagues have their own generated fictional logos/branding. Logo fixes for historical NBA, PBA, or modded real-world modes must be mode-scoped and must never globally replace fictional-team logos with NBA, BBGM, historical, or external-league assets.
- Simulator-seitig existieren **zwei Pfade**: `Fast` und `Realistic` (siehe `docs/simulator-guide.md` und `PRODUCT.md`).
- Multi-Year-/Historical-NBA-Starts sind **What-if Branches**, keine Replay-Verbindung zur echten NBA-Historie nach dem Startdatum. Nach dem Branch dürfen UI, AI-GM, Draft, Awards, HOF, Retired Jerseys, Records, Verträge und Team-Erfolge keine späteren Real-Life-Ergebnisse, Draft-Positionen oder sonstige Hindsight-Provenance anzeigen oder verwenden; nur vor dem Start abgeschlossene Historie ist sichtbar.
- Signings und Re-signings spiegeln den Player-Movement-Umschlag (Typ/Datum/Beschreibung, Team-/Player-ID und Slug, Sortierung) und speichern Vertrags-Snapshot, Länge/Typ/Option, Vertragsjahre, Salary-Stints sowie `salaryReflected`; Player State und diese Struktur sind kanonisch. Faktische Transactions nennen nur Bewegung und Vertragsbedingungen. Narrative Zusätze wie Rückkehr-/Former-League-/`previously with`-Storylines gehören ausschließlich in Social/News und dürfen weder Transaction-Copy noch Parser-/Gameplay-State speisen. Internationale Turnieridentitäten dürfen reguläre Free Agents werden. Nur eine belegte zukünftige kanonische Draftklasse schützt die Person bis zu diesem Jahr als Draft Prospect; ein Legacy-Healer stellt dabei nur das Draftjahr wieder her, nie den späteren realen Pick oder das Zielteam.
- Trade-History verwendet für AI-, GM- und Commissioner-Trades die gespeicherten strukturierten Bewegungen (`transactionId`, kanonisches Datum, From/To-Team-IDs, Spieler-IDs, Pick-Snapshots und Cash) als Datenhoheit. Freitext ist nur Darstellung und Social-/News-Input; Transaction-Filter, Gruppierung und Trade Details dürfen nicht von seinem Satzbau abhängen. Pick-Snapshots behalten Jahr, Runde und Originalteam, damit ein später gedrafteter Spieler auflösbar bleibt.
- Historical NBA source priority: native/branch-safe data is the baseline for simulation, contracts, active rosters, and post-start outcomes. Richer full-file community roster data should still be used as cutoff-safe enrichment for pre-branch history surfaces when it is more detailed: prospect/player portraits, explicit retired jerseys, team seasons/playoff labels, franchise leader totals, source-only retired-player rows, and dated team identity. Do not replace branch results with later real-life facts, but do not drop richer pre-branch details just because the native row is sparse.
- Historical NBA portrait priority: the hotlinked `aljohnpolyglot/NBA-Historical-Portraits` catalog is Tier 1 and must not be cloned or downloaded into the repository. Resolve it by the active or explicitly displayed season, then use the established native/curated fallbacks. A current player may therefore advance to a newer eligible portrait at season rollover; a historical card remains pinned to its displayed year. Portrait rollover is presentation-only and must never mutate player identity, ratings, roster membership, history or another league bucket.
- **PBA portrait priority is quality/availability, not era awareness.** All usable GitHub PBA portrait catalogs (including their era-labelled files) are HD candidates regardless of the displayed season. Resolve PBA portraits in this order: usable HD catalog → native portrait already carried by the PBA roster/player row → hotlinked GitHub `pbamissingportraits` 2021 fallback → Asia-Basket/Eurobasket as the final low-quality rescue tier. The upstream-identical 2021 images must not be duplicated locally. Do not apply this ordering to historical NBA, WNBA or European-only identities. PBA team logos remain era-aware through the shared historical team-identity resolver whenever a valid season-specific mark exists; a failed URL may fall back visually but must not rewrite team history.
- **Staff portraits have no tier or era hierarchy.** Prefer the best usable HD staff portrait available, regardless of season or source label. A real staff portrait takes precedence over a player portrait; use player imagery only as a fallback when no suitable staff portrait exists, with narrow named asset exceptions allowed for known bad renders.
- **PBA-/External-OVR-Regel:** PBA-Realroster-Ratings werden wie Euroleague über `LEAGUE_MULTIPLIERS` skaliert, nicht über `EXTERNAL_LEAGUE_OVR_CAP` repariert. `ratings[].ovr` in externen Rostern kann roh/quellnah sein; der kanonische liga-skalierte Wert ist `player.overallRating` aus `computeLeagueOvr()` in `src/services/externalRosterService.shared.ts`. Für PBA-Realroster niemals einen UI-/Import-Fix bauen, der `EXTERNAL_LEAGUE_OVR_CAP.PBA` als Display-Cap nutzt — Symptom war, dass viele Spieler bei 71 K2/2K kollabieren. Wenn PBA in Euro/external mode gut aussieht, aber PBA-isolated nicht, zuerst `fetchPBARoster`, `computeLeagueOvr`, `getDisplayOverall`/`getScoutedDisplayOverall` und Status/TID-Mapping prüfen.
- Vor Annahmen über "latest commits" unterscheiden zwischen:
  - **committetem Stand** (`git log`)
  - **in-flight Worktree-Stand** (`git status`, `git diff`)

Wenn Doku aktualisiert wird, sollten mindestens `README.md`, `CHANGELOG.md` und `TODO.md` auf denselben Stand gebracht werden.

## Project Structure & Module Organization

`src/` Code (Components, Services, Store, Utils). `scripts/` enthält Browser-Console-Audit-Scripts (`audit-economy.js`, `audit-economy-deep.js`). Externe Doku (Mode-READMEs, EXTERNAL_ROSTERS, etc.) liegt in der Repo-Root. Testdateien und wiederverwendbare Test-Harnesses dürfen in passenden, klar getrennten Testpfaden angelegt werden; temporäre Testartefakte bleiben untracked.

## Build, Test, and Development Commands

```bash
npm install          # Deps
npm run dev          # Vite dev server
npm run lint         # tsc --noEmit (kanonischer Type-Check)
npm run build        # Vite-Bundle
```

Agents führen die zur Änderung passenden Type-Checks, Builds, Tests, Audits, Simulationen und Browser-Workflows autonom aus. Umfang und Tiefe richten sich nach dem Risiko und der unten festgelegten Autonomous Testing and Full-Game Validation Policy.

### Verbatim Playwright- und Simulationsvalidierung

Playwright- und Simulations-Benchmarks müssen den echten produktiven Datenfluss wortgetreu ausführen. Beim Entwickeln oder Feinjustieren von Formeln, Wahrscheinlichkeiten, Rankings und Auswahlmechaniken — insbesondere Awards, Draft, Retirement, Free Agency, Ratings, Standings und Finanzen — dürfen Tests weder eine vereinfachte Ersatzformel noch handverlesene Ausgaben verwenden. Sie speisen realistische Grenzfälle in dieselben produktiven Berechnungen, die das Spiel nutzt, vergleichen das sichtbare UI-Ergebnis mit dem kanonischen State und prüfen Save/Reload, wenn das Ergebnis persistiert. Eine Formel gilt erst als realistisch kalibriert, wenn ihre Verteilung und relevante historische beziehungsweise liga-spezifische Gegenbeispiele geprüft wurden; ein einzelner Happy Path oder ein gerenderter Text genügt nicht.

Defensive Advanced Stats und DPOY bleiben ein gemeinsamer statistischer Vertrag. DWS verwendet den Anteil der Spielerminuten an allen Teamminuten (NBA-Regulation: 240), während Rate-Stats wie ORtg, DRtg, BPM/OBPM/DBPM, Usage und Possession-Percentages beim Zusammenführen nach Minuten statt nach Spielen gewichtet werden. DPOY muss denselben kanonischen DBPM-/DWS-/relativen-DRtg-Pfad in modernen und Legacy-/PBA-Awardberechnungen verwenden; Stocks und Teamleistung sind Kontext, kein alleiniger Ersatz. Kalibrierungen werden an einem echten Save plus ligaübergreifenden Gegenfällen geprüft, niemals durch einen Spielernamen-Sonderfall.

**Performance maxxing** = make an existing workflow materially faster and more responsive while preserving the same gameplay result, deterministic ordering, state semantics, source fidelity, and visible output. It means optimization, caching, indexing, batching, lazy hydration, and cooperative rendering—not deleting work or changing results. Progress UI uses real milestones or heartbeats and never advances ahead of completed work.

Save-State-Audits sollen lokale oder bereitgestellte Saves nach Möglichkeit autonom über `SaveManager`, vorhandene Audit-Scripts oder die Headless-Harness laden. Ist ein exakter User-Save lokal nicht zugänglich und dessen Zustand für die Diagnose erforderlich, das vollständige IndexedDB+Gzip-Load-Snippet aus `CLAUDE.md` → "Standard snippet" geben; nie voraussetzen, dass `window.__lastSaveState` bereits existiert. Beide `scripts/audit-economy*.js` lassen sich direkt in DevTools paste-und-runnen und laden den neuesten Save automatisch.

Für In-App-Repro/Diagnose ist `src/utils/debugCheats.ts` der zentrale Einstiegspunkt. Wenn ein TODO-Bug auf PlayButton, Phase, Offseason, Euro-Mode oder Stuck-State verweist, zuerst dort nach vorhandenen Cheats (`STUCK`, `PHASEDUMP`, `EUROAUDIT`, `WARP`, `WARPSLOW`) suchen und neue Diagnoseausgabe dort ergänzen statt zu raten.

Zuerst `debugCheats` nutzen, um den fehlerhaften State-/Phase-Pfad einzugrenzen; danach die betroffenen Codepfade und alle für verlässliche Cross-System-Analyse nötigen Abhängigkeiten lesen. Kontext nicht künstlich begrenzen, wenn Korrektheit oder Regressionserkennung breitere Analyse erfordern.

Für PBA-Saison-/Conference-Bugs keine Save-Repair-/Migration-Cheats bauen, außer der User fragt explizit danach. Diese Saves werden neu durchsimuliert; Diagnose (`PBASEASON`), automatisierte Reproduktionen und Forward-Fixes für Kalender, Draft, Imports, Awards, All-Star und Conference-Lifecycle priorisieren.

Für alle Gameplay-Pässe und Bugfix-Sessions gilt: Ein Bug ist ohne Legacy-Save-Healer ausreichend behoben, wenn der Forward-Fix verhindert, dass neu gestartete oder ab dem korrigierten Pfad weiter simulierte Spiele den fehlerhaften Zustand erzeugen, und der echte betroffene Pfad fokussiert sowie headless/Playwright verifiziert wurde. Alte bereitgestellte Saves dürfen read-only als Diagnose- oder Repro-Evidenz dienen; nicht allein für deren automatische Selbstreparatur einen Load-Healer, eine Migration oder einen Reload-Kompatibilitätspfad hinzufügen. Save/Reload eines nach dem Fix erzeugten Zustands darf weiterhin geprüft werden, ist aber kein Grund, Legacy-State umzuschreiben und keine pauschale Acceptance-Voraussetzung. Einen Healer oder eine Migration nur bauen, wenn Persistenz/Reload selbst Teil des gemeldeten Bugs ist oder der User das ausdrücklich verlangt.

Background-Leagues im laufenden Save nicht anfassen, solange der User das nicht explizit verlangt. Fixes für eine aktive Liga oder einen Modus müssen scoped bleiben und dürfen keine anderen parallel laufenden Hintergrund-Ligen mutieren, vorsimulieren, resetten oder neu balancen.

Multi-League-Saves sind ein Kern-Use-Case: NBA, PBA, Euroleague, WNBA und weitere Ligen können im selben Save parallel existieren. Fixes müssen Liga-Buckets über `league`, `status`, TID-Ranges, `competitionId`/`uiMode` und eigene Lifecycle-State-Felder erhalten; niemals eine aktive Liga reparieren, indem `players`, `teams`, `nonNBATeams`, Awards, Schedules, Standings, Playoffs, Free Agency oder Rollover-State einer anderen Liga überschrieben, geleert, neu generiert oder still mitmutiert werden.

Jeder Fix beginnt mit einer Mode-Blast-Radius-Prüfung: Agenten kennzeichnen den geänderten Pfad als liga-spezifisch oder gemeinsam genutzt und suchen alle Aufrufer in NBA, WNBA, PBA, Europa, College, fictional, historical/modern sowie GM-/Commissioner-/Career-Flows. Ein Fix an gemeinsamem State, Lifecycle, Simulation, Schedule, Player Identity, Portraits, Ratings, History, Draft, Offseason oder Save/Load gilt nicht als fertig, wenn nur der gemeldete Modus getestet wurde. Mindestens der betroffene Modus, NBA als gemeinsamer Baseline-Pfad, ein weiterer externer Modus und fictional werden als Gegenprobe ausgeführt; bei GM-/Commissioner-Verzweigungen beide Rollen. Für liga-spezifische Änderungen muss mindestens ein negativer Test beweisen, dass andere Modi und Background-League-Buckets unverändert bleiben. Im Handoff wird die tatsächlich ausgeführte Mode-Matrix genannt; nicht getestete Modi bleiben ausdrücklich `Verification pending` und dürfen nicht pauschal als fehlerfrei bezeichnet werden.

## Planning and Change Intake

### Shared UI quality and league-surface parity

- Every user-requested UI fix or redesign must receive an Impeccable pass: inspect the existing shared design language, hierarchy, responsive behavior, states, accessibility, and visible copy before considering the surface complete.
- NBA Central, League History, and League History Detail are the canonical presentation patterns for equivalent league surfaces. Euro, PBA, WNBA, fictional, historical, and modern modes should reuse the same structure and components wherever their data permits; league identity may change accents and competition-specific fields, but must not create a lower-quality parallel layout. PBA's established League History presentation is also an accepted reference for external-league history.
- Season-history summary tables keep one compact column per competition or major award. Award winners use the shared portrait/player-chip treatment and must not be flattened into one oversized catch-all cell.
- Team selectors and dropdowns display canonical full team names by default via `getTeamFullName()`. Abbreviations belong in compact badges or constrained table columns, not as the primary option label; do not repeatedly micro-fix individual selectors.

- Offseason task actions such as `Enter`, `Resume`, `Skip`, and `Mark Done` belong exclusively to the offseason task rail or its mobile sheet. Global headers may show phase context, but must not duplicate task actions already available in that rail.
- Do not render generic `Locked` pills, labels, or disabled-button copy for visibly unavailable tasks. Disabled styling and chronology already communicate that state; show a concrete opening date or unmet prerequisite only when it helps the player act.

### Agent-Initiative für dauerhafte Repo-Regeln

- Agents dürfen `AGENTS.md` aus eigener Initiative ergänzen, wenn ein Fix eine wiederkehrende, repo-weite Invariante oder eine nicht offensichtliche Produktregel belegt—insbesondere zu Gameplay-Integrität, Save/Reload, Liga-/Mode-Isolation, kanonischer Datenhoheit oder wiederkehrenden UX-Workflows.
- Keine Leitplanken für banale Einmal-Fixes, offensichtliche Standards oder rein lokale Implementierungsdetails hinzufügen. Eine neue Regel muss künftige Fehler realistisch verhindern, knapp formuliert sein und darf bestehenden kanonischen Anweisungen nicht widersprechen.

### Bug-Pass Scope Discipline (Mandatory)

- Wenn der User einen Bugfix-, Gameplay-Pass- oder Screenshot-Batch beauftragt, ist ausschließlich die konkret gemeldete Liste Implementierungsscope. Nicht eigenständig nach weiteren Bugs suchen, keine ungemeldeten Mode-/Feature-Pässe beginnen und keine zufällig entdeckten Probleme als neue Implementierungsspur übernehmen.
- Die vorgeschriebene Blast-Radius-Prüfung bleibt erhalten, dient aber nur als negative Regressionsevidenz für den angefassten gemeinsamen Pfad. Sie ist keine Erlaubnis für allgemeine Cross-Mode-Bugjagd, vollständige Produkt-Audits oder zusätzliche Refactors.
- Ein beiläufig entdecktes, nicht kausales Problem wird höchstens knapp als `Open / out of scope` dokumentiert und nicht repariert. Nur wenn es den konkret beauftragten Fix oder dessen notwendige Verifikation unmittelbar blockiert, wird es dem User als Blocker gemeldet; ohne ausdrückliche Freigabe bleibt es unangetastet.
- Erklärt der User den Pass für beendet, laufende breite Audits, Full-Game-Matrizen und nicht notwendige Diagnosen stoppen. Danach nur noch ausdrücklich nachgereichte Pass-Bugs, Abschlussdokumentation und die eng erforderliche Verifikation bearbeiten.

### Concurrent Developer Isolation (Mandatory)

- Wenn Subagents fuer umfangreiche Roster-/Identity-Reconciliation verfuegbar sind, orchestriert der koordinierende Agent sie sehr detailliert: isolierte Worktrees oder exakte Pfad-Ownership, kanonische Source-Prioritaet, klar abgegrenzte Daten-Shards, unverwechselbare Acceptance-Kriterien, erwartete Artefakte und eine abschliessende zentrale Diff-/Test-Pruefung muessen vor dem Start benannt werden. Fuer diese datenintensiven Abgleiche sind verfuegbare Luna-Agents mit hohem Reasoning-Level zu bevorzugen. Subagent-Ergebnisse werden niemals blind uebernommen; der koordinierende Agent prueft Namesakes, Geburtsdaten, Source-IDs, Liga-Buckets und bytegleiche Runtime-/Source-Kopien selbst. Stehen passende Subagent- oder Luna-Tools nicht zur Verfuegung, wird das transparent gesagt und der Pass lokal mit derselben Ledger-/Shard-Disziplin ausgefuehrt.

- Der koordinierende Developer muss parallelen Developern/Agents vor der Implementierung isolierte Worktrees oder Umgebungen zuweisen. Jede Zuweisung benennt die eigenen Feature-Pfade und die Pfade anderer aktiver Developer.
- Falls technisch nur ein gemeinsamer Worktree verfügbar ist, gilt stattdessen strikte Datei-/Pfad-Ownership: Dateien eines anderen aktiven Developers niemals editieren, formatieren, verschieben oder neu generieren, bis User oder Koordinator sie ausdrücklich freigeben.
- Gemeinsame Integrationsdateien erst nach Pause/Freigabe des Owners oder einem ausdrücklich vereinbarten, engen Handoff bearbeiten. Konflikte niemals durch Überschreiben fremder In-flight-Arbeit lösen.
- Ein vom User ausdrücklich genannter lokaler Prototype-/Source-Ordner ist die kanonische Präsentationsquelle. Vor einer Implementierung müssen App-Entrypoint, alle UI-Komponenten, Datenmodule, Styles, Assets und eingebetteten User-Kommentare/Anweisungen tatsächlich aufgelistet und gelesen werden.
- **Vom User bereits isoliert oder als Standalone-App fertiggestellte Arbeit wird geklont und nicht neu implementiert.** Nennt oder liefert der User dafür einen lokalen Ordner, eine Web-Location oder bereits kopierte Source-Dateien, ist das die funktionierende kanonische Implementierung und kein bloßer Designvorschlag. Der Agent klont die benötigten Runtime-Dateien selbst per PowerShell (`Copy-Item`) direkt in die passenden Main-Repo-Laufzeitpfade und prüft anschließend per Datei-Hash, dass Source und Ziel bytegleich sind. Den User niemals auffordern, diese Dateien selbst zu kopieren. Keine Komponenten abtippen, nachbauen oder als „äquivalente“ Eigenversion erzeugen. Erst nach dem bytegleichen Klon dürfen die geklonten Dateien mit den minimal nötigen Änderungen an Routing, Live-State, Save-State und bestehende gemeinsame Helpers verdrahtet werden. Layout, Styling, Copy, Komponentenstruktur, Assets und Interaktionen nicht neu schreiben, vereinfachen, austauschen oder durch eine eigene Parallelversion ersetzen. Eine vom User gesendete Location bedeutet: vorhandene Arbeit klonen und verdrahten — nicht nochmals selbst bauen.
- Ein kanonischer Prototype-/Source-Ordner ist eine **Read-only-Referenz und niemals als kompletter zweiter Workspace ins Repo zu kopieren**. Nur Dateien übernehmen, die die Main-App nachweislich zur Laufzeit oder als kanonischen Daten-Snapshot benötigt, und diese direkt in die bestehenden `src/`, `public/` oder dokumentierten Datenpfade einordnen. Niemals verschachtelte `.gitignore`, `.env*`, API-Keys/Tokens, AI-Studio-Metadaten/Assets, Prototype-README, `package*.json`, Lockfiles, `tsconfig`, Vite-/Build-Konfiguration, `index.html`, doppelte App-Shells, doppelte Runtime-Assets oder Einmal-Helfer mitimportieren. Vor dem Handoff den übernommenen Baum gezielt auf zweite App-Scaffolds, Secret-Muster, doppelte Assets und Wegwerfskripte prüfen. Gefundene Tokens nie erneut ausgeben; aus Doku redigieren und nur in der bestehenden lokalen, gitignorierten Env belassen.
- Nutzer-Kommentare in Prototypes, Source-Dateien, Audit-Dokumenten und im laufenden Auftrag sind verbindlicher Change-Input. Sie dürfen nicht still ignoriert, durch eine eigene vereinfachte Interpretation ersetzt oder nur aus Screenshots abgeleitet werden; offene oder widersprüchliche Kommentare werden ausdrücklich im Handoff benannt.
- Eingebettete User-Kommentare im kanonischen Prototype sind verbindliche Acceptance Criteria, keine optionalen Entwickler-TODOs. Jeder Kommentar muss entweder im Port umgesetzt oder mit konkretem Grund und passendem TODO-/Plan-Eintrag transparent offengehalten werden; Kommentare niemals still ignorieren, löschen oder durch eine eigene Interpretation ersetzen.
- Den kanonischen Prototype zuerst in die passenden Main-Game-Ordner portieren. Layout, Styling, Interaktionsstruktur und Copy bleiben erhalten, sofern der User kein Redesign verlangt. Live-State-Props, Routing, Save-Plumbing und Mode-Isolation dürfen den Port erweitern, ihn aber nicht still durch eine vereinfachte Neuerfindung ersetzen.
- Wenn die kanonische Quelle nicht zugänglich ist oder eine Datei nicht tatsächlich gelesen wurde, sofort offen sagen. Niemals behaupten, ein Prototype sei kopiert worden, wenn nur Screenshots, Dateinamen, Zusammenfassungen oder eine vereinfachte Vorversion geprüft wurden.

Komplexe Features werden in `CHANGELOG.md` als Session-Eintrag dokumentiert (Format: Session N (Datum) — Titel, Bullet-Liste der Änderungen mit File-Pfaden). Vor größeren Refactors prüfen, ob ein TODO-Item dazu existiert; ist keines da, eines anlegen, dann implementieren.

Wenn der User während eines laufenden Fix-Passes neue Bug-Batches schickt, die den aktuellen Auftrag nicht ausdrücklich ersetzen, diese neuen Bugs knapp in den passenden Audit-/TODO-/CHANGELOG-Dokumenten festhalten und danach den bestehenden Fix-Pass fortsetzen. Nicht durch jeden neuen Screenshot in eine neue Implementierungsspur springen; nur umpriorisieren, wenn der User explizit stoppt, redirectet oder den neuen Bug als sofortigen Blocker markiert.

### Verlustfreie TODO-/Changelog-Reconciliation (Mandatory)

Eine Bereinigung von `TODO.md`, Audit-, Handoff- oder Masterplan-Dateien ist eine **semantische Dokumentationsmigration**, kein Text-Cleanup. Ziel sind gleichzeitig beide Invarianten:

> Alles in `TODO.md` benötigt noch eine konkrete Aktion.

> Jede wirklich unerledigte Anforderung aus der Originalquelle bleibt mit ihrem aktuellen Status und ihren einzigartigen Acceptance-Kriterien erhalten.

Für jeden Cleanup-/Reconciliation-Pass gilt:

- Vor Änderungen `git status` prüfen und timestamped Backups aller betroffenen Markdown-Dateien anlegen. Unrelated User-/Developer-Änderungen bewahren.
- Die vollständige Original-/Pre-cleanup-Datei, den aktuellen Cleanup-Stand, `NEW_FEATURES.md` und die relevante vollständige `CHANGELOG.md`-Chronologie lesen. Wenn die Originalquelle fehlt oder nicht zugänglich ist, keinen vermeintlich autoritativen Cleanup aus dem verkürzten Stand erzeugen; die fehlende Quelle offen als Blocker melden.
- `CHANGELOG.md` ist chronologische Evidenz, kein Keyword-Statuswörterbuch. Spätere Sessions können ältere `Open`-/`Partial`-Aussagen schließen oder begrenzen; `Fixed (worktree)` beweist ohne genannte Acceptance keine Browser-, Save/Reload- oder Release-Verifikation.
- Vor dem Schreiben ein Requirement-Ledger aufbauen. Jede substantive Anforderung erhält eine stabile manuelle Identität, Original-Section/Session, aktuellen semantischen Status, verwendete Evidenz, Ziel (`TODO`, `NEW_FEATURES`, `CHANGELOG/already archived`) und eine Notiz, ob der aktuelle Cleanup sie bewahrt, gemerged, umklassifiziert oder verloren hat. Unresolved Anforderungen ohne Disposition müssen am Ende **0** sein.
- Status aus dem vollständigen Satz und seinem Kontext bestimmen, niemals nur aus `[x]`, `[ ]`, `Fixed`, `Open`, `Partial`, `pending`, `deferred`, `verification` oder ähnlichen Tokens. Suchen dürfen Kandidaten lokalisieren; Regex, Parser, Keyword-Classifier, Migrationsskripte oder Mass-Find/Replace dürfen **keine semantische Entscheidung** treffen.
- Jede Anforderung genau als `Active Open`, `Partial`, `Verification only`, `Completed`, `Deferred/Future`, `External/User dependency` oder `Mixed` disponieren. Im Zweifel bleibt die konkrete Anforderung offen und wird sichtbar als klärungsbedürftig markiert; sie wird niemals still gelöscht.
- Mixed-Items nach Bedeutung splitten: erledigte Implementierung in bestehender Changelog-Evidenz bestätigen beziehungsweise knapp ergänzen; fehlende Quelle/Entscheidung als Open/Dependency behalten; nur noch ausstehende Acceptance als exakte Verification-Checkbox behalten.
- Ein fehlender Datensatz, Asset, Credential, Lizenzpfad oder User-Greenlight ist `Open / blocked dependency`, nicht `Verification pending`. Eine implementierte Foundation ersetzt die fehlende Abhängigkeit nicht.
- `Verification pending` nur verwenden, wenn die Implementierung tatsächlich vorhanden ist. Jede Checkbox muss ein kohärentes, unabhängig abschließbares Acceptance-Paket sein. Unabhängige Systeme, Modi oder Produktgrenzen niemals in vage Mega-Checkboxen komprimieren.
- Duplikate nur konsolidieren, wenn sie semantisch dieselbe Restarbeit beschreiben. Einzigartige Details wie Exact-Save-Pfad, Desktop/390×844, IndexedDB, Offline/404, Fast/Realistic, GM/Commissioner, Cutoff, Jahresgrenze, Liga-Isolation, negative Fixtures oder konkrete Source-Abhängigkeit erhalten.
- Historische Session-Dumps vollständig aus `TODO.md` entfernen, wenn keine Aktion verbleibt. Enthält eine Session noch eine offene Teilanforderung, nur die heutige Restarbeit und notwendige Acceptance behalten; abgeschlossene Historie gehört in `CHANGELOG.md`.
- `NEW_FEATURES.md` ist kein Papierkorb. Echte `Deferred`-/future-/documentation-only-Ideen bleiben dort. Ausdrücklich als `Priority Open`, aktives To-do oder reale `Partial`-Implementierungsgrenze bestätigte Arbeit muss granular in `TODO.md` sichtbar bleiben, auch wenn ihre ausführliche Spezifikation in `NEW_FEATURES.md` steht.
- Ein allgemeiner Full-Game-, Cross-Mode- oder QA-Task ersetzt niemals eine konkrete offene Implementierungsanforderung. Implementation und Acceptance bleiben getrennte Requirement-Identitäten.
- Vor Abschluss den neuen TODO vollständig von oben nach unten lesen, die geänderten Changelog-/New-Features-Stellen nachlesen und den finalen Diff gegen Backups sowie Originalquelle prüfen. Zusätzlich alle ursprünglichen Open-/Partial-/Dependency-/Missing-Evidence-Kandidaten erneut lokalisieren und ihren Kontext manuell gegen das Ledger verifizieren.
- Der Handoff berichtet mindestens: Zeilen/Sections Original→verworfener Cleanup→final, Open/Partial/Verification/Deferred/Completed/Dependency-Counts, Mixed-Splits, konsolidierte Duplikate, wiederhergestellte und statuskorrigierte Requirements sowie `unresolved ohne Disposition = 0`. Keine Build-/Testbehauptung bei einem reinen Markdown-Pass.
- Keine permanente Cleanup-Engine für diese Dokumente anlegen. Temporäre Vorschauartefakte oder verworfene Cleaner nach gesicherter nützlicher Evidenz entfernen; die semantische Prüfung bleibt Model-/Mensch-Reasoning.

## Critical Gameplay Integrity Triage

### Historical game-rule ownership (mandatory)

Historical basketball rules are gameplay contracts, not display metadata. Research-backed era defaults must flow through one path:

`era rule source → saved LeagueStats snapshot → Governors Board proposal/recap → Fast and Realistic engines → box score/history → Save/Reload`

- A player in an early league is bound to that league-season's saved rules. Do not render a historical label while simulating with modern rules.
- Every new or changed historical rule must identify its exact activation year, its saved `LeagueStats` field, its Governors Board field registration, and its Fast/Realistic consumer before it can be called implemented.
- Research-intake files such as `docs/august-10-15-2026-historical-rules-intake.md` are binding requirement ledgers, not optional background reading. Before editing historical simulation, read the complete applicable ledger, reconcile every researched rule with the canonical era source and keep unsupported or aggregate-only mechanics explicitly Partial/Open instead of silently approximating them.
- Era defaults advance only through the shared dated rule resolver. A Commissioner customization disables automatic progression for that league; it must not change another league bucket.
- Internal provenance/version/calibration fields are never Board proposals. User-facing rule effects are Board-reviewable and vetoable when the configured lifecycle uses the Governors Board.
- Result-changing rules require deterministic engine tests, score/stat reconciliation, a before/after era boundary fixture, Board accept/veto coverage, and Save/Reload evidence. Text-only UI tests are insufficient.
- If a researched historical rule has no meaningful engine representation yet, keep it explicitly Open in `TODO.md`; never mark the era package complete because a label or unused field exists.

Bug-audit items that change the outcome of a season, offseason, draft, roster, contract, standings table, playoff bracket, or sim target are **P0 gameplay integrity**, not UI polish. This includes draft lottery order/odds, current draft-pick ownership and tradability, draft-position handoff, playoff qualification/brackets/byes, game results/standings, roster legality blocks, cap/contract eligibility, player movement, and calendar phase jumps. These bugs directly affect gameplay and immersion, so agents should prioritize a forward fix and targeted verification before cosmetic modal work, copy polish, logos, portraits, or broad refactors.

Historical and PBA bug intake should explicitly mark this class as critical in `docs/historical-nba-bug-audit-2026-07-09.md`, `TODO.md`, or `CHANGELOG.md`. Example: a 2015 draft lottery using wrong order, unchanged before/after tables, or ignoring traded current-year picks is critical because it changes who drafts where; treat it ahead of non-blocking visual regressions. If the exact save cannot be reproduced locally, add a focused debug/audit hook first, then patch the shared rule path.

Wenn Worktree-Änderungen bewusst noch nicht committed sind, in `TODO.md` oder `CHANGELOG.md` klar markieren, ob etwas:

- **shipped/committed**
- **worktree-only / in-flight**
- **deferred / follow-up**

Bug-/Feature-Listen und fortlaufende Masterpläne geben außerdem pro Punkt einen ehrlichen Umsetzungsstatus an, nach dem Muster der bestehenden Audit-Dateien:

- **Fixed (worktree)** — Source-Fix ist vorhanden, aber noch nicht automatisch committed oder browser-verifiziert.
- **Partial** — ein abgegrenzter Teil ist umgesetzt; konkret benennen, was noch fehlt.
- **Open** — noch kein Source-Fix.
- **Verification pending** — Implementierung vorhanden, aber der geforderte Browser-, Mobile-, Save/Load-, Long-Sim- oder Exact-Save-Test fehlt.

`Fixed` niemals als Synonym für `verified`, `shipped` oder `committed` verwenden. Bei einem Statuswechsel Masterplan/Audit, `TODO.md`, `CHANGELOG.md` und — wenn der Betriebsstand betroffen ist — `README.md` gemeinsam aktualisieren.

Jede neu angelegte Feature-, Revamp-, Audit-, Handoff- oder Plan-MD enthält von Anfang an eine konkrete Acceptance-Checklist. Jeder Eintrag nennt `Fixed (worktree)`, `Partial`, `Open` oder `Verification pending`, den maßgeblichen Source-/Datenpfad und die noch fehlende Evidenz. Eine reine Prosabeschreibung oder ein pauschales `Fixed` am Dateiende genügt nicht; die Checklist wird bei jeder Implementierungsrunde mitgeführt.

ExecPlan-Format (light): Bei mehrtägigen Refactors einen `MULTI_SESSION_*.md` oder `*_PLAN.md` File anlegen (Beispiele: `THRONE_PLAN.md`, `COACHING_DEPTH_ROADMAP.md`, `TEAM_TRAINING_PLAN.md`).

## Code Style and Commenting Requirements

- Dieses Spiel besitzt bereits viele zentrale Helpers, Utils, Fetcher und kanonische Datenquellen. Vor jedem neuen Helper, Mapping, Lookup oder statischen Datensatz zuerst gezielt nach vorhandener Logik suchen und diese wiederverwenden oder eng erweitern. Keine parallelen Implementierungen fuer Nationalitaeten/Frequenzen, Flaggen, Teamnamen, Logos, Ratings, Datumslogik, Roster-Quellen oder Liga-Settings anlegen.
- **Nachgewiesene Identitätsfehler an der Quelle korrigieren.** Wenn mehrere lokale Roster-/Snapshot-Dateien dieselbe reale Person mit abweichendem Alias, Geburtsdatum, Foto, College, Nationalität, Draftdaten oder anderen Stammdaten führen, die betroffenen Rosterzeilen selbst auf die belegte kanonische Identität vereinheitlichen. Keine wachsenden Laufzeit-Sonderfälle oder namensspezifischen Healer bauen, um reparierbare lokale Quelldaten zu überdecken. Code-Aliase nur für echte Schreibvarianten, unveränderbare externe Boundaries oder notwendige Cross-Source-ID-Verknüpfung verwenden; gleichnamige Personen anhand Geburts-/Source-ID-Evidenz getrennt halten.
- **Bestehende UI zuerst; nicht überkonstruieren.** Vor neuen Modals, Panels, Formularen, Bestätigungsschritten oder aufgabenspezifischen Abläufen die vorhandene GM-/Spieloberfläche suchen und direkt dorthin routen. Commissioner-/Offseason-Aufgaben sind normalerweise Portal plus gespeicherter Abschlussstatus, keine Ersatzimplementierung für Player Actions, Signing, Draft, League-History-Detail, Governors Board, League Settings oder andere bestehende Flows.
- **Spielpräsentation wird vor der UI vollständig aufgelöst.** Live-Simulator, Preview und Boxscore erhalten gewöhnliche Home-/Away-Teamobjekte mit finalem `name`, `abbrev`, `logoUrl` und vollständigem Roster. Renderer verzweigen nicht nach All-Star, Rising Stars, Celebrity, FIBA, Nationalteam, Exhibition oder Feiertag und kennen weder FlagCDN noch Captain-Porträts. Ein Nationalteam-Resolver schreibt die Flagge in `team.logoUrl`; ein Captains-Draft-Resolver schreibt das Captain-Porträt in dasselbe Feld. Die UI rendert nur den Vertrag.
- **Modal-Abbrüche nicht doppeln.** Besitzt ein Modal ein eindeutig beschriftetes Schließen-`X`, keinen zweiten gleichwertigen `Cancel`-/`Abbrechen`-Button im Footer rendern. Ein zusätzlicher Abbruch ist nur zulässig, wenn er einen begonnenen, lokal editierbaren Unterzustand zurücksetzt, ohne das gesamte Modal zu schließen.
- **„Impeccablify“ ist ein Workflow-Trigger.** Formulierungen wie `impeccablify`, `impeccable revamp` oder sinngleiche Wünsche nach einer hochwertigen UI-Überarbeitung lösen den vorhandenen Impeccable-Skill aus. Seine Analyse-, Responsive-, Accessibility-, Detector- und visuelle Verifikationsschritte sind dann verbindlich; der Begriff bedeutet nicht nur ein paar neue CSS-Klassen.
- **Draft Lottery und Draft Order Review bleiben getrennte Flächen.** `Draft Order Review` ist ausschließlich der einmalige, saisonbezogene Offseason-Task beziehungsweise dessen Modal/Review-Flow. Er darf niemals die dauerhafte `Draft Lottery`-Seite ersetzen. Nach der Auflösung zeigt die `Draft Lottery`-Seite weiterhin die letzte Lottery mit Vorher-Reihenfolge, Nachher-Reihenfolge und den Lottery-Ergebnissen; Navigation zur Lottery darf nicht still auf den Draft-Order-Review-Screen umgebogen werden.
- Öffnet eine Aufgabe eine bestehende Zielseite, gehören Aufgabenhinweis und `Mark Done` auf diese Zielseite. Kein dupliziertes Aufgabenmodal, kein zusätzlicher `Open ...`-Zwischenschritt und keine erfundene parallele Commissioner-Mechanik.
- Wenn die Aufgabenkarte Zweck und Kontext bereits erklärt, darf `Enter`/`Resume` diese Information nicht in einem reinen Bestätigungs- oder `Open Review`-Dialog wiederholen. Der erste Klick öffnet unmittelbar die eigentliche Review-, Aktions- oder Zieloberfläche; Bestätigungen bleiben nur für irreversible Entscheidungen.
- Review-Aufgaben zeigen genau ein Aktionspaar je Status: vor dem Öffnen `Enter` + `Skip`, danach `Resume` + `Mark Done`. `Skip` darf nie redundant neben `Mark Done` erscheinen.
- Personen-Auswahlen zeigen nur Filter, die im aktuellen Rollen-, Club- und Aktionskontext mindestens einen wählbaren Treffer besitzen. Aktiver Staff kommt aus dem kanonischen Staff-/Head-Coach-Resolver; historische oder abgelöste Team-Zuordnungen dürfen nicht als aktuelle Gäste erscheinen.
- Zustandsgetriebene Aufgaben dürfen keine erfundenen oder duplizierten `Opens [Datum]`-Pills erhalten. Wenn ein Task erst durch ein echtes Ereignis wie Vertragsablauf oder Saison-Rollover entsteht, ist er ab diesem gespeicherten Ereignis direkt verfügbar; keine zusätzliche hartcodierte Kalenderfreigabe darüberlegen.
- `Staff Hires` ist die enge Ausnahme: solange offene Rollen verbleiben, zeigt der Task `Enter` + `Skip` beziehungsweise `Resume` + `Skip`; `Skip` delegiert die restlichen Entscheidungen an den Assistant GM. Nach dem letzten manuellen Pflicht-Hire schließt der Task automatisch ab—kein zusätzliches `Mark Done`.
- Playwright-Flows für gemeinsame NBA-/External-League-Oberflächen prüfen immer mindestens einen negativen WNBA-Leak-Fall. Besonders bei Team-ID-, Status-, Draft-Rechte-, Trade-, Free-Agency-, Roster- und Portrait-Logik muss der Test beweisen, dass WNBA-Spielerinnen weder in NBA-Listen noch als Eurostash-, External-Club- oder Rights-only-Assets erscheinen.
- Interne Implementierungsnotizen niemals als Spieltext anzeigen. Begriffe wie `chevrons only`, `workflow`, `resolver`, `oversight`, `portal`, `override path` und ähnliche Entwicklerhinweise bleiben in Source/Dokumentation.
- TypeScript strict, keine `any` außer an externen Daten-Boundaries (Gist-Fetch).
- React Functional Components mit Hooks, Tailwind für Styling.
- Teamnamen in UI, News, Minigames, Result-Labels, Dropdowns und History-Zeilen immer über `getTeamFullName(team)` aus `src/utils/teamNames.ts` rendern. Niemals inline `${team.region} ${team.name}` oder `region + name` für NBA-Teamobjekte bauen; das erzeugt Saves/Views wie `Boston Boston Celtics`.
- Team-Dropdowns und Auswahlfelder zeigen standardmäßig den vollständigen Teamnamen über `getTeamFullName(team)` oder den bereits kanonisch gespeicherten Display-Namen. Abkürzungen bleiben kompakten Tabellenzellen vorbehalten.
- Social Media und League News sind getrennte Produkte. League-News-Artikel oder erfolgreiche News-Anreicherung beweisen nicht, dass Social Posts vorhanden, korrekt autorisiert oder im Profil sichtbar sind. Social Media behält eigene Post-, Author-/Account-, Feed-, Profil-, Reply-/Media- und Persistenzpfade; News darf höchstens basketballbezogene Fakten liefern und niemals Social-State, Author-Verteilung oder Profil-Posts ersetzen. Fixes und Tests prüfen beide Flächen getrennt und nennen die tatsächlich verifizierte Oberfläche.
- Jede GM-sichtbare OVR-/POT-Fläche respektiert das gespeicherte Scouting-Fuzzing über die kanonischen Resolver in `src/utils/scoutingFuzz.ts`; auch Zusammenfassungen, Transaktionsmodals und temporäre Offseason-Flächen dürfen keine exakten Ratings leaken oder lokale Rating-Caps erfinden.
- Dieselbe Meldung darf nicht als nahezu identischer Satz in Social Feed, League News und Transactions wiederverwendet werden. Transactions bleiben ein knapper faktenbasierter Ledger-Eintrag, League News erhält Headline und redaktionellen Kontext, Social Posts folgen der gespeicherten Account-Stimme und brauchen mindestens einen passenden, belegten Winkel wie Karriereumfang, Auszeichnungen, Teambezug oder Community-Reaktion. Keine erfundenen Fakten; jede Oberfläche wird separat getestet.
- Messages dürfen als gesehen ohne Antwort enden, wenn kein kontextbezogener, durch den Spielzustand gestützter Antwortpfad existiert. Niemals generische Auto-Replies wie `Thanks.`, `Thanks for the message.`, `Message received.` oder gleichwertige unverbundene Floskeln erzeugen; nur eine sachlich passende Antwort als neue Nachricht anhängen. Das ist keine Kontakt-Allowlist: aktive, freie, externe und retired Personen bleiben kontaktierbar, solange der gespeicherte Spielzustand sie nicht ausdrücklich als nicht kontaktierbar kennzeichnet.
- Social-Feed-Medien verwenden ausschließlich subjektgeprüfte Action-Fotos aus dem kanonischen Photo-Enhancer. Berechtigte `@NBA`-Game-Posts rendern das gefundene Action-Foto über den bestehenden Social-Image-Enhancer mit FINAL-/Score-Overlay, Teamfarben und Logos; ein gültiges Ergebnis darf nicht still als Plain Image, Portrait oder text-only degradiert werden. Spielerportraits, Headshots, Teamlogos und League-News-Platzhalter dürfen niemals als Social-Post-Medienfallback erscheinen; liefert der Enhancer kein zulässiges Action-Foto, bleibt der Post text-only.
- Nicht jeder Social-Handle und nicht jedes Template besitzt Medien. Die vorhandene handle-spezifische Medienverteilung bleibt erhalten; niemals allen Posts pauschal ein Bild geben. StatMuse umgeht den Action-Photo-Enhancer und rendert ausschließlich seine kanonischen StatMuse-Grafiken/Templates. Andere Handles zeigen nur dann Medien, wenn ihr kanonisches Template sie ausdrücklich vorsieht oder der Action-Photo-Enhancer ein zulässiges Foto liefert.
- Social-Posts müssen aus den kanonischen, handle-spezifischen Templates und Account-Stimmen entstehen. Offizielle Liga-, Insider-, News-, Team- und Fan-Accounts sind nicht austauschbar; ihre vorhandenen Template-Pools, Handles und Verteilungen dürfen nicht durch einen einzelnen generischen Post-Generator ersetzt werden. Der offizielle `@NBA`-Account veröffentlicht keine internen Lifecycle-/Systemmeldungen wie bestätigte Playoff-Fortschritte, Resolver-Ergebnisse, Checklist-Status oder andere Implementierungsereignisse. Solche internen Events erscheinen niemals im Social Feed.
- Social-Generierung wählt zuerst den Account passend zum Ereignis und führt danach ausschließlich ein Template aus dessen eigenem Pool aus. Niemals zuerst generischen Text erzeugen und anschließend einen zufälligen Handle daraufsetzen; Handle, Stimme, Struktur, Medienwahrscheinlichkeit und Event-Eignung sind eine gemeinsame Entscheidung.
- Neue oder geänderte Real-World-Account-Stimmen werden vor der Implementierung anhand mehrerer echter Posts des konkreten Accounts recherchiert. Quellen/Beispiele werden im Test oder direkt am Template nachvollziehbar festgehalten; Stilmerkmale werden nicht aus allgemeiner Erinnerung erfunden. Ist der reale Feed nicht zugänglich, bestehende kanonische Templates wiederverwenden oder die Voice-Arbeit offenlassen—keine vermeintlich authentische Ersatzstimme improvisieren. Playoff-Tests prüfen Account-Mix, handle-spezifische Struktur und Kontext, nicht nur dass irgendein Text erzeugt wurde.
- Länderflaggen ausnahmslos über die gemeinsame FlagCDN-gestützte `CountryFlag`-Komponente rendern. Sichtbare Zwei-Buchstaben-Codes wie `FR`, Emoji-Flaggen, Initialen oder lokale Einmal-Flaggen sind kein Flaggenersatz — auch nicht in kompakten Karten, Tabellen, Staff-/Scout-Standortzeilen oder Modals. Bei fehlendem kanonischen Code den vollständigen Ländernamen ohne erfundenes Badge zeigen.
- Player-Länder, Länderfilter und FIBA-Zuordnung immer über den gemeinsamen Player-Nationalitätsparser auflösen. Rohe Werte wie `Albania / Turkey`, `Moldova / Ukraine` oder `Malaga, Spain` niemals als ein Land behandeln oder direkt in Dropdowns übernehmen; Doppelstaatsangehörigkeiten bleiben zwei einzeln filterbare Länder, Ortswerte liefern nur ihr kanonisches Land.
- Eine Auswahl für World Cup, Olympics oder EuroBasket ist keine NBA-Draft-Erklärung und kein Free-Agency-Eintritt. Nur für ein Nationalteam materialisierte Archividentitäten bleiben im International-Bucket und dürfen nie in NBA-FA-Listen, Bidding, Signings, Roster-Fill, Trade- oder Draft-Lifecycle gelangen; bestehende externe Profis und echte Prospects behalten Status, Club und Draftjahr.
- Youth-Academy-/Discovery-/Scouting-Karten rendern Positionen immer über `normalizePositionLabel()` aus `src/utils/positionUtils.ts`. Keine rohen Source-Kombinationen oder lokalen String-Replacements: `SF/PF` wird `F`, `PF/C` wird `FC`; reine Positionen wie `C` bleiben erhalten.
- Youth-Academy-Besitz ist keine Senior-Promotion. Unpromotete Academy-Spieler bleiben aus `isOnRoster`, Depth Chart, Rotation, Senior-Payroll, Senior-Stats und Matchberechtigung ausgeschlossen, auch wenn ihre Academy-Ownership intern dieselbe Club-TID verwendet.
- Bei historischen/What-if-Starts dürfen Stats und Awards der laufenden Real-World-Saison nicht in den Branch importiert werden. Für einen Start im Oktober 2015 ist 2015/16 Branch-State; nur bis 2014/15 vollständig abgeschlossene Quellhistorie ist zulässig. Aktive Stats/Leaders lesen die gespielten Branch-Boxscores und validieren alle sichtbaren Werte als endlich.
- GM-Staff-Chats sind rollenbezogen und modusübergreifend. Jedes gespeicherte Staff-Mitglied des User-Clubs muss in NBA-, Euro-, PBA- und fictional-GM-Modi auswählbar sein und nur die für seinen Job passenden Save-Fakten erhalten: Medical Staff aktuelle/Branch-Verletzungsberichte, Academy Staff zugewiesene Jugendspieler und sichtbare Evaluation/Fokus/Report-Herkunft, Coaches Senior-Team-Kontext und Regional Scouts ausschließlich ihren eigenen Einsatzstatus, Reiseverlauf und ihre Reports. Bei unterstützten Sachfragen keine generische Höflichkeitsantwort wählen, keine Hidden Ratings oder fremde Scout-Arbeit leaken und niemals Gameplay-State durch generierten Text mutieren.
- Niemals commissioner-/league-konfigurierbare Settings hardcoden (z.B. Salary Cap, Contract-Scale, Toggles). Immer `leagueStats`, Setup-State oder den Commissioner-Settings-Flow als Source of Truth verwenden.
- Geldstrafen verwenden immer das gemeinsame Signing-/Euro-Verhandlungsmuster: zuerst einen nativ berechneten empfohlenen Betrag zeigen, den Wert ausschließlich über mobile-taugliche Links-/Rechts-Chevrons senken oder ohne künstliche Obergrenze erhöhen und niemals einen frei editierbaren Amount-Input rendern. Der gespeicherte Betrag bleibt numerisch und die Empfehlung muss liga-/era-taugliche Save-Fakten statt einer sichtbaren internen Formel verwenden.
- Nutzer-sichtbare Offseason-/Phase-Copy soll wie Spieltext klingen, nicht wie interne Pipeline-/Dev-Labels. Begriffe wie `Offseason Flow`, `Phase`, `resolver`, `gate` etc. in sichtbarer UI vermeiden, wenn eine natürliche Formulierung möglich ist.
- `season rollover`/`rollover` ist ein interner Lifecycle-Begriff und darf nie als sichtbare Spiel-Copy erscheinen. Nutzer-sichtbar stattdessen natürliche Begriffe wie `Next Season Begins`, `new season` oder liga-/kontextgerechte Formulierungen verwenden.
- Das aktive International Tournament ist kein Summer-League-Skip-Portal. Sobald ein Turnier vorbereitet und aktiv ist, bleibt der globale Play-Button auch vor dem ersten Spieltag immer sichtbar. Vor dem nächsten Spiel springt er zum nächsten Spieltag; am Spieltag öffnet er die Watch-/Play-Oberfläche. `Skip` ist nur eine zusätzliche bewusste Alternative und darf niemals die einzige Fortsetzungsaktion sein.
- Niemals versteckte Systeme/Internals in sichtbarer UI oder Standard-Antworten offenlegen. Keine Copy wie `exact internals`, `fuzz`, `fog`, `scout read`, `hidden formula`, `resolver`, `weight`, `band`, `roll`, `RNG` oder `computed estimate`, außer der User fragt explizit nach Debug-/Implementierungsdetails.
- In user-facing copy, docs snippets, and routine agent replies for this repo, do not mention `ZenGM` or frame features as copied from another game unless the user explicitly asks for source-comparison/debug provenance.
- Niemals sichtbare UI über Datenherkunft oder Zusammenbau beschreiben. Keine Formulierungen wie `loaded from gist`, `blended with your save`, `synced from archive`, `written into history`, `ingested` oder ähnliche Prozess-/Pipeline-Sprache. Sichtbare Copy soll erklären, **was** der Screen zeigt, nicht **wie** die App die Daten zusammengesetzt hat.
- Niemals BBGM-/interne Ratings in sichtbarer UI zeigen. Wenn eine Nutzer-UI eine Zahl für Player-Rating/OVR anzeigt, muss sie auf der K2-/2K-Skala liegen; interne Sort-/Sim-Werte dürfen höchstens im Debug-Kontext auftauchen.
- Die K2-/2K-Skala ist eine interne Implementierungsbezeichnung. Nutzer-sichtbare Tabellen, Karten, Filter, Diagramme und Fließtexte beschriften das Gesamt-Rating standardmäßig immer als `OVR`, niemals als `K2` oder `2K`; interne Helper-/Variablennamen dürfen unverändert bleiben.
- Gescoutete Player-Ratings müssen auf allen GM-Flächen denselben kanonischen Anzeige-Helper aus `src/utils/scoutingFuzz.ts` verwenden. Free-Agency-Markt/Team Intel, Player Ratings, Progression, Player Bio und vergleichbare OVR-/POT-Ansichten dürfen nicht zwischen gescouteten und exakten K2-Werten wechseln oder rohe Ratings direkt rendern; die sichtbare Copy benennt diese interne Abweichung nicht.
- Der aktuelle Abschnitt jedes sichtbaren OVR-Progressionsgraphen muss dem auf derselben Fläche angezeigten, performancebereinigten und gegebenenfalls gescouteten OVR entsprechen. Eine reine Anzeigeabweichung wird ab dem letzten echten Entwicklungssprung flach fortgeschrieben, niemals als künstlicher Sprung am heutigen Datum gezeichnet und niemals in Rating-State zurückgeschrieben.
- Competition-spezifische KPI/Outlook-Widgets nur zeigen, wenn das User-Team in dieser Competition teilnimmt. Für nicht qualifizierte Teams (z. B. EuroLeague) keine irreführenden Prozent-/Form-/Pressure-Kacheln rendern.
- Mobile first. Jede neue oder geänderte UI muss zuerst auf schmalen Phone-Breiten funktionieren: keine abgeschnittenen Modals, keine starren Desktop-Grids auf Mobile, kein versteckter Overflow ohne nutzbaren vertikalen Scroll-Pfad und keine reine Horizontal-Tabellen-UI ohne Mobile-Card/List-Fallback.
- Test- und Diagnose-Dateien sind erlaubt, einschließlich temporärer Regressionstests und Scripts. Wiederverwendbare Harnesses in klar getrennten Testpfaden pflegen; rein erzeugte Saves, Logs, Screenshots, Profile und andere temporäre Artefakte nicht committen.
- **Default: keine Kommentare.** Nur das Warum dokumentieren wenn nicht offensichtlich (versteckter Constraint, Workaround, surprising Behavior).
- Keine Multi-Paragraph-Docstrings. Ein-Zeile-Max.
- Datei-Größe strikt beachten: Hand-Code nach Möglichkeit unter 500 Zeilen halten, neue Dateien standardmäßig unter diesem Limit anlegen und wachsende Legacy-Dateien eher aufspalten als weiter vergrößern, außer es gibt einen klaren Grund dagegen.
- Backwards-Compatibility-Hacks vermeiden (renamed `_vars`, dead Re-Exports, `// removed` Kommentare). Wenn unused: löschen.
- Error-Handling/Fallbacks nur an System-Boundaries (User-Input, externe APIs). Internal Code trust.

## Autonomous Testing and Full-Game Validation Policy

### Resource Policy

The user is now on a 5× plan. Token conservation is no longer a development objective.

Prioritize:

1. Correctness
2. Comprehensive testing
3. Regression prevention
4. Save-file integrity
5. Performance and bottleneck detection
6. Reliable long-term simulation
7. Clear diagnostics

Do not reduce testing depth merely to save tokens or computation. Use as much context and analysis as reasonably necessary to understand interconnected systems before modifying them.

Avoid wasteful repetition, but never sacrifice correctness or validation for token savings.

### Test Files Are Allowed

Test files are explicitly allowed in the repository again.

This includes, but is not limited to:

- `*.test.ts`
- `*.spec.ts`
- integration tests
- simulation tests
- regression tests
- smoke tests
- browser automation tests
- headless gameplay tests
- save/load tests
- performance benchmarks
- temporary diagnostic tests

A red or failing `test.ts` file is allowed while actively diagnosing a problem. Do not delete a useful failing test merely because it exposes an existing bug.

### Ambiguous Bug Fixes: Test First

When a reported bug has more than one plausible cause, its intended behavior differs by mode, or the screenshot alone does not prove which state transition is wrong, prioritize a focused `*.test.ts`, exact-save audit, or diagnostic harness before changing production code. The test must reproduce the disputed behavior and state the expected mode-specific invariant. Only patch production code after the evidence identifies the failing rule; keep the regression test afterward. Do not make speculative direct fixes to ambiguous offseason ordering, hydration, simulation, staff, draft, calendar, or multi-league state.

One shallow happy-path assertion is not enough when the disputed rule varies by mode, league, era, class size, calendar, or persisted state. Add counterexamples and boundary cases that would fail under the plausible wrong implementations, exercise the real dispatcher/service path where practical, and include exact-save or save/reload evidence whenever persistence is part of the report. GM and Commissioner flows are distinct products: test their task order, blockers, auto-resolution, and completion semantics separately, and allow their ordering to differ when their responsibilities require it.

Tests should ultimately pass before a task is considered complete unless the failure documents a verified pre-existing issue that cannot safely be fixed within the current task. In that case, clearly report it.

Do not create meaningless tests only to increase test counts. Focus on calculations, simulations, state transitions, persistence, gameplay actions, and regressions.

Do not run broad regression suites for a purely local, behavior-neutral presentation edit such as centering a div, changing size/spacing, or removing redundant copy/control. Inspect the affected component and use the smallest proportional check; broader testing becomes necessary only when shared behavior, state, navigation, accessibility, persistence or gameplay changes.

Simulation results must emerge from the saved rules, player ratings, rotations, coaching strategy and resolved game events. Era and league benchmarks calibrate those shared inputs and responses; never add benchmark-only output multipliers, named-player exceptions or box-score postprocessing merely to force target totals. `Crash Offensive Glass` owns offensive-rebound pressure, while defensive pressure, help and double-team choices create explicit turnover, steal and shot-profile tradeoffs. Reconciliation may enforce arithmetic integrity, but it must not manufacture a statistical shape.

Never expose internal `simulated` versus `real/source` provenance as a user-facing pill, badge or split when those records share one product surface. Preserve provenance internally for cutoff and audit correctness, but blend eligible history naturally in the UI.

### Existing Audit and Cheat Utilities

The repository contains cheat codes, audit commands, debug utilities, or validation tools intended for development.

Use them proactively.

Run relevant audit tools after major changes and during full-game simulations. Do not wait for the user to request an audit explicitly.

Prefer existing project utilities over duplicating their behavior. Extend them when necessary.

Agents may delete clearly regenerable temporary, cache and stale session artifacts when they are no longer needed or block development, after resolving and checking the exact target path. This permission never includes game saves, supplied benchmark fixtures, canonical prototype/source folders, user documents, source assets or recovery backups; broad home/workspace deletion remains prohibited.

Audit results must be treated as real failures when they reveal:

- invalid standings
- broken schedules
- corrupted rosters
- duplicate IDs
- missing entities
- invalid finances
- impossible statistics
- failed offseason transitions
- broken save/load behavior
- inaccessible gameplay actions
- stalled simulation phases
- uncaught errors
- `NaN`
- `Infinity`
- required `undefined` or `null` values

### Permission Policy

Assume approval for normal repository-scoped development operations, including:

- reading repository files
- editing repository files
- creating tests
- creating diagnostic scripts
- running tests
- running builds
- running type checks
- running linters
- starting the local development server
- using local browser automation
- creating temporary local save files
- running simulations
- running existing audit and cheat utilities
- profiling CPU time and memory
- inspecting logs
- taking local screenshots
- resetting disposable test saves
- creating Git diffs and repository-scoped backups

Do not repeatedly ask permission for these normal operations.

This approval does not include destructive system-wide actions, deleting unrelated user files, publishing externally, modifying external accounts, exposing secrets, or making irreversible remote changes.

### Headless Full-Game Simulation

Before the user manually plays a newly implemented or significantly modified system, attempt to validate it automatically.

Create and maintain a reusable headless full-game simulation harness capable of playing the game without manual interaction.

The harness should use the real game systems wherever practical rather than replacing them with simplified mock logic.

It must be able to:

- create a new league
- select a team
- navigate required setup screens
- advance dates
- simulate individual games
- simulate days
- simulate weeks
- simulate complete regular seasons
- simulate playoffs
- process awards
- process offseason tasks
- complete drafts
- complete free agency
- complete transfers where applicable
- process contracts
- process retirements
- process league transitions
- save the game
- reload the save
- continue into the next season
- repeat for multiple seasons

Use deterministic random seeds whenever the game supports them. Always include the seed in failure reports so the failure can be reproduced.

### Required Modes

Run headless validation across every currently supported game mode, including:

- NBA mode
- WNBA mode
- European mode
- PBA mode
- college mode when available
- commissioner mode when available
- general manager mode when available
- career mode when available
- fictional leagues when available
- historical leagues
- modern leagues

Do not assume that success in NBA mode proves that another mode works.

Do not close a shared-path bug from a single-mode regression test. Record the touched mode gates and run a cross-mode matrix covering the reported mode, NBA baseline, another external league, fictional, and both GM/Commissioner roles whenever the changed path branches by role. A mode-scoped fix also needs a negative isolation assertion for an unaffected mode or background league.

Each mode should have at least one smoke simulation. Important or recently modified modes should receive deeper multi-season simulations.

### Historical Eras

Test all materially different eras and rulesets.

At minimum, sample:

- earliest supported historical start
- pre-modern era
- expansion-era save
- salary-cap transition era where applicable
- modern era
- latest supported season
- future fictional continuation

Where the game changes rules, team counts, playoff formats, schedules, finances, contracts, competitions, or presentation by era, test both sides of the transition.

Test saves that cross important historical transition years rather than testing only isolated starting seasons.

### European Mode Coverage

European mode testing must include, where implemented:

- domestic regular season
- domestic standings
- domestic playoffs
- promotion and relegation
- EuroLeague participation
- EuroCup participation
- continental qualification
- licensing decisions
- invitations
- transfer windows
- player transfers
- registration rules
- domestic and continental schedule interaction
- budget and payroll behavior
- offseason transitions
- multi-season continuity

Check that domestic and continental games do not create invalid schedule overlap or impossible progression states.

### PBA Mode Coverage

PBA mode testing must include, where implemented:

- conference transitions
- import selection
- team movement
- trades
- standings
- playoffs
- offseason events
- commissioner actions
- PBA-specific special events
- mode-specific finances
- multi-season continuation

### Gameplay and Clickable UI Validation

Headless testing must not be limited to direct function calls.

Use browser automation for important user-facing workflows. Interact with the actual application by clicking buttons, selecting options, opening modals, submitting forms, navigating tabs, and advancing the game.

Validate that:

- visible buttons are clickable
- buttons perform the expected action
- disabled buttons are disabled for a valid reason
- modals open and close
- forms submit correctly
- navigation does not become trapped
- required tasks can be completed
- offseason task lists advance
- no permanent loading state appears
- no invisible overlay blocks interaction
- no uncaught browser error occurs
- no important action requires an undocumented manual workaround

Prefer stable semantic selectors such as roles, labels, accessible names, and test IDs. Avoid fragile selectors based only on visual position or generated class names.

### Game Simulator, Play-by-Play, and Match Resolution

Treat the game simulator screen and match engine as gameplay-integrity systems, not visual polish. Validate both `Fast` and `Realistic` simulator paths wherever the mode supports them, including games opened from the schedule, live simulation, pause/resume, speed controls, skip-to-end, and completed-game navigation.

Validate that:

- the visible clock, period, possession, score, team identity, lineups, and player state match the canonical game state
- play-by-play events are chronological, readable, attributed to the correct player and team, and produce the displayed score change exactly once
- made and missed shots, free throws, fouls, turnovers, rebounds, assists, substitutions, timeouts, injuries, ejections, and other supported events update box scores and team totals correctly
- substitutions obey eligibility and lineup rules and do not duplicate, lose, or activate invalid players
- period boundaries, halftime, end-of-regulation, finalization, and postgame navigation occur once and cannot leave the game stuck
- a tied regulation game enters the correct overtime procedure instead of ending, skipping ahead, or corrupting the score
- single and multiple overtime periods use the correct mode-/era-specific duration, reset rules, possession state, foul handling, and clock behavior
- shootouts or other special tiebreak procedures run only in modes and competitions whose rules require them, use eligible participants, resolve the tie exactly once, and persist the official result without contaminating regulation or overtime statistics
- modes without a shootout never enter one accidentally
- the final score, winner, standings result, schedule row, box score, player statistics, team statistics, records, finances, news, and saved/reloaded game state all agree
- replaying, reopening, saving, or reloading a completed game does not apply its result or statistics twice
- simulator controls remain clickable and no overlay, animation, loading state, stale event queue, or uncaught error traps the user

Test regulation finishes, close games, blowouts, tied regulation, one overtime, multiple overtimes, and every implemented special ending with deterministic seeds when possible. Any mismatch among play-by-play, visible simulator state, canonical result, standings, or persisted statistics is a real failure.

### Standings Validation

After schedule generation and after every major season phase, verify:

- wins and losses match completed games
- total team games are correct
- standings ordering follows the correct rules
- ties and tiebreakers resolve correctly
- playoff qualification matches standings
- no team receives duplicate games
- no required game is missing
- home and away totals are valid where applicable
- conference and division totals are valid
- points-for and points-against totals match game results
- postseason results do not contaminate regular-season standings
- continental and domestic standings remain separate where required

### Financial Validation

Check finances throughout the season and offseason.

Validate:

- cash balances
- revenue
- expenses
- payroll
- salary-cap calculations
- luxury-tax calculations
- contract values
- transfer fees
- signing bonuses
- staff costs
- facility costs
- scouting costs
- competition revenue
- prize money
- owner or commissioner budgets where applicable

Fail on:

- unexpected negative values
- `NaN`
- `Infinity`
- unexplained money creation
- unexplained money destruction
- duplicate payment
- missing payment
- incorrect currency handling
- broken rollover between seasons

Allow legitimate negative balances only when the game rules explicitly support them.

### Roster and Entity Validation

Regularly validate:

- unique player IDs
- unique team IDs
- unique game IDs
- unique contract IDs where applicable
- every active player belongs to a valid team or valid free-agent pool
- no player appears on multiple active rosters
- roster sizes follow mode rules
- retired players are not active
- released players are removed correctly
- transferred players change registration correctly
- team references point to existing teams
- competition references point to existing competitions
- no orphaned records remain after deletion, relocation, promotion, relegation, or defunct-team processing

### Statistical Validation

Check that:

- team totals match player totals where expected
- player games played do not exceed team games without a valid reason
- minutes and possessions remain valid
- percentages use valid denominators
- league leaders are selected from eligible players
- awards use valid candidates
- historical records update once
- playoff statistics remain separated when required
- no stat becomes `NaN`, `Infinity`, or an impossible negative value

Use tolerances for floating-point calculations where exact equality is inappropriate.

### Offseason Validation

Exercise every available offseason task.

Detect:

- tasks that cannot be completed
- tasks that disappear prematurely
- tasks that remain permanently incomplete
- circular dependencies between tasks
- buttons that do nothing
- repeated dialogs
- invalid task ordering
- missing required data
- failed year advancement
- corrupted contracts
- incomplete drafts
- incomplete free agency
- broken promotion or relegation
- broken licensing or invitation decisions
- incorrect roster reset
- schedule generation failure
- save corruption after offseason completion

Measure how long each offseason phase takes and identify unusually slow tasks.

### Save and Reload Validation

At important checkpoints:

1. Save the game.
2. Reload the written save.
3. Validate entity counts.
4. Validate team and player assignments.
5. Validate current date and season phase.
6. Validate standings and schedule state.
7. Continue simulation from the reloaded save.

Do not treat successful serialization alone as proof of correctness.

Check that the reloaded state is functionally equivalent to the state before saving.

Use timestamped backups before overwriting important development saves.

### Performance and Bottleneck Detection

Profile full-season and multi-season simulations.

Measure at least:

- league creation
- schedule generation
- one simulated game
- one simulated day
- one simulated week
- full regular season
- playoff simulation
- awards processing
- each offseason task
- draft processing
- free agency
- transfer processing
- save serialization
- save reload
- next-season initialization

Report:

- total elapsed time
- slowest phases
- unusually slow games or dates
- repeated expensive functions
- excessive database or storage activity
- long main-thread blocking
- memory growth
- possible memory leaks
- increasing simulation time across seasons

Do not optimize blindly. First reproduce and measure the bottleneck.

### Crash and Failure Reporting

On failure, preserve as much reproducible context as possible.

Report:

- mode
- starting year
- current season
- current date
- season phase
- team controlled
- random seed
- most recent user or automated action
- failing test name
- stack trace
- browser console errors
- relevant entity IDs
- relevant save-file path
- recent simulation log
- timing data
- memory data when available

Save a minimal failing reproduction when practical.

Fail fast on structural corruption, but preserve diagnostic information before stopping the affected run.

### Multi-Season Stress Testing

After a detailed one-season test passes, run multi-season stress tests.

Use multiple modes, eras, teams, and deterministic seeds.

The goal is to expose failures that appear only after:

- repeated offseason transitions
- long contract histories
- repeated drafts
- repeated expansion or contraction
- promotion and relegation cycles
- historical rule transitions
- large statistical histories
- accumulating news or transaction records
- save/load repetition
- player retirement and regeneration
- team defunction or relocation
- continental competition qualification changes

Run a bounded smoke batch first so obvious failures are reported quickly.

After the bounded batch passes, the test harness may continue running seasons repeatedly while the active development session remains open, until:

- the user explicitly says to stop
- the process is manually interrupted
- a critical reproducible failure is found
- the configured safety limit is reached
- the environment terminates the process

Do not claim to continue testing after the active process or coding session has ended.

The continuous runner must periodically write progress and checkpoint reports rather than remaining silent.

### Recommended Continuous Test Matrix

Rotate through combinations such as:

- NBA modern
- NBA historical
- NBA earliest supported era
- WNBA modern
- European domestic-only
- European domestic plus continental competition
- PBA
- fictional league
- expansion or contraction scenario
- promotion and relegation scenario
- different controlled teams
- different random seeds

Do not run only the same league repeatedly.

### Completion Standard

A feature is not complete merely because it compiles or renders once.

Before reporting completion, run the relevant combination of:

- parser or syntax validation
- lint
- type check
- focused unit tests
- integration tests
- headless gameplay test
- full-season smoke simulation
- save/reload validation
- audit utilities
- production build

For changes affecting simulation, finances, standings, scheduling, contracts, saves, offseason progression, or cross-mode logic, a full-season headless test is expected whenever technically feasible.

For broad engine changes, run at least one multi-season simulation.

Clearly distinguish:

- tests that passed
- tests that failed
- tests that were not run
- limitations of the test environment
- pre-existing failures
- newly introduced failures

Never state that everything works when only a narrow path was tested.

### Repository Discipline

Keep the headless test harness reusable and separate from production gameplay code where practical.

Do not leave uncontrolled infinite loops in normal application startup.

Continuous simulation must require an explicit test or development command.

Do not commit generated saves, large logs, screenshots, browser profiles, benchmark output, raw audit files, or temporary reports unless the repository intentionally tracks them.

Add appropriate generated test artifacts to `.gitignore` when needed.

Do not weaken production validation merely to make a test pass.

Fix the underlying bug instead of changing assertions to accept invalid behavior.

## Commit & Pull Request Guidelines

- Imperativ, prägnant ("offseason 2K fix: 'Enter Preseason' actually exits offseason mode").
- Bug-Fix: Root-Cause in der Commit-Message, nicht nur Symptom.
- Bei UI-Änderungen: Screenshot oder kurzes Behavior-Statement im PR.
- CHANGELOG-Eintrag entweder im selben PR oder nachgelagert in der nächsten Session.

## Persistence Constraint (KRITISCH)

Alles, was in `localStorage` oder `IndexedDB` außerhalb von `GameState` geschrieben wird, MUSS mit `state.saveId` skopt sein, sonst leakt es zwischen Saves. Reference: `src/store/gameplanStore.ts`. Niemals einen einzelnen globalen Key für editierbare Per-Save-Settings.

Private Personen-/Teamaktivitäten wie Dinner oder Movie Night sind keine Liga-Transaktionen oder League Events und dürfen weder in Player Bio Transactions noch im ligaweiten Transactions-Feed erscheinen. Sie bleiben ausschließlich in ihrem privaten Action-/Message-Kontext.

Transactions zeigen ausschließlich den faktischen Vorgang und seine Vertrags-/Asset-Details. Narrative Einordnung wie Returns, Comebacks, frühere Ligen, Veteran Presence oder Storyline-Sätze gehört in Social Feed beziehungsweise League News und darf nicht an Transaction-Text angehängt werden.
