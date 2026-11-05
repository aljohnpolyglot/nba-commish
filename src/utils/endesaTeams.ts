type EndesaTeamLike = {
  tid?: number;
  id?: number;
  league?: string;
  region?: string;
  name?: string;
  abbrev?: string;
};

const fold = (value: string | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function getEndesaOfficialAbbrev(team: EndesaTeamLike): string | null {
  const label = fold(`${team.region ?? ''} ${team.name ?? ''} ${team.abbrev ?? ''}`);
  if (label.includes('baskonia') || label.includes('saski')) return 'BAS';
  const sourceAbbrev = String(team.abbrev ?? '').trim().toUpperCase();
  if (sourceAbbrev) return sourceAbbrev;
  if (label.includes('girona')) return 'GIR';
  return null;
}

export function normalizeEndesaTeam<T extends EndesaTeamLike>(team: T): T {
  const tid = team.tid ?? team.id;
  const isEndesa = team.league === 'Endesa' || (typeof tid === 'number' && tid >= 5000 && tid < 6000);
  if (!isEndesa) return team;
  const abbrev = getEndesaOfficialAbbrev(team);
  return abbrev && team.abbrev !== abbrev ? { ...team, abbrev } : team;
}
