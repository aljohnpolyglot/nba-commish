/**
 * FA status diagnostic — paste into browser DevTools console.
 *
 * Checks whether the FA pool is stored correctly in state, or whether legacy
 * `'FreeAgent'` (no-space) typos are making players invisible to every FA
 * signing filter.
 *
 * Symptoms this catches:
 *   - audit-economy-deep.js reports `Total FAs: 0` while UI shows 20+ FAs
 *   - Signings pipeline never picks up Trey Murphy / Jokic / Tre Johnson
 *   - Retirement skips them (their status is 'FreeAgent' not 'Free Agent')
 *
 * Root cause (fixed in Session 25): `simulationHandler.autoTrimOversizedRosters`
 * historically wrote `status: 'FreeAgent'` (no space) while every FA filter
 * compares against `'Free Agent'` (with space, canonical per types.ts).
 * LOAD_GAME migration + runSimulation forward-healing now normalize — but
 * this script verifies state is actually clean.
 *
 * Run:   copy → DevTools → paste → Enter
 */
(async () => {
  const openDB = () => new Promise((res, rej) => {
    const r = indexedDB.open('keyval-store');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const idbGet = (db, key) => new Promise((res, rej) => {
    const r = db.transaction('keyval', 'readonly').objectStore('keyval').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const db = await openDB();
  const meta = (await idbGet(db, 'nba_commish_metadata')) || [];
  if (!meta.length) {
    console.error('No saves found in IndexedDB. Save the game first.');
    return;
  }
  const newest = [...meta].sort((a, b) => b.dateSaved - a.dateSaved)[0];
  const state = await idbGet(db, newest.id);
  if (!state) {
    console.error('Save data missing.');
    return;
  }
  const P = state.players;

  console.log(`\n── FA Status Audit — ${newest.name} (${state.date}) ──\n`);

  // 1. Status value distribution across all players
  const statusCounts = {};
  P.forEach(p => {
    const s = p.status ?? 'undefined';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  console.log('status distribution (league-wide):');
  console.table(statusCounts);

  // 2. tid === -1 breakdown (should all be 'Free Agent')
  const tidMinus1 = P.filter(p => p.tid === -1);
  const byStatusAtTidNeg1 = {};
  tidMinus1.forEach(p => {
    const s = p.status ?? 'undefined';
    byStatusAtTidNeg1[s] = (byStatusAtTidNeg1[s] || 0) + 1;
  });
  console.log(`\ntid === -1 breakdown (total ${tidMinus1.length}):`);
  console.table(byStatusAtTidNeg1);

  // 3. Spot-check named players often flagged as stuck FAs in UI
  const uiFAs = [
    'Trey Murphy III', 'Caleb Jackson', 'Tre Johnson', 'Will Riley',
    'Darryn Peterson', 'Patrick Ngongba II', 'Nikola Jokic', 'Shaedon Sharpe',
    'Ziaire Williams', 'Adem Bona', 'Jabari Walker', 'Quincy Olivari',
    'Keshon Gilbert', 'Ricardo Turner', 'Brandon McCoy', 'Rui Hachimura',
    'Cayden Boozer', 'Ace Bailey', 'Cason Wallace', 'Jeremiah Fears',
    'Cooper Flagg', 'Kon Knueppel', 'Darius Acuff',
  ];
  console.log('\nUI-visible FA spot check:');
  console.table(uiFAs.map(name => {
    const p = P.find(pp => pp.name === name);
    if (!p) return { name, found: false };
    return {
      name,
      tid: p.tid,
      status: JSON.stringify(p.status),
      ovr: p.overallRating,
      age: p.age,
      retiredYear: p.retiredYear ?? null,
      contractAmt: p.contract?.amount ?? null,
      contractExp: p.contract?.exp ?? null,
      twoWay: !!p.twoWay,
      hasBirdRights: !!p.hasBirdRights,
    };
  }));

  // 4. Filter comparison — strict vs loose vs very-loose
  const strictFA = P.filter(p =>
    p.tid === -1 && p.status === 'Free Agent'
  );
  const looseFA = P.filter(p =>
    p.tid < 0 && (p.status === 'Free Agent' || p.status === 'FreeAgent')
  );
  const veryLoose = P.filter(p =>
    p.tid === -1 && p.status !== 'Retired' && !p.diedYear
  );

  console.log(`\nFA filter comparison:`);
  console.log(`  strict    (tid===-1 && status==='Free Agent'):     ${strictFA.length}`);
  console.log(`  loose     (tid<0 && status in {'Free Agent','FreeAgent'}): ${looseFA.length}`);
  console.log(`  veryLoose (tid===-1 && !Retired && !dead):          ${veryLoose.length}`);

  // 5. If strict is 0 but veryLoose > 0, show the leak
  if (strictFA.length === 0 && veryLoose.length > 0) {
    console.log('\n⚠️  Strict filter misses all FAs. Status strings leaking:');
    const leak = {};
    veryLoose.forEach(p => {
      const s = p.status ?? 'undefined';
      leak[s] = (leak[s] || 0) + 1;
    });
    console.table(leak);
    console.log('\n  → Root cause: legacy "FreeAgent" (no space) typo.');
    console.log('  → Fix: runSimulation normalize should heal on next sim tick,');
    console.log('    OR trigger a LOAD_GAME reload to fire the migration.');
  }

  // 6. FA pool OVR distribution (strict filter)
  if (strictFA.length > 0) {
    const buckets = { '85+': 0, '75-84': 0, '65-74': 0, '55-64': 0, '<55': 0 };
    strictFA.forEach(p => {
      const ovr = p.overallRating || 0;
      if (ovr >= 85) buckets['85+']++;
      else if (ovr >= 75) buckets['75-84']++;
      else if (ovr >= 65) buckets['65-74']++;
      else if (ovr >= 55) buckets['55-64']++;
      else buckets['<55']++;
    });
    console.log(`\nStrict FA pool OVR distribution (${strictFA.length} players):`);
    console.table(buckets);
  }

  // 7. Stuck young FAs — players aged 22-28 with no contract for 2+ seasons
  const currentYear = state.leagueStats?.year ?? 2026;
  const stuckYoung = strictFA.filter(p => {
    const age = p.born?.year ? (currentYear - p.born.year) : (p.age ?? 99);
    if (age > 28 || age < 22) return false;
    // Last real season played
    const lastPlayedSeason = (p.stats ?? [])
      .filter(s => !s.playoffs && (s.gp ?? 0) > 0)
      .reduce((max, s) => Math.max(max, s.season ?? 0), 0);
    return lastPlayedSeason > 0 && (currentYear - lastPlayedSeason) >= 2;
  });
  if (stuckYoung.length > 0) {
    console.log(`\nStuck young FAs (age 22-28, unsigned 2+ seasons) — ${stuckYoung.length}:`);
    console.table(stuckYoung.slice(0, 20).map(p => ({
      name: p.name,
      age: p.born?.year ? (currentYear - p.born.year) : p.age,
      ovr: p.overallRating,
      draft: p.draft?.year ? `${p.draft.year} R${p.draft.round ?? '?'} P${p.draft.pick ?? '?'}` : 'Undrafted',
      country: p.born?.loc ?? 'Unknown',
      hasBirdRights: !!p.hasBirdRights,
      midSeasonExtDeclined: !!p.midSeasonExtensionDeclined,
    })));
  }

  console.log('\n── Done. ──');
})();
