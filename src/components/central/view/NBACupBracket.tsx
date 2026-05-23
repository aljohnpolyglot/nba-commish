import React from 'react';
import { motion } from 'motion/react';
import { Award, LayoutDashboard, Search, Trophy, Users } from 'lucide-react';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { BracketTeam, Standing } from '../types';
import { getTeamLogo } from './NBACupData';

export function GroupTable({
  name,
  standings,
  variant = 'default',
  teams,
}: {
  name: string;
  standings: Standing[];
  variant?: 'default' | 'info' | 'success';
  teams?: { id: number; name: string; logoURL?: string }[];
}) {
  const variantStyles = {
    default: { border: 'border-white/5', header: 'bg-white/5', icon: <Users className="w-4 h-4 text-amber-500" /> },
    info: { border: 'border-blue-500/10', header: 'bg-blue-500/5', icon: <Search className="w-4 h-4 text-blue-500" /> },
    success: { border: 'border-emerald-500/10', header: 'bg-emerald-500/5', icon: <Award className="w-4 h-4 text-emerald-500" /> },
  };
  const style = variantStyles[variant];

  return (
    <div className={`bg-white/[0.03] backdrop-blur-xl border ${style.border} rounded-[40px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.05]`}>
      <div className={`px-8 py-6 ${style.header} border-b border-white/5 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center border border-white/5">{style.icon}</div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white italic">{name}</h3>
        </div>
        <div className="text-[9px] font-black text-slate-500 bg-white/5 px-3 py-1 rounded-full border border-white/10 uppercase tracking-widest">
          {variant === 'default' ? 'Group Stage' : 'Phase Final'}
        </div>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-xs text-left min-w-[600px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-[0.2em] text-[10px] border-b border-white/5">
              <th className="px-8 py-5 font-bold">Team</th>
              {standings[0]?.grp && <th className="px-3 py-5 font-bold text-center">Grp</th>}
              <th className="px-3 py-5 font-bold text-center">GP</th>
              <th className="px-3 py-5 font-bold text-center">W</th>
              <th className="px-3 py-5 font-bold text-center">L</th>
              <th className="px-3 py-5 font-bold text-center">PF</th>
              <th className="px-3 py-5 font-bold text-center">PA</th>
              <th className="px-8 py-5 font-bold text-right font-mono">PD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {standings.map(row => {
              const advBg =
                row.advancement === 'winner'
                  ? 'bg-emerald-500/[0.06] hover:bg-emerald-500/[0.10] border-l-2 border-emerald-500/60'
                  : row.advancement === 'wildcard'
                    ? 'bg-amber-500/[0.06] hover:bg-amber-500/[0.10] border-l-2 border-amber-500/60'
                    : row.advancement === 'eliminated'
                      ? 'opacity-50 hover:bg-white/[0.02]'
                      : 'hover:bg-white/[0.02]';
              const rankColor =
                row.advancement === 'winner'
                  ? 'text-emerald-400'
                  : row.advancement === 'wildcard'
                    ? 'text-amber-400'
                    : row.rank === '1'
                      ? 'text-amber-500'
                      : 'text-slate-600 group-hover:text-slate-400';
              return (
                <tr key={row.team} className={`transition-colors group ${advBg}`}>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-5">
                      <span className={`w-4 text-center font-black tabular-nums ${rankColor}`}>{row.rank}</span>
                      {row.advancement === 'winner' && <span title="Group Winner — Advanced" className="text-[8px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">ADV</span>}
                      {row.advancement === 'wildcard' && <span title="Wildcard — Advanced" className="text-[8px] font-black uppercase tracking-widest text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">WC</span>}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-black/40 flex items-center justify-center p-1.5 border border-white/10 shadow-inner group-hover:border-white/20 transition-all">
                          <img
                            src={getTeamLogo(row.team, teams) ?? `https://via.placeholder.com/32?text=${row.team.charAt(0)}`}
                            alt={row.team}
                            className="w-full h-full object-contain"
                            onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                          />
                        </div>
                        <span className="font-bold text-slate-200 group-hover:text-white transition-colors text-sm">{row.team}</span>
                      </div>
                    </div>
                  </td>
                  {row.grp && <td className="px-3 py-5 text-center"><span className="text-[10px] font-black text-slate-500 uppercase bg-white/5 px-2 py-0.5 rounded border border-white/5">{row.grp}</span></td>}
                  <td className="px-3 py-5 text-center text-slate-500 font-mono tabular-nums font-bold">{row.pld}</td>
                  <td className="px-3 py-5 text-center"><span className="font-mono font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded text-[11px] tabular-nums">{row.w}</span></td>
                  <td className="px-3 py-5 text-center"><span className="font-mono font-black text-red-500 bg-red-500/10 px-2.5 py-1 rounded text-[11px] tabular-nums">{row.l}</span></td>
                  <td className="px-3 py-5 text-center text-slate-400 font-mono tabular-nums font-bold">{row.pf}</td>
                  <td className="px-3 py-5 text-center text-slate-400 font-mono tabular-nums font-bold">{row.pa}</td>
                  <td className={`px-8 py-5 text-right font-mono font-black tabular-nums text-sm ${row.pd.startsWith('+') ? 'text-emerald-400' : row.pd === '0' || row.pd === '+0' ? 'text-slate-500' : 'text-red-400'}`}>{row.pd}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchCard({
  teams: matchTeams,
  highlighted,
  size = 'default',
  delay = 0,
  liveTeams,
  onGameClick,
}: {
  teams: [BracketTeam, BracketTeam];
  highlighted?: boolean;
  size?: 'default' | 'large';
  delay?: number;
  liveTeams?: { id: number; name: string; logoURL?: string }[];
  onGameClick?: () => void;
}) {
  const winnerIndex = matchTeams[0].score > matchTeams[1].score ? 0 : 1;
  const isLarge = size === 'large';
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      onClick={onGameClick}
      className={`${isLarge ? 'w-64' : 'w-60'} bg-white/[0.03] backdrop-blur-xl border ${highlighted ? 'border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.1)]' : 'border-white/5'} rounded-[24px] overflow-hidden shadow-2xl transition-all hover:bg-white/[0.06] hover:border-white/10 ${onGameClick ? 'cursor-pointer' : ''}`}
    >
      {matchTeams.map((team, i) => (
        <div key={i} className={`px-5 py-4 flex items-center justify-between gap-3 ${i === 0 ? 'border-b border-white/5' : ''} ${winnerIndex === i ? 'bg-white/[0.02]' : 'opacity-60'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-[10px] font-black text-slate-500 w-4 tabular-nums">{team.seed}</span>
            <div className="w-6 h-6 shrink-0 rounded bg-black/20 p-0.5 border border-white/5">
              <img
                src={getTeamLogo(team.team, liveTeams) ?? `https://via.placeholder.com/24?text=${team.team.charAt(0)}`}
                alt={team.team}
                className="w-full h-full object-contain"
                onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            </div>
            <span className={`text-xs font-bold truncate ${winnerIndex === i ? 'text-white' : 'text-slate-400'}`}>{team.team}</span>
          </div>
          <span className={`font-mono font-black text-xs tabular-nums ${winnerIndex === i ? 'text-amber-500' : 'text-slate-500'}`}>{team.score}</span>
        </div>
      ))}
    </motion.div>
  );
}

export function BracketDisplay({
  bracket,
  liveTeams,
  onGameClick,
}: {
  bracket: BracketTeam[];
  liveTeams?: { id: number; name: string; logoURL?: string }[];
  onGameClick?: (gameId: number) => void;
}) {
  const labels = useLeagueLabels();
  if (!bracket || bracket.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center">
        <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
          <LayoutDashboard className="text-slate-700" size={40} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Bracket TBD</h3>
        <p className="text-slate-500 text-sm max-w-xs">The knockout stage starts after the group stage concludes.</p>
      </div>
    );
  }

  const games: Array<[BracketTeam, BracketTeam]> = [];
  for (let i = 0; i < bracket.length; i += 2) {
    if (bracket[i] && bracket[i + 1]) games.push([bracket[i], bracket[i + 1]]);
  }
  const qf = games.slice(0, 4);
  const sf = games.slice(4, 6);
  const final = games.slice(6, 7);

  return (
    <div className="relative overflow-x-auto no-scrollbar pb-10">
      <div className="min-w-[900px] flex justify-between gap-8 pt-12 pb-8 px-4">
        <div className="flex flex-col justify-between gap-8">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] text-center mb-4">Quarterfinals</div>
          {qf.map((game, i) => <MatchCard key={i} teams={game} delay={i * 0.1} liveTeams={liveTeams} onGameClick={game[0].gameId != null ? () => onGameClick?.(game[0].gameId!) : undefined} />)}
        </div>
        <div className="flex flex-col justify-around py-20 w-8">{[1, 2].map(i => <div key={i} className="h-32 border-y border-r border-white/10 rounded-r-xl" />)}</div>
        <div className="flex flex-col justify-around py-16">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] text-center mb-4">Semifinals</div>
          {sf.map((game, i) => <MatchCard key={i} teams={game} delay={0.4 + i * 0.1} liveTeams={liveTeams} onGameClick={game[0].gameId != null ? () => onGameClick?.(game[0].gameId!) : undefined} />)}
        </div>
        <div className="flex flex-col justify-center py-20 w-8"><div className="h-64 border-y border-r border-white/10 rounded-r-xl" /></div>
        <div className="flex flex-col justify-center pt-20">
          <div className="text-[10px] font-black text-amber-500/50 uppercase tracking-[0.3em] text-center mb-6">Championship</div>
          <div className="relative">
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 flex flex-col items-center">
              <Trophy className="text-amber-500 w-16 h-16 drop-shadow-[0_0_40px_rgba(245,158,11,0.6)]" />
              <div className="bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mt-3 backdrop-blur-xl">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] whitespace-nowrap italic">{labels.cupChampion}</span>
              </div>
            </div>
            {final.map((game, i) => <MatchCard key={i} teams={game} highlighted size="large" delay={0.7} liveTeams={liveTeams} onGameClick={game[0].gameId != null ? () => onGameClick?.(game[0].gameId!) : undefined} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
