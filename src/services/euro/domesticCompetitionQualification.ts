import type { NonNBATeam } from '../../types';
import type { CompetitionSeasonResolution } from '../competition/competitionResolver';
import type { CompetitionSpec } from '../competition/types';

type ParticipantMap = Record<string, number[]>;

function unique(tids: Array<number | null | undefined>): number[] {
  return [...new Set(tids.filter((tid): tid is number => typeof tid === 'number' && tid >= 100))];
}

function seasonRow(team: NonNBATeam, season: number): NonNullable<NonNBATeam['seasons']>[number] | undefined {
  return [...(team.seasons ?? [])]
    .filter(row => Number(row.season ?? 0) <= season)
    .sort((left, right) => Number(right.season ?? 0) - Number(left.season ?? 0))[0];
}

function rankHistoricalDomesticTeams(teams: NonNBATeam[], tids: number[], season: number): number[] {
  const byTid = new Map(teams.map(team => [team.tid, team]));
  return [...tids].sort((leftTid, rightTid) => {
    const left = byTid.get(leftTid);
    const right = byTid.get(rightTid);
    const leftRow = left ? seasonRow(left, season) : undefined;
    const rightRow = right ? seasonRow(right, season) : undefined;
    const leftWins = Number(leftRow?.won ?? leftRow?.wins ?? 0);
    const rightWins = Number(rightRow?.won ?? rightRow?.wins ?? 0);
    const leftLosses = Number(leftRow?.lost ?? leftRow?.losses ?? 0);
    const rightLosses = Number(rightRow?.lost ?? rightRow?.losses ?? 0);
    const leftPct = leftWins / Math.max(1, leftWins + leftLosses);
    const rightPct = rightWins / Math.max(1, rightWins + rightLosses);
    const leftTitle = String(leftRow?.note ?? '').toLowerCase().includes('champion') ? 1 : 0;
    const rightTitle = String(rightRow?.note ?? '').toLowerCase().includes('champion') ? 1 : 0;
    return rightTitle - leftTitle
      || Number(rightRow?.playoffRoundsWon ?? -1) - Number(leftRow?.playoffRoundsWon ?? -1)
      || rightPct - leftPct
      || rightWins - leftWins
      || leftTid - rightTid;
  });
}

export function seedDomesticTournamentParticipants(
  specs: CompetitionSpec[],
  teams: NonNBATeam[],
  season: number,
  existing: ParticipantMap,
): ParticipantMap {
  const next = { ...existing };
  for (const spec of specs) {
    if (!spec.domesticParentId || !spec.qualificationRule || next[spec.id]?.length) continue;
    const parentTids = unique(next[spec.domesticParentId] ?? []);
    if (parentTids.length < 2) continue;
    const ranked = rankHistoricalDomesticTeams(teams, parentTids, season);
    next[spec.id] = ranked.slice(0, Math.min(spec.teamCount ?? ranked.length, ranked.length));
  }
  return next;
}

export function selectNextDomesticTournamentParticipants(
  specs: CompetitionSpec[],
  resolutions: CompetitionSeasonResolution[],
  current: ParticipantMap,
): ParticipantMap {
  const next = { ...current };
  const byId = new Map(resolutions.map(result => [result.competitionId, result]));
  for (const spec of specs) {
    if (!spec.domesticParentId || !spec.qualificationRule) continue;
    const parent = byId.get(spec.domesticParentId);
    if (!parent) continue;
    const target = Math.min(spec.teamCount ?? parent.standings.length, parent.standings.length);
    if (spec.qualificationRule === 'domestic-standings') {
      next[spec.id] = parent.standings.slice(0, target).map(row => row.tid);
      continue;
    }
    const cup = specs
      .filter(candidate => candidate.domesticParentId === spec.domesticParentId && candidate.qualificationRule === 'domestic-standings')
      .map(candidate => byId.get(candidate.id))
      .find((result): result is CompetitionSeasonResolution => !!result?.championTid);
    next[spec.id] = unique([
      parent.championTid,
      cup?.championTid,
      parent.runnerUpTid,
      cup?.runnerUpTid,
      ...parent.standings.map(row => row.tid),
    ]).slice(0, target);
  }
  return next;
}
