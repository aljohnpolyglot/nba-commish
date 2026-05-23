import React from 'react';
import { Building2, Eye, Maximize2, Tag, Ticket } from 'lucide-react';

export type ArenaTab = 'identity' | 'court' | 'overview' | 'sponsorship' | 'ticketing';

export const ARENA_TABS: Array<{ id: ArenaTab; label: string; icon: React.ReactNode }> = [
  { id: 'identity', label: 'Arena Identity', icon: <Building2 size={16} /> },
  { id: 'court', label: 'Court & Logo', icon: <Maximize2 size={16} /> },
  { id: 'overview', label: 'Arena Overview', icon: <Eye size={16} /> },
  { id: 'sponsorship', label: 'Sponsorship Portfolio', icon: <Tag size={16} /> },
  { id: 'ticketing', label: 'Ticket Pricing', icon: <Ticket size={16} /> },
];

export const NBA_ARENA_CAPACITIES: Record<string, number> = {
  'United Center': 20_917,
  'Madison Square Garden': 19_812,
  'Little Caesars Arena': 20_332,
  'Wells Fargo Center': 20_478,
  'Toyota Center': 18_055,
  'Capital One Arena': 20_356,
  'Rocket Mortgage FieldHouse': 19_432,
  'TD Garden': 19_156,
  'Barclays Center': 17_732,
  'Spectrum Center': 19_077,
  'American Airlines Center': 19_200,
  'Ball Arena': 19_520,
  'Chase Center': 18_064,
  'Gainbridge Fieldhouse': 17_923,
  'Intuit Dome': 18_000,
  'Crypto.com Arena': 18_997,
  'FedExForum': 17_794,
  'Kaseya Center': 19_600,
  'Fiserv Forum': 17_341,
  'Target Center': 18_798,
  'Smoothie King Center': 16_867,
  'Paycom Center': 18_203,
  'Kia Center': 18_846,
  'Footprint Center': 18_055,
  'Moda Center': 19_393,
  'Golden 1 Center': 17_608,
  'Frost Bank Center': 18_581,
  'Scotiabank Arena': 19_800,
  'Delta Center': 18_306,
  'State Farm Arena': 18_048,
};
