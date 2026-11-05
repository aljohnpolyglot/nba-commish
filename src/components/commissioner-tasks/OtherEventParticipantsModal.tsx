import { useMemo, useState } from 'react';
import { Check, Search, Sparkles, X } from 'lucide-react';
import type { GameState, NBAPlayer } from '../../types';
import {
  AllStarShootingStarsSim,
  shouldUseCrossLeagueShootingStarsFormat,
} from '../../services/allStar/AllStarShootingStarsSim';
import { getTeamFullName } from '../../utils/teamNames';
import { PlayerPortrait } from '../shared/PlayerPortrait';

export type OtherEventId = 'shooting' | 'skills' | 'horse';

interface Props {
  state: GameState;
  event: OtherEventId;
  onClose: () => void;
  onConfirm: (players: NBAPlayer[]) => void;
}

const latestRating = (player: NBAPlayer, key: 'spd' | 'tp' | 'fg') =>
  Number(player.ratings?.[player.ratings.length - 1]?.[key] ?? 0);

export function OtherEventParticipantsModal({ state, event, onClose, onConfirm }: Props) {
  const teamCount = Math.min(30, Math.max(2, Math.round(
    state.leagueStats.allStarShootingStarsTeams
      ?? Math.round((state.leagueStats.allStarShootingStarsTotalPlayers ?? 12) / 3),
  )));
  const playerCount = event === 'skills'
    ? Math.min(30, Math.max(3, Math.round(
        state.leagueStats.allStarSkillsChallengeTeams
          ?? state.leagueStats.allStarSkillsChallengeTotalPlayers
          ?? 4,
      )))
    : Math.min(10, Math.max(3, Math.round(state.leagueStats.allStarHorseParticipants ?? 3)));
  const title = event === 'shooting'
    ? 'Shooting Stars'
    : event === 'skills'
      ? 'Skills Challenge'
      : 'H-O-R-S-E';
  const existing = event === 'shooting'
    ? state.allStar?.shootingStarsContestants ?? []
    : event === 'skills'
      ? state.allStar?.skillsChallengeContestants ?? []
      : state.allStar?.horseContestants ?? [];
  const nbaPlayers = useMemo(() => [...state.players]
    .filter(player => player.status === 'Active' && player.tid >= 0 && player.tid < 100)
    .sort((left, right) => event === 'skills'
      ? latestRating(right, 'spd') - latestRating(left, 'spd') || left.name.localeCompare(right.name)
      : latestRating(right, 'tp') + latestRating(right, 'fg')
        - latestRating(left, 'tp') - latestRating(left, 'fg')
        || left.name.localeCompare(right.name)),
  [event, state.players]);
  const hostCity = state.leagueStats.allStarHosts
    ?.find(host => host.year === state.leagueStats.year)?.city;
  const crossLeagueShootingStars = shouldUseCrossLeagueShootingStarsFormat(state);
  const shootingTeams = useMemo(() => {
    const candidates = AllStarShootingStarsSim.selectContestants(
      state.players,
      state.leagueStats.year,
      90,
      state.teams,
      state.nonNBATeams ?? [],
      hostCity,
      crossLeagueShootingStars,
    );
    const rows: NBAPlayer[][] = [];
    for (let index = 0; index < candidates.length; index += 3) {
      const row = candidates.slice(index, index + 3);
      if (row.length === 3) rows.push(row);
    }
    return rows;
  }, [crossLeagueShootingStars, hostCity, state.leagueStats.year, state.nonNBATeams, state.players, state.teams]);
  const [search, setSearch] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    () => new Set(existing.map(player => player.internalId)),
  );
  const [selectedTeams, setSelectedTeams] = useState<Set<number>>(() => {
    const ids = new Set<number>();
    for (let index = 0; index < existing.length; index += 3) {
      const tid = existing[index]?.tid;
      if (tid != null && tid >= 0 && tid < 100) ids.add(tid);
    }
    return ids;
  });
  const visiblePlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return nbaPlayers.slice(0, 60);
    return nbaPlayers.filter(player => {
      const team = state.teams.find(candidate => candidate.id === player.tid);
      return player.name.toLowerCase().includes(query)
        || player.pos.toLowerCase().includes(query)
        || (team?.abbrev ?? '').toLowerCase().includes(query);
    });
  }, [nbaPlayers, search, state.teams]);

  const selectedCount = event === 'shooting' ? selectedTeams.size : selectedPlayers.size;
  const requiredCount = event === 'shooting' ? teamCount : playerCount;
  const ready = selectedCount === requiredCount;

  const autoSelect = () => {
    if (event === 'shooting') {
      setSelectedTeams(new Set(shootingTeams.slice(0, teamCount).map(team => team[0].tid)));
      return;
    }
    setSelectedPlayers(new Set(nbaPlayers.slice(0, playerCount).map(player => player.internalId)));
  };

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(previous => {
      const next = new Set(previous);
      if (next.has(playerId)) next.delete(playerId);
      else if (next.size < playerCount) next.add(playerId);
      return next;
    });
  };

  const toggleTeam = (tid: number) => {
    setSelectedTeams(previous => {
      const next = new Set(previous);
      if (next.has(tid)) next.delete(tid);
      else if (next.size < teamCount) next.add(tid);
      return next;
    });
  };

  const confirm = () => {
    if (!ready) return;
    if (event === 'shooting') {
      onConfirm(shootingTeams
        .filter(team => selectedTeams.has(team[0].tid))
        .slice(0, teamCount)
        .flat());
      return;
    }
    const byId = new Map(nbaPlayers.map(player => [player.internalId, player]));
    onConfirm([...selectedPlayers]
      .map(id => byId.get(id))
      .filter((player): player is NBAPlayer => !!player));
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/85 p-0 backdrop-blur-sm sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden border-white/10 bg-slate-950 sm:h-[90vh] sm:rounded-3xl sm:border">
        <header className="border-b border-white/10 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-indigo-300">All-Star Weekend</p>
              <h2 className="mt-1 text-2xl font-black uppercase text-white">{title}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {event === 'shooting'
                  ? `${selectedCount}/${requiredCount} teams selected`
                  : `${selectedCount}/${requiredCount} selected`}
              </p>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={autoSelect}
              disabled={event === 'shooting' && shootingTeams.length < teamCount}
              className="flex items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-indigo-200 hover:bg-indigo-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles size={14} /> Auto-select participants
            </button>
            {event !== 'shooting' && (
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  value={search}
                  onChange={input => setSearch(input.target.value)}
                  placeholder="Search players"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-indigo-400"
                />
              </div>
            )}
          </div>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">
          {event === 'shooting' ? (
            shootingTeams.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {shootingTeams.map(teamPlayers => {
                  const anchor = state.teams.find(team => team.id === teamPlayers[0].tid);
                  const selected = selectedTeams.has(teamPlayers[0].tid);
                  const canSelect = selected || selectedTeams.size < teamCount;
                  return (
                    <button
                      key={teamPlayers[0].tid}
                      onClick={() => toggleTeam(teamPlayers[0].tid)}
                      disabled={!canSelect}
                      className={`relative rounded-2xl border p-4 text-left transition ${
                        selected
                          ? 'border-indigo-400 bg-indigo-400/15'
                          : canSelect
                            ? 'border-white/10 bg-white/[0.025] hover:border-white/25'
                            : 'border-white/5 opacity-35'
                      }`}
                    >
                      {selected && <span className="absolute right-3 top-3 rounded-full bg-indigo-400 p-1 text-slate-950"><Check size={11} /></span>}
                      <p className="pr-8 text-sm font-black uppercase text-white">
                        {anchor ? getTeamFullName(anchor) : `Team ${teamPlayers[0].tid}`}
                      </p>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        {teamPlayers.map((player, index) => (
                          <div key={player.internalId} className="min-w-0 text-center">
                            <PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={58} />
                            <p className="mt-1 truncate text-[10px] font-bold text-white">{player.name}</p>
                            <p className="text-[8px] font-black uppercase tracking-wide text-slate-500">
                              {crossLeagueShootingStars
                                ? index === 0 ? 'NBA' : index === 1 ? 'WNBA' : 'Former'
                                : `Player ${index + 1}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-6 text-center text-sm text-amber-100">
                No complete three-player team rosters are available.
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visiblePlayers.map(player => {
                const team = state.teams.find(candidate => candidate.id === player.tid);
                const selected = selectedPlayers.has(player.internalId);
                const canSelect = selected || selectedPlayers.size < playerCount;
                return (
                  <button
                    key={player.internalId}
                    onClick={() => togglePlayer(player.internalId)}
                    disabled={!canSelect}
                    className={`relative flex min-w-0 flex-col items-center rounded-2xl border p-3 text-center transition ${
                      selected
                        ? 'border-indigo-400 bg-indigo-400/15'
                        : canSelect
                          ? 'border-white/10 bg-white/[0.025] hover:border-white/25'
                          : 'border-white/5 opacity-35'
                    }`}
                  >
                    <PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} teamLogoUrl={team?.logoUrl} size={70} />
                    {selected && <span className="absolute right-2 top-2 rounded-full bg-indigo-400 p-1 text-slate-950"><Check size={10} /></span>}
                    <p className="mt-2 line-clamp-2 text-xs font-black text-white">{player.name}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase text-slate-500">{player.pos} · {team?.abbrev ?? 'FA'}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-xs font-bold text-slate-500">
            {event === 'shooting' ? `${selectedCount}/${requiredCount} teams selected` : `${selectedCount}/${requiredCount} selected`}
          </p>
          <button
            onClick={confirm}
            disabled={!ready}
            className="rounded-2xl bg-indigo-400 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-950 disabled:opacity-40"
          >
            Set Contestants
          </button>
        </footer>
      </div>
    </div>
  );
}
