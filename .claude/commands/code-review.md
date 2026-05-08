---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr comment:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*)
description: Code-Review eines Pull Requests (NBA Commish Sim)
disable-model-invocation: false
---

Liefere einen Code-Review für den angegebenen Pull Request. Sprache der Antworten: **Deutsch** (siehe `CLAUDE.md` § Communication).

Dafür diese Schritte präzise befolgen:

1. Mit einem Haiku-Agenten prüfen, ob der PR (a) closed ist, (b) ein Draft ist, (c) keinen Review braucht (z.B. automated PR oder offensichtlich trivial), oder (d) bereits einen Review von dir aus früherer Session hat. Wenn ja, nicht weitermachen.

2. Mit einem weiteren Haiku-Agenten eine Liste der relevanten `CLAUDE.md`-Dateien holen (Pfade, NICHT Inhalte): die Root-`CLAUDE.md` plus jede `CLAUDE.md` in den Verzeichnissen, deren Files der PR modifiziert.

3. Mit einem Haiku-Agenten den PR anschauen lassen und eine Summary der Änderung zurückgeben.

4. Dann **5 parallele Sonnet-Agents** starten für einen unabhängigen Code-Review. Jeder Agent gibt eine Liste von Issues + den Grund jeder Flag zurück (CLAUDE.md-Compliance / Bug / historischer git-Kontext / etc.):
   - **Agent #1: CLAUDE.md-Compliance.** Prüft Compliance mit der Root-`CLAUDE.md` UND `AGENTS.md`. Besondere Aufmerksamkeit auf:
     - Multi-Season-Pipeline-Reihenfolge in `AIFreeAgentHandler.runAIFreeAgencyRound` (Pass 2 muss vor Pass 4)
     - Save-Scoped Persistenz für alles in localStorage/IndexedDB außerhalb GameState
     - Family-Ties-Protection (`hasFamilyOnRoster`) in jedem Trim/Cut
     - BBGM vs K2 Rating-Skalen (jede Schwelle ≥85 BBGM ist tot)
     - `team.players` existiert nicht — nur `state.players.filter(p => p.tid === teamId)`
     - Default keine Kommentare; nur das Warum dokumentieren
     - Kein Backwards-Compat-Shim
     - Kein Error-Handling für unmögliche Szenarien
   - **Agent #2: Shallow Bug-Scan.** Liest die File-Changes im PR und scannt auf offensichtliche Bugs. Fokus auf große Bugs, ignoriere kleine Issues und Nitpicks. Likely False Positives ignorieren.
   - **Agent #3: git-blame + History.** Liest blame und history des modifizierten Codes, identifiziert Bugs im Licht des historischen Kontexts. Besonders: betroffen die Änderungen bekannte fragile Code-Pfade (Offseason-Orchestrator `[OSPLAN]`, Save-State-Persistenz, FA-Pipeline)?
   - **Agent #4: Vorherige PRs.** Liest vorherige PRs die diese Files berührten und checkt PR-Comments die auf den aktuellen PR auch zutreffen.
   - **Agent #5: Code-Comments-Compliance.** Liest Code-Kommentare in den modifizierten Files und stellt sicher dass die PR-Änderungen mit Guidance in den Kommentaren übereinstimmen.

5. Für jedes in #4 gefundene Issue startest du einen parallelen Haiku-Agenten, der den PR + Issue-Description + Liste der CLAUDE.md-Files (aus Schritt 2) bekommt und einen Confidence-Score zurückgibt (0–100):
   - **0:** Not confident at all. False Positive der bei leichter Prüfung scheitert, oder pre-existing Issue.
   - **25:** Somewhat confident. Könnte real sein, könnte False Positive sein. Agent konnte nicht verifizieren. Wenn stylistisch: nicht in der relevanten CLAUDE.md explizit erwähnt.
   - **50:** Moderately confident. Verified als reales Issue, aber möglicherweise Nitpick oder selten relevant. Im Vergleich zum Rest des PR nicht sehr wichtig.
   - **75:** Highly confident. Doppelt geprüft, sehr likely real und in der Praxis getroffen. Existing Approach im PR ist insufficient. Issue ist wichtig und wirkt direkt auf Funktionalität, oder ist explizit in der relevanten CLAUDE.md erwähnt.
   - **100:** Absolutely certain. Doppelt geprüft, definitiv real, wird häufig in Practice getroffen. Evidence direkt confirmt.

6. Filter alle Issues mit Score < 80. Wenn keine Issues durchkommen, nicht weitermachen.

7. Mit einem Haiku-Agenten die Eligibility-Check aus #1 wiederholen — sicherstellen dass der PR noch reviewable ist.

8. Schließlich `gh` nutzen um auf den PR mit dem Result zu kommentieren. Beim Schreiben:
   - Output kurz halten.
   - Keine Emojis.
   - Relevanten Code, Files, URLs verlinken und zitieren.

## False-Positive-Beispiele (für Schritte 4 und 5)

- Pre-existing Issues
- Etwas das wie ein Bug aussieht aber keiner ist
- Pedantic Nitpicks die ein Senior-Engineer nicht callen würde
- Issues die ein Linter/Typechecker/Compiler fängt (missing Imports, Type-Errors, broken Tests, Formatting). `npm run lint` läuft separat als CI-Step
- General Code-Quality-Issues (Test-Coverage, Doku, generic Security) — außer explizit in CLAUDE.md gefordert
- Issues in CLAUDE.md called out aber im Code explizit silenced (z.B. via lint-ignore)
- Functionality-Changes die likely intended sind oder direkt mit der broader Change zusammenhängen
- Reale Issues, aber auf Lines die der User im PR nicht modifiziert hat

## Notes

- **Keine Build-Signale prüfen**, keinen typecheck/build selbst starten. Läuft separat in CI.
- `gh` für GitHub-Interaktion (PR fetchen, inline Comments) statt WebFetch
- Erst eine Todo-Liste machen
- Du MUSST jeden Bug zitieren und verlinken (z.B. wenn auf CLAUDE.md verwiesen wird, link drauf)

## Comment-Format

Für den finalen Comment, exakt dieses Format (Beispiel mit 3 Issues):

---

### Code review

Found 3 issues:

1. <kurze Bug-Description> (CLAUDE.md says "<...>")

<link to file and line with full sha1 + line range, z.B. https://github.com/owner/repo/blob/{full-sha}/{file}#L13-L17>

2. <kurze Bug-Description> (some/other/CLAUDE.md says "<...>")

<link to file and line with full sha1 + line range>

3. <kurze Bug-Description> (bug due to <file and code snippet>)

<link to file and line with full sha1 + line range>

🤖 Generated with [Claude Code](https://claude.ai/code)

<sub>- If this code review was useful, please react with 👍. Otherwise, react with 👎.</sub>

---

Wenn keine Issues gefunden:

---

### Code review

No issues found. Checked for bugs and CLAUDE.md compliance.

🤖 Generated with [Claude Code](https://claude.ai/code)

---

## Link-Format

Beim Linken auf Code, exakt dieses Format folgen, sonst rendert Markdown nicht korrekt:

`https://github.com/owner/repo/blob/{full-sha}/{path}#L{start}-L{end}`

- Voller git-sha (kein `$(git rev-parse HEAD)`-Shell-Substitution; das wird in Markdown nicht expanded).
- Repo-Name muss matchen.
- `#`-Zeichen nach Filename.
- Line-Range-Format `L[start]-L[end]`.
- Mindestens 1 Zeile Context vor + nach der zentrierten Issue-Zeile (z.B. wenn Issue auf Lines 5-6, link `L4-L7`).
