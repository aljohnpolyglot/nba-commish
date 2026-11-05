import type { InternationalTournamentKind } from './types';

const FIBA_MAIN_TABS = new Set(['Standings', 'Leaders', 'Games', 'Stats', 'Teams', 'Players']);

export function parseFibaNavigationHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const tab = params.get('fibaTab');
  return {
    currentView: params.get('fiba') === 'tournament' ? 'tournament' as const : 'portal' as const,
    mainTab: tab && FIBA_MAIN_TABS.has(tab) ? tab : 'Players',
    standingsTab: params.get('fibaStandings') || 'Standings',
    gamesTab: params.get('fibaGames') || 'First Round',
    selectedTeamCode: params.get('fibaTeam'),
  };
}

export function isInternationalCompetitionId(value: unknown): boolean {
  const id = String(value ?? '').trim().toLowerCase();
  return id === 'fiba-national-team'
    || id.startsWith('fiba-world-cup')
    || id.startsWith('olympics-men')
    || id.startsWith('fiba-eurobasket');
}

export function getInternationalCompetitionLabel(value: unknown): { tag: string; title: string } | null {
  const id = String(value ?? '').trim().toLowerCase();
  if (id.startsWith('fiba-world-cup')) return { tag: 'FIBA WC', title: 'FIBA World Cup' };
  if (id.startsWith('olympics-men')) return { tag: 'OLY', title: "Men's Olympic Basketball" };
  if (id.startsWith('fiba-eurobasket')) return { tag: 'EURO', title: 'FIBA EuroBasket' };
  if (id === 'fiba-national-team') return { tag: 'FIBA', title: 'International Basketball' };
  return null;
}

export function internationalTournamentCompetitionId(
  kind: InternationalTournamentKind,
  year: number,
): string {
  if (kind === 'world-cup') return `fiba-world-cup-${year}`;
  if (kind === 'olympics-men') return `olympics-men-${year}`;
  return `fiba-eurobasket-${year}`;
}

export function internationalTournamentTitle(kind: InternationalTournamentKind): string {
  if (kind === 'world-cup') return 'FIBA Basketball World Cup';
  if (kind === 'olympics-men') return "Men's Olympic Basketball";
  return 'FIBA EuroBasket';
}
