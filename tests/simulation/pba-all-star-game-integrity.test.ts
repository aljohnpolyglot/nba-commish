import { strict as assert } from 'node:assert';
import { AllStarWeekendOrchestrator } from '../../src/services/allStar/AllStarWeekendOrchestrator';
import { prepareAllStarWeekendForWatch } from '../../src/services/allStar/allStarWeekendEvents';
import { shouldAdvanceAfterAllStarEventDay } from '../../src/services/allStar/allStarSaturdayCompletion';
import { autoSimAllStarWeekend } from '../../src/services/logic/autoResolversParts/allStarWeekendResolvers';
import { getAllStarWeekendDates } from '../../src/services/allStar/allStarWeekendDates';
import { buildPbaAllStarLeagueStats } from '../../src/services/pba/allStar';
import type { GameState, NBAPlayer, NonNBATeam } from '../../src/types';

(globalThis as any).localStorage = {
  getItem: () => JSON.stringify({ simulatorMode: 'realistic' }),
  setItem: () => undefined,
  removeItem: () => undefined,
};

const sourceLeagueStats = {
  uiMode: 'nba',
  year: 2026,
  quarterLength: 12,
  numQuarters: 4,
  playersOnCourt: 5,
};
const leagueStats = buildPbaAllStarLeagueStats(sourceLeagueStats);
assert.equal(leagueStats.uiMode, 'pba_isolated', 'a PBA All-Star simulation must not inherit the active NBA scope');

const teams = [2000, 2001].map((tid, index) => ({
  tid,
  cid: 0,
  did: 0,
  region: `PBA City ${index + 1}`,
  name: `Club ${index + 1}`,
  abbrev: `PB${index + 1}`,
  league: 'PBA',
  wins: 8,
  losses: 3,
})) as unknown as NonNBATeam[];

const rating = (season: number, value: number) => ({
  season,
  ovr: value,
  pot: value,
  hgt: value,
  stre: value,
  spd: value,
  jmp: value,
  endu: value,
  ins: value,
  dnk: value,
  ft: value,
  fg: value,
  tp: value,
  oiq: value,
  diq: value,
  drb: value,
  pss: value,
  reb: value,
});

const players = Array.from({ length: 24 }, (_, index) => ({
  internalId: `pba-all-star-${index + 1}`,
  name: `PBA All-Star ${index + 1}`,
  tid: index % 2 === 0 ? 2000 : 2001,
  status: 'PBA',
  pos: index % 5 === 0 ? 'C' : index % 3 === 0 ? 'F' : 'G',
  age: 24 + index % 8,
  born: { year: 2002 - index % 8, loc: 'Manila, Philippines', country: 'Philippines' },
  pbaLocalEligible: true,
  overallRating: 72 + index % 9,
  ratings: [rating(2026, 62 + index % 12)],
  stats: [],
  awards: [],
  injury: { type: 'Healthy', gamesRemaining: 0 },
  contract: { amount: 30, exp: 2027 },
})) as unknown as NBAPlayer[];

const roster = players.map((player, index) => ({
  playerId: player.internalId,
  playerName: player.name,
  conference: index < 12 ? 'East' : 'West',
  isStarter: index < 5 || (index >= 12 && index < 17),
  isCaptain: index === 0 || index === 12,
  ovr: player.overallRating,
}));

const state = {
  date: '2026-03-08',
  day: 1,
  gameMode: 'gm',
  userTeamId: 2000,
  teams: [],
  nonNBATeams: teams,
  players,
  schedule: [],
  boxScores: [],
  history: [],
  news: [],
  leagueStats,
  allStar: {
    season: 2026,
    roster,
    votes: [],
    startersAnnounced: true,
    reservesAnnounced: true,
    weekendComplete: false,
  },
} as unknown as GameState;

const pbaWeekendStart = getAllStarWeekendDates(2026, leagueStats).breakStart.toISOString().slice(0, 10);
const preparedForWatch = prepareAllStarWeekendForWatch({ ...state, date: pbaWeekendStart });
const preparedEvents = preparedForWatch.schedule.filter(game =>
  game.isAllStar || game.isDunkContest || game.isThreePointContest || game.isSkillsChallenge
);
assert.equal(preparedForWatch.allStar?.gamesInjected, true, 'the PBA calendar stop must materialize its watchable weekend');
assert.equal(preparedEvents.length, 4, 'PBA must expose its three supported contests and All-Star Game');
assert.ok(preparedEvents.every(game => game.played === false), 'opening the PBA weekend must not auto-simulate it');
assert.ok(
  preparedEvents.every(game => Number(game.homeTid) < 0 && Number(game.awayTid) < 0),
  'PBA exhibition entries must remain separate from club schedule games',
);
const pbaSaturday = getAllStarWeekendDates(2026, leagueStats).saturday.toISOString().slice(0, 10);
assert.equal(shouldAdvanceAfterAllStarEventDay({
  ...preparedForWatch,
  date: pbaSaturday,
  allStar: {
    ...preparedForWatch.allStar!,
    dunkContest: { complete: true },
    threePointContest: { complete: true },
    skillsChallenge: { complete: true },
  },
}), true, 'PBA Saturday must advance after every supported contest finishes');

const pbaSunday = getAllStarWeekendDates(2026, leagueStats).allStarGame.toISOString().slice(0, 10);
const sundayAfterGame = {
  ...preparedForWatch,
  date: pbaSunday,
  schedule: preparedForWatch.schedule.map(game => game.isAllStar ? { ...game, played: true } : game),
  allStar: { ...preparedForWatch.allStar!, danceContest: { complete: true } },
  offseasonChecklist: { ...preparedForWatch.offseasonChecklist, pbaImportSearch: 'pending', pbaImportDecision: 'pending' },
} as GameState;
assert.equal(shouldAdvanceAfterAllStarEventDay(sundayAfterGame), false, 'PBA Sunday must stop for import decisions');
assert.equal(shouldAdvanceAfterAllStarEventDay({ ...sundayAfterGame, offseasonChecklist: undefined }), true, 'Sunday still advances when no import task is open');

const saturdaySim = await autoSimAllStarWeekend({
  ...preparedForWatch,
  date: pbaSaturday,
  offseasonChecklist: { ...preparedForWatch.offseasonChecklist, pbaAllStarWeekend: 'done' },
} as GameState, 'saturday');
assert.equal(saturdaySim.allStar?.weekendComplete, false, 'Simulate Day on Saturday leaves the Sunday game open');
assert.equal(saturdaySim.allStar?.threePointContest?.complete, true);
assert.equal(saturdaySim.schedule?.find(game => game.isAllStar)?.played, false);
const sundaySim = await autoSimAllStarWeekend({
  ...preparedForWatch,
  ...saturdaySim,
  date: pbaSunday,
  offseasonChecklist: { ...preparedForWatch.offseasonChecklist, pbaAllStarWeekend: 'done' },
} as GameState, 'sunday');
assert.equal(sundaySim.allStar?.weekendComplete, true, 'Sunday finishes the weekend after Saturday was simulated');
assert.equal(sundaySim.schedule?.find(game => game.isAllStar)?.played, true);

const euroState = {
  ...state,
  date: pbaWeekendStart,
  leagueStats: { ...leagueStats, uiMode: 'euro_isolated' },
};
assert.equal(
  prepareAllStarWeekendForWatch(euroState as GameState),
  euroState,
  'a mode without an All-Star Weekend must remain untouched',
);

const patch = await AllStarWeekendOrchestrator.simulateAllStarBracket(state);
const gameId = (patch.allStar as any)?.allStarGameId;
const box = patch.boxScores?.find(result => Number(result.gameId) === Number(gameId));
assert.ok(box, 'the PBA All-Star game must produce a saved box score');
assert.equal(box?.homeStats?.length, 12, 'all 12 home All-Stars must appear in the box score');
assert.equal(box?.awayStats?.length, 12, 'all 12 away All-Stars must appear in the box score');
assert.equal(box?.homeStats?.reduce((sum, row) => sum + Number(row.pts ?? 0), 0), box?.homeScore);
assert.equal(box?.awayStats?.reduce((sum, row) => sum + Number(row.pts ?? 0), 0), box?.awayScore);
assert.equal(box?.quarterScores?.home.reduce((sum, points) => sum + points, 0), box?.homeScore);
assert.equal(box?.quarterScores?.away.reduce((sum, points) => sum + points, 0), box?.awayScore);
assert.ok((patch.allStar as any)?.gameMvp?.playerId, 'the completed PBA All-Star game must preserve its MVP');

console.log('PBA All-Star scope, rotation, score, and box-score integrity regression passed.');
