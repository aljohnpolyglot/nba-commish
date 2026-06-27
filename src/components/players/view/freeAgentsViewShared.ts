import { Briefcase, Globe, Trophy } from 'lucide-react';

export const MARKET_POOLS_FULL = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'nba', label: 'NBA Free Agents', icon: Briefcase },
  { id: 'euroleague', label: 'Euroleague', icon: Trophy },
  { id: 'pba', label: 'PBA', icon: Trophy },
  { id: 'bleague', label: 'B-League', icon: Trophy },
  { id: 'gleague', label: 'G-League', icon: Trophy },
  { id: 'endesa', label: 'Endesa', icon: Trophy },
  { id: 'chinacba', label: 'China CBA', icon: Trophy },
  { id: 'nblaustralia', label: 'NBL Australia', icon: Trophy },
] as const;

export const MARKET_POOLS_FICTIONAL = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'nba', label: 'Free Agents', icon: Briefcase },
] as const;

export const MARKET_POOLS_EURO = [{ id: 'all', label: 'All Available', icon: Globe }] as const;
export const MARKET_POOLS_PBA = [{ id: 'all', label: 'PBA Free Agents', icon: Trophy }] as const;
export const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'] as const;
export const NON_NBA_STATUS_LABELS = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'] as const;
export const ON_ROSTER_STATUSES = new Set(['Active', ...NON_NBA_STATUS_LABELS]);

export type MarketPoolId = (typeof MARKET_POOLS_FULL)[number]['id'] | (typeof MARKET_POOLS_FICTIONAL)[number]['id'] | (typeof MARKET_POOLS_PBA)[number]['id'];
export type FreeAgentViewMode = 'available' | 'upcoming';
export type PersonSelectorType = 'contact' | 'bribe' | 'dinner' | 'movie' | 'suspension' | 'waive' | 'sabotage' | 'general';
