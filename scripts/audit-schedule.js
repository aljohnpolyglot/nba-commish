/**
 * Schedule integrity audit — paste into browser DevTools console.
 *
 * Finds:
 *   - Orphaned regular-season games (played:false but in the past)
 *   - Per-team GP mismatches vs 82
 *   - Games landing inside the All-Star blackout window (Feb 13–17)
 *   - Asymmetric W/L (where a played game's W+L != 1 across both teams)
 *
 * Run:  await auditSchedule()
 * Or:   await auditSchedule('nba_commish_save_<id>')
 */
async function auditSchedule(saveId) {
  const openDB = () => new Promise((res, rej) => {
    const r = indexedDB.open('keyval-store');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const idbGet = (db, key) => new Promise((res, rej) => {
    const tx = db.transaction('keyval', 'readonly');
    const r = tx.objectStore('keyval').get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });

  const db = await openDB();
  let state;
  if (saveId) {
    state = await idbGet(db, saveId);
  } else {
    const meta = await idbGet(db, 'nba_commish_metadata') || [];
    if (!meta.length) { console.error('No saves found.'); return; }
    const newest = [...meta].sort((a, b) => b.dateSaved - a.dateSaved)[0];
    console.log(`Loading newest save: "${newest.name}" (${newest.gameDate})`);
    state = await idbGet(db, newest.id);
  }
  if (!state) { console.error('Save data missing.'); return; }

  const sched = state.schedule || [];
  const teams = state.teams || [];
  const today = state.date;
  const todayMs = new Date(today).getTime();

  const tname = tid => {
    const t = teams.find(x => x.id === tid);
    return t ? `${t.abbreviation}` : `tid${tid}`;
  };

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` SCHEDULE AUDIT — today=${today}  total=${sched.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  // ── 1. Type breakdown
  const types = {};
  for (const g of sched) {
    const k = g.isAllStar ? 'allstar'
      : g.isRisingStars ? 'rising'
      : g.isPlayIn ? 'playin'
      : g.isPlayoff ? 'playoff'
      : g.isCupKO ? 'cupKO'
      : g.isPreseason ? 'preseason'
      : 'reg';
    const sub = g.played ? 'played' : 'unplayed';
    types[k] = types[k] || { played: 0, unplayed: 0 };
    types[k][sub]++;
  }
  console.log('Game type breakdown:');
  console.table(types);

  // ── 2. Orphaned regular-season games (date in past, not played, not future)
  const isExhibitionLike = (g) =>
    g.isAllStar || g.isRisingStars || g.isCelebrityGame
    || g.isDunkContest || g.isThreePointContest || g.isExhibition
    || g.homeTeamId < 0 || g.awayTeamId < 0
    || g.homeTid < 0 || g.awayTid < 0;
  const orphans = sched.filter(g =>
    !g.played
    && !isExhibitionLike(g)
    && !g.isPlayoff && !g.isPlayIn
    && new Date(g.date).getTime() < todayMs
  );
  console.log(`\nOrphaned games (past + unplayed): ${orphans.length}`);
  if (orphans.length) {
    console.table(orphans.slice(0, 30).map(g => ({
      gid: g.gid, date: g.date,
      home: tname(g.homeTeamId), away: tname(g.awayTeamId),
      isCupKO: !!g.isCupKO, isPreseason: !!g.isPreseason,
    })));
  }

  // ── 3. All-Star blackout window — any reg-season games scheduled inside?
  const ls = state.leagueStats || {};
  const breakStart = ls.allStarBreakStart || ls.allStarStart;
  const breakEnd   = ls.allStarBreakEnd   || ls.allStarEnd;
  console.log(`\nAll-Star break window: ${breakStart} → ${breakEnd}`);
  if (breakStart && breakEnd) {
    const s = new Date(breakStart).getTime();
    const e = new Date(breakEnd).getTime();
    const inBreak = sched.filter(g => {
      const t = new Date(g.date).getTime();
      return t >= s && t <= e
        && !isExhibitionLike(g)
        && !g.isPlayoff && !g.isPlayIn;
    });
    console.log(`  Reg-season-style games inside blackout: ${inBreak.length}`);
    if (inBreak.length) {
      console.table(inBreak.map(g => ({
        gid: g.gid, date: g.date, played: g.played,
        home: tname(g.homeTeamId), away: tname(g.awayTeamId),
      })));
    }
  }

  // ── 4. Per-team game-played counts (regular season only)
  const gp = {};
  for (const t of teams) gp[t.id] = { abbr: t.abbreviation, w: t.wins ?? 0, l: t.losses ?? 0, scheduled: 0, playedReg: 0, unplayedPast: 0 };
  for (const g of sched) {
    if (isExhibitionLike(g) || g.isPlayoff || g.isPlayIn || g.isPreseason) continue;
    // Cup group games count toward regular season; Cup KO does not (except final, which becomes playoff-tagged)
    if (g.isCupKO) continue;
    for (const tid of [g.homeTeamId, g.awayTeamId]) {
      if (!gp[tid]) continue;
      gp[tid].scheduled++;
      if (g.played) gp[tid].playedReg++;
      else if (new Date(g.date).getTime() < todayMs) gp[tid].unplayedPast++;
    }
  }

  const rows = Object.values(gp).map(r => ({
    team: r.abbr,
    'W+L': r.w + r.l,
    sched: r.scheduled,
    played: r.playedReg,
    pastUnplayed: r.unplayedPast,
    delta82: (r.w + r.l) - 82,
  })).sort((a, b) => a.team.localeCompare(b.team));
  console.log('\nPer-team regular-season GP:');
  console.table(rows);

  const totalWL = rows.reduce((a, r) => a + r['W+L'], 0);
  console.log(`\nLeague total W+L = ${totalWL}  (expected 2460 = 1230 games × 2 sides)`);
  console.log(`Missing team-results: ${2460 - totalWL}`);

  // ── 5. Asymmetry check — does each played game's home/away map to one W and one L?
  // Hard to verify without per-game logs; instead, flag teams whose played count != W+L
  const inconsistent = rows.filter(r => r.played !== r['W+L']);
  if (inconsistent.length) {
    console.log('\n⚠ Teams where played-count != W+L (W/L stat write divergence):');
    console.table(inconsistent);
  }

  return { orphans, gp, rows };
}

console.log('Loaded. Run: await auditSchedule()');
