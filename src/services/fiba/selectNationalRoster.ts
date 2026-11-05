import type {
  FibaCountryPool,
  FibaPoolCandidate,
  FibaRosterRole,
  FibaSelectedPlayer,
  FibaSelectedRoster,
} from './types';

const ROLE_TARGETS: Record<FibaRosterRole, number> = {
  guard: 4,
  forward: 4,
  big: 4,
};

function positionToken(position: string): string {
  return position.toUpperCase().replace(/[^A-Z]/g, '');
}

function primaryRole(candidate: FibaPoolCandidate): FibaRosterRole {
  const pos = positionToken(candidate.position);
  if (pos.includes('C')) return 'big';
  if (pos.includes('G')) return 'guard';
  return 'forward';
}

function canFillRole(candidate: FibaPoolCandidate, role: FibaRosterRole): boolean {
  const pos = positionToken(candidate.position);
  if (role === 'guard') return pos.includes('G');
  if (role === 'big') return pos.includes('C') || pos === 'PF';
  return pos.includes('F') || pos === 'C';
}

function takeBest(
  candidates: readonly FibaPoolCandidate[],
  selectedIds: Set<string>,
  count: number,
  predicate: (candidate: FibaPoolCandidate) => boolean,
): FibaPoolCandidate[] {
  const picked: FibaPoolCandidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    if (selectedIds.has(candidate.id) || !predicate(candidate)) continue;
    selectedIds.add(candidate.id);
    picked.push(candidate);
  }
  return picked;
}

function normalizeJersey(value: string | undefined): string | undefined {
  const raw = String(value ?? '').trim();
  if (raw === '00') return raw;
  if (!/^\d{1,2}$/.test(raw)) return undefined;
  const number = Number(raw);
  return number >= 0 && number <= 99 ? String(number) : undefined;
}

function jerseyCandidates(): string[] {
  return ['0', '00', ...Array.from({ length: 55 }, (_, index) => String(index + 1)), ...Array.from({ length: 44 }, (_, index) => String(index + 56))];
}

function assignJerseys(
  entries: Array<{ candidate: FibaPoolCandidate; rosterRole: FibaRosterRole }>,
): FibaSelectedPlayer[] {
  const used = new Set<string>();
  const available = jerseyCandidates();
  return entries.map(({ candidate, rosterRole }) => {
    const preferred = normalizeJersey(candidate.jerseyNumber);
    const jerseyNumber = preferred && !used.has(preferred)
      ? preferred
      : available.find(number => !used.has(number)) ?? '99';
    used.add(jerseyNumber);
    return { ...candidate, rosterRole, jerseyNumber };
  });
}

export function selectFibaNationalRoster(
  pool: FibaCountryPool,
  minimumPlayablePlayers: number,
): FibaSelectedRoster {
  const sorted = [...pool.candidates].sort(
    (a, b) => b.selectionScore - a.selectionScore || a.name.localeCompare(b.name),
  );
  let naturalizedIncluded = false;
  const eligible = sorted.filter(candidate => {
    if (!candidate.naturalized) return true;
    if (naturalizedIncluded) return false;
    naturalizedIncluded = true;
    return true;
  });
  const selectedIds = new Set<string>();
  const roleEntries: Array<{ candidate: FibaPoolCandidate; rosterRole: FibaRosterRole }> = [];

  for (const role of ['guard', 'forward', 'big'] as const) {
    const primary = takeBest(
      eligible,
      selectedIds,
      ROLE_TARGETS[role],
      candidate => primaryRole(candidate) === role,
    );
    roleEntries.push(...primary.map(candidate => ({ candidate, rosterRole: role })));
  }

  for (const role of ['guard', 'forward', 'big'] as const) {
    const current = roleEntries.filter(entry => entry.rosterRole === role).length;
    const fallback = takeBest(
      eligible,
      selectedIds,
      ROLE_TARGETS[role] - current,
      candidate => canFillRole(candidate, role),
    );
    roleEntries.push(...fallback.map(candidate => ({ candidate, rosterRole: role })));
  }

  const remainingSlots = 12 - roleEntries.length;
  const finalFill = takeBest(eligible, selectedIds, remainingSlots, () => true);
  roleEntries.push(...finalFill.map(candidate => ({ candidate, rosterRole: primaryRole(candidate) })));

  const reserveCandidates = takeBest(eligible, selectedIds, 3, () => true);
  const activePlayers = assignJerseys(roleEntries);
  const reserves = assignJerseys([
    ...activePlayers.map(player => ({ candidate: player, rosterRole: player.rosterRole })),
    ...reserveCandidates.map(candidate => ({ candidate, rosterRole: primaryRole(candidate) })),
  ]).slice(activePlayers.length);

  return {
    country: pool.country,
    teamTid: pool.teamTid,
    abbrev: pool.abbrev,
    imageUrl: pool.imageUrl,
    players: activePlayers,
    reserves,
    cuts: sorted.filter(candidate => !selectedIds.has(candidate.id)),
    isPlayable: activePlayers.length >= minimumPlayablePlayers,
  };
}
