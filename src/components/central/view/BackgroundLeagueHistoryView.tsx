import React, { useEffect, useMemo, useState } from 'react';
import { Award, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import { EXTERNAL_LEAGUE_PRESENTATION } from '../../../data/externalLeaguePresentation';
import {
  getBackgroundGeneratedPlayers,
  getBackgroundLeagueHistory,
} from '../../../services/backgroundUniverse/backgroundUniverseSelectors';
import { getBackgroundSeasonTeams } from '../../../services/backgroundUniverse/backgroundTeamRows';
import type { BackgroundAward, BackgroundRecord, GameState, NBAPlayer } from '../../../types';
import { getHistoricalTeamSnapshot } from '../../../utils/teamAssets';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { PlayerPortrait } from '../../shared/PlayerPortrait';
import { resolveLeagueHistoryPortraitUrl } from './leagueHistoryShared';

interface Props {
  state: GameState;
  leagueId: string;
  leagueOptions: string[];
  activeLeagueLabel: string;
  onLeagueChange: (leagueId: string) => void;
  onSelectTeam: (tid: number) => void;
  onSelectPlayer: (player: NBAPlayer) => void;
}

const AWARD_LABELS: Record<BackgroundAward['type'], string> = {
  MVP: 'Most Valuable Player',
  DPOY: 'Defensive Player of the Year',
  ROY: 'Rookie of the Year',
  SMOY: 'Sixth Player of the Year',
  MIP: 'Most Improved Player',
};

const RECORD_LABELS: Record<BackgroundRecord['type'], string> = {
  PTS: 'Points',
  REB: 'Rebounds',
  AST: 'Assists',
  STL: 'Steals',
  BLK: 'Blocks',
  PER: 'PER',
};

function leagueLabel(leagueId: string): string {
  const normalized = leagueId.trim().toLowerCase();
  const presentation = EXTERNAL_LEAGUE_PRESENTATION.find(entry =>
    entry.name.toLowerCase() === normalized || entry.longName.toLowerCase() === normalized,
  );
  return presentation?.longName ?? leagueId;
}

function seasonLabel(season: number): string {
  return `${season - 1}–${String(season).slice(-2).padStart(2, '0')}`;
}

export const BackgroundLeagueHistoryView: React.FC<Props> = ({
  state,
  leagueId,
  leagueOptions,
  activeLeagueLabel,
  onLeagueChange,
  onSelectTeam,
  onSelectPlayer,
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const seasons = useMemo(
    () => getBackgroundLeagueHistory(state, leagueId),
    [leagueId, state.backgroundUniverse],
  );
  const teams = useMemo(() => [...state.teams, ...(state.nonNBATeams ?? [])], [state.nonNBATeams, state.teams]);
  const playersById = useMemo(
    () => new Map([
      ...state.players,
      ...getBackgroundGeneratedPlayers(state, leagueId),
    ].map(player => [player.internalId, player])),
    [leagueId, state.backgroundUniverse, state.players],
  );
  const selected = selectedSeason == null ? null : seasons.find(entry => entry.season === selectedSeason) ?? null;

  useEffect(() => setSelectedSeason(null), [leagueId]);

  const teamFor = (tid: number, season: number) => {
    const team = resolveAnyTeam(tid, state.teams, state.nonNBATeams ?? []);
    return team ? getHistoricalTeamSnapshot(team, season) : null;
  };
  const playerFor = (playerId: string) => playersById.get(playerId) ?? null;

  const picker = (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 sm:min-w-64">
      League
      <select
        value={leagueId}
        onChange={event => onLeagueChange(event.target.value)}
        className="min-h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-sky-500"
      >
        <option value="__active__">{activeLeagueLabel}</option>
        {leagueOptions.map(option => <option key={option} value={option}>{leagueLabel(option)}</option>)}
      </select>
    </label>
  );

  if (selected) {
    const champion = selected.championTid == null ? null : teamFor(selected.championTid, selected.season);
    const runnerUp = selected.runnerUpTid == null ? null : teamFor(selected.runnerUpTid, selected.season);
    return (
      <div className="h-full overflow-y-auto p-4 md:p-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <button onClick={() => setSelectedSeason(null)} className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white">
                <ChevronLeft size={15} /> Back to {leagueLabel(leagueId)} History
              </button>
              <h2 className="text-2xl font-black text-white md:text-3xl">{seasonLabel(selected.season)} Season</h2>
              <p className="mt-1 text-sm text-slate-400">{leagueLabel(leagueId)}</p>
            </div>
            {picker}
          </div>

          <section className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Champion', team: champion, tid: selected.championTid, tone: 'border-amber-500/30 bg-amber-500/5 text-amber-300' },
              { label: 'Runner Up', team: runnerUp, tid: selected.runnerUpTid, tone: 'border-slate-700 bg-slate-900/60 text-slate-300' },
            ].map(entry => (
              <button
                key={entry.label}
                disabled={entry.tid == null}
                onClick={() => entry.tid != null && onSelectTeam(entry.tid)}
                className={`rounded-2xl border p-4 text-left ${entry.tone} disabled:cursor-default`}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.18em]">{entry.label}</span>
                <span className="mt-3 flex items-center gap-3 text-base font-black text-white">
                  {entry.team?.logoUrl ? <img src={entry.team.logoUrl} alt="" className="h-10 w-10 object-contain" referrerPolicy="no-referrer" /> : <Trophy size={28} />}
                  {entry.team ? getTeamFullName(entry.team) : '—'}
                </span>
              </button>
            ))}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-white"><Award size={17} className="text-sky-400" /> Season Awards</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selected.awards.map(award => {
                const player = playerFor(award.playerId);
                const team = teamFor(award.tid, selected.season);
                return (
                  <button
                    key={`${award.type}:${award.playerId}`}
                    disabled={!player}
                    onClick={() => player && onSelectPlayer(player)}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-left disabled:cursor-default"
                  >
                    <PlayerPortrait
                      size={44}
                      imgUrl={resolveLeagueHistoryPortraitUrl(player ?? undefined, player?.name ?? award.playerId, state.leagueType !== 'fictional')}
                      playerName={player?.name}
                      face={player?.face}
                      teamLogoUrl={team?.logoUrl}
                    />
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-sky-400">{AWARD_LABELS[award.type]}</span>
                      <span className="block truncate text-sm font-bold text-white">{player?.name ?? 'Player unavailable'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-white">Season Leaders</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selected.records.map(record => {
                const player = playerFor(record.playerId);
                return (
                  <button
                    key={`${record.type}:${record.playerId}`}
                    disabled={!player}
                    onClick={() => player && onSelectPlayer(player)}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3 text-left disabled:cursor-default"
                  >
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{RECORD_LABELS[record.type]}</span>
                      <span className="block truncate text-sm font-bold text-white">{player?.name ?? 'Player unavailable'}</span>
                    </span>
                    <span className="ml-3 text-lg font-black text-emerald-400">{record.value.toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-white">Standings</h3>
            <div className="space-y-2">
              {getBackgroundSeasonTeams(selected).sort((left, right) => left.seed - right.seed).map(row => {
                const team = teamFor(row.tid, selected.season);
                return (
                  <button key={row.tid} onClick={() => onSelectTeam(row.tid)} className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left hover:border-slate-600">
                    <span className="w-7 text-center text-xs font-black text-slate-500">{row.seed}</span>
                    {team?.logoUrl ? <img src={team.logoUrl} alt="" className="h-8 w-8 object-contain" referrerPolicy="no-referrer" /> : <span className="h-8 w-8" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{team ? getTeamFullName(team) : `Team ${row.tid}`}</span>
                    <span className="text-sm font-black text-slate-300">{row.won}–{row.lost}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-3 text-2xl font-black text-white md:text-3xl"><Trophy className="text-amber-400" /> {leagueLabel(leagueId)} History</h2>
            <p className="mt-1 text-sm text-slate-400">Season champions, honors and leaders across your universe.</p>
          </div>
          {picker}
        </div>
        <div className="space-y-3">
          {seasons.map(entry => {
            const champion = entry.championTid == null ? null : teamFor(entry.championTid, entry.season);
            const runnerUp = entry.runnerUpTid == null ? null : teamFor(entry.runnerUpTid, entry.season);
            return (
              <button key={`${entry.leagueId}:${entry.season}`} onClick={() => setSelectedSeason(entry.season)} className="w-full rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left hover:border-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-black text-white">{seasonLabel(entry.season)}</span>
                  <ChevronRight size={17} className="text-slate-500" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    { label: 'Champion', team: champion, tone: 'text-amber-400' },
                    { label: 'Runner Up', team: runnerUp, tone: 'text-slate-400' },
                  ].map(item => (
                    <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-950/50 p-3">
                      {item.team?.logoUrl ? <img src={item.team.logoUrl} alt="" className="h-8 w-8 object-contain" referrerPolicy="no-referrer" /> : <span className="h-8 w-8" />}
                      <span className="min-w-0">
                        <span className={`block text-[9px] font-black uppercase tracking-[0.14em] ${item.tone}`}>{item.label}</span>
                        <span className="block truncate text-sm font-bold text-white">{item.team ? getTeamFullName(item.team) : '—'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
          {seasons.length === 0 && <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-500">No completed seasons yet.</div>}
        </div>
      </div>
    </div>
  );
};
