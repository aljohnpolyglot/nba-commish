import { migrateAllEuroTeams } from '../../services/tycoon/migrate';
import { getStaffMarketSalary } from '../../services/tycoon/economyScale';
import { seedEuroCareer } from '../../services/euro/careerSeed';
import { EURO_ISOLATED_SALARY_CAP_USD, EURO_PLAYER_WAGE_SCALE, scaleEuroPlayerContracts } from '../../services/euro/payrollScale';
import { ensureStaffPoolDepth } from '../../services/euro/staffPool';
import { tickTransferMarket } from '../../services/transfer/transferMarketTicker';
import { ensureEuroUserAcademyProspects } from '../../services/externalLeagueSustainer';
import { initialEuroOffseasonChecklist } from '../../services/offseason/offseasonState';
import { mapSetupTierToTycoonTier } from '../../utils/tierMapping';
import {
  EURO_TRANSFER_MARKET_DEFAULTS,
  buildSetupSponsorships,
  getClubId,
  getClubLabel,
  mergeTycoonStaffMembers,
} from './loadGameStateShared';

function externalOffsetForStatus(status?: string): number | null {
  if (status === 'Euroleague') return 1000;
  if (status === 'PBA') return 2000;
  if (status === 'B-League') return 4000;
  if (status === 'Endesa') return 5000;
  if (status === 'China CBA') return 7000;
  if (status === 'NBL Australia') return 8000;
  return null;
}

function externalStatusForTid(tid: number): string | null {
  if (tid >= 1000 && tid < 2000) return 'Euroleague';
  if (tid >= 2000 && tid < 3000) return 'PBA';
  if (tid >= 4000 && tid < 5000) return 'B-League';
  if (tid >= 5000 && tid < 6000) return 'Endesa';
  if (tid >= 7000 && tid < 8000) return 'China CBA';
  if (tid >= 8000 && tid < 9000) return 'NBL Australia';
  return null;
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

function healEuroUserTeamId(loaded: any, healedNonNBATeams: any[], healedUserTeamId: any) {
  if (loaded.gameMode !== 'gm') return healedUserTeamId;
  const pointsAtEuroClub = healedNonNBATeams.some((team: any) => team.tid === healedUserTeamId);
  if (pointsAtEuroClub) return healedUserTeamId;
  const seededTeamId = (loaded as any).euroSetupSeed?.teamId;
  const seededTeam = healedNonNBATeams.find((team: any) => team.tid === seededTeamId);
  const fallbackTeam = seededTeam
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
  let scaledEuroContracts = 0;
  for (const player of (loaded.players ?? [])) {
    const offset = externalOffsetForStatus((player as any).status);
    if (offset != null && player.tid >= 0 && player.tid < 100) {
      player.tid += offset;
      normalizedExternalTids++;
    }
    const expectedStatus = externalStatusForTid(player.tid);
    if (expectedStatus && (player as any).status !== expectedStatus) {
      (player as any).status = expectedStatus;
      fixedExternalStatuses++;
    }
    if ((player.twoWay || (player as any).nonGuaranteed) && player.tid >= 100) {
      if (player.twoWay) {
        player.twoWay = false;
        strippedTwoWay++;
      }
      if ((player as any).nonGuaranteed) (player as any).nonGuaranteed = false;
    }
  }
  if (normalizedExternalTids > 0) console.log(`[LOAD_GAME] [euro] normalized ${normalizedExternalTids} legacy external player tids`);
  if (fixedExternalStatuses > 0) console.log(`[LOAD_GAME] [euro] fixed ${fixedExternalStatuses} external player status tags`);
  if (strippedTwoWay > 0) console.log(`[LOAD_GAME] [euro] stripped twoWay flag from ${strippedTwoWay} roster players`);

  if (!(migratedLeagueStats as any).euroPayrollScaleHealed) {
    const scaled = scaleEuroPlayerContracts(playersWithAISetup as any);
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

  const activeListings = ((loaded as any).transferListings ?? []).filter((listing: any) => listing.status === 'active').length;
  if (activeListings === 0) {
    try {
      const seedState = { ...loaded, leagueStats: migratedLeagueStats, players: loaded.players, nonNBATeams: healedNonNBATeams } as any;
      const tick = tickTransferMarket(seedState);
      (loaded as any).transferListings = tick.transferListings;
      (loaded as any).transferBids = tick.transferBids;
      (loaded as any).transferActivity = tick.transferActivity;
      loaded.players = tick.players;
      healedNonNBATeams = tick.nonNBATeams;
      if (tick.historyEntries.length > 0) {
        (loaded as any).history = [...((loaded as any).history ?? []), ...tick.historyEntries];
      }
      console.log(`[LOAD_GAME] [euro] seeded ${tick.transferListings.filter((listing: any) => listing.status === 'active').length} initial transfer listings.`);
    } catch (error) {
      console.warn('[LOAD_GAME] [euro] initial transfer market seed failed', error);
    }
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
        ...initialEuroOffseasonChecklist(),
        transferMarket: checklist.transferMarket === 'done' || checklist.transferMarket === 'in-progress' ? checklist.transferMarket : 'pending',
        sponsorRenewals: checklist.sponsorRenewals === 'done' || checklist.sponsorRenewals === 'in-progress' ? checklist.sponsorRenewals : 'pending',
        facilityUpgrades: checklist.facilityUpgrades === 'done' || checklist.facilityUpgrades === 'in-progress' ? checklist.facilityUpgrades : 'pending',
        budgetLock: checklist.budgetLock === 'done' || checklist.budgetLock === 'in-progress' ? checklist.budgetLock : 'pending',
        preseasonFriendlies: checklist.preseasonFriendlies === 'done' || checklist.preseasonFriendlies === 'in-progress' ? checklist.preseasonFriendlies : 'pending',
        trainingCamp: checklist.trainingCamp === 'done' ? 'done' : 'pending',
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
      const leagueId = String((targetTeam as any).league ?? 'endesa').toLowerCase().includes('euro')
        ? 'euroleague'
        : 'endesa';
      const masterSeed = (healedEuroSetupSeed as any)?.masterSeed
        ?? (((teamId || 1) * 2654435761) ^ ((migratedLeagueStats as any).year || 2026)) >>> 0;
      const seed = seedEuroCareer(
        { ...(targetTeam as any), id: getClubId(targetTeam), logoUrl: (targetTeam as any).logoUrl ?? (targetTeam as any).imgURL } as any,
        { players: loaded.players ?? [], nonNBATeams: healedNonNBATeams },
        leagueId,
        masterSeed || 1,
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
        playerPortraitUrl: (targetTeam as any)?.logoUrl ?? (targetTeam as any)?.imgURL,
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
    const leagueId = (healedEuroSetupSeed as any)?.leagueId
      ?? (teamId >= 1000 && teamId < 1100 ? 'euroleague' : (teamId >= 5000 && teamId < 5100 ? 'endesa' : 'nba'));
    const seededState = ensureStaffPoolDepth(
      { players: loaded.players ?? [], nonNBATeams: healedNonNBATeams, teams: teamsWithFreshTraining ?? [], staffFreeAgents: [], saveId: loaded.saveId } as any,
      leagueId,
    );
    healedStaffFreeAgents = seededState.staffFreeAgents ?? [];
    (migratedLeagueStats as any).staffPoolSeeded = true;
    console.log(`[LOAD_GAME] seeded ${healedStaffFreeAgents.length} staff free agents (min 10/position) for league=${leagueId}`);
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
  if (
    loaded.gameMode !== 'gm' ||
    migratedLeagueStats?.uiMode === 'euro_isolated' ||
    (migratedLeagueStats as any).staffPoolSeeded
  ) {
    return healedStaffFreeAgents;
  }
  const seededState = ensureStaffPoolDepth(
    { players: loaded.players ?? [], nonNBATeams: healedNonNBATeams, teams: teamsWithFreshTraining ?? [], staffFreeAgents: [], saveId: loaded.saveId } as any,
    'nba',
  );
  (migratedLeagueStats as any).staffPoolSeeded = true;
  const nextStaffFreeAgents = seededState.staffFreeAgents ?? [];
  console.log(`[LOAD_GAME] [nba] seeded ${nextStaffFreeAgents.length} staff free agents (min 10/position)`);
  return nextStaffFreeAgents;
}
