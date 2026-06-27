import rawPbaRosterData from '../../data/pba_full_roster_data.json';

type PbaRosterEntry = {
  roster?: Array<{ name?: string; image?: string }>;
};

const normalizeName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const exactPortraits = new Map<string, string>();
const lastNamePortraits = new Map<string, string | null>();

for (const team of rawPbaRosterData as PbaRosterEntry[]) {
  for (const player of team.roster ?? []) {
    const name = String(player.name ?? '').trim();
    const image = String(player.image ?? '').trim();
    if (!name || !image) continue;
    exactPortraits.set(normalizeName(name), image);

    const lastName = normalizeName(name.split(/\s+/).at(-1) ?? '');
    if (!lastName) continue;
    if (lastNamePortraits.has(lastName)) lastNamePortraits.set(lastName, null);
    else lastNamePortraits.set(lastName, image);
  }
}

export function getPbaRosterPortrait(playerName: string | undefined): string | undefined {
  const name = String(playerName ?? '').trim();
  if (!name) return undefined;
  const exact = exactPortraits.get(normalizeName(name));
  if (exact) return exact;

  const lastName = normalizeName(name.split(/\s+/).at(-1) ?? '');
  return lastNamePortraits.get(lastName) ?? undefined;
}
