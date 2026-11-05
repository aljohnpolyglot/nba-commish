import React, { useMemo } from 'react';
import type { CompetitionStanding } from '../../services/competition/competitionResolver';
import { getTeamFullName } from '../../utils/teamNames';
import { getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { rankCompetitionStandings } from '../../services/competition/competitionStandings';
import type { CompetitionSpec } from '../../services/competition/types';
import type { GameResult } from '../../types';

type TeamLike = {
  id?: number;
  tid?: number;
  name?: string;
  region?: string;
  abbrev?: string;
  logoUrl?: string;
  imgURL?: string;
};

interface Props {
  groupCount: number;
  seedTids: number[];
  standings: CompetitionStanding[];
  teams: TeamLike[];
  qualifierCount?: number;
  accentColor: string;
  ownTid: number | null;
  spec: CompetitionSpec;
  season: number;
  games: GameResult[];
}

export const CompetitionGroupStandings: React.FC<Props> = ({
  groupCount,
  seedTids,
  standings,
  teams,
  qualifierCount = 4,
  accentColor,
  ownTid,
  spec,
  season,
  games,
}) => {
  const groups = useMemo(() => {
    const rowsByTid = new Map(standings.map(row => [row.tid, row]));
    const buckets = Array.from({ length: groupCount }, () => [] as CompetitionStanding[]);
    seedTids.forEach((tid, index) => {
      const row = rowsByTid.get(tid);
      if (row) buckets[index % groupCount].push(row);
    });
    return buckets.map(rows => rankCompetitionStandings(rows, games, spec, season));
  }, [games, groupCount, seedTids, season, spec, standings]);

  const teamsByTid = useMemo(() => new Map(teams.map(team => [Number(team.id ?? team.tid), team])), [teams]);
  const qualifiersPerGroup = Math.max(1, Math.floor(qualifierCount / Math.max(1, groupCount)));

  return (
    <section className="space-y-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: accentColor }}>Group Stage</div>
        <h2 className="mt-1 text-lg font-black uppercase tracking-tight text-white">Road to the knockout bracket</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((rows, groupIndex) => (
          <div key={groupIndex} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <div className="border-b border-slate-800 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400">
              Group {String.fromCharCode(65 + groupIndex)}
            </div>
            <div className="grid grid-cols-[24px_minmax(0,1fr)_32px_32px_46px] gap-2 border-b border-slate-900 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600">
              <span />
              <span>Club</span>
              <span className="text-right">W</span>
              <span className="text-right">L</span>
              <span className="text-right">Diff</span>
            </div>
            <div className="divide-y divide-slate-900">
              {rows.map((row, rowIndex) => {
                const team = teamsByTid.get(row.tid);
                const logoUrl = team ? getResolvedTeamLogoUrl(team as any) : undefined;
                const qualified = rowIndex < qualifiersPerGroup;
                const startsOutsideQualification = rowIndex === qualifiersPerGroup;
                return (
                  <div
                    key={row.tid}
                    className={`grid grid-cols-[24px_minmax(0,1fr)_32px_32px_46px] items-center gap-2 px-3 py-2.5 text-xs ${startsOutsideQualification ? 'border-t-2 border-t-yellow-400' : ''} ${
                      row.tid === ownTid ? 'bg-amber-500/10 text-white' : 'text-slate-300'
                    }`}
                  >
                    <span className="text-right font-mono text-slate-600">{rowIndex + 1}</span>
                    <div className="flex min-w-0 items-center gap-2">
                      {logoUrl ? <img src={logoUrl} alt="" className="h-5 w-5 shrink-0 object-contain" referrerPolicy="no-referrer" /> : <span className="h-5 w-5 shrink-0 rounded bg-slate-800" />}
                      <span className="truncate font-bold">{team ? getTeamFullName(team as any) : `Team ${row.tid}`}</span>
                      {qualified && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} title="Qualifying place" />}
                    </div>
                    <span className="text-right tabular-nums">{row.wins}</span>
                    <span className="text-right tabular-nums text-slate-500">{row.losses}</span>
                    <span className={`text-right tabular-nums ${row.pointDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.pointDiff > 0 ? '+' : ''}{row.pointDiff}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
