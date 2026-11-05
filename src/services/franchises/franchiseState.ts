import type {
  FranchiseAncillaryPrice,
  FranchiseHistoryEntry,
  FranchiseOperationsState,
  FranchiseSponsorSlot,
  GameState,
  LeagueStats,
  NBATeam,
} from '../../types';
import { TEAM_ARENAS } from '../../data/arenas';
import { NBA_ARENA_AVERAGE_TICKET_PRICE, NBA_ARENA_PRICE_SEEDS } from '../../data/nbaArenaPrices';
import { getSeasonEconomyIndex } from '../tycoon/clubFinance';
import { getTeamFullName } from '../../utils/teamNames';
import { getArenaForTeamAtSeason, resolveArenaNamingRightsSponsor } from '../../utils/arenaData';
import { getHistoricalTeamSnapshot } from '../../utils/teamAssets';
import {
  createDefaultFranchiseDeal,
  ensureFranchiseLeagueEvents,
  getFranchiseSponsorLogo,
  getFranchiseSponsorOffers,
  getHistoricalJerseyPatchDeal,
  getLatestHistoricalJerseyPatchDeal,
  getHistoricalJerseyPatchTimeline,
  resolveGmLeagueEventSponsors,
  signFranchiseSponsor,
} from './franchiseSponsors';
import { getFranchiseEventEconomyScale } from './franchiseEventCatalog';
import {
  FRANCHISE_BASE_ANCILLARY_PRICES,
  FRANCHISE_BASE_TICKET_PRICES,
  FRANCHISE_TICKET_TIERS,
  roundFranchiseCurrency,
} from './franchiseMatchday';
import {
  finiteFranchiseValue,
  getFranchiseSourceSeason,
} from './franchiseMath';

export function isFranchiseExperienceAvailable(
  state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats'>,
): boolean {
  if (['euro_isolated', 'pba_isolated'].includes(state.leagueStats.uiMode ?? 'nba')) {
    return false;
  }
  return state.leagueType === 'fictional'
    || (
      state.leagueType === 'modded'
      && (state.moddedLeagueBase == null || state.moddedLeagueBase === 'nba')
    );
}

export function canManageFranchiseTeam(
  state: Pick<GameState, 'gameMode' | 'userTeamId'>,
  teamId: number,
): boolean {
  return state.gameMode !== 'gm' || state.userTeamId === teamId;
}

export function canBrowseFranchiseTeam(
  state: Pick<GameState, 'leagueType' | 'moddedLeagueBase' | 'leagueStats' | 'teams'>,
  teamId: number,
): boolean {
  return isFranchiseExperienceAvailable(state)
    && state.teams.some(team => team.id === teamId);
}

const isFranchiseEstablishedEntry = (entry: FranchiseHistoryEntry) =>
  entry.title === 'Franchise office established'
  || entry.title === 'Franchise established'
  || entry.id.includes('-franchise-launch-')
  || entry.id.includes('-franchise-established-');

const getFirstRecordedTeamSeason = (
  team: NBATeam,
  sourceSeason: number,
) => {
  const seasons = [
    ...(team.identitySeasons ?? []),
    ...(team.seasons ?? []),
  ]
    .map(row => Number(row.season))
    .filter(value => Number.isFinite(value) && value > 0 && value <= sourceSeason);
  return seasons.length > 0 ? Math.min(...seasons) : undefined;
};

export function getFranchiseEstablishedYear(
  state: GameState,
  team: NBATeam,
): number | undefined {
  const firstSeason = getFirstRecordedTeamSeason(
    team,
    getFranchiseSourceSeason(state),
  );
  if (firstSeason != null) return firstSeason - 1;
  return state.leagueType === 'fictional' ? state.leagueStats.year : undefined;
}

const createFranchiseEstablishedEntry = (
  state: GameState,
  team: NBATeam,
): FranchiseHistoryEntry | undefined => {
  const establishedYear = getFranchiseEstablishedYear(state, team);
  if (establishedYear == null) return undefined;
  const firstSeason = getFirstRecordedTeamSeason(
    team,
    getFranchiseSourceSeason(state),
  );
  const identity = getHistoricalTeamSnapshot(team, firstSeason ?? establishedYear);
  return {
    id: `${team.id}-franchise-established-${establishedYear}`,
    season: establishedYear,
    title: 'Franchise established',
    detail: `${getTeamFullName(identity)} entered the league.`,
    kind: 'arena',
    logoUrl: identity.logoUrl || undefined,
  };
};

export type FranchiseIdentityTimelineEntry = {
  id: string;
  season: number;
  title: string;
  detail: string;
  logoUrl?: string;
};

/**
 * Builds cutoff-safe franchise identity changes from both explicit identity
 * rows and the richer historical season archive. Some imported NBA saves keep
 * the full New York/New Jersey/Brooklyn lineage only in `team.seasons`.
 */
export function getFranchiseIdentityTimelineEntries(
  team: NBATeam,
  sourceSeason: number,
): FranchiseIdentityTimelineEntry[] {
  const candidateSeasons = [...new Set([
    ...(team.identitySeasons ?? []).map(row => Number(row.season)),
    ...(team.seasons ?? []).map(row => Number(row.season)),
  ].filter(season => Number.isFinite(season) && season > 0 && season <= sourceSeason))]
    .sort((left, right) => left - right);
  const entries: FranchiseIdentityTimelineEntry[] = [];
  let previousIdentity = '';
  for (const season of candidateSeasons) {
    const snapshot = getHistoricalTeamSnapshot(team, season);
    const identityName = getTeamFullName(snapshot);
    const signature = `${identityName}|${String(snapshot.abbrev ?? '').trim().toUpperCase()}`;
    if (signature === previousIdentity) continue;
    if (previousIdentity) {
      entries.push({
        id: `identity-${season}-${snapshot.abbrev}`,
        season,
        title: identityName,
        detail: `Franchise identity · ${snapshot.abbrev}`,
        logoUrl: snapshot.logoUrl || undefined,
      });
    }
    previousIdentity = signature;
  }
  return entries;
}

const getArenaPriceSeed = (state: GameState, team: NBATeam) => {
  if (
    state.leagueType !== 'modded'
    || (state.moddedLeagueBase != null && state.moddedLeagueBase !== 'nba')
  ) return undefined;
  const branchStart = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear ?? state.leagueStats.year);
  if (branchStart < 2025) return undefined;
  const fullName = getTeamFullName(team).replace(/^LA Clippers$/, 'Los Angeles Clippers');
  return NBA_ARENA_PRICE_SEEDS.find(row => row.team === fullName);
};

export function createFranchiseOperations(state: GameState, team: NBATeam): FranchiseOperationsState {
  const season = state.leagueStats.year;
  const economy = getFranchiseEventEconomyScale(state, season);
  const priceSeed = getArenaPriceSeed(state, team);
  const ticketMarketScale = priceSeed
    ? priceSeed.tickets / NBA_ARENA_AVERAGE_TICKET_PRICE
    : 1;
  const fullName = getTeamFullName(team);
  const sourceArena = state.leagueType === 'fictional'
    ? null
    : getArenaForTeamAtSeason(team, getFranchiseSourceSeason(state, season));
  const baseName = sourceArena?.name ?? TEAM_ARENAS[fullName] ?? `${fullName} Arena`;
  const capacity = Math.max(5_000, Math.round(finiteFranchiseValue(
    sourceArena?.capacity ?? team.stadiumCapacity,
    18_000,
  )));
  const sourceSponsor = sourceArena?.sponsor?.trim()
    || resolveArenaNamingRightsSponsor({ name: baseName })
    || undefined;
  const namingRights = state.leagueType === 'fictional' || sourceSponsor
    ? createDefaultFranchiseDeal(state, team, 'namingRights')
    : undefined;
  if (namingRights) {
    namingRights.venueName = baseName;
    if (sourceSponsor) {
      namingRights.id = `${team.id}-namingRights-${season}-source`;
      namingRights.brand = sourceSponsor;
      namingRights.logoUrl = getFranchiseSponsorLogo(sourceSponsor);
      namingRights.startSeason = sourceArena?.formerNames.find(row => row.name === baseName)?.season
        ?? sourceArena?.opened
        ?? season;
      namingRights.endSeason = season + 2;
    }
  }
  const jerseyPatch = isJerseyPatchAvailable(state.leagueStats)
    ? getHistoricalJerseyPatchDeal(state, team)
      ?? getLatestHistoricalJerseyPatchDeal(state, team)
      ?? createDefaultFranchiseDeal(state, team, 'jerseyPatch')
    : undefined;
  const patchHistory = getHistoricalJerseyPatchTimeline(state, team);
  const establishedEntry = createFranchiseEstablishedEntry(state, team);
  return {
    version: 3,
    initializedSeason: season,
    lastProcessedSeason: season,
    arena: {
      baseName,
      displayName: baseName,
      location: sourceArena?.location ?? team.region ?? fullName,
      capacity,
      openedSeason: sourceArena?.opened || undefined,
      imageUrl: sourceArena?.imageUrl,
      formerNames: sourceArena?.formerNames,
      tenants: sourceArena?.tenants,
    },
    ticketPrices: Object.fromEntries(
      FRANCHISE_TICKET_TIERS.map(tier => [
        tier,
        {
          priceUSD: roundFranchiseCurrency(FRANCHISE_BASE_TICKET_PRICES[tier] * ticketMarketScale * economy),
          updatedSeason: season,
        },
      ]),
    ) as FranchiseOperationsState['ticketPrices'],
    ancillaryPrices: Object.fromEntries(
      (Object.keys(FRANCHISE_BASE_ANCILLARY_PRICES) as FranchiseAncillaryPrice[]).map(item => [
        item,
        {
          priceUSD: roundFranchiseCurrency((
            item === 'hotdog'
              ? priceSeed?.hotdog ?? FRANCHISE_BASE_ANCILLARY_PRICES.hotdog
              : item === 'beer'
                ? priceSeed?.beer ?? FRANCHISE_BASE_ANCILLARY_PRICES.beer
                : FRANCHISE_BASE_ANCILLARY_PRICES.parking * ticketMarketScale
          ) * economy),
          updatedSeason: season,
        },
      ]),
    ) as NonNullable<FranchiseOperationsState['ancillaryPrices']>,
    deals: { namingRights, jerseyPatch },
    history: [
      ...patchHistory,
      ...(establishedEntry ? [establishedEntry] : []),
    ],
  };
}

export function ensureFranchiseOperations(
  state: GameState,
  team: NBATeam,
): FranchiseOperationsState {
  return team.franchiseOperations ?? createFranchiseOperations(state, team);
}

export function isJerseyPatchAvailable(
  leagueStats: Pick<LeagueStats, 'year' | 'jerseyPatchProgramEnabled'>,
): boolean {
  return leagueStats.jerseyPatchProgramEnabled ?? leagueStats.year >= 2017;
}

export function getFranchiseDueSlots(
  franchise: FranchiseOperationsState,
  leagueStats: Pick<LeagueStats, 'year' | 'jerseyPatchProgramEnabled'>,
): FranchiseSponsorSlot[] {
  const season = leagueStats.year;
  const slots: FranchiseSponsorSlot[] = ['namingRights'];
  if (isJerseyPatchAvailable(leagueStats)) slots.push('jerseyPatch');
  return slots.filter(slot => {
    const deal = franchise.deals[slot];
    return !deal || deal.endSeason < season;
  });
}

export function getFranchiseTaskItems(
  franchise: FranchiseOperationsState,
  leagueStats: Pick<LeagueStats, 'year' | 'jerseyPatchProgramEnabled'>,
): string[] {
  const items: string[] = getFranchiseDueSlots(franchise, leagueStats).map(slot =>
    slot === 'namingRights' ? 'Arena Naming Rights' : 'Jersey Patch',
  );
  if (franchise.arena.pendingNewArena) items.push('New Arena Review');
  return items;
}

export function resolveActiveLeagueFranchiseDeals(
  state: GameState,
  options: { includeManagedTeam?: boolean } = {},
): GameState {
  if (!isFranchiseExperienceAvailable(state)) return state;
  const season = state.leagueStats.year;
  let changed = false;
  const teams = state.teams.map(team => {
    const managed = state.gameMode === 'gm' && team.id === state.userTeamId;
    if (managed && !options.includeManagedTeam) return team;
    const current = ensureFranchiseOperations(state, team);
    const dueSlots = getFranchiseDueSlots(current, state.leagueStats);
    if (!current.arena.pendingNewArena && dueSlots.length === 0) return team;
    const franchise: FranchiseOperationsState = {
      ...current,
      arena: { ...current.arena },
      ticketPrices: { ...current.ticketPrices },
      ancillaryPrices: current.ancillaryPrices ? { ...current.ancillaryPrices } : undefined,
      deals: { ...current.deals },
      history: [...current.history],
    };
    if (franchise.arena.pendingNewArena) {
      const pending = franchise.arena.pendingNewArena;
      franchise.arena = {
        baseName: pending.proposedName,
        displayName: pending.proposedName,
        location: pending.location,
        capacity: pending.capacity,
        openedSeason: season,
      };
      franchise.lastArenaReviewSeason = pending.announcedSeason;
    }
    for (const slot of getFranchiseDueSlots(franchise, state.leagueStats)) {
      const offerTeam = { ...team, franchiseOperations: franchise };
      const offer = getFranchiseSponsorOffers(state, offerTeam, slot)[0];
      if (offer) signFranchiseSponsor(franchise, offer, season);
    }
    franchise.lastProcessedSeason = Math.max(franchise.lastProcessedSeason, season);
    changed = true;
    return { ...team, franchiseOperations: franchise };
  });
  return changed ? { ...state, teams } : state;
}

export function syncFranchiseState(state: GameState): GameState {
  if (!state.isDataLoaded || !isFranchiseExperienceAvailable(state)) {
    return state;
  }
  const season = state.leagueStats.year;
  let changed = false;
  const arenaNotices: GameState['inbox'] = [];
  const franchiseEconomyBaseSeason = state.franchiseEconomyBaseSeason ?? season;
  if (state.franchiseEconomyBaseSeason == null) changed = true;
  const teams = state.teams.map(team => {
    const current = team.franchiseOperations;
    const franchise = current
      ? {
          ...current,
          arena: { ...current.arena },
          ticketPrices: { ...current.ticketPrices },
          ancillaryPrices: current.ancillaryPrices
            ? { ...current.ancillaryPrices }
            : undefined,
          deals: { ...current.deals },
          history: [...current.history],
        }
      : createFranchiseOperations(state, team);
    if (!current) changed = true;
    const legacyNamingRights = franchise.deals.namingRights;
    if (legacyNamingRights?.brand === 'Current Arena Partner') {
      const inferredSponsor = resolveArenaNamingRightsSponsor({
        name: legacyNamingRights.venueName ?? franchise.arena.displayName ?? franchise.arena.baseName,
      });
      franchise.deals.namingRights = inferredSponsor
        ? {
            ...legacyNamingRights,
            brand: inferredSponsor,
            logoUrl: getFranchiseSponsorLogo(inferredSponsor),
          }
        : undefined;
      changed = true;
    }
    const placeholderPatch = franchise.deals.jerseyPatch;
    if (placeholderPatch?.brand === 'Community Partner') {
      const sourcedPatch = getHistoricalJerseyPatchDeal(state, team)
        ?? getLatestHistoricalJerseyPatchDeal(state, team);
      if (sourcedPatch) {
        franchise.deals.jerseyPatch = {
          ...placeholderPatch,
          id: `${placeholderPatch.id}-source-brand`,
          brand: sourcedPatch.brand,
          logoUrl: sourcedPatch.logoUrl,
        };
        changed = true;
      }
    }
    if (Number(franchise.version) < 2) {
      const previousScale = Math.max(0.05, getSeasonEconomyIndex(state, season));
      const nextScale = getFranchiseEventEconomyScale(state, season);
      const ratio = nextScale / previousScale;
      franchise.version = 2;
      franchise.ticketPrices = Object.fromEntries(
        FRANCHISE_TICKET_TIERS.map(tier => [
          tier,
          {
            ...franchise.ticketPrices[tier],
            priceUSD: roundFranchiseCurrency(franchise.ticketPrices[tier].priceUSD * ratio),
          },
        ]),
      ) as FranchiseOperationsState['ticketPrices'];
      if (franchise.ancillaryPrices) {
        franchise.ancillaryPrices = Object.fromEntries(
          (Object.keys(franchise.ancillaryPrices) as FranchiseAncillaryPrice[]).map(item => [
            item,
            {
              ...franchise.ancillaryPrices![item],
              priceUSD: roundFranchiseCurrency(franchise.ancillaryPrices![item].priceUSD * ratio),
            },
          ]),
        ) as NonNullable<FranchiseOperationsState['ancillaryPrices']>;
      }
      franchise.deals = Object.fromEntries(
        Object.entries(franchise.deals).map(([slot, deal]) => [
          slot,
          deal?.id.includes('-source')
            ? deal
            : deal
              ? { ...deal, annualValueUSD: Math.round(deal.annualValueUSD * ratio) }
              : deal,
        ]),
      ) as FranchiseOperationsState['deals'];
      changed = true;
    }
    if (Number(franchise.version) < 3) {
      const economy = getFranchiseEventEconomyScale(state, season);
      franchise.version = 3;
      franchise.ticketPrices = Object.fromEntries(
        FRANCHISE_TICKET_TIERS.map(tier => {
          const currentPrice = Number(franchise.ticketPrices[tier]?.priceUSD);
          const fallback = FRANCHISE_BASE_TICKET_PRICES[tier] * economy;
          return [tier, {
            ...franchise.ticketPrices[tier],
            priceUSD: roundFranchiseCurrency(currentPrice > 0 ? currentPrice : fallback),
          }];
        }),
      ) as FranchiseOperationsState['ticketPrices'];
      franchise.ancillaryPrices = Object.fromEntries(
        (Object.keys(FRANCHISE_BASE_ANCILLARY_PRICES) as FranchiseAncillaryPrice[]).map(item => {
          const currentPrice = Number(franchise.ancillaryPrices?.[item]?.priceUSD);
          const fallback = FRANCHISE_BASE_ANCILLARY_PRICES[item] * economy;
          return [item, {
            updatedSeason: franchise.ancillaryPrices?.[item]?.updatedSeason ?? season,
            priceUSD: roundFranchiseCurrency(currentPrice > 0 ? currentPrice : fallback),
          }];
        }),
      ) as NonNullable<FranchiseOperationsState['ancillaryPrices']>;
      changed = true;
    }
    const establishedEntry = createFranchiseEstablishedEntry(state, team);
    const historyWithoutEstablished = franchise.history.filter(entry =>
      !isFranchiseEstablishedEntry(entry)
    );
    const nextHistory = establishedEntry
      ? [...historyWithoutEstablished, establishedEntry]
      : historyWithoutEstablished;
    if (JSON.stringify(franchise.history) !== JSON.stringify(nextHistory)) {
      franchise.history = nextHistory;
      changed = true;
    }
    const arenaProposal = state.gameMode === 'gm' && team.id === state.userTeamId
      ? state.pendingGovernorsBoardMeeting?.venueChanges?.find(change =>
          change.teamId === team.id && change.kind === 'stadium',
        )
      : undefined;
    if (
      arenaProposal
      && franchise.lastArenaReviewSeason !== state.pendingGovernorsBoardMeeting?.season
      && !franchise.arena.pendingNewArena
    ) {
      franchise.arena.pendingNewArena = {
        proposedName: arenaProposal.next.name,
        location: arenaProposal.next.location,
        capacity: Math.max(
          5_000,
          Number(arenaProposal.next.capacity ?? franchise.arena.capacity),
        ),
        announcedSeason: state.pendingGovernorsBoardMeeting!.season,
      };
      changed = true;
    }
    const pendingArena = franchise.arena.pendingNewArena;
    if (state.gameMode === 'gm' && team.id === state.userTeamId && pendingArena) {
      const noticeId = `franchise-new-arena-${team.id}-${pendingArena.announcedSeason}`;
      if (
        !state.inbox.some(email => email.id === noticeId)
        && !arenaNotices.some(email => email.id === noticeId)
      ) {
        const teamName = getTeamFullName(team);
        arenaNotices.push({
          id: noticeId,
          sender: `${teamName} Board`,
          senderRole: 'Ownership',
          organization: teamName,
          subject: `New arena proposal: ${pendingArena.proposedName}`,
          body: `Ownership has funded a new home in ${pendingArena.location}. Review the ${pendingArena.capacity.toLocaleString()}-seat proposal in Franchises before renewing the arena naming-rights agreement.`,
          read: false,
          replied: false,
          teamLogoUrl: team.logoUrl,
          date: state.date,
        });
        changed = true;
      }
    }
    const sourceArena = state.leagueType === 'fictional'
      ? null
      : getArenaForTeamAtSeason(team, getFranchiseSourceSeason(state, season));
    const initialNaming = franchise.deals.namingRights?.id.endsWith('-initial');
    if (
      current
      && sourceArena
      && (initialNaming || franchise.arena.imageUrl == null)
      && (
        initialNaming
        || franchise.arena.baseName !== sourceArena.name
        || franchise.arena.capacity !== sourceArena.seating_capacity
        || franchise.arena.location !== sourceArena.location
        || franchise.arena.imageUrl !== sourceArena.imageUrl
      )
    ) {
      franchise.arena = {
        ...franchise.arena,
        baseName: sourceArena.name,
        displayName: sourceArena.name,
        location: sourceArena.location,
        capacity: Math.max(5_000, sourceArena.seating_capacity),
        openedSeason: sourceArena.opened || undefined,
        imageUrl: sourceArena.imageUrl,
        formerNames: sourceArena.formerNames,
        tenants: sourceArena.tenants,
      };
      if (initialNaming) {
        const sourceSponsor = sourceArena.sponsor?.trim();
        franchise.deals.namingRights = sourceSponsor
          ? {
              ...franchise.deals.namingRights!,
              id: `${team.id}-namingRights-${season}-source`,
              brand: sourceSponsor,
              logoUrl: getFranchiseSponsorLogo(sourceSponsor),
              venueName: sourceArena.name,
              startSeason: sourceArena.formerNames.find(row => row.name === sourceArena.name)?.season
                ?? sourceArena.opened
                ?? season,
              endSeason: season + 2,
            }
          : undefined;
      }
      changed = true;
    }
    if (
      sourceArena?.sponsor
      && franchise.deals.namingRights?.id.includes('-source')
      && franchise.deals.namingRights.endSeason <= season
      && franchise.deals.namingRights.endSeason <= franchise.initializedSeason
    ) {
      franchise.deals.namingRights = {
        ...franchise.deals.namingRights,
        brand: sourceArena.sponsor,
        logoUrl: getFranchiseSponsorLogo(sourceArena.sponsor),
        venueName: sourceArena.name,
        endSeason: season + 2,
      };
      franchise.arena.displayName = sourceArena.name;
      changed = true;
    }
    const activeNamingRights = franchise.deals.namingRights;
    const activeVenueName = activeNamingRights
      && activeNamingRights.startSeason <= season
      && activeNamingRights.endSeason >= season
      ? activeNamingRights.venueName?.trim()
      : undefined;
    const expectedDisplayName = activeVenueName || franchise.arena.baseName;
    if (franchise.arena.displayName !== expectedDisplayName) {
      franchise.arena.displayName = expectedDisplayName;
      changed = true;
    }
    const userManaged = state.gameMode === 'gm' && team.id === state.userTeamId;
    if (
      isJerseyPatchAvailable(state.leagueStats)
      && !franchise.deals.jerseyPatch
      && !userManaged
    ) {
      const offer = getFranchiseSponsorOffers(state, team, 'jerseyPatch')[0];
      if (offer) {
        signFranchiseSponsor(franchise, offer, season);
        changed = true;
      }
    }
    if (franchise.lastProcessedSeason < season) {
      if (!userManaged) {
        for (const slot of getFranchiseDueSlots(franchise, state.leagueStats)) {
          const offer = getFranchiseSponsorOffers(state, team, slot)[0];
          if (offer) signFranchiseSponsor(franchise, offer, season);
        }
      }
      franchise.lastProcessedSeason = season;
      changed = true;
    }
    return current === franchise ? team : { ...team, franchiseOperations: franchise };
  });
  const userTeam = teams.find(team => team.id === state.userTeamId);
  const due = state.gameMode === 'gm' && userTeam
    ? getFranchiseTaskItems(userTeam.franchiseOperations!, state.leagueStats)
    : [];
  let offseasonChecklist = state.offseasonChecklist;
  if (state.gameMode === 'gm' && offseasonChecklist) {
    const desired = due.length > 0
      ? (
          offseasonChecklist.sponsorRenewals === 'pending'
          || offseasonChecklist.sponsorRenewals === 'in-progress'
            ? offseasonChecklist.sponsorRenewals
            : 'pending'
        )
      : offseasonChecklist.sponsorRenewals;
    if (offseasonChecklist.sponsorRenewals !== desired) {
      offseasonChecklist = { ...offseasonChecklist, sponsorRenewals: desired };
      changed = true;
    }
  }
  const franchiseLeagueEvents = state.gameMode === 'gm'
    ? resolveGmLeagueEventSponsors({ ...state, teams } as GameState)
    : ensureFranchiseLeagueEvents(state);
  if (franchiseLeagueEvents !== state.franchiseLeagueEvents) changed = true;
  const inbox = arenaNotices.length > 0
    ? [...arenaNotices, ...state.inbox]
    : state.inbox;
  return changed
    ? {
        ...state,
        teams,
        inbox,
        offseasonChecklist,
        franchiseLeagueEvents,
        franchiseEconomyBaseSeason,
      }
    : state;
}
