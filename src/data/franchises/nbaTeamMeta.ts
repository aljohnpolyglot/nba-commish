/*
 * ====================================================================================
 * NOTE (Native Team Color Palettes & Modded Leagues Support):
 * Individual franchises dynamically use their own native color palette (primaryColor, accentColor)
 * across front-office cards, stadium banners, and management interfaces.
 * To support modded leagues, expansion teams, and custom rosters natively in-game, the simulation
 * engine derives team colors directly from the native `teamId` values/metadata configured in the mod.
 * The colors defined below serve as standard default placeholder palettes for official NBA franchises.
 * ====================================================================================
 * 
 * ====================================================================================
 * NOTE (Dynamic Valuation & Market Variance):
 * Company valuations, sponsor bids, and franchise net worth are NOT flat or static numbers.
 * In the simulation engine, valuations experience dynamic variance influenced by market population tier,
 * regional economic conditions, team winning percentage, playoff success, and multi-year inflation rates.
 * ====================================================================================
 */

export interface TeamMetaInfo {
  conference: 'East' | 'West';
  division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
  nbaCdnCode: string;
  espnCode: string;
  primaryColor: string;
  accentColor: string;
  marketPopulation: string;
  marketTier: 'Tier 1 Mega' | 'Tier 2 Large' | 'Tier 3 Mid' | 'Tier 4 Small';
  estValuation: string;
  city: string;
  marketTag: string;
}

export const NBA_TEAM_META: Record<string, TeamMetaInfo> = {
  ATL: { conference: 'East', division: 'Southeast', nbaCdnCode: 'atl', espnCode: 'atl', primaryColor: '#E03A3E', accentColor: '#C1D32F', marketPopulation: '6.2M Metro', marketTier: 'Tier 2 Large', estValuation: '$3.20B', city: 'Atlanta, GA', marketTag: 'Rapid South Tech & Media Hub' },
  BOS: { conference: 'East', division: 'Atlantic', nbaCdnCode: 'bos', espnCode: 'bos', primaryColor: '#007A33', accentColor: '#BA9653', marketPopulation: '4.9M Metro', marketTier: 'Tier 1 Mega', estValuation: '$5.10B', city: 'Boston, MA', marketTag: '18-Time Championship Dynasty' },
  BRK: { conference: 'East', division: 'Atlantic', nbaCdnCode: 'bkn', espnCode: 'bkn', primaryColor: '#111111', accentColor: '#FFFFFF', marketPopulation: '19.5M NYC', marketTier: 'Tier 1 Mega', estValuation: '$3.98B', city: 'Brooklyn, NYC', marketTag: 'Global Culture & Fashion Capital' },
  CHA: { conference: 'East', division: 'Southeast', nbaCdnCode: 'cha', espnCode: 'cha', primaryColor: '#1D1160', accentColor: '#00788C', marketPopulation: '2.8M Metro', marketTier: 'Tier 3 Mid', estValuation: '$3.00B', city: 'Charlotte, NC', marketTag: 'Piedmont Financial Capital' },
  CHI: { conference: 'East', division: 'Central', nbaCdnCode: 'chi', espnCode: 'chi', primaryColor: '#CE1141', accentColor: '#000000', marketPopulation: '9.5M Metro', marketTier: 'Tier 1 Mega', estValuation: '$4.60B', city: 'Chicago, IL', marketTag: 'Global Brand & Historic Base' },
  CLE: { conference: 'East', division: 'Central', nbaCdnCode: 'cle', espnCode: 'cle', primaryColor: '#860038', accentColor: '#041E42', marketPopulation: '2.1M Metro', marketTier: 'Tier 3 Mid', estValuation: '$2.60B', city: 'Cleveland, OH', marketTag: 'Heartland Passionate Base' },
  DAL: { conference: 'West', division: 'Southwest', nbaCdnCode: 'dal', espnCode: 'dal', primaryColor: '#00538C', accentColor: '#002B5E', marketPopulation: '7.9M Metro', marketTier: 'Tier 1 Mega', estValuation: '$4.50B', city: 'Dallas, TX', marketTag: 'Metroplex High Growth Titan' },
  DEN: { conference: 'West', division: 'Northwest', nbaCdnCode: 'den', espnCode: 'den', primaryColor: '#0E2240', accentColor: '#FEC524', marketPopulation: '3.0M Metro', marketTier: 'Tier 3 Mid', estValuation: '$3.40B', city: 'Denver, CO', marketTag: 'Mile High Championship Base' },
  DET: { conference: 'East', division: 'Central', nbaCdnCode: 'det', espnCode: 'det', primaryColor: '#C8102E', accentColor: '#1D428A', marketPopulation: '4.3M Metro', marketTier: 'Tier 2 Large', estValuation: '$3.00B', city: 'Detroit, MI', marketTag: 'Motor City Basketball Legacy' },
  GSW: { conference: 'West', division: 'Pacific', nbaCdnCode: 'gsw', espnCode: 'gs', primaryColor: '#1D428A', accentColor: '#FFC72C', marketPopulation: '4.7M Bay Area', marketTier: 'Tier 1 Mega', estValuation: '$7.70B', city: 'San Francisco, CA', marketTag: 'Silicon Valley Tech Powerhouse' },
  HOU: { conference: 'West', division: 'Southwest', nbaCdnCode: 'hou', espnCode: 'hou', primaryColor: '#CE1141', accentColor: '#000000', marketPopulation: '7.3M Metro', marketTier: 'Tier 2 Large', estValuation: '$3.80B', city: 'Houston, TX', marketTag: 'Energy & Global Space Capital' },
  IND: { conference: 'East', division: 'Central', nbaCdnCode: 'ind', espnCode: 'ind', primaryColor: '#002D62', accentColor: '#FDBB30', marketPopulation: '2.1M Metro', marketTier: 'Tier 3 Mid', estValuation: '$2.80B', city: 'Indianapolis, IN', marketTag: 'Hoosier Basketball Heartland' },
  LAC: { conference: 'West', division: 'Pacific', nbaCdnCode: 'lac', espnCode: 'lac', primaryColor: '#C8102E', accentColor: '#1D428A', marketPopulation: '12.9M LA', marketTier: 'Tier 1 Mega', estValuation: '$4.65B', city: 'Inglewood, LA', marketTag: 'Intuit Dome Tech Marvel' },
  LAL: { conference: 'West', division: 'Pacific', nbaCdnCode: 'lal', espnCode: 'lal', primaryColor: '#552583', accentColor: '#FDB927', marketPopulation: '12.9M LA', marketTier: 'Tier 1 Mega', estValuation: '$6.40B', city: 'Los Angeles, CA', marketTag: '17-Time Championship Flagship' },
  MEM: { conference: 'West', division: 'Southwest', nbaCdnCode: 'mem', espnCode: 'mem', primaryColor: '#5D76A9', accentColor: '#12173F', marketPopulation: '1.3M Metro', marketTier: 'Tier 4 Small', estValuation: '$2.82B', city: 'Memphis, TN', marketTag: 'Grit & Grind Mid-South Base' },
  MIA: { conference: 'East', division: 'Southeast', nbaCdnCode: 'mia', espnCode: 'mia', primaryColor: '#98002E', accentColor: '#F9A01B', marketPopulation: '6.1M Metro', marketTier: 'Tier 2 Large', estValuation: '$3.90B', city: 'Miami, FL', marketTag: 'Heat Culture & Global Gateway' },
  MIL: { conference: 'East', division: 'Central', nbaCdnCode: 'mil', espnCode: 'mil', primaryColor: '#00471B', accentColor: '#EEE1C6', marketPopulation: '1.6M Metro', marketTier: 'Tier 4 Small', estValuation: '$3.20B', city: 'Milwaukee, WI', marketTag: 'Cream City Championship Base' },
  MIN: { conference: 'West', division: 'Northwest', nbaCdnCode: 'min', espnCode: 'min', primaryColor: '#0C2340', accentColor: '#236192', marketPopulation: '3.7M Metro', marketTier: 'Tier 3 Mid', estValuation: '$2.90B', city: 'Minneapolis, MN', marketTag: 'Twin Cities Rising Force' },
  NOP: { conference: 'West', division: 'Southwest', nbaCdnCode: 'nop', espnCode: 'no', primaryColor: '#0C2340', accentColor: '#C8102E', marketPopulation: '1.2M Metro', marketTier: 'Tier 4 Small', estValuation: '$2.55B', city: 'New Orleans, LA', marketTag: 'Crescent City Culture Base' },
  NYK: { conference: 'East', division: 'Atlantic', nbaCdnCode: 'nyk', espnCode: 'ny', primaryColor: '#006BB6', accentColor: '#F58426', marketPopulation: '19.5M NYC', marketTier: 'Tier 1 Mega', estValuation: '$6.60B', city: 'New York, NY', marketTag: 'Mecca of Basketball / MSG' },
  OKC: { conference: 'West', division: 'Northwest', nbaCdnCode: 'okc', espnCode: 'okc', primaryColor: '#007AC1', accentColor: '#EF3B24', marketPopulation: '1.4M Metro', marketTier: 'Tier 4 Small', estValuation: '$3.05B', city: 'Oklahoma City, OK', marketTag: 'Loud City High-Growth Power' },
  ORL: { conference: 'East', division: 'Southeast', nbaCdnCode: 'orl', espnCode: 'orl', primaryColor: '#0077C0', accentColor: '#C4CED4', marketPopulation: '2.7M Metro', marketTier: 'Tier 3 Mid', estValuation: '$2.95B', city: 'Orlando, FL', marketTag: 'Global Tourism & Theme Hub' },
  PHI: { conference: 'East', division: 'Atlantic', nbaCdnCode: 'phi', espnCode: 'phi', primaryColor: '#006BB6', accentColor: '#ED174C', marketPopulation: '6.2M Metro', marketTier: 'Tier 1 Mega', estValuation: '$4.30B', city: 'Philadelphia, PA', marketTag: 'Historic Seaboard Powerhouse' },
  PHO: { conference: 'West', division: 'Pacific', nbaCdnCode: 'phx', espnCode: 'phx', primaryColor: '#1D1160', accentColor: '#E56020', marketPopulation: '5.0M Metro', marketTier: 'Tier 2 Large', estValuation: '$3.30B', city: 'Phoenix, AZ', marketTag: 'Valley of the Sun Giant' },
  POR: { conference: 'West', division: 'Northwest', nbaCdnCode: 'por', espnCode: 'por', primaryColor: '#E03A3E', accentColor: '#000000', marketPopulation: '2.5M Metro', marketTier: 'Tier 3 Mid', estValuation: '$3.08B', city: 'Portland, OR', marketTag: 'Rip City Pacific Northwest' },
  SAC: { conference: 'West', division: 'Pacific', nbaCdnCode: 'sac', espnCode: 'sac', primaryColor: '#5A2D81', accentColor: '#63727A', marketPopulation: '2.4M Metro', marketTier: 'Tier 3 Mid', estValuation: '$3.33B', city: 'Sacramento, CA', marketTag: 'Light The Beam Tech Arena' },
  SAS: { conference: 'West', division: 'Southwest', nbaCdnCode: 'sas', espnCode: 'sas', primaryColor: '#C4CED4', accentColor: '#000000', marketPopulation: '2.6M Metro', marketTier: 'Tier 3 Mid', estValuation: '$3.25B', city: 'San Antonio, TX', marketTag: '5-Time Champion Legacy' },
  TOR: { conference: 'East', division: 'Atlantic', nbaCdnCode: 'tor', espnCode: 'tor', primaryColor: '#CE1141', accentColor: '#000000', marketPopulation: '6.7M Metro', marketTier: 'Tier 1 Mega', estValuation: '$4.10B', city: 'Toronto, ON', marketTag: 'We The North Mega Market' },
  UTA: { conference: 'West', division: 'Northwest', nbaCdnCode: 'uta', espnCode: 'utah', primaryColor: '#002B5C', accentColor: '#F9A01B', marketPopulation: '1.2M Metro', marketTier: 'Tier 4 Small', estValuation: '$3.09B', city: 'Salt Lake City, UT', marketTag: 'Silicon Slopes Mountain Base' },
  WAS: { conference: 'East', division: 'Southeast', nbaCdnCode: 'was', espnCode: 'wsh', primaryColor: '#002B5C', accentColor: '#E31837', marketPopulation: '6.3M Metro', marketTier: 'Tier 2 Large', estValuation: '$3.10B', city: 'Washington, DC', marketTag: 'Capital Region Power Center' }
};

export const getNBALogoUrl = (teamId: string) => {
  const meta = NBA_TEAM_META[teamId];
  const cdnCode = meta ? meta.nbaCdnCode : teamId.toLowerCase();
  return `https://cdn.nba.com/logos/nba/${cdnCode}/primary/L/logo.svg`;
};
