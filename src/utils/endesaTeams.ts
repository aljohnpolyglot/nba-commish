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

function rawEndesaTid(team: EndesaTeamLike): number | null {
  const tid = team.tid ?? team.id;
  if (typeof tid !== 'number') return null;
  if (tid >= 5000 && tid < 6000) return tid - 5000;
  if (tid >= 0 && tid < 100) return tid;
  return null;
}

export function getEndesaOfficialAbbrev(team: EndesaTeamLike): string | null {
  const rawTid = rawEndesaTid(team);
  const label = fold(`${team.region ?? ''} ${team.name ?? ''} ${team.abbrev ?? ''}`);

  if (rawTid === 2 || label.includes('girona')) return 'GIR';
  if (rawTid === 1 || label.includes('baskonia') || label.includes('saski')) return 'BKN';

  return null;
}

export function normalizeEndesaTeam<T extends EndesaTeamLike>(team: T): T {
  const tid = team.tid ?? team.id;
  const isEndesa = team.league === 'Endesa' || (typeof tid === 'number' && tid >= 5000 && tid < 6000);
  if (!isEndesa) return team;
  const abbrev = getEndesaOfficialAbbrev(team);
  return abbrev && team.abbrev !== abbrev ? { ...team, abbrev } : team;
}
