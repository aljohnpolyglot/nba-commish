import type {
  ArenaFeatureId,
  StadiumFacilityState,
  TrainingFacilityAreaKey,
  TycoonState,
} from '../../types/tycoon';
import { getClubFinanceSnapshot, postClubTransaction } from './clubFinance';
import { getTrainingSponsorBonuses } from './sponsorBenefits';
import { commitSponsorPurchaseQuote, getSponsorPurchaseQuote } from './sponsorPerkEngine';

export interface TrainingAreaSpec {
  id: TrainingFacilityAreaKey;
  label: string;
  description: string;
  baseCostEUR: number;
  effect: string;
}

export const TRAINING_AREA_SPECS: TrainingAreaSpec[] = [
  { id: 'courts', label: 'Practice Courts', description: 'Hardwood, baskets and configurable courts for team and individual work.', baseCostEUR: 90_000, effect: 'Team practice and skill repetition' },
  { id: 'strength', label: 'Strength & Conditioning', description: 'Weights, resistance stations and athletic-performance equipment.', baseCostEUR: 105_000, effect: 'Strength, conditioning and durability' },
  { id: 'science', label: 'Sports Science', description: 'Load monitoring, biomechanics and movement-analysis equipment.', baseCostEUR: 135_000, effect: 'Training load and injury prevention' },
  { id: 'video', label: 'Video Analysis', description: 'Film rooms, tagging stations and opponent-analysis systems.', baseCostEUR: 115_000, effect: 'Tactical preparation and player learning' },
  { id: 'media', label: 'Media & Interview', description: 'Interview, presentation and media-preparation spaces.', baseCostEUR: 80_000, effect: 'Media preparation and club presentation' },
  { id: 'recovery', label: 'Recovery Suite', description: 'Hydrotherapy, treatment and post-training recovery equipment.', baseCostEUR: 125_000, effect: 'Recovery speed and training availability' },
];

export interface ArenaFeatureSpec {
  id: ArenaFeatureId;
  label: string;
  description: string;
  baseCostEUR: number;
  effect: string;
  attributes: Partial<Record<'attendance' | 'vip' | 'atmosphere' | 'engagement' | 'concessions' | 'media', number>>;
}

export const ARENA_FEATURE_SPECS: ArenaFeatureSpec[] = [
  { id: 'led-ribbon', label: 'LED Ribbon System', description: 'Continuous digital presentation around the seating bowl.', baseCostEUR: 420_000, effect: '+Fan engagement and attendance draw', attributes: { attendance: 2, engagement: 4, media: 1 } },
  { id: 'luxury-suites', label: 'VIP Luxury Suites', description: 'Purpose-built hospitality spaces for premium guests.', baseCostEUR: 1_350_000, effect: '+VIP revenue', attributes: { vip: 8, attendance: 1 } },
  { id: 'jumbotron', label: 'Jumbotron 360°', description: 'A full center-hung display with replay and presentation systems.', baseCostEUR: 980_000, effect: '+Attendance draw and fan engagement', attributes: { attendance: 4, engagement: 6, media: 2 } },
  { id: 'premium-courtside', label: 'Premium Courtside', description: 'Upgraded courtside inventory and hospitality service.', baseCostEUR: 720_000, effect: '+VIP revenue', attributes: { vip: 6, attendance: 1 } },
  { id: 'fan-zone', label: 'Fan Zone & Concourse', description: 'Interactive concourse space with improved food and retail flow.', baseCostEUR: 640_000, effect: '+Fan engagement and concessions', attributes: { engagement: 5, concessions: 6, attendance: 2 } },
  { id: 'sound-system', label: 'State-of-Art Sound', description: 'Arena-wide sound designed for clear calls and a louder matchday.', baseCostEUR: 560_000, effect: '+Atmosphere', attributes: { atmosphere: 7, engagement: 2 } },
  { id: 'media-center', label: 'Press & Media Center', description: 'Modern broadcast, interview and media-working facilities.', baseCostEUR: 510_000, effect: '+Media capability', attributes: { media: 8 } },
  { id: 'tunnel-show', label: 'Player Tunnel Show', description: 'Lighting, staging and presentation for player introductions.', baseCostEUR: 310_000, effect: '+Atmosphere and fan engagement', attributes: { atmosphere: 4, engagement: 3 } },
];

export interface ArenaCapacityProject {
  id: string;
  label: string;
  seatGain: number;
  baseCostEUR: number;
  prerequisiteId?: string;
}

const CAPACITY_STAGES = [
  ['Lower Bowl Expansion', 500], ['Upper Bowl Extension', 500], ['Corner Seating Buildout', 600],
  ['Baseline Stand Expansion', 600], ['Lower Bowl Infill', 650], ['Upper End Expansion', 650],
  ['East Stand Extension', 700], ['West Stand Extension', 700], ['Bowl Reconfiguration', 750],
  ['End-Court Seating Deck', 750], ['Upper Bowl Phase II', 800], ['Lower Bowl Phase II', 800],
  ['Corner Deck Expansion', 850], ['Premium Seating Deck', 850], ['Upper Bowl Phase III', 900],
  ['End Stand Reconstruction', 900], ['Bowl Expansion Phase IV', 1_000], ['Upper Gallery', 1_000],
  ['Major Stand Expansion', 1_100], ['Arena Bowl Completion', 1_100], ['Final Seating Deck', 1_200],
  ['Maximum Basketball Configuration', 1_250],
] as const;

export const ARENA_CAPACITY_PROJECTS: ArenaCapacityProject[] = CAPACITY_STAGES.map(([label, seatGain], index) => ({
  id: `capacity-${String(index + 1).padStart(2, '0')}`,
  label,
  seatGain,
  baseCostEUR: Math.round((180_000 * Math.pow(1.24, index)) / 10_000) * 10_000,
  prerequisiteId: index > 0 ? `capacity-${String(index).padStart(2, '0')}` : undefined,
}));

function clampLevel(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Math.max(1, Math.min(10, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
}

function legacyTrainingLevel(state: TycoonState): number {
  return Math.max(1, Math.min(10, 1 + (Math.max(1, state.facilities.trainingCenter.level) - 1) * 2));
}

export function getTrainingAreaLevels(state: TycoonState): Record<TrainingFacilityAreaKey, number> {
  const fallback = legacyTrainingLevel(state);
  const saved = state.facilities.trainingCenter.trainingAreaLevels ?? {};
  return Object.fromEntries(TRAINING_AREA_SPECS.map(spec => [spec.id, clampLevel(saved[spec.id], fallback)])) as Record<TrainingFacilityAreaKey, number>;
}

export function getOwnedTrainingCenterRating(state: TycoonState): number {
  const levels = Object.values(getTrainingAreaLevels(state));
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  return Math.min(99, Math.round(35 + ((average - 1) / 9) * 64));
}

export function getTrainingCenterRating(state: TycoonState): number {
  const sponsorBonus = getTrainingSponsorBonuses(state).reduce((sum, bonus) => sum + bonus.ratingBonus, 0);
  const permanentBonus = state.facilities.trainingCenter.permanentSponsorRatingBonus ?? 0;
  return Math.min(99, getOwnedTrainingCenterRating(state) + sponsorBonus + permanentBonus);
}

export function getTrainingUpgradeCost(area: TrainingAreaSpec, currentLevel: number, economyIndex: number): number {
  if (currentLevel >= 10) return 0;
  return Math.round((area.baseCostEUR * Math.pow(1.48, currentLevel - 1) * Math.max(0.05, economyIndex)) / 5_000) * 5_000;
}

export function purchaseTrainingAreaUpgrade(
  state: TycoonState,
  areaId: TrainingFacilityAreaKey,
  currentDate: string,
  currentYear: number,
  economyIndex: number,
): boolean {
  const area = TRAINING_AREA_SPECS.find(spec => spec.id === areaId);
  if (!area) return false;
  const levels = getTrainingAreaLevels(state);
  const currentLevel = levels[areaId];
  const baseCost = getTrainingUpgradeCost(area, currentLevel, economyIndex);
  if (baseCost <= 0) return false;
  const quote = getSponsorPurchaseQuote(state, currentYear, ['facilityUpgrade', 'facilityUpgradeCost'], baseCost);
  const cost = quote.costEUR;
  if (getClubFinanceSnapshot(state, currentDate).availableEUR < cost) return false;
  const targetLevel = currentLevel + 1;
  if (cost > 0) {
    const transaction = postClubTransaction(state, {
      sourceId: `training-area:${areaId}:level-${targetLevel}`,
      date: currentDate,
      season: currentYear,
      category: 'facility',
      label: `${area.label} Level ${targetLevel}`,
      amountEUR: -cost,
    });
    if (!transaction) return false;
  }
  state.facilities.trainingCenter.trainingAreaLevels = { ...levels, [areaId]: targetLevel };
  const average = Object.values({ ...levels, [areaId]: targetLevel }).reduce((sum, level) => sum + level, 0) / TRAINING_AREA_SPECS.length;
  state.facilities.trainingCenter.level = Math.max(1, Math.min(5, 1 + Math.floor((average - 1) / 2.25)));
  commitSponsorPurchaseQuote(state, currentYear, quote);
  return true;
}

function inferredLegacyFeatureIds(stadium: StadiumFacilityState): ArenaFeatureId[] {
  const count = Math.max(0, Math.min(ARENA_FEATURE_SPECS.length, (Math.max(1, stadium.level) - 1) * 2));
  return ARENA_FEATURE_SPECS.slice(0, count).map(feature => feature.id);
}

export function getOwnedArenaFeatureIds(stadium: StadiumFacilityState): ArenaFeatureId[] {
  return stadium.installedArenaFeatures ?? inferredLegacyFeatureIds(stadium);
}

export function getArenaRating(stadium: StadiumFacilityState, currentCapacity?: number, sponsoredFeatureIds: ArenaFeatureId[] = []): number {
  const capacity = Math.max(0, currentCapacity ?? stadium.capacity ?? 0);
  const capacityScore = Math.min(59, Math.round((capacity / 8_000) * 30));
  const featureScore = new Set([...getOwnedArenaFeatureIds(stadium), ...sponsoredFeatureIds]).size * 5;
  return Math.min(99, Math.max(1, capacityScore + featureScore + (stadium.permanentSponsorRatingBonus ?? 0)));
}

export function getArenaAttributeRatings(stadium: StadiumFacilityState, capacity: number, sponsoredFeatureIds: ArenaFeatureId[] = []) {
  const base = Math.min(82, 38 + Math.round(capacity / 450));
  const result = { attendance: base, vip: Math.max(30, base - 4), atmosphere: Math.max(35, base - 2), engagement: Math.max(32, base - 5), concessions: Math.max(30, base - 7), media: Math.max(30, base - 6) };
  const activeFeatureIds = new Set([...getOwnedArenaFeatureIds(stadium), ...sponsoredFeatureIds]);
  for (const feature of ARENA_FEATURE_SPECS) {
    if (!activeFeatureIds.has(feature.id)) continue;
    for (const [key, value] of Object.entries(feature.attributes)) result[key as keyof typeof result] += value ?? 0;
  }
  for (const key of Object.keys(result) as Array<keyof typeof result>) result[key] = Math.min(99, result[key]);
  return result;
}

export function getArenaProjectCost(baseCostEUR: number, economyIndex: number): number {
  return Math.round((baseCostEUR * Math.max(0.05, economyIndex)) / 5_000) * 5_000;
}

const getArenaVenueTransactionScope = (stadium: StadiumFacilityState): string => stadium.venue?.id
  ? `:${stadium.venue.id}`
  : '';

export function purchaseArenaFeature(
  state: TycoonState,
  featureId: ArenaFeatureId,
  currentDate: string,
  currentYear: number,
  economyIndex: number,
): boolean {
  const feature = ARENA_FEATURE_SPECS.find(spec => spec.id === featureId);
  const stadium = state.facilities.stadium;
  const owned = getOwnedArenaFeatureIds(stadium);
  if (!feature || owned.includes(featureId)) return false;
  const quote = getSponsorPurchaseQuote(state, currentYear, ['facilityUpgrade', 'facilityUpgradeCost'], getArenaProjectCost(feature.baseCostEUR, economyIndex));
  const cost = quote.costEUR;
  if (getClubFinanceSnapshot(state, currentDate).availableEUR < cost) return false;
  if (cost > 0) {
    const transaction = postClubTransaction(state, { sourceId: `arena-feature${getArenaVenueTransactionScope(stadium)}:${featureId}`, date: currentDate, season: currentYear, category: 'facility', label: feature.label, amountEUR: -cost });
    if (!transaction) return false;
  }
  stadium.installedArenaFeatures = [...owned, featureId];
  stadium.completedArenaProjects = [...new Set([...(stadium.completedArenaProjects ?? []), featureId])];
  commitSponsorPurchaseQuote(state, currentYear, quote);
  return true;
}

export function purchaseArenaCapacityProject(
  state: TycoonState,
  projectId: string,
  currentCapacity: number,
  currentDate: string,
  currentYear: number,
  economyIndex: number,
): boolean {
  const project = ARENA_CAPACITY_PROJECTS.find(spec => spec.id === projectId);
  const stadium = state.facilities.stadium;
  const completed = stadium.completedArenaProjects ?? [];
  if (!project || completed.includes(projectId) || (project.prerequisiteId && !completed.includes(project.prerequisiteId))) return false;
  const quote = getSponsorPurchaseQuote(state, currentYear, ['facilityUpgrade', 'facilityUpgradeCost'], getArenaProjectCost(project.baseCostEUR, economyIndex));
  const cost = quote.costEUR;
  if (getClubFinanceSnapshot(state, currentDate).availableEUR < cost) return false;
  if (cost > 0) {
    const transaction = postClubTransaction(state, { sourceId: `arena-capacity${getArenaVenueTransactionScope(stadium)}:${projectId}`, date: currentDate, season: currentYear, category: 'facility', label: `${project.label} (+${project.seatGain.toLocaleString()} seats)`, amountEUR: -cost });
    if (!transaction) return false;
  }
  stadium.baseCapacity = stadium.baseCapacity ?? currentCapacity;
  stadium.capacity = Math.max(currentCapacity, stadium.capacity ?? 0) + project.seatGain;
  stadium.completedArenaProjects = [...completed, projectId];
  commitSponsorPurchaseQuote(state, currentYear, quote);
  return true;
}
