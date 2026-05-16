import type { SponsorshipSlot, SponsorIndustry } from '../../types/tycoon';

// ─────────────────────────────────────────────────────────────────────────
// Slot-level metadata
// ─────────────────────────────────────────────────────────────────────────

export const SLOT_PLACEMENT_LABEL: Record<SponsorshipSlot, string> = {
  kit: 'Front of Shirt',
  sleeve: 'Sleeve Patch',
  back: 'Back of Shirt',
  shorts: 'Shorts Front',
  training: 'Training Kit',
  court: 'Court Logo',
  stadium: 'Arena Naming Rights',
  practice: 'Practice Facility',
};

export const SLOT_OFFER_TITLE: Record<SponsorshipSlot, string> = {
  kit: 'Kit Sponsor',
  sleeve: 'Sleeve Sponsor',
  back: 'Back of Shirt',
  shorts: 'Shorts Sponsor',
  training: 'Training Kit',
  court: 'Court Logo',
  stadium: 'Arena Naming',
  practice: 'Practice Facility',
};

export type VisibilityTier = 'Prime' | 'High' | 'Medium' | 'Low';

export const SLOT_VISIBILITY: Record<SponsorshipSlot, VisibilityTier> = {
  kit: 'Prime',
  stadium: 'Prime',
  sleeve: 'High',
  back: 'High',
  court: 'High',
  shorts: 'Medium',
  training: 'Medium',
  practice: 'Low',
};

/** "What the sponsor gets" — the activation rights bundle per slot.
 *  Used in the OVERVIEW > WHAT X GETS column on the SponsorOfferModal. */
export const SLOT_SPONSOR_PERKS: Record<SponsorshipSlot, string[]> = {
  kit: [
    'Front of shirt logo placement',
    'In-arena LED branding',
    'Digital & social media integration',
    'Co-branded content (4 per season)',
    'Player appearances (2 per season)',
    'Hospitality & VIP experiences',
    'Community & youth program support',
  ],
  sleeve: [
    'Sleeve patch placement',
    'In-arena LED rotation',
    'Social media mentions',
    'Co-branded content (2 per season)',
    'Branded fan event presence',
    'Community program support',
  ],
  back: [
    'Back of shirt logo placement',
    'In-arena LED branding',
    'Social media integration',
    'Co-branded content (2 per season)',
    'Hospitality access',
  ],
  shorts: [
    'Shorts front logo placement',
    'In-arena LED rotation',
    'Social media mentions',
    'Branded fan touchpoints',
  ],
  training: [
    'Training kit logo placement',
    'Practice content access',
    'Behind-the-scenes feature inclusion',
    'Training facility branded signage',
    'Social media integration',
  ],
  court: [
    'Court logo placement',
    'Premium broadcast visibility',
    'In-arena signage dominance',
    'Co-branded matchday content',
    'Hospitality access',
  ],
  stadium: [
    'Arena naming rights',
    'Exterior building signage',
    'In-arena visual dominance',
    'Premium hospitality suites',
    'Broadcast inclusion (every home game)',
    'Major event activation rights',
  ],
  practice: [
    'Practice facility naming',
    'Training-content B-roll inclusion',
    'Branded equipment placement',
    'Player-development program support',
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Industry-level metadata
// ─────────────────────────────────────────────────────────────────────────

export const INDUSTRY_PROFILE_LABEL: Record<SponsorIndustry | 'generic', string> = {
  airline: 'Aviation',
  bank: 'Financial Services',
  auto: 'Automotive',
  tech: 'Technology',
  telecom: 'Telecommunications',
  beer: 'Brewery / Beverage',
  water: 'Beverage',
  energy_drink: 'Energy Drink',
  fashion: 'Apparel & Lifestyle',
  gambling: 'Sports Betting',
  sportswashing: 'State Partner',
  generic: 'Commercial Partner',
};

/** Short brand description used in the header subtitle.
 *  `{country}` is replaced with the league/country name at render time. */
export const INDUSTRY_BRAND_DESCRIPTION: Record<SponsorIndustry | 'generic', string> = {
  airline: '{country}\'s aviation partner with a global passenger reach. Expanding sponsorship into elite basketball.',
  bank: 'Major financial institution looking to align with high-performance sport and premium audiences.',
  auto: 'Automotive manufacturer leveraging sport for brand reach and lifestyle positioning.',
  tech: 'Technology company aligned with elite performance, data, and broadcast innovation.',
  telecom: '{country}\'s leading telecommunications company with a strong focus on sports and digital innovation. Looking to expand visibility in basketball.',
  beer: 'Premier brewery with a long tradition of sports sponsorship and stadium activations.',
  water: 'Premium beverage brand emphasizing health, hydration, and athletic performance.',
  energy_drink: 'Global energy brand deeply tied to action sports, athletes, and event activations.',
  fashion: 'Leading sports apparel and lifestyle brand seeking on-court visibility.',
  gambling: 'Sports betting platform pursuing prime visibility in European basketball.',
  sportswashing: 'State-aligned partner pursuing global sports presence and soft-power positioning.',
  generic: 'Established commercial partner looking for reliable visibility and community alignment.',
};

/** Club-side benefits per industry — used in the CLUB BENEFITS section. */
export const INDUSTRY_CLUB_BENEFITS: Record<SponsorIndustry | 'generic', string[]> = {
  airline: [
    'Premium global brand association',
    'Travel partnership for team logistics',
    'International audience exposure',
    'Hospitality & business-class perks',
  ],
  bank: [
    'Significant revenue stability',
    'Financial services partnership for staff & players',
    'Premium brand credibility',
    'Long-term contract reliability',
  ],
  auto: [
    'Team vehicle program access',
    'Premium automotive partnership',
    'Hospitality & fan-event integration',
    'Performance-tied brand positioning',
  ],
  tech: [
    'Access to technology & innovation resources',
    'Data analytics partnership',
    'Digital fan engagement tools',
    'Broadcast & content production support',
  ],
  telecom: [
    'Significant increase in sponsorship revenue',
    'Partner with a leading global telecom brand',
    'Access to technology & innovation resources',
    'Support for community & grassroots programs',
  ],
  beer: [
    'Strong matchday activation potential',
    'Stadium concessions partnership',
    'Fan-event activation budget',
    'Regional brand alignment',
  ],
  water: [
    'Player hydration partnership',
    'Health & wellness brand alignment',
    'Family-friendly activation tone',
    'Youth program funding support',
  ],
  energy_drink: [
    'High-energy fan-event activations',
    'Athlete endorsement pipeline',
    'Content & media engagement',
    'Youth & college pipeline visibility',
  ],
  fashion: [
    'Apparel & equipment partnership',
    'On-court visual identity',
    'Retail & merchandising tie-in',
    'Lifestyle audience crossover',
  ],
  gambling: [
    'Above-market financial terms',
    'Strong digital activation budget',
    'Aggressive fan engagement campaigns',
    'Higher board scrutiny — handle carefully',
  ],
  sportswashing: [
    'Industry-leading financial terms',
    'Global brand reach',
    'Significant facility / capex contributions',
    'Reputation considerations apply',
  ],
  generic: [
    'Reliable annual sponsorship revenue',
    'Community-aligned brand identity',
    'Stable contract terms',
    'Local activation potential',
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Deal-shape constants
// ─────────────────────────────────────────────────────────────────────────

export type ExclusivityType = 'Category Exclusive' | 'Slot Exclusive' | 'Non-Exclusive';

export const EXCLUSIVITY_DEFAULT_BY_SLOT: Record<SponsorshipSlot, ExclusivityType> = {
  kit: 'Category Exclusive',
  stadium: 'Category Exclusive',
  sleeve: 'Slot Exclusive',
  back: 'Slot Exclusive',
  court: 'Slot Exclusive',
  shorts: 'Non-Exclusive',
  training: 'Non-Exclusive',
  practice: 'Non-Exclusive',
};

/** Default breakdown of the annual sponsor value into Base / Performance / Appearance.
 *  Numbers sum to 1.0. Tuned per archetype so premium deals have richer bonuses. */
export const DEAL_BREAKDOWN_RATIOS: Record<'premium' | 'gambling' | 'tech' | 'local' | 'generic', { baseFee: number; performanceBonus: number; appearanceClauses: number }> = {
  premium:  { baseFee: 0.83, performanceBonus: 0.11, appearanceClauses: 0.06 },
  gambling: { baseFee: 0.70, performanceBonus: 0.22, appearanceClauses: 0.08 },
  tech:     { baseFee: 0.75, performanceBonus: 0.18, appearanceClauses: 0.07 },
  local:    { baseFee: 0.88, performanceBonus: 0.07, appearanceClauses: 0.05 },
  generic:  { baseFee: 0.80, performanceBonus: 0.14, appearanceClauses: 0.06 },
};

// ─────────────────────────────────────────────────────────────────────────
// Strategic Fit rubric
// ─────────────────────────────────────────────────────────────────────────

export type StrategicFitGrade = 'A+' | 'A' | 'B' | 'C' | 'D';

export const STRATEGIC_FIT_GRADES: Record<StrategicFitGrade, { label: string; tint: string; copy: string }> = {
  'A+': { label: 'Outstanding',  tint: 'text-emerald-300', copy: 'Outstanding match — premier opportunity for your club brand and long-term growth.' },
  'A':  { label: 'Excellent',    tint: 'text-emerald-300', copy: 'Excellent match for your club\'s brand and long-term growth strategy.' },
  'B':  { label: 'Good',         tint: 'text-emerald-400', copy: 'Solid commercial fit — supports club positioning with limited tradeoffs.' },
  'C':  { label: 'Fair',         tint: 'text-amber-300',   copy: 'Workable deal but partial brand misalignment — weigh against alternatives.' },
  'D':  { label: 'Poor',         tint: 'text-rose-400',    copy: 'Significant brand or audience mismatch — consider declining.' },
};

// ─────────────────────────────────────────────────────────────────────────
// Negotiation window
// ─────────────────────────────────────────────────────────────────────────

/** How many in-game days a fresh offer stays open before it auto-expires. */
export const NEGOTIATION_WINDOW_DAYS = 12;

// ─────────────────────────────────────────────────────────────────────────
// Active-sponsor (CurrentSponsorModal) — relationship + impact tiers
// ─────────────────────────────────────────────────────────────────────────

export type RelationshipTier = 'Excellent' | 'Good' | 'Neutral' | 'Cool' | 'Poor';

export const RELATIONSHIP_TIERS: Record<RelationshipTier, { tint: string; copy: string; threshold: number }> = {
  Excellent: { tint: 'text-emerald-300', copy: 'The sponsor is delighted with visibility, performance, and brand alignment.', threshold: 85 },
  Good:      { tint: 'text-emerald-300', copy: 'The sponsor is satisfied with our visibility and brand alignment.', threshold: 65 },
  Neutral:   { tint: 'text-slate-300',   copy: 'The sponsor sees us as a steady but not standout partner.', threshold: 45 },
  Cool:      { tint: 'text-amber-300',   copy: 'The sponsor is dissatisfied — expectations are not being met.', threshold: 25 },
  Poor:      { tint: 'text-rose-400',    copy: 'The sponsor is openly frustrated; renewal is at high risk.', threshold: 0 },
};

export function tierForRelationshipScore(score: number): RelationshipTier {
  if (score >= 85) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Neutral';
  if (score >= 25) return 'Cool';
  return 'Poor';
}

export type ImpactTier = 'Excellent' | 'High' | 'Medium' | 'Low' | 'Poor';

export const IMPACT_TIER_TINT: Record<ImpactTier, string> = {
  Excellent: 'text-emerald-300',
  High:      'text-emerald-400',
  Medium:    'text-amber-300',
  Low:       'text-amber-400',
  Poor:      'text-rose-400',
};

/** Visibility tier → typical impact tier mapping for the SPONSORSHIP IMPACT panel.
 *  Used as a sensible default until a real performance model exists. */
export const SLOT_DEFAULT_IMPACT: Record<SponsorshipSlot, { brandExposure: ImpactTier; fanRecognition: ImpactTier; socialMedia: ImpactTier; commercial: ImpactTier; marketFit: ImpactTier }> = {
  kit:      { brandExposure: 'High',      fanRecognition: 'High',   socialMedia: 'High',   commercial: 'High',   marketFit: 'Excellent' },
  stadium:  { brandExposure: 'Excellent', fanRecognition: 'High',   socialMedia: 'Medium', commercial: 'High',   marketFit: 'High' },
  sleeve:   { brandExposure: 'High',      fanRecognition: 'Medium', socialMedia: 'Medium', commercial: 'High',   marketFit: 'High' },
  back:     { brandExposure: 'High',      fanRecognition: 'Medium', socialMedia: 'Medium', commercial: 'Medium', marketFit: 'High' },
  court:    { brandExposure: 'High',      fanRecognition: 'Medium', socialMedia: 'Low',    commercial: 'Medium', marketFit: 'High' },
  shorts:   { brandExposure: 'Medium',    fanRecognition: 'Low',    socialMedia: 'Low',    commercial: 'Medium', marketFit: 'Medium' },
  training: { brandExposure: 'Medium',    fanRecognition: 'Low',    socialMedia: 'Medium', commercial: 'Low',    marketFit: 'Medium' },
  practice: { brandExposure: 'Low',       fanRecognition: 'Low',    socialMedia: 'Low',    commercial: 'Low',    marketFit: 'Medium' },
};

/** Default payment cadence + termination terms used in the CONTRACT TERMS panel. */
export const CONTRACT_TERMS_DEFAULTS = {
  paymentStructure: 'Quarterly',
  renewalOption: '1 Year (Club Option)',
  terminationNoticeDays: 90,
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

export function describeBrand(industry: SponsorIndustry | 'generic' | undefined, country = 'Spain'): string {
  const key = (industry ?? 'generic') as SponsorIndustry | 'generic';
  return (INDUSTRY_BRAND_DESCRIPTION[key] ?? INDUSTRY_BRAND_DESCRIPTION.generic).replace('{country}', country);
}

export function getSponsorPerks(slot: SponsorshipSlot): string[] {
  return SLOT_SPONSOR_PERKS[slot] ?? [];
}

export function getClubBenefits(industry: SponsorIndustry | 'generic' | undefined): string[] {
  const key = (industry ?? 'generic') as SponsorIndustry | 'generic';
  return INDUSTRY_CLUB_BENEFITS[key] ?? INDUSTRY_CLUB_BENEFITS.generic;
}

export function breakdownAnnualValue(
  valuePerYear: number,
  archetype: 'premium' | 'gambling' | 'tech' | 'local' | 'generic' | undefined,
): { baseFee: number; performanceBonus: number; appearanceClauses: number } {
  const ratios = DEAL_BREAKDOWN_RATIOS[archetype ?? 'generic'];
  return {
    baseFee: Math.round(valuePerYear * ratios.baseFee),
    performanceBonus: Math.round(valuePerYear * ratios.performanceBonus),
    appearanceClauses: Math.round(valuePerYear * ratios.appearanceClauses),
  };
}
