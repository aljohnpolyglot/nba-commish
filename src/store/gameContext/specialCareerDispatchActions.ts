import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, UserAction } from '../../types';
import { handleStartGame, handleAnnounceChange } from '../logic/gameLogic';
import { migrateAllEuroTeams } from '../../services/tycoon/migrate';
import { getStaffMarketSalary } from '../../services/tycoon/economyScale';
import type { EuroCareerSeed } from '../../services/euro/careerSeed';
import { scaleEuroPlayerContracts } from '../../services/euro/payrollScale';
import { ensureStaffPoolDepth } from '../../services/euro/staffPool';
import { mapSetupTierToTycoonTier } from '../../utils/tierMapping';
import { normalizeDate } from '../../utils/helpers';
import { ensureEuroUserAcademyProspects, enforceExternalMinRoster } from '../../services/externalLeagueSustainer';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { generateForCompetition, selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { EURO_ISOLATED_DEFAULTS, PBA_ISOLATED_DEFAULTS } from '../../constants';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../data/euroBasketballSources';
import { applyEuropeanCoachSnapshot, loadEuropeanCoachSource } from '../../services/euro/historicalCoachSource';
import { getOwnerPhoto } from '../../data/photos/owners';
import { buildEuroLeagueAssemblyMeeting } from '../../services/euro/leagueAssembly';
import { prehydratePlayerBioData } from '../../services/playerBioPreload';
import { openEuroCareerOffseason } from '../../services/euro/openingOffseason';
import {
  initialEuroOffseasonChecklist,
  initialPbaInterConferenceChecklist,
  initialPbaEndOfSeasonChecklist,
} from '../../services/offseason/offseasonState';
import {
  getConferenceSpec,
  getConferenceStartIso,
  getNextPbaScheduleGid,
  getNextConference,
  getPbaCalendarPosition,
  type PbaConference,
} from '../../services/pba/conferenceTransition';
import { buildPbaGovernorsBoardMeeting } from '../../services/pba/governorsBoard';
import { getHistoricalPbaRuleOverrides } from '../../services/pba/historicalCatalog';
import { carryPbaDraftClassForward, getPbaDraftYearForSeasonYear, isPbaDraftHeldInYear } from '../../services/pba/draftCalendar';
import {
  buildSetupSponsorships,
  EURO_TRANSFER_MARKET_DEFAULTS,
  getClubId,
  getClubLabel,
  mergeTycoonStaffMembers,
} from './loadGameState';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleSpecialCareerDispatchActionArgs = {
  action: UserAction;
  state: GameState;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
  generationIdRef: MutableRefObject<number>;
  dispatchAction: (action: UserAction) => Promise<void>;
};

export async function handleSpecialCareerDispatchAction({
  action,
  state,
  setState,
  stateRef,
  generationIdRef,
  dispatchAction,
}: HandleSpecialCareerDispatchActionArgs): Promise<{ handled: boolean; newStatePatch?: Partial<GameState> }> {
  if (action.type === 'START_GAME') {
    const genId = ++generationIdRef.current;
    const payloadWithProgress = {
      ...action.payload,
      onProgress: (progress: any) => {
        setState(prev => ({ ...prev, lazySimProgress: progress }));
      },
    };
    const startPatch = await handleStartGame(payloadWithProgress);
    if (genId !== generationIdRef.current) return { handled: true };
    return {
      handled: true,
      newStatePatch: {
        ...startPatch,
        lazySimProgress: undefined,
        pendingStartPayload: undefined,
      },
    };
  }

  if (action.type === 'INIT_PBA_CAREER') {
    const { teamId, startDate } = action.payload as {
      teamId: number;
      startDate?: string;
    };
    setState(prev => {
      const fallbackSeasonYear = prev.leagueStats?.year ?? new Date().getFullYear() + 1;
      const requestedStart = normalizeDate(startDate ?? getConferenceStartIso('philippine', fallbackSeasonYear));
      const position = getPbaCalendarPosition(requestedStart);
      const seasonYear = position.seasonYear;
      const pbaStartDate = getConferenceStartIso(position.conference, seasonYear);
      const conferenceSpec = getConferenceSpec(position.conference, seasonYear);
      const source = { nonNBATeams: prev.nonNBATeams as any, userTeamId: teamId };
      const tids = selectCompetitionTeamTids(conferenceSpec, source);
      const conferenceStart = new Date(`${pbaStartDate}T00:00:00Z`);
      const gidBase = getNextPbaScheduleGid(prev, position.conference);
      const conferenceGames = generateForCompetition(
        conferenceSpec,
        tids.map(tid => ({ tid })),
        conferenceStart,
        gidBase,
      );
      const stockedPool = ensureStaffPoolDepth(
        { players: prev.players ?? [], nonNBATeams: prev.nonNBATeams ?? [], teams: prev.teams ?? [], staffFreeAgents: prev.staffFreeAgents ?? [], saveId: prev.saveId } as any,
        'pba',
      );
      return {
        ...prev,
        leagueStats: {
          ...prev.leagueStats,
          ...PBA_ISOLATED_DEFAULTS,
          ...getHistoricalPbaRuleOverrides(seasonYear),
          moddedLeagueBase: 'philippines',
          pbaConference: position.conference,
          pbaConferencePhase: 'regularSeason',
          staffPoolSeeded: true,
          pbaStaffPoolSeeded: true,
        },
        activeCompetitions: PBA_COMPETITIONS,
        userTeamId: teamId,
        pbaStartDate: requestedStart,
        date: pbaStartDate,
        schedule: conferenceGames,
        boxScores: [],
        staffFreeAgents: stockedPool.staffFreeAgents ?? prev.staffFreeAgents,
        offseasonChecklist: undefined,
        pendingOfferDecisions: [],
        faTagCounter: undefined,
        draftComplete: true,
        isProcessing: false,
      };
    });
    return { handled: true };
  }

  if (action.type === 'ADVANCE_PBA_CONFERENCE') {
    setState(prev => {
      const leagueStats = prev.leagueStats as any;
      const current: PbaConference = leagueStats?.pbaConference ?? 'philippine';
      const seasonYear = Number(prev.leagueStats?.year);
      const next = getNextConference(current, seasonYear);
      if (!next) {
        const draftYear = getPbaDraftYearForSeasonYear(seasonYear);
        const draftHeld = isPbaDraftHeldInYear(draftYear);
        const endState: GameState = {
          ...prev,
          players: draftHeld
            ? prev.players
            : carryPbaDraftClassForward(prev.players, draftYear, prev.leagueStats),
          leagueStats: { ...prev.leagueStats, pbaConferencePhase: 'offseason' as const },
          offseasonChecklist: initialPbaEndOfSeasonChecklist(prev.gameMode === 'gm', prev.gameMode === 'gm', draftHeld),
          draftComplete: draftHeld ? prev.draftComplete : true,
        };
        return {
          ...endState,
          pendingGovernorsBoardMeeting: buildPbaGovernorsBoardMeeting(endState as GameState),
        };
      }
      return {
        ...prev,
        leagueStats: { ...prev.leagueStats, pbaConferencePhase: 'offseason' },
        offseasonChecklist: initialPbaInterConferenceChecklist(current),
      };
    });
    return { handled: true };
  }

  if (action.type === 'RECORD_PBA_CHAMPION') {
    const { conference, teamId, teamName } = action.payload as { conference: string; teamId: number; teamName: string };
    setState(prev => {
      const leagueStats = prev.leagueStats as any;
      const season = leagueStats?.year ?? new Date().getFullYear();
      const existing: any[] = leagueStats?.pbaConferenceChampions ?? [];
      return {
        ...prev,
        leagueStats: {
          ...prev.leagueStats,
          pbaConferenceChampions: [...existing, { season, conference, teamId, teamName }],
          pbaConferencePhase: 'complete',
        },
      };
    });
    return { handled: true };
  }

  if (action.type === 'INIT_EURO_CAREER') {
    const { teamId: requestedTeamId, leagueId, seed } = action.payload as {
      teamId: number;
      leagueId: string;
      seed: EuroCareerSeed;
    };
    const europeanCoachSource = await loadEuropeanCoachSource().catch(error => {
      console.warn('[EURO STAFF] Real coach source unavailable during career initialization; generated staff remain available.', error);
      return null;
    });
    const careerState = (() => {
      const prev = stateRef.current;
      const teamId = prev.clubAliasMap?.[requestedTeamId] ?? requestedTeamId;
      const seasonYear = prev.leagueStats?.year ?? new Date().getFullYear() + 1;
      const historicalEconomyScale = Number(prev.leagueStats?.historicalEconomyScale ?? 1);
      const signedYear = seasonYear - 1;
      const euroStartDate = prev.date;
      const teams = prev.teams.map(team => ({ ...team }));
      const nonNBATeams = (prev.nonNBATeams ?? []).map(team => ({ ...team }));
      const source = EURO_BASKETBALL_SOURCE_ARCHIVES.find(entry => entry.leagueId === leagueId);
      if (!teams.some(team => getClubId(team) === teamId) && !nonNBATeams.some(team => getClubId(team) === teamId)) {
        const seedTeam = seed.team as any;
        nonNBATeams.push({
          ...seedTeam,
          tid: teamId,
          cid: Number(seedTeam.cid ?? 0),
          did: Number(seedTeam.did ?? 0),
          region: String(seedTeam.region ?? ''),
          name: String(seedTeam.name ?? 'Euro Club'),
          abbrev: String(seedTeam.abbrev ?? 'EUR'),
          imgURL: seedTeam.imgURL ?? seedTeam.logoUrl,
          league: leagueId === 'endesa' ? 'Endesa' : source?.leagueStatus ?? 'Euroleague',
          disabled: false,
        });
      }
      migrateAllEuroTeams({
        teams,
        nonNBATeams,
        leagueStats: { ...(prev.leagueStats as any), uiMode: 'euro_isolated', year: seasonYear },
      });
      const coachSnapshot = europeanCoachSource
        ? applyEuropeanCoachSnapshot(nonNBATeams, seasonYear, leagueId, europeanCoachSource)
        : null;
      if (coachSnapshot) {
        nonNBATeams.splice(0, nonNBATeams.length, ...coachSnapshot.teams);
      }
      const teamFromState =
        teams.find(team => getClubId(team) === teamId) ??
        nonNBATeams.find(team => getClubId(team) === teamId) ??
        seed.team;
      const teamName = getClubLabel(teamFromState);
      const domesticCompetition = prev.activeCompetitions?.find(competition => competition.id === prev.euroPrimaryCompetitionId);
      const domesticLeagueName = domesticCompetition?.displayName ?? prev.leagueStats?.leagueName ?? 'the domestic league';
      const seededSponsorships = buildSetupSponsorships(seed, signedYear);
      const setupStaff = seed.staff.map((member, index) => ({
        ...member,
        team: teamName,
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL ?? member.teamLogoUrl,
        isPlaceholder: member.isPlaceholder ?? true,
        reputation: (member as any).reputation ?? 65,
        id: member.id ?? `euro-setup-${teamId}-${member.position ?? member.jobTitle ?? index}`,
      }));
      const resolvedTeamCoaches = (((teamFromState as any)?.tycoon?.staffMembers ?? []) as any[])
        .filter(member => member?.source === 'european-coaches');
      const teamStaff = mergeTycoonStaffMembers(setupStaff, resolvedTeamCoaches).map(member => ({
        ...member,
        team: teamName,
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL ?? member.teamLogoUrl,
      }));
      const ownerStaff = {
        name: seed.owner.name,
        team: teamName,
        position: 'Owner',
        jobTitle: 'Owner',
        playerPortraitUrl: getOwnerPhoto(seed.owner.name),
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
        nationality: seed.owner.nationality,
        face: seed.owner.face,
        isPlaceholder: true,
      };
      const domesticGoal = `Build a sustainable contender in ${domesticLeagueName} and earn a place among Europe’s best clubs.`;
      const briefingEmail = {
        id: `euro-briefing-${teamId}-${seasonYear}`,
        sender: `${teamName} Board`,
        senderRole: 'Owner',
        subject: 'Five-Year Briefing',
        body: `${seed.owner.name} welcomes you to ${teamName}. ${domesticGoal}`,
        date: euroStartDate,
        read: false,
        replied: false,
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
        playerPortraitUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
      };
      const tycoonStaff = teamStaff.map((member, index) => {
        const role = member.role ?? member.position ?? member.jobTitle ?? 'Staff';
        const rating = Number(member.rating ?? member.reputation ?? 65);
        return {
          ...member,
          id: member.id ?? `staff-${teamId}-${role || index}`,
          role,
          position: member.position ?? role,
          jobTitle: member.jobTitle ?? role,
          salary: Math.round(getStaffMarketSalary(
            mapSetupTierToTycoonTier(seed.tier),
            role,
            rating,
            {
              market: 'euro',
              yearsExperience: member.coachingYears ?? (member as any).yearsExperience ?? member.yearsWithTeam ?? 1,
              yearsWithTeam: member.yearsWithTeam ?? 1,
            },
          ) * historicalEconomyScale),
          contractYears: member.contractYears ?? Math.max(1, 4 - Math.min(3, member.yearsWithTeam ?? 1)),
          rating,
          reputation: rating,
          hiredYear: member.hiredYear ?? signedYear,
          leagueId,
        };
      });

      const scaledPlayers = scaleEuroPlayerContracts(prev.players ?? [], Number(prev.leagueStats?.year));
      const sourceStaffPool = (coachSnapshot?.staffFreeAgents ?? []).map(member => ({
        ...member,
        salary: Number.isFinite(Number(member.salary))
          ? Math.round(Number(member.salary) * historicalEconomyScale)
          : member.salary,
      }));
      const stockedPool = ensureStaffPoolDepth(
        {
          players: scaledPlayers.players,
          teams,
          nonNBATeams: nonNBATeams as any,
          staffFreeAgents: sourceStaffPool,
          saveId: prev.saveId,
        } as any,
        leagueId,
      );
      const initialStaffPool = stockedPool.staffFreeAgents ?? [];

      const applySetup = (team: any) => {
        if (getClubId(team) !== teamId) return team;
        const existingTycoon = team.tycoon ?? {};
        return {
          ...team,
          ownerProfile: seed.owner,
          startingTier: seed.tier,
          startingBudget: seed.budget,
          tycoon: {
            ...existingTycoon,
            tier: existingTycoon.tier ?? mapSetupTierToTycoonTier(seed.tier),
            cashOnHand: seed.budget,
            sponsorships: { ...(existingTycoon.sponsorships ?? {}), ...seededSponsorships },
            staffMembers: mergeTycoonStaffMembers(existingTycoon.staffMembers, tycoonStaff),
          },
        };
      };

      return {
        ...prev,
        players: scaledPlayers.players,
        teams: teams.map(applySetup),
        nonNBATeams: nonNBATeams.map(applySetup),
        euroCompetitionTeamTids: prev.euroPrimaryCompetitionId
          ? {
              ...(prev.euroCompetitionTeamTids ?? {}),
              [prev.euroPrimaryCompetitionId]: [
                ...new Set([...(prev.euroCompetitionTeamTids?.[prev.euroPrimaryCompetitionId] ?? []), teamId]),
              ],
            }
          : prev.euroCompetitionTeamTids,
        staff: {
          owners: [
            ...(prev.staff?.owners ?? []).filter(staffer => staffer.team !== teamName && staffer.team !== (teamFromState as any)?.name),
            ownerStaff,
          ],
          gms: prev.staff?.gms ?? [],
          coaches: [
            ...(prev.staff?.coaches ?? []).filter(staffer => staffer.team !== teamName && staffer.team !== (teamFromState as any)?.name),
            ...teamStaff,
          ],
          leagueOffice: prev.staff?.leagueOffice ?? [],
          referees: prev.staff?.referees,
        },
        staffFreeAgents: initialStaffPool,
        staffRetirementAnnouncements: coachSnapshot
          ? (() => {
              const existingIds = new Set((prev.staffRetirementAnnouncements ?? []).map(record => record.id));
              const existingKeys = new Set((prev.staffRetirementAnnouncements ?? []).map(record =>
                `${String(record.name).toLowerCase().replace(/[^a-z0-9]+/g, '')}|${record.season}`,
              ));
              return [
                ...(prev.staffRetirementAnnouncements ?? []),
                ...coachSnapshot.retirementAnnouncements.filter(record =>
                  !existingIds.has(record.id)
                  && !existingKeys.has(`${String(record.name).toLowerCase().replace(/[^a-z0-9]+/g, '')}|${record.season}`)
                ),
              ];
            })()
          : prev.staffRetirementAnnouncements,
        inbox: [briefingEmail as any, ...(prev.inbox ?? []).filter(email => email.id !== briefingEmail.id)],
        euroSetupSeed: {
          teamId,
          leagueId,
          masterSeed: seed.masterSeed,
          manualOverrides: seed.manualOverrides as unknown as Record<string, unknown>,
        },
        leagueStats: {
          ...EURO_ISOLATED_DEFAULTS,
          ...prev.leagueStats,
          transferMarket: {
            ...EURO_TRANSFER_MARKET_DEFAULTS,
            ...(prev.leagueStats?.transferMarket ?? {}),
            enabled: true,
          },
          autoOwnerSeeded: true,
          euroPayrollScaleHealed: true,
          staffPoolSeeded: true,
          ...(coachSnapshot ? {
            europeanCoachSourceVersion: coachSnapshot.sourceVersion,
            europeanCoachSourceSeason: coachSnapshot.snapshotYear,
            europeanCoachAssignedCount: coachSnapshot.assignedCoachCount,
          } : {}),
        },
        userTeamId: teamId,
        date: euroStartDate,
        offseasonChecklist: initialEuroOffseasonChecklist(true),
        isProcessing: false,
      };
    })();
    if (careerState.leagueStats?.uiMode !== 'euro_isolated') {
      stateRef.current = careerState;
      setState(careerState);
      return { handled: true };
    }
    const tick = tickTransferMarket(careerState);
    const academy = ensureEuroUserAcademyProspects(
      { ...careerState, players: tick.players, teams: tick.teams, nonNBATeams: tick.nonNBATeams } as any,
      careerState.leagueStats?.year ?? new Date().getFullYear(),
    );
    const rosterFill = enforceExternalMinRoster(
      { ...careerState, players: academy.players, teams: tick.teams, nonNBATeams: tick.nonNBATeams } as any,
      careerState.leagueStats?.year ?? new Date().getFullYear(),
    );
    const readyState = {
        ...careerState,
        transferListings: tick.transferListings,
        transferBids: tick.transferBids,
        transferActivity: tick.transferActivity,
        players: rosterFill.additions.length > 0
          ? [...academy.players, ...rosterFill.additions]
          : academy.players,
        teams: tick.teams,
        nonNBATeams: tick.nonNBATeams,
        ...(tick.historyEntries.length > 0 ? {
          history: [...(careerState.history ?? []), ...tick.historyEntries] as any,
        } : {}),
        pendingGovernorsBoardMeeting: careerState.pendingGovernorsBoardMeeting
          ?? buildEuroLeagueAssemblyMeeting(
            careerState,
            careerState.euroCompetitionTeamTids ?? {},
            careerState.leagueStats?.year ?? new Date().getFullYear(),
          ),
      } as GameState;
    const hydratingState = { ...openEuroCareerOffseason(readyState), isProcessing: true };
    stateRef.current = hydratingState;
    setState(hydratingState);
    await prehydratePlayerBioData(hydratingState);
    const completedState = { ...hydratingState, isProcessing: false };
    stateRef.current = completedState;
    setState(completedState);
    return { handled: true };
  }

  if (action.type === 'ANNOUNCE_CHANGE') {
    return { handled: true, newStatePatch: await handleAnnounceChange(state, action.payload) };
  }

  if (action.type === 'UPDATE_RULES') {
    const updatedLeagueStats = { ...state.leagueStats, ...action.payload };
    let updatedSchedule = state.schedule;
    if (action.payload.mediaRights) {
      const { attachBroadcastersToGames } = await import('../../utils/broadcastingUtils');
      updatedSchedule = attachBroadcastersToGames(state.schedule, action.payload.mediaRights, state.teams);
    }
    return {
      handled: true,
      newStatePatch: {
        leagueStats: updatedLeagueStats,
        schedule: updatedSchedule,
        isProcessing: false,
      },
    };
  }

  return { handled: false };
}
