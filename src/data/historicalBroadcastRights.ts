import type { BroadcastOffer, GameState, MediaRights } from '../types';
import { getSimulationSeed } from '../services/saveIdentity';
import {
  buildPbaBroadcastOffers,
  resolvePbaBroadcastPartnerLogoUrl,
} from './pbaBroadcastRights';

export interface HistoricalBroadcastEra {
  startSeason: number;
  endSeason: number;
  partners: string[];
  partnerIds: string[];
  annualValueUSD: number;
  bidMinUSD: number;
  bidMaxUSD: number;
  alternatives: string[];
}

export const HISTORICAL_BROADCAST_ERAS: HistoricalBroadcastEra[] = [
  { startSeason: 1946, endSeason: 1952, partners: [], partnerIds: [], annualValueUSD: 0, bidMinUSD: 0, bidMaxUSD: 25_000, alternatives: ['DuMont', 'NBC', 'CBS'] },
  { startSeason: 1953, endSeason: 1953, partners: ['DuMont'], partnerIds: ['dumont'], annualValueUSD: 39_000, bidMinUSD: 25_000, bidMaxUSD: 60_000, alternatives: ['NBC', 'CBS', 'ABC'] },
  { startSeason: 1954, endSeason: 1961, partners: ['NBC'], partnerIds: ['nbc'], annualValueUSD: 175_000, bidMinUSD: 50_000, bidMaxUSD: 300_000, alternatives: ['CBS', 'ABC', 'DuMont'] },
  { startSeason: 1962, endSeason: 1963, partners: ['Sports Network Incorporated / Hughes'], partnerIds: ['sni'], annualValueUSD: 325_000, bidMinUSD: 150_000, bidMaxUSD: 500_000, alternatives: ['NBC', 'ABC', 'CBS'] },
  { startSeason: 1964, endSeason: 1972, partners: ['ABC'], partnerIds: ['abc'], annualValueUSD: 650_000, bidMinUSD: 450_000, bidMaxUSD: 1_200_000, alternatives: ['CBS', 'NBC', 'Hughes / SNI'] },
  { startSeason: 1973, endSeason: 1978, partners: ['CBS'], partnerIds: ['cbs'], annualValueUSD: 13_750_000, bidMinUSD: 7_000_000, bidMaxUSD: 22_000_000, alternatives: ['ABC', 'NBC', 'Syndicated television'] },
  { startSeason: 1979, endSeason: 1981, partners: ['CBS', 'USA Network'], partnerIds: ['cbs', 'usa'], annualValueUSD: 19_000_000, bidMinUSD: 15_000_000, bidMaxUSD: 27_000_000, alternatives: ['ABC', 'NBC', 'ESPN', 'Independent syndication'] },
  { startSeason: 1982, endSeason: 1983, partners: ['CBS', 'USA Network', 'ESPN'], partnerIds: ['cbs', 'usa', 'espn'], annualValueUSD: 28_500_000, bidMinUSD: 22_000_000, bidMaxUSD: 40_000_000, alternatives: ['NBC', 'ABC', 'TBS'] },
  { startSeason: 1984, endSeason: 1987, partners: ['CBS', 'TBS'], partnerIds: ['cbs', 'tnt'], annualValueUSD: 44_500_000, bidMinUSD: 30_000_000, bidMaxUSD: 70_000_000, alternatives: ['NBC', 'ABC', 'ESPN', 'USA Network'] },
  { startSeason: 1988, endSeason: 1989, partners: ['CBS', 'TBS / TNT'], partnerIds: ['cbs', 'tnt'], annualValueUSD: 70_500_000, bidMinUSD: 55_000_000, bidMaxUSD: 95_000_000, alternatives: ['NBC', 'ABC', 'ESPN', 'Fox'] },
  { startSeason: 1990, endSeason: 1993, partners: ['NBC', 'TNT'], partnerIds: ['nbc', 'tnt'], annualValueUSD: 218_750_000, bidMinUSD: 175_000_000, bidMaxUSD: 285_000_000, alternatives: ['CBS', 'ABC', 'ESPN / TBS'] },
  { startSeason: 1994, endSeason: 1997, partners: ['NBC', 'TNT / TBS'], partnerIds: ['nbc', 'tnt'], annualValueUSD: 286_875_000, bidMinUSD: 225_000_000, bidMaxUSD: 390_000_000, alternatives: ['CBS', 'ABC', 'Fox', 'ESPN'] },
  { startSeason: 1998, endSeason: 2001, partners: ['NBC', 'TNT / TBS'], partnerIds: ['nbc', 'tnt'], annualValueUSD: 660_000_000, bidMinUSD: 525_000_000, bidMaxUSD: 850_000_000, alternatives: ['ABC / ESPN', 'CBS', 'Fox'] },
  { startSeason: 2002, endSeason: 2007, partners: ['ABC / ESPN', 'TNT'], partnerIds: ['espn', 'tnt'], annualValueUSD: 766_666_667, bidMinUSD: 600_000_000, bidMaxUSD: 1_000_000_000, alternatives: ['NBC', 'Fox', 'CBS'] },
  { startSeason: 2008, endSeason: 2015, partners: ['ABC / ESPN', 'TNT'], partnerIds: ['espn', 'tnt'], annualValueUSD: 925_000_000, bidMinUSD: 750_000_000, bidMaxUSD: 1_250_000_000, alternatives: ['NBCUniversal', 'Fox', 'CBS'] },
  { startSeason: 2016, endSeason: 2024, partners: ['ABC / ESPN', 'TNT'], partnerIds: ['espn', 'tnt'], annualValueUSD: 2_666_666_667, bidMinUSD: 2_100_000_000, bidMaxUSD: 3_300_000_000, alternatives: ['NBCUniversal', 'Fox', 'CBS', 'Digital partner'] },
  { startSeason: 2025, endSeason: 2035, partners: ['ABC / ESPN', 'NBC / Peacock', 'Prime Video'], partnerIds: ['espn', 'nbc', 'amazon'], annualValueUSD: 6_909_090_909, bidMinUSD: 5_800_000_000, bidMaxUSD: 8_300_000_000, alternatives: ['WBD / TNT', 'Apple', 'YouTube', 'Netflix'] },
];

export const BROADCAST_PARTNER_DOMAINS: Record<string, string> = {
  abc: 'abc.com',
  amazon: 'primevideo.com',
  apple: 'tv.apple.com',
  cbs: 'cbssports.com',
  disney: 'disneyplus.com',
  dumont: 'dumontnetwork.com',
  espn: 'espn.com',
  fox: 'foxsports.com',
  fubo: 'fubo.tv',
  fanduel: 'fanduel.com',
  hbo: 'max.com',
  hulu: 'hulu.com',
  meta: 'facebook.com',
  nbc: 'nbcsports.com',
  netflix: 'netflix.com',
  paramount: 'paramountplus.com',
  pif: 'pif.gov.sa',
  sling: 'sling.com',
  sni: 'hughes.com',
  streameast: 'streameast.app',
  tnt: 'tntsports.com',
  tencent: 'tencent.com',
  usa: 'usanetwork.com',
  youtube: 'youtube.com',
};

export function resolveBroadcastPartnerLogoUrl(id: string, size = 96): string | null {
  const pbaLogo = resolvePbaBroadcastPartnerLogoUrl(id);
  if (pbaLogo) return pbaLogo;
  const domain = BROADCAST_PARTNER_DOMAINS[id];
  if (!domain) return null;
  const token = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LOGODEV_TOKEN;
  return `https://img.logo.dev/${domain}?size=${size}&format=png${token ? `&token=${token}` : ''}`;
}

const BIDDER_CATALOG = [
  { id: 'nbc', name: 'NBC / Peacock', firstSeason: 1946, approval: 90, type: 'national', specialty: 'Balanced' },
  { id: 'cbs', name: 'CBS Sports', firstSeason: 1946, approval: 84, type: 'national', specialty: 'Balanced' },
  { id: 'abc', name: 'ABC / ESPN', firstSeason: 1948, approval: 92, type: 'national', specialty: 'Reach' },
  { id: 'espn', name: 'ESPN / ABC', firstSeason: 1979, approval: 85, type: 'national', specialty: 'Balanced' },
  { id: 'tnt', name: 'TNT Sports / WBD', firstSeason: 1984, approval: 95, type: 'national', specialty: 'Fan Favorite' },
  { id: 'fox', name: 'FOX Sports', firstSeason: 1986, approval: 80, type: 'national', specialty: 'Reach' },
  { id: 'hbo', name: 'HBO / Max', firstSeason: 1989, approval: 88, type: 'streaming', specialty: 'Revenue' },
  { id: 'tencent', name: 'Tencent', firstSeason: 1998, approval: 60, type: 'streaming', specialty: 'International' },
  { id: 'meta', name: 'Meta / Facebook', firstSeason: 2004, approval: 65, type: 'streaming', specialty: 'Reach' },
  { id: 'youtube', name: 'YouTube', firstSeason: 2005, approval: 96, type: 'streaming', specialty: 'Reach' },
  { id: 'netflix', name: 'Netflix', firstSeason: 2007, approval: 82, type: 'streaming', specialty: 'Reach' },
  { id: 'hulu', name: 'Hulu', firstSeason: 2008, approval: 80, type: 'streaming', specialty: 'Balanced' },
  { id: 'fanduel', name: 'FanDuel', firstSeason: 2009, approval: 40, type: 'national', specialty: 'Revenue' },
  { id: 'amazon', name: 'Amazon Prime Video', firstSeason: 2014, approval: 70, type: 'streaming', specialty: 'Revenue' },
  { id: 'fubo', name: 'Fubo', firstSeason: 2015, approval: 70, type: 'streaming', specialty: 'Niche' },
  { id: 'sling', name: 'Sling TV', firstSeason: 2015, approval: 68, type: 'streaming', specialty: 'Niche' },
  { id: 'pif', name: 'Saudi PIF', firstSeason: 2015, approval: 15, type: 'special', specialty: 'Revenue (Extreme)' },
  { id: 'streameast', name: 'Streameast', firstSeason: 2018, approval: 100, type: 'special', specialty: 'Piracy / Reach' },
  { id: 'apple', name: 'Apple TV+', firstSeason: 2019, approval: 78, type: 'streaming', specialty: 'Revenue' },
  { id: 'disney', name: 'Disney+', firstSeason: 2019, approval: 85, type: 'streaming', specialty: 'Reach' },
  { id: 'paramount', name: 'Paramount+', firstSeason: 2021, approval: 75, type: 'streaming', specialty: 'Balanced' },
] as const;

export const getHistoricalBroadcastEra = (seasonStart: number): HistoricalBroadcastEra => {
  if (seasonStart < HISTORICAL_BROADCAST_ERAS[0].startSeason) return HISTORICAL_BROADCAST_ERAS[0];
  return HISTORICAL_BROADCAST_ERAS.find(era =>
    seasonStart >= era.startSeason && seasonStart <= era.endSeason
  ) ?? HISTORICAL_BROADCAST_ERAS[HISTORICAL_BROADCAST_ERAS.length - 1];
};

export function getHistoricalBroadcastProfile(era: HistoricalBroadcastEra) {
  if (era.partnerIds.length === 0) {
    return { reach: 5, production: 15, security: 100, growth: 20, approval: 45 };
  }
  const maturity = Math.max(0, Math.min(1, (era.startSeason - 1953) / 52));
  const cableBoost = era.partnerIds.length > 1 ? 5 : 0;
  return {
    reach: Math.round(Math.min(98, 22 + maturity * 70 + cableBoost)),
    production: Math.round(Math.min(97, 35 + maturity * 58)),
    security: Math.round(Math.min(98, 88 + maturity * 8)),
    growth: Math.round(Math.min(96, 58 + maturity * 30 + cableBoost)),
    approval: Math.round(Math.min(96, 68 + maturity * 23)),
  };
}

export const hasHistoricalBroadcastDefault = (seasonStart: number): boolean =>
  HISTORICAL_BROADCAST_ERAS.some(era => seasonStart >= era.startSeason && seasonStart <= era.endSeason);

export function getBroadcastAgreementSeasonStart(state: Pick<GameState, 'date' | 'leagueStats'>): number {
  const date = new Date(state.date);
  const month = date.getUTCMonth() + 1;
  return month >= 6 && month <= 10
    ? date.getUTCFullYear()
    : state.leagueStats.year - 1;
}

export function buildHistoricalMediaRights(
  seasonStart: number,
  salaryCapUSD: number,
): MediaRights {
  const era = getHistoricalBroadcastEra(seasonStart);
  const profile = getHistoricalBroadcastProfile(era);
  const partners = era.partnerIds.length > 0 ? era.partnerIds : ['leaguepass'];
  const assign = (index: number) => [partners[index % partners.length]];
  const lpPrice = seasonStart < 1994 ? 0 : seasonStart < 2000 ? 9.95 : seasonStart < 2010 ? 14.99 : seasonStart < 2020 ? 19.99 : 24.99;
  const mediaRev = era.annualValueUSD / 1_000_000_000;
  const nonMediaRev = 7.4 * Math.max(0.0001, salaryCapUSD / 154_600_000);
  const phaseAssignments = {
    preseason: assign(0),
    openingweek: assign(0),
    regularseason: assign(0),
    christmasdaygames: assign(0),
    nbacupinseason: assign(0),
    allstarweekend: assign(1),
    playintournament: assign(1),
    playoffsround1: assign(1),
    playoffsround2: assign(1),
    conferencefinals: assign(0),
    nbafinals: assign(0),
    nbadraft: assign(0),
    nbadraftlottery: assign(0),
    digitalrights: assign(partners.length - 1),
  };
  return {
    activeBroadcasters: era.partnerIds,
    lpPrice,
    lpPriceMonthly: lpPrice,
    totalRev: mediaRev + nonMediaRev,
    mediaRev,
    lpRev: 0,
    salaryCap: salaryCapUSD / 1_000_000,
    phaseAssignments,
    scheduleAssignments: Object.fromEntries(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map((day, index) => [day, assign(index)]),
    ),
    isLocked: true,
    contractStartSeason: era.startSeason,
    contractEndSeason: era.endSeason,
    agreementName: `${era.partners.join(' + ') || 'No national television'} agreement`,
    historicalDefault: true,
    ...profile,
  };
}

const seededUnit = (seed: string): number => {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4_294_967_295;
};

export function buildBroadcastOffers(state: GameState): BroadcastOffer[] {
  const seasonStart = getBroadcastAgreementSeasonStart(state);
  if (state.leagueStats.uiMode === 'pba_isolated') {
    return buildPbaBroadcastOffers(state, seasonStart);
  }
  const era = getHistoricalBroadcastEra(seasonStart);
  const branchStart = Number(state.nbaStartYear ?? state.leagueStats.historicalEraStartYear);
  const postHistoricalBranch = state.leagueType === 'modded'
    && (state.moddedLeagueBase ?? 'nba') === 'nba'
    && Number.isFinite(branchStart)
    && seasonStart > branchStart;
  const knownHistoricalDefault = hasHistoricalBroadcastDefault(seasonStart) && !postHistoricalBranch;
  const historicalProfile = getHistoricalBroadcastProfile(era);
  const popularity = Math.max(0.7, Math.min(1.4, 0.7 + (state.leagueStats.viewership ?? 1.8) / 6));
  const futureInflation = Math.pow(1.025, Math.max(0, seasonStart - era.endSeason));
  const historical: BroadcastOffer = {
    id: `historical-${era.startSeason}`,
    name: knownHistoricalDefault ? 'Historical package' : 'Market baseline package',
    partners: era.partners.length > 0 ? era.partners : ['No national package'],
    partnerIds: era.partnerIds,
    years: knownHistoricalDefault ? era.endSeason - seasonStart + 1 : 7,
    annualValueUSD: era.annualValueUSD,
    ...historicalProfile,
    partnerType: era.partnerIds.length > 1 ? 'mixed' : 'national',
    specialty: knownHistoricalDefault ? 'Historical default' : 'Future market baseline',
    historical: knownHistoricalDefault,
  };
  const historicalIds = new Set(knownHistoricalDefault ? era.partnerIds : []);
  const eraCandidates = era.alternatives.map((name, index) => ({
    id: name.toLowerCase().includes('fox') ? 'fox'
      : name.toLowerCase().includes('nbc') ? 'nbc'
      : name.toLowerCase().includes('abc') ? 'abc'
      : name.toLowerCase().includes('cbs') ? 'cbs'
      : name.toLowerCase().includes('espn') ? 'espn'
      : `era-${index}`,
    name,
    firstSeason: era.startSeason,
    approval: 82,
    type: 'national' as const,
    specialty: 'Era alternative',
  }));
  const candidates = [...eraCandidates, ...BIDDER_CATALOG.filter(bidder => bidder.firstSeason <= seasonStart)]
    .filter(candidate => !historicalIds.has(candidate.id))
    .filter((candidate, index, all) => all.findIndex(other => other.id === candidate.id) === index);
  const generated = candidates.map((partner, index): BroadcastOffer => {
    const unit = seededUnit(`${getSimulationSeed(state)}:${seasonStart}:${partner.name}`);
    const bundle = [partner];
    if (seasonStart >= 1979 && candidates.length > 1) {
      const complement = candidates.find((candidate, candidateIndex) =>
        candidateIndex !== index && candidate.type !== partner.type,
      ) ?? candidates[(index + 1) % candidates.length];
      if (complement && complement.id !== partner.id) bundle.push(complement as typeof partner);
    }
    if (seasonStart >= 2016 && bundle.length < 3) {
      const streaming = candidates.find(candidate =>
        candidate.type === 'streaming' && !bundle.some(existing => existing.id === candidate.id),
      );
      if (streaming) bundle.push(streaming as typeof partner);
    }
    const isStreameast = bundle.some(candidate => candidate.id === 'streameast');
    const isPif = bundle.some(candidate => candidate.id === 'pif');
    const years = seasonStart >= 2016 ? 7 + Math.floor(unit * 6) : 3 + Math.floor(unit * 3);
    const aggression = 0.85 + seededUnit(`${partner.name}:${seasonStart}:aggression`) * 0.35;
    const competitiveBidding = 1 + seededUnit(`${partner.name}:${seasonStart}:competition`) * 0.15;
    const termAdjustment = years >= 7
      ? 0.92 + seededUnit(`${partner.name}:${seasonStart}:term`) * 0.08
      : years <= 3
        ? 1 + seededUnit(`${partner.name}:${seasonStart}:term`) * 0.12
        : 1;
    const marketFloor = era.bidMinUSD * futureInflation * popularity;
    const marketCeiling = era.bidMaxUSD * futureInflation * popularity;
    const eraBaseline = era.annualValueUSD > 0
      ? era.annualValueUSD
      : era.bidMinUSD + (era.bidMaxUSD - era.bidMinUSD) * (0.35 + unit * 0.65);
    const modeledValue = eraBaseline
      * futureInflation
      * popularity
      * aggression
      * competitiveBidding
      * termAdjustment;
    const boundedValue = Math.max(marketFloor, Math.min(marketCeiling, modeledValue));
    const annualValueUSD = isStreameast
      ? 0
      : Math.round(boundedValue * (isPif ? 1.25 : 1));
    return {
      id: `alternate-${seasonStart}-${index}`,
      name: `${bundle.map(candidate => candidate.name).join(' + ')} package`,
      partners: bundle.map(candidate => candidate.name),
      partnerIds: bundle.map(candidate => candidate.id),
      years,
      annualValueUSD,
      reach: isStreameast ? 99 : isPif ? 30 : Math.round(62 + unit * 34),
      production: isStreameast ? 35 : Math.round(58 + seededUnit(`${partner.name}:production`) * 38),
      security: isStreameast ? 8 : Math.round(65 + seededUnit(`${partner.name}:security`) * 31),
      growth: isStreameast ? 96 : Math.round(68 + seededUnit(`${partner.name}:growth`) * 30),
      approval: Math.round(bundle.reduce((sum, candidate) => sum + candidate.approval, 0) / bundle.length),
      partnerType: new Set(bundle.map(candidate => candidate.type)).size > 1 ? 'mixed' : partner.type,
      specialty: bundle.map(candidate => candidate.specialty).filter((value, valueIndex, all) => all.indexOf(value) === valueIndex).join(' / '),
    };
  });
  const ordered = [...generated].sort((left, right) =>
    seededUnit(`${getSimulationSeed(state)}:${seasonStart}:visible:${right.id}`)
    - seededUnit(`${getSimulationSeed(state)}:${seasonStart}:visible:${left.id}`),
  );
  const visible: BroadcastOffer[] = [];
  const append = (offer: BroadcastOffer | undefined) => {
    if (offer && !visible.some(candidate => candidate.id === offer.id)) visible.push(offer);
  };
  ['streameast', 'pif', 'fanduel'].forEach(partnerId => {
    append(ordered.find(offer => offer.partnerIds.includes(partnerId)));
  });
  ordered.forEach(append);
  const offerLimit = knownHistoricalDefault ? 4 : 5;
  return knownHistoricalDefault ? [historical, ...visible.slice(0, offerLimit)] : visible.slice(0, offerLimit);
}

export function mediaRightsFromOffer(state: GameState, offer: BroadcastOffer): MediaRights {
  const seasonStart = getBroadcastAgreementSeasonStart(state);
  const mediaRev = offer.annualValueUSD / 1_000_000_000;
  const prior = state.leagueStats.mediaRights;
  const priorMedia = Math.max(0.001, prior?.mediaRev ?? mediaRev);
  const mediaGrowth = Math.max(0.85, Math.min(1.25, Math.pow(Math.max(0.01, mediaRev / priorMedia), 0.25)));
  const salaryCap = Math.max(
    0,
    (state.leagueStats.salaryCap / 1_000_000) * (offer.historical ? 1 : mediaGrowth),
  );
  const priorNonMediaRevenue = Math.max(0, (prior?.totalRev ?? mediaRev) - (prior?.mediaRev ?? mediaRev));
  return {
    activeBroadcasters: offer.partnerIds,
    lpPrice: prior?.lpPrice ?? 19.99,
    lpPriceMonthly: prior?.lpPriceMonthly ?? prior?.lpPrice ?? 19.99,
    totalRev: mediaRev + priorNonMediaRevenue,
    mediaRev,
    lpRev: prior?.lpRev ?? 0,
    salaryCap,
    phaseAssignments: offer.phaseAssignments ?? prior?.phaseAssignments,
    scheduleAssignments: offer.scheduleAssignments ?? prior?.scheduleAssignments,
    isLocked: true,
    contractStartSeason: seasonStart,
    contractEndSeason: seasonStart + Math.max(1, offer.years) - 1,
    agreementName: offer.name,
    historicalDefault: offer.historical === true,
    reach: offer.reach,
    production: offer.production,
    security: offer.security,
    growth: offer.growth,
    approval: offer.approval,
  };
}
