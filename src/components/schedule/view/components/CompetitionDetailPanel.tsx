import React from 'react';
import { Game, NBATeam } from '../../../../types';
import { normalizeDate, getOwnTeamId } from '../../../../utils/helpers';
import { resolveAnyTeam } from '../../../../utils/teamLookup';
import { getTeamFullName } from '../../../../utils/teamNames';
import { matchesScheduleSeason } from '../../../../services/competition/competitionSeasonState';
import { usePlayerQuickActions } from '../../../../hooks/usePlayerQuickActions';
import { didHomeTeamWin } from '../../../../utils/gameOutcome';
import { getPlayerImage } from '../../../../utils/playerImage';
import { getResolvedTeamLogoUrl } from '../../../../utils/teamAssets';
import { PlayerPortrait } from '../../../shared/PlayerPortrait';

interface CompetitionDetailPanelProps {
  competitionId: string;
  state: any;
  seasonYear: number;
  onJumpToDate: (date: string) => void;
}

export const CompetitionDetailPanel: React.FC<CompetitionDetailPanelProps> = ({
  competitionId,
  state,
  seasonYear,
  onJumpToDate,
}) => {
  const quick = usePlayerQuickActions();
  const logoFor = (team: NBATeam | null | undefined) => team ? getResolvedTeamLogoUrl(team, seasonYear) : '';
  const spec = state.activeCompetitions?.find((c: any) => c.id === competitionId);
  const games: Game[] = (state.schedule ?? []).filter((g: Game) => (
    g.competitionId === competitionId && matchesScheduleSeason(g, seasonYear)
  ));
  const teamIds = Array.from(new Set(games.flatMap(g => [g.homeTid, g.awayTid]))).filter(tid => tid >= 0);
  const rows = new Map<number, { tid: number; wins: number; losses: number; pf: number; pa: number }>();
  teamIds.forEach(tid => rows.set(tid, { tid, wins: 0, losses: 0, pf: 0, pa: 0 }));
  (state.boxScores ?? []).forEach((b: any) => {
    if (b.competitionId !== competitionId) return;
    if (b.season !== undefined && b.season !== seasonYear) return;
    const home = rows.get(b.homeTeamId) ?? { tid: b.homeTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
    const away = rows.get(b.awayTeamId) ?? { tid: b.awayTeamId, wins: 0, losses: 0, pf: 0, pa: 0 };
    const homeWon = didHomeTeamWin(b);
    home.wins += homeWon ? 1 : 0;
    home.losses += homeWon ? 0 : 1;
    home.pf += b.homeScore;
    home.pa += b.awayScore;
    away.wins += homeWon ? 0 : 1;
    away.losses += homeWon ? 1 : 0;
    away.pf += b.awayScore;
    away.pa += b.homeScore;
    rows.set(home.tid, home);
    rows.set(away.tid, away);
  });

  const standings = [...rows.values()].sort((a, b) => b.wins - a.wins || (b.pf - b.pa) - (a.pf - a.pa));
  const today = normalizeDate(state.date);
  const upcoming = games
    .filter(g => !g.played && normalizeDate(g.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 8);
  const next = upcoming[0];
  const playedCount = (state.boxScores ?? []).filter((b: any) => b.competitionId === competitionId && (b.season === undefined || b.season === seasonYear)).length;
  const ownTid = getOwnTeamId(state);
  const ownRow = ownTid !== null ? standings.find(r => r.tid === ownTid) : undefined;
  const resolveTeam = (tid: number): NBATeam | null => resolveAnyTeam(tid, state.teams ?? [], state.nonNBATeams ?? []);
  const formatShortDate = (dateStr: string) => {
    const norm = normalizeDate(dateStr);
    const d = norm ? new Date(`${norm}T00:00:00Z`) : new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  };
  const ppgLeaders = (state.players ?? [])
    .map((p: any) => {
      const regularRows = (p.stats ?? []).filter((s: any) => (
        !s.playoffs
        && s.season === seasonYear
        && teamIds.includes(s.tid)
        && (s.competitionId === competitionId || (!s.competitionId && competitionId === state.euroPrimaryCompetitionId))
      ));
      const gp = regularRows.reduce((sum: number, s: any) => sum + (s.gp ?? 0), 0);
      const pts = regularRows.reduce((sum: number, s: any) => sum + (s.pts ?? 0), 0);
      if (gp <= 0) return null;
      return { ...p, ppg: pts / gp };
    })
    .filter((p: any) => p && teamIds.includes(p.tid))
    .sort((a: any, b: any) => (b.ppg ?? 0) - (a.ppg ?? 0))
    .slice(0, 4);
  const accent = spec?.accentColor ?? '#f59e0b';
  const nextHome = next ? resolveTeam(next.homeTid) : null;
  const nextAway = next ? resolveTeam(next.awayTid) : null;

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <>
    <div className="p-5 space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.35em]" style={{ color: accent }}>{spec?.shortName ?? competitionId}</div>
          <h2 className="text-3xl font-black text-white mt-1">{spec?.displayName ?? competitionId}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full xl:w-auto xl:min-w-[420px]">
          <CompetitionKpi label="Your Record" value={ownRow ? `${ownRow.wins}-${ownRow.losses}` : '0-0'} sub="Current competition" />
          <CompetitionKpi label="Games Played" value={String(playedCount)} sub={`${games.length} scheduled`} />
          <CompetitionKpi label="Next Fixture" value={next ? formatShortDate(next.date) : 'TBD'} sub={next ? 'Ready to preview' : 'No games queued'} />
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_370px] gap-5">
        <div className="space-y-5">
          {next && (
            <button onClick={() => onJumpToDate(next.date)} className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-amber-400/40">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-widest text-slate-500">Next Match</div>
                <span className="text-xs font-black text-amber-300">{formatShortDate(next.date)} · {next.tipoffTime ?? 'Tipoff TBD'}</span>
              </div>
              <div className="mt-5 grid grid-cols-[1fr_72px_1fr] gap-4 items-center">
                <TeamMini team={nextAway} align="right" />
                <div className="h-16 rounded-full border border-slate-700 bg-slate-950 flex items-center justify-center text-sm font-black text-slate-400">VS</div>
                <TeamMini team={nextHome} align="left" />
              </div>
            </button>
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-widest text-slate-400">Fixtures</div>
              <div className="text-xs text-slate-500">{upcoming.length} upcoming shown</div>
            </div>
            <div className="divide-y divide-slate-800">
              {upcoming.map(g => {
                const home = resolveTeam(g.homeTid);
                const away = resolveTeam(g.awayTid);
                return (
                  <button key={g.gid} onClick={() => onJumpToDate(g.date)} className="w-full grid grid-cols-[110px_1fr_90px] items-center gap-3 p-4 text-left hover:bg-white/[0.03]">
                    <div className="text-xs font-black text-slate-400">{formatShortDate(g.date)}</div>
                    <div className="flex items-center gap-3 min-w-0">
                      {logoFor(away) ? (
                        <img src={logoFor(away)} className="w-6 h-6 object-contain shrink-0" alt={away?.abbrev} referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-slate-700 bg-slate-800 shrink-0" />
                      )}
                      <span className="font-bold text-slate-300 truncate">{away ? getTeamFullName(away) : `Team ${g.awayTid}`}</span>
                      <span className="text-slate-600">at</span>
                      {logoFor(home) ? (
                        <img src={logoFor(home)} className="w-6 h-6 object-contain shrink-0" alt={home?.abbrev} referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 rounded-full border border-slate-700 bg-slate-800 shrink-0" />
                      )}
                      <span className="font-bold text-white truncate">{home ? getTeamFullName(home) : `Team ${g.homeTid}`}</span>
                    </div>
                    <div className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500">{g.competitionPhase ?? 'League'}</div>
                  </button>
                );
              })}
              {upcoming.length === 0 && <div className="p-6 text-sm text-slate-400">No upcoming fixtures for this competition.</div>}
            </div>
          </div>

        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Standings</div>
            <div className="space-y-1.5">
              {standings.slice(0, 10).map((row, index) => {
                const team = resolveTeam(row.tid);
                return (
                  <div key={row.tid} className={`grid grid-cols-[24px_24px_1fr_52px_42px] items-center gap-2 rounded-lg px-2 py-2 text-xs ${row.tid === ownTid ? 'bg-amber-400/10 text-amber-200' : 'text-slate-300'}`}>
                    <span className="font-black text-slate-500">{index + 1}</span>
                    {logoFor(team) ? (
                      <img src={logoFor(team)} className="w-5 h-5 object-contain shrink-0" alt={team?.abbrev} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-800 shrink-0" />
                    )}
                    <span className="font-bold truncate">{team ? getTeamFullName(team) : `Team ${row.tid}`}</span>
                    <span className="font-black tabular-nums text-right">{row.wins}-{row.losses}</span>
                    <span className="text-slate-500 tabular-nums text-right">{row.pf - row.pa > 0 ? '+' : ''}{row.pf - row.pa}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">PPG League Leaders</div>
            <div className="space-y-3">
              {ppgLeaders.map((p: any) => {
                const team = resolveTeam(p.tid);
                const ppg = p.ppg ?? 0;
                return (
                  <button
                    key={p.internalId ?? p.pid ?? p.name}
                    type="button"
                    onClick={() => quick.openFor(p)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl p-1.5 text-left transition-colors hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <PlayerPortrait imgUrl={getPlayerImage(p)} face={p.face} playerName={p.name} size={36} />
                      <div className="min-w-0">
                        <div className="text-sm font-black text-white truncate">{p.name}</div>
                        <div className="text-xs text-slate-500 truncate">{team ? getTeamFullName(team) : 'Club'} · {p.pos ?? 'G/F'}</div>
                      </div>
                    </div>
                    <div className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-800/70 text-sm font-black text-slate-200 tabular-nums">{ppg.toFixed(1)}</div>
                  </button>
                );
              })}
              {ppgLeaders.length === 0 && <div className="text-xs text-slate-500">No scoring data yet.</div>}
            </div>
          </div>
        </aside>
      </div>
    </div>
    {quick.portals}
    </>
  );
};

const CompetitionKpi: React.FC<{ label: string; value: string; sub: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
    <div className="text-xl font-black text-white mt-1">{value}</div>
    <div className="text-xs text-slate-500">{sub}</div>
  </div>
);

const TeamMini: React.FC<{ team: NBATeam | null; align: 'left' | 'right' }> = ({ team, align }) => (
  <div className={`flex items-center gap-3 ${align === 'right' ? 'justify-end text-right' : ''}`}>
    {align === 'right' && <div className="min-w-0"><div className="text-lg font-black text-white truncate">{team ? getTeamFullName(team) : 'TBD'}</div><div className="text-xs text-slate-500">{team?.abbrev ?? ''}</div></div>}
    {team && getResolvedTeamLogoUrl(team) ? <img src={getResolvedTeamLogoUrl(team)} className="w-16 h-16 object-contain shrink-0" alt={team.abbrev} referrerPolicy="no-referrer" /> : <div className="w-16 h-16 rounded-full border border-slate-700 bg-slate-800 shrink-0" />}
    {align === 'left' && <div className="min-w-0"><div className="text-lg font-black text-white truncate">{team ? getTeamFullName(team) : 'TBD'}</div><div className="text-xs text-slate-500">{team?.abbrev ?? ''}</div></div>}
  </div>
);
