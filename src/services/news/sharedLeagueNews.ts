import type { NewsItem } from '../../components/news/types';
import type { GameState } from '../../types';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { renderNewsTemplate } from './NewsGenerator';
import { compactNewsText, displayNewsDate } from './europeNews';

function activeTeam(state: GameState, tid: number, season: number) {
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  if (!team) return null;
  return {
    team,
    name: getTeamFullName(team),
    logoUrl: getResolvedTeamLogoUrl(team, season) || undefined,
  };
}

function teamArticleMetadata(tid: number) {
  return {
    teamIds: [tid],
    scope: 'league' as const,
  };
}

export function buildSharedLeagueArticles(state: GameState, season: number): NewsItem[] {
  const activeTeams = state.leagueStats.uiMode === 'pba_isolated'
    ? (state.nonNBATeams ?? []).filter(team => team.league === 'PBA')
    : state.teams;
  const activeTids = new Set(activeTeams.map(team => Number('tid' in team ? team.tid : team.id)));
  return (state.history ?? []).slice(-180).flatMap((entry, index) => {
    if (typeof entry === 'string' || entry.type !== 'Personnel') return [];
    const tid = Number(entry.tid);
    if (!Number.isFinite(tid) || !activeTids.has(tid)) return [];
    const resolvedTeam = activeTeam(state, tid, season);
    if (!resolvedTeam) return [];
    const text = compactNewsText(entry.text);
    const id = `shared-league-people-${compactNewsText(entry.date)}-${index}-${text.slice(0, 36)}`;
    const extension = text.match(/^(.+?) signed a (\d+)-year extension with (?:the )?.+?(?: as (.+?))?\.?$/i);
    const hire = text.match(/^.+? hired (.+?) as (.+?)\.?$/i);
    const rendered = extension
      ? renderNewsTemplate('league_contract_extension', {
          personName: extension[1],
          years: extension[2],
          teamName: resolvedTeam.name,
          roleClause: extension[3] ? ` as ${extension[3].replace(/\.$/, '')}` : '',
        }, { seed: id })
      : hire
        ? renderNewsTemplate('league_coaching_change', {
            teamName: resolvedTeam.name,
            coachName: hire[1],
            roleName: hire[2].replace(/\.$/, ''),
          }, { seed: id })
        : null;
    if (!rendered) return [];
    return [{
      id,
      category: 'League News',
      date: displayNewsDate(compactNewsText(entry.date) || state.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: resolvedTeam.logoUrl,
      impact: 'standard' as const,
      url: '#',
      skipAiExpansion: true,
      ...teamArticleMetadata(tid),
    }];
  });
}
