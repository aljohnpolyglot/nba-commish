/**
 * Multi-season economy audit — paste into browser DevTools console.
 *
 * Verifies fixes from Prompts 3, 4, 5:
 *   - Supermax auto-qualify removed (no $58M extensions to non-award vets)
 *   - Pass 2 fill loop (no <14-man rosters)
 *   - Two-way slot fill (was 0/3 league-wide)
 *   - Pass 4 minimum payroll (no teams below 90% of cap)
 *
 * Run from console:  await auditEconomy()
 * Or pick a specific save:  await auditEconomy('nba_commish_save_<id>')
 */
async function auditEconomy(saveId) {
  // ── Open idb-keyval's default DB ─────────────────────────────────────
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
  const maxStd   = ls.maxStandardPlayersPerTeam ?? 15;
  const maxTW    = ls.maxTwoWayPlayersPerTeam ?? 3;
  const minSalUSD = (ls.minContractStaticAmount ?? 1.2) * 1_000_000;
  const userTid  = state.gameMode === 'gm' ? state.userTeamId : -999;

  const fmt = n => '$' + (n / 1_000_000).toFixed(1) + 'M';
  const log = (icon, msg) => console.log(`${icon} ${msg}`);

  console.log('\n══════════════════════════════════════════════════════');
  console.log(` ECONOMY AUDIT — ${state.date} (year ${ls.year})`);
  console.log(`  Cap ${fmt(cap)} · Floor ${fmt(floor)} (${floorPct}%) · Min ${fmt(minSalUSD)}`);
  console.log('══════════════════════════════════════════════════════\n');

  // Per-team aggregates (skip user team for AI checks)
  const teamRows = teams.filter(t => t.id !== userTid).map(t => {
    const onTeam   = players.filter(p => p.tid === t.id);
    const standard = onTeam.filter(p => !p.twoWay);
    const twoWay   = onTeam.filter(p => p.twoWay);
    const payroll  = onTeam.reduce((s, p) => s + ((p.contract?.amount || 0) * 1000), 0);
    return { team: t, onTeam, standard, twoWay, payroll };
  });

  // ── CHECK 1: Roster sizes (Prompt 4 — Pass 2 fill loop) ──────────────
  console.log('── CHECK 1: Roster sizes (target: ≥14 standard) ──');
  const undersizedRosters = teamRows.filter(r => r.standard.length < 14);
  if (undersizedRosters.length === 0) {
    log('✅', `All ${teamRows.length} AI teams have ≥14 standard players.`);
  } else {
    log('❌', `${undersizedRosters.length} team(s) below 14:`);
    undersizedRosters.forEach(r =>
      console.log(`     ${r.team.name.padEnd(22)} ${r.standard.length}/15`)
    );
  }

  // ── CHECK 2: Two-way slot fill (Prompt 4 — TWO_WAY_OVR_CAP bump) ─────
  console.log('\n── CHECK 2: Two-way fill (target: ≥50% of slots) ──');
  const totalTwoWay     = teamRows.reduce((s, r) => s + r.twoWay.length, 0);
  const totalTwoWayCap  = teamRows.length * maxTW;
  const twoWayFilledPct = (totalTwoWay / totalTwoWayCap) * 100;
  const teamsWithZeroTW = teamRows.filter(r => r.twoWay.length === 0).length;
  if (twoWayFilledPct >= 50) {
    log('✅', `${totalTwoWay}/${totalTwoWayCap} two-way slots filled (${twoWayFilledPct.toFixed(0)}%) — ${teamsWithZeroTW} team(s) at 0.`);
  } else {
    log('❌', `Only ${totalTwoWay}/${totalTwoWayCap} two-way slots filled (${twoWayFilledPct.toFixed(0)}%) — ${teamsWithZeroTW} team(s) at 0.`);
  }

  // ── CHECK 3: Minimum payroll floor (Prompt 5 — Pass 4) ───────────────
  console.log(`\n── CHECK 3: Payroll floor (target: ≥${fmt(floor)}) ──`);
  if (ls.minimumPayrollEnabled === false) {
    log('⚠️ ', 'Minimum payroll is DISABLED in league settings — skipping.');
  } else {
    const belowFloor = teamRows
      .filter(r => r.payroll < floor)
      .sort((a, b) => a.payroll - b.payroll);
    if (belowFloor.length === 0) {
      log('✅', `All ${teamRows.length} AI teams above floor.`);
    } else {
      log('❌', `${belowFloor.length} team(s) below floor:`);
      belowFloor.forEach(r =>
        console.log(`     ${r.team.name.padEnd(22)} ${fmt(r.payroll).padStart(8)}  (gap: ${fmt(floor - r.payroll)})`)
      );
    }
  }

  // ── CHECK 4: Bloated payrolls (sanity — no team should be $400M+) ────
  console.log(`\n── CHECK 4: Payroll ceiling sanity (target: <$400M) ──`);
  const bloated = teamRows.filter(r => r.payroll > 400_000_000)
    .sort((a, b) => b.payroll - a.payroll);
  if (bloated.length === 0) {
    log('✅', 'No team payroll above $400M.');
  } else {
    log('❌', `${bloated.length} team(s) above $400M (compounding bug):`);
    bloated.forEach(r =>
      console.log(`     ${r.team.name.padEnd(22)} ${fmt(r.payroll)}`)
    );
  }

  // ── CHECK 5: Bench-player mega-extensions (Prompt 3 — supermax fix) ──
  console.log('\n── CHECK 5: Non-star mega-contracts (target: 0) ──');
  const seasonYr = ls.year;
  const benchMega = players.filter(p => {
    if (p.tid < 0) return false;
    const annualUSD = (p.contract?.amount || 0) * 1000;
    if (annualUSD < 40_000_000) return false;     // mega-contract = $40M+/yr
    const ovr = p.overallRating ?? 0;
    return ovr < 60;                               // BBGM 60 ≈ K2 84 (solid starter floor)
  }).sort((a, b) => (b.contract?.amount || 0) - (a.contract?.amount || 0));
  if (benchMega.length === 0) {
    log('✅', 'No bench/role players on $40M+/yr deals.');
  } else {
    log('❌', `${benchMega.length} bench player(s) on mega-contracts:`);
    benchMega.slice(0, 10).forEach(p => {
      const ann = ((p.contract?.amount || 0) / 1000).toFixed(1);
      console.log(`     ${p.name.padEnd(22)} OVR ${p.overallRating}  $${ann}M/yr  (exp ${p.contract?.exp})`);
    });
    if (benchMega.length > 10) console.log(`     … and ${benchMega.length - 10} more`);
  }

  // ── CHECK 6: Lingering supermax flag on non-award vets ───────────────
  console.log('\n── CHECK 6: Lingering superMaxEligible cache ──');
  const lingeringSuper = players.filter(p => p.superMaxEligible && p.tid >= 0);
  if (lingeringSuper.length === 0) {
    log('✅', 'No players carry stale superMaxEligible flag.');
  } else {
    const yos = p => (p.stats || []).filter(s => !s.playoffs && (s.gp || 0) > 0).length;
    log('⚠️ ', `${lingeringSuper.length} player(s) still flagged superMaxEligible (clears next Jun 30 rollover):`);
    lingeringSuper.slice(0, 10).forEach(p =>
      console.log(`     ${p.name.padEnd(22)} OVR ${p.overallRating}  YOS ${yos(p)}  exp ${p.contract?.exp}`)
    );
    if (lingeringSuper.length > 10) console.log(`     … and ${lingeringSuper.length - 10} more`);
  }

  // ── Summary table ────────────────────────────────────────────────────
  console.log('\n── Per-team summary ──');
  console.table(teamRows.map(r => ({
    team: r.team.name,
    std:  `${r.standard.length}/${maxStd}`,
    '2w': `${r.twoWay.length}/${maxTW}`,
    payroll: fmt(r.payroll),
    vsFloor: r.payroll < floor ? `−${fmt(floor - r.payroll)}` : '✓',
  })));

  console.log('\nDone. ✅ = pass · ❌ = fail · ⚠️  = info\n');
}

// Auto-run on paste
auditEconomy();
