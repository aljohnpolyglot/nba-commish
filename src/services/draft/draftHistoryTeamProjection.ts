import type { NBAPlayer, NBATeam, NonNBATeam } from '../../types';

type DraftHistoryTeam = NBATeam | NonNBATeam;

type DraftHistorySlotCandidate = NBAPlayer & {
  _saveResident?: boolean;
  _sourceHistorical?: boolean;
};

const teamId = (team: DraftHistoryTeam): number => Number('id' in team ? team.id : team.tid);

const isNumericSentinel = (value: unknown): boolean => /^-?\d+$/.test(String(value ?? '').trim());

export function isDraftHistoryTeam(team: DraftHistoryTeam | null | undefined): team is DraftHistoryTeam {
  if (!team) return false;
  const id = teamId(team);
  const abbrev = String(team.abbrev ?? '').trim();
  const name = String(team.name ?? '').trim();
  const region = String(team.region ?? '').trim();
  return Number.isInteger(id)
    && id >= 0
    && Boolean(abbrev)
    && !isNumericSentinel(abbrev)
    && !isNumericSentinel(name)
    && !isNumericSentinel(region)
    && Boolean(name || region)
    && String((team as NBATeam).conference ?? '').trim().toLowerCase() !== 'all-star';
}

export function resolveDraftHistoryTeam(
  rawTid: unknown,
  teams: NBATeam[],
  nonNBATeams: NonNBATeam[],
): DraftHistoryTeam | null {
  const tid = Number(rawTid);
  if (!Number.isInteger(tid) || tid < 0) return null;
  const team = tid >= 100
    ? nonNBATeams.find(candidate => Number(candidate.tid) === tid)
    : teams.find(candidate => Number(candidate.id) === tid);
  return isDraftHistoryTeam(team) ? team : null;
}

const candidateAuthority = (candidate: DraftHistorySlotCandidate): number => {
  if (candidate._saveResident === true) return 2;
  if (candidate._sourceHistorical !== true) return 1;
  return 0;
};

export function chooseDraftHistorySlotCandidate<T extends DraftHistorySlotCandidate>(
  existing: T | undefined,
  candidate: T,
): T {
  if (!existing) return candidate;
  const existingAuthority = candidateAuthority(existing);
  const candidateAuthorityValue = candidateAuthority(candidate);
  if (candidateAuthorityValue !== existingAuthority) {
    return candidateAuthorityValue > existingAuthority ? candidate : existing;
  }
  return Number(candidate.overallRating ?? 0) > Number(existing.overallRating ?? 0)
    ? candidate
    : existing;
}
