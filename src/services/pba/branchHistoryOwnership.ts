import type { GameState, HistoricalAward, NBAPlayer } from '../../types';

type PbaBranchState = Pick<
  GameState,
  'pbaSeasonKey' | 'pbaStartDate' | 'historicalPba' | 'leagueStats'
>;

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/gi, ' ')
  .trim()
  .toLowerCase();

const isPbaAward = (award: Partial<HistoricalAward>): boolean => {
  const competitionId = String(award.competitionId ?? '').toLowerCase();
  return award.uiMode === 'pba_isolated'
    || competitionId === 'pba'
    || competitionId.startsWith('pba-');
};

const isBranchAward = (award: Partial<HistoricalAward>): boolean =>
  isPbaAward(award) && normalize(award.source) === 'pba';

const pbaConferenceOrder = (value: unknown): number | undefined => {
  const key = normalize(value);
  if (key.includes('philippine') || key.includes('all filipino') || key.includes('all philippine')) return 0;
  if (key.includes('commissioner')) return 1;
  if (key.includes('governor')) return 2;
  return undefined;
};

const awardConferenceOrder = (award: Partial<HistoricalAward>): number | undefined =>
  pbaConferenceOrder(award.competitionId) ?? pbaConferenceOrder(award.conference) ?? pbaConferenceOrder(award.source);

export function isPbaSourceAwardAvailableAtBranch(
  award: Partial<HistoricalAward>,
  state: PbaBranchState,
): boolean {
  if (!isPbaAward(award) || isBranchAward(award)) return true;
  const branchSeason = getPbaBranchStartSeason(state);
  const awardSeason = Number(award.season);
  if (awardSeason < branchSeason) return true;
  if (awardSeason > branchSeason) return false;
  const startOrder = pbaConferenceOrder(state.leagueStats?.pbaConference);
  const conferenceOrder = awardConferenceOrder(award);
  return startOrder !== undefined && conferenceOrder !== undefined && conferenceOrder < startOrder;
}

const playerBelongsToPbaHistory = (player: NBAPlayer): boolean =>
  !!player.historicalPbaSource
  || player.status === 'PBA'
  || (Number(player.tid) >= 2000 && Number(player.tid) < 3000)
  || (player.stats ?? []).some(stat => {
    const competitionId = String(stat.competitionId ?? '').toLowerCase();
    return competitionId === 'pba' || competitionId.startsWith('pba-');
  });

const awardIdentity = (season: unknown, type: unknown, playerId: unknown, name: unknown): string =>
  `${Number(season)}|${normalize(type)}|${String(playerId ?? '')}|${normalize(name)}`;

export function getPbaBranchStartSeason(state: PbaBranchState): number {
  const explicit = Number(state.pbaSeasonKey);
  if (Number.isInteger(explicit)) return explicit;
  const startYear = Number(state.historicalPba?.startYear);
  if (Number.isInteger(startYear)) return startYear + 1;
  return Number(state.leagueStats?.year ?? new Date().getFullYear());
}

export function enforcePbaBranchHistoryOwnership(
  players: NBAPlayer[],
  historicalAwards: HistoricalAward[],
  state: PbaBranchState,
): { players: NBAPlayer[]; historicalAwards: HistoricalAward[] } {
  const branchStartSeason = getPbaBranchStartSeason(state);
  const removedSourceAwards = historicalAwards.filter(award =>
    isPbaAward(award)
    && !isBranchAward(award)
    && !isPbaSourceAwardAvailableAtBranch(award, state)
  );
  const scopedAwards = historicalAwards.filter(award =>
    !isPbaAward(award)
    || isBranchAward(award)
    || isPbaSourceAwardAvailableAtBranch(award, state)
  );
  const branchPlayerAwards = new Set(
    scopedAwards
      .filter(award => isBranchAward(award) && Number(award.season) >= branchStartSeason)
      .flatMap(award => [
        awardIdentity(award.season, award.type, award.pid, award.name),
        awardIdentity(award.season, award.type, '', award.name),
      ]),
  );
  const removedPlayerAwards = new Set(
    removedSourceAwards.flatMap(award => [
      awardIdentity(award.season, award.type, award.pid, award.name),
      awardIdentity(award.season, award.type, '', award.name),
    ]),
  );
  const nextPlayers = players.map(player => {
    if (!playerBelongsToPbaHistory(player)) return player;
    const awards = (player.awards ?? []).filter(award => {
      if (Number(award.season) < branchStartSeason) return true;
      const explicitCompetition = String(award.competitionId ?? '').toLowerCase();
      if (explicitCompetition && explicitCompetition !== 'pba' && !explicitCompetition.startsWith('pba-')) return true;
      const keyed = awardIdentity(award.season, award.type, player.internalId, player.name);
      const byName = awardIdentity(award.season, award.type, '', player.name);
      if (branchPlayerAwards.has(keyed) || branchPlayerAwards.has(byName)) return true;
      if (award.source === 'historical-pba') {
        return isPbaSourceAwardAvailableAtBranch({
          ...award,
          name: player.name,
          pid: player.internalId,
          uiMode: 'pba_isolated',
        }, state);
      }
      return !removedPlayerAwards.has(keyed) && !removedPlayerAwards.has(byName);
    });
    return awards.length === (player.awards ?? []).length ? player : { ...player, awards };
  });
  return { players: nextPlayers, historicalAwards: scopedAwards };
}
