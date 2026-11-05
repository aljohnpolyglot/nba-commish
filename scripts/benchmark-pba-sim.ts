import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PBA_ISOLATED_DEFAULTS } from '../src/constants';
import { getHistoricalPbaRuleOverrides } from '../src/services/pba/historicalCatalog';
import { buildHistoricalPbaRoster, isHistoricalPbaImport } from '../src/services/pba/historicalSeasonBuilder';
import type { PbaSourcePlayer } from '../src/services/pba/historicalTypes';
import { GameSimulator } from '../src/services/simulation/GameSimulator';
import { buildPbaCompetitionKnobs } from '../src/services/simulation/GameSimulator/engineDaySetup';
import { buildLeagueBaseKnobs } from '../src/services/simulation/GameSimulator/engineLeagueKnobs';
import { simulateGameRealistic } from '../src/services/simulation/realistic/RealisticEngine';
import type { GameResult, PlayerGameStats } from '../src/services/simulation/types';
import type { NBAPlayer, NBATeam } from '../src/types';

type Engine = 'fast' | 'realistic';
type PlayerTotals = { name: string; games: number; pts: number; reb: number; ast: number; min: number };

const valueArg = (name: string, fallback: string): string =>
  process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const season = Number(valueArg('season', '2015'));
const gamesPerTeam = Math.max(4, Number(valueArg('games-per-team', '12')) || 12);
const seeds = valueArg('seeds', '260807,260808,260809').split(',').map(Number).filter(Number.isFinite);
const verify = valueArg('verify', 'false') === 'true';
const verifyFour = valueArg('verify-four', 'false') === 'true';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function installLocalDataFetch(): void {
  globalThis.fetch = async input => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, 'http://benchmark.local');
    if (url.hostname === 'benchmark.local' && url.pathname.startsWith('/data/')) {
      try {
        const file = await readFile(path.join(process.cwd(), 'public', ...url.pathname.split('/').filter(Boolean)));
        return new Response(file, { status: 200, headers: { 'content-type': 'application/json' } });
      } catch {
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
  };
}

function schedule(teams: NBATeam[], countPerTeam: number): Array<[NBATeam, NBATeam]> {
  const games: Array<[NBATeam, NBATeam]> = [];
  for (let round = 0; round < countPerTeam; round += 1) {
    for (let index = 0; index < teams.length; index += 2) {
      const home = teams[(index + round) % teams.length];
      const away = teams[(index + round + 1) % teams.length];
      if (home.id !== away.id) games.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
  }
  return games;
}

function collectPlayerLeaders(games: GameResult[]) {
  const totals = new Map<string, PlayerTotals>();
  const add = (line: PlayerGameStats) => {
    const row = totals.get(line.playerId) ?? { name: line.name, games: 0, pts: 0, reb: 0, ast: 0, min: 0 };
    row.games += 1;
    row.pts += line.pts;
    row.reb += line.reb;
    row.ast += line.ast;
    row.min += line.min;
    totals.set(line.playerId, row);
  };
  games.forEach(game => [...game.homeStats, ...game.awayStats].forEach(add));
  const qualified = [...totals.values()].filter(row => row.games >= Math.max(3, gamesPerTeam * 0.5));
  const leader = (metric: 'pts' | 'reb' | 'ast' | 'min') => qualified
    .map(row => ({ name: row.name, value: row[metric] / row.games, games: row.games }))
    .sort((left, right) => right.value - left.value)[0];
  return { pts: leader('pts'), reb: leader('reb'), ast: leader('ast'), min: leader('min') };
}

function sourceLeaders(sourcePlayers: PbaSourcePlayer[], includeImports: boolean) {
  const rows = sourcePlayers
    .filter(player => includeImports || !isHistoricalPbaImport(player))
    .flatMap(player => (player.stats ?? [])
    .filter(row => Number(row.season) === season && !row.playoffs && Number(row.gp) >= 10)
    .map(row => ({
      name: player.name,
      games: Number(row.gp),
      pts: Number(row.pts ?? 0) / Number(row.gp),
      reb: (Number(row.orb ?? 0) + Number(row.drb ?? 0)) / Number(row.gp),
      ast: Number(row.ast ?? 0) / Number(row.gp),
      min: Number(row.min ?? 0) / Number(row.gp),
    })));
  const leader = (metric: 'pts' | 'reb' | 'ast' | 'min') => [...rows]
    .sort((left, right) => right[metric] - left[metric])[0];
  return { pts: leader('pts'), reb: leader('reb'), ast: leader('ast'), min: leader('min') };
}

installLocalDataFetch();
const roster = await buildHistoricalPbaRoster(season);
const teams = roster.teams.map(team => ({
  ...team,
  id: team.tid,
  cid: 0,
  did: 0,
  wins: 0,
  losses: 0,
  conference: 'East',
})) as unknown as NBATeam[];
const activeTids = new Set(teams.map(team => team.id));
const players = roster.players.filter(player => activeTids.has(player.tid)).map(player => ({
  ...player,
  injury: { type: 'Healthy', gamesRemaining: 0 },
})) as NBAPlayer[];
const leagueStats = {
  ...PBA_ISOLATED_DEFAULTS,
  ...getHistoricalPbaRuleOverrides(season),
  year: season,
  uiMode: 'pba_isolated' as const,
};
const knobs = buildPbaCompetitionKnobs(buildLeagueBaseKnobs(leagueStats), leagueStats);
const reference = sourceLeaders(roster.source.players, true);
const localReference = sourceLeaders(roster.source.players, false);
const summaries: Array<any> = [];

for (const seed of seeds) {
  for (const engine of ['fast', 'realistic'] as Engine[]) {
    const nativeRandom = Math.random;
    Math.random = seededRandom(seed + (engine === 'realistic' ? 1 : 0));
    const games: GameResult[] = [];
    try {
      for (const [homeTeam, awayTeam] of schedule(teams, gamesPerTeam)) {
        const args = {
          homeTeam,
          awayTeam,
          players,
          gameId: games.length + 1,
          date: `${season}-11-01`,
          homeKnobs: knobs,
          awayKnobs: knobs,
          injuryFrequencyFactor: 0,
        };
        games.push(engine === 'realistic'
          ? simulateGameRealistic(args)
          : GameSimulator.simulateGame(homeTeam, awayTeam, players, args.gameId, args.date, 50, undefined, undefined, false, false, false, undefined, knobs, knobs, 0));
      }
    } finally {
      Math.random = nativeRandom;
    }
    const leaders = collectPlayerLeaders(games);
    const teamGames = games.length * 2;
    summaries.push({
      seed,
      engine,
      games: games.length,
      teamPpg: games.reduce((sum, game) => sum + game.homeScore + game.awayScore, 0) / teamGames,
      teamRpg: games.reduce((sum, game) => sum
        + game.homeStats.reduce((total, line) => total + line.reb, 0)
        + game.awayStats.reduce((total, line) => total + line.reb, 0), 0) / teamGames,
      team4pa: games.reduce((sum, game) => sum + [...game.homeStats, ...game.awayStats].reduce((total, line) => total + (line.fourPa ?? 0), 0), 0) / teamGames,
      team4pm: games.reduce((sum, game) => sum + [...game.homeStats, ...game.awayStats].reduce((total, line) => total + (line.fourPm ?? 0), 0), 0) / teamGames,
      leaders,
    });
  }
}

console.log(JSON.stringify({ season, activeTeams: teams.length, activePlayers: players.length, reference, localReference, summaries }, null, 2));

if (verify || verifyFour) {
  const failures: string[] = [];
  for (const row of summaries) {
    if (season >= 2025 && (row.team4pa < 3 || row.team4pa > 7 || row.team4pm < 0.4 || row.team4pm > 1.6)) {
      failures.push(`${row.engine} seed ${row.seed}: ${row.team4pa.toFixed(1)} team 4PA, ${row.team4pm.toFixed(1)} team 4PM`);
    }
    if (season < 2025 && (row.team4pa !== 0 || row.team4pm !== 0)) {
      failures.push(`${row.engine} seed ${row.seed}: four-point shots before the PBA rule`);
    }
    if (!verify) continue;
    if (row.teamPpg < 75 || row.teamPpg > 115) failures.push(`${row.engine} seed ${row.seed}: ${row.teamPpg.toFixed(1)} team PPG`);
    if (row.teamRpg < 35 || row.teamRpg > 53) failures.push(`${row.engine} seed ${row.seed}: ${row.teamRpg.toFixed(1)} team RPG`);
    if (row.leaders.pts.value > Math.max(32, localReference.pts.pts * 1.35)) failures.push(`${row.engine} seed ${row.seed}: ${row.leaders.pts.value.toFixed(1)} leader PPG`);
    if (row.leaders.reb.value > Math.max(17, localReference.reb.reb * 1.30)) failures.push(`${row.engine} seed ${row.seed}: ${row.leaders.reb.value.toFixed(1)} leader RPG`);
    if (row.leaders.ast.value > Math.max(10, localReference.ast.ast * 1.50)) failures.push(`${row.engine} seed ${row.seed}: ${row.leaders.ast.value.toFixed(1)} leader APG`);
    if (row.leaders.min.value > 42) failures.push(`${row.engine} seed ${row.seed}: ${row.leaders.min.value.toFixed(1)} leader MPG`);
  }
  if (failures.length > 0) throw new Error(`PBA benchmark acceptance failed:\n${failures.join('\n')}`);
}
