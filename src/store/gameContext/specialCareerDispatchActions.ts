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
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
import { isInitialSpanishEuroleagueWildcard, isLicensedSpanishEuroleagueClub } from '../../utils/euroleagueQualification';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { generateForCompetition, selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { EURO_ISOLATED_DEFAULTS, PBA_ISOLATED_DEFAULTS } from '../../constants';
import {
  initialEuroOffseasonChecklist,
  initialPbaChecklist,
  initialPbaInterConferenceChecklist,
  initialPbaEndOfSeasonChecklist,
} from '../../services/offseason/offseasonState';
import { getConferenceStartIso, getNextConference, type PbaConference } from '../../services/pba/conferenceTransition';
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
    setState(prev => ({ ...prev, isProcessing: true, pendingStartPayload: action.payload }));
    const payloadWithProgress = {
      ...action.payload,
      onProgress: (progress: any) => {
        setState(prev => ({ ...prev, lazySimProgress: progress }));
      },
    };
    const startPatch = await handleStartGame(payloadWithProgress);
    setState(prev => {
      if (genId === generationIdRef.current) {
        return { ...prev, ...startPatch, lazySimProgress: undefined, pendingStartPayload: undefined };
      }
      return prev;
    });
    return { handled: true };
  }

  if (action.type === 'INIT_PBA_CAREER') {
    const { teamId, startDate, assistantGM } = action.payload as {
      teamId: number;
      startDate?: string;
      assistantGM?: boolean;
    };
    const initialSeasonYear = stateRef.current.leagueStats?.year ?? new Date().getFullYear() + 1;
    const pbaStartIso = `${initialSeasonYear - 1}-10-05`;
    setState(prev => {
      const seasonYear = prev.leagueStats?.year ?? new Date().getFullYear() + 1;
      const signedYear = seasonYear - 1;
      const pbaStartDate = getConferenceStartIso('philippine', seasonYear);
      const philCupSpec = PBA_COMPETITIONS[0];
      const source = { nonNBATeams: prev.nonNBATeams as any, userTeamId: teamId };
      const tids = selectCompetitionTeamTids(philCupSpec, source);
      const philCupStart = new Date(Date.UTC(signedYear, philCupSpec.seasonStart.month - 1, philCupSpec.seasonStart.day));
      const philCupGames = generateForCompetition(philCupSpec, tids.map(tid => ({ tid })), philCupStart, 800_000);
      const stockedPool = ensureStaffPoolDepth(
        { players: prev.players ?? [], nonNBATeams: prev.nonNBATeams ?? [], teams: prev.teams ?? [], staffFreeAgents: prev.staffFreeAgents ?? [], saveId: prev.saveId } as any,
        'pba',
      );
      return {
        ...prev,
        leagueStats: {
          ...prev.leagueStats,
          ...PBA_ISOLATED_DEFAULTS,
          moddedLeagueBase: 'philippines',
          pbaConference: 'philippine',
          pbaConferencePhase: 'regularSeason',
          staffPoolSeeded: true,
          pbaStaffPoolSeeded: true,
        },
        activeCompetitions: PBA_COMPETITIONS,
        userTeamId: teamId,
        date: pbaStartDate,
        schedule: philCupGames,
        boxScores: [],
        staffFreeAgents: stockedPool.staffFreeAgents ?? prev.staffFreeAgents,
        offseasonChecklist: initialPbaChecklist(),
        isProcessing: false,
      };
    });
    const targetStart = startDate ? normalizeDate(startDate) : null;
    if (targetStart && targetStart > pbaStartIso) {
      window.setTimeout(() => {
        dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: {
            targetDate: targetStart,
            stopBefore: true,
            assistantGM: assistantGM === true,
            autoResolveOffseasonTasks: true,
          },
        } as any);
      }, 50);
    }
    return { handled: true };
  }

  if (action.type === 'ADVANCE_PBA_CONFERENCE') {
    setState(prev => {
      const leagueStats = prev.leagueStats as any;
      const current: PbaConference = leagueStats?.pbaConference ?? 'philippine';
      const next = getNextConference(current);
      if (!next) {
        return {
          ...prev,
          leagueStats: { ...prev.leagueStats, pbaConferencePhase: 'offseason' },
          offseasonChecklist: initialPbaEndOfSeasonChecklist(),
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
    const { teamId, leagueId, seed, startDate, assistantGM } = action.payload as {
      teamId: number;
      leagueId: string;
      seed: EuroCareerSeed;
      startDate?: string;
      assistantGM?: boolean;
    };
    const initialSeasonYear = stateRef.current.leagueStats?.year ?? new Date().getFullYear() + 1;
    const euroStartIso = `${initialSeasonYear - 1}-07-01`;
    setState(prev => {
      const seasonYear = prev.leagueStats?.year ?? new Date().getFullYear() + 1;
      const signedYear = seasonYear - 1;
      const euroStartDate = new Date(Date.UTC(signedYear, 6, 1)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const teamFromState =
        prev.teams.find(team => getClubId(team) === teamId) ??
        (prev.nonNBATeams ?? []).find(team => getClubId(team) === teamId) ??
        seed.team;
      const teamName = getClubLabel(teamFromState);
      const seededSponsorships = buildSetupSponsorships(seed, signedYear);
      const teamStaff = seed.staff.map((member, index) => ({
        ...member,
        team: teamName,
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL ?? member.teamLogoUrl,
        isPlaceholder: true,
        reputation: (member as any).reputation ?? 65,
        id: `euro-setup-${teamId}-${member.position ?? member.jobTitle ?? index}`,
      }));
      const ownerStaff = {
        name: seed.owner.name,
        team: teamName,
        position: 'Owner',
        jobTitle: 'Owner',
        playerPortraitUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
        nationality: seed.owner.nationality,
        face: seed.owner.face,
        isPlaceholder: true,
      };
      const euroleagueGoal = isLicensedSpanishEuroleagueClub(teamFromState as any)
        ? 'You start every season in EuroLeague. The board expects you to stay competitive in Europe while fighting for the Liga Endesa title.'
        : isInitialSpanishEuroleagueWildcard(teamFromState as any)
          ? 'You begin with Spain\'s current EuroLeague invitation. Stay ahead of every other non-licensed Spanish club in Liga Endesa to keep that place.'
          : 'Your EuroLeague route is clear: finish as the highest non-licensed Spanish club in Liga Endesa and Spain\'s open invitation is yours next season.';
      const briefingEmail = {
        id: `euro-briefing-${teamId}-${seasonYear}`,
        sender: `${teamName} Board`,
        senderRole: 'Owner',
        subject: 'Five-Year Briefing',
        body: `${seed.owner.name} welcomes you to ${teamName}. ${euroleagueGoal}`,
        date: euroStartDate,
        read: false,
        replied: false,
        teamLogoUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
        playerPortraitUrl: (teamFromState as any)?.logoUrl ?? (teamFromState as any)?.imgURL,
      };
      const tycoonStaff = teamStaff.map((member, index) => ({
        id: `staff-${teamId}-${member.position ?? index}`,
        role: member.position ?? member.jobTitle ?? 'Staff',
        name: member.name,
        nationality: member.nationality,
        salary: getStaffMarketSalary(
          mapSetupTierToTycoonTier(seed.tier),
          member.position ?? member.jobTitle ?? 'Staff',
          (member as any).reputation ?? 65,
          {
            market: 'euro',
            yearsExperience: (member as any).yearsExperience ?? member.yearsWithTeam ?? 1,
            yearsWithTeam: member.yearsWithTeam ?? 1,
          },
        ),
        contractYears: Math.max(1, 4 - Math.min(3, member.yearsWithTeam ?? 1)),
        rating: (member as any).reputation ?? 65,
        hiredYear: signedYear,
        face: member.face,
      }));

      const teams = prev.teams.map(team => ({ ...team }));
      const nonNBATeams = (prev.nonNBATeams ?? []).map(team => ({ ...team }));
      const scaledPlayers = scaleEuroPlayerContracts(prev.players ?? []);
      const stockedPool = ensureStaffPoolDepth(
        { players: scaledPlayers.players, nonNBATeams: nonNBATeams as any, staffFreeAgents: [], saveId: prev.saveId } as any,
        leagueId,
      );
      const initialStaffPool = stockedPool.staffFreeAgents ?? [];
      migrateAllEuroTeams({
        teams,
        nonNBATeams,
        leagueStats: { ...(prev.leagueStats as any), uiMode: 'euro_isolated', year: seasonYear },
      });

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
        inbox: [briefingEmail as any, ...(prev.inbox ?? []).filter(email => email.id !== briefingEmail.id)],
        euroSetupSeed: {
          teamId,
          leagueId,
          masterSeed: seed.masterSeed,
          manualOverrides: seed.manualOverrides as unknown as Record<string, unknown>,
        },
        leagueStats: {
          ...prev.leagueStats,
          ...EURO_ISOLATED_DEFAULTS,
          transferMarket: {
            ...EURO_TRANSFER_MARKET_DEFAULTS,
            ...(prev.leagueStats?.transferMarket ?? {}),
            enabled: true,
          },
          autoOwnerSeeded: true,
          euroPayrollScaleHealed: true,
          staffPoolSeeded: true,
        },
        userTeamId: teamId,
        date: euroStartDate,
        offseasonChecklist: initialEuroOffseasonChecklist(),
        isProcessing: false,
      };
    });
    setState(prev => {
      if (prev.leagueStats?.uiMode !== 'euro_isolated') return prev;
      const tick = tickTransferMarket(prev);
      const academy = ensureEuroUserAcademyProspects(
        { ...prev, players: tick.players, teams: tick.teams, nonNBATeams: tick.nonNBATeams } as any,
        prev.leagueStats?.year ?? new Date().getFullYear(),
      );
      return {
        ...prev,
        transferListings: tick.transferListings,
        transferBids: tick.transferBids,
        transferActivity: tick.transferActivity,
        players: academy.players,
        teams: tick.teams,
        nonNBATeams: tick.nonNBATeams,
        ...(tick.historyEntries.length > 0 ? {
          history: [...(prev.history ?? []), ...tick.historyEntries] as any,
        } : {}),
      };
    });
    const targetStart = startDate ? normalizeDate(startDate) : null;
    if (targetStart && euroStartIso && targetStart > euroStartIso) {
      window.setTimeout(() => {
        dispatchAction({
          type: 'SIMULATE_TO_DATE',
          payload: {
            targetDate: targetStart,
            stopBefore: true,
            assistantGM: assistantGM === true,
            autoResolveOffseasonTasks: true,
          },
        } as any);
      }, 50);
    }
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
