import React, { useMemo } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, ChevronRight, Clock, Edit3, FastForward, Play } from 'lucide-react';
import type { Allocations, ScheduleDay, TrainingParadigm } from '../../TeamTraining/types';
import type { Game, NBATeam, GameState } from '../../types';
import { TrainingActivityIcon } from './TrainingActivityIcon';

type DailyPlan = { intensity: number; paradigm: TrainingParadigm; allocations: Allocations; auto?: boolean };

interface Props {
  team: NBATeam;
  date: string;
  scheduleDay: ScheduleDay | undefined;
  userPlan: DailyPlan | undefined;
  gamesForDate: Game[];
  state: GameState;
  isReadOnly: boolean;
  onBack: () => void;
  onSimulateDay: () => void;
  onSimulateToDate: (date: string) => void;
  onEditPlan: () => void;
}

const PARADIGM_LABEL: Record<TrainingParadigm, string> = {
  Balanced:   'Balanced',
  Offensive:  'Offensive Heavy',
  Defensive:  'Defensive Grind',
  Biometrics: 'Biometrics Focus',
  Recovery:   'Load Management',
};

function formatDateLong(iso: string): string {
  const norm = (iso ?? '').slice(0, 10);
  if (!norm) return '';
  const d = new Date(`${norm}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export const TrainingDayView: React.FC<Props> = ({
  team,
  date,
  scheduleDay,
  userPlan,
  gamesForDate,
  state,
  isReadOnly,
  onBack,
  onSimulateDay,
  onSimulateToDate,
  onEditPlan,
}) => {
  const norm = (date ?? '').slice(0, 10);
  const teamGame = useMemo(
    () => gamesForDate.find(g => g.homeTid === team.id || g.awayTid === team.id),
    [gamesForDate, team.id],
  );
  const otherGames = useMemo(
    () => gamesForDate.filter(g => g !== teamGame).slice(0, 12),
    [gamesForDate, teamGame],
  );

  const teamLookup = useMemo(() => {
    const m = new Map<number, NBATeam>();
    for (const t of state.teams) m.set(t.id, t);
    return m;
  }, [state.teams]);

  const isGameDay = !!teamGame;
  const isHome = teamGame ? teamGame.homeTid === team.id : false;
  const opponent = teamGame ? teamLookup.get(isHome ? teamGame.awayTid : teamGame.homeTid) : null;

  const tomorrowISO = useMemo(() => {
    if (!norm) return '';
    const d = new Date(`${norm}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [norm]);

  return (
    <div className="space-y-5">
      {/* Eyebrow + back */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
        >
          <ArrowLeft size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest">Calendar</span>
        </button>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FDB927]">
            {isGameDay ? 'Game Day' : 'Training Day'}
          </div>
          <div className="text-base md:text-lg font-black uppercase tracking-tight text-white">
            {formatDateLong(norm)}
          </div>
        </div>
      </div>

      {/* Training prep card */}
      <div className="relative bg-[#111] border border-[#FDB927]/30 rounded-2xl overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#FDB927]" />
        <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-[#FDB927]/15 border border-[#FDB927]/30 p-3 rounded-xl">
              <TrainingActivityIcon
                activity={scheduleDay?.activity ?? 'Off Day'}
                paradigm={userPlan?.paradigm}
                hasUserPlan={!!userPlan}
                size={26}
              />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FDB927]">
                Training Prep
              </div>
              <h3 className="text-lg md:text-xl font-black uppercase tracking-tight text-white mt-1">
                {team.abbrev} · {scheduleDay?.activity ?? 'Off Day'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {scheduleDay?.description ?? 'No team work scheduled'}
              </p>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2 tabular-nums">
                {userPlan ? (
                  <>
                    {PARADIGM_LABEL[userPlan.paradigm]} <span className="text-slate-700 mx-1">·</span> {Math.round(userPlan.intensity)}% intensity
                    <span className="text-slate-700 mx-1">·</span>
                    <span className="text-[#FDB927]">User-set plan</span>
                  </>
                ) : (
                  <span className="text-slate-600">Auto-scheduled · click "Edit Plan" to override</span>
                )}
              </div>
            </div>
          </div>
          {!isReadOnly && (
            <button
              onClick={onEditPlan}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#FDB927] text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-300 transition-colors shrink-0"
            >
              <Edit3 size={12} />
              Edit Plan
            </button>
          )}
        </div>
      </div>

      {/* Matchup hero — only on game days */}
      {teamGame && (
        <div className="relative bg-gradient-to-br from-rose-950/40 via-slate-950 to-slate-950 border border-rose-500/30 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500 rounded-full blur-3xl" />
          </div>
          <div className="relative p-6 md:p-8">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-rose-300 mb-4">
              <Clock size={12} />
              {isHome ? 'HOME' : 'AWAY'} · TIPOFF {teamGame.played ? 'COMPLETE' : 'TONIGHT'}
            </div>

            <div className="flex items-center justify-between gap-4 md:gap-6">
              {/* Home team */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-16 h-16 md:w-24 md:h-24 flex items-center justify-center">
                  {isHome ? (
                    team.logoUrl && <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    opponent?.logoUrl && <img src={opponent.logoUrl} alt={opponent.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div className="text-center">
                  <div className="text-lg md:text-2xl font-black uppercase tracking-tight text-white">
                    {isHome ? team.abbrev : opponent?.abbrev ?? '???'}
                  </div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 tabular-nums">
                    {isHome ? `${team.wins}-${team.losses}` : opponent ? `${opponent.wins}-${opponent.losses}` : ''}
                  </div>
                </div>
                {teamGame.played && (
                  <div className="text-3xl md:text-5xl font-black tabular-nums text-white mt-1">
                    {(teamGame as any).homeScore ?? '-'}
                  </div>
                )}
              </div>

              {/* VS marker */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-rose-300/60">
                  vs
                </span>
                {!teamGame.played && (
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1">
                    Today
                  </div>
                )}
              </div>

              {/* Away team */}
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className="w-16 h-16 md:w-24 md:h-24 flex items-center justify-center">
                  {!isHome ? (
                    team.logoUrl && <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    opponent?.logoUrl && <img src={opponent.logoUrl} alt={opponent.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div className="text-center">
                  <div className="text-lg md:text-2xl font-black uppercase tracking-tight text-white">
                    {!isHome ? team.abbrev : opponent?.abbrev ?? '???'}
                  </div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5 tabular-nums">
                    {!isHome ? `${team.wins}-${team.losses}` : opponent ? `${opponent.wins}-${opponent.losses}` : ''}
                  </div>
                </div>
                {teamGame.played && (
                  <div className="text-3xl md:text-5xl font-black tabular-nums text-white mt-1">
                    {(teamGame as any).awayScore ?? '-'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other league games today — compact strip */}
      {otherGames.length > 0 && (
        <div className="bg-slate-950/40 border border-slate-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon size={12} className="text-slate-500" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                Around the League
              </span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 tabular-nums">
              {otherGames.length} {otherGames.length === 1 ? 'Game' : 'Games'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {otherGames.map(g => {
              const home = teamLookup.get(g.homeTid);
              const away = teamLookup.get(g.awayTid);
              return (
                <div
                  key={g.gid}
                  className="flex items-center justify-between px-3 py-2 bg-slate-900/40 border border-slate-800/60 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-[10px] font-black uppercase text-slate-300 tracking-tight tabular-nums">
                        {away?.abbrev ?? '???'}
                      </span>
                      <span className="text-[10px] font-black uppercase text-slate-300 tracking-tight tabular-nums">
                        {home?.abbrev ?? '???'}
                      </span>
                    </div>
                    {g.played ? (
                      <div className="flex flex-col items-end gap-0.5 ml-auto pr-1 tabular-nums">
                        <span className="text-[10px] font-black text-white">{(g as any).awayScore ?? '-'}</span>
                        <span className="text-[10px] font-black text-white">{(g as any).homeScore ?? '-'}</span>
                      </div>
                    ) : (
                      <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-slate-600">
                        TBD
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sim controls */}
      <div className="flex flex-col md:flex-row gap-2">
        <button
          onClick={onSimulateDay}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#FDB927] text-black text-[11px] font-black uppercase tracking-widest hover:bg-amber-300 transition-colors flex-1"
        >
          <Play size={14} />
          Simulate Day
        </button>
        {tomorrowISO && (
          <button
            onClick={() => onSimulateToDate(tomorrowISO)}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-black uppercase tracking-widest transition-colors flex-1"
          >
            <FastForward size={14} />
            Skip to Tomorrow
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
