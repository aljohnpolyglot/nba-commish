import {
  getMarketOffer,
  applyRenewal,
  applyDecline,
  dekrementSponsorshipYears,
  seedInitialSponsorships,
  hasExpiredSlot,
} from '../src/services/tycoon/sponsorshipEngine';
import type { TycoonState, TycoonTier } from '../src/types/tycoon';

function makeTycoon(tier: TycoonTier): TycoonState {
  return {
    tier,
    sponsorships: {
      kit:     { sponsor: 'X', valuePerYear: 5_000_000, yearsRemaining: 0, signedYear: 2022 },
      sleeve:  { sponsor: 'Y', valuePerYear: 1_500_000, yearsRemaining: 2, signedYear: 2024 },
      stadium: { sponsor: 'Z', valuePerYear: 2_000_000, yearsRemaining: 5, signedYear: 2024 },
    },
    facilities: { stadium: { level: 1, capacity: 15000 }, trainingCenter: { level: 1 }, academy: { level: 1 } },
    ledgerHistory: [],
    cashOnHand: 10_000_000,
    boardConfidence: 60,
    ffpRollingDeficit: 0,
  };
}

const assert = (c: boolean, m: string) => {
  if (!c) { console.error('FAIL:', m); process.exit(1); }
};

const sTycoon = makeTycoon('S');
const offerS = getMarketOffer(sTycoon, 'kit', {
  recentEndesaPositions: [1, 1, 2],
  recentEuroleagueStages: ['final-four', 'qf', 'final-four'],
});
console.log('S-Tier Kit Offer:', offerS);
assert(offerS.valuePerYear > 3_000_000, `S-Tier with success bonus > tier-base floor (got ${offerS.valuePerYear})`);
assert(offerS.years >= 3 && offerS.years <= 4, `Years 3–4 (got ${offerS.years})`);

const dTycoon = makeTycoon('D');
const offerD = getMarketOffer(dTycoon, 'kit', {
  recentEndesaPositions: [16, 18, 17],
  recentEuroleagueStages: ['none', 'none', 'none'],
});
console.log('D-Tier Kit Offer:', offerD);
assert(offerD.valuePerYear < 200_000, `D-Tier with no success is small (got ${offerD.valuePerYear})`);

// Accept
applyRenewal(sTycoon, 'kit', offerS, 2026);
assert(sTycoon.sponsorships.kit?.valuePerYear === offerS.valuePerYear, 'kit replaced with new offer');
assert(sTycoon.sponsorships.kit?.yearsRemaining === offerS.years, 'kit years set');
assert(sTycoon.sponsorships.kit?.signedYear === 2026, 'signedYear set');

// Decline
applyDecline(sTycoon, 'sleeve');
assert(sTycoon.sponsorships.sleeve === null, 'sleeve cleared on decline');
assert(hasExpiredSlot(sTycoon), 'hasExpiredSlot true after decline');

// Decrement
const sTycoon2 = makeTycoon('S');
sTycoon2.sponsorships.kit!.yearsRemaining = 1;
dekrementSponsorshipYears(sTycoon2);
assert(sTycoon2.sponsorships.kit === null, 'kit-with-1y becomes null after decrement+expire');
assert(sTycoon2.sponsorships.stadium?.yearsRemaining === 4, `stadium 5→4 (got ${sTycoon2.sponsorships.stadium?.yearsRemaining})`);

// Seed
const seeded = seedInitialSponsorships('A', 2026);
assert(seeded.kit !== null && seeded.kit.valuePerYear > 500_000, 'A-tier seed has kit with reasonable value');
assert(seeded.kit!.yearsRemaining >= 1 && seeded.kit!.yearsRemaining <= 4, 'kit years 1–4');

console.log('\n✓ All sponsor assertions passed');
