import React from 'react';
import type { BracketByeNode, NBATeam } from '../../../types';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';

export function ByeCard({ bye, teams, season }: { bye: BracketByeNode; teams: NBATeam[]; season: number }) {
  const live = teams.find(team => team.id === bye.teamId);
  const team = live ? getHistoricalTeamSnapshot(live, season) as NBATeam : undefined;
  const fullName = getTeamFullName(team);
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Seed ${bye.seed}, ${fullName}, advanced by bye to round ${bye.destinationRoundIndex}${bye.destinationSeriesId ? `, feeding ${bye.destinationSeriesId}` : ''}`}
      className="relative w-48 shrink-0 rounded-lg border border-emerald-500/40 bg-[#0f1818] shadow-md outline-none focus:ring-2 focus:ring-emerald-400"
      data-bracket-bye={bye.id}
      data-feeds-series={bye.destinationSeriesId}
    >
      <div className="flex items-center gap-3 p-2.5">
        {team?.logoUrl ? <img src={team.logoUrl} alt="" className="h-7 w-7 object-contain" /> : <div className="h-7 w-7 rounded-full bg-slate-800" />}
        <span className="w-3 text-right text-[10px] font-bold text-slate-500">{bye.seed}</span>
        <span className="truncate text-xs font-bold text-white">{team?.abbrev ?? fullName ?? 'TBD'}</span>
      </div>
      <div className="border-t border-emerald-500/20 bg-emerald-950/40 px-2 py-1 text-center text-[9px] font-black uppercase tracking-wide text-emerald-300">
        Bye — advances to round {bye.destinationRoundIndex}
      </div>
      <span aria-hidden className="absolute left-full top-1/2 hidden h-px w-6 bg-emerald-500/60 md:block" />
    </div>
  );
}
