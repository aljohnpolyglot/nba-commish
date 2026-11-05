import React from 'react';
import { ChevronRight, Globe, Sparkles } from 'lucide-react';
import type { NBATeam, NonNBATeam } from '../../types';
import type { InternationalPreseasonRecommendation } from '../../services/logic/autoResolversParts/scheduleResolvers';
import { getTeamFullName } from '../../utils/teamNames';

interface Props {
  recommendations: InternationalPreseasonRecommendation[];
  teams: NBATeam[];
  nonNBATeams: NonNBATeam[];
  onUse: () => void;
}

export const InternationalPreseasonRecommendedSlate: React.FC<Props> = ({
  recommendations,
  teams,
  nonNBATeams,
  onUse,
}) => {
  if (recommendations.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.1),transparent_38%),rgba(15,23,42,0.45)] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="shrink-0 text-emerald-400" size={24} />
          <div>
            <h3 className="font-black uppercase tracking-wide text-white">Recommended Slate</h3>
            <p className="mt-1 text-xs text-slate-400">The strongest available international clubs paired with marquee NBA teams.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onUse}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-500"
        >
          <Sparkles size={15} />
          Use recommendations
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        {recommendations.map((game, index) => {
          const opponent = nonNBATeams.find(team => team.tid === game.opponentId);
          const nbaTeam = teams.find(team => team.id === game.teamId);
          return (
            <button
              type="button"
              key={`${game.teamId}-${game.opponentId}`}
              onClick={onUse}
              className="group grid grid-cols-[28px_36px_minmax(0,1fr)_auto_minmax(0,1fr)_36px_20px] items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/30 p-2 text-left transition hover:border-emerald-500/50"
            >
              <span className="text-center text-sm font-black text-emerald-400">{index + 1}</span>
              {nbaTeam?.logoUrl
                ? <img src={nbaTeam.logoUrl} alt="" className="size-9 object-contain" referrerPolicy="no-referrer" />
                : <span className="text-[10px] font-black text-slate-500">{nbaTeam?.abbrev}</span>}
              <span className="truncate text-xs font-black text-white">{getTeamFullName(nbaTeam)}</span>
              <span className="text-[9px] font-black uppercase text-slate-600">vs</span>
              <span className="truncate text-right text-xs font-black text-white">{game.opponentName || getTeamFullName(opponent)}</span>
              {opponent?.imgURL
                ? <img src={opponent.imgURL} alt="" className="size-9 object-contain" referrerPolicy="no-referrer" />
                : <Globe size={18} className="justify-self-center text-slate-600" />}
              <ChevronRight size={18} className="text-slate-600 transition group-hover:text-emerald-400" />
            </button>
          );
        })}
      </div>
    </section>
  );
};
