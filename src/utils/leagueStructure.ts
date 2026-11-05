import type { LeagueStats, NBADiv, NBATeam } from '../types';

export interface LeagueConferenceGroup {
  key: string;
  cid?: number;
  name: string;
  teams: NBATeam[];
}

export function resolveLeagueDivisions(
  teams: readonly NBATeam[],
  configured: readonly NBADiv[] | undefined,
  fallback: readonly NBADiv[] = [],
): NBADiv[] {
  const source = configured?.length ? configured : fallback;
  const activeDivisionIds = new Set(
    teams.map(team => Number(team.did)).filter(Number.isFinite),
  );
  return source.filter(division => activeDivisionIds.has(Number(division.did)));
}

const normalizedConferenceTitle = (value: string): string => {
  const label = value.trim();
  if (/^east$/i.test(label)) return 'Eastern Conference';
  if (/^west$/i.test(label)) return 'Western Conference';
  return label;
};

export function getLeagueConferenceGroups(
  teams: NBATeam[],
  leagueStats: Pick<LeagueStats, 'confs' | 'leagueName'>,
): LeagueConferenceGroup[] {
  const conferenceNames = new Map(
    (leagueStats.confs ?? []).map(conference => [Number(conference.cid), String(conference.name ?? '').trim()]),
  );
  const grouped = new Map<string, { cid?: number; teams: NBATeam[] }>();

  for (const team of teams) {
    const cid = Number(team.cid);
    const hasCid = Number.isFinite(cid);
    const label = String(team.conference ?? '').trim();
    const key = hasCid ? `cid:${cid}` : `label:${label || 'league'}`;
    const current = grouped.get(key) ?? { cid: hasCid ? cid : undefined, teams: [] };
    current.teams.push(team);
    grouped.set(key, current);
  }

  const singleGroup = grouped.size === 1;
  return [...grouped.entries()]
    .map(([key, group]) => {
      const teamLabel = String(group.teams.find(team => String(team.conference ?? '').trim())?.conference ?? '').trim();
      const metadataLabel = group.cid == null ? '' : conferenceNames.get(group.cid) ?? '';
      const generatedLabel = /^Conference \d+$/i.test(teamLabel) ? '' : teamLabel;
      const name = normalizedConferenceTitle(
        metadataLabel
          || (singleGroup ? String(leagueStats.leagueName ?? '').trim() : generatedLabel)
          || generatedLabel
          || (group.cid == null ? 'League' : `Conference ${group.cid + 1}`),
      );
      return { key, cid: group.cid, name, teams: group.teams };
    })
    .sort((a, b) => (a.cid ?? Number.MAX_SAFE_INTEGER) - (b.cid ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
}
