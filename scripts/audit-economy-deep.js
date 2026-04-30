/**
 * Deeper economy audit — paste into browser DevTools console.
 *
 * Run AFTER simming forward at least one full offseason past the previous save
 * (sim past June 30 2031 → through the offseason → into Oct/Nov 2031). That
 * gives the reordered Pass 2 (two-way) and Pass 4 (roster fill) a chance to
 * actually run with the new code.
 *
 * Investigates:
 *   - What's in the FA pool (size, OVR distribution)
 *   - Why specific teams are under-rostered (NYK 11/15 etc.)
 *   - Per-team payroll breakdown (avg salary tells us if it's cheap-fill or true under-spend)
 *   - Recent transactions (last 30 days) per under-rostered team
 *
 * Usage:  await deepAudit()                       — newest save, all teams
 *         await deepAudit(null, ['NYK', 'SAS'])   — newest save, just those teams
 *         await deepAudit('nba_commish_save_xxx') — specific save
 */
async function deepAudit(saveId, focusAbbrevs) {
  const openDB = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  const idbGet = (db, key) => new Promise((resolve, reject) => {
    const tx  = db.transaction('keyval', 'readonly');
    const req = tx.objectStore('keyval').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
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

  const ls       = state.leagueStats;
  const players  = state.players;
  const teams    = state.teams;
  const cap      = ls.salaryCap || 0;
  const floorPct = ls.minimumPayrollPercentage ?? 90;
  const floor    = cap * (floorPct / 100);
  const userTid  = state.gameMode === 'gm' ? state.userTeamId : -999;
  const fmt = n => '$' + (n / 1_000_000).toFixed(1) + 'M';

  console.log(`\n══════════ DEEP ECONOMY AUDIT — ${state.date} ══════════\n`);

  // ── A) Free agent pool ───────────────────────────────────────────────
  // Accept legacy 'FreeAgent' (no space) typo — normalized on next sim tick / LOAD_GAME,
  // but stale saves still carry it on hundreds of records.
  const freeAgents = players.filter(p =>
    p.tid < 0 && (p.status === 'Free Agent' || p.status === 'FreeAgent') && !((p.draft?.year || 0) >= ls.year)
  );
  const buckets = { '85+': 0, '75-84': 0, '65-74': 0, '55-64': 0, '<55': 0 };
  freeAgents.forEach(p => {
    const ovr = p.overallRating || 0;
    if (ovr >= 85) buckets['85+']++;
    else if (ovr >= 75) buckets['75-84']++;
    else if (ovr >= 65) buckets['65-74']++;
    else if (ovr >= 55) buckets['55-64']++;
    else buckets['<55']++;
  });
  console.log('── A) FA pool by BBGM OVR bucket ──');
  console.table(buckets);
  console.log(`Total FAs: ${freeAgents.length}`);
  if (freeAgents.length < 30) {
    console.log('⚠️  Very thin FA pool — under-rostered teams may have nobody to sign.');
  }
  if (buckets['<55'] === 0 && buckets['55-64'] === 0) {
    console.log('⚠️  No fringe (≤60 OVR) FAs — Pass 2 (two-way) will starve.');
  }

  // ── B) Per-team payroll composition ──────────────────────────────────
  console.log('\n── B) Per-team avg salary (low avg = cheap-fill, not true under-spend) ──');
  const aiTeams = teams.filter(t => t.id !== userTid);
  const teamRows = aiTeams.map(t => {
    const onTeam   = players.filter(p => p.tid === t.id);
    const standard = onTeam.filter(p => !p.twoWay);
    const payroll  = onTeam.reduce((s, p) => s + ((p.contract?.amount || 0) * 1000), 0);
    const avgSalary = standard.length > 0 ? payroll / standard.length : 0;
    return {
      team: t.abbrev || t.name,
      std: `${standard.length}/15`,
      payroll: fmt(payroll),
      avg: fmt(avgSalary),
      vsFloor: payroll < floor ? `−${fmt(floor - payroll)}` : '✓',
    };
  });
  // Sort: under-floor teams first, by payroll asc
  teamRows.sort((a, b) => {
    const aGap = a.vsFloor === '✓' ? 0 : 1;
    const bGap = b.vsFloor === '✓' ? 0 : 1;
    return bGap - aGap || parseFloat(a.payroll.replace(/[\$M]/g, '')) - parseFloat(b.payroll.replace(/[\$M]/g, ''));
  });
  console.table(teamRows);

  // ── C) Under-rostered team deep dive ─────────────────────────────────
  console.log('\n── C) Under-rostered teams (< 15 standard) ──');
  const underRostered = aiTeams.filter(t => {
    const std = players.filter(p => p.tid === t.id && !p.twoWay).length;
    return std < 15;
  });

  if (underRostered.length === 0) {
    console.log('✅ All AI teams at 15/15 standard — Pass 4 fill loop is working.');
  } else {
    underRostered.forEach(t => {
      const roster = players.filter(p => p.tid === t.id);
      console.log(`\n  📋 ${t.name} — ${roster.filter(p => !p.twoWay).length}/15 standard`);
      const recentMoves = (state.transactionLog || [])
        .filter(tx => (tx.fromTid === t.id || tx.toTid === t.id || tx.teamId === t.id))
        .slice(-10);
      if (recentMoves.length) {
        console.log('    Recent transactions:');
        recentMoves.forEach(tx => {
          console.log(`      ${tx.date || '?'} · ${tx.type || '?'} · ${tx.description || JSON.stringify(tx).slice(0, 100)}`);
        });
      } else {
        console.log('    (no transaction log entries — log might not be populated)');
      }
      const roster2 = roster.filter(p => !p.twoWay).map(p => ({
        name: p.name,
        ovr: p.overallRating,
        salary: fmt((p.contract?.amount || 0) * 1000),
        exp: p.contract?.exp,
        type: p.nonGuaranteed ? 'NG' : (p.gLeagueAssigned ? 'GL' : 'STD'),
      }));
      console.table(roster2);
    });
  }

  // ── D) Two-way reality check ─────────────────────────────────────────
  console.log('\n── D) Two-way slot fill ──');
  const totalTW = aiTeams.reduce((s, t) =>
    s + players.filter(p => p.tid === t.id && p.twoWay).length, 0);
  const twoCap = aiTeams.length * (ls.maxTwoWayPlayersPerTeam ?? 3);
  console.log(`${totalTW}/${twoCap} two-way slots filled (${(totalTW/twoCap*100).toFixed(0)}%)`);
  if (totalTW < twoCap * 0.5) {
    console.log('⚠️  Still low. After Pass 2/3 reorder this should be ≥50%. If not:');
    console.log('   • Check FA pool — are there ≤60 OVR FAs available?');
    console.log('   • Check if FA round is even firing this date (cadence is 1d Jul, 14d Oct-Feb)');
  }

  // ── E) Floor-clearing forecast ───────────────────────────────────────
  console.log('\n── E) Floor-clearing forecast (rough) ──');
  const belowFloor = aiTeams.filter(t => {
    const onTeam = players.filter(p => p.tid === t.id);
    const payroll = onTeam.reduce((s, p) => s + ((p.contract?.amount || 0) * 1000), 0);
    return payroll < floor;
  });
  console.log(`${belowFloor.length} team(s) below floor. Of those:`);
  const belowFloorAtFull = belowFloor.filter(t =>
    players.filter(p => p.tid === t.id && !p.twoWay).length >= 15
  );
  console.log(`  · ${belowFloorAtFull.length} at 15/15 → cannot be helped by Pass 5 (need shortfall distribution)`);
  console.log(`  · ${belowFloor.length - belowFloorAtFull.length} have open slots → Pass 5 should clear them next FA round`);
  if (belowFloorAtFull.length > 0) {
    console.log('\n  Teams stuck at 15/15 below floor (need enforcePayrollFloor() shortfall distribution):');
    belowFloorAtFull.forEach(t => {
      const onTeam = players.filter(p => p.tid === t.id);
      const payroll = onTeam.reduce((s, p) => s + ((p.contract?.amount || 0) * 1000), 0);
      console.log(`    ${(t.abbrev || t.name).padEnd(6)}  ${fmt(payroll).padStart(8)} → needs ${fmt(floor - payroll)} more`);
    });
  }

  console.log('\nDone.\n');
}

// Auto-run
deepAudit();
