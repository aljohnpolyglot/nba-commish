import React, { useState, useEffect } from 'react';
import { DraftSlot, getResolvedOvr } from '../types';
import { Shield, User, ChevronLeft, ChevronRight, Play, XOctagon, Trash2, SkipForward } from 'lucide-react';
import { TeamLogo, FantasyTeamLogo } from '../lib/nbaBranding';
import { FantasyTeam } from '../lib/wheelDraft';


interface DraftRosterProps {
  fantasyTeams: FantasyTeam[];
  isBudgetMode?: boolean;
  isDraftComplete?: boolean;
  onSimRound?: () => void;
  onSimToEnd: () => void;
  onEndDraft?: () => void;
  onRemovePlayer?: (playerId: string) => void;
  rosterSize: number;
}

function SidebarPlayerHeadshot({ src, name, sizeClass = 'w-7 h-7' }: { src?: string; name: string; sizeClass?: string }) {
  const [hasError, setHasError] = useState(false);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizeClass} rounded-lg object-cover border border-slate-700/80 bg-slate-800 shrink-0 shadow-sm`}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-400 font-bold text-[9px] font-mono shrink-0`}>
      {name ? name.slice(0, 2).toUpperCase() : <User className="w-3.5 h-3.5 text-slate-500" />}
    </div>
  );
}

export const DraftRoster: React.FC<DraftRosterProps> = ({ 
  fantasyTeams, 
  isBudgetMode,
  isDraftComplete,
  onSimRound,
  onSimToEnd,
  onEndDraft,
  onRemovePlayer,
  rosterSize,
}) => {
  const [viewedTeamId, setViewedTeamId] = useState<number>(() => {
    const userTeam = fantasyTeams.find(t => t.isUser);
    return userTeam ? userTeam.id : fantasyTeams[0]?.id || 0;
  });

  useEffect(() => {
    if (!fantasyTeams.some(t => t.id === viewedTeamId)) {
      const userTeam = fantasyTeams.find(t => t.isUser);
      setViewedTeamId(userTeam ? userTeam.id : fantasyTeams[0]?.id || 0);
    }
  }, [fantasyTeams, viewedTeamId]);

  if (!fantasyTeams || fantasyTeams.length === 0) return null;

  const currentIndex = fantasyTeams.findIndex(t => t.id === viewedTeamId);
  const currentTeam = currentIndex >= 0 ? fantasyTeams[currentIndex] : fantasyTeams[0];
  const canRemove = Boolean(isBudgetMode && !isDraftComplete && currentTeam.isUser && onRemovePlayer);
  const userTeam = fantasyTeams.find(t => t.isUser);
  
  const handlePrev = () => {
    const nextIndex = currentIndex === 0 ? fantasyTeams.length - 1 : currentIndex - 1;
    setViewedTeamId(fantasyTeams[nextIndex].id);
  };

  const handleNext = () => {
    const nextIndex = currentIndex === fantasyTeams.length - 1 ? 0 : currentIndex + 1;
    setViewedTeamId(fantasyTeams[nextIndex].id);
  };

  const goToUserTeam = () => {
    if (userTeam) setViewedTeamId(userTeam.id);
  };

  const slots = currentTeam.slots;
  const starters = slots.slice(0, 5);
  const bench = slots.slice(5, 10);
  const deepBench = slots.slice(10);

  const displayCount = currentTeam.players.length;

  const pickText = `${currentTeam.players.length}/${rosterSize} PLAYERS`;

  return (
    <div className="w-full lg:w-80 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-2xl backdrop-blur-md">
      <div>
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h3 className="font-black text-sm uppercase text-white tracking-wider">
              {pickText}
            </h3>
          </div>
          <div className="flex items-center gap-1">
             <button 
              onClick={handlePrev}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleNext}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* TEAM BROWSER HEADER */}
        <div className="mb-4 text-center">
          <div 
            className="flex flex-col items-center gap-1 cursor-pointer group"
            onClick={goToUserTeam}
          >
            <div className="relative">
              <FantasyTeamLogo abbrev={currentTeam.abbrev} sizeClass="w-10 h-10 mb-1" />
            </div>
            <h4 className="text-[11px] font-black text-white uppercase tracking-widest group-hover:text-amber-400 transition-colors">
              {currentTeam.name}
            </h4>
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
              currentTeam.isUser ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700/50'
            }`}>
              {currentTeam.isUser ? 'USER FRANCHISE' : 'AI FRANCHISE'}
            </span>
          </div>
        </div>

        {/* STARTERS SECTION */}
        <div className="mb-3">
          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-1.5">
            STARTING FIVE
          </span>
          <div className="space-y-1">
            {starters.map((slot) => {
              const isDrafted = slot.player !== null;

              return (
                <div
                  key={slot.id}
                  className={`group p-1.5 px-2 rounded-xl border flex items-center justify-between transition-all ${
                    isDrafted
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-amber-400 font-mono shrink-0">
                      {slot.slotPosition}
                    </span>
                    {isDrafted ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <SidebarPlayerHeadshot src={slot.player!.headshotUrl} name={slot.player!.name} sizeClass="w-7 h-7" />
                          <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5 border border-slate-700 shadow">
                            <TeamLogo abbrev={slot.player!.teamAbbrev} sizeClass="w-3 h-3" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-white uppercase leading-none truncate">
                            {slot.player!.name}
                          </h4>
                          <span className="text-[9px] text-slate-400 font-medium">
                            {slot.player!.teamAbbrev} • {slot.player!.displayPos || slot.player!.position}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Unfilled</span>
                    )}
                  </div>

                  {isDrafted && (
                    <div className="text-right shrink-0 ml-1 flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-black text-amber-400 font-mono leading-none">
                          {getResolvedOvr(slot.player!)}
                        </span>
                        <span className="block text-[8px] text-slate-500 font-bold mt-0.5">OVR</span>
                      </div>
                      {canRemove && (
                        <button
                          onClick={() => onRemovePlayer!(slot.player!.id)}
                          className="md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md shrink-0"
                          title={`Remove ${slot.player!.name}`}
                          aria-label={`Remove ${slot.player!.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* BENCH ROTATION SECTION */}
        <div className="mb-3">
          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-1.5">
            BENCH ROTATION
          </span>
          <div className="space-y-1">
            {bench.map((slot, idx) => {
              const isDrafted = slot.player !== null;

              return (
                <div
                  key={slot.id}
                  className={`group p-1.5 px-2 rounded-xl border flex items-center justify-between transition-all ${
                    isDrafted
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-400 shrink-0">
                      {slot.slotPosition}
                    </span>
                    {isDrafted ? (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <SidebarPlayerHeadshot src={slot.player!.headshotUrl} name={slot.player!.name} sizeClass="w-6 h-6" />
                          <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5 border border-slate-700 shadow">
                            <TeamLogo abbrev={slot.player!.teamAbbrev} sizeClass="w-2.5 h-2.5" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[11px] font-bold text-slate-200 leading-tight truncate">
                            {slot.player!.name}
                          </h4>
                          <span className="text-[9px] text-slate-400 font-medium">
                            {slot.player!.teamAbbrev} • {slot.player!.displayPos || slot.player!.position}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">Empty</span>
                    )}
                  </div>

                  {isDrafted && (
                    <div className="text-right shrink-0 ml-1 flex items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        {getResolvedOvr(slot.player!)}
                      </span>
                      {canRemove && (
                        <button
                          onClick={() => onRemovePlayer!(slot.player!.id)}
                          className="md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md shrink-0"
                          title={`Remove ${slot.player!.name}`}
                          aria-label={`Remove ${slot.player!.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* DEEP BENCH SECTION */}
        <div className="mb-4">
          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-1.5">
            DEEP BENCH
          </span>
          <div className="space-y-1">
            {deepBench.map((slot, idx) => {
              const isDrafted = slot.player !== null;

              return (
                <div
                  key={slot.id}
                  className={`group p-1.5 px-2 rounded-xl border flex items-center justify-between transition-all ${
                    isDrafted
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-slate-950/40 border-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded bg-slate-800/60 flex items-center justify-center text-[9px] font-bold text-slate-500 shrink-0">
                      {slot.slotPosition}
                    </span>
                    {isDrafted ? (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <SidebarPlayerHeadshot src={slot.player!.headshotUrl} name={slot.player!.name} sizeClass="w-6 h-6" />
                          <div className="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-0.5 border border-slate-700 shadow">
                            <TeamLogo abbrev={slot.player!.teamAbbrev} sizeClass="w-2.5 h-2.5" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[11px] font-bold text-slate-300 leading-tight truncate">
                            {slot.player!.name}
                          </h4>
                          <span className="text-[9px] text-slate-400 font-medium">
                            {slot.player!.teamAbbrev} • {slot.player!.displayPos || slot.player!.position}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">Empty</span>
                    )}
                  </div>

                  {isDrafted && (
                    <div className="text-right shrink-0 ml-1 flex items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-400 font-mono">
                        {getResolvedOvr(slot.player!)}
                      </span>
                      {canRemove && (
                        <button
                          onClick={() => onRemovePlayer!(slot.player!.id)}
                          className="md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md shrink-0"
                          title={`Remove ${slot.player!.name}`}
                          aria-label={`Remove ${slot.player!.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="mt-auto space-y-3 pt-4 border-t border-slate-800">
        {!isDraftComplete && (
          <div className="flex gap-2">
            {isBudgetMode ? (
              <>
                <button
                  onClick={onSimToEnd}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black uppercase transition-all active:scale-95 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-slate-950" /> SIM TO END
                </button>
                {onEndDraft && (
                  <button
                    onClick={onEndDraft}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/50 hover:text-rose-400 border border-slate-700 text-slate-400 text-[10px] font-black uppercase transition-all active:scale-95 cursor-pointer"
                  >
                    <XOctagon className="w-3 h-3" /> END DRAFT
                  </button>
                )}
              </>
            ) : (
              <>
                {onSimRound && (
                  <button
                    onClick={onSimRound}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-black uppercase transition-all active:scale-95 cursor-pointer"
                  >
                    <SkipForward className="w-3 h-3 text-amber-400" /> SIM ROUND
                  </button>
                )}
                <button
                  onClick={onSimToEnd}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black uppercase transition-all active:scale-95 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-slate-950" /> SIM TO END
                </button>
              </>
            )}
          </div>
        )}
        
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-300"
            style={{ width: `${(currentTeam.players.length / rosterSize) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
