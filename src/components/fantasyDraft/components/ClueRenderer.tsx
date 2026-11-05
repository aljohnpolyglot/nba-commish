import React from 'react';
import { ClueItem } from '../types';
import { TeamLogo, getTeamBranding, NBA_TEAMS_BRANDING } from '../lib/nbaBranding';
import { CountryFlag } from '../../shared/CountryFlag';

interface ClueRendererProps {
  clue: ClueItem;
}

export const ClueRenderer: React.FC<ClueRendererProps> = ({ clue }) => {
  // 1. NATIONALITY / ORIGIN
  if (clue.type === 'NATIONALITY') {
    // Extract country from string like "Sombor, Serbia"
    const parts = clue.value.split(',').map(s => s.trim());
    const countryStr = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return (
      <span className="font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[145px] text-right flex items-center justify-end gap-1.5">
        <CountryFlag country={countryStr} />
        <span className="truncate">{clue.value}</span>
      </span>
    );
  }

  // 2. DRAFT PICK
  if (clue.type === 'DRAFT_PICK') {
    let displayPick = clue.value;
    if (clue.value.includes('Pick #')) {
      const match = clue.value.match(/Pick #\d+/);
      if (match) displayPick = match[0];
    }
    
    return (
      <span className="font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[145px] text-right block">
        {displayPick}
      </span>
    );
  }

  // 2.5 JERSEY NUMBER
  if (clue.type === 'JERSEY_NUMBER') {
    return (
      <span className="font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[145px] text-right block">
        {clue.value}
      </span>
    );
  }

  // 3. TEAM
  if (clue.type === 'TEAM' || clue.type === 'DRAFT_TEAM' || clue.type === 'FORMER_TEAM') {
    let branding = getTeamBranding(clue.value);
    
    // If it fallback-ed, maybe clue.value is the full name instead of abbrev
    if (!NBA_TEAMS_BRANDING[clue.value.toUpperCase()]) {
      const found = Object.values(NBA_TEAMS_BRANDING).find(t => t.name.toLowerCase() === clue.value.toLowerCase());
      if (found) branding = found;
    }
    
    if (!NBA_TEAMS_BRANDING[clue.value.toUpperCase()] && branding.abbrev === (clue.value.toUpperCase() || 'TEAM')) {
        const foundPartial = Object.values(NBA_TEAMS_BRANDING).find(t => t.name.toLowerCase().includes(clue.value.toLowerCase()));
        if (foundPartial) branding = foundPartial;
    }

    return (
      <span className="bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center justify-center">
        <TeamLogo abbrev={branding.abbrev} sizeClass="w-4 h-4" />
      </span>
    );
  }

  // DEFAULT
  return (
    <span
      title={clue.value}
      className="font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-[11px] truncate max-w-[145px] text-right block"
    >
      {clue.value}
    </span>
  );
};
