import stateIncomeTaxRows from '../../data/taxes/stateIncomeTax.json';
import { NBA_TEAM_META } from '../../data/franchises/nbaTeamMeta';
import type { NBATeam, NonNBATeam } from '../../types';

interface StateIncomeTaxRow {
  state: string;
  singleFilerRates: string;
}

interface TaxBracket {
  rate: number;
  threshold: number;
}

export interface TeamStateTaxProfile {
  stateName?: string;
  annualTax: number;
  effectiveRate: number;
  topMarginalRate: number;
  sourceFound: boolean;
}

const STATE_BY_CODE: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', DC: 'Washington, D.C.', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const NBA_META_ALIASES: Record<string, string> = {
  BKN: 'BRK', NJN: 'BRK', PHX: 'PHO', SEA: 'OKC', WSB: 'WAS',
};

const TEAM_STATE_OVERRIDES: Record<string, string> = {
  BRK: 'New York', BKN: 'New York', LAC: 'California', WAS: 'Washington, D.C.',
  SEA: 'Washington', LV: 'Nevada', BUF: 'New York', KC: 'Missouri', SD: 'California',
  PIT: 'Pennsylvania', BAL: 'Maryland', STL: 'Missouri', HAR: 'Connecticut', ANA: 'California',
  CON: 'Connecticut', LVA: 'Nevada', LAS: 'California', NYL: 'New York',
};

const CITY_STATE_FALLBACK: Record<string, string> = {
  seattle: 'Washington', 'las vegas': 'Nevada', buffalo: 'New York', 'kansas city': 'Missouri',
  'san diego': 'California', pittsburgh: 'Pennsylvania', baltimore: 'Maryland',
  'st louis': 'Missouri', hartford: 'Connecticut', anaheim: 'California',
  uncasville: 'Connecticut', brooklyn: 'New York', inglewood: 'California',
};

const bracketsByState = new Map<string, TaxBracket[]>();
for (const row of stateIncomeTaxRows as StateIncomeTaxRow[]) {
  const value = String(row.singleFilerRates ?? '').trim();
  if (!value || /^none$/i.test(value)) {
    if (!bracketsByState.has(row.state)) bracketsByState.set(row.state, []);
    continue;
  }
  const match = value.match(/([\d.]+)%\s*>\s*\$?([\d,]+)/);
  if (!match) continue;
  const bracket = { rate: Number(match[1]) / 100, threshold: Number(match[2].replace(/,/g, '')) };
  const current = bracketsByState.get(row.state) ?? [];
  current.push(bracket);
  bracketsByState.set(row.state, current);
}
for (const brackets of bracketsByState.values()) brackets.sort((left, right) => left.threshold - right.threshold);

function normalizeStateName(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  const code = raw.toUpperCase();
  if (STATE_BY_CODE[code]) return STATE_BY_CODE[code];
  return [...bracketsByState.keys()].find(state => state.toLowerCase() === raw.toLowerCase()) ?? raw;
}

export function resolveTeamStateName(team: NBATeam | NonNBATeam | null | undefined): string | undefined {
  if (!team) return undefined;
  const explicit = normalizeStateName((team as NBATeam & { state?: string }).state);
  if (explicit) return explicit;
  const abbrev = String(team.abbrev ?? '').toUpperCase();
  if (TEAM_STATE_OVERRIDES[abbrev]) return TEAM_STATE_OVERRIDES[abbrev];
  const meta = NBA_TEAM_META[NBA_META_ALIASES[abbrev] ?? abbrev];
  const metaCode = meta?.city.match(/,\s*([A-Z]{2,3})$/)?.[1];
  if (metaCode === 'NYC') return 'New York';
  if (metaCode === 'LA' && abbrev === 'LAC') return 'California';
  const fromMeta = normalizeStateName(metaCode);
  if (fromMeta) return fromMeta;
  const region = String(team.region ?? '').trim();
  const regionState = region.match(/,\s*([A-Za-z ]+)$/)?.[1];
  const fromRegion = normalizeStateName(regionState);
  if (fromRegion) return fromRegion;
  return CITY_STATE_FALLBACK[region.toLowerCase().replace(/\./g, '')];
}

export function getStateIncomeTaxProfile(stateName: string | undefined, annualIncome: number): TeamStateTaxProfile {
  const normalized = normalizeStateName(stateName);
  const brackets = normalized ? bracketsByState.get(normalized) : undefined;
  const income = Math.max(0, Number(annualIncome) || 0);
  if (!brackets) return { stateName: normalized, annualTax: 0, effectiveRate: 0, topMarginalRate: 0, sourceFound: false };
  if (brackets.length === 0 || income <= 0) {
    return { stateName: normalized, annualTax: 0, effectiveRate: 0, topMarginalRate: 0, sourceFound: true };
  }
  const annualTax = brackets.reduce((tax, bracket, index) => {
    if (income <= bracket.threshold) return tax;
    const nextThreshold = brackets[index + 1]?.threshold ?? income;
    const taxable = Math.max(0, Math.min(income, nextThreshold) - bracket.threshold);
    return tax + taxable * bracket.rate;
  }, 0);
  const active = brackets.filter(bracket => income > bracket.threshold);
  return {
    stateName: normalized,
    annualTax,
    effectiveRate: income > 0 ? annualTax / income : 0,
    topMarginalRate: active.at(-1)?.rate ?? 0,
    sourceFound: true,
  };
}

export function getTeamStateIncomeTaxProfile(
  team: NBATeam | NonNBATeam | null | undefined,
  annualIncome: number,
): TeamStateTaxProfile {
  return getStateIncomeTaxProfile(resolveTeamStateName(team), annualIncome);
}
