import type { CompetitionAwardKind } from '../../services/competition/types';

const BASE = '/img/awards/custom';

const nbaAssets: Record<string, string> = {
  mvp: 'mvp',
  dpoy: 'defensive-player',
  roty: 'rookie',
  smoy: 'sixth-man',
  clutch: 'clutch-player',
  mip: 'most-improved',
  coy: 'coach',
  allNBA: 'all-team',
  ibm: 'ibm-award',
  comeback: 'comeback-player',
  ironman: 'ironman-award',
  sidekick: 'sidekick-award',
  young: 'young-player',
  playoffMvp: 'playoff-mvp',
  lvp: 'most-improved',
  performance: 'playoff-mvp',
  consistency: 'ironman-award',
  sharpshooter: 'top-scorer',
  twoWay: 'defensive-player',
};

const euroAssets: Partial<Record<CompetitionAwardKind, string>> = {
  mvp: 'mvp',
  defender: 'defensive-player',
  sixthMan: 'sixth-man',
  mostImproved: 'most-improved',
  youngPlayer: 'best-young-player',
  topScorer: 'top-scorer',
  assistLeader: 'assist-leader',
  offensivePlayer: 'offensive-player',
  efficiencyPlayer: 'efficiency-player',
  spectacularPlayer: 'spectacular-player',
  popularPlayer: 'popular-player',
  coach: 'coach',
  allLeague: 'all-team',
};

const pbaAssets: Record<string, string> = {
  mvp: 'mvp',
  bpc: 'best-player-conference',
  bestImport: 'best-import',
  roy: 'rookie',
  mip: 'most-improved',
  coy: 'coach',
  dpoy: 'defensive-player',
  mqm: 'quality-minutes',
  allPBA: 'all-team',
};

const asset = (name?: string): string => `${BASE}/${name ?? 'all-team'}.png`;

export const nbaAwardRaceTrophy = (tab: string): string => asset(nbaAssets[tab]);
export const euroAwardRaceTrophy = (kind: CompetitionAwardKind): string => asset(euroAssets[kind]);
export const pbaAwardRaceTrophy = (tab: string): string => asset(pbaAssets[tab]);

export const playerAwardFallbackTrophy = (awardType: string): string => {
  const type = awardType.toLowerCase();
  if (type.includes('clutch')) return asset('clutch-player');
  if (type.includes('ibm')) return asset('ibm-award');
  if (type.includes('comeback')) return asset('comeback-player');
  if (type.includes('ironman')) return asset('ironman-award');
  if (type.includes('sidekick')) return asset('sidekick-award');
  if (type.includes('least valuable')) return asset('most-improved');
  if (type.includes('performance of the year')) return asset('playoff-mvp');
  if (type.includes('consistency')) return asset('ironman-award');
  if (type.includes('sharpshooter')) return asset('top-scorer');
  if (type.includes('two-way player')) return asset('defensive-player');
  if (type.includes('best import')) return asset('best-import');
  if (type.includes('quality minutes')) return asset('quality-minutes');
  if (type.includes('defensive') || type.includes('defender')) return asset('defensive-player');
  if (type.includes('rookie') || type.includes('rising star')) return asset('rookie');
  if (type.includes('sixth')) return asset('sixth-man');
  if (type.includes('improved')) return asset('most-improved');
  if (type.includes('coach')) return asset('coach');
  if (type.includes('young')) return asset('best-young-player');
  if (type.includes('rebound')) return asset('rebound-leader');
  if (type.includes('assist')) return asset('assist-leader');
  if (type.includes('scor') || type.includes('points leader')) return asset('top-scorer');
  if (type.includes('pir')) return asset('pir-leader');
  if (type.includes('efficiency')) return asset('efficiency-player');
  if (type.includes('spectacular')) return asset('spectacular-player');
  if (type.includes('popular') || type.includes('fan')) return asset('popular-player');
  if (type.includes('offensive')) return asset('offensive-player');
  if (type.includes('all-') || type.includes('all league') || type.includes('mythical')) return asset('all-team');
  if (type.includes('playoff mvp')) return asset('playoff-mvp');
  return asset('mvp');
};
