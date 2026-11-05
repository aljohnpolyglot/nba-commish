import React, { useState } from 'react';

export interface NbaTeamBranding {
  abbrev: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
}

export const NBA_TEAMS_BRANDING: Record<string, NbaTeamBranding> = {};

export function configureFantasyDraftBranding(teams: NbaTeamBranding[]): void {
  for (const key of Object.keys(NBA_TEAMS_BRANDING)) delete NBA_TEAMS_BRANDING[key];
  for (const team of teams) NBA_TEAMS_BRANDING[team.abbrev.toUpperCase()] = team;
}

export function getTeamBranding(abbrev?: string): NbaTeamBranding {
  const clean = String(abbrev ?? '').toUpperCase().trim();
  return NBA_TEAMS_BRANDING[clean] ?? {
    abbrev: clean || 'TEAM',
    name: clean || 'Team',
    primaryColor: '#1e293b',
    secondaryColor: '#334155',
    accentColor: '#f59e0b',
    logoUrl: '',
  };
}

export const TeamLogo: React.FC<{
  abbrev?: string;
  className?: string;
  sizeClass?: string;
  alt?: string;
}> = ({ abbrev, className = '', sizeClass = 'w-6 h-6', alt }) => {
  const [failed, setFailed] = useState(false);
  const branding = getTeamBranding(abbrev);
  if (branding.logoUrl && !failed) {
    return (
      <img
        src={branding.logoUrl}
        alt={alt || branding.name}
        className={`${sizeClass} object-contain shrink-0 ${className}`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded flex items-center justify-center font-black text-[10px] text-white shrink-0 ${className}`}
      style={{ backgroundColor: branding.primaryColor }}
      aria-label={alt || branding.name}
    >
      {branding.abbrev.slice(0, 3)}
    </div>
  );
};

export const FantasyTeamLogo: React.FC<{
  abbrev?: string;
  className?: string;
  sizeClass?: string;
  alt?: string;
}> = ({ abbrev, className, sizeClass, alt }) => (
  <TeamLogo abbrev={abbrev} className={className} sizeClass={sizeClass} alt={alt} />
);
