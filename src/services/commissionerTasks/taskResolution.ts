import type {
  BroadcastOffer,
  CommissionerTaskId,
  CommissionerTaskStatus,
  GameState,
} from '../../types';
import {
  autoInductHOFClass,
  autoPickChristmasGames,
  autoPickGlobalGames,
  autoRunDraft,
  autoScheduleIntlPreseason,
  autoSelectDunkContestants,
  autoSelectShootingStarsContestants,
  autoSelectSkillsChallengeContestants,
  autoSelectHorseContestants,
  autoSelectThreePointContestants,
} from '../logic/autoResolvers';
import {
  autoResolveAllStarHosts,
  buildHistoricalAllStarHostsByYear,
  buildHistoricalAllStarHostYears,
  getAllStarHostDecisionYear,
} from '../allStar/hostAutoResolver';
import {
  buildBroadcastOffers,
  getBroadcastAgreementSeasonStart,
  hasHistoricalBroadcastDefault,
  mediaRightsFromOffer,
} from '../../data/historicalBroadcastRights';
import { SettingsManager } from '../SettingsManager';
import { careerWinShares, getHOFTierInfo, isHOFLeagueCareer } from '../playerDevelopment/hofChecker';
import {
  getCommissionerHofClassYear,
  getCommissionerTaskCycleYear,
  updateCommissionerTaskRecord,
} from './taskRegistry';
import { getTeamFullName } from '../../utils/teamNames';
import { getArenaForTeamAtSeason, loadArenas } from '../../utils/arenaData';
import {
  applyCommissionerBoardPaper,
  buildCommissionerBoardPaper,
  buildGovernorsBoardLogoChanges,
  buildGovernorsBoardVenueChanges,
} from './boardPaper';
import { addOccasionalBasketballGuests, fetchHistoricalCelebritySelection, fetchRatedCelebritiesForYear } from '../../data/celebrities';
import { buildAllStarEventSeed } from '../allStar/allStarDeterminism';
import { withDeterministicRandom } from '../simulation/deterministicRandom';
import { fetchAllStarHistory } from '../../data/allStarHistoryFetcher';
import { getBroadcasterDisplayName } from '../../utils/broadcastingUtils';
import { isHistoricalNbaWhatIfTimeline, timelineInputFromState } from '../../utils/historicalTimeline';
import { buildGovernorsBoardMeeting } from '../governorsBoard/governorsBoardMeeting';
import { calculateSocialEngagement, normalizeDate } from '../../utils/helpers';
import { getInsiderHandle } from '../../data/social/handles';
import { isTwitterAvailable } from '../../utils/mediaTimeline';
import {
  autoResolveAllStarInjuryReplacements,
  getOutstandingAllStarInjuries,
} from '../allStar/allStarInjuryReplacements';
import {
  ensureFranchiseLeagueEvents,
  getLeagueEventSponsorOffers,
} from '../franchises/franchiseSponsors';
import { autoResolveExpansionDraft } from '../expansion/autoExpansionDraft';
import { simulateRemainingInternationalTournament } from '../fiba/playTournament';
import { markInternationalTournamentReviewed } from '../fiba/reviewTournament';
import { applyInternationalTournamentPlayerAwards } from '../fiba/applyTournamentPlayerAwards';
import { isCanonicalDraftComplete } from '../lifecycle/leagueSeasonLifecycle';
import { applyDraftLotteryCalendarEvent } from '../lifecycle/calendarEventDisposition';
import type { TargetPlan } from '../simulation/targetPlanner';
import {
  applyPbaOpeningNight,
  getPbaOpeningNightDate,
  getPbaOpeningNightTeams,
} from '../pba/openingNight';
import { loadPbaVenues, pickRecommendedPbaVenue } from '../pba/venues';
import {
  getRecommendedPerformanceArtists,
  loadPerformanceArtists,
} from '../events/performanceArtists';
import { buildPerformanceBookingPatch, type PerformanceBooking } from '../events/performanceBooking';
import { getPerformanceEventNames } from '../events/performanceEvents';

export interface CommissionerTaskResolutionOptions {
  mode: 'manual' | 'auto';
  resolution?: Record<string, unknown>;
  broadcastOffer?: BroadcastOffer;
  leaguePassPrice?: number;
  targetPlan?: TargetPlan;
  commandType?: string;
  deferPresentation?: boolean;
}

const applyPatch = (state: GameState, patch: Partial<GameState>): GameState => ({
  ...state,
  ...patch,
});

const recordStatus = (mode: CommissionerTaskResolutionOptions['mode']): CommissionerTaskStatus =>
  mode === 'auto' ? 'auto_resolved' : 'resolved';

function recommendedLeaguePassPrice(state: GameState): number {
  const currentPrice = state.leagueStats.mediaRights?.lpPriceMonthly
    ?? state.leagueStats.mediaRights?.lpPrice;
  if (
    Number.isFinite(currentPrice)
    && (
      Number(currentPrice) > 0
      || (Number(currentPrice) === 0 && state.leagueStats.leaguePassPriceSetYear != null)
    )
  ) {
    return Number(currentPrice);
  }
  const seasonStart = getBroadcastAgreementSeasonStart(state);
  if (seasonStart < 2000) return 9.95;
  if (seasonStart < 2010) return 14.99;
  if (seasonStart < 2020) return 19.99;
  return 24.99;
}

export function getLeaguePassProjection(state: GameState, price: number) {
  const rights = state.leagueStats.mediaRights;
  const seasonStart = getBroadcastAgreementSeasonStart(state);
  const priorPrice = Math.max(0.01, rights?.lpPriceMonthly ?? rights?.lpPrice ?? recommendedLeaguePassPrice(state));
  const priorRevenue = Math.max(
    0.01,
    rights?.lpRev ?? Math.max(0.01, ((rights?.totalRev ?? 0) - (rights?.mediaRev ?? 0)) * 0.15),
  );
  const eraSubscribers = seasonStart < 2001
    ? 0.15
    : seasonStart < 2006
      ? 1.5
      : seasonStart < 2010
        ? 3
        : seasonStart < 2020
          ? 8
          : 15;
  const impliedSubscribers = priorRevenue * 1_000 / (priorPrice * 12);
  const subscriberBase = Math.min(100, Math.max(eraSubscribers, impliedSubscribers));
  const demand = Math.max(0.4, Math.min(1.6, 1 - ((price - priorPrice) / priorPrice) * 0.5));
  const subscribers = subscriberBase * demand;
  const annualRevenue = price * subscribers * 12 / 1_000;
  return { annualRevenue, subscribers };
}

function historicalBroadcastsEnabled(state: GameState): boolean {
  const seasonStart = getBroadcastAgreementSeasonStart(state);
  const branchStart = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear ?? 9999);
  const historicalNba = state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && branchStart < 2026;
  const historicalAtBranch = historicalNba && seasonStart <= branchStart;
  const historicalSettingEnabled = historicalNba
    ? historicalAtBranch
    : state.leagueStats.historicalBroadcastsEnabled === true;
  return hasHistoricalBroadcastDefault(seasonStart)
    && state.leagueStats.alternateBroadcastHistory !== true
    && historicalSettingEnabled;
}

async function resolveCelebrityRoster(state: GameState): Promise<GameState> {
  const historical = state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && state.leagueStats.year <= 2026
    ? await fetchHistoricalCelebritySelection(state.leagueStats.year)
    : null;
  const poolSource = state.leagueType === 'fictional' ? 'fictional' : 'real';
  const rated = historical ? [] : await fetchRatedCelebritiesForYear(state.leagueStats.year, poolSource);
  const selectedRated = withDeterministicRandom(buildAllStarEventSeed(state, 'allstar-celebrity-roster'), () =>
    addOccasionalBasketballGuests(rated
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 20), state.players, state.leagueStats.year, state.leagueType === 'fictional'));
  const roster = historical?.roster
    ?? selectedRated.map(celebrity => celebrity.name);
  return applyPatch(state, {
    allStar: {
      ...(state.allStar as any),
      celebrityRoster: roster,
      celebrityRosterProfiles: historical ? state.allStar?.celebrityRosterProfiles : selectedRated,
      celebrityTeams: historical?.teamNames ?? ['Team Spotlight', 'Team Prime'],
      celebrityAnnounced: false,
    },
    leagueStats: {
      ...state.leagueStats,
      celebrityRoster: roster,
      hasSetCelebrityRoster: true,
      celebrityRosterAutoSelected: true,
    },
  });
}

function buildBoardMeeting(state: GameState) {
  return state.pendingGovernorsBoardMeeting ?? {
    kind: 'governors-board' as const,
    season: state.leagueStats.year,
    generatedAt: state.date,
    ruleChanges: [],
    teamChanges: [],
    majorUpdates: [],
  };
}

const participantAnnouncementTasks = new Set<CommissionerTaskId>([
  'celebrity_roster',
  'dunk_participants',
  'three_point_participants',
  'shooting_stars_participants',
  'skills_participants',
  'horse_participants',
]);

function commissionerDecisionCopy(
  state: GameState,
  taskId: CommissionerTaskId,
  resolution: Record<string, unknown>,
): { headline: string; content: string } | null {
  if (taskId === 'league_pass_price') {
    return {
      headline: 'League Pass Price Set',
      content: `The league has set League Pass at $${Number(resolution.monthlyPrice ?? 0).toFixed(2)} per month for the upcoming season.`,
    };
  }
  if (taskId === 'all_star_host') {
    return {
      headline: `${resolution.year ?? state.leagueStats.year} All-Star Host Announced`,
      content: `${resolution.city ?? 'The selected host city'} will host All-Star Weekend${resolution.arena ? ` at ${resolution.arena}` : ''}.`,
    };
  }
  if (taskId === 'media_rights_renewal') {
    return {
      headline: 'National Media Agreement Finalized',
      content: `The league has finalized ${resolution.agreementName ?? 'its national media agreement'} for the upcoming broadcast cycle.`,
    };
  }
  return null;
}

function publishCommissionerDecision(
  state: GameState,
  taskId: CommissionerTaskId,
  resolution: Record<string, unknown>,
): GameState {
  if (
    participantAnnouncementTasks.has(taskId)
    || taskId === 'retired_players'
    || taskId === 'staff_retirements'
    || taskId === 'referee_retirements'
  ) {
    return state;
  }
  const cycle = getCommissionerTaskCycleYear(state);
  const newsId = `commissioner-decision-${cycle}-${taskId}`;
  const socialId = `commissioner-insider-${cycle}-${taskId}`;
  const copy = commissionerDecisionCopy(state, taskId, resolution);
  if (!copy) return state;
  const news = state.news.some(item => item.id === newsId)
    ? state.news
    : [{
        id: newsId,
        headline: copy.headline,
        content: copy.content,
        date: state.date,
        type: 'league',
        category: 'league',
        isNew: true,
      }, ...state.news].slice(0, 200);
  if (!isTwitterAvailable(state.date, state.leagueStats.year) || state.socialFeed.some(post => post.id === socialId)) {
    return applyPatch(state, { news });
  }
  const insider = getInsiderHandle(state.leagueType, state.date, state.leagueStats.year, state.leagueStats.uiMode);
  const content = `Sources: ${copy.content}`;
  const engagement = calculateSocialEngagement(insider.atHandle, content);
  return applyPatch(state, {
    news,
    socialFeed: [{
      id: socialId,
      author: insider.name,
      handle: insider.atHandle,
      content,
      date: state.date,
      likes: engagement.likes,
      retweets: engagement.retweets,
      source: 'TwitterX',
      isNew: true,
      verified: true,
    }, ...state.socialFeed],
  });
}

function autoEndorseHall(state: GameState): Partial<GameState> {
  const inductionYear = getCommissionerHofClassYear(state);
  const candidates = getCommissionerHofCandidates(state).slice(0, 5);
  const candidateIds = new Set(candidates.map(candidate => candidate.player.internalId));
  return {
    endorsedPlayers: [...new Set([...(state.endorsedPlayers ?? []), ...candidateIds])],
    players: state.players.map(player => candidateIds.has(player.internalId)
      ? { ...player, scheduledHofInductionYear: inductionYear }
      : player),
  };
}

export function getCommissionerHofCandidates(state: GameState) {
  const inductionYear = getCommissionerHofClassYear(state);
  const threshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  const league = state.leagueStats?.uiMode === 'wnba_isolated' || state.moddedLeagueBase === 'wnba'
    ? 'WNBA'
    : 'NBA';
  return state.players
    .flatMap(player => {
      if (player.hof || player.status !== 'Retired') return [];
      if (!isHOFLeagueCareer(player, league)) return [];
      const tier = getHOFTierInfo(player, threshold);
      if (!tier || tier.eligibleYear > inductionYear) return [];
      return [{
        player,
        yearsUntilEligible: Math.max(0, tier.eligibleYear - inductionYear),
        eligibleYear: tier.eligibleYear,
        careerWS: careerWinShares(player),
        firstBallot: tier.firstBallot,
        tier: tier.tier,
        tierLabel: tier.label,
        waitYears: tier.waitYears,
      }];
    })
    .sort((left, right) => right.careerWS - left.careerWS);
}

function mediaPatch(state: GameState, offer?: BroadcastOffer): Partial<GameState> {
  const offers = buildBroadcastOffers(state);
  const selected = offer
    ?? (historicalBroadcastsEnabled(state)
      ? offers.find(candidate => candidate.historical)
      : [...offers].sort((left, right) =>
          (right.annualValueUSD * (right.reach + right.security + right.growth))
          - (left.annualValueUSD * (left.reach + left.security + left.growth)),
        )[0]);
  if (!selected) return {};
  const acceptedOffer = state.leagueType === 'fictional'
    ? {
        ...selected,
        partners: selected.partnerIds.map(id => getBroadcasterDisplayName(id, true)),
        name: `${selected.partnerIds.map(id => getBroadcasterDisplayName(id, true)).join(' + ')} Package`,
      }
    : selected;
  const mediaRights = mediaRightsFromOffer(state, acceptedOffer);
  if (state.leagueStats.uiMode === 'pba_isolated') {
    return {
      leagueStats: {
        ...state.leagueStats,
        mediaRights: {
          ...mediaRights,
          salaryCap: state.leagueStats.salaryCap / 1_000_000,
        },
      },
    };
  }
  const salaryCap = Math.round(mediaRights.salaryCap * 1_000_000);
  const taxPct = state.leagueStats.luxuryTaxThresholdPercentage ?? 121.5;
  return {
    leagueStats: {
      ...state.leagueStats,
      mediaRights,
      salaryCap,
      luxuryPayroll: Math.round(salaryCap * taxPct / 100),
    },
  };
}

export async function resolveCommissionerTask(
  state: GameState,
  taskId: CommissionerTaskId,
  options: CommissionerTaskResolutionOptions,
): Promise<Partial<GameState>> {
  let next = state;
  let resolution = options.resolution ?? {};
  let performanceBookingIncomplete = false;

  if (taskId === 'draft_lottery' && options.mode === 'auto') {
    next = applyDraftLotteryCalendarEvent(next, {
      eventDate: normalizeDate(next.date),
      targetPlan: options.targetPlan,
      transientAuthorized: true,
      commandType: options.commandType ?? 'COMMISSIONER_TASK',
    }).state;
  } else if (taskId === 'nba_draft' && options.mode === 'auto') {
    next = applyPatch(next, autoRunDraft(next));
  } else if (taskId === 'retired_players' && next.offseasonChecklist) {
    next = applyPatch(next, {
      offseasonChecklist: {
        ...next.offseasonChecklist,
        retiredPlayersReview: 'done',
      },
    });
  } else if (taskId === 'media_rights_renewal') {
    const patch = mediaPatch(next, options.broadcastOffer);
    next = applyPatch(next, patch);
    const rights = (patch.leagueStats ?? next.leagueStats).mediaRights;
    resolution = {
      ...resolution,
      agreementName: rights?.agreementName,
      partners: rights?.activeBroadcasters,
      contractStartSeason: rights?.contractStartSeason,
      contractEndSeason: rights?.contractEndSeason,
      annualValueUSD: Math.round((rights?.mediaRev ?? 0) * 1_000_000_000),
    };
  } else if (taskId === 'governors_proposal') {
    const sourcePaper = buildCommissionerBoardPaper(next);
    await loadArenas();
    const venueChanges = sourcePaper.venueChanges
      ?? buildGovernorsBoardVenueChanges(next.teams, next.leagueStats.year);
    const logoChanges = sourcePaper.logoChanges
      ?? buildGovernorsBoardLogoChanges(next.teams, next.leagueStats.year);
    const reviewBaseline = sourcePaper.proposals.reduce(
      (stats, proposal) => proposal.key in stats
        ? { ...stats, [proposal.key]: proposal.previous }
        : stats,
      next.leagueStats,
    );
    const paper = { ...sourcePaper, venueChanges, logoChanges, reviewBaseline };
    const leagueStats = applyCommissionerBoardPaper(next.leagueStats, paper);
    next = applyPatch(next, {
      leagueStats,
      commissionerBoardPaper: paper,
    });
    resolution = {
      ...resolution,
      acceptedRuleKeys: paper.proposals.filter(proposal => proposal.accepted).map(proposal => proposal.key),
      vetoedRuleKeys: paper.proposals.filter(proposal => !proposal.accepted).map(proposal => proposal.key),
    };
  } else if (taskId === 'league_settings_review') {
    const paper = buildCommissionerBoardPaper(next);
    const baseline = paper.reviewBaseline ?? next.leagueStats;
    const generatedMeeting = buildGovernorsBoardMeeting({
      state: { date: next.date, leagueStats: baseline, teams: next.teams },
      nextLeagueStats: next.leagueStats,
      nextTeams: next.teams,
      season: next.leagueStats.year,
    });
    const meeting = {
      ...(generatedMeeting ?? {
        season: next.leagueStats.year,
        generatedAt: next.date,
        ruleChanges: [],
        teamChanges: [],
        majorUpdates: [],
      }),
      venueChanges: paper.venueChanges ?? generatedMeeting?.venueChanges ?? [],
      logoChanges: paper.logoChanges ?? generatedMeeting?.logoChanges ?? [],
    };
    next = applyPatch(next, {
      commissionerBoardPaper: { ...paper, reviewedAt: next.date },
      pendingGovernorsBoardMeeting: meeting,
    });
    resolution = { ...resolution, reviewedLeagueSettings: true };
  } else if (taskId === 'governors_final') {
    const paper = buildCommissionerBoardPaper(next);
    const signedPaper = {
      ...paper,
      reviewedAt: paper.reviewedAt ?? next.date,
      signedAt: next.date,
      signedBy: next.commissionerName,
    };
    next = applyPatch(next, {
      commissionerBoardPaper: signedPaper,
      pendingGovernorsBoardMeeting: {
        ...buildBoardMeeting(next),
        reviewed: true,
      },
    });
    resolution = { ...resolution, signedBy: state.commissionerName };
  } else if (taskId === 'franchise_event_sponsorships') {
    const season = getCommissionerTaskCycleYear(next);
    const portfolio = ensureFranchiseLeagueEvents(next);
    const deals = options.mode === 'auto'
      ? portfolio.deals.map(deal => {
          const due = deal.brand === 'Unbranded' || deal.endSeason <= next.leagueStats.year;
          return due ? getLeagueEventSponsorOffers(next, deal)[0] ?? deal : deal;
        })
      : portfolio.deals;
    next = applyPatch(next, {
      franchiseLeagueEvents: {
        ...portfolio,
        reviewedSeason: season,
        deals,
      },
    });
    resolution = {
      ...resolution,
      reviewedSeason: season,
      assignedAssets: deals.filter(deal => deal.brand !== 'Unbranded').length,
      annualValueUSD: deals.reduce((sum, deal) =>
        deal.brand === 'Unbranded' ? sum : sum + deal.annualValueUSD,
      0),
    };
  } else if (taskId === 'league_pass_price') {
    const price = options.leaguePassPrice ?? recommendedLeaguePassPrice(next);
    const current = next.leagueStats.mediaRights;
    const projection = getLeaguePassProjection(next, price);
    const previousTotal = Math.max(0.01, current?.totalRev ?? 0.01);
    const totalRev = current
      ? Math.max(0, current.totalRev - (current.lpRev ?? 0) + projection.annualRevenue)
      : projection.annualRevenue;
    const capMultiplier = Math.sqrt(Math.max(0.25, totalRev / previousTotal));
    const salaryCap = Math.round(next.leagueStats.salaryCap * capMultiplier);
    const taxPct = next.leagueStats.luxuryTaxThresholdPercentage ?? 121.5;
    next = applyPatch(next, {
      leagueStats: {
        ...next.leagueStats,
        ...(current ? {
          mediaRights: {
            ...current,
            lpPrice: price,
            lpPriceMonthly: price,
            lpRev: projection.annualRevenue,
            totalRev,
            salaryCap: salaryCap / 1_000_000,
          },
        } : {}),
        salaryCap,
        luxuryPayroll: Math.round(salaryCap * taxPct / 100),
        leaguePassPriceSetYear: next.leagueStats.year,
      },
    });
    resolution = {
      ...resolution,
      monthlyPrice: price,
      projectedSubscribers: projection.subscribers,
      projectedAnnualRevenue: projection.annualRevenue,
    };
  } else if (taskId === 'expansion_bidding') {
    const scheduleYear = next.expansionSchedule?.year;
    if (scheduleYear != null && options.mode === 'auto') {
      const teamAbbrevs = next.expansionSchedule?.teams.map(team => team.abbrev) ?? [];
      next = applyPatch(next, {
        expansionBidDecisions: {
          ...(next.expansionBidDecisions ?? {}),
          [scheduleYear]: {
            status: 'accepted',
            teamAbbrevs,
            decidedAt: next.date,
            acknowledgedAt: next.date,
            league: next.expansionSchedule?.league ?? 'nba',
          },
        },
      });
    }
    resolution = {
      ...resolution,
      applications: next.expansionSchedule?.teams.map(team => team.name) ?? [],
      decision: next.expansionSchedule?.teams.length ? 'accepted-scheduled-field' : resolution.decision ?? 'no-active-window',
    };
  } else if (taskId === 'expansion_draft' && options.mode === 'auto') {
    const draftPatch = autoResolveExpansionDraft(next);
    const pickCount = (draftPatch.players ?? next.players).filter(player =>
      player.transactions?.some(transaction =>
        transaction.type === 'expansion-draft' && transaction.season === next.leagueStats.year
      )
    ).length;
    next = applyPatch(next, draftPatch);
    resolution = { ...resolution, picks: pickCount };
  } else if (taskId === 'nba_cup_host') {
    await loadArenas();
    const requestedHostId = Number(resolution.hostTeamId);
    const host = next.teams.find(team => team.id === requestedHostId)
      ?? [...next.teams].sort((left, right) => (right.strength ?? 0) - (left.strength ?? 0))[0];
    if (host) {
      const arena = getArenaForTeamAtSeason(host, next.leagueStats.year);
      const hosts = [
        ...(next.leagueStats.nbaCupHosts ?? []).filter(entry => entry.year !== next.leagueStats.year),
        {
          year: next.leagueStats.year,
          city: arena?.location || host.region || getTeamFullName(host),
          arena: arena?.name,
          teamId: host.id,
        },
      ];
      next = applyPatch(next, { leagueStats: { ...next.leagueStats, nbaCupHosts: hosts } });
    }
    const arena = host ? getArenaForTeamAtSeason(host, next.leagueStats.year) : null;
    resolution = {
      ...resolution,
      hostTeamId: host?.id,
      hostCity: arena?.location || host?.region,
      hostArena: arena?.name,
      hostTeam: host ? getTeamFullName(host) : undefined,
    };
  } else if (taskId === 'all_star_host') {
    if (next.leagueStats.uiMode === 'pba_isolated') {
      const venue = pickRecommendedPbaVenue(await loadPbaVenues(next.leagueStats.year));
      const hosts = options.mode === 'auto' && venue
        ? [
            ...(next.leagueStats.allStarHosts ?? []).filter(host => host.year !== next.leagueStats.year),
            {
              year: next.leagueStats.year,
              city: venue.city,
              arena: venue.name,
              teamIds: [],
            },
          ].sort((left, right) => left.year - right.year)
        : next.leagueStats.allStarHosts ?? [];
      if (options.mode === 'auto') {
        next = applyPatch(next, { leagueStats: { ...next.leagueStats, allStarHosts: hosts } });
      }
      const host = hosts.find(entry => entry.year === next.leagueStats.year);
      resolution = { ...resolution, year: host?.year, city: host?.city, arena: host?.arena };
    } else {
      const isWnba = next.leagueStats.uiMode === 'wnba_isolated';
      const isNba = !isWnba && next.leagueType === 'modded' && (next.moddedLeagueBase ?? 'nba') === 'nba';
      const historicalTimeline = isHistoricalNbaWhatIfTimeline(timelineInputFromState(next));
      const branchCutoff = Number(
        isWnba
          ? next.wnbaStartYear
          : next.nbaStartYear ?? next.leagueStats.historicalEraStartYear,
      );
      const cutoff = isWnba
        ? Math.max(1998, (Number.isFinite(branchCutoff) ? branchCutoff : next.leagueStats.year) - 1)
        : historicalTimeline && Number.isFinite(branchCutoff)
          ? branchCutoff
          : next.leagueStats.year - 1;
      if (options.mode === 'auto' && (isNba || isWnba)) await loadArenas();
      const hostHistory = options.mode === 'auto' && (isNba || isWnba)
        ? await fetchAllStarHistory(isWnba ? 'wnba' : 'nba')
        : [];
      const historicalHostYears = isNba || isWnba
        ? buildHistoricalAllStarHostYears(hostHistory, next.teams, cutoff)
        : undefined;
      const historicalHostsByYear = isNba || isWnba
        ? new Map(
            [...buildHistoricalAllStarHostsByYear(hostHistory, next.teams)]
              .filter(([year]) => year <= cutoff),
          )
        : undefined;
      const hosts = options.mode === 'auto'
        ? autoResolveAllStarHosts(next.leagueStats, next.teams, {
            historicalHostYears,
            historicalHostsByYear,
          })
        : next.leagueStats.allStarHosts ?? [];
      if (options.mode === 'auto') {
        next = applyPatch(next, { leagueStats: { ...next.leagueStats, allStarHosts: hosts } });
      }
      const host = hosts.find(entry => entry.year === getAllStarHostDecisionYear(next.leagueStats));
      resolution = { ...resolution, year: host?.year, city: host?.city, arena: host?.arena };
    }
  } else if (taskId === 'global_games' && options.mode === 'auto') {
    if (next.leagueStats.uiMode === 'pba_isolated') {
      const teams = getPbaOpeningNightTeams(next)
        .filter(team => team.id >= 0)
        .sort((left, right) =>
          (right.strength ?? 0) - (left.strength ?? 0)
          || getTeamFullName(left).localeCompare(getTeamFullName(right))
        );
      const venue = pickRecommendedPbaVenue(await loadPbaVenues(next.leagueStats.year));
      if (teams.length >= 2 && venue) {
        const openingNight = {
          awayTid: teams[1].id,
          homeTid: teams[0].id,
          date: getPbaOpeningNightDate(next),
          city: venue.city,
          country: 'Philippines',
          venue: venue.name,
        };
        next = applyPatch(next, applyPbaOpeningNight(next, openingNight));
        resolution = {
          ...resolution,
          matchup: [openingNight.awayTid, openingNight.homeTid],
          venue: venue.name,
          city: venue.city,
          date: openingNight.date,
        };
      }
    } else {
      next = applyPatch(next, autoPickGlobalGames(next));
      next = applyPatch(next, { leagueStats: { ...next.leagueStats, hasScheduledGlobalGames: true, globalGamesScheduledYear: next.leagueStats.year } });
    }
  } else if (taskId === 'international_preseason' && options.mode === 'auto') {
    next = applyPatch(next, autoScheduleIntlPreseason(next));
  } else if (taskId === 'christmas_games' && options.mode === 'auto') {
    next = applyPatch(next, autoPickChristmasGames(next));
  } else if (taskId === 'invite_performance') {
    if (options.mode === 'auto' && next.leagueStats.uiMode === 'pba_isolated') {
      try {
        const source = await loadPerformanceArtists(next.leagueStats.year, true);
        const eventNames = getPerformanceEventNames(next.leagueStats.uiMode);
        const events = [
          eventNames.allStarHalftime,
          eventNames.allStarSaturday,
          eventNames.finals,
        ];
        const artists = getRecommendedPerformanceArtists(source.artists, next.leagueStats.year, events.length);
        const bookings: PerformanceBooking[] = events.flatMap((event, index) => {
          const artist = artists[index];
          return artist ? [{
            type: 'performance' as const,
            event,
            artists: [artist.name],
            artistDetails: [{ name: artist.name, imageUrl: artist.imageUrl }],
            seasonYear: next.leagueStats.year,
            isHighProfile: true,
          }] : [];
        });
        if (bookings.length === 0) {
          performanceBookingIncomplete = true;
        } else {
          const bookingResult = buildPerformanceBookingPatch(next, bookings);
          next = applyPatch(next, bookingResult.patch);
          resolution = {
            ...resolution,
            bookings: bookingResult.scheduledBookings,
            artistDecade: source.decade,
          };
        }
      } catch (error) {
        performanceBookingIncomplete = true;
        console.warn('[COMMISSIONER_TASK] PBA performer pool unavailable.', error);
      }
    } else {
      next = applyPatch(next, {
        leagueStats: {
          ...next.leagueStats,
          hasInvitedPerformance: true,
          performanceInvitationYear: next.leagueStats.year,
        },
      });
      if (options.mode === 'auto') {
        resolution = { ...resolution, event: 'All-Star Weekend', selection: 'Recommended performance' };
      }
    }
  } else if (taskId === 'international_tournament' && options.mode === 'auto' && next.internationalTournament) {
    const simulated = simulateRemainingInternationalTournament(
      next.internationalTournament,
      next.players,
      next.stats.playerApproval,
    );
    const reviewed = markInternationalTournamentReviewed(simulated);
    next = applyPatch(next, {
      players: applyInternationalTournamentPlayerAwards(next.players, reviewed),
      internationalTournament: reviewed,
      internationalTournamentHistory: [
        ...(next.internationalTournamentHistory ?? []).filter(entry => entry.id !== reviewed.id),
        reviewed,
      ],
      offseasonChecklist: next.offseasonChecklist
        ? { ...next.offseasonChecklist, internationalTournament: 'done' }
        : next.offseasonChecklist,
    });
    resolution = { ...resolution, tournamentId: reviewed.id, championTeamId: reviewed.result?.championTeamId };
  } else if (taskId === 'hof_endorsement' && options.mode === 'auto') {
    const inductionYear = getCommissionerHofClassYear(next);
    next = applyPatch(next, autoEndorseHall(next));
    resolution = {
      ...resolution,
      endorsedPlayerIds: next.players
        .filter(player => player.scheduledHofInductionYear === inductionYear)
        .map(player => player.internalId),
      inductionYear,
    };
  } else if (taskId === 'hof_ceremony') {
    next = applyPatch(next, await autoInductHOFClass(next));
  } else if (taskId === 'all_star_replacements' && options.mode === 'auto') {
    const autoResult = autoResolveAllStarInjuryReplacements(next);
    next = autoResult.state;
    const replacements = autoResult.replacements;
    resolution = { ...resolution, replacements };
  } else if (taskId === 'celebrity_roster' && options.mode === 'auto') {
    next = await resolveCelebrityRoster(next);
  } else if (taskId === 'dunk_participants' && options.mode === 'auto') {
    next = applyPatch(next, await autoSelectDunkContestants(next, false));
  } else if (taskId === 'three_point_participants' && options.mode === 'auto') {
    next = applyPatch(next, await autoSelectThreePointContestants(next, false));
  } else if (taskId === 'shooting_stars_participants' && options.mode === 'auto') {
    next = applyPatch(next, await autoSelectShootingStarsContestants(next, false));
  } else if (taskId === 'skills_participants' && options.mode === 'auto') {
    next = applyPatch(next, await autoSelectSkillsChallengeContestants(next, false));
  } else if (taskId === 'horse_participants' && options.mode === 'auto') {
    next = applyPatch(next, await autoSelectHorseContestants(next, false));
  }

  const criticalWorkflowIncomplete =
    (taskId === 'draft_lottery' && (next.draftLotteryResult?.length ?? 0) === 0)
    || (taskId === 'nba_draft' && !isCanonicalDraftComplete(next))
    || (taskId === 'all_star_replacements' && getOutstandingAllStarInjuries(next).length > 0)
    || (
      taskId === 'dunk_participants'
      && (next.allStar?.dunkContestContestants?.length ?? 0)
        !== Math.min(12, Math.max(2, Math.round(next.leagueStats.allStarDunkContestPlayers ?? 4)))
    )
    || (
      taskId === 'three_point_participants'
      && (next.allStar?.threePointContestants?.length ?? 0)
        !== Math.min(20, Math.max(2, Math.round(next.leagueStats.allStarThreePointContestPlayers ?? 8)))
    )
    || (
      taskId === 'shooting_stars_participants'
      && (next.allStar?.shootingStarsContestants?.length ?? 0)
        !== Math.min(30, Math.max(2, Math.round(
          next.leagueStats.allStarShootingStarsTeams
            ?? Math.round((next.leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3),
        ))) * 3
    )
    || (
      taskId === 'skills_participants'
      && (next.allStar?.skillsChallengeContestants?.length ?? 0)
        !== Math.min(30, Math.max(3, Math.round(
          next.leagueStats.allStarSkillsChallengeTeams
            ?? next.leagueStats.allStarSkillsChallengeTotalPlayers
            ?? 4,
        )))
    )
    || (
      taskId === 'horse_participants'
      && (next.allStar?.horseContestants?.length ?? 0)
        !== Math.min(10, Math.max(3, Math.round(next.leagueStats.allStarHorseParticipants ?? 3)))
    )
    || (
      taskId === 'all_star_host'
      && !next.leagueStats.allStarHosts?.some(host =>
        host.year === (
          next.leagueStats.uiMode === 'pba_isolated'
            ? next.leagueStats.year
            : getAllStarHostDecisionYear(next.leagueStats)
        )
        && (
          next.leagueStats.uiMode === 'pba_isolated'
            ? Boolean(host.city.trim() && host.arena?.trim())
            : (host.teamIds?.length ?? 0) > 0
        ),
      )
    )
    || performanceBookingIncomplete;
  if (criticalWorkflowIncomplete) {
    resolution = {
      ...resolution,
      deferred: true,
      reason: taskId === 'nba_draft'
        ? 'The draft remains unavailable until the playoffs are complete.'
        : taskId === 'draft_lottery'
          ? 'No lottery result was produced.'
          : taskId === 'all_star_replacements'
            ? 'One or more injured All-Stars still need replacements.'
          : participantAnnouncementTasks.has(taskId)
            ? 'The configured participant field is not complete.'
          : taskId === 'invite_performance'
            ? 'No eligible performer booking was available.'
          : `No host was assigned for ${getAllStarHostDecisionYear(next.leagueStats)}.`,
    };
  }
  if (!criticalWorkflowIncomplete && options.deferPresentation !== true) {
    next = publishCommissionerDecision(next, taskId, resolution);
  }
  const commissionerTasks = updateCommissionerTaskRecord(
    next,
    taskId,
    criticalWorkflowIncomplete ? 'in_progress' : recordStatus(options.mode),
    resolution,
  );
  const changed = Object.fromEntries(
    Object.entries(next).filter(([key, value]) => value !== state[key as keyof GameState]),
  ) as Partial<GameState>;
  return {
    ...changed,
    commissionerTasks,
  };
}

export const getRecommendedLeaguePassPrice = recommendedLeaguePassPrice;
export const isHistoricalBroadcastMode = historicalBroadcastsEnabled;
