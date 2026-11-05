import type { CompetitionTiebreaker } from '../types';
import type {
  CupCompetitionFormat,
  CupGroupAssignment,
  CupQualifier,
  CupResult,
  CupStanding,
} from './types';

function scopedResults(format: CupCompetitionFormat, results: CupResult[], season: number): CupResult[] {
  return results.filter(result => result.played
    && result.leagueId === format.leagueId
    && result.competitionId === format.competitionId
    && result.season === season);
}

function tiedMetric(row: CupStanding, peers: CupStanding[], results: CupResult[], rule: CompetitionTiebreaker): number {
  if (rule === 'point-differential') return row.pointDifferential;
  if (rule === 'points-for') return row.pointsFor;
  const tids = new Set(peers.map(peer => peer.tid));
  const games = results.filter(result => tids.has(result.homeTid) && tids.has(result.awayTid) && (result.homeTid === row.tid || result.awayTid === row.tid));
  if (rule === 'mini-table') {
    return games.reduce((total, game) => total + (game.homeTid === row.tid ? game.homeScore - game.awayScore : game.awayScore - game.homeScore), 0);
  }
  const wins = games.filter(game => game.homeTid === row.tid ? game.homeScore > game.awayScore : game.awayScore > game.homeScore).length;
  return games.length > 0 ? wins / games.length : 0;
}

function rankRows(rows: CupStanding[], results: CupResult[], tiebreakers: CompetitionTiebreaker[]): CupStanding[] {
  const peersByWinPct = new Map<string, CupStanding[]>();
  rows.forEach(row => {
    const key = row.winPct.toFixed(12);
    peersByWinPct.set(key, [...(peersByWinPct.get(key) ?? []), row]);
  });
  return [...rows]
    .sort((left, right) => {
      if (right.winPct !== left.winPct) return right.winPct - left.winPct;
      const peers = peersByWinPct.get(left.winPct.toFixed(12)) ?? [left, right];
      for (const rule of tiebreakers) {
        const delta = tiedMetric(right, peers, results, rule) - tiedMetric(left, peers, results, rule);
        if (delta !== 0) return delta;
      }
      return left.tid - right.tid;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function rankCupGroups(
  format: CupCompetitionFormat,
  assignments: CupGroupAssignment[],
  results: CupResult[],
  season: number,
): CupStanding[] {
  const scoped = scopedResults(format, results, season);
  return assignments.flatMap(group => {
    const tids = new Set(group.tids);
    const groupResults = scoped.filter(result => tids.has(result.homeTid) && tids.has(result.awayTid));
    const rows = group.tids.map(tid => {
      const teamGames = groupResults.filter(result => result.homeTid === tid || result.awayTid === tid);
      const wins = teamGames.filter(result => result.homeTid === tid ? result.homeScore > result.awayScore : result.awayScore > result.homeScore).length;
      const pointsFor = teamGames.reduce((total, result) => total + (result.homeTid === tid ? result.homeScore : result.awayScore), 0);
      const pointsAgainst = teamGames.reduce((total, result) => total + (result.homeTid === tid ? result.awayScore : result.homeScore), 0);
      return {
        groupId: group.groupId,
        poolId: group.poolId,
        tid,
        rank: 0,
        gamesPlayed: teamGames.length,
        wins,
        losses: teamGames.length - wins,
        winPct: teamGames.length > 0 ? wins / teamGames.length : 0,
        pointsFor,
        pointsAgainst,
        pointDifferential: pointsFor - pointsAgainst,
      };
    });
    return rankRows(rows, groupResults, format.groupStage.tiebreakers);
  });
}

function rankAcrossGroups(rows: CupStanding[], results: CupResult[], rules: CompetitionTiebreaker[]): CupStanding[] {
  return [...rows].sort((left, right) => {
    if (right.winPct !== left.winPct) return right.winPct - left.winPct;
    const peers = rows.filter(row => row.winPct === left.winPct);
    for (const rule of rules) {
      const delta = tiedMetric(right, peers, results, rule) - tiedMetric(left, peers, results, rule);
      if (delta !== 0) return delta;
    }
    return left.tid - right.tid;
  });
}

export function qualifyCupTeams(
  format: CupCompetitionFormat,
  assignments: CupGroupAssignment[],
  results: CupResult[],
  season: number,
): CupQualifier[] {
  const standings = rankCupGroups(format, assignments, results, season);
  const direct = standings.filter(row => row.rank <= format.qualification.directPerGroup);
  const directTids = new Set(direct.map(row => row.tid));
  const scoped = scopedResults(format, results, season);
  const wildcardRows = format.qualification.wildcards.flatMap(rule => rankAcrossGroups(
    standings.filter(row => !directTids.has(row.tid) && (!rule.poolId || row.poolId === rule.poolId)),
    scoped,
    format.qualification.wildcardTiebreakers,
  ).slice(0, rule.count));
  const uniqueWildcards = [...new Map(wildcardRows.map(row => [row.tid, row])).values()];
  const directOrdered = format.qualification.seeding === 'group-rank-protected'
    ? rankAcrossGroups(direct, scoped, format.groupStage.tiebreakers).sort((left, right) => left.rank - right.rank || right.winPct - left.winPct || left.tid - right.tid)
    : rankAcrossGroups(direct, scoped, format.groupStage.tiebreakers);
  return [
    ...directOrdered.map(row => ({ row, source: 'direct' as const })),
    ...rankAcrossGroups(uniqueWildcards, scoped, format.qualification.wildcardTiebreakers).map(row => ({ row, source: 'wildcard' as const })),
  ].map(({ row, source }, index): CupQualifier => ({
    tid: row.tid,
    seed: index + 1,
    source,
    groupId: row.groupId,
    groupRank: row.rank,
    poolId: row.poolId,
  }));
}
