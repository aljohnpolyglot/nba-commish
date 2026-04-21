import React, { useEffect, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import { useGame } from '../../../../../store/GameContext';
import { PlayerPortrait } from '../../../../shared/PlayerPortrait';

interface GeneralManagerProps {
  teamId: number;
}

const GM_RATINGS_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbagmratings';

let gmRatingsCache: any[] | null = null;

async function fetchGMRatings(): Promise<any[]> {
  if (gmRatingsCache) return gmRatingsCache;
  try {
    const res = await fetch(GM_RATINGS_URL);
    if (!res.ok) return [];
    gmRatingsCache = await res.json();
    return gmRatingsCache!;
  } catch {
    return [];
  }
}

export function GeneralManager({ teamId }: GeneralManagerProps) {
  const { state } = useGame();
  const team = state.teams.find(t => t.id === teamId);
  const staff = state.staff;
  const teamColor = team?.colors?.[0] || '#552583';
  const teamName = team ? `${team.region} ${team.name}` : '';

  const [gmRatings, setGmRatings] = useState<any[]>([]);
  const [loadingRatings, setLoadingRatings] = useState(false);

  // Find GM from staff data
  const gm = staff?.gms.find(g => {
    const teamField = (g.position || g.team || '').toLowerCase();
    return teamField.includes(team?.name.toLowerCase() || '') || teamField.includes((team?.region || '').toLowerCase());
  });

  // Fallback: fetch GM ratings gist if GM not found in staff
  useEffect(() => {
    if (!gm && !gmRatingsCache) {
      setLoadingRatings(true);
      fetchGMRatings().then(data => {
        setGmRatings(data);
        setLoadingRatings(false);
      });
    } else if (gmRatingsCache) {
      setGmRatings(gmRatingsCache);
    }
  }, [gm]);

  if (!team) {
    return <div className="text-red-400 font-bold uppercase tracking-widest">Team not found</div>;
  }

  if (!staff && !loadingRatings) {
    return <div className="text-[#8b949e] font-bold uppercase tracking-widest animate-pulse">Loading Staff Data...</div>;
  }

  // Fallback GM from ratings gist
  let gmName = gm?.name;
  let gmPortrait = gm?.playerPortraitUrl;
  let gmStats: any = null;

  if (!gm && gmRatings.length > 0) {
    // Find GM by matching team name in tenures
    const fallback = gmRatings.find(r =>
      r.tenures?.some((t: any) =>
        t.team?.toLowerCase().includes(team.name.toLowerCase()) &&
        t.span?.toLowerCase().includes('present')
      )
    );
    if (fallback) {
      gmName = fallback.name;
      gmPortrait = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallback.name)}&background=random&size=256`;
      gmStats = fallback;
    }
  }

  // Also try to match in ratings for attributes
  if (!gmStats && gmName && gmRatings.length > 0) {
    gmStats = gmRatings.find(r => r.name?.toLowerCase() === gmName?.toLowerCase());
  }

  // GM mode own-team: user IS the GM. Their name replaces the historical GM's name + portrait.
  const isGM = state.gameMode === 'gm';
  const isOwnTeam = isGM && teamId === state.userTeamId;
  if (isOwnTeam && state.commissionerName) {
    gmName = state.commissionerName;
    gmPortrait = `https://ui-avatars.com/api/?name=${encodeURIComponent(state.commissionerName)}&background=${(teamColor ?? '#1a1a2e').replace('#','')}&color=fff&size=256&bold=true`;
    // Clear historical stats overlay — the user's profile is their own, not the previous GM's.
    gmStats = null;
  }

  if (!gmName) {
    if (loadingRatings) {
      return <div className="text-[#8b949e] font-bold uppercase tracking-widest animate-pulse">Loading GM Data...</div>;
    }
    return <div className="text-red-400 font-bold uppercase tracking-widest">GM not found for {teamName}</div>;
  }

  // Calculate years with team from tenure data
  let yearsWithTeam = 0;
  const currentTenure = gmStats?.tenures?.find((t: any) =>
    t.team?.toLowerCase().includes(team.name.toLowerCase()) &&
    t.span?.toLowerCase().includes('present')
  ) || gmStats?.tenures?.[0];

  if (currentTenure?.span) {
    const startYearMatch = currentTenure.span.match(/(\d{4})/);
    if (startYearMatch) yearsWithTeam = (state.leagueStats?.year || 2026) - parseInt(startYearMatch[1], 10);
  }

  // NOTE FOR MAIN GAME INTEGRATION (scale 50-100, floor 50):
  // Trade Aggression — frequency of trade initiation. [LIVE: AITradeHandler]
  // Scouting Focus  — pick-hoarding vs trading picks for proven young players. [NOT YET WIRED]
  // Work Ethic      — roster-churn appetite. [NOT YET WIRED]
  // Spending        — FA overpay vs value-hunting. [NOT YET WIRED]
  const attributes = gmStats?.attributes || {
    trade_aggression: 65,
    scouting_focus: 60,
    work_ethic: 55,
    spending: 60,
  };

  const attributeTooltips = {
    trade_aggression: 'How often this GM initiates trades.',
    scouting_focus: 'Preference for hoarding draft picks versus trading them for proven young players.',
    work_ethic: 'Appetite for constant roster churn versus keeping the same group together.',
    spending: 'Sets the opening offer in free agency — high-spending GMs start above market; value hunters start lean.',
  };

  return (
    <div className="h-full flex flex-col relative z-10">
      <div
        className="rounded-t-lg p-4 sm:p-8 flex flex-col md:flex-row items-center justify-between border border-[#30363d] border-b-0 relative overflow-hidden gap-6 md:gap-0"
        style={{ backgroundColor: teamColor }}
      >
        <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-black/80 via-black/50 to-transparent z-0" />
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-4 sm:gap-8 text-center sm:text-left">
          <div className="w-24 h-24 sm:w-32 sm:h-32 bg-[#161b22]/80 backdrop-blur-md rounded-full border-4 border-[#FDB927]/50 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] p-1 overflow-hidden shrink-0">
            <PlayerPortrait
              playerName={gmName}
              imgUrl={gmPortrait}
              size={120}
            />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black text-white drop-shadow-md uppercase tracking-tight">{gmName}</h1>
            <div className="text-[#FDB927] font-bold uppercase tracking-widest mt-1 text-sm sm:text-base">General Manager</div>
          </div>
        </div>

        <div className="relative z-10 flex gap-6 sm:gap-16 text-center w-full md:w-auto justify-center">
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Years w/ Team</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{yearsWithTeam}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Record</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{team.wins}-{team.losses}</div>
          </div>
          <div>
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/70 mb-2 border-b border-white/20 pb-1">Trades</div>
            <div className="text-xl sm:text-3xl font-light text-white drop-shadow-md">{gmStats?.stats?.trades || 0}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex border border-[#30363d] rounded-b-lg overflow-hidden bg-[#161b22]/80 backdrop-blur-md p-4 sm:p-8">
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
          <h2 className="text-xl font-black uppercase tracking-widest text-[#e6edf3] border-b border-[#30363d] pb-4">GM Attributes</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <AttributeBar label="Trade Aggression" value={attributes.trade_aggression} tooltip={attributeTooltips.trade_aggression} />
            <AttributeBar label="Scouting Focus" value={attributes.scouting_focus} tooltip={attributeTooltips.scouting_focus} />
            <AttributeBar label="Work Ethic" value={attributes.work_ethic} tooltip={attributeTooltips.work_ethic} />
            <AttributeBar label="Spending" value={attributes.spending} tooltip={attributeTooltips.spending} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AttributeBar({ label, value, tooltip }: { label: string; value: number; tooltip?: string }) {
  const getColor = (val: number) => {
    if (val >= 90) return 'bg-emerald-500';
    if (val >= 80) return 'bg-[#FDB927]';
    if (val >= 70) return 'bg-[#e6edf3]';
    return 'bg-[#8b949e]';
  };

  return (
    <div className="flex flex-col gap-2 group relative cursor-help">
      <div className="flex justify-between items-end">
        <span className="text-xs font-bold uppercase tracking-widest text-[#8b949e]">{label}</span>
        <span className="text-lg font-black text-[#e6edf3]">{value}</span>
      </div>
      <div className="h-2 bg-[#2c2c2e] rounded overflow-hidden">
        <div
          className={cn("h-full transition-all duration-1000", getColor(value))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {tooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-64 bg-[#0d1117] border border-[#30363d] rounded p-2 z-50 shadow-2xl text-[10px] text-white text-center leading-snug">
          {tooltip}
        </div>
      )}
    </div>
  );
}
