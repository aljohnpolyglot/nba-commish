import type { NBAPlayer } from '../../../types';

const hasPbaStat = (player: NBAPlayer): boolean => (player.stats ?? []).some(stat => {
  const competitionId = String(stat.competitionId ?? '').toLowerCase();
  return (Number(stat.tid) >= 2000 && Number(stat.tid) < 3000)
    || competitionId === 'pba'
    || competitionId.startsWith('pba-');
});

export function isPlayerInPbaBioScope(player: NBAPlayer, pbaTeamIds: ReadonlySet<unknown>): boolean {
  const raw = player as NBAPlayer & {
    pbaLocalEligible?: boolean;
    historicalPbaDraftProspect?: boolean;
    pbaImportContract?: unknown;
    pbaImportHistory?: unknown[];
  };
  return pbaTeamIds.has(Number(player.tid))
    || player.status === 'PBA'
    || raw.pbaLocalEligible === true
    || raw.historicalPbaDraftProspect === true
    || Boolean(player.historicalPbaSource)
    || Boolean(raw.pbaImportContract)
    || Boolean(raw.pbaImportHistory?.length)
    || String(player.internalId ?? '').startsWith('pba-draft-source:')
    || hasPbaStat(player);
}

export function getPbaPlayerBioLeagueBucket(player: NBAPlayer): 'PBA' | 'Free Agents' | 'Retired' {
  if (player.status === 'Retired') return 'Retired';
  if (player.tid === -1 || player.status === 'Free Agent') return 'Free Agents';
  return 'PBA';
}

export function getPbaNationalityFallback(player: NBAPlayer): string | undefined {
  const raw = player as NBAPlayer & { pbaLocalEligible?: boolean };
  if (player.historicalPbaSource?.importTagged === true || raw.pbaLocalEligible === false) return undefined;
  return raw.pbaLocalEligible === true || player.historicalPbaSource?.importTagged === false
    ? 'Philippines'
    : undefined;
}
