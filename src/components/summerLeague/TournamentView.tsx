import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Crown, ExternalLink, List, Medal, Trophy, User, Users, X } from 'lucide-react';
import type { Game, GameResult, NBAPlayer } from '../../types';
import type {
  SummerLeagueHistoryEntry,
  SummerLeagueTournamentState,
} from '../../services/summerLeague/types';
import {
  calculateSummerLeagueStandings,
  summerLeagueSimulatorRoster,
  summerLeagueSimulatorTeam,
} from '../../services/summerLeague/tournament';
import { normalizeFibaPersonName } from '../../services/fiba/countryIdentity';
import {
  buildSummerLeagueRosterRatingPlayer,
  hasExactSummerLeagueRating,
} from '../../services/summerLeague/playerArchive';
import { getSummerLeagueTeamLogo } from '../../services/summerLeague/teamIdentity';
import { useGame } from '../../store/GameContext';
import { computeAge } from '../../utils/helpers';
import { getPlayerImage } from '../../utils/playerImage';
import { normalizePositionLabel } from '../../utils/positionUtils';
import {
  getScoutedDisplayOverall,
  getScoutedDisplayPotential,
} from '../../utils/scoutingFuzz';
import { BoxScoreModal } from '../modals/BoxScoreModal';
import StatsTable, { type PlayerStatRow } from '../international/fiba/StatsTable';
import { buildTournamentPlayerStatRows } from '../international/fiba/tournamentViewModel';
import { getPlayerPortraitUrl } from './utils';
import { getSummerLeaguePortraitCandidates } from './utils';
import { PlayerPortrait } from '../shared/PlayerPortrait';

type TournamentTab = 'summary' | 'standings' | 'games' | 'teams' | 'stats';

interface DisplayBracketGame {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamName?: string;
  boxScore?: GameResult;
}

interface TournamentViewProps {
  entry?: SummerLeagueHistoryEntry;
  tournament?: SummerLeagueTournamentState;
  players: readonly NBAPlayer[];
  onPlayerSelect: (player: NBAPlayer) => void;
  onSimulate?: () => void;
  onDone?: () => void;
  onClose: () => void;
}

export default function TournamentView({
  entry,
  tournament = entry?.tournament,
  players,
  onPlayerSelect,
  onSimulate,
  onDone,
  onClose,
}: TournamentViewProps) {
  const { state } = useGame();
  const [activeTab, setActiveTab] = useState<TournamentTab>('summary');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedBoxScore, setSelectedBoxScore] = useState<GameResult | null>(null);
  const year = tournament?.year ?? entry?.year ?? state.leagueStats.year;
  const teamById = useMemo(
    () => new Map((tournament?.teams ?? []).map(team => [team.id, team])),
    [tournament?.teams],
  );
  const sourceTeamById = useMemo(
    () => new Map((entry?.sourceTeams ?? []).map(team => [team.id, team])),
    [entry?.sourceTeams],
  );
  const playerById = useMemo(
    () => new Map(players.map(player => [player.internalId, player])),
    [players],
  );
  const playerByName = useMemo(
    () => new Map(players.map(player => [normalizeFibaPersonName(player.name), player])),
    [players],
  );
  const sourcePlayerByName = useMemo(
    () => new Map((entry?.sourcePlayers ?? []).map(player => [normalizeFibaPersonName(player.name), player])),
    [entry?.sourcePlayers],
  );
  const displayPlayerById = useMemo(
    () => new Map([
      ...(entry?.sourcePlayers ?? []).map(player => [player.internalId, player] as const),
      ...players.map(player => [player.internalId, player] as const),
    ]),
    [entry?.sourcePlayers, players],
  );
  const playerName = (playerId?: string): string | null => {
    if (!playerId || !tournament) return null;
    return tournament.teams
      .flatMap(team => [...team.players, ...team.reserves])
      .find(player => player.savePlayerId === playerId || player.id === playerId)?.name ?? null;
  };
  const yearData = {
    champion: entry?.champion
      ?? teamById.get(tournament?.result?.championTeamId ?? '')?.name
      ?? null,
    runnerUp: entry?.runnerUp
      ?? teamById.get(tournament?.result?.runnerUpTeamId ?? '')?.name
      ?? null,
    championshipMvp: entry?.championshipMvp
      ?? playerName(tournament?.result?.awards.championshipMvpPlayerId),
    mvp: entry?.mvp ?? playerName(tournament?.result?.awards.mvpPlayerId),
    firstTeam: entry?.firstTeam
      ?? tournament?.result?.awards.firstTeamPlayerIds.flatMap(id => playerName(id) ?? [])
      ?? [],
    secondTeam: entry?.secondTeam
      ?? tournament?.result?.awards.secondTeamPlayerIds.flatMap(id => playerName(id) ?? [])
      ?? [],
  };
  const teamLogo = (name: string, abbrev?: string): string => (
    tournament?.teams.find(team => team.name === name)?.logoUrl
    || getSummerLeagueTeamLogo(state.teams, name, year, abbrev)
  );
  const portrait = (name: string): string => {
    const normalized = normalizeFibaPersonName(name);
    const player = playerByName.get(normalized);
    const sourcePlayer = entry?.sourceStats?.find(candidate => normalizeFibaPersonName(candidate.name) === normalized)
      ?? entry?.sourceTeams?.flatMap(team => team.roster).find(candidate => normalizeFibaPersonName(candidate.name) === normalized);
    const sourceImage = sourcePlayer
      ? 'portraitUrl' in sourcePlayer
        ? sourcePlayer.portraitUrl
        : 'imageUrl' in sourcePlayer
          ? sourcePlayer.imageUrl
          : undefined
      : undefined;
    const archivePlayer = sourcePlayerByName.get(normalized);
    return (player && getPlayerImage(player, { portraitSeason: year }))
      || (archivePlayer && getPlayerImage(archivePlayer, { portraitSeason: year }))
      || sourceImage
      || getPlayerPortraitUrl(name);
  };
  const openPlayerByName = (name: string) => {
    const normalized = normalizeFibaPersonName(name);
    const player = playerByName.get(normalized) ?? sourcePlayerByName.get(normalized);
    if (player) onPlayerSelect(player);
  };
  const standings = useMemo(
    () => tournament ? calculateSummerLeagueStandings(tournament) : (entry?.sourceStandings ?? []),
    [entry?.sourceStandings, tournament],
  );
  const gamesByDate = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof tournament>['games']>();
    for (const game of tournament?.games ?? []) {
      groups.set(game.date, [...(groups.get(game.date) ?? []), game]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [tournament]);
  const sourceGamesByDate = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof entry>['sourceGames']>();
    for (const game of entry?.sourceGames ?? []) {
      groups.set(game.date, [...(groups.get(game.date) ?? []), game]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [entry?.sourceGames]);
  const semifinalGames = tournament?.games.filter(game => game.phase === 'semifinal') ?? [];
  const finalGames = tournament?.games.filter(game => game.phase === 'final') ?? [];
  const bracketSemifinals = useMemo<DisplayBracketGame[]>(() => {
    if (!tournament) {
      return (entry?.sourceBracket?.semifinals ?? []).map(game => ({
        ...game,
        winnerTeamName: game.homeScore != null && game.awayScore != null
          ? game.homeScore > game.awayScore ? game.homeTeamName : game.awayTeamName
          : undefined,
      }));
    }
    return semifinalGames.map(game => {
      const home = teamById.get(game.homeTeamId);
      const away = teamById.get(game.awayTeamId);
      return {
        id: game.id,
        homeTeamName: home?.name ?? 'TBD',
        awayTeamName: away?.name ?? 'TBD',
        homeScore: game.homeScore ?? null,
        awayScore: game.awayScore ?? null,
        winnerTeamName: teamById.get(game.winnerTeamId ?? '')?.name,
        boxScore: tournament.boxScores.find(result => result.gameId === game.gameId),
      };
    });
  }, [entry?.sourceBracket?.semifinals, semifinalGames, teamById, tournament]);
  const bracketFinals = useMemo<DisplayBracketGame[]>(() => {
    if (!tournament) {
      return (entry?.sourceBracket?.finals ?? []).map(game => ({
        ...game,
        winnerTeamName: game.homeScore != null && game.awayScore != null
          ? game.homeScore > game.awayScore ? game.homeTeamName : game.awayTeamName
          : undefined,
      }));
    }
    return finalGames.map(game => {
      const home = teamById.get(game.homeTeamId);
      const away = teamById.get(game.awayTeamId);
      return {
        id: game.id,
        homeTeamName: home?.name ?? 'TBD',
        awayTeamName: away?.name ?? 'TBD',
        homeScore: game.homeScore ?? null,
        awayScore: game.awayScore ?? null,
        winnerTeamName: teamById.get(game.winnerTeamId ?? '')?.name,
        boxScore: tournament.boxScores.find(result => result.gameId === game.gameId),
      };
    });
  }, [entry?.sourceBracket?.finals, finalGames, teamById, tournament]);
  const selectedTeam = selectedTeamId ? teamById.get(selectedTeamId) : undefined;
  const selectedSourceTeam = selectedTeamId ? sourceTeamById.get(selectedTeamId) : undefined;
  const availableTeams = tournament?.teams ?? entry?.sourceTeams ?? [];
  const displayTeam = (teamId: string) => teamById.get(teamId) ?? sourceTeamById.get(teamId);
  const statRows = useMemo<PlayerStatRow[]>(() => {
    if (!tournament) {
      return (entry?.sourceStats ?? []).map(row => {
        const normalizedName = normalizeFibaPersonName(row.name);
        const player = playerByName.get(normalizedName) ?? sourcePlayerByName.get(normalizedName);
        const sourceTeam = entry?.sourceTeams?.find(team => team.abbrev === row.teamCode);
        return {
          ...row,
          playerId: player?.internalId ?? row.playerId,
          teamName: sourceTeam?.name,
          teamFlagUrl: sourceTeam
            ? getSummerLeagueTeamLogo(state.teams, sourceTeam.name, year, sourceTeam.abbrev)
            : row.teamFlagUrl,
        };
      });
    }
    return buildTournamentPlayerStatRows({
      year,
      teams: tournament.teams.map(team => ({
        seed: team.seed,
        country: team.name,
        abbrev: team.abbrev,
        logoUrl: team.logoUrl,
        players: team.players,
      })),
      boxScores: tournament.boxScores,
    }, playerById);
  }, [entry?.sourceStats, entry?.sourceTeams, playerById, playerByName, sourcePlayerByName, state.teams, tournament, year]);
  const nativeBoxScore = useMemo(() => {
    if (!selectedBoxScore || !tournament) return null;
    const home = tournament.teams.find(team => 900_000 + team.seed === selectedBoxScore.homeTeamId);
    const away = tournament.teams.find(team => 900_000 + team.seed === selectedBoxScore.awayTeamId);
    if (!home || !away) return null;
    const tournamentGame = tournament.games.find(game => game.gameId === selectedBoxScore.gameId);
    const game: Game = {
      gid: selectedBoxScore.gameId,
      homeTid: selectedBoxScore.homeTeamId,
      awayTid: selectedBoxScore.awayTeamId,
      homeScore: selectedBoxScore.homeScore,
      awayScore: selectedBoxScore.awayScore,
      played: true,
      date: selectedBoxScore.date ?? tournamentGame?.date ?? `${year}-07-15`,
      isExhibition: true,
      excludeFromRecord: true,
      competitionId: tournament.competitionId,
      competitionPhase: tournamentGame?.phase === 'final' ? 'final' : 'preliminary',
    };
    return {
      game,
      homeTeam: summerLeagueSimulatorTeam(home),
      awayTeam: summerLeagueSimulatorTeam(away),
      players: [
        ...summerLeagueSimulatorRoster(home, players, year),
        ...summerLeagueSimulatorRoster(away, players, year),
      ],
    };
  }, [players, selectedBoxScore, tournament, year]);
  const tabs: TournamentTab[] = ['summary', 'standings', 'games', 'teams', 'stats'];

  const renderTeamView = () => {
    const teamName = selectedTeam?.name ?? selectedSourceTeam?.name;
    if (!teamName) return null;
    const roster = selectedTeam
      ? [...selectedTeam.players, ...selectedTeam.reserves].map(rosterPlayer => {
        const savedPlayer = rosterPlayer.savePlayerId
          ? playerById.get(rosterPlayer.savePlayerId)
          : playerById.get(rosterPlayer.id);
        return {
          id: rosterPlayer.id,
          name: rosterPlayer.name,
          position: rosterPlayer.position,
          birthYear: rosterPlayer.birthYear,
          bioPlayer: savedPlayer,
          ratingPlayer: buildSummerLeagueRosterRatingPlayer(rosterPlayer, year, savedPlayer),
          imageUrl: rosterPlayer.imageUrl,
        };
      })
      : (selectedSourceTeam?.roster ?? []).map(rosterPlayer => {
        const normalizedName = normalizeFibaPersonName(rosterPlayer.name);
        const basePlayer = playerByName.get(normalizedName);
        const archivePlayer = rosterPlayer.bioPlayer ?? sourcePlayerByName.get(normalizedName);
        return {
          id: rosterPlayer.id,
          name: rosterPlayer.name,
          position: rosterPlayer.position,
          birthYear: rosterPlayer.birthYear,
          bioPlayer: basePlayer ?? archivePlayer,
          ratingPlayer: hasExactSummerLeagueRating(basePlayer, year)
            ? basePlayer
            : archivePlayer?.ratings.length
              ? archivePlayer
              : basePlayer,
          imageUrl: rosterPlayer.portraitUrl ?? undefined,
        };
      });
    return (
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        <button type="button" onClick={() => setSelectedTeamId(null)} className="mb-4 flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800">
          ← Back to teams
        </button>
        <div className="mb-8 flex items-center gap-4">
          <img src={selectedTeam?.logoUrl || teamLogo(teamName, selectedSourceTeam?.abbrev)} className="h-16 w-16 object-contain" alt="" />
          <h3 className="text-2xl font-bold text-slate-900">{year} {teamName} Summer League Roster</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roster.map(rosterPlayer => {
            const player = rosterPlayer.bioPlayer;
            const ratingPlayer = rosterPlayer.ratingPlayer;
            const displayName = player?.name ?? rosterPlayer.name;
            const portraitCandidates = getSummerLeaguePortraitCandidates(
              displayName,
              player ? getPlayerImage(player, { portraitSeason: year }) : undefined,
              rosterPlayer.imageUrl,
            );
            return (
              <button
                key={rosterPlayer.id}
                type="button"
                onClick={() => player && onPlayerSelect(player)}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-lg"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <PlayerPortrait imgUrl={portraitCandidates.primary} fallbackImgUrl={portraitCandidates.fallback} face={player?.face} playerName={displayName} size={52} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900 md:text-base">{displayName}</div>
                    <div className="text-xs font-medium text-blue-600">{normalizePositionLabel(player?.pos ?? rosterPlayer.position)}</div>
                    <div className="text-xs text-slate-500">Age {player ? computeAge(player, year) : rosterPlayer.birthYear ? year - rosterPlayer.birthYear : '—'}</div>
                  </div>
                </div>
                {ratingPlayer && ratingPlayer.ratings.length > 0 && (
                  <div className="ml-3 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">OVR</span><span className="text-sm font-bold text-slate-900">{getScoutedDisplayOverall(state, ratingPlayer, year)}</span></div>
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400">POT</span><span className="text-sm font-bold text-emerald-500">{getScoutedDisplayPotential(state, ratingPlayer, year, year)}</span></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const BracketGame = ({ game, final = false }: { game: DisplayBracketGame; final?: boolean }) => {
    return (
      <button
        type="button"
        onClick={() => {
          if (game.boxScore) setSelectedBoxScore(game.boxScore);
        }}
        disabled={!game.boxScore}
        className={`w-full overflow-hidden rounded-xl bg-white text-left shadow-sm ${final ? 'border-2 border-orange-200' : 'border border-slate-200'}`}
      >
        {[
          { name: game.homeTeamName, score: game.homeScore },
          { name: game.awayTeamName, score: game.awayScore },
        ].map((side, index) => (
          <div key={side.name} className={`flex items-center justify-between ${final ? 'p-4' : 'p-3'} ${index === 0 ? 'border-b border-slate-100' : ''} ${game.winnerTeamName === side.name ? 'bg-orange-50/50 font-bold text-slate-900' : 'text-slate-500'}`}>
            <div className="flex items-center gap-3">
              <img src={teamLogo(side.name)} className={`${final ? 'h-8 w-8' : 'h-6 w-6'} object-contain`} alt="" />
              <span className="truncate">{side.name}</span>
            </div>
            <span className={final ? 'text-lg' : ''}>{side.score ?? '—'}</span>
          </div>
        ))}
      </button>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={event => event.stopPropagation()}
          className="relative my-8 flex w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl"
          style={{ maxHeight: 'calc(100vh - 4rem)' }}
        >
          <div className="flex shrink-0 flex-col items-start justify-between gap-4 rounded-t-2xl border-b border-slate-100 bg-slate-50 p-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">{tournament?.title ?? `${year} Summer League Tournament`}</h2>
              <p className="mt-1 text-sm text-slate-500">Detailed Tournament Overview</p>
            </div>
            <button type="button" onClick={onClose} className="self-end rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-200 sm:self-auto"><X className="h-6 w-6" /></button>
          </div>
          <div className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-6">
            {tabs.map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedTeamId(null);
                }}
                className={`whitespace-nowrap border-b-2 px-6 py-4 text-sm font-bold uppercase tracking-wide transition-colors ${activeTab === tab ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-6 md:p-8">
            {selectedTeam || selectedSourceTeam ? renderTeamView() : activeTab === 'summary' ? (
              <div className="animate-in fade-in slide-in-from-bottom-2 space-y-12 duration-300">
                {yearData.champion && (
                  <div className="flex cursor-pointer flex-col items-center justify-between gap-8 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white shadow-lg transition-shadow hover:shadow-xl md:flex-row md:p-8" onClick={() => {
                    const team = availableTeams.find(candidate => candidate.name === yearData.champion);
                    if (team) setSelectedTeamId(team.id);
                  }}>
                    <div className="flex items-center gap-6">
                      <div className="rounded-xl bg-white p-3 shadow-sm"><img src={teamLogo(yearData.champion)} alt={yearData.champion} className="h-20 w-20 object-contain" /></div>
                      <div><div className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-orange-100"><Trophy className="h-4 w-4" /> {year} Champions</div><h3 className="text-3xl font-bold md:text-4xl">{yearData.champion}</h3></div>
                    </div>
                    {yearData.runnerUp && (
                      <button
                        type="button"
                        className="flex items-center gap-6 text-left opacity-90 transition-opacity hover:opacity-100"
                        onClick={event => {
                          event.stopPropagation();
                          const team = availableTeams.find(candidate => candidate.name === yearData.runnerUp);
                          if (team) setSelectedTeamId(team.id);
                        }}
                      >
                        <div className="text-right"><div className="mb-1 text-sm font-bold uppercase tracking-widest text-orange-100">Runner-up</div><h3 className="text-xl font-bold md:text-2xl">{yearData.runnerUp}</h3></div>
                        <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm"><img src={teamLogo(yearData.runnerUp)} alt={yearData.runnerUp} className="h-12 w-12 object-contain" /></div>
                      </button>
                    )}
                  </div>
                )}

                {bracketFinals.length > 0 && (
                  <section>
                    <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900"><List className="h-5 w-5 text-slate-500" /> Championship Bracket</h3>
                    <div className="flex flex-col items-center justify-center gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row">
                      {bracketSemifinals.length > 0 && (
                        <div className="flex w-full flex-col gap-8 md:w-64">
                          <div className="text-center text-sm font-bold uppercase tracking-wider text-slate-500">Semifinals</div>
                          {bracketSemifinals.map(game => <BracketGame key={game.id} game={game} />)}
                        </div>
                      )}
                      {bracketSemifinals.length > 0 && <div className="hidden h-px w-8 bg-slate-300 md:block" />}
                      <div className="flex w-full flex-col gap-4 md:w-72">
                        <div className="flex items-center justify-center gap-1 text-center text-sm font-bold uppercase tracking-wider text-orange-500"><Medal className="h-4 w-4" /> Championship Game</div>
                        {bracketFinals.map(game => <BracketGame key={game.id} game={game} final />)}
                      </div>
                    </div>
                  </section>
                )}

                {(yearData.mvp || yearData.championshipMvp) && (
                  <section>
                    <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900"><Crown className="h-5 w-5 text-amber-500" /> Tournament Awards</h3>
                    <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                      {[
                        ['Championship MVP', yearData.championshipMvp],
                        ['League MVP', yearData.mvp],
                      ].map(([label, name]) => name && (
                        <button key={label} type="button" onClick={() => openPlayerByName(name)} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md">
                          <img src={portrait(name)} className="h-16 w-16 rounded-full border border-slate-200 bg-slate-100 object-cover" alt="" />
                          <div><div className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="text-xl font-bold text-slate-900">{name}</div></div>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {[
                        ['First Team', yearData.firstTeam, 'text-blue-600'],
                        ['Second Team', yearData.secondTeam, 'text-slate-500'],
                      ].map(([label, names, color]) => (
                        <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                          <div className={`mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide ${color}`}><User className="h-4 w-4" /> {String(label)}</div>
                          <div className="flex flex-col gap-3">{(names as string[]).map(name => (
                            <button key={name} type="button" onClick={() => openPlayerByName(name)} className="flex items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-slate-50">
                              <img src={portrait(name)} className="h-10 w-10 rounded-full border border-slate-200 bg-slate-100 object-cover" alt="" /><span className="font-bold text-slate-800">{name}</span>
                            </button>
                          ))}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : activeTab === 'standings' ? (
              <section>
                <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900"><Medal className="h-5 w-5 text-slate-400" /> Final Standings</h3>
                <div className="space-y-3 md:hidden">{standings.map(row => {
                  const team = displayTeam(row.teamId);
                  const logoUrl = team && 'logoUrl' in team && team.logoUrl
                    ? team.logoUrl
                    : teamLogo(team?.name ?? 'TBD', team?.abbrev);
                  return <button key={row.teamId} type="button" onClick={() => setSelectedTeamId(row.teamId)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left"><div className="flex items-center gap-3"><span className="font-bold text-slate-400">{row.rank}</span><img src={logoUrl} className="h-8 w-8 object-contain" alt="" /><span className="font-bold text-slate-900">{team?.name}</span></div><span className="text-sm font-bold text-slate-700">{row.wins}-{row.losses}</span></button>;
                })}</div>
                <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
                  <table className="w-full min-w-max border-collapse text-left"><thead><tr className="border-b border-slate-200 bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-500"><th className="px-4 py-3 text-center">Rank</th><th className="px-4 py-3">Team</th><th className="px-4 py-3 text-right">W</th><th className="px-4 py-3 text-right">L</th><th className="px-4 py-3 text-right">Point Diff</th><th className="px-4 py-3 text-right">Total Points</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{standings.map(row => {
                      const team = displayTeam(row.teamId);
                      return <tr key={row.teamId} onClick={() => setSelectedTeamId(row.teamId)} className="cursor-pointer transition-colors hover:bg-slate-50"><td className="px-4 py-3 text-center text-slate-500">{row.rank}</td><td className="flex items-center gap-3 px-4 py-3 font-medium text-slate-900"><img src={team && 'logoUrl' in team && team.logoUrl ? team.logoUrl : teamLogo(team?.name ?? 'TBD', team?.abbrev)} className="h-6 w-6 object-contain" alt="" />{team?.name}{row.rank <= 4 && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">Playoffs</span>}</td><td className="px-4 py-3 text-right">{row.wins}</td><td className="px-4 py-3 text-right">{row.losses}</td><td className={`px-4 py-3 text-right font-medium ${row.pointDifference > 0 ? 'text-emerald-600' : row.pointDifference < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{row.pointDifference > 0 ? '+' : ''}{row.pointDifference}</td><td className="px-4 py-3 text-right">{row.pointsFor}</td></tr>;
                    })}</tbody>
                  </table>
                </div>
              </section>
            ) : activeTab === 'games' ? (
              <section>
                <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900"><Calendar className="h-5 w-5 text-blue-500" /> All Games</h3>
                {tournament ? <div className="space-y-10">{gamesByDate.map(([date, games]) => (
                  <div key={date}><h4 className="mb-4 border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{date}</h4><div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{games.map(game => {
                    const home = teamById.get(game.homeTeamId);
                    const away = teamById.get(game.awayTeamId);
                    const boxScore = tournament?.boxScores.find(result => result.gameId === game.gameId);
                    return <button key={game.id} type="button" disabled={!boxScore} onClick={() => boxScore && setSelectedBoxScore(boxScore)} className={`block overflow-hidden rounded-xl border bg-white text-left shadow-sm transition-shadow hover:shadow-md ${game.phase === 'final' ? 'border-orange-200' : 'border-slate-200'}`}><div className={`flex justify-between border-b px-4 py-2 text-xs font-bold uppercase tracking-wider ${game.phase === 'final' ? 'border-orange-100 bg-orange-50 text-orange-700' : 'border-slate-100 bg-slate-50 text-slate-500'}`}><span>Final</span>{game.phase !== 'group' && <span>Playoff</span>}</div><div className="space-y-3 p-4">{[{ team: home, score: game.homeScore }, { team: away, score: game.awayScore }].map(side => <div key={side.team?.id} className={`flex items-center justify-between ${game.winnerTeamId === side.team?.id ? 'font-bold text-slate-900' : 'text-slate-600'}`}><div className="flex items-center gap-3"><img src={side.team?.logoUrl || teamLogo(side.team?.name ?? 'TBD', side.team?.abbrev)} className="h-6 w-6 object-contain" alt="" /><span className="truncate">{side.team?.name}</span></div><span>{side.score ?? '—'}</span></div>)}</div></button>;
                  })}</div></div>
                ))}</div> : (
                  <div className="space-y-10">
                    {sourceGamesByDate.map(([date, games]) => (
                      <div key={date}>
                        <h4 className="mb-4 border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{date}</h4>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                           {(games ?? []).map(game => {
                            const homeWon = game.homeScore != null && game.awayScore != null && game.homeScore > game.awayScore;
                            const awayWon = game.homeScore != null && game.awayScore != null && game.awayScore > game.homeScore;
                            const card = (
                              <>
                                <div className="flex justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                  <span>{game.time || 'Final'}</span>
                                  <span>{game.stageLabel || game.stage}</span>
                                </div>
                                <div className="space-y-3 p-4">
                                  <div className={`flex items-center justify-between ${homeWon ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                                    <div className="flex min-w-0 items-center gap-3"><img src={teamLogo(game.homeTeamName)} className="h-6 w-6 shrink-0 object-contain" alt="" /><span className="truncate">{game.homeTeamName}</span></div>
                                    <span>{game.homeScore ?? '—'}</span>
                                  </div>
                                  <div className={`flex items-center justify-between ${awayWon ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                                    <div className="flex min-w-0 items-center gap-3"><img src={teamLogo(game.awayTeamName)} className="h-6 w-6 shrink-0 object-contain" alt="" /><span className="truncate">{game.awayTeamName}</span></div>
                                    <span>{game.awayScore ?? '—'}</span>
                                  </div>
                                  {game.boxScoreUrl && <div className="flex items-center gap-1 text-xs font-bold text-blue-600"><ExternalLink className="h-3.5 w-3.5" /> Box score</div>}
                                </div>
                              </>
                            );
                            return game.boxScoreUrl
                              ? <a key={game.id} href={game.boxScoreUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md">{card}</a>
                              : <div key={game.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm">{card}</div>;
                          })}
                        </div>
                      </div>
                    ))}
                    {sourceGamesByDate.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No complete source game rows are available for this edition.</div>}
                  </div>
                )}
              </section>
            ) : activeTab === 'teams' ? (
              <section>
                <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900"><Users className="h-5 w-5 text-emerald-500" /> Participating Teams</h3>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{availableTeams.map(team => (
                  <button key={team.id} type="button" onClick={() => setSelectedTeamId(team.id)} className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:border-slate-300 hover:shadow-md"><img src={'logoUrl' in team && team.logoUrl ? team.logoUrl : teamLogo(team.name, team.abbrev)} className="h-16 w-16 object-contain" alt={team.name} /><span className="text-center text-sm font-bold text-slate-900">{team.name}</span></button>
                ))}</div>
              </section>
            ) : (
              <section>
                <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-slate-900"><List className="h-5 w-5 text-indigo-500" /> Player Statistics</h3>
                <StatsTable
                  rows={statRows}
                  variant="summer-league"
                  onPlayerSelect={playerId => {
                    const player = displayPlayerById.get(playerId);
                    if (player) onPlayerSelect(player);
                  }}
                />
              </section>
            )}
          </div>

          {onDone && (
            <div className="flex shrink-0 items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 bg-white p-4">
              {tournament && !['complete', 'reviewed'].includes(tournament.status) && onSimulate && (
                <button type="button" onClick={onSimulate} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Finish Tournament</button>
              )}
              <button type="button" disabled={!tournament?.result || tournament.status !== 'complete'} onClick={onDone} className="rounded-lg bg-emerald-600 px-8 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300">Done</button>
            </div>
          )}
        </motion.div>
      </motion.div>

      {nativeBoxScore && selectedBoxScore && (
        <BoxScoreModal
          game={nativeBoxScore.game}
          result={selectedBoxScore}
          homeTeam={nativeBoxScore.homeTeam}
          awayTeam={nativeBoxScore.awayTeam}
          players={nativeBoxScore.players}
          hideFourPoint
          onClose={() => setSelectedBoxScore(null)}
          onPlayerClick={onPlayerSelect}
        />
      )}
    </>
  );
}
