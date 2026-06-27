import type { GameState, OffseasonChecklist } from '../../types';
import { EXTERNAL_LEAGUE_OVR_CAP, PBA_ISOLATED_DEFAULTS } from '../../constants';
import { normalizeDate } from '../../utils/helpers';
import { repairGeneratedExternalPlayer, enforceExternalMinRoster } from '../../services/externalLeagueSustainer';
import { applyCupAwardsToPlayers } from '../../services/nbaCup/awards';
import { defaultAwardSettings } from '../../services/awards/AwardEngine';
import { computeRookieSalaryUSD } from '../../utils/rookieContractUtils';
import { isPlausibleActiveMarket, MAX_FA_MARKET_DECISION_WINDOW_DAYS } from '../../services/freeAgencyBidding';
import { hasLiveContractAfterWaive, stripLiveContractAfterWaive } from '../../utils/contractCleanup';
import { repairBirdRightsForLoadedPlayer } from '../../utils/playerBirdRights';
import { resolveYearsWithCurrentTeamFromStats } from '../../utils/playerTenure';
import { isNoDraftLeague } from '../../services/offseason/offseasonState';
import { initialState } from '../initialState';
import { deriveOfficialNbaRecords } from '../../utils/nbaOfficialRecords';
import { generateFuturePicksForTeamIds } from '../../services/draft/DraftPickGenerator';
import { computeContractOffer, getContractLimits } from '../../utils/salaryUtils';
import { buildPbaImportContractMetadata, isPbaRosterLocal, isRegisteredPbaRosterIdentity } from '../../services/pba/importManager';
import { attachPbaStaffToTeam } from '../../services/pba/staffSources';
import { computeLocalPBASalaryUSD, getPBARosterEconomyConfig } from '../../services/externalRosterService';
import { ensureDraftClasses } from '../../services/draftClassFiller';
import { buildPbaCollegePoolFromSource } from '../../services/pba/collegeSources';
import { tunePbaDraftProspects } from '../../services/pba/draftRules';
import { getPbaCompetitionIdForConference, isPbaActiveConferenceMode, isPbaActiveConferencePhase } from '../../utils/uiMode';
import { getPbaRosterPortrait } from '../../services/pba/portraits';

const EXTERNAL_STATUSES_SET = new Set(['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
const DEAD_MONEY_FLOOR_USD = 50_000;
const NBA_TO_FICTIONAL_HANDLES: Record<string, string> = {
  nba: 'TheLeagueOfficial',
  NBA: 'TheLeagueOfficial',
  wojespn: 'KowalskiESPN',
  ShamsCharania: 'TariqHassan',
  shamscharania: 'TariqHassan',
};

const PBA_LEGACY_ECONOMY_CAP_FLOOR = 1_000_000;
const PBA_CONFERENCES = new Set(['philippine', 'commissioners', 'governors']);
const PBA_CONFERENCE_PHASES = new Set(['regularSeason', 'playoffs', 'offseason', 'complete']);

export function healPbaEconomySettings(leagueStats: any) {
  if (leagueStats?.uiMode !== 'pba_isolated') return leagueStats;
  let changed = false;
  const next = { ...leagueStats };
  const salaryCap = Number(next.salaryCap ?? 0);
  const minContract = Number(next.minContractStaticAmount ?? 0);
  if (!Number.isFinite(salaryCap) || salaryCap <= 0 || salaryCap >= PBA_LEGACY_ECONOMY_CAP_FLOOR) {
    next.salaryCap = PBA_ISOLATED_DEFAULTS.salaryCap;
    changed = true;
  }
  if (!Number.isFinite(minContract) || minContract <= 0 || minContract >= 0.25) {
    next.minContractStaticAmount = PBA_ISOLATED_DEFAULTS.minContractStaticAmount;
    changed = true;
  }
  if (Number(next.maxContractStaticPercentage ?? 0) < 30) {
    next.maxContractStaticPercentage = PBA_ISOLATED_DEFAULTS.maxContractStaticPercentage;
    changed = true;
  }
  const forced = {
    salaryCapEnabled: false,
    salaryCapType: 'none',
    luxuryTaxEnabled: false,
    apronsEnabled: false,
    minimumPayrollEnabled: false,
    twoWayContractsEnabled: false,
    maxTwoWayPlayersPerTeam: 0,
    maxPlayersPerTeam: PBA_ISOLATED_DEFAULTS.maxPlayersPerTeam,
    maxStandardPlayersPerTeam: PBA_ISOLATED_DEFAULTS.maxStandardPlayersPerTeam,
    maxTrainingCampRoster: PBA_ISOLATED_DEFAULTS.maxTrainingCampRoster,
    mleEnabled: false,
    biannualEnabled: false,
    playerOptionsEnabled: false,
    inflationEnabled: false,
    pbaLocalEligibilityMode: next.pbaLocalEligibilityMode ?? PBA_ISOLATED_DEFAULTS.pbaLocalEligibilityMode,
  };
  for (const [key, value] of Object.entries(forced)) {
    if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (changed) console.log('[LOAD_GAME] Healed PBA economy settings.');
  return changed ? next : leagueStats;
}

function dedupePlayerStats(stats: any[] | undefined) {
  if (!stats?.length) return stats ?? [];
  const grouped = new Map<string, any[]>();
  for (const row of stats) {
    const key = `${row.season}|${row.tid}|${row.playoffs ? 1 : 0}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }
  return Array.from(grouped.values()).map(rows =>
    rows.reduce((best, row) => ((row?.gp ?? 0) > (best?.gp ?? 0) ? row : best), rows[0]),
  );
}

function isBadPortrait(player: any) {
  if (!player.imgURL) return false;
  if (player.imgURL.includes('head-par-defaut')) return true;
  if (EXTERNAL_STATUSES_SET.has(player.status ?? '') && player.imgURL.includes('cdn.nba.com/headshots') && !player.srID) return true;
  return false;
}

function clampExternalLeaguePlayer(player: any) {
  if (player?.status === 'PBA') return player;
  const cap = EXTERNAL_LEAGUE_OVR_CAP[player?.status as keyof typeof EXTERNAL_LEAGUE_OVR_CAP];
  if (cap === undefined) return player;
  const overallRating = Math.min(Number(player?.overallRating ?? 0), cap);
  const ratings = Array.isArray(player?.ratings) ? [...player.ratings] : undefined;
  if (ratings?.length) {
    const lastIndex = ratings.length - 1;
    const last = ratings[lastIndex];
    if (last && typeof last.ovr === 'number' && last.ovr > cap) {
      ratings[lastIndex] = { ...last, ovr: cap };
    }
  }
  return {
    ...player,
    overallRating,
    ...(ratings ? { ratings } : {}),
  };
}

function recoverAmountFromContractYears(player: any, currentSeasonStr: string, saneGuaranteedCapUsd: number, saneContractCapThousands: number): number | undefined {
  const contractYears = player.contractYears as Array<{ season: string; guaranteed: number }> | undefined;
  if (!Array.isArray(contractYears) || contractYears.length === 0) return undefined;
  const exact = contractYears.find(entry => entry.season === currentSeasonStr);
  const candidates: number[] = [];
  if (exact && exact.guaranteed > 0 && exact.guaranteed <= saneGuaranteedCapUsd) {
    candidates.push(Math.round(exact.guaranteed / 1000));
  }
  for (const entry of contractYears) {
    if (entry === exact) continue;
    if (entry.guaranteed > 0 && entry.guaranteed <= saneGuaranteedCapUsd) {
      candidates.push(Math.round(entry.guaranteed / 1000));
    }
  }
  return candidates.find(value => value > 0 && value <= saneContractCapThousands);
}

export function migrateLoadedPlayers(loaded: any, currentSeasonYear: number) {
  const currentSeasonStr = `${currentSeasonYear - 1}-${String(currentSeasonYear).slice(-2)}`;
  const saneContractCapThousands = 250_000;
  const saneGuaranteedCapUsd = 250_000_000;
  const pbaDraftRoundSize = loaded.leagueStats?.uiMode === 'pba_isolated'
    ? Math.max(1, (loaded.nonNBATeams ?? []).filter((team: any) => team?.league === 'PBA').length || 12)
    : 30;
  let normalizedFreeAgentTypoCount = 0;
  let healedWaivedGhostContractCount = 0;

  const migratedPlayers = (loaded.players as any[] | undefined)?.map(player => {
    const pbaPortrait = player?.status === 'PBA' && /^pba-\d+-/.test(String(player?.internalId ?? ''))
      ? getPbaRosterPortrait(player.name)
      : undefined;
    let updated = pbaPortrait && (!player.imgURL || isBadPortrait(player))
      ? { ...player, imgURL: pbaPortrait }
      : isBadPortrait(player) ? { ...player, imgURL: undefined } : player;
    updated = repairGeneratedExternalPlayer(updated as any, currentSeasonYear) as any;
    updated = clampExternalLeaguePlayer(updated);
    if (updated.contract && Array.isArray(updated.contractYears)) {
      const entry = updated.contractYears.find((contractYear: any) => contractYear.season === currentSeasonStr);
      if (entry && entry.guaranteed > 0 && entry.guaranteed <= saneGuaranteedCapUsd) {
        const syncedAmount = Math.round(entry.guaranteed / 1000);
        if (syncedAmount > 0 && syncedAmount <= saneContractCapThousands && syncedAmount !== updated.contract.amount) {
          updated = { ...updated, contract: { ...updated.contract, amount: syncedAmount } };
        }
      }
    }
    if (
      updated.contract?.rookie &&
      updated.draft?.round && updated.draft?.pick &&
      updated.draft?.year &&
      typeof updated.contract.amount === 'number' &&
      updated.contract.amount > saneContractCapThousands
    ) {
      const round = Number(updated.draft.round);
      const pickInRound = Number(updated.draft.pick);
      const pickSlot = (round - 1) * pbaDraftRoundSize + pickInRound;
      const fixedUsd = computeRookieSalaryUSD(pickSlot, loaded.leagueStats, pbaDraftRoundSize);
      const fixedAmount = Math.round(fixedUsd / 1000);
      const draftYear = Number(updated.draft.year);
      const expYear = Number(updated.contract.exp ?? 0);
      const totalYears = expYear > draftYear && expYear - draftYear <= 6 ? expYear - draftYear : null;
      const teamOptionExp = updated.contract.teamOptionExp;
      const firstOptionYear = updated.contract.hasTeamOption && teamOptionExp ? Number(teamOptionExp) : undefined;
      const rebuiltContractYears = totalYears
        ? Array.from({ length: totalYears }, (_, i) => {
            const year = draftYear + i;
            const leagueYear = year + 1;
            return {
              season: `${year}-${String(year + 1).slice(-2)}`,
              guaranteed: Math.round(fixedUsd * Math.pow(1.05, i)),
              option: firstOptionYear != null && leagueYear >= firstOptionYear ? 'Team' : '',
            };
          })
        : updated.contractYears;
      console.warn(`[LOAD_GAME] Repaired inflated rookie contract for ${updated.name}: ${updated.contract.amount} → ${fixedAmount}`);
      updated = {
        ...updated,
        contract: { ...updated.contract, amount: fixedAmount },
        ...(rebuiltContractYears ? { contractYears: rebuiltContractYears } : {}),
      };
    }
    const amount = updated.contract?.amount;
    if (updated.contract && typeof amount === 'number' && (amount > saneContractCapThousands || amount < 0 || !Number.isFinite(amount))) {
      const recovered = recoverAmountFromContractYears(updated, currentSeasonStr, saneGuaranteedCapUsd, saneContractCapThousands) ?? 1300;
      console.warn(`[LOAD_GAME] Repaired corrupt contract.amount for ${updated.name}: ${amount} → ${recovered}`);
      updated = { ...updated, contract: { ...updated.contract, amount: recovered } };
    }
    const liveContractYears = Array.isArray(updated.contractYears)
      ? updated.contractYears.filter((contractYear: any) => {
          const seasonStart = parseInt(String(contractYear?.season ?? '').split('-')[0], 10);
          return Number.isFinite(seasonStart) && seasonStart + 1 >= currentSeasonYear;
        })
      : [];
    const currentSeasonContractYear = liveContractYears.find((contractYear: any) => contractYear.season === currentSeasonStr)
      ?? liveContractYears[0];
    const currentGuaranteedUSD = Number(currentSeasonContractYear?.guaranteed ?? 0);
    const shouldInferLegacyTwoWay =
      loaded.leagueStats?.uiMode !== 'euro_isolated' &&
      !updated.twoWay &&
      !updated.nonGuaranteed &&
      updated.tid >= 0 &&
      updated.status === 'Active' &&
      !updated.contract?.rookie &&
      (updated.contract?.amount ?? 0) > 0 &&
      (updated.contract?.amount ?? 9999) <= 700 &&
      currentGuaranteedUSD > 0 &&
      currentGuaranteedUSD <= 700_000 &&
      liveContractYears.length <= 1;
    if (shouldInferLegacyTwoWay) {
      updated = { ...updated, twoWay: true };
    }
    if ((updated as any).status === 'FreeAgent') {
      updated = { ...updated, status: 'Free Agent' };
      normalizedFreeAgentTypoCount++;
    }
    if (updated.tid === -1 && updated.status === 'Free Agent' && updated.recentlyWaivedDate) {
      if (hasLiveContractAfterWaive(updated, currentSeasonYear)) {
        healedWaivedGhostContractCount++;
        updated = {
          ...stripLiveContractAfterWaive(updated, currentSeasonYear),
          twoWay: undefined,
          nonGuaranteed: false,
          gLeagueAssigned: false,
          mleSignedVia: undefined,
          hasBirdRights: false,
          yearsWithTeam: 0,
          signedDate: undefined,
          tradeEligibleDate: undefined,
        };
      }
    }
    if (updated.contract?.hasTeamOption && updated.draft?.year) {
      const draftYear = Number(updated.draft.year);
      const guaranteedYears = loaded.leagueStats?.rookieContractLength ?? 2;
      if (updated.contract.teamOptionExp === draftYear + guaranteedYears) {
        updated = {
          ...updated,
          contract: {
            ...updated.contract,
            teamOptionExp: draftYear + guaranteedYears + 1,
            exp: (updated.contract.exp ?? 0) + 1,
          },
        };
      }
    }
    if (
      updated.contract?.rookie &&
      updated.draft?.year &&
      updated.contract?.exp &&
      (!Array.isArray(updated.contractYears) || updated.contractYears.length === 0)
    ) {
      const draftYear = Number(updated.draft.year);
      const expYear = Number(updated.contract.exp);
      const totalYears = expYear - draftYear;
      if (totalYears > 0 && totalYears <= 6) {
        const baseUsd = (updated.contract.amount ?? 0) * 1000;
        if (baseUsd > 0) {
          const teamOptionExp = updated.contract.teamOptionExp as number | undefined;
          const firstOptionYear = updated.contract.hasTeamOption && teamOptionExp ? teamOptionExp : undefined;
          const backfilled = Array.from({ length: totalYears }, (_, i) => {
            const year = draftYear + i;
            const leagueYear = year + 1;
            return {
              season: `${year}-${String(year + 1).slice(-2)}`,
              guaranteed: Math.round(baseUsd * Math.pow(1.05, i)),
              option: firstOptionYear != null && leagueYear >= firstOptionYear ? 'Team' : '',
            };
          });
          updated = { ...updated, contractYears: backfilled };
        }
      }
    }
    if (
      updated.tid >= 0 && updated.tid < 100 &&
      updated.contract?.amount &&
      updated.contract?.exp &&
      (!Array.isArray((updated as any).contractYears) || (updated as any).contractYears.length === 0) &&
      !updated.contract.rookie
    ) {
      const exp = updated.contract.exp as number;
      const amountValue = updated.contract.amount as number;
      if (amountValue > 0 && exp >= currentSeasonYear) {
        const salaryUsd = amountValue * 1_000;
        const backfilled = Array.from({ length: exp - currentSeasonYear + 1 }, (_, i) => {
          const year = currentSeasonYear + i;
          return {
            season: `${year - 1}-${String(year).slice(-2)}`,
            guaranteed: Math.round(salaryUsd * Math.pow(1.05, i)),
            option: '',
          };
        });
        updated = { ...updated, contractYears: backfilled } as any;
      }
    }
    if ((updated as any).status === 'Retired' && !(updated as any).diedYear) {
      const currentAge = currentSeasonYear - ((updated as any).born?.year ?? 2000);
      if (currentAge > 95) {
        const assumedDeathAge = Math.max(85, currentAge - 8);
        updated = { ...updated, diedYear: ((updated as any).born?.year ?? 2000) + assumedDeathAge } as any;
      }
    }
    return updated;
  }) ?? loaded.players;

  if (normalizedFreeAgentTypoCount > 0) {
    console.log(`[LOAD_GAME] Healed ${normalizedFreeAgentTypoCount} legacy 'FreeAgent' status records → 'Free Agent'.`);
  }
  if (healedWaivedGhostContractCount > 0) {
    console.log(`[LOAD_GAME] Healed ${healedWaivedGhostContractCount} waived FA ghost contract(s).`);
  }

  return migratedPlayers;
}

function isFilipinoPbaPlayer(player: any): boolean {
  const explicit = String(player?.born?.country ?? player?.nationality ?? '').toLowerCase();
  const loc = String(player?.born?.loc ?? '').toLowerCase();
  return explicit.includes('philippines') || loc.includes('philippines');
}

function hasPbaNationalityInfo(player: any): boolean {
  return Boolean(player?.born?.country || player?.nationality || player?.born?.loc);
}

function currentSeasonLabel(seasonYear: number) {
  return `${seasonYear - 1}-${String(seasonYear).slice(-2)}`;
}

function rebuildLiveContractYears(player: any, currentSeasonYear: number, salaryUSD: number) {
  const exp = Math.max(Number(player?.contract?.exp ?? currentSeasonYear), currentSeasonYear);
  const currentLabel = currentSeasonLabel(currentSeasonYear);
  const liveSeasonSet = new Set<string>();
  const patched = Array.isArray(player?.contractYears)
    ? player.contractYears.map((row: any) => {
        const seasonStart = parseInt(String(row?.season ?? '').split('-')[0], 10);
        const seasonYear = Number.isFinite(seasonStart) ? seasonStart + 1 : 0;
        if (seasonYear < currentSeasonYear || seasonYear > exp) return row;
        liveSeasonSet.add(row.season);
        const idx = Math.max(0, seasonYear - currentSeasonYear);
        return {
          ...row,
          guaranteed: Math.round(salaryUSD * Math.pow(1.05, idx)),
        };
      })
    : [];
  const additions = Array.from({ length: exp - currentSeasonYear + 1 }, (_, i) => {
    const seasonYear = currentSeasonYear + i;
    const season = currentSeasonLabel(seasonYear);
    if (liveSeasonSet.has(season)) return null;
    return {
      season,
      guaranteed: Math.round(salaryUSD * Math.pow(1.05, i)),
      option: '',
    };
  }).filter(Boolean);
  if (patched.length === 0 && additions.length === 0) {
    return [{
      season: currentLabel,
      guaranteed: salaryUSD,
      option: '',
    }];
  }
  return [...patched, ...additions].sort((a: any, b: any) => String(a.season).localeCompare(String(b.season)));
}

export function healLoadedPbaContracts(players: any[], leagueStats: any, currentSeasonYear: number, nonNBATeams: any[] = []) {
  if (leagueStats?.uiMode !== 'pba_isolated') return players;
  const pbaTeamIds = new Set((nonNBATeams ?? []).filter((team: any) => team?.league === 'PBA').map((team: any) => Number(team?.tid ?? team?.id)));
  let healed = 0;
  const nextPlayers = (players ?? []).map((player: any) => {
    if (!player?.contract || Number(player?.tid ?? -1) < 0) return player;
    const isPbaPlayer = player.status === 'PBA' || pbaTeamIds.has(Number(player.tid));
    if (!isPbaPlayer) return player;
    const currentSalaryUSD = Number(player.contract.amount ?? 0) * 1_000;
    if (!Number.isFinite(currentSalaryUSD) || currentSalaryUSD <= 0) return player;
    const registeredLocal = isFilipinoPbaPlayer(player) || isRegisteredPbaRosterIdentity(player);
    const staleLocalFlag = !!player.pbaLocalEligible && !registeredLocal;
    const classificationPlayer = staleLocalFlag ? { ...player, pbaLocalEligible: undefined } : player;
    const explicitImport = !!player.isImport || !isPbaRosterLocal(classificationPlayer, leagueStats);
    const currentConference = String(player.importConference ?? leagueStats?.pbaConference ?? '');
    const canRestoreConferenceImport = currentConference === 'commissioners' || currentConference === 'governors';
    const shouldRestoreImport = explicitImport && pbaTeamIds.has(Number(player.tid)) && canRestoreConferenceImport;
    if (shouldRestoreImport && !isPbaActiveConferencePhase(leagueStats?.pbaConferencePhase)) {
      healed++;
      return {
        ...player,
        ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
        tid: -1,
        status: 'Free Agent',
        isImport: undefined,
        importConference: undefined,
        importTeamId: undefined,
        pbaImportContract: {
          ...(player.pbaImportContract ?? {}),
          status: 'released',
          releaseDate: player.pbaImportContract?.releaseDate ?? undefined,
        },
        contract: undefined,
      };
    }
    const hasActiveConferenceImportContract =
      shouldRestoreImport &&
      !!player.pbaImportContract &&
      player.pbaImportContract.status !== 'released';
    if (hasActiveConferenceImportContract) {
      if (staleLocalFlag || !player.isImport || player.importConference !== currentConference || Number(player.importTeamId ?? player.tid) !== Number(player.tid)) {
        healed++;
        return {
          ...player,
          ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
          isImport: true,
          importConference: currentConference,
          importTeamId: Number(player.tid),
          pbaImportContract: player.pbaImportContract,
        };
      }
      return player;
    }
    const isImport = explicitImport;
    const limits = getContractLimits(player, leagueStats);
    const offer = computeContractOffer(player, leagueStats);
    const ratings = Array.isArray(player.ratings) ? player.ratings : [];
    const pbaOvr = Number(player.overallRating ?? ratings[ratings.length - 1]?.ovr ?? 55);
    const pbaEconomy = getPBARosterEconomyConfig(leagueStats, 'pba_isolated');
    const targetSalaryUSD = isImport
      ? Math.min(limits.maxSalaryUSD, Math.max(limits.minSalaryUSD, offer.salaryUSD))
      : computeLocalPBASalaryUSD(pbaOvr, pbaEconomy, player, currentSeasonYear);
    if (currentSalaryUSD >= targetSalaryUSD * 0.98 && currentSalaryUSD <= targetSalaryUSD * 1.02) return player;
    healed++;
    return {
      ...player,
      ...(staleLocalFlag ? { pbaLocalEligible: undefined } : {}),
      ...(!explicitImport && registeredLocal ? { pbaLocalEligible: true } : {}),
      ...(shouldRestoreImport ? {
        isImport: true,
        importConference: currentConference,
        importTeamId: Number(player.tid),
        pbaImportContract: player.pbaImportContract ?? buildPbaImportContractMetadata(Number(player.tid), currentConference as any, undefined),
      } : {}),
      contract: {
        ...player.contract,
        amount: Math.round(targetSalaryUSD / 1_000),
      },
      contractYears: rebuildLiveContractYears(player, currentSeasonYear, targetSalaryUSD),
    };
  });
  if (healed > 0) console.log(`[LOAD_GAME] Healed ${healed} PBA contract salary row(s).`);
  return nextPlayers;
}

export function healLoadedPbaDraftProspects(players: any[], leagueStats: any, currentSeasonYear: number) {
  if (leagueStats?.uiMode !== 'pba_isolated') return players;
  const pbaCollegePool = buildPbaCollegePoolFromSource(players as any);
  const fillResult = ensureDraftClasses(
    players as any,
    currentSeasonYear,
    leagueStats?.draftEligibilityRule,
    'regen_pack',
    {
      collegePool: pbaCollegePool,
      nationalityOverride: 'Philippines',
      forceCollegePath: true,
    },
  );
  const merged = fillResult.additions.length > 0 ? [...players, ...fillResult.additions] : players;
  if (fillResult.additions.length > 0) {
    console.log(`[LOAD_GAME] Seeded ${fillResult.additions.length} missing PBA draft prospect(s).`, fillResult.generatedByYear);
  }
  return tunePbaDraftProspects(merged as any, currentSeasonYear, leagueStats);
}

export function finalizeLoadedPlayers(loaded: any, players: any[], currentSeasonYear: number) {
  let healedPhantomUserRosterCount = 0;
  const loadedPlayers = (players as any[]).map((player: any) => {
    const userTid = loaded.gameMode === 'gm' ? Number(loaded.userTeamId) : -999;
    const normalizedStats = dedupePlayerStats(player.stats);
    if (!Number.isFinite(userTid) || player.tid !== userTid || player.status !== 'Free Agent') {
      return normalizedStats === player.stats ? player : { ...player, stats: normalizedStats };
    }
    const hasCommittedContract =
      !!player.contract &&
      Number(player.contract.amount ?? 0) > 0 &&
      Number(player.contract.exp ?? 0) >= currentSeasonYear;
    if (hasCommittedContract) {
      return normalizedStats === player.stats ? player : { ...player, stats: normalizedStats };
    }
    healedPhantomUserRosterCount++;
    return {
      ...player,
      stats: normalizedStats,
      tid: -1,
      twoWay: undefined,
      nonGuaranteed: false,
      gLeagueAssigned: false,
      signedDate: undefined,
      tradeEligibleDate: undefined,
    };
  });
  if (healedPhantomUserRosterCount > 0) {
    console.warn(`[LOAD_GAME] Released ${healedPhantomUserRosterCount} phantom user-roster FA(s) back to free agency.`);
  }

  const { additions: externalRosterRepairs } = enforceExternalMinRoster({
    ...loaded,
    players: loadedPlayers,
  } as any, currentSeasonYear);
  const finalPlayers = (
    externalRosterRepairs.length > 0
      ? [...loadedPlayers, ...externalRosterRepairs]
      : loadedPlayers
  ).map((player: any) => {
    const repaired = repairBirdRightsForLoadedPlayer(player);
    const rebuiltYearsWithTeam = resolveYearsWithCurrentTeamFromStats(repaired);
    return rebuiltYearsWithTeam === Number((repaired as any).yearsWithTeam ?? 0)
      ? repaired
      : { ...repaired, yearsWithTeam: rebuiltYearsWithTeam };
  });

  const allHistoricalCups = Object.values((loaded.nbaCupHistory ?? {}) as Record<string, any>);
  if (loaded.nbaCup?.mvpPlayerId) allHistoricalCups.push(loaded.nbaCup);
  const backfilledPlayers = allHistoricalCups.reduce(
    (acc: any[], cup: any) => cup?.mvpPlayerId || cup?.allTournamentTeam?.length || cup?.championTid != null
      ? applyCupAwardsToPlayers(cup, acc)
      : acc,
    finalPlayers,
  );

  return { finalPlayers, backfilledPlayers };
}

const normalizeDuplicateName = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const playerCareerGames = (player: any): number =>
  Array.isArray(player?.stats)
    ? player.stats.reduce((sum: number, stat: any) => sum + Number(stat?.gp ?? 0), 0)
    : 0;

const duplicatePriority = (player: any, currentSeasonYear: number): number => {
  const draftYear = Number(player?.draft?.year ?? 0);
  const currentClassPenalty = Number.isFinite(draftYear) && draftYear >= currentSeasonYear ? -2000 : 0;
  const prospectPenalty = player?.tid === -2 || player?.status === 'Draft Prospect' || player?.status === 'Prospect' ? -1500 : 0;
  const activeBonus = player?.tid >= 0 ? 400 : 0;
  const pbaBonus = player?.status === 'PBA' ? 250 : 0;
  const gamesBonus = playerCareerGames(player);
  const ageBonus = Number(player?.age ?? 0);
  return currentClassPenalty + prospectPenalty + activeBonus + pbaBonus + gamesBonus + ageBonus;
};

const makeUniqueDuplicateId = (baseId: string, usedIds: Set<string>): string => {
  let attempt = 2;
  let candidate = `${baseId}--dup-${attempt}`;
  while (usedIds.has(candidate)) {
    attempt += 1;
    candidate = `${baseId}--dup-${attempt}`;
  }
  usedIds.add(candidate);
  return candidate;
};

export function healDuplicatePlayerInternalIds(players: any[], boxScores: any[], currentSeasonYear: number) {
  const groups = new Map<string, any[]>();
  for (const player of players ?? []) {
    const id = String(player?.internalId ?? '');
    if (!id) continue;
    const bucket = groups.get(id) ?? [];
    bucket.push(player);
    groups.set(id, bucket);
  }

  const duplicateGroups = [...groups.entries()].filter(([, bucket]) => bucket.length > 1);
  if (duplicateGroups.length === 0) {
    return { players, boxScores };
  }

  const usedIds = new Set(
    (players ?? [])
      .map((player: any) => String(player?.internalId ?? ''))
      .filter((id: string) => id.length > 0),
  );
  const replacementByPlayer = new Map<any, string>();
  const metaByOldId = new Map<string, Array<{ currentId: string; nameKey: string; tid: number }>>();
  let renamedPlayers = 0;

  for (const [oldId, bucket] of duplicateGroups) {
    const ordered = [...bucket].sort((a, b) => duplicatePriority(b, currentSeasonYear) - duplicatePriority(a, currentSeasonYear));
    const canonical = ordered[0];
    const meta: Array<{ currentId: string; nameKey: string; tid: number }> = [{
      currentId: oldId,
      nameKey: normalizeDuplicateName(canonical?.name),
      tid: Number(canonical?.tid ?? NaN),
    }];
    for (let index = 1; index < ordered.length; index++) {
      const player = ordered[index];
      const nextId = makeUniqueDuplicateId(oldId, usedIds);
      replacementByPlayer.set(player, nextId);
      meta.push({
        currentId: nextId,
        nameKey: normalizeDuplicateName(player?.name),
        tid: Number(player?.tid ?? NaN),
      });
      renamedPlayers += 1;
    }
    metaByOldId.set(oldId, meta);
  }

  const healedPlayers = (players ?? []).map((player: any) =>
    replacementByPlayer.has(player)
      ? { ...player, internalId: replacementByPlayer.get(player) }
      : player,
  );

  const resolveDuplicateStatId = (oldId: string, stat: any, teamId: number): string => {
    const meta = metaByOldId.get(oldId);
    if (!meta) return oldId;
    const statNameKey = normalizeDuplicateName(stat?.name);
    const nameMatches = statNameKey ? meta.filter(entry => entry.nameKey === statNameKey) : [];
    if (nameMatches.length === 1) return nameMatches[0].currentId;
    const teamMatches = (nameMatches.length > 0 ? nameMatches : meta).filter(entry => entry.tid === teamId);
    if (teamMatches.length === 1) return teamMatches[0].currentId;
    return oldId;
  };

  const resolveDuplicateMapKey = (oldId: string, homeTeamId: number, awayTeamId: number): string => {
    const meta = metaByOldId.get(oldId);
    if (!meta) return oldId;
    const homeMatches = meta.filter(entry => entry.tid === homeTeamId);
    if (homeMatches.length === 1) return homeMatches[0].currentId;
    const awayMatches = meta.filter(entry => entry.tid === awayTeamId);
    if (awayMatches.length === 1) return awayMatches[0].currentId;
    return oldId;
  };

  let rewiredStats = 0;
  let rewiredMaps = 0;
  const rewriteSideStats = (stats: any[], teamId: number) =>
    (stats ?? []).map((stat: any) => {
      const oldId = String(stat?.playerId ?? '');
      if (!metaByOldId.has(oldId)) return stat;
      const nextId = resolveDuplicateStatId(oldId, stat, teamId);
      if (nextId === oldId) return stat;
      rewiredStats += 1;
      return { ...stat, playerId: nextId };
    });

  const rewriteKeyedMap = (map: Record<string, any> | undefined, homeTeamId: number, awayTeamId: number) => {
    if (!map || typeof map !== 'object') return map;
    let changed = false;
    const next: Record<string, any> = {};
    for (const [key, value] of Object.entries(map)) {
      const nextKey = metaByOldId.has(key) ? resolveDuplicateMapKey(key, homeTeamId, awayTeamId) : key;
      if (nextKey !== key) {
        rewiredMaps += 1;
        changed = true;
      }
      next[nextKey] = value;
    }
    return changed ? next : map;
  };

  const healedBoxScores = (boxScores ?? []).map((box: any) => {
    const homeStats = rewriteSideStats(box?.homeStats ?? [], Number(box?.homeTeamId ?? NaN));
    const awayStats = rewriteSideStats(box?.awayStats ?? [], Number(box?.awayTeamId ?? NaN));
    const playerDNPs = rewriteKeyedMap(box?.playerDNPs, Number(box?.homeTeamId ?? NaN), Number(box?.awayTeamId ?? NaN));
    const playerInGameInjuries = rewriteKeyedMap(box?.playerInGameInjuries, Number(box?.homeTeamId ?? NaN), Number(box?.awayTeamId ?? NaN));
    const playersPlayingHurt = rewriteKeyedMap(box?.playersPlayingHurt, Number(box?.homeTeamId ?? NaN), Number(box?.awayTeamId ?? NaN));
    if (
      homeStats === box?.homeStats &&
      awayStats === box?.awayStats &&
      playerDNPs === box?.playerDNPs &&
      playerInGameInjuries === box?.playerInGameInjuries &&
      playersPlayingHurt === box?.playersPlayingHurt
    ) {
      return box;
    }
    return {
      ...box,
      homeStats,
      awayStats,
      playerDNPs,
      playerInGameInjuries,
      playersPlayingHurt,
    };
  });

  console.warn(
    `[LOAD_GAME] Healed ${duplicateGroups.length} duplicate player internalId group(s); renamed ${renamedPlayers} player(s), rewired ${rewiredStats} box-score row(s), ${rewiredMaps} keyed map entr${rewiredMaps === 1 ? 'y' : 'ies'}.`,
  );

  return { players: healedPlayers, boxScores: healedBoxScores };
}

export function healLoadedDraftPicks(loaded: any, currentSeasonYear: number) {
  const draftPicks = Array.isArray(loaded?.draftPicks) ? loaded.draftPicks : [];
  if (loaded?.leagueType !== 'modded' || loaded?.moddedLeagueBase !== 'philippines') return draftPicks;

  const pbaTeamIds = (loaded?.nonNBATeams ?? [])
    .filter((team: any) => team?.league === 'PBA')
    .map((team: any) => Number(team?.tid))
    .filter((tid: number) => Number.isFinite(tid));

  if (pbaTeamIds.length === 0) return draftPicks;

  const windowSize = Number(loaded?.leagueStats?.tradableDraftPickSeasons ?? 3);
  const healedDraftPicks = generateFuturePicksForTeamIds(draftPicks, pbaTeamIds, currentSeasonYear, windowSize, 2);
  if (healedDraftPicks.length > draftPicks.length) {
    console.log(`[LOAD_GAME] Healed ${healedDraftPicks.length - draftPicks.length} missing PBA draft pick(s).`);
  }
  return healedDraftPicks;
}

export function migrateLeagueStats(loaded: any) {
  const loadedLeagueStats = loaded.leagueStats ?? {};
  const migratedLeagueStats = { ...loadedLeagueStats };
  let staleRulesMigrated = false;
  if (!migratedLeagueStats.awardSettings) {
    const uiMode = migratedLeagueStats.uiMode ?? 'nba';
    migratedLeagueStats.awardSettings = defaultAwardSettings(
      uiMode === 'euro_isolated' || uiMode === 'fictional' ? uiMode : 'nba',
    );
    console.log(`[LOAD_GAME] Seeded default awardSettings for uiMode=${uiMode}`);
  }
  if (migratedLeagueStats.allStarGameTargetScore == null) {
    migratedLeagueStats.allStarGameTargetScore =
      loadedLeagueStats.allStarGameFormat === 'target_score'
        ? Math.max(40, loadedLeagueStats.allStarOvertimeTargetPoints ?? 40)
        : 40;
    staleRulesMigrated = true;
  }
  if (migratedLeagueStats.gameTargetScore == null || migratedLeagueStats.gameTargetScore <= 0) {
    migratedLeagueStats.gameTargetScore = 100;
  }
  if (migratedLeagueStats.celebrityGameMirrorLeagueRules == null) {
    migratedLeagueStats.celebrityGameMirrorLeagueRules = true;
    staleRulesMigrated = true;
  }
  if (loadedLeagueStats.allStarMirrorLeagueRules === true && loadedLeagueStats.allStarQuarterLength === 12) {
    migratedLeagueStats.allStarMirrorLeagueRules = false;
    migratedLeagueStats.allStarQuarterLength = 3;
    staleRulesMigrated = true;
  }
  if (loadedLeagueStats.allStarMirrorLeagueRules === false && loadedLeagueStats.allStarQuarterLength === 12) {
    migratedLeagueStats.allStarQuarterLength = 3;
    staleRulesMigrated = true;
  }
  if (loadedLeagueStats.risingStarsMirrorLeagueRules === false && loadedLeagueStats.risingStarsQuarterLength === 12) {
    migratedLeagueStats.risingStarsQuarterLength = 3;
    staleRulesMigrated = true;
  }
  if (loadedLeagueStats.risingStarsFormat === 'rookies_vs_sophomores' || loadedLeagueStats.risingStarsFormat === 'tournament') {
    migratedLeagueStats.risingStarsFormat = '4team_tournament';
    staleRulesMigrated = true;
  }
  if (staleRulesMigrated) {
    console.log('[LOAD_GAME] Migrated stale exhibition rules to tournament defaults.');
  }
  if (migratedLeagueStats.uiMode === 'pba_isolated') {
    migratedLeagueStats.allStarGameEnabled = true;
    migratedLeagueStats.allStarMirrorLeagueRules = false;
    migratedLeagueStats.allStarGameFormat = 'timed';
    migratedLeagueStats.allStarQuarterLength = 12;
    migratedLeagueStats.allStarNumQuarters = 4;
    migratedLeagueStats.allStarOvertimeDuration = 5;
    migratedLeagueStats.risingStarsEnabled = false;
    migratedLeagueStats.celebrityGameEnabled = false;
    if (!PBA_CONFERENCES.has(String(migratedLeagueStats.pbaConference ?? ''))) {
      migratedLeagueStats.pbaConference = 'philippine';
    }
    if (!PBA_CONFERENCE_PHASES.has(String(migratedLeagueStats.pbaConferencePhase ?? ''))) {
      const competitionId = getPbaCompetitionIdForConference(migratedLeagueStats.pbaConference);
      const currentConferenceGames = (loaded.schedule ?? []).filter((game: any) => game.competitionId === competitionId);
      const currentConferenceBoxScores = (loaded.boxScores ?? []).filter((game: any) => game.competitionId === competitionId);
      const hasUnplayedCurrentConference = currentConferenceGames.some((game: any) => !game.played);
      const hasPostseasonMaterial = [...currentConferenceGames, ...currentConferenceBoxScores].some((game: any) =>
        ['qf', 'sf', 'final'].includes(String(game.competitionPhase)),
      );
      migratedLeagueStats.pbaConferencePhase = hasUnplayedCurrentConference || currentConferenceGames.length > 0 || currentConferenceBoxScores.length > 0
        ? hasPostseasonMaterial ? 'playoffs' : 'regularSeason'
        : loaded.offseasonChecklist ? 'offseason' : 'regularSeason';
      console.log(`[LOAD_GAME] Normalized missing PBA conference phase to ${migratedLeagueStats.pbaConferencePhase}.`);
    }
    if (!isPbaActiveConferencePhase(migratedLeagueStats.pbaConferencePhase) && migratedLeagueStats.pbaConferencePhase !== 'offseason' && migratedLeagueStats.pbaConferencePhase !== 'complete') {
      migratedLeagueStats.pbaConferencePhase = 'regularSeason';
      console.log('[LOAD_GAME] Repaired invalid PBA conference phase.');
    }
  }
  return migratedLeagueStats;
}

export function healSchedule(schedule: any[] | undefined, migratedLeagueStats: any) {
  return (schedule ?? []).map((game: any) => {
    if (game?.isRisingStars && game.gid === 91001) return { ...game, gameFormat: 'target_score', targetScore: game.targetScore ?? 40 };
    if (game?.isRisingStars && game.gid === 91002) return { ...game, gameFormat: 'target_score', targetScore: game.targetScore ?? 40 };
    if (game?.isRisingStars && game.gid === 91099) return { ...game, gameFormat: 'target_score', targetScore: game.targetScore ?? 25 };
    if (game?.isAllStar && migratedLeagueStats.allStarGameFormat && migratedLeagueStats.allStarGameFormat !== 'timed') {
      return {
        ...game,
        gameFormat: migratedLeagueStats.allStarGameFormat,
        targetScore: migratedLeagueStats.allStarGameFormat === 'target_score'
          ? (game.targetScore ?? migratedLeagueStats.allStarGameTargetScore ?? 40)
          : game.targetScore,
      };
    }
    return game;
  });
}

export function cleanDeadMoneyTeams(teams: any[] | undefined) {
  let deadMoneyTrimmed = 0;
  const cleanedTeams = (teams ?? []).map((team: any) => {
    if (!team.deadMoney || team.deadMoney.length === 0) return team;
    const cleanedEntries = team.deadMoney
      .map((entry: any) => ({
        ...entry,
        remainingByYear: (entry.remainingByYear ?? []).filter((year: any) => (year.amountUSD ?? 0) >= DEAD_MONEY_FLOOR_USD),
      }))
      .filter((entry: any) => {
        if (!entry.remainingByYear || entry.remainingByYear.length === 0) return false;
        const total = entry.remainingByYear.reduce((sum: number, year: any) => sum + year.amountUSD, 0);
        return total >= DEAD_MONEY_FLOOR_USD;
      });
    const removed = team.deadMoney.length - cleanedEntries.length;
    if (removed > 0) deadMoneyTrimmed += removed;
    return { ...team, deadMoney: cleanedEntries };
  });
  if (deadMoneyTrimmed > 0) {
    console.log(`[LOAD_GAME] Stripped ${deadMoneyTrimmed} zero-amount dead-money entries.`);
  }
  return cleanedTeams;
}

export function healLoadedNbaTeamRecords(loaded: any, migratedLeagueStats: any, healedSchedule: any[], teams: any[]) {
  const uiMode = migratedLeagueStats?.uiMode ?? 'nba';
  if (uiMode === 'euro_isolated' || uiMode === 'pba_isolated') return teams;

  const season = migratedLeagueStats?.year ?? loaded?.leagueStats?.year ?? new Date().getFullYear();
  const nbaTeams = (teams ?? []).filter((team: any) => typeof team?.id === 'number' && team.id >= 0 && team.id < 100);
  if (nbaTeams.length === 0) return teams;

  const recordMap = deriveOfficialNbaRecords(healedSchedule, teams, season);

  const corruptedTeams = nbaTeams.filter((team: any) => {
    const rec = recordMap.get(team.id);
    const row = team.seasons?.find((entry: any) => Number(entry?.season) === Number(season));
    const savedTotal = Number(row?.won ?? row?.wins ?? team.wins ?? 0) + Number(row?.lost ?? row?.losses ?? team.losses ?? 0);
    const rebuiltTotal = Number(rec?.totalWins ?? 0) + Number(rec?.totalLosses ?? 0);
    return rebuiltTotal > 0 && savedTotal !== rebuiltTotal;
  });
  if (corruptedTeams.length === 0) return teams;

  const champTid = loaded?.playoffs?.bracketComplete ? loaded?.playoffs?.champion : undefined;
  const finalsSeries = (loaded?.playoffs?.series ?? []).find((series: any) => series.round === 4);
  const runnerTid = champTid != null && finalsSeries
    ? (finalsSeries.higherSeedTid === champTid ? finalsSeries.lowerSeedTid : finalsSeries.higherSeedTid)
    : undefined;

  const healedTeams = teams.map((team: any) => {
    if (!recordMap.has(team?.id)) return team;
    const rec = recordMap.get(team.id);
    if (!rec || (rec.totalWins + rec.totalLosses) === 0) return team;
    const seasons = Array.isArray(team.seasons) ? [...team.seasons] : [];
    const seasonIndex = seasons.findIndex((entry: any) => Number(entry?.season) === Number(season));
    const prev = seasonIndex >= 0 ? seasons[seasonIndex] : {};
    const playoffRoundsWon = team.id === champTid
      ? 4
      : team.id === runnerTid
        ? 3
        : prev?.playoffRoundsWon;
    const nextSeasonRow = {
      ...prev,
      season,
      won: rec.totalWins,
      lost: rec.totalLosses,
      wins: rec.totalWins,
      losses: rec.totalLosses,
      playoffRoundsWon,
    };
    if (seasonIndex >= 0) seasons[seasonIndex] = nextSeasonRow;
    else seasons.push(nextSeasonRow);
    return {
      ...team,
      wins: rec.totalWins,
      losses: rec.totalLosses,
      seasons,
    };
  });

  console.log(`[LOAD_GAME] Healed ${corruptedTeams.length} NBA team record row(s) from played schedule.`);
  return healedTeams;
}

export function healLegacyNbaStaff(teams: any[], loaded: any) {
  let patched = 0;
  const healedTeams = (teams ?? []).map((team: any) => {
    const teamName = `${team?.region ?? ''} ${team?.name ?? ''}`.trim();
    if (teamName !== 'San Antonio Spurs') return team;
    const members = Array.isArray(team?.tycoon?.staffMembers) ? team.tycoon.staffMembers : [];
    const headIndex = members.findIndex((member: any) => String(member?.role ?? member?.position ?? member?.jobTitle ?? '').replace(/ \d+$/, '') === 'Head Coach');
    if (headIndex < 0 || members[headIndex]?.name !== 'Gregg Popovich') return team;
    const historyText = (loaded?.history ?? []).map((entry: any) => String(typeof entry === 'string' ? entry : entry?.text ?? ''));
    const hasLaterSpursHire = historyText.some((text: string) => /San Antonio Spurs hired .+ as Head Coach/i.test(text));
    if (hasLaterSpursHire) return team;
    const nextMembers = [...members];
    nextMembers[headIndex] = {
      ...nextMembers[headIndex],
      name: 'Mitch Johnson',
      role: 'Head Coach',
      position: 'Head Coach',
      jobTitle: 'Head Coach',
      nationality: 'American',
      yearsWithTeam: 0,
      hiredYear: loaded?.leagueStats?.year ?? new Date().getFullYear(),
      career_history: `${loaded?.leagueStats?.year ?? new Date().getFullYear()}-Present San Antonio Spurs (Head Coach)`,
      coaching_career: `${loaded?.leagueStats?.year ?? new Date().getFullYear()}-Present San Antonio Spurs (Head Coach)`,
    };
    patched++;
    return { ...team, tycoon: { ...(team.tycoon ?? {}), staffMembers: nextMembers } };
  });
  if (patched > 0) console.log(`[LOAD_GAME] Healed ${patched} legacy Spurs Popovich staff assignment.`);
  return healedTeams;
}

export function healPbaTeamStaff(nonNBATeams: any[], leagueStats: any) {
  if (leagueStats?.uiMode !== 'pba_isolated') return nonNBATeams;
  let patched = 0;
  const year = leagueStats?.year ?? new Date().getFullYear();
  const healed = (nonNBATeams ?? []).map((team: any) => {
    if (team?.league !== 'PBA') return team;
    const before = team?.tycoon?.staffMembers?.length ?? 0;
    const next = attachPbaStaffToTeam(team, year);
    const after = next?.tycoon?.staffMembers?.length ?? 0;
    if (after > before) patched++;
    return next;
  });
  if (patched > 0) console.log(`[LOAD_GAME] Healed real PBA staff for ${patched} team(s).`);
  return healed;
}

export function healHistoricalTeamIdentity(loaded: any, teams: any[], players: any[]) {
  const seasonAbbrevByTid = new Map<number, Map<number, string>>();
  for (const player of players ?? []) {
    for (const stat of player?.stats ?? []) {
      const tid = Number(stat?.tid);
      const season = Number(stat?.season);
      if (!Number.isFinite(tid) || !Number.isFinite(season) || tid < 0) continue;
      const abbrevRaw = String(stat?.abbrev ?? stat?.teamAbbrev ?? stat?.tm ?? stat?.TM ?? '').trim().toUpperCase();
      if (!abbrevRaw) continue;
      if (!seasonAbbrevByTid.has(tid)) seasonAbbrevByTid.set(tid, new Map<number, string>());
      const bySeason = seasonAbbrevByTid.get(tid)!;
      if (!bySeason.has(season)) bySeason.set(season, abbrevRaw);
    }
  }

  let patchedSeasonRows = 0;
  const healedTeams = (teams ?? []).map((team: any) => {
    const bySeason = seasonAbbrevByTid.get(Number(team?.id));
    if (!Array.isArray(team?.seasons) || team.seasons.length === 0) return team;
    let changed = false;
    const seasons = team.seasons.map((row: any) => {
      const season = Number(row?.season);
      const inferredAbbrev = bySeason?.get(season);
      const next = {
        ...row,
        abbrev: row?.abbrev ?? inferredAbbrev ?? team?.abbrev,
        region: row?.region ?? team?.region ?? '',
        name: row?.name ?? team?.name ?? '',
      };
      if (next.abbrev !== row?.abbrev || next.region !== row?.region || next.name !== row?.name) {
        changed = true;
        patchedSeasonRows++;
      }
      return next;
    });
    return changed ? { ...team, seasons } : team;
  });

  if (patchedSeasonRows > 0) {
    console.log(`[LOAD_GAME] Healed ${patchedSeasonRows} historical team season identity row(s).`);
  }
  return healedTeams;
}

export function cleanFaMarkets(loaded: any, migratedLeagueStats: any, healedSchedule: any[], backfilledPlayers: any[], teamsWithCleanDeadMoney: any[]) {
  const loadedForMarketCheck = {
    ...initialState,
    ...loaded,
    leagueStats: migratedLeagueStats,
    schedule: healedSchedule,
    players: backfilledPlayers,
    teams: teamsWithCleanDeadMoney as any,
  } as GameState;
  const playerById = new Map(backfilledPlayers.map((player: any) => [player.internalId, player]));
  let purgedResolvedFAMarkets = 0;
  let purgedExpiredFAMarkets = 0;
  let purgedSignedFAMarkets = 0;
  const cleanedFAMarkets = (loaded.faBidding?.markets ?? []).filter((market: any) => {
    const player = playerById.get(market.playerId) as any;
    if (market.resolved) {
      purgedResolvedFAMarkets++;
      return false;
    }
    if (player && player.tid >= 0) {
      purgedSignedFAMarkets++;
      return false;
    }
    if (market.openedDay != null && ((loadedForMarketCheck.day ?? 0) - market.openedDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) {
      purgedExpiredFAMarkets++;
      return false;
    }
    if (!isPlausibleActiveMarket(market, loadedForMarketCheck, player)) {
      purgedExpiredFAMarkets++;
      return false;
    }
    return true;
  });
  const removedFAMarkets = purgedResolvedFAMarkets + purgedExpiredFAMarkets + purgedSignedFAMarkets;
  if (removedFAMarkets > 0) {
    console.log(`[LOAD_GAME] Purged ${removedFAMarkets} stale FA markets (resolved=${purgedResolvedFAMarkets}, expired=${purgedExpiredFAMarkets}, signed=${purgedSignedFAMarkets})`);
  }
  return cleanedFAMarkets;
}

export function cleanOptionHistory(history: any[] | undefined) {
  const seenOptionHistory = new Set<string>();
  let removedOptionHistory = 0;
  const cleanedHistory = [...(history ?? [])].reverse().filter((entry: any) => {
    const text = String(entry?.text ?? '').toLowerCase();
    const isOptionDecision = text.includes('player option') || text.includes('team option');
    if (!isOptionDecision) return true;
    const playerKey = Array.isArray(entry.playerIds) && entry.playerIds.length > 0
      ? entry.playerIds.join(',')
      : text.replace(/\$[\d.]+m/g, '').replace(/\s+/g, ' ').trim();
    const kind = text.includes('player option') ? 'player-option' : 'team-option';
    const key = `${kind}|${entry.date ?? ''}|${playerKey}`;
    if (seenOptionHistory.has(key)) {
      removedOptionHistory++;
      return false;
    }
    seenOptionHistory.add(key);
    return true;
  }).reverse();
  if (removedOptionHistory > 0) {
    console.log(`[LOAD_GAME] Removed ${removedOptionHistory} duplicate option transaction(s).`);
  }
  return cleanedHistory;
}

const LEGACY_AUTO_NEWS_HEADLINES = new Set([
  'Christmas Day Games Set',
  'THE THRONE — Sign-Ups Open',
  'THE THRONE — Sign-Ups Closed',
  'THE THRONE — Field of 16 Revealed',
  'All-Star Starters Announced',
  'Full All-Star Rosters Set',
  'All-Star Weekend Complete',
  'NBA All-Star Starters Announced',
  'NBA All-Star Rosters Set',
  'NBA All-Star Weekend Complete',
  'PBA All-Star Rosters Set',
  'PBA All-Star Weekend Complete',
  'Draft Lottery Complete',
  'NBA Draft Complete',
]);

const extractNewsYear = (item: any): string => {
  const match = String(item?.date ?? '').match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? 'unknown';
};

export function cleanDuplicateAutoNews(news: any[] | undefined) {
  if (!Array.isArray(news) || news.length === 0) return news ?? [];
  const seen = new Set<string>();
  let removed = 0;
  const cleaned = news.filter((item: any) => {
    const headline = String(item?.headline ?? '').trim();
    if (!LEGACY_AUTO_NEWS_HEADLINES.has(headline)) return true;
    const key = `${extractNewsYear(item)}|${headline}`;
    if (seen.has(key)) {
      removed++;
      return false;
    }
    seen.add(key);
    return true;
  });
  if (removed > 0) {
    console.log(`[LOAD_GAME] Removed ${removed} duplicate auto-news item(s).`);
  }
  return cleaned;
}

export async function refreshTrainingCalendars(loaded: any, teams: any[]) {
  let teamsWithFreshTraining = teams;
  try {
    const { autoGenerateTrainingCalendarsForAllTeams } = await import('../../services/training/trainingScheduler');
    let migratedCount = 0;
    teamsWithFreshTraining = teamsWithFreshTraining.map((team: any) => {
      const calendar = team.trainingCalendar;
      if (!calendar) return team;
      const isoOnly: Record<string, any> = {};
      for (const [key, value] of Object.entries(calendar)) {
        if (typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) isoOnly[key] = value;
        else migratedCount++;
      }
      return { ...team, trainingCalendar: isoOnly };
    });
    if (migratedCount > 0) {
      console.log(`[LOAD_GAME] Stripped ${migratedCount} legacy training-calendar entries (numeric-keyed).`);
    }
    if (loaded.schedule && Array.isArray(loaded.schedule) && loaded.date) {
      const startIso = normalizeDate(loaded.date);
      teamsWithFreshTraining = autoGenerateTrainingCalendarsForAllTeams(
        teamsWithFreshTraining,
        loaded.schedule,
        startIso,
        365,
      );
      console.log(`[LOAD_GAME] Refreshed training calendars via auto-scheduler (startISO=${startIso}).`);
    }
  } catch (error) {
    console.warn('[LOAD_GAME] training-calendar migration failed', error);
  }
  return teamsWithFreshTraining;
}

export async function applyTrainingAiSetup(loaded: any, players: any[], teams: any[]) {
  let playersWithAISetup = players;
  try {
    const { applyAIAutoSetup, shouldRunAIAutoSetup } = await import('../../services/training/aiAutoSetup');
    if (shouldRunAIAutoSetup(playersWithAISetup, loaded.userTeamId, loaded.gameMode)) {
      playersWithAISetup = applyAIAutoSetup(
        playersWithAISetup,
        teams as any,
        loaded.leagueStats?.year ?? new Date().getFullYear(),
        loaded.userTeamId,
        loaded.gameMode,
      );
      console.log('[LOAD_GAME] AI auto-setup applied: dev-focus + mentor pairings for AI teams.');
    }
  } catch (error) {
    console.warn('[LOAD_GAME] AI auto-setup failed', error);
  }
  return playersWithAISetup;
}

export function healFollowedHandles(loaded: any) {
  return loaded.leagueType === 'fictional' && Array.isArray(loaded.followedHandles)
    ? loaded.followedHandles.map((handle: string) => NBA_TO_FICTIONAL_HANDLES[handle] ?? handle)
    : loaded.followedHandles;
}

export function healOffseasonChecklist(loaded: any) {
  const persistedChecklist = loaded.offseasonChecklist as OffseasonChecklist | undefined;
  let healedOffseasonChecklist = persistedChecklist;
  if (persistedChecklist && isPbaActiveConferenceMode(loaded)) {
    console.log('[LOAD_GAME] Cleared stale PBA offseason checklist during active conference play.');
    return undefined;
  }
  if (persistedChecklist && isNoDraftLeague(loaded.leagueStats)) {
    const isUnfinished = (status: string | undefined) => status === 'pending' || status === 'in-progress';
    const needsHeal =
      isUnfinished(persistedChecklist.draftLottery) ||
      isUnfinished(persistedChecklist.draft) ||
      isUnfinished(persistedChecklist.rookieContracts);
    if (needsHeal) {
      healedOffseasonChecklist = {
        ...persistedChecklist,
        draftLottery: 'skipped',
        draft: 'skipped',
        rookieContracts: 'skipped',
      };
      console.log('[LOAD_GAME] Healed legacy draft rows → skipped (no_draft active).');
    }
  }
  return healedOffseasonChecklist;
}
