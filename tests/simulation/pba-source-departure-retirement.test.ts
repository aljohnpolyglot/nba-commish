import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { NBAPlayer } from '../../src/types';
import { buildHistoricalPbaRosterFromSource } from '../../src/services/pba/historicalSeasonBuilder';
import { prepareHistoricalPbaImportPool } from '../../src/services/pba/historicalImportPool';
import type { PbaMasterSource } from '../../src/services/pba/historicalTypes';

const source = JSON.parse(readFileSync(
  new URL('../../public/data/external/pba/pba-2027-final-jerseys-cleaned-bbgm.json', import.meta.url),
  'utf8',
)) as PbaMasterSource;

const roster = buildHistoricalPbaRosterFromSource(source, 2018);
const find = (name: string) => roster.players.find(player => player.name === name);

for (const name of ['Malcolm Hill', 'LaDontae Henton', 'Jameel McKay', 'Kris Acox']) {
  const player = find(name);
  assert.ok(player, `${name} must remain available to the PBA universe`);
  assert.notEqual(player.status, 'Retired', `${name}'s last PBA stint is not a basketball retirement`);
  assert.equal(player.retiredYear, undefined);
}

assert.ok(find('Baser Amer'));
assert.equal(find('Amer Baser'), undefined);
assert.equal(find('Michael Pennisi')?.status, 'Retired');

const roster2019 = buildHistoricalPbaRosterFromSource(source, 2019);
const parks = roster2019.players.filter(player => player.name === 'Bobby Ray Parks Jr.');
assert.equal(parks.length, 1);
assert.match(String(parks[0].imgURL ?? ''), /Parks_Ray\.jpg/i);
assert.notEqual(parks[0].status, 'Retired');

const dormantImport = {
  internalId: 'historical-import:dormant',
  name: 'Dormant Import',
  tid: -3,
  status: 'Retired',
  retiredYear: 2016,
  born: { year: 1994, loc: 'United States' },
  overallRating: 48,
  historicalPbaSource: {
    identityKey: 'dormant-import',
    importTagged: true,
    firstEligibleSeason: 2016,
    sourceSeason: 2018,
    importSourceSeasons: [2016],
  },
} as unknown as NBAPlayer;
const pool = prepareHistoricalPbaImportPool([dormantImport], [dormantImport], 2018, 0);
assert.equal(pool[0].status, 'PBA Import Reserve');
assert.equal(pool[0].retiredYear, undefined);
assert.equal(pool[0].tid, -1);

const careerRetiredImport = {
  ...dormantImport,
  internalId: 'historical-import:career-retired',
  born: { year: 1960, loc: 'United States' },
  retiredYear: 1998,
  historicalPbaSource: {
    ...dormantImport.historicalPbaSource,
    identityKey: 'career-retired-import',
    importSourceSeasons: [1998],
  },
} as unknown as NBAPlayer;
const retiredPool = prepareHistoricalPbaImportPool([careerRetiredImport], [careerRetiredImport], 2018, 0);
assert.equal(retiredPool[0].status, 'Retired');
assert.equal(retiredPool[0].tid, -3);
assert.equal(retiredPool[0].retiredYear, 1998);

const modernRoster = buildHistoricalPbaRosterFromSource(source, 2026);
for (const name of ['Herb Jones', 'Brandon Williams']) {
  const historical = modernRoster.players.find(player => player.name === name && player.historicalPbaSource?.importTagged);
  assert.ok(historical, `${name}'s old PBA record remains in history`);
  assert.equal(historical.status, 'Retired', `${name}'s old PBA identity cannot enter the 2026 free-agent pool`);
  assert.equal(historical.tid, -3);
}

console.log('PBA source departures remain available without becoming basketball retirements.');
