import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { calculateTeamStrength } from '../../utils/playerRatings';

interface Props {
  onSelectTeam: (teamId: number) => void;
}

export const TrainingFranchisePicker: React.FC<Props> = ({ onSelectTeam }) => {
  const { state } = useGame();
  const teams = state.teams ?? [];
  const players = state.players ?? [];
  const isGM = state.gameMode === 'gm';
  const userTid = isGM ? state.userTeamId ?? null : null;
  const userTeam = userTid != null ? teams.find(t => t.id === userTid) : null;

  const teamData = useMemo(() => {
    return teams.map(team => {
      const roster = players.filter(p => p.tid === team.id && p.status === 'Active');
      const ovr = calculateTeamStrength(team.id, players);
      const planCount = Object.keys((team as any).trainingCalendar ?? {}).length;
      return { team, roster, ovr, planCount };
    });
  }, [teams, players]);

  const east = useMemo(
    () => teamData.filter(d => d.team.conference === 'East').sort((a, b) => b.ovr - a.ovr),
    [teamData],
  );
  const west = useMemo(
    () => teamData.filter(d => d.team.conference === 'West').sort((a, b) => b.ovr - a.ovr),
    [teamData],
  );

  const userData = userTeam ? teamData.find(d => d.team.id === userTeam.id) : null;

  const renderRow = (entry: typeof teamData[number]) => {
    const { team, roster, ovr, planCount } = entry;
    const fullName = team.region && !team.name.includes(team.region) ? `${team.region} ${team.name}` : team.name;
    return (
      <button
        key={team.id}
        onClick={() => onSelectTeam(team.id)}
        className="group relative flex items-center gap-3 px-3 py-3 border-l-2 border-transparent hover:border-l-[#FDB927] hover:bg-slate-900/50 transition-all duration-200 text-left w-full"
      >
        <div className="w-12 h-12 flex items-center justify-center shrink-0 relative">
          {team.logoUrl ? (
            <img
              src={team.logoUrl}
              alt={team.name}
              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center font-black text-[10px] text-slate-500">
              {team.abbrev}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-black uppercase tracking-tight text-white truncate group-hover:text-[#FDB927] transition-colors">
            {fullName}
          </div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest tabular-nums mt-0.5">
            {team.wins}-{team.losses} <span className="text-slate-700 mx-1">·</span> {roster.length}P
            {planCount > 0 && (
              <>
                <span className="text-slate-700 mx-1">·</span>
                <span className="text-[#FDB927]/70">{planCount} plans</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-2xl font-black text-[#FDB927] tabular-nums leading-none">{ovr}</span>
          <span className="text-[7px] font-bold text-slate-600 uppercase tracking-[0.2em] mt-0.5">OVR</span>
        </div>
        <ChevronRight
          size={12}
          className="text-slate-700 group-hover:text-[#FDB927] group-hover:translate-x-0.5 transition-all"
        />
      </button>
    );
  };

  return (
    <div className="bg-black min-h-[calc(100vh-60px-4px)] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-10 pt-8 md:pt-12 pb-12">
        {/* Briefing header — editorial typography, no rounded panels */}
        <div className="mb-10">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FDB927] mb-2">
            Training <span className="text-slate-600">/</span> Briefing
          </div>
          <div className="flex items-end justify-between gap-4 border-b-2 border-[#FDB927]/30 pb-4">
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter text-white leading-[0.9]">
              Pick a Franchise
            </h1>
            <div className="hidden md:flex items-baseline gap-2">
              <span className="text-5xl font-black text-[#FDB927] tabular-nums leading-none">
                {String(teams.length).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Teams</span>
            </div>
          </div>
          <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-widest mt-3">
            Open a team's training calendar, paradigm, and player development queue
          </p>
        </div>

        {/* Spotlight — only in GM mode with a chosen franchise */}
        {userTeam && userData && (
          <div className="mb-10">
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FDB927] mb-2">
              Currently Managing
            </div>
            <button
              onClick={() => onSelectTeam(userTeam.id)}
              className="group relative w-full flex items-center gap-5 p-5 md:p-6 bg-slate-950/80 border-2 border-[#FDB927] overflow-hidden text-left transition-all hover:bg-slate-900/80"
              style={{ boxShadow: '0 0 32px rgba(253, 185, 39, 0.25)' }}
            >
              <div
                className="absolute inset-0 opacity-10 blur-2xl pointer-events-none"
                style={{ backgroundColor: userTeam.colors?.[0] || '#FDB927' }}
              />
              <div className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center shrink-0 relative z-10">
                {userTeam.logoUrl && (
                  <img
                    src={userTeam.logoUrl}
                    alt={userTeam.name}
                    className="w-full h-full object-contain drop-shadow-[0_0_12px_rgba(253,185,39,0.4)] group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <div className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white truncate">
                  {userTeam.region && !userTeam.name.includes(userTeam.region)
                    ? `${userTeam.region} ${userTeam.name}`
                    : userTeam.name}
                </div>
                <div className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{userTeam.wins}-{userTeam.losses}</span>
                  <span className="text-slate-700">·</span>
                  <span>{userData.roster.length} Players</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-[#FDB927]/80">{userData.planCount} Plans Set</span>
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0 relative z-10">
                <span className="text-4xl md:text-6xl font-black text-[#FDB927] tabular-nums leading-none">
                  {userData.ovr}
                </span>
                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mt-1">
                  Team OVR
                </span>
              </div>
            </button>
          </div>
        )}

        {/* Conference split — horizontal rows in two columns */}
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-10">
          {[
            { label: 'Eastern Conference', data: east },
            { label: 'Western Conference', data: west },
          ].map(({ label, data }) =>
            data.length > 0 ? (
              <div key={label}>
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FDB927]">
                    {label}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 tabular-nums">
                    {data.length} Teams
                  </span>
                </div>
                <div className="divide-y divide-slate-800/60">{data.map(renderRow)}</div>
              </div>
            ) : null,
          )}
        </div>

        {/* Fallback: any teams without conference assignment (non-NBA leagues, expansions, etc.) */}
        {(() => {
          const other = teamData.filter(
            d => d.team.conference !== 'East' && d.team.conference !== 'West',
          );
          if (other.length === 0) return null;
          return (
            <div className="mt-10">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FDB927]">
                  Other Teams
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 tabular-nums">
                  {other.length} Teams
                </span>
              </div>
              <div className="divide-y divide-slate-800/60 grid md:grid-cols-2 gap-x-8">
                {other.map(renderRow)}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
