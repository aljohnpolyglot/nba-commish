import { useMemo, useState } from 'react';
import { Play, Search, Users, X } from 'lucide-react';
import type { Player } from '../olympics/types';
import { PlayerPortrait } from '../../components/shared/PlayerPortrait';

type DanceSide = 'blue' | 'orange';

interface DanceContestTeamSelectorProps {
  players: readonly Player[];
  onStart: (bluePlayerIds: number[], orangePlayerIds: number[]) => void;
}

export default function DanceContestTeamSelector({
  players,
  onStart,
}: DanceContestTeamSelectorProps) {
  const [blueIds, setBlueIds] = useState<number[]>([]);
  const [orangeIds, setOrangeIds] = useState<number[]>([]);
  const [activeSide, setActiveSide] = useState<DanceSide>('blue');
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const eligible = useMemo(() => players
    .filter(player => Number.isFinite(player.tid) && player.tid >= 0 && player.tid < 100)
    .sort((left, right) =>
      String(left.teamName).localeCompare(String(right.teamName))
      || left.lastName.localeCompare(right.lastName)
      || left.firstName.localeCompare(right.firstName)
    ), [players]);
  const uniqueTeams = useMemo(() =>
    [...new Set(eligible.map(player => player.tid))].sort((left, right) => left - right),
  [eligible]);
  const selectedSide = (playerId: number): DanceSide | null =>
    blueIds.includes(playerId) ? 'blue' : orangeIds.includes(playerId) ? 'orange' : null;
  const visiblePlayers = eligible.filter(player => {
    if (teamFilter != null && player.tid !== teamFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    return !query
      || `${player.firstName} ${player.lastName}`.toLowerCase().includes(query)
      || String(player.teamName ?? player.teamAbbrev ?? '').toLowerCase().includes(query);
  });
  const togglePlayer = (playerId: number) => {
    const side = selectedSide(playerId);
    if (side === 'blue') {
      setBlueIds(current => current.filter(id => id !== playerId));
      return;
    }
    if (side === 'orange') {
      setOrangeIds(current => current.filter(id => id !== playerId));
      return;
    }
    if (activeSide === 'blue' && blueIds.length < 12) {
      setBlueIds(current => [...current, playerId]);
    }
    if (activeSide === 'orange' && orangeIds.length < 12) {
      setOrangeIds(current => [...current, playerId]);
    }
  };
  const activeFull = activeSide === 'blue' ? blueIds.length >= 12 : orangeIds.length >= 12;
  const ready = blueIds.length === 12 && orangeIds.length === 12;

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-300 sm:px-8 md:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-pink-400">Dance Contest</p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Choose Both Teams</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Build two 12-player routines. The first player selected for each team becomes its captain.
            </p>
          </div>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onStart(blueIds, orangeIds)}
            className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-8 py-3.5 text-sm font-black uppercase tracking-widest text-zinc-950 transition hover:bg-pink-100 disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
          >
            Start Dance Contest <Play className="h-4 w-4 fill-zinc-950" />
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveSide('blue')}
            className={`rounded-2xl border p-4 text-left transition ${activeSide === 'blue' ? 'border-blue-400 bg-blue-500/15 shadow-[0_0_24px_rgba(59,130,246,0.12)]' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-black uppercase tracking-wider text-blue-300">Team Blue</span>
              <span className="rounded-full bg-blue-400/15 px-2.5 py-1 text-xs font-black text-blue-300">{blueIds.length} / 12</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{activeSide === 'blue' ? 'New selections join Team Blue.' : 'Select to edit Team Blue.'}</p>
          </button>
          <button
            type="button"
            onClick={() => setActiveSide('orange')}
            className={`rounded-2xl border p-4 text-left transition ${activeSide === 'orange' ? 'border-orange-400 bg-orange-500/15 shadow-[0_0_24px_rgba(249,115,22,0.12)]' : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-700'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-black uppercase tracking-wider text-orange-300">Team Orange</span>
              <span className="rounded-full bg-orange-400/15 px-2.5 py-1 text-xs font-black text-orange-300">{orangeIds.length} / 12</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{activeSide === 'orange' ? 'New selections join Team Orange.' : 'Select to edit Team Orange.'}</p>
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search players or teams..."
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-10 pr-10 text-sm text-zinc-200 outline-none transition focus:border-pink-500/50"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="relative">
            <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <select
              value={teamFilter ?? ''}
              onChange={event => setTeamFilter(event.target.value ? Number(event.target.value) : null)}
              className="w-full appearance-none rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-8 text-sm text-zinc-200 outline-none focus:border-pink-500/50 sm:min-w-[220px]"
            >
              <option value="">All NBA Teams ({eligible.length})</option>
              {uniqueTeams.map(tid => {
                const teamPlayers = eligible.filter(player => player.tid === tid);
                return <option key={tid} value={tid}>{teamPlayers[0]?.teamName ?? teamPlayers[0]?.teamAbbrev} ({teamPlayers.length})</option>;
              })}
            </select>
          </div>
          {(blueIds.length > 0 || orangeIds.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setBlueIds([]);
                setOrangeIds([]);
              }}
              className="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-300 transition hover:bg-rose-500/20"
            >
              Clear Both
            </button>
          )}
        </div>

        <div className="grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visiblePlayers.map(player => {
            const side = selectedSide(player.pid);
            const disabled = !side && activeFull;
            const selectedClass = side === 'blue'
              ? 'border-blue-400/60 bg-blue-500/15 text-blue-50'
              : side === 'orange'
                ? 'border-orange-400/60 bg-orange-500/15 text-orange-50'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800';
            return (
              <button
                key={player.pid}
                type="button"
                disabled={disabled}
                onClick={() => togglePlayer(player.pid)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 ${selectedClass}`}
              >
                <PlayerPortrait
                  imgUrl={player.imgURL}
                  playerName={`${player.firstName} ${player.lastName}`.trim()}
                  size={44}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{player.firstName} {player.lastName}</span>
                  <span className={`mt-0.5 block truncate text-xs ${side === 'blue' ? 'text-blue-300' : side === 'orange' ? 'text-orange-300' : 'text-zinc-600'}`}>
                    {side ? `Team ${side === 'blue' ? 'Blue' : 'Orange'} · ` : ''}{player.teamName ?? player.teamAbbrev}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
