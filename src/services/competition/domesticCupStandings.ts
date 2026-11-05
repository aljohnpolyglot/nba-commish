import type { Game } from '../../types';
import type { CompetitionSpec } from './types';
import { rankCompetitionStandings } from './competitionStandings';
import { didHomeTeamWin } from '../../utils/gameOutcome';

type DomesticCupTeamSource = {
  euroCompetitionTeamTids?: Record<string, number[]>;
  schedule?: Game[];
};

const uniqueTids = (tids: number[]) => [...new Set(tids.filter(tid => tid >= 100))];

function selectMaterializedCupTids(spec: CompetitionSpec, source: DomesticCupTeamSource): number[] | null {
  const quarterfinals = (source.schedule ?? [])
    .filter(game => game.competitionId === spec.id && game.competitionPhase === 'qf')
    .sort((left, right) => left.gid - right.gid);
  if (quarterfinals.length !== 4) return null;
  return uniqueTids([
    quarterfinals[0].homeTid,
    quarterfinals[2].homeTid,
    quarterfinals[3].homeTid,
    quarterfinals[1].homeTid,
    quarterfinals[1].awayTid,
    quarterfinals[3].awayTid,
    quarterfinals[2].awayTid,
    quarterfinals[0].awayTid,
  ]);
}

function selectLiveDomesticCupTids(spec: CompetitionSpec, source: DomesticCupTeamSource): number[] | null {
  if (!spec.domesticParentId) return null;
  const parentTids = uniqueTids(source.euroCompetitionTeamTids?.[spec.domesticParentId] ?? []);
  const parentGames = (source.schedule ?? []).filter(game =>
    game.played
    && game.competitionId === spec.domesticParentId
    && (game.competitionPhase === 'group' || game.competitionPhase?.startsWith('r'))
    && parentTids.includes(game.homeTid)
    && parentTids.includes(game.awayTid),
  );
  if (parentGames.length === 0) return null;
  const records = new Map(parentTids.map(tid => [tid, { tid, wins: 0, losses: 0, diff: 0 }]));
  parentGames.forEach(game => {
    const home = records.get(game.homeTid)!;
    const away = records.get(game.awayTid)!;
    const homeWon = didHomeTeamWin(game);
    home.wins += homeWon ? 1 : 0;
    home.losses += homeWon ? 0 : 1;
    home.diff += game.homeScore - game.awayScore;
    away.wins += homeWon ? 0 : 1;
    away.losses += homeWon ? 1 : 0;
    away.diff += game.awayScore - game.homeScore;
  });
  return rankCompetitionStandings(
    [...records.values()].map(record => ({
      tid: record.tid,
      wins: record.wins,
      losses: record.losses,
      pointsFor: parentGames.reduce((sum, game) => (
        sum + (game.homeTid === record.tid ? game.homeScore : game.awayTid === record.tid ? game.awayScore : 0)
      ), 0),
      pointsAgainst: parentGames.reduce((sum, game) => (
        sum + (game.homeTid === record.tid ? game.awayScore : game.awayTid === record.tid ? game.homeScore : 0)
      ), 0),
    })),
    parentGames,
    { ...spec, id: spec.domesticParentId },
    0,
  )
    .slice(0, Math.min(spec.teamCount ?? records.size, records.size))
    .map(record => record.tid);
}

export function selectQualifiedDomesticCupTids(
  spec: CompetitionSpec,
  source: DomesticCupTeamSource,
): number[] | null {
  if (spec.format !== 'knockout' || spec.qualificationRule !== 'domestic-standings') return null;
  return selectMaterializedCupTids(spec, source) ?? selectLiveDomesticCupTids(spec, source);
}
