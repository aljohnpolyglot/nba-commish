import React, { useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { cn } from '../../lib/utils';
import { formatCurrencyWithCode, normalizeDate } from '../../utils/helpers';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { isPbaCompetitionId, selectCountedPbaRegularBoxScores } from '../../services/pba/competitionGames';

type CompetitionRow = { tid: number; w: number; l: number; pf: number; pa: number };

const formatCompetitionFormat = (format: string) =>
  format
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const quarterfinalFormatLabel = (spec: NonNullable<ReturnType<typeof useGame>['state']['activeCompetitions']>[number]) => {
  if (spec.playoffFormat?.qfFormat === 'twice-to-beat') return 'Twice to beat';
  const round = spec.playoffFormat?.qfBest ?? spec.playoffFormat?.finalBest ?? 1;
  return `Best of ${round}`;
};

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

  // Filter boxScores to ONLY the current season + regular-season phase. Without
  // this, multi-year saves accumulate W/L forever (Real Madrid 46-10 in Year 1
  // bug). Year-1 boxScores in older saves lack the `season` field — fall back
  // to a year regex on the date string (handles both ISO and US-locale dates).
  const currentSeason = state.leagueStats?.year ?? new Date().getFullYear();
  const extractYear = (date: any): number | null => {
    const m = String(date ?? '').match(/(20\d{2})/);
    return m ? Number(m[1]) : null;
  };
  const matchesSeason = (b: any): boolean => {
    if (typeof b.season === 'number') return b.season === currentSeason;
    const y = extractYear(b.date);
    // Endesa season ending in currentSeason spans (currentSeason-1) Sep → currentSeason Jun.
    // Without `season` we date-bucket strictly: only include if year matches.
    if (y == null) return false;
    return y === currentSeason || y === currentSeason - 1;
  };
  const isRegularPhase = (phase?: string): boolean =>
    !phase || phase === 'group' || phase.startsWith('r');
  const seasonBoxScores = useMemo(
    () => {
      if (spec && isPbaCompetitionId(spec.id)) {
        return selectCountedPbaRegularBoxScores(state.boxScores, spec, currentSeason);
      }
      return state.boxScores.filter(b =>
        b.competitionId === specId &&
        isRegularPhase(b.competitionPhase) &&
        matchesSeason(b),
      );
    },
    [spec, specId, state.boxScores, currentSeason],
  );

  const rows = useMemo<CompetitionRow[]>(() => {
    const acc = new Map<number, CompetitionRow>();
    seedTids.forEach(tid => acc.set(tid, { tid, w: 0, l: 0, pf: 0, pa: 0 }));
    seasonBoxScores.forEach(b => {
      const home = acc.get(b.homeTeamId) ?? { tid: b.homeTeamId, w: 0, l: 0, pf: 0, pa: 0 };
      const away = acc.get(b.awayTeamId) ?? { tid: b.awayTeamId, w: 0, l: 0, pf: 0, pa: 0 };
      const homeWon = b.homeScore > b.awayScore;
      home.w += homeWon ? 1 : 0; home.l += homeWon ? 0 : 1; home.pf += b.homeScore; home.pa += b.awayScore;
      away.w += homeWon ? 0 : 1; away.l += homeWon ? 1 : 0; away.pf += b.awayScore; away.pa += b.homeScore;
      acc.set(home.tid, home); acc.set(away.tid, away);
    });
    return [...acc.values()].sort((a, b) => b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa));
  }, [seedTids, seasonBoxScores]);

  if (!spec) return <div className="p-8 text-slate-500">Competition not active in this save.</div>;

  const playedGames = seasonBoxScores;
  const remainingGames = state.schedule.filter(g => g.competitionId === specId && !g.played).length;
  const currency = spec.prizePool?.currency ?? state.leagueStats?.currency ?? 'EUR';
  const prizeItems: Array<[string, number]> = [];
  if (spec.prizePool?.groupParticipation) prizeItems.push(['Participation', spec.prizePool.groupParticipation]);
  if (spec.prizePool?.winner) prizeItems.push(['Winner', spec.prizePool.winner]);
  if (spec.prizePool?.runnerUp) prizeItems.push(['Runner-up', spec.prizePool.runnerUp]);
  if (spec.prizePool?.semi) prizeItems.push(['Semifinalist', spec.prizePool.semi]);
  if (spec.prizePool?.qf) prizeItems.push(['Quarterfinalist', spec.prizePool.qf]);

  const knockoutSeeds = specId === 'euroleague'
    ? rows.slice(0, 8)
    : specId === 'endesa'
      ? rows.slice(0, 8)
      : rows.slice(0, spec.teamCount ?? 8);
  const qfPairings = knockoutSeeds.slice(0, 4).map((topSeed, index) => ({
    high: topSeed,
    low: knockoutSeeds[knockoutSeeds.length - 1 - index],
  })).filter(pair => pair.high && pair.low && pair.high.tid !== pair.low.tid);
  const playInRows = specId === 'euroleague' ? rows.slice(6, 10) : [];

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
                const logoUrl = (team as any)?.logoUrl ?? (team as any)?.imgURL;
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
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 tabular-nums w-5 text-right shrink-0">{index + 1}</span>
                        {logoUrl ? (
                          <img src={logoUrl} alt="" className="w-6 h-6 object-contain shrink-0" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-slate-800 shrink-0" />
                        )}
                        <span className="truncate">{getTeamFullName(team)}</span>
                      </div>
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
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">If Season Ended Today</div>
            <div className="p-4 space-y-3">
              {playInRows.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-2">Play-In Line</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                    {playInRows.map((row, index) => {
                      const team = resolveAnyTeam(row.tid, state.teams, state.nonNBATeams ?? []);
                      return <div key={row.tid} className="rounded-lg bg-black/30 px-2 py-1.5 font-bold">{index + 7}. {getTeamFullName(team)}</div>;
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {specId === 'euroleague' ? 'Quarterfinal Projection' : 'Playoff Projection'}
                </div>
                {qfPairings.map((pair, index) => {
                  const high = resolveAnyTeam(pair.high.tid, state.teams, state.nonNBATeams ?? []);
                  const low = resolveAnyTeam(pair.low.tid, state.teams, state.nonNBATeams ?? []);
                  return (
                    <div key={`${pair.high.tid}-${pair.low.tid}`} className="rounded-xl border border-slate-800 bg-black/30 p-3">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">Series {index + 1} - {quarterfinalFormatLabel(spec)}</div>
                      <div className="flex items-center justify-between gap-3 text-sm font-bold text-white">
                        <span>{getTeamFullName(high)}</span>
                        <span className="text-slate-600 text-xs">vs</span>
                        <span className="text-right">{getTeamFullName(low)}</span>
                      </div>
                    </div>
                  );
                })}
                {qfPairings.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-black/30 p-4 text-sm text-slate-500">
                    Projection appears once the competition has enough clubs.
                  </div>
                )}
              </div>
            </div>
          </div>

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
                const homeLogo = (home as any)?.logoUrl ?? (home as any)?.imgURL;
                const awayLogo = (away as any)?.logoUrl ?? (away as any)?.imgURL;
                const homeWon = game.homeScore > game.awayScore;
                return (
                  <div key={game.gameId} className="px-4 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      {awayLogo
                        ? <img src={awayLogo} alt="" className="w-5 h-5 object-contain shrink-0" referrerPolicy="no-referrer" />
                        : <div className="w-5 h-5 rounded bg-slate-800 shrink-0" />}
                      <span className={`font-bold truncate ${homeWon ? 'text-slate-400' : 'text-white'}`}>{getTeamFullName(away)}</span>
                      <span className={`ml-auto font-bold tabular-nums ${homeWon ? 'text-slate-400' : 'text-white'}`}>{game.awayScore}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {homeLogo
                        ? <img src={homeLogo} alt="" className="w-5 h-5 object-contain shrink-0" referrerPolicy="no-referrer" />
                        : <div className="w-5 h-5 rounded bg-slate-800 shrink-0" />}
                      <span className={`font-bold truncate ${homeWon ? 'text-white' : 'text-slate-400'}`}>{getTeamFullName(home)}</span>
                      <span className={`ml-auto font-bold tabular-nums ${homeWon ? 'text-white' : 'text-slate-400'}`}>{game.homeScore}</span>
                    </div>
                    <div className="text-slate-600 mt-2 text-[10px] font-mono">{normalizeDate(game.date)}</div>
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
