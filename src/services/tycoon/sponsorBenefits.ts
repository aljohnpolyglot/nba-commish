import type {
  ArenaFeatureId,
  SponsorBenefitPackage,
  SponsorIndustry,
  SponsorshipSlot,
  TrainingFacilityAreaKey,
  TycoonState,
} from '../../types/tycoon';

interface BenefitOffer {
  sponsor: string;
  industry?: SponsorIndustry;
  slot: SponsorshipSlot;
  valuePerYear: number;
}

function serviceStars(valuePerYear: number): number {
  if (valuePerYear >= 1_500_000) return 5;
  if (valuePerYear >= 800_000) return 4;
  if (valuePerYear >= 350_000) return 3;
  if (valuePerYear >= 150_000) return 2;
  return 1;
}

export function createSponsorBenefitPackage(offer: BenefitOffer): SponsorBenefitPackage | undefined {
  const stars = serviceStars(offer.valuePerYear);
  if (offer.industry === 'airline' || offer.industry === 'auto') {
    const travelMode = offer.industry === 'airline' ? 'flight' : 'bus';
    return { kind: 'travel', label: `${stars}-star ${travelMode === 'flight' ? 'flight' : 'ground travel'} coverage`, travelMode, serviceStars: stars, inKindValueEUR: stars * (travelMode === 'flight' ? 75_000 : 20_000) };
  }
  if (offer.industry === 'water' || offer.industry === 'beer' || offer.industry === 'energy_drink') {
    const reduction = Math.min(8, 2 + stars);
    return { kind: 'recovery', label: `Recovery and hydration package`, fatigueReduction: reduction, serviceStars: stars, inKindValueEUR: stars * 15_000 };
  }
  if (offer.industry === 'tech' || offer.industry === 'telecom') {
    if (offer.slot === 'stadium' || offer.slot === 'court') {
      const feature: ArenaFeatureId = offer.slot === 'court' ? 'led-ribbon' : stars >= 4 ? 'jumbotron' : 'media-center';
      return { kind: 'arena', label: `${feature === 'jumbotron' ? 'Jumbotron' : feature === 'led-ribbon' ? 'LED ribbon' : 'Media center'} sponsor package`, arenaFeatureId: feature, serviceStars: stars, inKindValueEUR: stars * 40_000 };
    }
    const trainingArea: TrainingFacilityAreaKey = stars >= 4 ? 'science' : 'video';
    return { kind: 'training', label: `${trainingArea === 'science' ? 'Sports science' : 'Video analysis'} technology package`, trainingArea, trainingRatingBonus: Math.min(8, 2 + stars), serviceStars: stars, inKindValueEUR: stars * 30_000 };
  }
  if (offer.industry === 'bank') {
    const limit = Math.round(Math.max(250_000, offer.valuePerYear * (2.5 + stars * 0.5)) / 50_000) * 50_000;
    return { kind: 'bank', label: `Club credit line up to €${(limit / 1_000_000).toFixed(limit >= 1_000_000 ? 1 : 2)}M`, bankLoanLimitEUR: limit, bankAnnualRate: Math.max(0.035, 0.085 - stars * 0.008), serviceStars: stars, inKindValueEUR: stars * 10_000 };
  }
  return undefined;
}

export function sponsorCashValueAfterServices(grossValueEUR: number, benefitPackage?: SponsorBenefitPackage): number {
  const gross = Math.max(0, Math.round(grossValueEUR));
  if (!benefitPackage?.inKindValueEUR) return gross;
  return Math.round(Math.max(gross * 0.55, gross - benefitPackage.inKindValueEUR) / 5_000) * 5_000;
}

function activePackages(state: TycoonState): Array<{ sponsor: string; package: SponsorBenefitPackage }> {
  return (Object.entries(state.sponsorships ?? {}) as Array<[SponsorshipSlot, TycoonState['sponsorships'][SponsorshipSlot]]>)
    .flatMap(([slot, deal]) => {
      if (!deal || deal.yearsRemaining <= 0) return [];
      const benefitPackage = deal.benefitPackage ?? createSponsorBenefitPackage({
        sponsor: deal.sponsor,
        industry: deal.industry,
        slot,
        valuePerYear: deal.valuePerYear,
      });
      return benefitPackage ? [{ sponsor: deal.sponsor, package: benefitPackage }] : [];
    });
}

export function getSponsorTravelCoverage(state: TycoonState, mode: 'flight' | 'bus') {
  return activePackages(state)
    .filter(item => item.package.kind === 'travel' && item.package.travelMode === mode)
    .sort((left, right) => (right.package.serviceStars ?? 0) - (left.package.serviceStars ?? 0))[0] ?? null;
}

export function getSponsorRecoveryReduction(state: TycoonState): number {
  return Math.max(0, ...activePackages(state).filter(item => item.package.kind === 'recovery').map(item => item.package.fatigueReduction ?? 0));
}

export function getTrainingSponsorBonuses(state: TycoonState): Array<{ sponsor: string; area: TrainingFacilityAreaKey; ratingBonus: number; label: string }> {
  return activePackages(state).flatMap(item => item.package.kind === 'training' && item.package.trainingArea
    ? [{ sponsor: item.sponsor, area: item.package.trainingArea, ratingBonus: item.package.trainingRatingBonus ?? 0, label: item.package.label }]
    : []);
}

export function getSponsoredArenaFeatures(state: TycoonState): Array<{ sponsor: string; featureId: ArenaFeatureId; label: string }> {
  return activePackages(state).flatMap(item => item.package.kind === 'arena' && item.package.arenaFeatureId
    ? [{ sponsor: item.sponsor, featureId: item.package.arenaFeatureId, label: item.package.label }]
    : []);
}

export function getBankSponsorAccess(state: TycoonState) {
  return activePackages(state)
    .filter(item => item.package.kind === 'bank')
    .sort((left, right) => (right.package.bankLoanLimitEUR ?? 0) - (left.package.bankLoanLimitEUR ?? 0))[0] ?? null;
}
