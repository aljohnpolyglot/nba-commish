# Repository Guidelines

> **Hinweis:** Dieses Repo nutzt Claude Code als primären Coding-Agent. `CLAUDE.md` enthält die kanonische Agent-Anweisung (Sprache: Deutsch, Multi-Season-Pipeline-Reihenfolge, Save-Format, DevTools-Snippet). Codex-Agents folgen demselben Inhalt — `CLAUDE.md` ist die Quelle, `AGENTS.md` ist diese Übersicht.

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
- Simulator-seitig existieren **zwei Pfade**: `Fast` und `Realistic` (siehe `docs/simulator-guide.md` und `PRODUCT.md`).
- Vor Annahmen über "latest commits" unterscheiden zwischen:
  - **committetem Stand** (`git log`)
  - **in-flight Worktree-Stand** (`git status`, `git diff`)

Wenn Doku aktualisiert wird, sollten mindestens `README.md`, `CHANGELOG.md` und `TODO.md` auf denselben Stand gebracht werden.

## Project Structure & Module Organization

`src/` Code (Components, Services, Store, Utils). `scripts/` enthält Browser-Console-Audit-Scripts (`audit-economy.js`, `audit-economy-deep.js`). Externe Doku (Mode-READMEs, EXTERNAL_ROSTERS, etc.) liegt in der Repo-Root. Keine eigene `tests/`-Struktur derzeit — Verifikation erfolgt über `npm run lint` (= `tsc --noEmit`) plus In-Browser-Sim-Playthroughs gegen reale Saves.

## Build, Test, and Development Commands

```bash
npm install          # Deps
npm run dev          # Vite dev server
npm run lint         # tsc --noEmit (kanonischer Type-Check)
npm run build        # Vite-Bundle
```

Save-State-Audit aus DevTools-Konsole: Snippet in `CLAUDE.md` → "Standard snippet". Bei Save-/Contract-/Roster-Debugging immer zuerst den vollständigen IndexedDB+Gzip-Load-Snippet geben; nie voraussetzen, dass `window.__lastSaveState` bereits existiert. Beide `scripts/audit-economy*.js` lassen sich direkt in DevTools paste-und-runnen (laden den neuesten Save automatisch).

Für In-App-Repro/Diagnose ist `src/utils/debugCheats.ts` der zentrale Einstiegspunkt. Wenn ein TODO-Bug auf PlayButton, Phase, Offseason, Euro-Mode oder Stuck-State verweist, zuerst dort nach vorhandenen Cheats (`STUCK`, `PHASEDUMP`, `EUROAUDIT`, `WARP`, `WARPSLOW`) suchen und neue Diagnoseausgabe dort ergänzen statt zu raten.

## Planning and Change Intake

Komplexe Features werden in `CHANGELOG.md` als Session-Eintrag dokumentiert (Format: Session N (Datum) — Titel, Bullet-Liste der Änderungen mit File-Pfaden). Vor größeren Refactors prüfen, ob ein TODO-Item dazu existiert; ist keines da, eines anlegen, dann implementieren.

Wenn Worktree-Änderungen bewusst noch nicht committed sind, in `TODO.md` oder `CHANGELOG.md` klar markieren, ob etwas:
- **shipped/committed**
- **worktree-only / in-flight**
- **deferred / follow-up**

ExecPlan-Format (light): Bei mehrtägigen Refactors einen `MULTI_SESSION_*.md` oder `*_PLAN.md` File anlegen (Beispiele: `THRONE_PLAN.md`, `COACHING_DEPTH_ROADMAP.md`, `TEAM_TRAINING_PLAN.md`).

## Code Style and Commenting Requirements

- TypeScript strict, keine `any` außer an externen Daten-Boundaries (Gist-Fetch).
- React Functional Components mit Hooks, Tailwind für Styling.
- Niemals commissioner-/league-konfigurierbare Settings hardcoden (z.B. Salary Cap, Contract-Scale, Toggles). Immer `leagueStats`, Setup-State oder den Commissioner-Settings-Flow als Source of Truth verwenden.
- Nutzer-sichtbare Offseason-/Phase-Copy soll wie Spieltext klingen, nicht wie interne Pipeline-/Dev-Labels. Begriffe wie `Offseason Flow`, `Phase`, `resolver`, `gate` etc. in sichtbarer UI vermeiden, wenn eine natürliche Formulierung möglich ist.
- **Default: keine Kommentare.** Nur das Warum dokumentieren wenn nicht offensichtlich (versteckter Constraint, Workaround, surprising Behavior).
- Keine Multi-Paragraph-Docstrings. Ein-Zeile-Max.
- Datei-Größe: <600 Zeilen Hand-Code bevorzugt; bestehende größere Files (z.B. `GameContext.tsx`, `simulationHandler.ts`) werden inkrementell aufgespalten — keine Vergrößerung ohne Grund.
- Backwards-Compatibility-Hacks vermeiden (renamed `_vars`, dead Re-Exports, `// removed` Kommentare). Wenn unused: löschen.
- Error-Handling/Fallbacks nur an System-Boundaries (User-Input, externe APIs). Internal Code trust.

## Testing Guidelines

Aktuell keine Unit-Tests. Verifikation läuft über:
1. `npm run lint` — Type-sicher.
2. `npm run build` — Bundle-Errors fängt Vite.
3. **Browser-Playthrough mit echtem Save** — Sim mehrere Saisons durch, DevTools-Konsole auf `[OSPLAN]`-Drift-Warnings filtern.
4. **Audit-Scripts** — `audit-economy.js` für Roster/Cap/2W-Health, `audit-economy-deep.js` für FA-Pool-by-OVR und unter-rostered-Team-Logs.

UI-Änderungen erfordern visuelle Verifikation im Dev-Server (siehe System-Anweisung). Type-Checks und Build-Erfolg verifizieren Code-Korrektheit, nicht Feature-Korrektheit.

## Commit & Pull Request Guidelines

- Imperativ, prägnant ("offseason 2K fix: 'Enter Preseason' actually exits offseason mode").
- Bug-Fix: Root-Cause in der Commit-Message, nicht nur Symptom.
- Bei UI-Änderungen: Screenshot oder kurzes Behavior-Statement im PR.
- CHANGELOG-Eintrag entweder im selben PR oder nachgelagert in der nächsten Session.

## Persistence Constraint (KRITISCH)

Alles, was in `localStorage` oder `IndexedDB` außerhalb von `GameState` geschrieben wird, MUSS mit `state.saveId` skopt sein, sonst leakt es zwischen Saves. Reference: `src/store/gameplanStore.ts`. Niemals einen einzelnen globalen Key für editierbare Per-Save-Settings.
