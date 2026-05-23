import React, { useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { cn } from '../../lib/utils';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';

type CompetitionRow = { tid: number; w: number; l: number; pf: number; pa: number };

const formatCompetitionFormat = (format: string) =>
  format
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const qualificationLabel = (specId: string, seed: number) => {
  if (specId === 'euroleague') {
    if (seed <= 6) return { text: 'Playoffs', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' };
    if (seed <= 10) return { text: 'Play-In', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' };
    return { text: 'Out', tone: 'text-slate-500 bg-slate-800/40 border-slate-700' };
  }
  if (specId === 'endesa') {
    if (seed <= 8) return { text: 'Playoffs', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' };
    return { text: 'Out', tone: 'text-slate-500 bg-slate-800/40 border-slate-700' };
  }
  if (seed <= 8) return { text: 'Qualified', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' };
  return { text: 'Chasing', tone: 'text-slate-500 bg-slate-800/40 border-slate-700' };
};

export const CompetitionView: React.FC<{ specId: string }> = ({ specId }) => {
  const { state } = useGame();
  const spec = state.activeCompetitions?.find(c => c.id === specId);
  const seedTids = useMemo(() => {
    if (!spec) return [];
    return selectCompetitionTeamTids(spec, state);
  }, [spec, state]);

  const rows = useMemo<CompetitionRow[]>(() => {
    const acc = new Map<number, CompetitionRow>();
    seedTids.forEach(tid => acc.set(tid, { tid, w: 0, l: 0, pf: 0, pa: 0 }));
    state.boxScores
      .filter(b => b.competitionId === specId)
      .forEach(b => {
        const home = acc.get(b.homeTeamId) ?? { tid: b.homeTeamId, w: 0, l: 0, pf: 0, pa: 0 };
        const away = acc.get(b.awayTeamId) ?? { tid: b.awayTeamId, w: 0, l: 0, pf: 0, pa: 0 };
        const homeWon = b.homeScore > b.awayScore;
        home.w += homeWon ? 1 : 0; home.l += homeWon ? 0 : 1; home.pf += b.homeScore; home.pa += b.awayScore;
        away.w += homeWon ? 0 : 1; away.l += homeWon ? 1 : 0; away.pf += b.awayScore; away.pa += b.homeScore;
        acc.set(home.tid, home); acc.set(away.tid, away);
      });
    return [...acc.values()].sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
  }, [specId, state.boxScores, seedTids]);

  if (!spec) return <div className="p-8 text-slate-500">Competition not active in this save.</div>;

  const playedGames = state.boxScores.filter(b => b.competitionId === specId);
  const remainingGames = state.schedule.filter(g => g.competitionId === specId && !g.played).length;
  const currency = spec.prizePool?.currency ?? state.leagueStats?.currency ?? 'EUR';
  const prizeItems: Array<[string, number]> = [];
  if (spec.prizePool?.groupParticipation) prizeItems.push(['Participation', spec.prizePool.groupParticipation]);
  if (spec.prizePool?.winner) prizeItems.push(['Winner', spec.prizePool.winner]);
  if (spec.prizePool?.runnerUp) prizeItems.push(['Runner-up', spec.prizePool.runnerUp]);
  if (spec.prizePool?.semi) prizeItems.push(['Semifinalist', spec.prizePool.semi]);
  if (spec.prizePool?.qf) prizeItems.push(['Quarterfinalist', spec.prizePool.qf]);

  const recentResults = [...playedGames]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 5);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-950 p-6" style={{ boxShadow: `inset 0 1px 0 ${spec.accentColor}55` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: spec.accentColor }}>{spec.shortName}</div>
        <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white mt-2">{spec.displayName}</h1>
        <p className="text-sm text-slate-400 mt-2">{formatCompetitionFormat(spec.format)} · {spec.gamesPerTeam ? `${spec.gamesPerTeam} games per team` : 'knockout format'}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Teams</div>
            <div className="text-2xl font-black text-white mt-1">{rows.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Played</div>
            <div className="text-2xl font-black text-white mt-1">{playedGames.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Remaining</div>
            <div className="text-2xl font-black text-white mt-1">{remainingGames}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Champion Prize</div>
            <div className="text-xl font-black text-amber-300 mt-1">
              {spec.prizePool?.winner ? formatCurrencyWithCode(spec.prizePool.winner, currency, false) : 'TBD'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
            {spec.format === 'regular-league' ? 'League Table' : 'Competition Table'}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-500">
              <tr><th className="text-left px-4 py-2">Team</th><th>W</th><th>L</th><th>Pts</th><th>Diff</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const team = resolveAnyTeam(row.tid, state.teams, state.nonNBATeams ?? []);
                const isOwn = row.tid === state.userTeamId;
                const status = qualificationLabel(specId, index + 1);
                return (
                  <tr
                    key={row.tid}
                    className={cn(
                      "border-t border-slate-900 text-slate-200",
                      isOwn ? "bg-amber-500/10 text-white" : "hover:bg-slate-900/60",
                    )}
                  >
                    <td className="px-4 py-3 font-bold">
                      <span className="text-slate-500 mr-3 tabular-nums">{index + 1}</span>
                      {getTeamFullName(team)}
                    </td>
                    <td className="text-center">{row.w}</td>
                    <td className="text-center">{row.l}</td>
                    <td className="text-center">{row.w * 2 + row.l}</td>
                    <td className="text-center">{row.pf - row.pa}</td>
                    <td className="text-center">
                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest", status.tone)}>
                        {status.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No clubs loaded for this competition.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          {prizeItems.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">Prize Pool</div>
              <div className="divide-y divide-slate-900">
                {prizeItems.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-bold text-slate-300">{label}</span>
                    <span className="font-black text-amber-300">{formatCurrencyWithCode(value, currency, false)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">Recent Results</div>
            <div className="divide-y divide-slate-900">
              {recentResults.map(game => {
                const home = resolveAnyTeam(game.homeTeamId, state.teams, state.nonNBATeams ?? []);
                const away = resolveAnyTeam(game.awayTeamId, state.teams, state.nonNBATeams ?? []);
                return (
                  <div key={game.gameId} className="px-4 py-3 text-xs text-slate-300">
                    <div className="font-bold text-white">{getTeamFullName(away)} {game.awayScore} · {getTeamFullName(home)} {game.homeScore}</div>
                    <div className="text-slate-600 mt-1">{String(game.date).slice(0, 10)}</div>
                  </div>
                );
              })}
              {recentResults.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">No results yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};