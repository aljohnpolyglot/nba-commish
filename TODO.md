# NBA Commish — TODO

---
 Done and wired end-to-end:                                                                                                                                         
  - Cap room projection in SigningModal — per-year committed payroll, expiring contracts drop off, resign starts at year+1
  - Supermax + Rose Rule market value pinned to full ceiling in computeContractOffer (AI + user both get correct seed)                                               
  - Proper award eligibility — 2-of-3 All-NBA, preceding season, MVP/DPOY in last 3, 10+ years auto
  - supermaxMinYears configurable (default 8), Economy UI
  - Rose Rule (rookie ext) — full system, Bird Rights gated, sliders in Economy UI, AI handler flows through limits.maxSalaryUSD

  Worth eyeballing when you test:
  - SigningModal contract readout section (the Bird Rights/Supermax badges around line 1298) — doesn't yet show a "Rookie Ext · Rose Rule" badge for year 3–4
  eligible players
  - PlayerBioContractTab doesn't surface rookie ext eligibility either — minor but nice to have
## BUGS — Active

- **Statistical Feats — new sim feats overwrite team records, shows wrong value** (e.g. David Thompson 73pts 4/9/1978 vs DET shows as "3 points")

---

## FEATURES — Backlog (low priority)

### Draft Scouting sidebar — mock-team projections + POT-weighted comparisons
DraftScouting tab in Team Office already has 70/30 value/fit scoring. Remaining for the **main sidebar** `DraftScoutingView`:
1. Show which team is projected at each slot (mock draft).
2. Weight POT for young players in player comparisons, not just current OVR.

### External-league roster repopulation at rollover
Nothing currently calls `generateProspect(..., 'Europe' | 'NBL' | 'G-League' | 'Endesa' | 'B-League')` at rollover to refill external-league rosters as players age out. Without this, Euroleague/NBL/etc. rosters shrink over long sims.

### Hall of Fame — tiered eligibility wait
Currently everyone waits the same 3 seasons regardless of first-ballot vs regular. Diff it: first-ballot = 1 year, regular = 3, borderline = 5.

- **Dead money / ghost contracts (Luol Deng rule)** — waived-player stretch across multiple years.

---

## SEPARATE DEVELOPMENTS

| Project | Account |
|---------|---------|
| Draft Lottery / Draft | princealjohnmogatas@gmail.com |
| Coaching | lemakicatta@gmail.com |
| GrubHub | mogatas.princealjohn.05082003@gmail.com |
| FranchiseHub | lemakicatta@gmail.com |
| Restaurants gist | https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbarestaurantsdata |
| Hall of Fame UI | princealjohnmogatas@gmail.com |
| Team Office | mogatas.princealjohn.05082003@gmail.com |

---

## History

Session-by-session fixed lists now live in [`NEW_FEATURES.md`](./NEW_FEATURES.md) and [`CHANGELOG.md`](./CHANGELOG.md). Read those before assuming an item is still open.

