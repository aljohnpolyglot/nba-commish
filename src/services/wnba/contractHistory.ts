import type { NBATeam, NBAPlayer } from '../../types';
import { normalizePlayerName } from '../../data/realPlayerDataFetcher';
import { getTeamFullName } from '../../utils/teamNames';

type RawRecord = Record<string, unknown>;

const nameKeys = (value: unknown): string[] => {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const keys = new Set([normalizePlayerName(raw)]);
  const withoutNickname = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (withoutNickname) keys.add(normalizePlayerName(withoutNickname));
  const nickname = raw.match(/\(([^)]+)\)/)?.[1]?.trim();
  const surname = withoutNickname.split(/\s+/).at(-1);
  if (nickname && surname) keys.add(normalizePlayerName(`${nickname} ${surname}`));
  return [...keys].filter(Boolean);
};

const teamKeys = (team: NBATeam): string[] => [
  getTeamFullName(team),
  team.name,
  team.abbrev,
].flatMap(nameKeys);

const playerMatchScore = (player: NBAPlayer): number =>
  (player.tid >= 0 ? 10_000 : 0)
  + (player.stats?.length ?? 0) * 10
  + (Number(player.draft?.round) > 0 ? 1 : 0);

const uniqueBestPlayer = (players: NBAPlayer[]): NBAPlayer | undefined => {
  const ranked = [...players].sort((left, right) => playerMatchScore(right) - playerMatchScore(left));
  if (!ranked[0]) return undefined;
  if (ranked[1] && playerMatchScore(ranked[0]) === playerMatchScore(ranked[1])) return undefined;
  return ranked[0];
};

const sourceOption = (row: RawRecord): string | undefined => {
  const value = `${String(row.type ?? '')} ${String(row.status ?? '')} ${String(row.condition ?? '')}`.toLowerCase();
  if (value.includes('team option') || value.includes('team_option')) return 'Team';
  if (value.includes('developmental')) return 'Developmental';
  return undefined;
};

export function applyWnbaContractHistory(
  players: NBAPlayer[],
  teams: NBATeam[],
  source: unknown,
  cutoffYear: number,
): NBAPlayer[] {
  const root = source && typeof source === 'object' ? source as RawRecord : {};
  const merged = root.merged && typeof root.merged === 'object' ? root.merged as RawRecord : {};
  const records = Array.isArray(merged.salaryRecords) ? merged.salaryRecords as RawRecord[] : [];
  if (records.length === 0) return players;

  const teamsByKey = new Map<string, NBATeam>();
  for (const team of teams) {
    for (const key of teamKeys(team)) if (!teamsByKey.has(key)) teamsByKey.set(key, team);
  }

  const playersByKey = new Map<string, NBAPlayer[]>();
  for (const player of players) {
    for (const key of nameKeys(player.name)) {
      const matches = playersByKey.get(key) ?? [];
      if (!matches.includes(player)) matches.push(player);
      playersByKey.set(key, matches);
    }
  }

  type SalaryRow = NonNullable<NBAPlayer['salaries']>[number];
  const sourceRowsByPlayer = new Map<string, Map<string, SalaryRow>>();
  const seenSourceRows = new Set<string>();
  for (const raw of records) {
    const season = Number(raw.contractYear);
    const salary = Number(raw.salary);
    if (!Number.isInteger(season) || season > cutoffYear || !(salary > 0)) continue;
    const playerMatches = nameKeys(raw.playerName).flatMap(key => playersByKey.get(key) ?? []);
    const player = uniqueBestPlayer([...new Set(playerMatches)]);
    const team = nameKeys(raw.teamName).map(key => teamsByKey.get(key)).find(Boolean);
    if (!player || !team) continue;

    const sourceIdentity = [
      player.internalId,
      season,
      team.id,
      salary,
      String(raw.type ?? ''),
      String(raw.status ?? ''),
      String(raw.condition ?? ''),
    ].join('|');
    if (seenSourceRows.has(sourceIdentity)) continue;
    seenSourceRows.add(sourceIdentity);

    const bySeasonTeam = sourceRowsByPlayer.get(player.internalId) ?? new Map<string, SalaryRow>();
    const key = `${season}|${team.id}`;
    const previous = bySeasonTeam.get(key);
    const option = sourceOption(raw) ?? previous?.option;
    bySeasonTeam.set(key, {
      season,
      amount: (previous?.amount ?? 0) + salary / 1_000,
      tid: team.id,
      teamAbbrev: team.abbrev,
      league: 'WNBA',
      type: String(raw.type ?? previous?.type ?? ''),
      ...(option ? { option } : {}),
    });
    sourceRowsByPlayer.set(player.internalId, bySeasonTeam);
  }

  return players.map(player => {
    const sourceRows = [...(sourceRowsByPlayer.get(player.internalId)?.values() ?? [])];
    if (sourceRows.length === 0) return player;
    const existing = new Map((player.salaries ?? []).map(row => [
      `${row.season}|${row.tid ?? -1}`,
      row,
    ]));
    for (const row of sourceRows) {
      const key = `${row.season}|${row.tid ?? -1}`;
      if (!existing.has(key)) existing.set(key, row);
    }
    return {
      ...player,
      salaries: [...existing.values()].sort((left, right) =>
        left.season - right.season || Number(left.tid ?? -1) - Number(right.tid ?? -1)),
    };
  });
}
