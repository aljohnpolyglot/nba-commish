import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AllStarPlayer, NBAPlayer } from '../../types';
import {
  DEFAULT_NBA_MINIGAME_ROSTER_URL,
  parseBbgmMiniGamePlayers,
} from '../olympics/bbgmPlayers';
import type { Player } from '../olympics/types';
import App from './App';
import DanceContestTeamSelector from './DanceContestTeamSelector';
import { useGame } from '../../store/GameContext';
import { enrichOlympicsPlayers } from '../shared/minigameRoster';

function toGamePlayer(player: Player): NBAPlayer {
  return {
    internalId: `dance-contest:${player.pid}`,
    tid: player.tid,
    name: `${player.firstName} ${player.lastName}`.trim(),
    overallRating: player.ovr,
    potential: player.ovr,
    ratings: [],
    stats: [],
    imgURL: player.imgURL,
    pos: player.pos ?? 'G',
    born: player.bornYear ? { year: player.bornYear, loc: '' } : undefined,
    jerseyNumber: player.jerseyNumber,
    injury: { type: 'Healthy', gamesRemaining: 0 },
    status: 'Active',
  } as NBAPlayer;
}

export default function DanceContestStandalone() {
  const { state } = useGame();
  const [sourcePlayers, setSourcePlayers] = useState<Player[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<{ blue: number[]; orange: number[] }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPlayers = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch(DEFAULT_NBA_MINIGAME_ROSTER_URL, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(data => {
        setSourcePlayers(enrichOlympicsPlayers(
          parseBbgmMiniGamePlayers(data),
          state.players,
          state.teams,
          state.leagueStats.year,
        ));
        setLoading(false);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [state.leagueStats.year, state.players, state.teams]);

  useEffect(() => loadPlayers(), [loadPlayers]);

  const prepared = useMemo(() => {
    if (!selectedTeams) return null;
    const byId = new Map(sourcePlayers.map(player => [player.pid, player]));
    const blue = selectedTeams.blue.flatMap(id => byId.get(id) ? [byId.get(id)!] : []);
    const orange = selectedTeams.orange.flatMap(id => byId.get(id) ? [byId.get(id)!] : []);
    if (blue.length !== 12 || orange.length !== 12) return null;
    const selected = [...blue, ...orange];
    const players = selected.map(toGamePlayer);
    const gamePlayersBySourceId = new Map(selected.map((player, index) => [player.pid, players[index]]));
    const roster: AllStarPlayer[] = [
      ...blue.map((player, index) => ({
        source: player,
        conference: 'Blue',
        index,
      })),
      ...orange.map((player, index) => ({
        source: player,
        conference: 'Orange',
        index,
      })),
    ].map(({ source, conference, index }) => {
      const player = gamePlayersBySourceId.get(source.pid)!;
      return {
        playerId: player.internalId,
        playerName: player.name,
        teamAbbrev: source.teamAbbrev ?? '',
        conference,
        isStarter: index < 5,
        isCaptain: index === 0,
        position: player.pos ?? 'G',
        category: String(player.pos ?? '').includes('G') ? 'Guard' : 'Frontcourt',
        ovr: player.overallRating,
      };
    });
    const teams = [...new Map(selected.map(player => [
      player.tid,
      {
        id: player.tid,
        tid: player.tid,
        abbrev: player.teamAbbrev,
        colors: player.teamColors,
      },
    ])).values()];
    return { players, roster, teams };
  }, [selectedTeams, sourcePlayers]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-slate-300">Preparing competitors…</div>;
  }
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6">
        <div className="text-center">
          <p className="text-slate-300">The NBA player pool could not be opened.</p>
          <button type="button" onClick={loadPlayers} className="mt-4 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-slate-950">
            Try Again
          </button>
        </div>
      </div>
    );
  }
  if (!prepared) {
    return (
      <DanceContestTeamSelector
        players={sourcePlayers}
        onStart={(blue, orange) => setSelectedTeams({ blue, orange })}
      />
    );
  }
  return <App roster={prepared.roster} players={prepared.players} teams={prepared.teams} onSave={() => {}} />;
}
