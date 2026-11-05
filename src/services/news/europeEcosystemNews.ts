import { getPlayerImage } from '../../components/central/view/bioCache';
import type { NewsItem } from '../../components/news/types';
import type { GameState } from '../../types';
import { getAgreementLabel } from '../euro/continentalAgreements';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { getTeamCountry } from '../../utils/teamCountry';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { renderNewsTemplate } from './NewsGenerator';
import type { NewsCategory } from './newsTemplates';
import {
  compactNewsText,
  displayNewsDate,
  type EuroNewsTeamOption,
} from './europeNews';

interface TeamDetails {
  tid: number;
  name: string;
  country: string;
  logoUrl?: string;
}

function teamDetails(state: GameState, tid: number | undefined, season: number): TeamDetails | null {
  if (tid == null) return null;
  const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
  if (!team) return null;
  const snapshot = getHistoricalTeamSnapshot(team, season);
  const resolvedTid = Number('tid' in team ? team.tid : team.id);
  if (!Number.isFinite(resolvedTid)) return null;
  return {
    tid: resolvedTid,
    name: getTeamFullName(snapshot),
    country: getTeamCountry(team, state),
    logoUrl: getResolvedTeamLogoUrl(team, season) || undefined,
  };
}

function renderEuro(
  state: GameState,
  category: NewsCategory,
  vars: Record<string, string | number>,
  seed: string,
) {
  return renderNewsTemplate(category, vars, {
    uiMode: state.leagueStats?.uiMode,
    moddedLeagueBase: state.moddedLeagueBase,
    seed,
  });
}

function teamMetadata(...teams: Array<TeamDetails | null>) {
  const present = teams.filter((team): team is TeamDetails => team !== null);
  return {
    teamIds: [...new Set(present.map(team => team.tid))],
    countries: [...new Set(present.map(team => team.country).filter(Boolean))],
  };
}

function buildTransferArticles(state: GameState, season: number): NewsItem[] {
  return (state.transferActivity ?? []).flatMap(activity => {
    const from = teamDetails(state, activity.fromTid, season);
    const to = teamDetails(state, activity.toTid, season);
    const id = `europe-transfer-${activity.id}`;
    const fee = Number(activity.feeEUR);
    const rendered = renderEuro(state, 'euro_transfer_completed', {
      playerName: activity.playerName,
      fromTeam: from?.name ?? 'the selling club',
      toTeam: to?.name ?? 'the buying club',
      feeClause: fee > 0 ? ` for €${fee.toLocaleString('en-US')}` : '',
    }, id);
    if (!rendered) return [];
    const player = state.players.find(candidate => (
      String(candidate.internalId) === String(activity.playerId)
      || candidate.name === activity.playerName
    ));
    return [{
      id,
      category: 'Transaction',
      date: displayNewsDate(activity.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: player ? getPlayerImage(player) : to?.logoUrl,
      impact: 'standard' as const,
      url: '#',
      skipAiExpansion: true,
      ...teamMetadata(from, to),
      scope: 'country' as const,
    }];
  });
}

function buildLoanArticles(state: GameState, season: number): NewsItem[] {
  return (state.loanAgreements ?? []).flatMap(agreement => {
    const parent = teamDetails(state, agreement.parentTid, season);
    const borrower = teamDetails(state, agreement.borrowerTid, season);
    const player = state.players.find(candidate => (
      String(candidate.internalId) === String(agreement.playerId)
    ));
    if (!player) return [];
    const id = `europe-loan-${agreement.id}`;
    const fee = Number(agreement.feeEUR);
    const rendered = renderEuro(state, 'euro_loan_completed', {
      playerName: player.name,
      parentTeam: parent?.name ?? 'the parent club',
      borrowerTeam: borrower?.name ?? 'the borrowing club',
      endDate: displayNewsDate(agreement.endDate),
      feeClause: fee > 0 ? ` for a €${fee.toLocaleString('en-US')} fee` : '',
    }, id);
    if (!rendered) return [];
    return [{
      id,
      category: 'Transaction',
      date: displayNewsDate(agreement.startDate),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: getPlayerImage(player) || borrower?.logoUrl,
      impact: 'standard' as const,
      url: '#',
      skipAiExpansion: true,
      ...teamMetadata(parent, borrower),
      scope: 'country' as const,
    }];
  });
}

function buildAwardArticles(state: GameState, season: number): NewsItem[] {
  const competitionNames = new Map((state.activeCompetitions ?? []).map(spec => [spec.id, spec.displayName]));
  const activeCompetitionIds = new Set(competitionNames.keys());
  return (state.historicalAwards ?? [])
    .filter(award => Number(award.season) === season)
    .filter(award => award.uiMode === 'euro_isolated' || activeCompetitionIds.has(String(award.competitionId)))
    .filter(award => !/^all[- ]/i.test(award.type) && award.type !== 'Champion')
    .slice(-18)
    .flatMap((award, index): NewsItem[] => {
      const team = teamDetails(state, award.tid, season);
      const competitionName = competitionNames.get(String(award.competitionId)) ?? 'European basketball';
      const id = `europe-award-${season}-${compactNewsText(award.competitionId)}-${compactNewsText(award.type)}-${compactNewsText(award.pid ?? award.name)}-${index}`;
      const rendered = renderEuro(state, 'euro_award_winner', {
        winnerName: award.name,
        awardName: award.type,
        competitionName,
        teamClause: team ? ` after representing ${team.name}` : '',
      }, id);
      if (!rendered) return [];
      const player = state.players.find(candidate => (
        String(candidate.internalId) === String(award.pid)
        || candidate.name === award.name
      ));
      return [{
        id,
        category: 'Awards',
        date: displayNewsDate(state.date),
        title: rendered.headline,
        content: rendered.content,
        imageUrl: player ? getPlayerImage(player) : team?.logoUrl,
        impact: /mvp|player of the year/i.test(award.type) ? 'high' : 'standard',
        url: '#',
        skipAiExpansion: true,
        ...teamMetadata(team),
        competitionId: award.competitionId,
        scope: team?.country ? 'country' : 'europe-wide',
      }];
    });
}

function buildChampionArticles(state: GameState, season: number): NewsItem[] {
  return (state.activeCompetitions ?? []).flatMap(spec => {
    const resolution = (state.competitionHistory?.[spec.id] ?? [])
      .find(entry => Number((entry as { season?: number }).season) === season) as {
        championTid?: number;
        runnerUpTid?: number;
        semifinalistTids?: number[];
        date?: string;
      } | undefined;
    if (resolution?.championTid == null) return [];
    const champion = teamDetails(state, resolution.championTid, season);
    const runnerUp = teamDetails(state, resolution.runnerUpTid, season);
    if (!champion) return [];
    const domestic = spec.id.startsWith('domestic-')
      || spec.teamSelector === 'allEndesa'
      || spec.teamSelector.startsWith('league:')
      || Boolean(spec.domesticParentId);
    const id = `europe-champion-${spec.id}-${season}`;
    const rendered = renderEuro(
      state,
      domestic ? 'euro_domestic_champion' : 'euro_continental_champion',
      {
        championTeam: champion.name,
        competitionName: spec.displayName,
        runnerUpClause: runnerUp ? ` against ${runnerUp.name}` : '',
      },
      id,
    );
    if (!rendered) return [];
    const articles: NewsItem[] = [{
      id,
      category: 'League News',
      date: displayNewsDate(resolution.date ?? state.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: champion.logoUrl,
      impact: 'high',
      url: '#',
      skipAiExpansion: true,
      ...teamMetadata(champion, runnerUp),
      competitionId: spec.id,
      scope: domestic ? 'country' : 'europe-wide',
    }];
    const finalFour = [champion.tid, runnerUp?.tid, ...(resolution.semifinalistTids ?? [])]
      .filter((tid): tid is number => tid != null)
      .map(tid => teamDetails(state, tid, season))
      .filter((team): team is TeamDetails => team !== null)
      .filter((team, index, rows) => rows.findIndex(row => row.tid === team.tid) === index);
    if (!domestic && finalFour.length === 4) {
      const finalFourId = `europe-final-four-${spec.id}-${season}`;
      const finalFourCopy = renderEuro(state, 'euro_final_four', {
        competitionName: spec.displayName,
        clubList: finalFour.map(team => team.name).join(', '),
      }, finalFourId);
      if (finalFourCopy) {
        articles.push({
          id: finalFourId,
          category: 'League News',
          date: displayNewsDate(resolution.date ?? state.date),
          title: finalFourCopy.headline,
          content: finalFourCopy.content,
          imageUrl: finalFour[0].logoUrl,
          impact: 'high',
          url: '#',
          skipAiExpansion: true,
          ...teamMetadata(...finalFour),
          competitionId: spec.id,
          scope: 'europe-wide',
        });
      }
    }
    return articles;
  });
}

function buildMovementArticles(state: GameState, teams: EuroNewsTeamOption[]): NewsItem[] {
  return (state.history ?? []).slice(-120).flatMap((entry, index) => {
    if (typeof entry === 'string' || entry.type === 'Academy Promotion') return [];
    const summary = compactNewsText(entry.text);
    const movement = entry.eventType === 'club-promotion' || entry.eventType === 'club-relegation';
    if (!movement && !/(relegated|entered .*top division|left the top division|\bpromot|joined .*top division)/i.test(summary)) return [];
    const matchedTeams = teams.filter(team => team.teamIds.some(tid => entry.teamIds?.includes(tid)));
    if (matchedTeams.length === 0) return [];
    const category: NewsCategory = movement
      ? entry.eventType === 'club-promotion' ? 'euro_promotion' : 'euro_relegation'
      : /(entered|joined|promot)/i.test(summary) ? 'euro_promotion' : 'euro_relegation';
    const id = `europe-movement-${compactNewsText(entry.date)}-${index}-${summary.slice(0, 40)}`;
    const rendered = renderEuro(state, category, { movementSummary: summary }, id);
    if (!rendered) return [];
    return [{
      id,
      category: 'League News',
      date: displayNewsDate(compactNewsText(entry.date) || state.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: matchedTeams[0]?.logoUrl,
      impact: 'high' as const,
      url: '#',
      skipAiExpansion: true,
      teamIds: [...new Set(matchedTeams.flatMap(team => team.teamIds))],
      competitionId: typeof entry.sourceIds?.competitionId === 'string' ? entry.sourceIds.competitionId : undefined,
      countries: [...new Set(matchedTeams.map(team => team.country))],
      scope: 'country' as const,
    }];
  });
}

function buildAgreementArticles(state: GameState, season: number): NewsItem[] {
  const competitionNames = new Map((state.activeCompetitions ?? []).map(spec => [spec.id, spec.displayName]));
  return (state.continentalAgreements ?? []).flatMap(agreement => {
    if (agreement.source !== 'save-review' || agreement.startSeason !== season) return [];
    if (agreement.status === 'terminated' || agreement.status === 'suspended') return [];
    const team = teamDetails(state, agreement.clubId, season);
    if (!team) return [];
    const competitionName = competitionNames.get(agreement.competitionId)
      ?? (agreement.competitionId === 'euroleague' ? 'EuroLeague' : 'EuroCup');
    const qualification = agreement.origin === 'selection' || agreement.origin === 'eurocupChampion';
    const category: NewsCategory = qualification ? 'euro_continental_qualification' : 'euro_license_decision';
    const id = `europe-agreement-${agreement.competitionId}-${agreement.clubId}-${season}`;
    const rendered = renderEuro(state, category, {
      teamName: team.name,
      competitionName,
      season,
      agreementLabel: getAgreementLabel(agreement.agreementType).toLowerCase(),
      qualificationPath: agreement.origin === 'eurocupChampion' ? 'winning EuroCup' : 'the annual club selection',
    }, id);
    if (!rendered) return [];
    return [{
      id,
      category: 'League News',
      date: displayNewsDate(state.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: team.logoUrl,
      impact: 'high' as const,
      url: '#',
      skipAiExpansion: true,
      ...teamMetadata(team),
      competitionId: agreement.competitionId,
      scope: 'europe-wide' as const,
    }];
  });
}

function buildMediaRightsArticles(state: GameState, season: number): NewsItem[] {
  const competitionNames = new Map((state.activeCompetitions ?? []).map(spec => [spec.id, spec.displayName]));
  if (competitionNames.size === 0) return [];
  const pools = new Map<string, { id: string; competitionId: string; totalPoolEUR: number; countries: string[] }>();
  for (const team of [...state.teams, ...(state.nonNBATeams ?? [])]) {
    const receipts = (team as typeof team & {
      tycoon?: { broadcastReceipts?: Array<{ id?: string; year?: number; competitionId?: string; totalPoolEUR?: number }> };
    }).tycoon?.broadcastReceipts ?? [];
    for (const receipt of receipts) {
      if (Number(receipt.year) !== season || !receipt.competitionId || !competitionNames.has(receipt.competitionId)) continue;
      const existing = pools.get(receipt.competitionId);
      const totalPoolEUR = Math.max(Number(receipt.totalPoolEUR ?? 0), existing?.totalPoolEUR ?? 0);
      pools.set(receipt.competitionId, {
        id: compactNewsText(receipt.id) || `euro-media-rights:${receipt.competitionId}:${season}`,
        competitionId: receipt.competitionId,
        totalPoolEUR,
        countries: [...new Set([...(existing?.countries ?? []), getTeamCountry(team, state)].filter(Boolean))],
      });
    }
  }
  return [...pools.values()].flatMap(pool => {
    if (pool.totalPoolEUR <= 0) return [];
    const competitionName = competitionNames.get(pool.competitionId) ?? pool.competitionId;
    const competition = state.activeCompetitions?.find(spec => spec.id === pool.competitionId);
    const domestic = Boolean(competition && (competition.id.startsWith('domestic-')
      || competition.teamSelector === 'allEndesa'
      || competition.teamSelector.startsWith('league:')
      || competition.domesticParentId));
    const id = `europe-media-${pool.id}`;
    const rendered = renderEuro(state, 'euro_media_rights', {
      competitionName,
      season,
      poolAmount: `€${pool.totalPoolEUR.toLocaleString('en-US')}`,
    }, id);
    if (!rendered) return [];
    return [{
      id,
      category: 'League News',
      date: displayNewsDate(state.date),
      title: rendered.headline,
      content: rendered.content,
      impact: 'standard' as const,
      url: '#',
      skipAiExpansion: true,
      competitionId: pool.competitionId,
      countries: pool.countries,
      scope: domestic ? 'country' as const : 'europe-wide' as const,
    }];
  });
}

function buildHistoryPeopleArticles(state: GameState, season: number, teams: EuroNewsTeamOption[]): NewsItem[] {
  const euroTids = new Set(teams.flatMap(team => team.teamIds));
  return (state.history ?? []).slice(-160).flatMap((entry, index) => {
    if (typeof entry === 'string' || entry.tid == null || !euroTids.has(Number(entry.tid))) return [];
    const text = compactNewsText(entry.text);
    const team = teamDetails(state, Number(entry.tid), season);
    if (!team) return [];
    const id = `europe-people-${compactNewsText(entry.date)}-${index}-${text.slice(0, 36)}`;
    if (entry.type === 'Academy Promotion') {
      const playerName = text.match(/^(.+?) was promoted from/i)?.[1];
      if (!playerName) return [];
      const rendered = renderEuro(state, 'euro_academy_promotion', {
        playerName,
        teamName: team.name,
      }, id);
      if (!rendered) return [];
      const player = state.players.find(candidate => candidate.name === playerName);
      return [{
        id,
        category: 'League News',
        date: displayNewsDate(compactNewsText(entry.date) || state.date),
        title: rendered.headline,
        content: rendered.content,
        imageUrl: player ? getPlayerImage(player) : team.logoUrl,
        impact: 'standard' as const,
        url: '#',
        skipAiExpansion: true,
        ...teamMetadata(team),
        scope: 'country' as const,
      }];
    }
    if (entry.type !== 'Personnel') return [];
    const extension = text.match(/^(.+?) signed a (\d+)-year extension with /i);
    const hire = text.match(/^.+? hired (.+?) as (.+?)\.?$/i);
    const category: NewsCategory | null = extension
      ? 'euro_contract_extension'
      : hire
        ? 'euro_coaching_change'
        : null;
    if (!category) return [];
    const rendered = renderEuro(state, category, extension ? {
      personName: extension[1],
      years: extension[2],
      teamName: team.name,
    } : {
      teamName: team.name,
      coachName: hire![1],
      roleName: hire![2].replace(/\.$/, ''),
    }, id);
    if (!rendered) return [];
    return [{
      id,
      category: 'League News',
      date: displayNewsDate(compactNewsText(entry.date) || state.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: team.logoUrl,
      impact: 'standard' as const,
      url: '#',
      skipAiExpansion: true,
      ...teamMetadata(team),
      scope: 'country' as const,
    }];
  });
}

function buildFinanceArticles(state: GameState, season: number): NewsItem[] {
  return (state.news ?? []).flatMap(item => {
    if (!/^euro-(bankruptcy|owner-patience)-/.test(String(item.id))) return [];
    const team = teamDetails(state, item.tid, season);
    if (!team) return [];
    const summary = compactNewsText(item.text ?? item.content);
    if (!summary) return [];
    const rendered = renderEuro(state, 'euro_club_finance', {
      teamName: team.name,
      financeSummary: summary,
    }, item.id);
    if (!rendered) return [];
    return [{
      id: item.id,
      category: 'League News',
      date: displayNewsDate(item.date),
      title: rendered.headline,
      content: rendered.content,
      imageUrl: team.logoUrl,
      impact: 'high' as const,
      url: '#',
      skipAiExpansion: true,
      ...teamMetadata(team),
      scope: 'country' as const,
    }];
  });
}

export function buildEuroEcosystemArticles(
  state: GameState,
  season: number,
  teams: EuroNewsTeamOption[],
): NewsItem[] {
  return [
    ...buildTransferArticles(state, season),
    ...buildLoanArticles(state, season),
    ...buildAwardArticles(state, season),
    ...buildChampionArticles(state, season),
    ...buildMovementArticles(state, teams),
    ...buildAgreementArticles(state, season),
    ...buildMediaRightsArticles(state, season),
    ...buildHistoryPeopleArticles(state, season, teams),
    ...buildFinanceArticles(state, season),
  ].map(article => ({ ...article, league: 'euro', leagueId: 'euro' }));
}
