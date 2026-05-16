import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Shield, Crown, Calendar, Users, TrendingUp } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { PBA_COMPETITIONS } from '../../data/templates/philippines/competitions';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { convertTo2KRating } from '../../utils/helpers';
import type { CompetitionSpec } from '../../services/competition/types';
import type { NBAPlayer } from '../../types';
import { PBAImportTracker } from './PBAImportTracker';

type PbaConference = 'philippine' | 'commissioners' | 'governors';

const CONFERENCE_META: Record<PbaConference, { spec: CompetitionSpec; icon: React.ReactNode; label: string }> = {
  philippine: {
    spec: PBA_COMPETITIONS[0],
    icon: <Shield className="w-4 h-4" />,
    label: 'Philippine Cup',
  },
  commissioners: {
    spec: PBA_COMPETITIONS[1],
    icon: <Trophy className="w-4 h-4" />,
    label: "Commissioner's Cup",
  },
  governors: {
    spec: PBA_COMPETITIONS[2],
    icon: <Crown className="w-4 h-4" />,
    label: "Governors' Cup",
  },
};

const CONFERENCE_ORDER: PbaConference[] = ['philippine', 'commissioners', 'governors'];

type TabState = 'current' | 'completed' | 'future';

function getTabState(conf: PbaConference, currentConf: PbaConference | undefined, phase: string | undefined, champions: any[] | undefined): TabState {
  const order = CONFERENCE_ORDER.indexOf(conf);
  const currentOrder = CONFERENCE_ORDER.indexOf(currentConf ?? 'philippine');
  if (conf === currentConf) return 'current';
  if (order < currentOrder) {
    const hasChampion = champions?.some(c => c.conference === conf);
    return hasChampion ? 'completed' : 'current';
  }
  return 'future';
}

export const PBAHubView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const ls = state.leagueStats as any;
  const currentConf: PbaConference = ls?.pbaConference ?? 'philippine';
  const confPhase: string = ls?.pbaConferencePhase ?? 'setup';
  const champions: any[] = ls?.pbaConferenceChampions ?? [];
  const season = ls?.year ?? new Date().getFullYear();

  const [activeTab, setActiveTab] = useState<PbaConference>(currentConf);

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

  // Standings: W-L from boxScores for the active conference's competition
  const standings = useMemo(() => {
    const specId = CONFERENCE_META[activeTab].spec.id;
    const games = (state.schedule ?? []).filter((g: any) => g.competitionId === specId && g.played);
    const record = new Map<number, { w: number; l: number }>();
    for (const t of pbaTeams) {
      record.set(t.tid, { w: 0, l: 0 });
    }
    for (const g of games) {
      const home = record.get(g.homeTid);
      const away = record.get(g.awayTid);
      if (g.homeScore > g.awayScore) {
        if (home) home.w++;
        if (away) away.l++;
      } else if (g.awayScore > g.homeScore) {
        if (away) away.w++;
        if (home) home.l++;
      }
    }
    return [...record.entries()]
      .map(([tid, rec]) => {
        const team = pbaTeams.find((t: any) => t.tid === tid);
        return { tid, ...rec, team };
      })
      .sort((a, b) => {
        const pctA = a.w + a.l > 0 ? a.w / (a.w + a.l) : 0;
        const pctB = b.w + b.l > 0 ? b.w / (b.w + b.l) : 0;
        return pctB - pctA || b.w - a.w;
      });
  }, [state.schedule, activeTab, pbaTeams]);

  // Leaders
  const leaders = useMemo(() => {
    const scored = pbaPlayers
      .filter(p => (p.stats?.length ?? 0) > 0)
      .map(p => {
        const s = p.stats![p.stats!.length - 1];
        return { player: p, ppg: s.pts ?? 0, rpg: s.trb ?? 0, apg: s.ast ?? 0 };
      })
      .sort((a, b) => b.ppg - a.ppg);
    return scored.slice(0, 5);
  }, [pbaPlayers]);

  const tabState = getTabState(activeTab, currentConf, confPhase, champions);
  const meta = CONFERENCE_META[activeTab];
  const champion = champions.find(c => c.conference === activeTab && c.season === season);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6" style={{ scrollbarWidth: 'thin' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">PBA Hub</h1>
            <p className="text-sm text-slate-500 font-medium mt-0.5">
              Season {season} — {CONFERENCE_META[currentConf].label}
              {confPhase !== 'setup' && ` (${confPhase})`}
            </p>
          </div>
          {confPhase === 'complete' && (
            <button
              onClick={() => dispatchAction({ type: 'ADVANCE_PBA_CONFERENCE', payload: {} })}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors"
            >
              {currentConf === 'governors' ? 'Start End-of-Season Tasks' : 'Start Conference Break'}
            </button>
          )}
          {confPhase === 'offseason' && (
            <span className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-lg">
              {currentConf === 'governors' ? 'End-of-Season' : 'Conference Break'}
            </span>
          )}
          {userTeam && (
            <div className="flex items-center gap-2">
              {(userTeam as any).imgURL && (
                <img src={(userTeam as any).imgURL} alt="" className="w-8 h-8 object-contain" />
              )}
              <span className="text-sm font-bold text-white">{(userTeam as any).name ?? 'My Team'}</span>
            </div>
          )}
        </div>

        {/* Conference Tabs */}
        <div className="flex gap-1 p-1 bg-slate-900/60 rounded-2xl border border-slate-800/50">
          {CONFERENCE_ORDER.map(conf => {
            const m = CONFERENCE_META[conf];
            const isActive = activeTab === conf;
            const isCurrent = conf === currentConf;
            const ts = getTabState(conf, currentConf, confPhase, champions);
            return (
              <button
                key={conf}
                onClick={() => setActiveTab(conf)}
                className={`relative flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-white/10 text-white shadow-lg'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                {m.icon}
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sm:hidden">{m.label.split(' ')[0]}</span>
                {isCurrent && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {ts === 'completed' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {tabState === 'future' && (
              <FutureTab conf={activeTab} meta={meta} />
            )}
            {tabState === 'completed' && (
              <CompletedTab conf={activeTab} meta={meta} champion={champion} />
            )}
            {tabState === 'current' && (
              <CurrentTab
                conf={activeTab}
                meta={meta}
                standings={standings}
                leaders={leaders}
                schedule={state.schedule ?? []}
                pbaTeams={pbaTeams}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

const FutureTab: React.FC<{ conf: PbaConference; meta: typeof CONFERENCE_META['philippine'] }> = ({ conf, meta }) => {
  const importRule = meta.spec.importRule;
  const startMonth = meta.spec.seasonStart.month;
  const startDay = meta.spec.seasonStart.day;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">{conf === 'commissioners' ? '🏆' : '👑'}</div>
        <h3 className="text-lg font-black text-white uppercase">{meta.label}</h3>
        <p className="text-sm text-slate-400 mt-2">
          Starts {months[startMonth - 1]} {startDay}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 rounded-xl">
          <Users className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-300 uppercase">
            {importRule === 'none'
              ? 'All-Filipino — No Imports'
              : importRule === 'one_no_height_limit'
                ? '1 Import — No Height Limit'
                : "1 Import — Max 6'5\""}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-4">
          This conference starts after the current one finishes.
        </p>
      </div>
    </div>
  );
};

const CompletedTab: React.FC<{ conf: PbaConference; meta: typeof CONFERENCE_META['philippine']; champion?: any }> = ({ conf, meta, champion }) => {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900/40 border border-amber-500/20 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">🏆</div>
        <h3 className="text-lg font-black text-white uppercase">{meta.label} — Complete</h3>
        {champion ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-bold text-amber-400">Champion: {champion.teamName}</p>
            {champion.finalsMvpId && (
              <p className="text-xs text-slate-400">Finals MVP: {champion.finalsMvpId}</p>
            )}
            {champion.bestPlayerId && (
              <p className="text-xs text-slate-400">Best Player: {champion.bestPlayerId}</p>
            )}
            {champion.bestImportId && (
              <p className="text-xs text-slate-400">Best Import: {champion.bestImportId}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500 mt-3">Conference completed. No champion data recorded.</p>
        )}
      </div>
    </div>
  );
};

const CurrentTab: React.FC<{
  conf: PbaConference;
  meta: typeof CONFERENCE_META['philippine'];
  standings: Array<{ tid: number; w: number; l: number; team: any }>;
  leaders: Array<{ player: NBAPlayer; ppg: number; rpg: number; apg: number }>;
  schedule: any[];
  pbaTeams: any[];
}> = ({ conf, meta, standings, leaders, schedule, pbaTeams }) => {
  const specId = meta.spec.id;
  const upcoming = schedule
    .filter((g: any) => g.competitionId === specId && !g.played)
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 6);

  const importRule = meta.spec.importRule;

  return (
    <div className="space-y-5">
      {/* Import Rule Badge */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/40 border border-slate-800/50 rounded-xl">
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Import Rule</span>
        <span className="text-xs font-bold text-white px-2 py-0.5 bg-slate-800 rounded-lg">
          {importRule === 'none'
            ? 'All-Filipino'
            : importRule === 'one_no_height_limit'
              ? '1 Import (No Height Limit)'
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
            const teamName = row.team?.name ?? `Team ${row.tid}`;
            return (
              <div key={row.tid} className="flex items-center px-4 py-2 hover:bg-white/[0.02]">
                <span className="w-6 text-xs font-bold text-slate-600">{i + 1}</span>
                {row.team?.imgURL && (
                  <img src={row.team.imgURL} alt="" className="w-5 h-5 object-contain mr-2" />
                )}
                <span className="flex-1 text-sm font-medium text-white truncate">{teamName}</span>
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
              const dateStr = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
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

      {/* Import Tracker — only for import conferences */}
      {conf !== 'philippine' && <PBAImportTracker />}

      {/* Leaders */}
      {leaders.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/50 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black text-white uppercase tracking-widest">Leaders</h3>
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
    </div>
  );
};
