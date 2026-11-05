import { useMemo } from 'react';
import type { NBAPlayer, NBATeam, NonNBATeam, PlayerDisciplineRecord } from '../../../types';
import { useGame } from '../../../store/GameContext';
import { getPlayerDisciplineHistory } from '../../../services/playerDisciplineHistory';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { getTeamFullName } from '../../../utils/teamNames';
import { normalizeDate } from '../../../utils/helpers';

interface Props {
  player: NBAPlayer;
}

interface DisplayRow extends PlayerDisciplineRecord {
  teamName: string;
  league: string;
}

function formatFine(amount: number | undefined, currencyCode: string | undefined): string {
  if (!amount || amount <= 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode ?? 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string): string {
  const normalized = normalizeDate(value);
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function actionLabel(action: PlayerDisciplineRecord['action']): string {
  if (action === 'fine') return 'Fine';
  if (action === 'suspension') return 'Suspension';
  return 'Fine + Suspension';
}

export function PlayerBioDisciplineTable({ player }: Props) {
  const { state } = useGame();
  const rows = useMemo<DisplayRow[]>(() => {
    const teams = [
      ...state.teams,
      ...(state.teamArchive ?? []),
      ...(state.nonNBATeams ?? []),
    ] as Array<NBATeam | NonNBATeam>;
    const nonNbaLeagueByTid = new Map(
      (state.nonNBATeams ?? []).map(team => [team.tid, team.league]),
    );
    const regularStats = (player.stats ?? []).filter(stat => !stat.playoffs && stat.tid >= 0);

    return getPlayerDisciplineHistory(state, player).map(record => {
      const statTid = regularStats
        .filter(stat => Number(stat.season) <= record.season)
        .sort((left, right) => Number(right.season) - Number(left.season))[0]?.tid;
      const tid = record.tid ?? statTid;
      const team = tid !== undefined
        ? teams.find(candidate =>
            ('id' in candidate && candidate.id === tid)
            || ('tid' in candidate && candidate.tid === tid))
        : undefined;
      return {
        ...record,
        tid,
        teamName: team
          ? getTeamFullName(getHistoricalTeamSnapshot(team, record.season))
          : record.authority === 'team'
            ? 'Team'
            : 'League',
        league: tid !== undefined ? nonNbaLeagueByTid.get(tid) ?? 'NBA' : 'NBA',
      };
    });
  }, [player, state]);

  const fineTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!row.amount || row.amount <= 0) continue;
      const currency = row.currencyCode ?? 'USD';
      totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
    }
    return [...totals.entries()].map(([currency, amount]) => formatFine(amount, currency));
  }, [rows]);

  return (
    <section className="space-y-3 border-t border-slate-800 pt-5">
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Fines & Suspensions</h3>
        <p className="mt-1 text-xs text-slate-500">Recorded financial penalties and missed-game discipline.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/25 px-4 py-8 text-center text-sm text-slate-500">
          No fines or suspensions on record.
        </div>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {rows.map(row => (
              <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/25 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {formatDate(row.date)} · {row.league}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-white">{row.teamName}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-300">
                    {actionLabel(row.action)}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">{row.templateName ?? row.reason}</p>
                <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-800 pt-3">
                  <span className="font-mono text-sm font-black text-emerald-300">
                    {formatFine(row.amount, row.currencyCode)}
                  </span>
                  <span className="text-xs font-bold text-rose-300">
                    {row.games
                      ? `${row.games} game${row.games === 1 ? '' : 's'}`
                      : row.durationLabel ?? (row.indefinite ? 'Indefinite' : '—')}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="w-28 py-2 text-left font-bold">Date</th>
                  <th className="py-2 text-left font-bold">Team</th>
                  <th className="w-16 py-2 text-center font-bold">Lg</th>
                  <th className="w-36 py-2 text-left font-bold">Action</th>
                  <th className="py-2 text-left font-bold">Reason</th>
                  <th className="w-28 py-2 text-right font-bold">Fine</th>
                  <th className="w-20 py-2 text-right font-bold">Games</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-800/50 transition-colors hover:bg-slate-800/30">
                    <td className="py-2 font-mono text-xs text-slate-300">{formatDate(row.date)}</td>
                    <td className="py-2 font-medium text-slate-200">{row.teamName}</td>
                    <td className="py-2 text-center text-slate-400">{row.league}</td>
                    <td className="py-2 text-xs font-bold text-rose-300">{actionLabel(row.action)}</td>
                    <td className="max-w-xs py-2 text-xs text-slate-400">{row.templateName ?? row.reason}</td>
                    <td className="py-2 text-right font-mono font-bold text-emerald-300">
                      {formatFine(row.amount, row.currencyCode)}
                    </td>
                    <td className="py-2 text-right font-mono font-bold text-slate-200">
                      {row.games ?? row.durationLabel ?? (row.indefinite ? 'Indef.' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
              {fineTotals.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-800/40">
                    <td colSpan={5} className="py-2 pl-1 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Career Fines
                    </td>
                    <td colSpan={2} className="py-2 pr-1 text-right font-mono font-black text-emerald-400">
                      {fineTotals.join(' · ')}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </section>
  );
}
