import React from 'react';
import type { BracketSource, NBATeam, PlayoffBracket } from '../../../types';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';

const sourceLabel = (source: BracketSource, playoffs: PlayoffBracket, teams: NBATeam[]): string => {
  if (source.kind === 'team') {
    const live = teams.find(team => team.id === source.teamId);
    const team = live ? getHistoricalTeamSnapshot(live, playoffs.season) as NBATeam : undefined;
    return `${source.seed} ${getTeamFullName(team) || team?.abbrev || 'TBD'}${playoffs.byes?.some(bye => bye.teamId === source.teamId && bye.destinationSeriesId) ? ' — advanced by bye' : ''}`;
  }
  if (source.kind === 'winnerOf') {
    const feeder = playoffs.series.find(series => series.id === source.seriesId);
    if (feeder?.status === 'complete' && feeder.winnerId != null) {
      const team = teams.find(row => row.id === feeder.winnerId);
      const seed = feeder.winnerId === feeder.higherSeedTid ? feeder.higherSeed : feeder.lowerSeed;
      return `${seed} ${getTeamFullName(team) || team?.abbrev || 'TBD'}`;
    }
    return 'TBD';
  }
  if (source.kind === 'loserOf') {
    const feeder = playoffs.series.find(series => series.id === source.seriesId);
    if (feeder?.status === 'complete' && feeder.winnerId != null) {
      const loserId = feeder.winnerId === feeder.higherSeedTid ? feeder.lowerSeedTid : feeder.higherSeedTid;
      const team = teams.find(row => row.id === loserId);
      const seed = loserId === feeder.higherSeedTid ? feeder.higherSeed : feeder.lowerSeed;
      return `${seed} ${getTeamFullName(team) || team?.abbrev || 'TBD'}`;
    }
    return 'TBD';
  }
  return 'TBD';
};

export function BracketLineageList({ playoffs, teams }: { playoffs: PlayoffBracket; teams: NBATeam[] }) {
  if (!playoffs.nodes?.length) return null;
  return (
    <div className="space-y-3 md:hidden" data-mobile-bracket-lineage>
      {playoffs.nodes.map(node => (
        <section key={node.id} tabIndex={0} aria-label={`${sourceLabel(node.sourceA, playoffs, teams)} versus ${sourceLabel(node.sourceB, playoffs, teams)}`} className="rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:ring-2 focus:ring-indigo-400">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
            {node.conference !== 'League' && node.conference !== 'Finals' ? `${node.conference} · ` : ''}
            Round {node.roundIndex} slot {node.slotIndex + 1}
            {playoffs.bracketPolicy === 'reseeded' ? ' · Reseeded' : ''}
          </p>
          <p className="mt-2 text-sm font-semibold text-white">{sourceLabel(node.sourceA, playoffs, teams)}</p>
          <p className="my-1 text-[10px] font-black uppercase text-slate-500">vs</p>
          <p className="text-sm font-semibold text-white">{sourceLabel(node.sourceB, playoffs, teams)}</p>
        </section>
      ))}
    </div>
  );
}
