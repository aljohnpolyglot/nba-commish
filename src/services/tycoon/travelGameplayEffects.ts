import type { NBATeam } from '../../types';
import type { TravelPreferences } from '../../types/tycoon';

const DEFAULT_TRAVEL_PREFERENCES: TravelPreferences = {
  hotel: 3.5,
  flight: 3.0,
  bus: 3.0,
};

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
  team?: (NBATeam & { tycoon?: { travelPreferences?: TravelPreferences } }) | null,
): TravelPreferences {
  return {
    hotel: team?.tycoon?.travelPreferences?.hotel ?? DEFAULT_TRAVEL_PREFERENCES.hotel,
    flight: team?.tycoon?.travelPreferences?.flight ?? DEFAULT_TRAVEL_PREFERENCES.flight,
    bus: team?.tycoon?.travelPreferences?.bus ?? DEFAULT_TRAVEL_PREFERENCES.bus,
  };
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
    roadTripFatigueDelta: clamp(2.7 - normalized * 1.1, 1.4, 3.8),
    moodComponent: clamp(normalized * 1.5, -1.5, 1.5),
  };
}

export function getTeamTravelGameplayEffects(
  team?: (NBATeam & { tycoon?: { travelPreferences?: TravelPreferences } }) | null,
): TeamTravelGameplayEffects {
  return getTravelGameplayEffectsFromPreferences(getTravelPreferences(team));
}
