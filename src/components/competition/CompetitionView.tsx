import React, { useMemo } from 'react';
import type { GameState } from '../../types';
import { useGame } from '../../store/GameContext';
import { getTeamFullName } from '../../utils/teamNames';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { cn } from '../../lib/utils';
import { selectCompetitionTeamTids } from '../../services/competition/competitionScheduler';
import { isPbaCompetitionId, selectCountedPbaRegularBoxScores } from '../../services/pba/competitionGames';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { TimeService } from '../../services/time/TimeService';
import {
  competitionBoundaryForSeed,
  competitionZoneForSeed,
  getCompetitionQualificationZones,
} from '../../services/competition/competitionStandings';

type CompetitionRow = {
  tid: number;
  w: number;
  l: number;
  pf: number;
  pa: number;
  homeW: number;
  homeL: number;
  awayW: number;
  awayL: number;
  results: boolean[];
};

const emptyRow = (tid: number): CompetitionRow => ({
  tid,
  w: 0,
  l: 0,
  pf: 0,
  pa: 0,
  homeW: 0,
  homeL: 0,
  awayW: 0,
  awayL: 0,
  results: [],
});

export const buildCompetitionRows = (
  seedTids: number[],
  boxScores: GameState['boxScores'],
): CompetitionRow[] => {
  const acc = new Map<number, CompetitionRow>();
  seedTids.forEach(tid => acc.set(tid, emptyRow(tid)));
  [...boxScores].sort((a, b) => TimeService.compare(a.date, b.date)).forEach(b => {
    const home = acc.get(b.homeTeamId) ?? emptyRow(b.homeTeamId);
    const away = acc.get(b.awayTeamId) ?? emptyRow(b.awayTeamId);
    const homeWon = didHomeTeamWin(b);
    home.w += homeWon ? 1 : 0; home.l += homeWon ? 0 : 1; home.pf += b.homeScore; home.pa += b.awayScore;
    home.homeW += homeWon ? 1 : 0; home.homeL += homeWon ? 0 : 1; home.results.push(homeWon);
    away.w += homeWon ? 0 : 1; away.l += homeWon ? 1 : 0; away.pf += b.awayScore; away.pa += b.homeScore;
    away.awayW += homeWon ? 0 : 1; away.awayL += homeWon ? 1 : 0; away.results.push(!homeWon);
    acc.set(home.tid, home); acc.set(away.tid, away);
  });
  return [...acc.values()].sort((a, b) => {
    const aGames = a.w + a.l;
    const bGames = b.w + b.l;
    const aPct = aGames ? a.w / aGames : 0;
    const bPct = bGames ? b.w / bGames : 0;
    return bPct - aPct || b.w - a.w || (b.pf - b.pa) - (a.pf - a.pa);
  });
};

const formatCompetitionFormat = (format: string) =>
  format
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

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
    return buildCompetitionRows(seedTids, seasonBoxScores);
  }, [seedTids, seasonBoxScores]);

  if (!spec) return <div className="p-8 text-slate-500">Competition not active in this save.</div>;

  const qualificationZones = getCompetitionQualificationZones(spec, currentSeason);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-950 px-5 py-4" style={{ boxShadow: `inset 0 1px 0 ${spec.accentColor}55` }}>
        <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: spec.accentColor }}>{spec.shortName}</div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mt-1">
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">{spec.displayName}</h1>
          <p className="text-xs text-slate-500">{formatCompetitionFormat(spec.format)} · {spec.gamesPerTeam ? `${spec.gamesPerTeam} games per club` : 'Knockout'}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 text-xs font-black uppercase tracking-widest text-slate-400">
            {spec.format === 'regular-league' ? 'League Table' : 'Competition Table'}
          </div>
          <div className="overflow-x-auto">
          <table className="block w-full text-sm md:table md:min-w-[980px]">
            <thead className="hidden bg-slate-900/60 text-[10px] uppercase tracking-widest text-slate-400 md:table-header-group [&_th]:px-2">
              <tr>
                <th className="text-left px-4 py-2">Team</th>
                <th>GP</th><th>W</th><th>L</th><th>PCT</th><th>PTS</th>
                <th>Home</th><th>Away</th><th>L10</th><th>Streak</th>
                <th>PF/G</th><th>PA/G</th><th>Diff</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {rows.map((row, index) => {
                const team = resolveAnyTeam(row.tid, state.teams, state.nonNBATeams ?? []);
                const logoUrl = (team as any)?.logoUrl ?? (team as any)?.imgURL;
                const isOwn = row.tid === state.userTeamId;
                const zone = competitionZoneForSeed(qualificationZones, index + 1);
                const boundary = competitionBoundaryForSeed(qualificationZones, index + 1);
                const boundaryColor = boundary?.kind === 'relegation'
                  ? boundary.color
                  : boundary ? '#facc15' : undefined;
                const games = row.w + row.l;
                const last10 = row.results.slice(-10);
                const last10Wins = last10.filter(Boolean).length;
                const latest = row.results.at(-1);
                let streak = 0;
                for (let resultIndex = row.results.length - 1; resultIndex >= 0 && row.results[resultIndex] === latest; resultIndex -= 1) streak += 1;
                return (
                  <tr
                    key={row.tid}
                    className={cn(
                      'grid grid-cols-4 pb-3 md:table-row md:pb-0',
                      boundaryColor ? "border-t-2 text-slate-200" : "border-t border-slate-900 text-slate-200",
                      isOwn ? "bg-amber-500/10 text-white" : "hover:bg-slate-900/60",
                    )}
                    style={{
                      borderTopColor: boundaryColor,
                      boxShadow: zone ? `inset 2px 0 0 ${zone.color}` : undefined,
                    }}
                  >
                    <td className="col-span-4 px-4 py-3 font-bold">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 tabular-nums w-5 text-right shrink-0">{index + 1}</span>
                        {logoUrl ? (
                          <img src={logoUrl} alt="" className="w-6 h-6 object-contain shrink-0" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-slate-800 shrink-0" />
                        )}
                        <span className="min-w-0 break-words md:whitespace-nowrap">{getTeamFullName(team)}</span>
                      </div>
                    </td>
                    {[
                      ['GP', games], ['W', row.w], ['L', row.l],
                      ['PCT', games ? (row.w / games).toFixed(3).replace(/^0/, '') : '.000'],
                      ['PTS', row.w * 2 + row.l],
                      ['Home', `${row.homeW}-${row.homeL}`], ['Away', `${row.awayW}-${row.awayL}`],
                      ['L10', `${last10Wins}-${last10.length - last10Wins}`],
                      ['Streak', latest == null ? '—' : `${latest ? 'W' : 'L'}${streak}`],
                      ['PF/G', games ? (row.pf / games).toFixed(1) : '0.0'],
                      ['PA/G', games ? (row.pa / games).toFixed(1) : '0.0'],
                      ['Diff', games ? `${row.pf - row.pa > 0 ? '+' : ''}${((row.pf - row.pa) / games).toFixed(1)}` : '0.0'],
                    ].map(([label, value]) => (
                      <td key={label} className={cn('px-2 py-1 text-center tabular-nums',
                        label === 'Streak' && (latest === true ? 'text-emerald-400' : latest === false ? 'text-rose-400' : ''),
                        label === 'Diff' && (row.pf > row.pa ? 'text-emerald-400' : row.pf < row.pa ? 'text-rose-400' : ''),
                      )}>
                        <span className="block text-[10px] font-medium text-slate-400 md:hidden">{label}</span>
                        {value}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={13} className="px-4 py-8 text-center text-slate-500">No clubs loaded for this competition.</td></tr>}
            </tbody>
          </table>
          </div>
          {qualificationZones.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-800 px-4 py-3">
              {qualificationZones.map(zone => (
                <div key={`${zone.kind}-${zone.from}-${zone.to}`} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: zone.color }} />
                  {zone.label} · {zone.from}{zone.to !== zone.from ? `–${zone.to}` : ''}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};
