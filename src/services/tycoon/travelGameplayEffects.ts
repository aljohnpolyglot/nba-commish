import type { NBATeam } from '../../types';
import type { TravelPreferences, TycoonState } from '../../types/tycoon';
import { getSponsorRecoveryReduction, getSponsorTravelCoverage } from './sponsorBenefits';
import { getSponsorQualityFloor, getSponsorReferenceYear } from './sponsorPerkEngine';

const DEFAULT_TRAVEL_PREFERENCES: TravelPreferences = {
  hotel: 3.5,
  flight: 3.0,
  bus: 3.0,
};

export function getEffectiveTravelPreferences(tycoon?: TycoonState | null): TravelPreferences {
  const flightCoverage = tycoon ? getSponsorTravelCoverage(tycoon, 'flight') : null;
  const busCoverage = tycoon ? getSponsorTravelCoverage(tycoon, 'bus') : null;
  const sponsorYear = getSponsorReferenceYear(tycoon ?? undefined);
  const savedHotel = tycoon?.travelPreferences?.hotel ?? DEFAULT_TRAVEL_PREFERENCES.hotel;
  const savedFlight = flightCoverage?.package.serviceStars ?? tycoon?.travelPreferences?.flight ?? DEFAULT_TRAVEL_PREFERENCES.flight;
  const savedBus = busCoverage?.package.serviceStars ?? tycoon?.travelPreferences?.bus ?? DEFAULT_TRAVEL_PREFERENCES.bus;
  return {
    hotel: Math.max(savedHotel, getSponsorQualityFloor(tycoon ?? undefined, sponsorYear, 'hotelQualityStars') ?? 0),
    flight: Math.max(savedFlight, getSponsorQualityFloor(tycoon ?? undefined, sponsorYear, 'flightQualityStars') ?? 0),
    bus: Math.max(savedBus, getSponsorQualityFloor(tycoon ?? undefined, sponsorYear, 'busTravelCost') ?? 0),
  };
}

export function getTravelServiceQuality(tycoon?: TycoonState | null): number {
  const preferences = getEffectiveTravelPreferences(tycoon);
  return (preferences.hotel + preferences.flight + preferences.bus) / 3;
}

export function getTravelDepartmentRating(tycoon?: TycoonState | null): number {
  return Math.max(1, Math.min(99, Math.round((getTravelServiceQuality(tycoon) / 5) * 99)));
}

export interface TeamTravelGameplayEffects {
  roadRecoveryScore: number;
  playerFatigueScore: number;
  teamMoraleScore: number;
  roadPerformanceScore: number;
  awayFatigueShift: number;
  awayStrengthBonus: number;
  roadTripFatigueDelta: number;
  moodComponent: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getTravelPreferences(
  team?: (NBATeam & { tycoon?: TycoonState }) | null,
): TravelPreferences {
  return getEffectiveTravelPreferences(team?.tycoon);
}

export function getTravelGameplayEffectsFromPreferences(
  prefs?: TravelPreferences | null,
): TeamTravelGameplayEffects {
  const hotel = prefs?.hotel ?? DEFAULT_TRAVEL_PREFERENCES.hotel;
  const flight = prefs?.flight ?? DEFAULT_TRAVEL_PREFERENCES.flight;
  const bus = prefs?.bus ?? DEFAULT_TRAVEL_PREFERENCES.bus;
  const averageStars = (hotel + flight + bus) / 3;
  const normalized = clamp((averageStars - 3) / 2, -1, 1);

  return {
    roadRecoveryScore: Math.min(99, Math.round(averageStars * 18)),
    playerFatigueScore: Math.min(99, Math.round(averageStars * 16)),
    teamMoraleScore: Math.min(99, Math.round(averageStars * 15)),
    roadPerformanceScore: Math.min(99, Math.round(averageStars * 14)),
    awayFatigueShift: clamp(Math.round(-normalized * 4), -3, 4),
    awayStrengthBonus: clamp(normalized * 1.5, -1.5, 1.5),
    // Persistent road wear should be noticeable over a bad trip, not send a
    // normal starter to the red zone after one ordinary week.
    roadTripFatigueDelta: clamp(1.35 - normalized * 0.45, 0.75, 1.8),
    moodComponent: clamp(normalized * 1.5, -1.5, 1.5),
  };
}

export function getTeamTravelGameplayEffects(
  team?: (NBATeam & { tycoon?: TycoonState }) | null,
): TeamTravelGameplayEffects {
  const base = getTravelGameplayEffectsFromPreferences(getTravelPreferences(team));
  const recovery = team?.tycoon ? getSponsorRecoveryReduction(team.tycoon) : 0;
  return applySponsorRecoveryBenefit(base, recovery);
}

export function applySponsorRecoveryBenefit(effects: TeamTravelGameplayEffects, reduction: number): TeamTravelGameplayEffects {
  if (reduction <= 0) return effects;
  return {
    ...effects,
    roadRecoveryScore: Math.min(99, effects.roadRecoveryScore + reduction),
    playerFatigueScore: Math.min(99, effects.playerFatigueScore + reduction),
    awayFatigueShift: Math.max(-3, effects.awayFatigueShift - Math.ceil(reduction / 3)),
    roadTripFatigueDelta: Math.max(0.55, effects.roadTripFatigueDelta - reduction * 0.04),
  };
}
