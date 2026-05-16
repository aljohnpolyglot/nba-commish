import React, { useMemo } from 'react';
import { Trophy, Shield, Crown, Calendar, Users, TrendingUp, UserX } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { convertTo2KRating } from '../../utils/helpers';
import type { NBAPlayer } from '../../types';
import { PBAImportTracker } from './PBAImportTracker';

type PbaConference = 'philippine' | 'commissioners' | 'governors';

const CONFERENCE_ORDER: PbaConference[] = ['philippine', 'commissioners', 'governors'];

const CONFERENCE_META: Record<PbaConference, { spec: typeof PBA_COMPETITIONS[0]; label: string; emoji: string }> = {
  philippine:    { spec: PBA_COMPETITIONS[0], label: 'Philippine Cup',       emoji: '🛡️' },
  commissioners: { spec: PBA_COMPETITIONS[1], label: "Commissioner's Cup",  emoji: '🏆' },
  governors:     { spec: PBA_COMPETITIONS[2], label: "Governors' Cup",       emoji: '👑' },
};

interface Props {
  conference: PbaConference;
}

export const PBAConferenceCentral: React.FC<Props> = ({ conference }) => {
  const { state, dispatchAction } = useGame();
  const ls = state.leagueStats as any;
  const currentConf: PbaConference = ls?.pbaConference ?? 'philippine';
  const confPhase: string = ls?.pbaConferencePhase ?? 'setup';
  const champions: any[] = ls?.pbaConferenceChampions ?? [];
  const season = ls?.year ?? new Date().getFullYear();
  const meta = CONFERENCE_META[conference];

  const userTeam = useMemo(() => {
    if (state.userTeamId == null) return null;
    return resolveAnyTeam(state.userTeamId, state.teams, (state as any).nonNBATeams ?? []);
  }, [state.userTeamId, state.teams, (state as any).nonNBATeams]);

  const pbaTeams = useMemo(() => {
    return ((state as any).nonNBATeams ?? []).filter((t: any) => t.tid >= 2000 && t.tid < 2100);
  }, [(state as any).nonNBATeams]);

  const pbaPlayers = useMemo(() => {
    return state.players.filter(p => p.tid >= 2000 && p.tid < 2100);
  }, [state.players]);

  const standings = useMemo(() => {
    const specId = meta.spec.id;
    const games = (state.schedule ?? []).filter((g: any) => g.competitionId === specId && g.played);
    const record = new Map<number, { w: number; l: number }>();
    for (const t of pbaTeams) record.set(t.tid, { w: 0, l: 0 });
    for (const g of games) {
      const home = record.get(g.homeTid);
      const away = record.get(g.awayTid);
      if (g.homeScore > g.awayScore) { if (home) home.w++; if (away) away.l++; }
      else if (g.awayScore > g.homeScore) { if (away) away.w++; if (home) home.l++; }
    }
    return [...record.entries()]
      .map(([tid, rec]) => ({ tid, ...rec, team: pbaTeams.find((t: any) => t.tid === tid) }))
      .sort((a, b) => {
        const pctA = a.w + a.l > 0 ? a.w / (a.w + a.l) : 0;
        const pctB = b.w + b.l > 0 ? b.w / (b.w + b.l) : 0;
        return pctB - pctA || b.w - a.w;
      });
  }, [state.schedule, conference, pbaTeams]);

  const leaders = useMemo(() => {
    return pbaPlayers
      .filter(p => (p.stats?.length ?? 0) > 0)
      .map(p => {
        const s = p.stats![p.stats!.length - 1];
        const gp = s.gp ?? 1;
        return { player: p, ppg: (s.pts ?? 0) / gp, rpg: (s.trb ?? 0) / gp, apg: (s.ast ?? 0) / gp };
      })
      .sort((a, b) => b.ppg - a.ppg)
      .slice(0, 5);
  }, [pbaPlayers]);

  const upcoming = useMemo(() => {
    return (state.schedule ?? [])
      .filter((g: any) => g.competitionId === meta.spec.id && !g.played)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6);
  }, [state.schedule, conference]);

  const isCurrent = conference === currentConf;
  const confOrder = CONFERENCE_ORDER.indexOf(conference);
  const currentOrder = CONFERENCE_ORDER.indexOf(currentConf);
  const champion = champions.find(c => c.conference === conference && c.season === season);
  const isCompleted = confOrder < currentOrder || (confOrder === currentOrder && confPhase === 'complete');
  const isFuture = confOrder > currentOrder;

  const importRule = meta.spec.importRule;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6" style={{ scrollbarWidth: 'thin' }}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{meta.emoji}</span>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">{meta.label}</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Season {season}
                {isCurrent && confPhase !== 'setup' && ` — ${confPhase}`}
                {isCompleted && ' — Complete'}
                {isFuture && ' — Upcoming'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isCurrent && confPhase === 'complete' && (
              <button
                onClick={() => dispatchAction({ type: 'ADVANCE_PBA_CONFERENCE', payload: {} })}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
              >
                {currentConf === 'governors' ? 'Start End-of-Season Tasks' : 'Start Conference Break'}
              </button>
            )}
            {isCurrent && confPhase === 'offseason' && (
              <span className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-lg">
                {currentConf === 'governors' ? 'End-of-Season' : 'Conference Break'}
              </span>
            )}
            {userTeam && (
              <div className="flex items-center gap-2">
                {(userTeam as any).imgURL && <img src={(userTeam as any).imgURL} alt="" className="w-7 h-7 object-contain" />}
                <span className="text-sm font-bold text-white hidden md:inline">{(userTeam as any).name ?? 'My Team'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Future conference placeholder */}
        {isFuture && (
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 text-center space-y-4">
            <span className="text-4xl">{meta.emoji}</span>
            <h3 className="text-lg font-black text-white uppercase">{meta.label}</h3>
            <p className="text-sm text-slate-400">
              Starts {months[(meta.spec.seasonStart.month ?? 1) - 1]} {meta.spec.seasonStart.day}
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 rounded-xl">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-300 uppercase">
                {importRule === 'none' ? 'All-Filipino — No Imports'
                  : importRule === 'one_no_height_limit' ? '1 Import — No Height Limit'
                  : "1 Import — Max 6'5\""}
              </span>
            </div>
            <p className="text-xs text-slate-600">This conference starts after the current one finishes.</p>
          </div>
        )}

        {/* Completed conference */}
        {isCompleted && (
          <div className="bg-slate-900/40 border border-amber-500/20 rounded-2xl p-8 text-center space-y-3">
            <span className="text-4xl">🏆</span>
            <h3 className="text-lg font-black text-white uppercase">{meta.label} — Complete</h3>
            {champion ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-amber-400">Champion: {champion.teamName}</p>
                {champion.finalsMvpName && <p className="text-xs text-slate-400">Finals MVP: {champion.finalsMvpName}</p>}
                {champion.bestPlayerName && <p className="text-xs text-slate-400">Best Player: {champion.bestPlayerName}</p>}
                {champion.bestImportName && <p className="text-xs text-slate-400">Best Import: {champion.bestImportName}</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Conference completed.</p>
            )}
          </div>
        )}

        {/* Active conference content */}
        {isCurrent && !isCompleted && (
          <>
            {/* Import Rule Badge */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/40 border border-slate-800/50 rounded-xl">
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Import Rule</span>
              <span className="text-xs font-bold text-white px-2 py-0.5 bg-slate-800 rounded-lg">
                {importRule === 'none' ? 'All-Filipino'
                  : importRule === 'one_no_height_limit' ? '1 Import (No Height Limit)'
                  : "1 Import (≤6'5\")"}
              </span>
            </div>

            {/* Standings */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/50 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Standings</h3>
              </div>
              <div className="divide-y divide-slate-800/30">
                {standings.map((row, i) => {
                  const pct = row.w + row.l > 0 ? (row.w / (row.w + row.l)).toFixed(3) : '.000';
                  const isUser = row.tid === state.userTeamId;
                  return (
                    <div key={row.tid} className={`flex items-center px-4 py-2 ${isUser ? 'bg-indigo-500/5' : 'hover:bg-white/[0.02]'}`}>
                      <span className="w-6 text-xs font-bold text-slate-600">{i + 1}</span>
                      {row.team?.imgURL && <img src={row.team.imgURL} alt="" className="w-5 h-5 object-contain mr-2" />}
                      <span className={`flex-1 text-sm font-medium truncate ${isUser ? 'text-indigo-300' : 'text-white'}`}>
                        {row.team?.name ?? `Team ${row.tid}`}
                      </span>
                      <span className="w-10 text-xs font-bold text-slate-400 text-center">{row.w}</span>
                      <span className="w-10 text-xs font-bold text-slate-400 text-center">{row.l}</span>
                      <span className="w-14 text-xs font-mono text-slate-500 text-right">{pct}</span>
                    </div>
                  );
                })}
                {standings.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-slate-600">No games played yet.</div>
                )}
              </div>
            </div>

            {/* Upcoming Games */}
            {upcoming.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/50 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Upcoming</h3>
                </div>
                <div className="divide-y divide-slate-800/30">
                  {upcoming.map((g: any, i: number) => {
                    const home = pbaTeams.find((t: any) => t.tid === g.homeTid);
                    const away = pbaTeams.find((t: any) => t.tid === g.awayTid);
                    const d = new Date(g.date);
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <div key={i} className="flex items-center px-4 py-2">
                        <span className="w-16 text-[10px] font-bold text-slate-600 uppercase">{dateStr}</span>
                        <span className="flex-1 text-xs font-medium text-slate-300 truncate">
                          {away?.name ?? '?'} @ {home?.name ?? '?'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Import Tracker for import conferences */}
            {conference !== 'philippine' && <PBAImportTracker />}

            {/* Leaders */}
            {leaders.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/50 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">Leaders</h3>
                </div>
                <div className="px-4 py-1.5 flex items-center text-[9px] font-black text-slate-600 uppercase tracking-widest">
                  <span className="flex-1">Player</span>
                  <span className="w-14 text-center">PPG</span>
                  <span className="w-14 text-center">RPG</span>
                  <span className="w-14 text-center">APG</span>
                </div>
                <div className="divide-y divide-slate-800/30">
                  {leaders.map((l, i) => (
                    <div key={i} className="flex items-center px-4 py-2">
                      <span className="flex-1 text-sm font-medium text-white truncate">{l.player.name}</span>
                      <span className="text-xs text-slate-400 w-14 text-center">{l.ppg.toFixed(1)}</span>
                      <span className="text-xs text-slate-500 w-14 text-center">{l.rpg.toFixed(1)}</span>
                      <span className="text-xs text-slate-500 w-14 text-center">{l.apg.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
