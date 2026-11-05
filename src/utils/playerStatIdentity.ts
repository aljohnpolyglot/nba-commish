type PlayerStatIdentityInput = {
  season?: unknown;
  tid?: unknown;
  playoffs?: unknown;
  competitionId?: unknown;
  abbrev?: unknown;
  teamAbbrev?: unknown;
  tm?: unknown;
  TM?: unknown;
};

export function getPlayerStatTeamIdentity(row: PlayerStatIdentityInput): string {
  const abbrev = String(row.abbrev ?? row.teamAbbrev ?? row.tm ?? row.TM ?? '').trim().toUpperCase();
  if (abbrev) return `abbrev:${abbrev}`;
  const tid = Number(row.tid);
  return Number.isFinite(tid) ? `tid:${tid}` : 'team:unknown';
}

export function getPlayerStatIdentityKey(row: PlayerStatIdentityInput): string {
  return [
    Number(row.season ?? 0),
    getPlayerStatTeamIdentity(row),
    row.playoffs ? 1 : 0,
    String(row.competitionId ?? '').trim().toLowerCase(),
  ].join('|');
}
