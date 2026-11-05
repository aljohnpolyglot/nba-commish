import type { GameState, NBAPlayer, NBATeam } from '../../types';
import { getTeamCountry } from '../../utils/teamCountry';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamScoutingFuzzBand } from '../staff/staffGameplayEffects';
import { spawnExternalPlayer } from '../externalLeague/externalLeagueSpawn';
import { getCachedHistoricalEndesaSource } from '../historicalEndesa/loader';
import { getSeasonEconomyIndex } from '../tycoon/clubFinance';
import { getHistoricalEndesaPlayerCountry, mapHistoricalEndesaFutureProspect } from '../historicalEndesa/seasonBuilder';
import { getStaffImageUrl, resolveStaffImageId } from '../../utils/staffPortrait';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { EURO_COUNTRY_BY_ID, findEuroCountryProfile, getGenerationCountry } from './countryProfiles';
import { pickWeightedEuroCity } from './cityPools';
import { calibrateGeneratedEuroScoutingProspect } from './prospectRatings';
import type {
  EuroAcademyPlayer,
  EuroCountryProfile,
  EuroScoutedProspect,
  EuroScoutingAssignment,
} from './types';

export const EURO_ACADEMY_CAPACITY = 18;
export const EURO_SCOUTING_DURATIONS = [7, 14, 30, 60, 90] as const;

export interface RegionalScout {
  id: string;
  name: string;
  role: string;
  rating: number;
  nationality?: string;
  portraitUrl?: string;
  activeAssignmentId?: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashNumber = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
};

const seededUnit = (value: string) => hashNumber(value) / 4294967295;

export const getEuroUserTeam = (state: Pick<GameState, 'userTeamId' | 'teams' | 'nonNBATeams'>): NBATeam | null => {
  if (state.userTeamId == null) return null;
  return resolveAnyTeam(state.userTeamId, state.teams, state.nonNBATeams ?? []);
};

export const getRegionalScouts = (
  team: NBATeam | null,
  assignments: EuroScoutingAssignment[] = [],
): RegionalScout[] => {
  const staff = team?.tycoon?.staffMembers ?? [];
  return staff
    .filter(member => /^Regional Scout(?:\s+[2-4])?$/.test(member.role))
    .slice(0, 4)
    .map(member => ({
      id: member.id,
      name: member.name,
      role: member.role,
      rating: clamp(Math.round(member.rating ?? 60), 40, 99),
      nationality: member.nationality,
      portraitUrl: member.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(member)) ?? undefined,
      activeAssignmentId: assignments.find(assignment => assignment.scoutId === member.id && assignment.status !== 'finalized')?.id,
    }));
};

export const getAcademyDirector = (team: NBATeam | null) => (
  team?.tycoon?.staffMembers ?? []
).find(member => member.role === 'Head of Academy') ?? null;

export const getChiefScoutRating = (team: NBATeam | null): number => {
  const chiefScout = (team?.tycoon?.staffMembers ?? []).find(member => member.role === 'Chief Scout');
  return clamp(Math.round(chiefScout?.rating ?? 50), 40, 99);
};

export const getScoutingVisibilityBand = (team: NBATeam | null): number => getTeamScoutingFuzzBand(team, 'draft');

export const getScoutingAssignmentProgress = (assignment: EuroScoutingAssignment, currentDay: number): number => {
  if (assignment.status !== 'active') return 1;
  return clamp((currentDay - assignment.startedDay) / Math.max(1, assignment.durationDays), 0, 1);
};

export const getVisibleScoutingProspects = (
  assignment: EuroScoutingAssignment,
  currentDay: number,
): EuroScoutedProspect[] => {
  if (assignment.status !== 'active') return assignment.prospects;
  return assignment.prospects.filter(player => player.discoveredDay <= currentDay);
};

export const isLegacyEuroAcademyCandidate = (player: NBAPlayer, userTeamId: number): boolean => (
  player.tid === userTeamId
  && player.euroAcademyPlayer === true
  && player.promotedFromAcademy !== true
);

export const calculateScoutingCost = (
  state: GameState,
  profile: EuroCountryProfile,
  durationDays: number,
): number => {
  const team = getEuroUserTeam(state);
  const teamCountry = getTeamCountry(team, state);
  const teamProfile = findEuroCountryProfile(teamCountry);
  const sameCountry = !!teamProfile && teamProfile.id === profile.id;
  const sameRegion = !!teamProfile && teamProfile.region === profile.region;
  const travelBase = sameCountry ? 700 : sameRegion ? 2_400 : 5_800;
  const economyScale = getSeasonEconomyIndex(state, state.leagueStats.year);
  return Math.round((travelBase + durationDays * 190) * economyScale / 100) * 100;
};

export const estimateDiscoveryRange = (durationDays: number, scoutRating: number, chiefScoutRating = 50): [number, number] => {
  const weeks = durationDays / 7;
  const coverage = clamp(0.8 + chiefScoutRating / 250, 0.9, 1.2);
  const expected = weeks * (0.8 + scoutRating / 70) * coverage;
  return [Math.max(0, Math.floor(expected * 0.45)), Math.max(1, Math.ceil(expected * 1.75))];
};

const generateDiscoveryCount = (durationDays: number, scoutRating: number, chiefScoutRating: number, seed: string): number => {
  const weeks = durationDays / 7;
  const coverage = clamp(0.8 + chiefScoutRating / 250, 0.9, 1.2);
  const trials = Math.max(5, Math.round(weeks * 5 * coverage));
  const chance = clamp(0.14 + scoutRating / 300, 0.18, 0.47);
  let count = 0;
  for (let index = 0; index < trials; index += 1) {
    if (seededUnit(`${seed}:discovery:${index}`) < chance) count += 1;
  }
  return Math.min(30, count);
};

const targetAgeFor = (seed: string, index: number): number => {
  const roll = seededUnit(`${seed}:age:${index}`);
  if (roll < 0.18) return 14;
  if (roll < 0.42) return 15;
  if (roll < 0.68) return 16;
  if (roll < 0.88) return 17;
  return 18;
};

export const buildScoutingAssignment = (params: {
  state: GameState;
  scout: RegionalScout;
  countryId: string;
  durationDays: number;
}): EuroScoutingAssignment | null => {
  const { state, scout, countryId } = params;
  const durationDays = clamp(Math.round(params.durationDays), 7, 120);
  const country = EURO_COUNTRY_BY_ID.get(countryId);
  const team = getEuroUserTeam(state);
  if (!country || !team || state.userTeamId == null) return null;

  const assignmentId = `euro-scout-${state.userTeamId}-${state.day}-${scout.id}-${country.id}-${Date.now().toString(36)}`;
  const count = generateDiscoveryCount(durationDays, scout.rating, getChiefScoutRating(team), assignmentId);
  const existingPortraits = new Set([
    ...state.players.map(player => player.imgURL).filter((url): url is string => !!url),
    ...(state.euroScouting?.academyPlayers ?? []).map(player => player.imgURL).filter((url): url is string => !!url),
  ]);
  const league = String((team as any).league || (team as any).conference || 'Endesa');
  const salaryCap = Number(state.leagueStats.salaryCap ?? 140_000_000);
  const prospects: EuroScoutedProspect[] = [];

  if (state.historicalEndesa) {
    const source = getCachedHistoricalEndesaSource();
    const existingIdentityKeys = new Set([
      ...state.players.map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key),
      ...(state.euroScouting?.academyPlayers ?? []).map(player => player.historicalEndesaSource?.identityKey).filter((key): key is string => !!key),
      ...(state.euroScouting?.assignments ?? []).flatMap(assignment => assignment.prospects.map(player => player.historicalEndesaSource?.identityKey)).filter((key): key is string => !!key),
      ...(state.historicalEndesa.claimedIdentityKeys ?? []),
      ...(state.historicalEndesa.reservedIdentityKeys ?? []),
    ]);
    if (source) {
      for (const sourcePlayer of source.players) {
        const sourceCountry = findEuroCountryProfile(getHistoricalEndesaPlayerCountry(sourcePlayer));
        if (sourceCountry?.id !== country.id) continue;
        const player = mapHistoricalEndesaFutureProspect(sourcePlayer, state.leagueStats.year, state.userTeamId);
        const identityKey = player?.historicalEndesaSource?.identityKey;
        if (!player || !identityKey || existingIdentityKeys.has(identityKey)) continue;
        if (seededUnit(`${assignmentId}:historical:${identityKey}`) >= 0.7) continue;
        const discoveredDay = state.day + Math.max(1, Math.floor(durationDays * (0.2 + seededUnit(`${assignmentId}:day:${identityKey}`) * 0.75)));
        prospects.push({
          ...player,
          pos: normalizePositionLabel(player.pos, player.hgt),
          tid: -1,
          status: 'Prospect',
          scoutingAssignmentId: assignmentId,
          scoutingCountryId: country.id,
          scoutingCountryName: country.name,
          discoveredDay,
          euroGeneratedYouth: player.euroGeneratedYouth === true ? true : undefined,
        });
        existingIdentityKeys.add(identityKey);
      }
    }
  }

  for (let index = 0; index < count; index += 1) {
    const city = pickWeightedEuroCity(country.iso2, seededUnit(`${assignmentId}:city:${index}`));
    const targetAge = targetAgeFor(assignmentId, index);
    const player = spawnExternalPlayer({
      league,
      targetAge,
      year: state.leagueStats.year,
      rngBase: `${assignmentId}:${index}`,
      tid: state.userTeamId,
      team,
      salaryCap,
      isYouth: true,
      country: getGenerationCountry(country),
      birthplace: city ? `${city}, ${country.name}` : country.name,
      usedPortraitUrls: existingPortraits,
      openEndedGrowth: true,
      nativeYouthProfile: true,
      generationBias: {
        talentRating: country.talentRating,
        heightRating: country.heightRating,
        athleticismRating: country.athleticismRating,
      },
    });
    if (!player) continue;
    if (player.imgURL) existingPortraits.add(player.imgURL);
    const calibrated = calibrateGeneratedEuroScoutingProspect(player, country, targetAge, `${assignmentId}:${index}`);
    prospects.push({
      ...calibrated,
      pos: normalizePositionLabel(calibrated.pos, calibrated.hgt),
      tid: -1,
      status: 'Prospect',
      euroGeneratedYouth: true,
      academyRatingVersion: 2,
      scoutingAssignmentId: assignmentId,
      scoutingCountryId: country.id,
      scoutingCountryName: country.name,
      discoveredDay: state.day + Math.max(1, Math.floor(durationDays * (index + 1) / Math.max(1, count))),
    });
  }

  prospects.sort((a, b) => a.discoveredDay - b.discoveredDay || a.internalId.localeCompare(b.internalId));
  return {
    id: assignmentId,
    scoutId: scout.id,
    scoutName: scout.name,
    scoutPortraitUrl: scout.portraitUrl,
    scoutRating: scout.rating,
    countryId: country.id,
    countryName: country.name,
    startedDay: state.day,
    startedDate: state.date,
    durationDays,
    costEUR: calculateScoutingCost(state, country, durationDays),
    status: 'active',
    prospects,
    assignedProspectIds: [],
  };
};

export const toAcademyPlayer = (
  prospect: EuroScoutedProspect,
  teamId: number,
  date: string,
  day: number,
  currentYear: number,
): EuroAcademyPlayer => {
  const academyOverall = Number.isFinite(Number(prospect.academyOverall))
    ? Number(prospect.academyOverall)
    : getDisplayOverall(prospect, currentYear);
  const academyPotential = Number.isFinite(Number(prospect.academyPotential))
    ? Number(prospect.academyPotential)
    : getDisplayPotential(prospect, currentYear, currentYear, { floorAtEstimated: true });
  return {
    ...prospect,
    pos: normalizePositionLabel(prospect.pos, prospect.hgt),
    tid: teamId,
    euroAcademyPlayer: true,
    euroGeneratedYouth: prospect.euroGeneratedYouth === true ? true : undefined,
    academyRatingVersion: 2,
    academyOverall,
    academyBaseOverall: Number.isFinite(Number(prospect.academyBaseOverall))
      ? Number(prospect.academyBaseOverall)
      : academyOverall,
    academyDevelopmentForm: Number.isFinite(Number(prospect.academyDevelopmentForm))
      ? Number(prospect.academyDevelopmentForm)
      : 0,
    academyPotential: Math.max(academyOverall, academyPotential),
    academyTeamId: teamId,
    academyJoinedDate: date,
    academyJoinedDay: day,
    academyLastProgressDay: day,
    ovrTimeline: [
      ...(prospect.ovrTimeline ?? []).filter(snapshot => snapshot.date !== date),
      { date, ovr: academyOverall, displayScale: 'k2' as const },
    ].slice(-56),
  };
};
