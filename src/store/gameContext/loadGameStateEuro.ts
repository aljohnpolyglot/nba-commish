import { migrateAllEuroTeams } from '../../services/tycoon/migrate';
import { getStaffMarketSalary } from '../../services/tycoon/economyScale';
import { seedEuroCareer } from '../../services/euro/careerSeed';
import { EURO_ISOLATED_SALARY_CAP_USD, EURO_PLAYER_WAGE_SCALE, scaleEuroPlayerContracts } from '../../services/euro/payrollScale';
import { ensureStaffPoolDepth, hasStaffPoolDepth } from '../../services/euro/staffPool';
import { FICTIONAL_STAFF_LEAGUE_ID } from '../../services/fictionalStaffGenerator';
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import { initialEuroOffseasonChecklist } from '../../services/offseason/offseasonState';
import { mapSetupTierToTycoonTier } from '../../utils/tierMapping';
import { hasTwoWayContractMarker } from '../../utils/contractTypes';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { isExternalLeagueStatus } from '../../constants';
import { EURO_BASKETBALL_SOURCE_ARCHIVES } from '../../data/euroBasketballSources';
import { sanitizeEuroJerseyHistory } from '../../services/euro/jerseyHistory';
import { getEuroHistoricalEconomyFactor } from '../../services/euro/historicalEconomy';
import { getStaffImageUrl } from '../../utils/staffPortrait';
import {
  EURO_TRANSFER_MARKET_DEFAULTS,
  EURO_LOAN_MARKET_DEFAULTS,
  buildSetupSponsorships,
  getClubId,
  getClubLabel,
  mergeTycoonStaffMembers,
} from './loadGameStateShared';

function externalOffsetForStatus(status?: string): number | null {
  const euroSource = EURO_BASKETBALL_SOURCE_ARCHIVES.find(source => source.leagueStatus === status);
  if (euroSource) return euroSource.teamTidOffset;
  if (status === 'Euroleague') return 1000;
  if (status === 'PBA') return 2000;
  if (status === 'B-League') return 4000;
  if (status === 'Endesa') return 5000;
  if (status === 'China CBA') return 7000;
  if (status === 'NBL Australia') return 8000;
  return null;
}

function externalStatusForTid(tid: number): string | null {
  const euroSource = EURO_BASKETBALL_SOURCE_ARCHIVES.find(source => tid >= source.teamTidOffset && tid < source.teamTidOffset + 1000);
  if (euroSource) return euroSource.leagueStatus;
  if (tid >= 1000 && tid < 2000) return 'Euroleague';
  if (tid >= 2000 && tid < 3000) return 'PBA';
  if (tid >= 4000 && tid < 5000) return 'B-League';
  if (tid >= 5000 && tid < 6000) return 'Endesa';
  if (tid >= 7000 && tid < 8000) return 'China CBA';
  if (tid >= 8000 && tid < 9000) return 'NBL Australia';
  return null;
}

function isExternalPlayerRecord(player: any): boolean {
  return isExternalLeagueStatus(player?.status)
    || externalOffsetForStatus(player?.status) != null
    || externalStatusForTid(Number(player?.tid ?? -1)) != null;
}

function normalizeExternalPlayerPosition(player: any): boolean {
  if (!isExternalPlayerRecord(player)) return false;
  const normalized = normalizePositionLabel(player?.pos, Number(player?.hgt ?? player?.finalHgt));
  if (!normalized || normalized === player?.pos) return false;
  player.pos = normalized;
  return true;
}

function dedupeOneTimePayouts(team: any) {
  const payouts = team.tycoon?.oneTimePayouts;
  if (!Array.isArray(payouts) || payouts.length <= 1) return team;
  const seen = new Set<string>();
  const unique = payouts.filter((payout: any) => {
    const key = `${payout.year}-${payout.brand}-${payout.amount}-${payout.kind}-${payout.offerLabel ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length === payouts.length ? team : { ...team, tycoon: { ...team.tycoon, oneTimePayouts: unique } };
}

function getEuroStaffLeagueId(team: { league?: string } | null | undefined): string {
  const league = String(team?.league ?? '');
  if (league === 'Endesa') return 'endesa';
  if (league === 'Euroleague') return 'euroleague';
  return EURO_BASKETBALL_SOURCE_ARCHIVES.find(source => source.leagueStatus === league)?.leagueId ?? 'euroleague';
}

function healEuroUserTeamId(loaded: any, healedNonNBATeams: any[], healedUserTeamId: any) {
  if (loaded.gameMode !== 'gm') return healedUserTeamId;
  const pointsAtEuroClub = healedNonNBATeams.some((team: any) => team.tid === healedUserTeamId);
  if (pointsAtEuroClub) return healedUserTeamId;
  const seededTeamId = (loaded as any).euroSetupSeed?.teamId;
  const seededTeam = healedNonNBATeams.find((team: any) => team.tid === seededTeamId);
  const primaryTeamIds = (loaded.euroCompetitionTeamTids?.[loaded.euroPrimaryCompetitionId] ?? []) as number[];
  const primarySource = EURO_BASKETBALL_SOURCE_ARCHIVES.find(source => source.competitionId === loaded.euroPrimaryCompetitionId);
  const fallbackTeam = seededTeam
    ?? healedNonNBATeams.find((team: any) => primaryTeamIds.includes(team.tid))
    ?? healedNonNBATeams.find((team: any) => team.league === primarySource?.leagueStatus)
    ?? healedNonNBATeams.find((team: any) => EURO_BASKETBALL_SOURCE_ARCHIVES.some(source => source.leagueStatus === team.league))
    ?? healedNonNBATeams.find((team: any) => team.league === 'Endesa')
    ?? healedNonNBATeams.find((team: any) => team.league === 'Euroleague')
    ?? healedNonNBATeams[0];
  if (!fallbackTeam) return healedUserTeamId;
  console.log(`[LOAD_GAME] [euro] healed userTeamId ${healedUserTeamId} → ${fallbackTeam.tid} (${fallbackTeam.name})`);
  return fallbackTeam.tid;
}

export function applyEuroLoadHeals(params: {
  loaded: any;
  migratedLeagueStats: any;
  playersWithAISetup: any[];
  teamsWithFreshTraining: any[];
  healedNonNBATeams: any[];
  healedUserTeamId: any;
  healedOffseasonChecklist: any;
  healedStaff: any;
  healedEuroSetupSeed: any;
  healedStaffFreeAgents: any[];
}) {
  const {
    loaded,
    migratedLeagueStats,
  } = params;
  let {
    playersWithAISetup,
    teamsWithFreshTraining,
    healedNonNBATeams,
    healedUserTeamId,
    healedOffseasonChecklist,
    healedStaff,
    healedEuroSetupSeed,
    healedStaffFreeAgents,
  } = params;

  let strippedTwoWay = 0;
  let normalizedExternalTids = 0;
  let fixedExternalStatuses = 0;
  let normalizedExternalPositions = 0;
  let scaledEuroContracts = 0;
  if (!Number.isFinite(Number((migratedLeagueStats as any).historicalEconomyScale))) {
    const branchSeason = Number(
      loaded.euroStartSeason
      ?? (loaded.endesaStartYear != null ? Number(loaded.endesaStartYear) + 1 : undefined)
      ?? migratedLeagueStats.year,
    );
    (migratedLeagueStats as any).historicalEconomyScale = getEuroHistoricalEconomyFactor(branchSeason);
  }
  const teamLeagueByTid = new Map(healedNonNBATeams.map((team: any) => [Number(team.tid), String(team.league ?? '')] as const));
  for (const player of (loaded.players ?? [])) {
    const offset = externalOffsetForStatus((player as any).status);
    if (offset != null && player.tid >= 0 && player.tid < 100) {
      player.tid += offset;
      normalizedExternalTids++;
    }
    const expectedStatus = teamLeagueByTid.get(Number(player.tid)) || externalStatusForTid(player.tid);
    if (expectedStatus && (player as any).status !== expectedStatus) {
      (player as any).status = expectedStatus;
      fixedExternalStatuses++;
    }
    if (normalizeExternalPlayerPosition(player)) normalizedExternalPositions++;
    const hasTwoWay = hasTwoWayContractMarker(player);
    if ((hasTwoWay || (player as any).nonGuaranteed) && player.tid >= 100) {
      if (hasTwoWay) {
        player.twoWay = false;
        if (player.contract?.type === 'TWO_WAY') delete player.contract.type;
        strippedTwoWay++;
      }
      if ((player as any).nonGuaranteed) (player as any).nonGuaranteed = false;
    }
  }
  if (normalizedExternalTids > 0) console.log(`[LOAD_GAME] [euro] normalized ${normalizedExternalTids} legacy external player tids`);
  if (fixedExternalStatuses > 0) console.log(`[LOAD_GAME] [euro] fixed ${fixedExternalStatuses} external player status tags`);
  playersWithAISetup = playersWithAISetup.map((player: any) => {
    const before = player?.pos;
    const next = { ...player };
    if (normalizeExternalPlayerPosition(next) && next.pos !== before) normalizedExternalPositions++;
    return next;
  });
  loaded.players = (loaded.players ?? []).map((player: any) => ({ ...player }));
  const jerseyHeal = sanitizeEuroJerseyHistory(playersWithAISetup as any);
  if (jerseyHeal.strippedRows > 0) {
    playersWithAISetup = jerseyHeal.players;
    loaded.players = jerseyHeal.players;
    console.log(`[LOAD_GAME] [euro] removed ${jerseyHeal.strippedRows} table-rank values from Euro jersey history`);
  }
  if (normalizedExternalPositions > 0) console.log(`[LOAD_GAME] [euro] normalized ${normalizedExternalPositions} external player position labels`);
  if (strippedTwoWay > 0) console.log(`[LOAD_GAME] [euro] stripped twoWay flag from ${strippedTwoWay} roster players`);

  if (!(migratedLeagueStats as any).euroPayrollScaleHealed) {
    const scaled = scaleEuroPlayerContracts(playersWithAISetup as any, Number(migratedLeagueStats.year));
    playersWithAISetup = scaled.players;
    loaded.players = scaled.players;
    scaledEuroContracts = scaled.scaledCount;
    if (typeof (migratedLeagueStats as any).salaryCap === 'number' && (migratedLeagueStats as any).salaryCap > 0) {
      (migratedLeagueStats as any).salaryCap = Math.round((migratedLeagueStats as any).salaryCap * EURO_PLAYER_WAGE_SCALE);
    } else {
      (migratedLeagueStats as any).salaryCap = EURO_ISOLATED_SALARY_CAP_USD;
    }
    if (typeof (migratedLeagueStats as any).euroMinSalaryUSD === 'number' && (migratedLeagueStats as any).euroMinSalaryUSD > 0) {
      (migratedLeagueStats as any).euroMinSalaryUSD = Math.round((migratedLeagueStats as any).euroMinSalaryUSD * EURO_PLAYER_WAGE_SCALE);
    }
    if (typeof (migratedLeagueStats as any).euroMaxSalaryUSD === 'number' && (migratedLeagueStats as any).euroMaxSalaryUSD > 0) {
      (migratedLeagueStats as any).euroMaxSalaryUSD = Math.round((migratedLeagueStats as any).euroMaxSalaryUSD * EURO_PLAYER_WAGE_SCALE);
    }
    (migratedLeagueStats as any).euroPayrollScaleHealed = true;
  }
  if (scaledEuroContracts > 0) {
    console.log(`[LOAD_GAME] [euro] rescaled ${scaledEuroContracts} external player contracts for the Euro economy`);
  }

  healedUserTeamId = healEuroUserTeamId(loaded, healedNonNBATeams, healedUserTeamId);

  const migrated = migrateAllEuroTeams({
    teams: teamsWithFreshTraining as any,
    nonNBATeams: healedNonNBATeams,
    leagueStats: migratedLeagueStats as any,
  });
  if (migrated > 0) console.log(`[LOAD_GAME] [tycoon] migrated ${migrated} teams to tycoon state`);

  if ((migratedLeagueStats as any).quarterLength !== 10 || (migratedLeagueStats as any).numQuarters !== 4) {
    console.log(`[LOAD_GAME] [euro] healed quarterLength ${(migratedLeagueStats as any).quarterLength} → 10, numQuarters ${(migratedLeagueStats as any).numQuarters} → 4`);
    (migratedLeagueStats as any).quarterLength = 10;
    (migratedLeagueStats as any).numQuarters = 4;
  }
  (migratedLeagueStats as any).transferMarket = {
    ...EURO_TRANSFER_MARKET_DEFAULTS,
    ...((migratedLeagueStats as any).transferMarket ?? {}),
    enabled: true,
  };
  (migratedLeagueStats as any).loanMarket = {
    ...EURO_LOAN_MARKET_DEFAULTS,
    ...((migratedLeagueStats as any).loanMarket ?? {}),
    enabled: true,
  };

  teamsWithFreshTraining = teamsWithFreshTraining.map(dedupeOneTimePayouts);
  healedNonNBATeams = healedNonNBATeams.map(dedupeOneTimePayouts);
  const academyHeal = ensureEuroUserAcademyProspects(
    {
      ...loaded,
      leagueStats: migratedLeagueStats,
      userTeamId: healedUserTeamId,
      players: playersWithAISetup,
      teams: teamsWithFreshTraining,
      nonNBATeams: healedNonNBATeams,
    } as any,
    migratedLeagueStats?.year ?? new Date().getFullYear(),
  );
  if (academyHeal.additions.length > 0) {
    playersWithAISetup = academyHeal.players;
    console.log(`[LOAD_GAME] [euro] seeded ${academyHeal.additions.length} user academy prospect(s).`);
  }

  if (healedOffseasonChecklist && loaded.gameMode === 'gm' && !(loaded.seasonHistory?.length > 0)) {
    const checklist = healedOffseasonChecklist;
    if (checklist.freeAgency === 'pending' || checklist.trainingCamp === 'in-progress' || checklist.transferMarket !== 'done') {
      healedOffseasonChecklist = {
        ...initialEuroOffseasonChecklist(true),
        ...checklist,
      };
    }
  }

  if (loaded.gameMode === 'gm' && !(migratedLeagueStats as any).autoOwnerSeeded) {
    const teamId = (healedEuroSetupSeed as any)?.teamId ?? healedUserTeamId;
    const targetTeam =
      healedNonNBATeams.find((team: any) => getClubId(team) === teamId) ??
      teamsWithFreshTraining.find((team: any) => getClubId(team) === teamId);
    if (targetTeam) {
      const teamName = getClubLabel(targetTeam);
      const leagueId = getEuroStaffLeagueId(targetTeam as any);
      const masterSeed = (healedEuroSetupSeed as any)?.masterSeed
        ?? (((teamId || 1) * 2654435761) ^ ((migratedLeagueStats as any).year || 2026)) >>> 0;
      const seed = seedEuroCareer(
        { ...(targetTeam as any), id: getClubId(targetTeam), logoUrl: (targetTeam as any).logoUrl ?? (targetTeam as any).imgURL } as any,
        { players: loaded.players ?? [], nonNBATeams: healedNonNBATeams },
        leagueId,
        masterSeed || 1,
        Number((migratedLeagueStats as any).historicalEconomyScale ?? 1),
        Number((migratedLeagueStats as any).year ?? 2026),
      );
      const signedYear = ((migratedLeagueStats as any).year ?? 2026) - 1;
      const seededSponsorships = buildSetupSponsorships(seed, signedYear);
      const teamStaff = seed.staff.map((member, index) => ({
        ...member,
        team: teamName,
        teamLogoUrl: (targetTeam as any)?.logoUrl ?? (targetTeam as any)?.imgURL ?? member.teamLogoUrl,
        isPlaceholder: true,
        reputation: (member as any).reputation ?? 65,
        id: `euro-setup-${teamId}-${member.position ?? member.jobTitle ?? index}`,
      }));
      const ownerStaff = {
        name: seed.owner.name,
        team: teamName,
        position: 'Owner',
        jobTitle: 'Owner',
        playerPortraitUrl: getStaffImageUrl(seed.owner.staffImageId),
        teamLogoUrl: (targetTeam as any)?.logoUrl ?? (targetTeam as any)?.imgURL,
        nationality: seed.owner.nationality,
        face: seed.owner.face,
        isPlaceholder: true,
      };
      const tycoonStaff = teamStaff.map((member, index) => ({
        id: `staff-${teamId}-${member.position ?? index}`,
        role: member.position ?? member.jobTitle ?? 'Staff',
        name: member.name,
        nationality: member.nationality,
        salary: Math.round(getStaffMarketSalary(
          mapSetupTierToTycoonTier(seed.tier),
          member.position ?? member.jobTitle ?? 'Staff',
          (member as any).reputation ?? 65,
          {
            market: 'euro',
            yearsExperience: (member as any).yearsExperience ?? member.yearsWithTeam ?? 1,
            yearsWithTeam: member.yearsWithTeam ?? 1,
          },
        ) * Number((migratedLeagueStats as any).historicalEconomyScale ?? 1)),
        contractYears: Math.max(1, 4 - Math.min(3, member.yearsWithTeam ?? 1)),
        rating: (member as any).reputation ?? 65,
        hiredYear: signedYear,
        face: member.face,
        staffImageId: member.staffImageId,
        playerPortraitUrl: member.playerPortraitUrl,
        leagueId,
      }));
      const applySetup = (team: any) => {
        if (getClubId(team) !== teamId) return team;
        const existingTycoon = team.tycoon ?? {};
        const mergedTycoonStaff = mergeTycoonStaffMembers(existingTycoon.staffMembers, tycoonStaff);
        return {
          ...team,
          ownerProfile: seed.owner,
          startingTier: seed.tier,
          startingBudget: seed.budget,
          tycoon: {
            ...existingTycoon,
            tier: existingTycoon.tier ?? mapSetupTierToTycoonTier(seed.tier),
            cashOnHand: seed.budget,
            sponsorships: {
              ...(existingTycoon.sponsorships ?? {}),
              ...seededSponsorships,
            },
            staffMembers: mergedTycoonStaff,
          },
        };
      };
      teamsWithFreshTraining = teamsWithFreshTraining.map(applySetup);
      healedNonNBATeams = healedNonNBATeams.map(applySetup);
      healedStaff = {
        owners: [
          ...(healedStaff?.owners ?? []).filter((staffMember: any) => staffMember.team !== teamName && staffMember.team !== (targetTeam as any)?.name),
          ownerStaff,
        ],
        gms: healedStaff?.gms ?? [],
        coaches: [
          ...(healedStaff?.coaches ?? []).filter((staffMember: any) => staffMember.team !== teamName && staffMember.team !== (targetTeam as any)?.name),
          ...teamStaff,
        ],
        leagueOffice: healedStaff?.leagueOffice ?? [],
        referees: healedStaff?.referees,
      };
      healedEuroSetupSeed = {
        teamId,
        leagueId,
        masterSeed: seed.masterSeed,
        manualOverrides: (healedEuroSetupSeed as any)?.manualOverrides ?? {},
      };
      (migratedLeagueStats as any).autoOwnerSeeded = true;
      console.log(`[LOAD_GAME] [euro] healed owner/staff setup for ${teamName}`);
    }
  }

  if (loaded.gameMode === 'gm' && !(migratedLeagueStats as any).staffPoolSeeded) {
    const teamId = (healedEuroSetupSeed as any)?.teamId ?? healedUserTeamId;
    const poolTeam = healedNonNBATeams.find((team: any) => team.tid === teamId)
      ?? teamsWithFreshTraining.find((team: any) => team.id === teamId);
    const leagueId = (healedEuroSetupSeed as any)?.leagueId
      ?? getEuroStaffLeagueId(poolTeam as any);
    if (!hasStaffPoolDepth(healedStaffFreeAgents, leagueId)) {
      const seededState = ensureStaffPoolDepth(
        { players: loaded.players ?? [], nonNBATeams: healedNonNBATeams, teams: teamsWithFreshTraining ?? [], staffFreeAgents: healedStaffFreeAgents, saveId: loaded.saveId } as any,
        leagueId,
      );
      healedStaffFreeAgents = seededState.staffFreeAgents ?? [];
    }
    (migratedLeagueStats as any).staffPoolSeeded = true;
    console.log(`[LOAD_GAME] confirmed ${healedStaffFreeAgents.length} staff free agents for league=${leagueId}`);
  }

  return {
    playersWithAISetup,
    teamsWithFreshTraining,
    healedNonNBATeams,
    healedUserTeamId,
    healedOffseasonChecklist,
    healedStaff,
    healedEuroSetupSeed,
    healedStaffFreeAgents,
  };
}

export function ensureStandardStaffPool(loaded: any, migratedLeagueStats: any, healedNonNBATeams: any[], teamsWithFreshTraining: any[], healedStaffFreeAgents: any[]) {
  const uiMode = migratedLeagueStats?.uiMode;
  const leagueId = loaded.leagueType === 'fictional'
    ? FICTIONAL_STAFF_LEAGUE_ID
    : uiMode === 'pba_isolated' ? 'pba' : 'nba';
  const hasLeaguePool = hasStaffPoolDepth(healedStaffFreeAgents, leagueId);
  if (
    loaded.gameMode !== 'gm' ||
    uiMode === 'euro_isolated' ||
    hasLeaguePool
  ) {
    if (hasLeaguePool) {
      (migratedLeagueStats as any).staffPoolSeeded = true;
      if (leagueId === 'pba') (migratedLeagueStats as any).pbaStaffPoolSeeded = true;
    }
    return healedStaffFreeAgents;
  }
  const seededState = ensureStaffPoolDepth(
    { players: loaded.players ?? [], nonNBATeams: healedNonNBATeams, teams: teamsWithFreshTraining ?? [], staffFreeAgents: healedStaffFreeAgents ?? [], saveId: loaded.saveId, leagueStats: migratedLeagueStats } as any,
    leagueId,
  );
  (migratedLeagueStats as any).staffPoolSeeded = true;
  if (leagueId === 'pba') (migratedLeagueStats as any).pbaStaffPoolSeeded = true;
  const nextStaffFreeAgents = seededState.staffFreeAgents ?? [];
  console.log(`[LOAD_GAME] [${leagueId}] seeded ${nextStaffFreeAgents.length} staff free agents (min 10/position)`);
  return nextStaffFreeAgents;
}
