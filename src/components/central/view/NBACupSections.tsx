import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Award, Calendar, Medal, Trophy, Users } from 'lucide-react';
import { NBACupState } from '../../../types';
import { useLeagueLabels } from '../../../utils/leagueLabels';
import { classifyBoxScoreGame } from '../../../utils/gameClassification';
import { NBACupYearData } from '../types';

export function PrizePool({ cup }: { cup?: NBACupState }) {
  if (cup && cup.prizePool === undefined && cup.status !== 'group') {
    return (
      <div className="mb-8 px-4 py-3 bg-slate-800/40 border border-slate-700/30 rounded-2xl">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cup Bonuses Off</span>
      </div>
    );
  }

  const pp = cup?.prizePool?.perPlayerByFinish;
  const fmt = (n: number) => '$' + n.toLocaleString();
  const prizes = [
    { label: 'Winner', amount: pp ? fmt(pp.winner) : '$500,000', color: 'text-amber-500', border: 'border-amber-500/30', icon: <Trophy className="w-5 h-5 text-amber-500" /> },
    { label: 'Runner-up', amount: pp ? fmt(pp.runnerUp) : '$200,000', color: 'text-slate-200', border: 'border-white/10', icon: <Medal className="w-5 h-5 text-slate-400" /> },
    { label: 'Semifinalist', amount: pp ? fmt(pp.semi) : '$100,000', color: 'text-slate-400', border: 'border-white/5', icon: <Award className="w-5 h-5 text-slate-500" /> },
    { label: 'Quarterfinalist', amount: pp ? fmt(pp.quarter) : '$50,000', color: 'text-slate-500', border: 'border-white/5', icon: <Users className="w-5 h-5 text-slate-600" /> },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
      {prizes.map((prize, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={`bg-white/[0.03] backdrop-blur-xl border ${prize.border} p-6 rounded-3xl relative overflow-hidden group hover:bg-white/[0.05] transition-all`}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              {prize.icon}
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{prize.label}</span>
            </div>
            <p className={`text-2xl font-black ${prize.color} tabular-nums leading-none`}>{prize.amount}</p>
          </div>
          <div className="absolute -bottom-6 -right-6 opacity-5 group-hover:opacity-10 transition-all pointer-events-none"><Trophy size={100} /></div>
        </motion.div>
      ))}
    </div>
  );
}

export function CupChampionHero({
  data,
  liveCup,
  teams,
  players,
  boxScores,
  schedule,
  onPlayerClick,
}: {
  data: NBACupYearData;
  liveCup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string }>;
  players?: Array<{ internalId: string; name: string; imgURL?: string; face?: any }>;
  boxScores?: Array<{ gameId: number; homeStats?: any[]; awayStats?: any[] }>;
  schedule?: Array<{ gid: number; isNBACup?: boolean }>;
  onPlayerClick?: (name: string, livePlayer?: any) => void;
}) {
  const champTeam = liveCup?.championTid != null ? teams?.find(t => t.id === liveCup.championTid) : (() => {
    const name = data.summary?.champions?.split('(')[0]?.trim();
    return name ? teams?.find(t => t.name === name) : undefined;
  })();
  const runnerUpTeam = liveCup?.runnerUpTid != null ? teams?.find(t => t.id === liveCup.runnerUpTid) : (() => {
    const name = data.summary?.runner_up?.split('(')[0]?.trim();
    return name ? teams?.find(t => t.name === name) : undefined;
  })();
  const mvpPid = liveCup?.mvpPlayerId;
  const mvpFromLive = mvpPid ? players?.find(p => p.internalId === mvpPid) : undefined;
  const mvpName = mvpFromLive?.name ?? data.summary?.mvp?.split('(')[0]?.trim() ?? '';
  const mvpPlayer = mvpFromLive ?? (mvpName ? players?.find(p => p.name === mvpName) : undefined);

  const mvpStatLine = useMemo(() => {
    if (!mvpPid || !boxScores?.length) return undefined;
    const cupGids = new Set<number>();
    for (const game of schedule ?? []) if (game.isNBACup) cupGids.add(game.gid);
    if (cupGids.size === 0 && liveCup) {
      for (const game of liveCup.knockout) if (game.gameId != null) cupGids.add(game.gameId);
    }
    if (cupGids.size === 0) return undefined;
    let gp = 0;
    let pts = 0;
    let reb = 0;
    let ast = 0;
    for (const box of boxScores) {
      if (!cupGids.has(box.gameId)) continue;
      const line = [...(box.homeStats ?? []), ...(box.awayStats ?? [])].find((entry: any) => entry?.playerId === mvpPid);
      if (!line) continue;
      gp++;
      pts += line.pts ?? 0;
      reb += line.reb ?? ((line.orb ?? 0) + (line.drb ?? 0));
      ast += line.ast ?? 0;
    }
    return gp > 0 ? `${(pts / gp).toFixed(1)} PTS · ${(reb / gp).toFixed(1)} REB · ${(ast / gp).toFixed(1)} AST` : undefined;
  }, [mvpPid, boxScores, schedule, liveCup]);

  const champLogo = (champTeam as any)?.logoUrl ?? (champTeam as any)?.logoURL;
  const runnerLogo = (runnerUpTeam as any)?.logoUrl ?? (runnerUpTeam as any)?.logoURL;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 p-5">
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-amber-400/5 blur-3xl pointer-events-none" />
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-3"><Trophy size={13} className="text-amber-400" /><span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Champion</span></div>
          {champTeam ? (
            <div className="flex items-center gap-4">
              {champLogo && <img src={champLogo} alt={(champTeam as any).abbrev ?? champTeam.name} className="w-20 h-20 object-contain drop-shadow-xl shrink-0" referrerPolicy="no-referrer" />}
              <div>
                <span className="text-2xl font-black text-amber-400">{champTeam.name}</span>
                {mvpName && (
                  <div className={`flex items-center gap-2 mt-2 bg-slate-800/60 rounded-lg px-2.5 py-1.5 w-fit ${onPlayerClick ? 'cursor-pointer hover:bg-slate-800 transition-colors' : ''}`} onClick={onPlayerClick ? () => onPlayerClick(mvpName, mvpPlayer) : undefined}>
                    {mvpPlayer?.imgURL && <img src={mvpPlayer.imgURL} alt={mvpName} className="w-8 h-8 rounded-md object-cover bg-slate-700" referrerPolicy="no-referrer" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
                    <div>
                      <div className="text-[9px] text-amber-500 uppercase font-black tracking-wider">Cup MVP</div>
                      <div className="text-sm font-bold text-white">{mvpName}</div>
                      {mvpStatLine && <div className="text-[10px] font-mono text-slate-300 mt-0.5">{mvpStatLine}</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : <p className="text-slate-500 italic text-sm">Champion TBD</p>}
        </div>
        {runnerUpTeam && (
          <div className="md:border-l md:border-slate-700/50 md:pl-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Runner-Up</div>
            <div className="flex items-center gap-3">
              {runnerLogo && <img src={runnerLogo} alt={(runnerUpTeam as any).abbrev ?? runnerUpTeam.name} className="w-12 h-12 object-contain opacity-50 shrink-0" referrerPolicy="no-referrer" />}
              <span className="text-base font-bold text-slate-300">{runnerUpTeam.name}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CupAllTournamentSection({
  data,
  liveCup,
  teams,
  players,
  boxScores,
  schedule,
  onPlayerClick,
}: {
  data: NBACupYearData;
  liveCup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string }>;
  players?: Array<{ internalId: string; name: string; imgURL?: string; face?: any }>;
  boxScores?: Array<{ gameId: number; homeTeamId?: number; awayTeamId?: number; homeStats?: any[]; awayStats?: any[] }>;
  schedule?: Array<{ gid: number; isNBACup?: boolean }>;
  onPlayerClick?: (name: string, livePlayer?: any) => void;
}) {
  const cupStatsByPid = useMemo(() => {
    const out = new Map<string, { gp: number; pts: number; reb: number; ast: number }>();
    if (!boxScores?.length) return out;
    const cupGids = new Set<number>();
    for (const game of schedule ?? []) if (game.isNBACup) cupGids.add(game.gid);
    if (cupGids.size === 0 && liveCup) {
      for (const game of liveCup.knockout) if (game.gameId != null) cupGids.add(game.gameId);
    }
    if (cupGids.size === 0) return out;
    for (const box of boxScores) {
      if (!cupGids.has(box.gameId)) continue;
      for (const line of [...(box.homeStats ?? []), ...(box.awayStats ?? [])]) {
        if (!line?.playerId) continue;
        const prev = out.get(line.playerId) ?? { gp: 0, pts: 0, reb: 0, ast: 0 };
        out.set(line.playerId, { gp: prev.gp + 1, pts: prev.pts + (line.pts ?? 0), reb: prev.reb + (line.reb ?? ((line.orb ?? 0) + (line.drb ?? 0))), ast: prev.ast + (line.ast ?? 0) });
      }
    }
    return out;
  }, [liveCup, boxScores, schedule]);

  const entries = liveCup?.allTournamentTeam?.length
    ? liveCup.allTournamentTeam.map(entry => {
        const player = players?.find(p => p.internalId === entry.playerId);
        const team = teams?.find(t => t.id === entry.tid);
        const ko = cupStatsByPid.get(entry.playerId);
        return {
          pos: entry.pos,
          playerName: player?.name ?? entry.playerId,
          teamName: team?.name ?? '—',
          teamLogo: (team as any)?.logoUrl ?? (team as any)?.logoURL,
          imgURL: player?.imgURL,
          isMvp: entry.isMvp,
          statLine: ko && ko.gp > 0 ? `${(ko.pts / ko.gp).toFixed(1)} PTS · ${(ko.reb / ko.gp).toFixed(1)} REB · ${(ko.ast / ko.gp).toFixed(1)} AST` : undefined,
          livePlayer: player,
        };
      })
    : (data.all_tournament_team ?? []).map(player => {
        const match = players?.find(entry => entry.name === player.player);
        const histLow = (player.team ?? '').toLowerCase().trim();
        const histTeam = histLow ? teams?.find(team => {
          const name = team.name.toLowerCase();
          return name === histLow || histLow.includes(name) || name.includes(histLow.split(' ').pop() ?? '');
        }) : undefined;
        return {
          pos: player.pos,
          playerName: player.player,
          teamName: player.team,
          teamLogo: (histTeam as any)?.logoUrl ?? (histTeam as any)?.logoURL,
          imgURL: match?.imgURL,
          isMvp: !!player.is_mvp,
          statLine: undefined,
          livePlayer: match,
        };
      });

  if (!entries.length) return null;
  return (
    <section>
      <div className="flex items-center gap-3 mb-6"><div className="h-6 w-1 bg-amber-500 rounded-full" /><h2 className="text-lg font-black uppercase tracking-tighter text-white italic">All-Tournament Team</h2></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {entries.map((entry, idx) => (
          <motion.div key={`${entry.playerName}-${idx}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} onClick={onPlayerClick ? () => onPlayerClick(entry.playerName, entry.livePlayer) : undefined} className={`relative flex flex-col gap-2 p-3 rounded-2xl border transition-colors ${onPlayerClick ? 'cursor-pointer' : ''} ${entry.isMvp ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/40 hover:border-amber-400' : 'bg-slate-900/60 border-slate-800 hover:border-slate-600'}`}>
            {entry.isMvp && <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full"><Trophy size={9} className="text-amber-400" /><span className="text-[8px] font-black text-amber-300 uppercase tracking-wider">MVP</span></span>}
            <div className="flex items-center gap-2.5">
              <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
                {entry.imgURL ? <img src={entry.imgURL} alt={entry.playerName} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px] font-black">{entry.playerName.split(' ').map(s => s[0]).slice(0, 2).join('')}</div>}
                {entry.teamLogo && <div className="absolute bottom-0 right-0 w-4 h-4 bg-white/90 rounded-tl-md p-0.5"><img src={entry.teamLogo} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest">{entry.pos}</div>
                <div className="text-xs font-bold text-white truncate leading-tight">{entry.playerName}</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold truncate">{entry.teamName}</div>
              </div>
            </div>
            {entry.statLine && <div className="text-[10px] font-mono text-slate-400 bg-black/20 rounded-md px-2 py-1 border border-white/5">{entry.statLine}</div>}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export function CupGameLog({
  year,
  cup,
  teams,
  boxScores,
  schedule,
  onGameClick,
}: {
  year: number;
  cup?: NBACupState;
  teams?: Array<{ id: number; name: string; logoURL?: string; logoUrl?: string; abbrev?: string }>;
  boxScores?: Array<any>;
  schedule?: Array<any>;
  onGameClick?: (gameId: number) => void;
}) {
  const labels = useLeagueLabels();
  const rows = useMemo(() => {
    if (!boxScores?.length) return [];
    return boxScores
      .map(box => ({ box, meta: classifyBoxScoreGame(box, schedule ?? [], undefined, cup, undefined, year) }))
      .filter(({ meta }) => meta.seasonYear === year && meta.isNBACup)
      .sort((a, b) => new Date(a.box.date ?? '').getTime() - new Date(b.box.date ?? '').getTime());
  }, [boxScores, schedule, cup, year]);
  const teamById = useMemo(() => new Map((teams ?? []).map(team => [team.id, team])), [teams]);
  const fmtDate = (date: string) => {
    const d = new Date(date);
    return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!rows.length) return null;
  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-4"><div className="h-6 w-1 bg-amber-500 rounded-full" /><h2 className="text-lg font-black uppercase tracking-tighter text-white italic">{labels.cupShort} Game Log</h2></div>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60">
        <table className="w-full text-xs">
          <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Round</th><th className="px-4 py-3 text-left">Matchup</th><th className="px-4 py-3 text-right">Result</th></tr></thead>
          <tbody className="divide-y divide-white/5">
            {rows.map(({ box, meta }) => {
              const home = teamById.get(box.homeTeamId);
              const away = teamById.get(box.awayTeamId);
              const homeWon = (box.homeScore ?? 0) > (box.awayScore ?? 0);
              const round = meta.cupRound === 'group' ? 'Group' : meta.cupRound ?? 'Cup';
              return (
                <tr key={`${box.season ?? year}-${box.gameId}`} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtDate(box.date ?? '')}</td>
                  <td className="px-4 py-3"><span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">{round}</span></td>
                  <td className="px-4 py-3 text-slate-200"><span className={!homeWon ? 'font-bold text-white' : 'text-slate-400'}>{away?.abbrev ?? away?.name ?? box.awayTeamId}</span><span className="mx-2 text-slate-600">@</span><span className={homeWon ? 'font-bold text-white' : 'text-slate-400'}>{home?.abbrev ?? home?.name ?? box.homeTeamId}</span></td>
                  <td className="px-4 py-3 text-right"><button type="button" onClick={() => onGameClick?.(box.gameId)} className="font-mono font-black text-white hover:text-amber-300 hover:underline transition-colors">{box.awayScore}-{box.homeScore}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CupNotStarted({ cupShort, year }: { cupShort: string; year: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Calendar size={48} className="text-slate-700 mb-4" />
      <h2 className="text-xl font-black text-white uppercase italic mb-2">Cup Not Started</h2>
      <p className="text-slate-500 text-sm max-w-xs">The {year - 1}–{String(year).slice(-2)} {cupShort} begins in November. Simulate through opening night to see the groups.</p>
    </div>
  );
}
