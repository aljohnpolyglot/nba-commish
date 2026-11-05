import type { BroadcastOffer, GameState, MediaRights } from '../types';
import { getSimulationSeed } from '../services/saveIdentity';

export const PBA_BROADCASTER_NAMES: Record<string, string> = {
  'pba-league-feed': 'PBA League Feed',
  'pba-vintage': 'Vintage Sports',
  'pba-viva': 'Viva TV',
  'pba-nbn-ibc': 'NBN / IBC',
  'pba-abc': 'ABC 5',
  'pba-solar': 'Solar TV',
  'pba-aktv': 'AKTV',
  'pba-tv5': 'TV5',
  'pba-sports5': 'Sports5',
  'pba-espn5': 'ESPN5',
  'pba-one-sports': 'One Sports',
  'pba-rush': 'PBA Rush',
  'pba-a2z': 'A2Z',
  rptv: 'RPTV',
};

export const PBA_BROADCASTER_LOGOS: Record<string, string> = {
  'pba-vintage': 'https://static.wikia.nocookie.net/logopedia/images/7/72/Pba_99_title_card_by_Vintage_Sports.png/revision/latest?cb=20161110135622',
  'pba-viva': 'https://static.wikia.nocookie.net/logopedia/images/2/26/PBA_on_VIVA_TV_logo.png/revision/latest?cb=20161113092404',
  'pba-nbn-ibc': 'https://static.wikia.nocookie.net/logopedia/images/d/d4/PBAonNBN-IBC.png/revision/latest?cb=20171130052030',
  'pba-abc': 'https://static.wikia.nocookie.net/logopedia/images/3/3c/PBA_on_ABC_2004.PNG/revision/latest?cb=20160427084349',
  'pba-solar': 'https://static.wikia.nocookie.net/logopedia/images/0/06/PBA_on_Solar_TV.PNG/revision/latest?cb=20160427090744',
  'pba-aktv': 'https://static.wikia.nocookie.net/logopedia/images/0/09/PBA_on_AKTV.PNG/revision/latest?cb=20160427093308',
  'pba-tv5': 'https://static.wikia.nocookie.net/logopedia/images/e/ec/PBA_on_TV5_2014.PNG/revision/latest?cb=20160427083651',
  'pba-sports5': 'https://static.wikia.nocookie.net/logopedia/images/f/ff/PBA_on_Sports5_Logo_2017.png/revision/latest?cb=20170819114810',
  'pba-espn5': 'https://static.wikia.nocookie.net/logopedia/images/8/83/PBA_on_ESPN_5_%282019%29.png/revision/latest?cb=20200123150454',
  'pba-one-sports': 'https://static.wikia.nocookie.net/logopedia/images/e/ec/PBA_on_One_Sports.png/revision/latest?cb=20200309003208',
  'pba-rush': 'https://static.wikia.nocookie.net/logopedia/images/c/cd/PBA_Rush_logo.png/revision/latest?cb=20161115101642',
  'pba-a2z': 'https://static.wikia.nocookie.net/logopedia/images/e/e8/PBA_on_A2Z_%282023%29.svg/revision/latest?cb=20231118032036',
  rptv: 'https://static.wikia.nocookie.net/logopedia/images/5/5b/RPTV_%282024%29.svg/revision/latest?cb=20240228040232',
};

interface PbaBroadcastEra {
  startSeason: number;
  endSeason: number;
  partnerIds: string[];
}

const ERAS: PbaBroadcastEra[] = [
  { startSeason: 1975, endSeason: 1981, partnerIds: ['pba-league-feed'] },
  { startSeason: 1982, endSeason: 1999, partnerIds: ['pba-vintage'] },
  { startSeason: 2000, endSeason: 2002, partnerIds: ['pba-viva'] },
  { startSeason: 2003, endSeason: 2003, partnerIds: ['pba-nbn-ibc'] },
  { startSeason: 2004, endSeason: 2007, partnerIds: ['pba-abc'] },
  { startSeason: 2008, endSeason: 2010, partnerIds: ['pba-solar'] },
  { startSeason: 2011, endSeason: 2012, partnerIds: ['pba-aktv'] },
  { startSeason: 2013, endSeason: 2015, partnerIds: ['pba-tv5'] },
  { startSeason: 2016, endSeason: 2016, partnerIds: ['pba-sports5', 'pba-rush'] },
  { startSeason: 2017, endSeason: 2019, partnerIds: ['pba-espn5', 'pba-rush'] },
  { startSeason: 2020, endSeason: 2022, partnerIds: ['pba-one-sports', 'pba-rush'] },
  { startSeason: 2023, endSeason: 2023, partnerIds: ['pba-one-sports', 'pba-rush', 'pba-a2z'] },
  { startSeason: 2024, endSeason: 2024, partnerIds: ['pba-one-sports', 'pba-rush', 'pba-a2z', 'rptv'] },
  { startSeason: 2025, endSeason: 9999, partnerIds: ['pba-one-sports', 'pba-rush', 'rptv'] },
];

const FIRST_SEASON: Record<string, number> = {
  'pba-vintage': 1982,
  'pba-viva': 2000,
  'pba-nbn-ibc': 2003,
  'pba-abc': 2004,
  'pba-solar': 2008,
  'pba-aktv': 2011,
  'pba-tv5': 2013,
  'pba-sports5': 2016,
  'pba-rush': 2016,
  'pba-espn5': 2017,
  'pba-one-sports': 2020,
  'pba-a2z': 2023,
  rptv: 2024,
};

const seededUnit = (seed: string): number => {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4_294_967_295;
};

const eraForSeason = (season: number): PbaBroadcastEra =>
  ERAS.find(era => season >= era.startSeason && season <= era.endSeason) ?? ERAS[ERAS.length - 1];

const partnerNames = (ids: string[]) => ids.map(id => PBA_BROADCASTER_NAMES[id] ?? id);

const baseAnnualValue = (season: number): number =>
  Math.round(5_500_000 * Math.pow(1.035, season - 2025));

const phaseAssignments = (ids: string[]): Record<string, string[]> => {
  const assign = (index: number) => [ids[index % ids.length] ?? 'pba-league-feed'];
  return {
    preseason: assign(0),
    openingweek: assign(0),
    regularseason: assign(0),
    christmasdaygames: assign(1),
    nbacupinseason: assign(2),
    allstarweekend: assign(1),
    playintournament: assign(1),
    playoffsround1: assign(0),
    playoffsround2: assign(1),
    conferencefinals: assign(0),
    nbafinals: assign(0),
    nbadraft: assign(0),
    nbadraftlottery: assign(0),
    digitalrights: assign(ids.length - 1),
  };
};

export function resolvePbaBroadcastPartnerLogoUrl(id: string): string | null {
  return PBA_BROADCASTER_LOGOS[id] ?? null;
}

export function buildPbaBroadcastOffers(state: GameState, season: number): BroadcastOffer[] {
  const knownThrough = Math.max(1975, Number(
    state.historicalPba?.sourceSeason
      ?? state.pbaSeasonKey
      ?? state.pbaStartYear
      ?? season,
  ));
  const sourceSeason = Math.min(season, knownThrough);
  const baselineIds = eraForSeason(sourceSeason).partnerIds;
  const marketValue = baseAnnualValue(season);
  const baseline: BroadcastOffer = {
    id: `pba-era-${sourceSeason}`,
    name: `${partnerNames(baselineIds).join(' + ')} Package`,
    partners: partnerNames(baselineIds),
    partnerIds: baselineIds,
    years: 3,
    annualValueUSD: marketValue,
    reach: 84,
    production: 82,
    security: 89,
    growth: 78,
    approval: 87,
    partnerType: baselineIds.length > 1 ? 'mixed' : 'national',
    specialty: 'Era baseline',
    phaseAssignments: phaseAssignments(baselineIds),
  };
  const eligible = Object.keys(FIRST_SEASON)
    .filter(id => FIRST_SEASON[id] <= knownThrough)
    .filter(id => !baselineIds.includes(id));
  if (eligible.length === 0) return [baseline];

  const offers = Array.from({ length: Math.min(4, eligible.length) }, (_, index): BroadcastOffer => {
    const start = Math.floor(seededUnit(`${getSimulationSeed(state)}:${season}:${index}`) * eligible.length);
    const bundleSize = sourceSeason >= 2016 ? 2 + (index % 2) : 1;
    const partnerIds = Array.from({ length: bundleSize }, (_, offset) => eligible[(start + offset) % eligible.length])
      .filter((id, idIndex, rows) => rows.indexOf(id) === idIndex);
    const unit = seededUnit(`${getSimulationSeed(state)}:${season}:${partnerIds.join('|')}`);
    const years = 2 + Math.floor(unit * 4);
    const annualValueUSD = Math.round(marketValue * (0.82 + unit * 0.42));
    return {
      id: `pba-alternate-${season}-${index}`,
      name: `${partnerNames(partnerIds).join(' + ')} Package`,
      partners: partnerNames(partnerIds),
      partnerIds,
      years,
      annualValueUSD,
      reach: Math.round(68 + unit * 28),
      production: Math.round(65 + seededUnit(`${partnerIds[0]}:production`) * 30),
      security: Math.round(72 + seededUnit(`${partnerIds[0]}:security`) * 24),
      growth: Math.round(66 + seededUnit(`${partnerIds[0]}:growth`) * 31),
      approval: Math.round(70 + seededUnit(`${partnerIds[0]}:approval`) * 26),
      partnerType: partnerIds.length > 1 ? 'mixed' : 'national',
      specialty: index % 2 === 0 ? 'Audience reach' : 'Digital growth',
      phaseAssignments: phaseAssignments(partnerIds),
    };
  });
  return [baseline, ...offers];
}

export function buildPbaMediaRights(season: number, salaryCapUSD: number): MediaRights {
  const ids = eraForSeason(season).partnerIds;
  const mediaRev = baseAnnualValue(season) / 1_000_000_000;
  return {
    activeBroadcasters: ids,
    lpPrice: 4.99,
    lpPriceMonthly: 4.99,
    totalRev: mediaRev + 0.05,
    mediaRev,
    lpRev: 0,
    salaryCap: salaryCapUSD / 1_000_000,
    phaseAssignments: phaseAssignments(ids),
    scheduleAssignments: Object.fromEntries(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map((day, index) => [day, [ids[index % ids.length] ?? 'pba-league-feed']]),
    ),
    isLocked: false,
    contractStartSeason: season,
    contractEndSeason: season + 2,
    agreementName: `${partnerNames(ids).join(' + ')} Package`,
    historicalDefault: false,
    reach: 84,
    production: 82,
    security: 89,
    growth: 78,
    approval: 87,
  };
}
