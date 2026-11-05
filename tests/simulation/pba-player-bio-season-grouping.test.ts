import { strict as assert } from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSeasonRows } from '../../src/components/central/view/playerBioStatsHistoryData';
import { getPbaConferenceChampionKeys } from '../../src/components/central/view/playerBioPbaSeasonGrouping';
import { SeasonCell } from '../../src/components/central/view/PlayerBioStatsHistoryShared';
import { loadPbaStatsForPlayers } from '../../src/services/pba/statsArchive';

const stat = (
  competitionId: string,
  gp: number,
  pts: number,
  ast: number,
  tid = 2001,
) => ({
  season: 1992,
  tid,
  playoffs: false,
  competitionId,
  gp,
  gs: gp,
  min: gp * 30,
  fg: Math.round(pts * 0.4),
  fga: Math.round(pts * 0.8),
  tp: 0,
  tpa: 0,
  ft: Math.round(pts * 0.2),
  fta: Math.round(pts * 0.25),
  orb: gp,
  drb: gp * 3,
  ast,
  stl: gp,
  blk: 0,
  tov: gp,
  pf: gp * 2,
  pts,
}) as any;

const rows = buildSeasonRows([
  stat('pba-philippine-cup', 10, 200, 50),
  stat('pba-commissioners-cup', 8, 120, 32),
  stat('pba-governors-cup', 12, 240, 72),
], [{ id: 2001, abbrev: 'PRE' }], 1992, 29, new Map(), 'rs');

assert.equal(rows.body.length, 4, 'one PBA umbrella row and three conference rows are visible');
assert.equal(rows.body[0].leagueTag, 'PBA');
assert.equal(rows.body[0].competitionId, 'pba');
assert.equal(rows.body[0].isSubRow, undefined);
assert.equal(rows.body[0].gp, 30);
assert.equal(rows.body[0].pts, 560 / 30);
assert.equal(rows.body[0].ast, 154 / 30);
assert.deepEqual(
  rows.body.slice(1).map(row => [row.leagueTag, row.competitionId, row.isSubRow]),
  [
    ['PH CUP', 'pba-philippine-cup', true],
    ['COMM', 'pba-commissioners-cup', true],
    ['GOV', 'pba-governors-cup', true],
  ],
);
assert.equal(rows.career?.gp, 30, 'conference child rows never double-count career totals');
assert.equal(rows.career?.pts, 560 / 30);

const partialSeason = buildSeasonRows([
  stat('pba-philippine-cup', 4, 80, 12),
], [{ id: 2001, abbrev: 'PRE' }], 1992, 29, new Map(), 'rs');

assert.equal(partialSeason.body.length, 2, 'an in-progress PBA season still has an umbrella row');
assert.equal(partialSeason.body[0].leagueTag, 'PBA');
assert.equal(partialSeason.body[0].gp, 4);
assert.equal(partialSeason.body[1].leagueTag, 'PH CUP');
assert.equal(partialSeason.career?.gp, 4);

const teamSwitch = buildSeasonRows([
  stat('pba-philippine-cup', 5, 100, 20, 2001),
  stat('pba-philippine-cup', 3, 45, 9, 2002),
  stat('pba-commissioners-cup', 6, 90, 24, 2002),
], [{ id: 2001, abbrev: 'PRE' }, { id: 2002, abbrev: 'SMB' }], 1992, 29, new Map(), 'rs');
assert.equal(teamSwitch.body.length, 5, 'team stints remain visible below their conference total');
assert.equal(teamSwitch.body[0].teamAbbrev, 'TOT');
assert.equal(teamSwitch.body[0].gp, 14);
assert.equal(teamSwitch.body[1].leagueTag, 'PH CUP');
assert.equal(teamSwitch.body[1].teamAbbrev, 'TOT');
assert.equal(teamSwitch.body[1].gp, 8);
assert.deepEqual(teamSwitch.body.slice(2, 4).map(row => [row.teamAbbrev, row.gp]), [['PRE', 5], ['SMB', 3]]);
assert.equal(teamSwitch.career?.gp, 14);

const historicalUmbrellaOnly = buildSeasonRows([
  stat('pba', 43, 901, 157),
], [{ id: 2001, abbrev: 'SMB' }], 1995, 31, new Map(), 'rs');
assert.equal(historicalUmbrellaOnly.body.length, 1);
assert.equal(historicalUmbrellaOnly.body[0].leagueTag, 'PBA');
assert.equal(historicalUmbrellaOnly.body[0].isSubRow, undefined);
assert.equal(historicalUmbrellaOnly.career?.gp, 43);

const combined = buildSeasonRows([
  stat('pba-philippine-cup', 5, 100, 20),
  { ...stat('pba-philippine-cup', 2, 50, 8), playoffs: true },
  stat('pba-governors-cup', 4, 80, 16),
  { ...stat('pba-governors-cup', 3, 75, 12), playoffs: true },
], [{ id: 2001, abbrev: 'PRE' }], 1992, 29, new Map(), 'combined');
assert.equal(combined.body.length, 3);
assert.equal(combined.body[0].leagueTag, 'PBA');
assert.equal(combined.body[0].gp, 14);
assert.equal(combined.career?.gp, 14);

const championKeys = getPbaConferenceChampionKeys([
  { season: 1992, type: 'Champion', competitionId: 'pba-philippine-cup' },
  { season: 1992, type: 'All-Star' },
  { season: 1992, type: 'Champion', competitionId: 'pba' },
]);
assert.deepEqual([...championKeys], ['1992|pba-philippine-cup']);

const umbrellaMarkup = renderToStaticMarkup(React.createElement(SeasonCell, {
  row: rows.body[0],
  allStarSeasons: new Set([1992]),
  ringSeasons: new Set<number>(),
  cupSeasons: new Set<number>(),
  cupChampionLabel: 'Cup Champion',
  pbaConferenceChampionKeys: championKeys,
}));
assert.match(umbrellaMarkup, /title="All-Star"/, 'the All-Star badge stays on the umbrella PBA row');
assert.doesNotMatch(umbrellaMarkup, /PBA Philippine Cup Champion/, 'conference rings never leak onto the umbrella row');

const conferenceMarkup = renderToStaticMarkup(React.createElement(SeasonCell, {
  row: rows.body[1],
  allStarSeasons: new Set([1992]),
  ringSeasons: new Set<number>(),
  cupSeasons: new Set<number>(),
  cupChampionLabel: 'Cup Champion',
  pbaConferenceChampionKeys: championKeys,
}));
assert.match(conferenceMarkup, /title="PBA Philippine Cup Champion"/, 'the ring follows its PBA conference row');
assert.doesNotMatch(conferenceMarkup, /title="All-Star"/, 'conference rows never duplicate the umbrella All-Star badge');

console.log('PBA player bio seasons expose one umbrella average with conference child rows.');

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ rows: [
    { player_name: 'Dalph Adem Panopio', season: '2017-18', age: '17', team: 'Stella Azzurra U18', league: 'ANGT', gp: '4', pts: '17.8' },
    { player_name: 'Dalph Adem Panopio', season: '2018-19', age: '18', team: 'Roseto Sharks', league: 'Legadue Gold', gp: '9', pts: '1.6' },
    { player_name: 'Herb Jones', season: '1993-94', age: '16', team: 'Pop Cola', league: 'PBA', gp: '20', pts: '32.5' },
    { player_name: 'Brandon Williams', season: '2000-01', age: '16', team: 'Talk N Text', league: 'PBA', gp: '13', pts: '30.1' },
  ] }), { headers: { 'content-type': 'application/json' } });
try {
  const matches = await loadPbaStatsForPlayers([
    { internalId: 'panopio', name: 'Dalph Adem Panopio', tid: 2001, born: { year: 2000, loc: '' } },
    { internalId: 'modern-herb', name: 'Herb Jones', tid: -1, age: 25 },
    { internalId: 'modern-brandon', name: 'Brandon Williams', tid: 6, born: { year: 1999, loc: '' } },
    { internalId: 'old-herb', name: 'Herb Jones', tid: 2001, born: { year: 1978, loc: '' } },
  ] as any, { maxSeason: 2025 });
  assert.equal(matches.has('modern-herb'), false, 'modern namesakes cannot inherit 1990s PBA records');
  assert.equal(matches.has('modern-brandon'), false, 'modern NBA players cannot inherit 2000s PBA records');
  assert.equal(matches.get('old-herb')?.[0]?.season, 1994, 'the original player keeps his historical record');
  const archived = matches.get('panopio') ?? [];
  const history = buildSeasonRows(archived, [{ id: 2001, abbrev: 'BLB' }], 2026, 26, new Map(), 'rs');
  assert.deepEqual(history.body.map(row => [row.leagueTag, row.teamAbbrev, row.teamName, row.age]), [
    ['ANGT', 'STELLA', 'Stella Azzurra U18', 17],
    ['LEGADUE GO', 'ROSETO', 'Roseto Sharks', 18],
  ], 'foreign pre-PBA seasons keep their source league and club');
} finally {
  globalThis.fetch = originalFetch;
}
