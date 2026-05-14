// MIN-Audit über alle Ligen im Save (NBA, Endesa, Euroleague, ...).
// Gruppiert BoxScores nach Liga und zeigt erwartete vs. tatsächliche MIN-Sums
// + Spieler die das Game-Length-Limit überschreiten.
//
// In DevTools-Console pasten.
(async () => {
  let state = window.__lastSaveState;
  if (!state) {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('keyval-store');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const get = k => new Promise((res, rej) => {
      const r = db.transaction('keyval','readonly').objectStore('keyval').get(k);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const meta = await get('nba_commish_metadata');
    const newest = [...meta].sort((a,b) => b.dateSaved - a.dateSaved)[0];
    const raw = await get(newest.id);
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(raw.data); w.close();
    state = JSON.parse(await new Response(ds.readable).text());
    window.__lastSaveState = state;
  }

  // Liga-Klassifizierung anhand playerId-Präfix (BBGM-Konvention im Save).
  //   "endesa-..." → Endesa (Spain ACB)
  //   "euroleague-..." / "euro-..." → Euroleague
  //   numerisch oder kein Präfix → NBA
  //   "wnba-..." → WNBA, "pba-..." → PBA, "bleague-..." → B-League, ...
  const classifyByPlayerId = (pid) => {
    if (!pid) return 'NBA';
    const s = String(pid).toLowerCase();
    if (s.startsWith('endesa'))      return 'Endesa';
    if (s.startsWith('euroleague'))  return 'Euroleague';
    if (s.startsWith('euro-'))       return 'Euroleague';
    if (s.startsWith('wnba'))        return 'WNBA';
    if (s.startsWith('pba'))         return 'PBA';
    if (s.startsWith('bleague'))     return 'B-League';
    if (s.startsWith('b-league'))    return 'B-League';
    if (s.startsWith('gleague'))     return 'G-League';
    if (s.startsWith('g-league'))    return 'G-League';
    if (s.startsWith('cba') || s.startsWith('china')) return 'China CBA';
    if (s.startsWith('nbl'))         return 'NBL Australia';
    return 'NBA';
  };

  const classifyBoxScore = (b) => {
    const all = [...(b.homeStats ?? []), ...(b.awayStats ?? [])];
    if (all.length === 0) return 'Unknown';
    const counts = {};
    for (const p of all) {
      const lg = classifyByPlayerId(p.playerId);
      counts[lg] = (counts[lg] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a,b) => b[1] - a[1])[0][0];
  };

  // Erwartete Timing pro Liga (NBA = 48 min, Euro/Endesa = 40 min)
  const LEAGUE_TIMING = {
    'NBA':           { qLen: 12, numQ: 4, otLen: 5 },
    'WNBA':          { qLen: 10, numQ: 4, otLen: 5 },
    'Endesa':        { qLen: 10, numQ: 4, otLen: 5 },
    'Euroleague':    { qLen: 10, numQ: 4, otLen: 5 },
    'PBA':           { qLen: 12, numQ: 4, otLen: 5 },
    'B-League':      { qLen: 10, numQ: 4, otLen: 5 },
    'G-League':      { qLen: 12, numQ: 4, otLen: 5 },
    'China CBA':     { qLen: 12, numQ: 4, otLen: 5 },
    'NBL Australia': { qLen: 10, numQ: 4, otLen: 5 },
  };

  const bs = state.boxScores ?? [];
  if (bs.length === 0) { console.log('Keine BoxScores im Save.'); return; }

  // Group BoxScores by league, take last 10 each
  const byLeague = {};
  for (const b of [...bs].reverse()) {
    if ((b.homeStats?.length ?? 0) < 5 || (b.awayStats?.length ?? 0) < 5) continue;
    const lg = classifyBoxScore(b);
    if (!byLeague[lg]) byLeague[lg] = [];
    if (byLeague[lg].length < 10) byLeague[lg].push(b);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Save:', state.commissioner?.name ?? '?', '| Day:', state.day ?? '?');
  console.log('User-Liga state.leagueStats:', {
    quarterLength: state.leagueStats?.quarterLength,
    numQuarters:   state.leagueStats?.numQuarters,
    overtimeDuration: state.leagueStats?.overtimeDuration,
  });
  console.log('═══════════════════════════════════════════════════════════');

  const summary = [];
  for (const lg of Object.keys(byLeague).sort()) {
    const games = byLeague[lg];
    const timing = LEAGUE_TIMING[lg] ?? LEAGUE_TIMING.NBA;
    const regTotal = timing.qLen * timing.numQ;
    const targetPerTeam = regTotal * 5;

    console.log(`\n━━━ ${lg} ━━━  (erwarteter Total/Team: ${targetPerTeam} min — ${regTotal}-Min-Spiel)`);

    const rows = games.map(b => {
      const otCount = b.otCount ?? 0;
      const gameLen = regTotal + otCount * timing.otLen;
      const teamTarget = gameLen * 5;
      const homeSum = b.homeStats.reduce((s, p) => s + (p.min ?? 0), 0);
      const awaySum = b.awayStats.reduce((s, p) => s + (p.min ?? 0), 0);
      const allPlayers = [...b.homeStats, ...b.awayStats];
      const maxP = allPlayers.reduce((m, p) => (p.min ?? 0) > (m.min ?? 0) ? p : m, { min: 0 });
      const overCap = allPlayers.filter(p => (p.min ?? 0) > gameLen + 0.5).length;
      const homeDrift = homeSum - teamTarget;
      const awayDrift = awaySum - teamTarget;
      const ok = Math.abs(homeDrift) <= 1 && Math.abs(awayDrift) <= 1 && overCap === 0;
      return {
        date:        b.date?.slice(0, 10) ?? '?',
        gid:         b.gameId,
        OT:          otCount,
        target:      teamTarget,
        home:        homeSum.toFixed(1),
        away:        awaySum.toFixed(1),
        hΔ:          homeDrift.toFixed(1),
        aΔ:          awayDrift.toFixed(1),
        maxPlayer:   `${(maxP.name ?? '?').slice(0, 20)} (${(maxP.min ?? 0).toFixed(1)})`,
        overCap,
        OK:          ok ? '✅' : '❌',
      };
    });
    console.table(rows);

    const drifted = rows.filter(r => r.OK === '❌').length;
    summary.push({ league: lg, sampled: games.length, drifted, pct: drifted / games.length });
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Drift-Summary pro Liga:');
  console.table(summary.map(s => ({
    Liga:           s.league,
    Sample:         s.sampled,
    Drifted:        s.drifted,
    'Drift-Quote':  `${(s.pct * 100).toFixed(0)}%`,
  })));
})();
