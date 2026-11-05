import React, { useMemo, useEffect, useState } from 'react';
import { useGame } from '../../store/GameContext';
import { Trophy, MapPin } from 'lucide-react';
import { fetchAllStarHistory, AllStarHistoryEntry } from '../../data/allStarHistoryFetcher';
import { matchTeamByWikiName, generateAbbrev } from '../../data/brefFetcher';
import { getAllStarSunday } from '../../services/allStar/AllStarWeekendOrchestrator';
import { usePlayerQuickActions } from '../../hooks/usePlayerQuickActions';
import { getTeamFullName } from '../../utils/teamNames';
import {
  getHistoricalNbaBranchSeasonCutoff,
  getHistoricalNbaCompletedSeasonCutoff,
  isHistoricalNbaWhatIfSave,
} from '../../services/playerDevelopment/hofHistoryWindow';
import { getHistoricalTeamSnapshot, getResolvedTeamLogoUrl } from '../../utils/teamAssets';
import { isShootingStarsEnabled, isSkillsChallengeEnabled } from '../../services/allStar/allStarEventAvailability';
import { getHistoricalAllStarContestSummary } from '../../data/allStarContestWinners';
import { getFullRosterPlayerForIdentity, getPhotoByPlayerIdentity, normalizePlayerName } from '../../data/realPlayerDataFetcher';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { getPlayerImage } from '../../utils/playerImage';
import { didHomeTeamWin } from '../../utils/gameOutcome';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';
import { fetchHistoricalExternalPlayerArchive, type HistoricalExternalPlayerIdentity } from '../../services/historicalExternalRosterFetcher';
import { getSaveVisiblePeople } from '../../services/playerUniverse/canonicalHistoricalPeople';

/**
 * All-Star history table — mirrors LeagueHistoryView layout.
 * Merges:
 *   - Sim results from state.boxScores / state.schedule / state.allStar for current & past sim seasons
 *   - JSON gist (nbaallstarhistory) for real-world 1951→present
 *   - leagueStats.allStarHosts for future-assigned hosts
 */

type HistoryPlayerLookup = {
  byId: Map<string, any>;
  byName: Map<string, any>;
};

const MvpCell = ({ mvp, teams, playerLookup, season, onOpenPlayer, allowSource }: { mvp: any; teams: any[]; playerLookup: HistoryPlayerLookup; season: number; onOpenPlayer: (p: any) => void; allowSource: boolean }) => {
  if (!mvp) {
    return <span className="italic text-xs text-slate-700">—</span>;
  }
  const matchedTeam = matchTeamByWikiName(mvp.team, teams as any[]) as any;
  const teamSnapshot = matchedTeam ? getHistoricalTeamSnapshot(matchedTeam, season) : null;
  const identityKey = normalizePlayerName(mvp.name ?? '');
  const statePlayer = (mvp.playerId ? playerLookup.byId.get(mvp.playerId) : undefined)
    ?? playerLookup.byName.get(identityKey);
  const sourcePlayer = statePlayer || !allowSource ? null : getFullRosterPlayerForIdentity({ name: mvp.name });
  const sourceImg = allowSource ? (sourcePlayer ? getPlayerImage(sourcePlayer as any, { portraitSeason: season }) : getPhotoByPlayerIdentity({ name: mvp.name })) : undefined;
  const displayName = mvp.name ?? statePlayer?.name ?? sourcePlayer?.name;
  const player = statePlayer ?? null;
  const imgURL = statePlayer ? getPlayerImage(statePlayer, { portraitSeason: season }) : sourceImg ?? undefined;
  const teamLogoUrl = teamSnapshot ? getResolvedTeamLogoUrl(teamSnapshot, season) : undefined;
  const teamAbbrev = teamSnapshot?.abbrev ?? (mvp.team ? generateAbbrev(mvp.team) : '');
  const clickable = !!player;

  return (
    <div
      onClick={clickable ? () => onOpenPlayer(player) : undefined}
      className={`flex items-center gap-2 ${clickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}>
      <PlayerPortrait
        imgUrl={imgURL}
        teamLogoUrl={teamLogoUrl}
        playerName={displayName}
        portraitSeason={season}
        face={statePlayer?.face}
        size={28}
      />
      <div className="flex flex-col leading-tight">
        <span className="font-semibold text-white text-xs">{displayName}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{teamAbbrev}</span>
      </div>
    </div>
  );
};

const HostCell = ({ host, teams, season }: { host: { city: string; arena?: string; teamIds?: number[]; teamNames?: string[] } | null; teams: any[]; season: number }) => {
  if (!host) {
    return <span className="italic text-xs text-slate-700">—</span>;
  }
  const hostTeams = host.teamIds
    ? host.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean)
    : (host.teamNames ?? [])
        .map(name => matchTeamByWikiName(name, teams as any[]))
        .filter(Boolean) as any[];

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1">
        {hostTeams.slice(0, 2).map((t: any, i) => {
          const snapshot = getHistoricalTeamSnapshot(t, season);
          const logoUrl = getResolvedTeamLogoUrl(snapshot, season);
          return logoUrl
            ? <img key={i} src={logoUrl} className="w-5 h-5 object-contain rounded-full bg-slate-900 border border-slate-800" referrerPolicy="no-referrer" alt={snapshot.abbrev} />
            : <div key={i} className="w-5 h-5 bg-slate-800 rounded-full" />;
        })}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-bold text-white">{host.city}</span>
        {host.arena && <span className="text-[10px] text-slate-500">{host.arena}</span>}
      </div>
    </div>
  );
};

interface AllStarHistoryViewProps {
  onClose: () => void;
}

export const AllStarHistoryView: React.FC<AllStarHistoryViewProps> = ({ onClose }) => {
  const { state } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const isWnba = isWnbaIsolatedMode(state);
  const isPba = isPbaIsolatedMode(state);
  const isEuro = isEuroIsolatedMode(state);
  const isNbaHistoryMode = !isFictional && !isWnba && !isPba && !isEuro;
  const historicalWhatIf = isHistoricalNbaWhatIfSave({
    currentYear: state.leagueStats?.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const [history, setHistory] = useState<AllStarHistoryEntry[] | null>(null);
  const [historicalWnbaPlayers, setHistoricalWnbaPlayers] = useState<HistoricalExternalPlayerIdentity[]>([]);
  const quick = usePlayerQuickActions();

  useEffect(() => {
    if (isFictional || isEuro) {
      setHistory([]);
      return;
    }
    fetchAllStarHistory(isWnba ? 'wnba' : isPba ? 'pba' : 'nba').then(setHistory);
  }, [isEuro, isFictional, isPba, isWnba]);

  useEffect(() => {
    if (!isWnba) {
      setHistoricalWnbaPlayers([]);
      return;
    }
    let cancelled = false;
    fetchHistoricalExternalPlayerArchive('/data/external/wnba/wnba-2026-bbgm.json', {
      league: 'WNBA',
      internalIdPrefix: 'wnba',
    }).then(players => {
      if (!cancelled) setHistoricalWnbaPlayers(players);
    }).catch(() => {
      if (!cancelled) setHistoricalWnbaPlayers([]);
    });
    return () => { cancelled = true; };
  }, [isWnba]);

  const historyPlayers = useMemo(() => {
    const saveVisiblePeople = getSaveVisiblePeople(state);
    const stateNames = new Set(saveVisiblePeople.map(player => normalizePlayerName(player.name ?? '')));
    return [
      ...saveVisiblePeople,
      ...historicalWnbaPlayers.filter(player => !stateNames.has(normalizePlayerName(player.name))),
    ];
  }, [historicalWnbaPlayers, state.backgroundUniverse, state.historicalPeople, state.players]);

  const historyPlayerLookup = useMemo<HistoryPlayerLookup>(() => {
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const player of historyPlayers) {
      if (player.internalId) byId.set(player.internalId, player);
      const nameKey = normalizePlayerName(player.name ?? '');
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, player);
    }
    return { byId, byName };
  }, [historyPlayers]);

  const rows = useMemo(() => {
    const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
    const currentDate = state.date ? new Date(state.date) : new Date();
    const populatedSeasonCutoff = getHistoricalNbaCompletedSeasonCutoff({
      currentYear: state.leagueStats?.year,
      leagueType: state.leagueType,
      moddedLeagueBase: state.moddedLeagueBase,
      nbaStartYear: state.nbaStartYear,
    }) ?? (historicalWhatIf ? currentYear : Number.POSITIVE_INFINITY);
    const sourceHistoryCutoff = isWnba
      ? Math.max(1998, Number(state.wnbaStartYear ?? currentYear) - 1)
      : isPba
        ? currentYear - 1
      : getHistoricalNbaBranchSeasonCutoff({
          currentYear: state.leagueStats?.year,
          leagueType: state.leagueType,
          moddedLeagueBase: state.moddedLeagueBase,
          nbaStartYear: state.nbaStartYear,
        }) ?? populatedSeasonCutoff;
    const maxVisibleYear = historicalWhatIf ? currentYear : Number.POSITIVE_INFINITY;

    // Sim ASG result (only exists after the in-game All-Star game has been simulated)
    const asGameId = state.allStar?.allStarGameId;
    const asBox = asGameId ? state.boxScores?.find((b: any) => b.gameId === asGameId) : null;

    // A year is "played in-sim" if:
    //   - year < currentYear (any prior season is by definition simulated past), OR
    //   - year === currentYear AND we have the ASG box score, OR
    //   - year === currentYear AND current date is past All-Star Sunday (edge case,
    //     e.g. sim ran but box score cleanup happened) — treat as played.
    const hasPlayed = (year: number): boolean => {
      if (year < currentYear) return true;
      if (year === currentYear) {
        const boxDate = asBox?.date ? new Date(asBox.date) : null;
        if (boxDate && !Number.isNaN(boxDate.getTime()) && boxDate <= currentDate) return true;
        if (currentDate > getAllStarSunday(year)) return true;
      }
      return false;
    };

    type Row = {
      year: number;
      isCurrent: boolean;
      isFuture: boolean;
      isSim: boolean;
      teams: string[];
      winner: string | null;
      finalScore: Record<string, number> | null;
      gameNote?: string;
      host: { city: string; arena?: string; teamIds?: number[]; teamNames?: string[] } | null;
      mvps: Array<{ name: string; team: string }>;
      dunkWinner: { name: string; team: string } | null;
      danceWinner?: string | null;
      threeWinner: { name: string; team: string } | null;
      shootingStarsWinners: Array<{ playerId?: string; name: string; team: string }>;
      skillsWinner: { name: string; team: string } | null;
      horseWinner: { name: string; team: string } | null;
      throneWinner: { name: string; team: string } | null;
      bracketRecap: string | null;
      rsMvp: { name: string; team: string } | null;
    };

    // Resolve the team name a player was on in a given season (for the logo)
    const resolveTeamName = (p: any, season: number): string => {
      const stat = (p.stats ?? []).find((s: any) => s.season === season && !s.playoffs && (s.tid ?? -1) >= 0);
      if (!stat) return '';
      const team = state.teams.find((t: any) => t.id === stat.tid);
      return team ? getTeamFullName(getHistoricalTeamSnapshot(team, season)) : '';
    };

    // Build contest-winner lookup from player awards (covers all past sim seasons)
    type ContestEntry = { playerId?: string; name: string; team: string };
    type ContestLookup = { dunk: ContestEntry | null; three: ContestEntry | null; shootingStars: ContestEntry[]; skills: ContestEntry | null; horse: ContestEntry | null; throne: ContestEntry | null };
    const emptyContestLookup = (): ContestLookup => ({ dunk: null, three: null, shootingStars: [], skills: null, horse: null, throne: null });
    const contestByYear = new Map<number, ContestLookup>();
    state.players.forEach(p => {
      (p.awards ?? []).forEach((a: any) => {
        if (Number(a.season ?? 0) > populatedSeasonCutoff) return;
        const entry = contestByYear.get(a.season) ?? emptyContestLookup();
        if (a.type === 'Slam Dunk Contest Winner')
          contestByYear.set(a.season, { ...entry, dunk: { name: p.name, team: resolveTeamName(p, a.season) } });
        if (a.type === 'Three-Point Contest Winner')
          contestByYear.set(a.season, { ...entry, three: { name: p.name, team: resolveTeamName(p, a.season) } });
        if (a.type === 'Shooting Stars Winner') {
          const winner = { playerId: p.internalId, name: p.name, team: resolveTeamName(p, a.season) };
          contestByYear.set(a.season, {
            ...entry,
            shootingStars: entry.shootingStars.some(candidate => candidate.playerId === winner.playerId || candidate.name === winner.name)
              ? entry.shootingStars
              : [...entry.shootingStars, winner],
          });
        }
        if (a.type === 'Skills Challenge Winner')
          contestByYear.set(a.season, { ...entry, skills: { name: p.name, team: resolveTeamName(p, a.season) } });
        if (a.type === 'H-O-R-S-E Winner')
          contestByYear.set(a.season, { ...entry, horse: { name: p.name, team: resolveTeamName(p, a.season) } });
        if (a.type === 'The Throne')
          contestByYear.set(a.season, { ...entry, throne: { name: p.name, team: resolveTeamName(p, a.season) } });
      });
    });

    const contestForYear = (year: number): ContestLookup => {
      const sim = contestByYear.get(year);
      const sourceRow = history?.find(row => row.year === year);
      const sourceShootingStars = sourceRow?.shootingStarsWinners?.length
        ? sourceRow.shootingStarsWinners
        : sourceRow?.shootingStarsWinner
          ? [sourceRow.shootingStarsWinner]
          : isNbaHistoryMode && getHistoricalAllStarContestSummary(year).shootingStars
            ? [getHistoricalAllStarContestSummary(year).shootingStars!]
            : [];
      const source = !isFictional && year <= sourceHistoryCutoff
        ? {
            dunk: sourceRow?.dunkWinner ?? (isNbaHistoryMode ? getHistoricalAllStarContestSummary(year).dunk : null),
            three: sourceRow?.threePointWinner ?? (isNbaHistoryMode ? getHistoricalAllStarContestSummary(year).three : null),
            shootingStars: sourceShootingStars,
            skills: sourceRow?.skillsWinner ?? (isNbaHistoryMode ? getHistoricalAllStarContestSummary(year).skills : null),
            horse: sourceRow?.horseWinner ?? (isNbaHistoryMode ? getHistoricalAllStarContestSummary(year).horse : null),
          }
        : null;
      return {
        dunk: sim?.dunk ?? source?.dunk ?? null,
        three: sim?.three ?? source?.three ?? null,
        shootingStars: sim?.shootingStars.length ? sim.shootingStars : source?.shootingStars ?? [],
        skills: sim?.skills ?? source?.skills ?? null,
        horse: sim?.horse ?? source?.horse ?? null,
        throne: sim?.throne ?? null,
      };
    };

    const rowMap = new Map<number, Row>();

    if (!isFictional) {
      (history ?? []).forEach(h => {
        if (h.year > sourceHistoryCutoff) return;
        const played = hasPlayed(h.year);
        const contest = contestForYear(h.year);
        rowMap.set(h.year, {
          year: h.year,
          isCurrent: h.year === currentYear,
          isFuture: h.year > currentYear || !played,
          isSim: false,
          teams: played ? h.teams : [],
          winner: played ? h.winner : null,
          finalScore: played ? h.final_score : null,
          gameNote: played ? h.game_note : undefined,
          host: h.host_city || h.host_arena || h.host_teams.length > 0
            ? { city: h.host_city, arena: h.host_arena, teamNames: h.host_teams }
            : null,
          mvps: played ? (h.mvps ?? []) : [],
          dunkWinner: contest?.dunk ?? null,
          threeWinner: contest?.three ?? null,
          shootingStarsWinners: contest.shootingStars,
          skillsWinner: contest?.skills ?? null,
          horseWinner: contest?.horse ?? null,
          throneWinner: contest?.throne ?? null,
          bracketRecap: null,
          rsMvp: played ? h.risingStarsMvp ?? null : null,
        });
      });
    }

    Object.values(state.allStarHistory ?? {}).forEach(snapshot => {
      if (snapshot.season > currentYear) return;
      const existing = rowMap.get(snapshot.season);
      rowMap.set(snapshot.season, {
        year: snapshot.season,
        isCurrent: snapshot.season === currentYear,
        isFuture: false,
        isSim: true,
        teams: snapshot.teams,
        winner: snapshot.winner,
        finalScore: snapshot.finalScore,
        host: existing?.host ?? hostFromLeagueStats(snapshot.season, state.leagueStats),
        mvps: snapshot.mvp ? [snapshot.mvp] : [],
        dunkWinner: snapshot.dunkWinner ?? null,
        danceWinner: snapshot.danceWinner ?? null,
        threeWinner: snapshot.threePointWinner ?? null,
        shootingStarsWinners: snapshot.shootingStarsWinners?.length
          ? snapshot.shootingStarsWinners
          : snapshot.shootingStarsWinner ? [snapshot.shootingStarsWinner] : [],
        skillsWinner: snapshot.skillsWinner ?? null,
        horseWinner: snapshot.horseWinner ?? null,
        throneWinner: snapshot.throneWinner ?? null,
        bracketRecap: snapshot.bracketRecap ?? null,
        rsMvp: snapshot.risingStarsMvp ?? null,
      });
    });

    // Helper: build { name, team } from allStar contest result (fallback for current season
    // before autoSimAllStarWeekend has written awards to player records)
    const contestEntryFromAllStar = (winnerName: string | undefined, winnerId: string | undefined): ContestEntry | null => {
      if (!winnerName) return null;
      let teamName = '';
      if (winnerId) {
        const p = historyPlayerLookup.byId.get(winnerId);
        if (p) teamName = resolveTeamName(p, currentYear);
      }
      return { name: winnerName, team: teamName };
    };

    const activeAllStar = Number(state.allStar?.season) === currentYear ? state.allStar : undefined;
    const hasCurrentEventResult = !!activeAllStar && [
      activeAllStar.dunkContest,
      activeAllStar.danceContest,
      activeAllStar.threePointContest,
      activeAllStar.shootingStars,
      activeAllStar.skillsChallenge,
      activeAllStar.horseTournament,
      activeAllStar.throne,
    ].some(event => event?.complete);
    if (hasCurrentEventResult && !rowMap.has(currentYear)) {
      const contest = contestForYear(currentYear);
      rowMap.set(currentYear, {
        year: currentYear,
        isCurrent: true,
        isFuture: false,
        isSim: true,
        teams: [],
        winner: null,
        finalScore: null,
        host: hostFromLeagueStats(currentYear, state.leagueStats),
        mvps: [],
        dunkWinner: contest.dunk,
        danceWinner: activeAllStar?.danceContest?.complete ? activeAllStar.danceContest.winnerLabel : null,
        threeWinner: contest.three,
        shootingStarsWinners: contest.shootingStars,
        skillsWinner: contest.skills,
        horseWinner: contest.horse,
        throneWinner: contest.throne,
        bracketRecap: null,
        rsMvp: null,
      });
    }

    const boxSeason = (box: any): number => {
      const season = Number(box?.season);
      if (Number.isFinite(season) && season > 0) return season;
      const date = new Date(box?.date ?? '');
      return Number.isNaN(date.getTime()) ? currentYear : date.getUTCFullYear();
    };

    const topBoxPlayer = (box: any): { name: string; team: string } | null => {
      const homeTeam = box.homeTeamName ?? 'East';
      const awayTeam = box.awayTeamName ?? 'West';
      const rows = [
        ...(box.homeStats ?? []).map((stat: any) => ({ ...stat, team: homeTeam })),
        ...(box.awayStats ?? []).map((stat: any) => ({ ...stat, team: awayTeam })),
      ];
      const top = rows.sort((a: any, b: any) => (b.pts ?? 0) - (a.pts ?? 0) || (b.reb ?? 0) - (a.reb ?? 0) || (b.ast ?? 0) - (a.ast ?? 0))[0];
      return top?.name ? { name: top.name, team: top.team } : null;
    };

    const boxPriority = (box: any, championshipFlag: string, finalGids: number[]): number => {
      if (box?.[championshipFlag]) return 5;
      const gid = Number(box?.gameId);
      if (finalGids.includes(gid)) return 4;
      return 1;
    };

    const allStarBoxesBySeason = new Map<number, any>();
    const risingStarsMvpBySeason = new Map<number, ContestEntry>();
    const risingStarsMvpPriorityBySeason = new Map<number, number>();
    (state.boxScores ?? []).forEach((box: any) => {
      const season = boxSeason(box);
      if (!Number.isFinite(season) || season > currentYear) return;
      const playedDate = new Date(box?.date ?? '');
      if (Number.isNaN(playedDate.getTime()) || playedDate > currentDate) return;
      if (box.isRisingStars) {
        const priority = boxPriority(box, 'isRisingStarsChampionship', [90000, 91099]);
        const existingPriority = risingStarsMvpPriorityBySeason.get(season) ?? 0;
        const mvp = topBoxPlayer(box);
        if (mvp && priority >= existingPriority) {
          risingStarsMvpBySeason.set(season, mvp);
          risingStarsMvpPriorityBySeason.set(season, priority);
        }
        return;
      }
      if (!box.isAllStar) return;
      const existing = allStarBoxesBySeason.get(season);
      const priority = boxPriority(box, 'isAllStarChampionship', [90001, 90099]);
      const existingPriority = existing ? boxPriority(existing, 'isAllStarChampionship', [90001, 90099]) : 0;
      if (!existing || priority >= existingPriority) allStarBoxesBySeason.set(season, box);
    });

    allStarBoxesBySeason.forEach((box, season) => {
      if (historicalWhatIf && season <= sourceHistoryCutoff) return;
      const homeTeam = box.homeTeamName ?? 'East';
      const awayTeam = box.awayTeamName ?? 'West';
      const winner = didHomeTeamWin(box) ? homeTeam : awayTeam;
      const existing = rowMap.get(season);
      const contest = contestForYear(season);
      const mvp = topBoxPlayer(box);
      rowMap.set(season, {
        year: season,
        isCurrent: season === currentYear,
        isFuture: false,
        isSim: true,
        teams: [homeTeam, awayTeam],
        winner,
        finalScore: { [homeTeam]: box.homeScore, [awayTeam]: box.awayScore },
        host: existing?.host ?? hostFromLeagueStats(season, state.leagueStats),
        mvps: mvp ? [mvp] : [],
        dunkWinner: existing?.dunkWinner ?? contest?.dunk ?? null,
        danceWinner: existing?.danceWinner ?? null,
        threeWinner: existing?.threeWinner ?? contest?.three ?? null,
        shootingStarsWinners: existing?.shootingStarsWinners.length ? existing.shootingStarsWinners : contest.shootingStars,
        skillsWinner: existing?.skillsWinner ?? contest?.skills ?? null,
        horseWinner: existing?.horseWinner ?? contest?.horse ?? null,
        throneWinner: existing?.throneWinner ?? contest?.throne ?? null,
        bracketRecap: existing?.bracketRecap ?? null,
        rsMvp: existing?.rsMvp ?? risingStarsMvpBySeason.get(season) ?? null,
      });
    });

    // Source 2: sim results override for the current season's ASG
    if (asBox && asGameId) {
      const homeTeam = asBox.homeTeamName ?? 'East';
      const awayTeam = asBox.awayTeamName ?? 'West';
      const winner = didHomeTeamWin(asBox) ? homeTeam : awayTeam;
      const mvp = (state.allStar as any)?.gameMvp ?? (state.allStar as any)?.allStarGameResult?.mvp;
      const existing = rowMap.get(currentYear);
      const curContest = contestByYear.get(currentYear);
      const sourceContest = isNbaHistoryMode && currentYear <= sourceHistoryCutoff ? getHistoricalAllStarContestSummary(currentYear) : null;
      const asDunk = (state.allStar as any)?.dunkContest;
      const asDance = (state.allStar as any)?.danceContest;
      const asThree = (state.allStar as any)?.threePointContest;
      const asShootingStars = (state.allStar as any)?.shootingStars;
      const asSkills = (state.allStar as any)?.skillsChallenge;
      const asHorse = (state.allStar as any)?.horseTournament;
      const dunkWinner = curContest?.dunk ?? contestEntryFromAllStar(asDunk?.winnerName, asDunk?.winnerId) ?? sourceContest?.dunk ?? null;
      const threeWinner = curContest?.three ?? contestEntryFromAllStar(asThree?.winnerName, asThree?.winnerId) ?? sourceContest?.three ?? null;
      const shootingStarsWinners = curContest?.shootingStars.length ? curContest.shootingStars : (() => {
        const winnerTeam = asShootingStars?.teams?.find((team: any) => team.teamId === asShootingStars?.winnerTeamId);
        if (!winnerTeam?.playerNames?.length) return [];
        const realTeam = state.teams.find((team: any) => String(team.id) === String(winnerTeam.teamId));
        const team = realTeam ? getTeamFullName(getHistoricalTeamSnapshot(realTeam, currentYear)) : (winnerTeam.label ?? asShootingStars?.winnerLabel ?? '');
        return winnerTeam.playerNames.map((name: string, index: number) => ({ playerId: winnerTeam.playerIds?.[index], name, team }));
      })();
      if (shootingStarsWinners.length === 0 && sourceContest?.shootingStars) shootingStarsWinners.push(sourceContest.shootingStars);
      const skillsWinner = curContest?.skills ?? contestEntryFromAllStar(asSkills?.winnerName, asSkills?.winnerId) ?? sourceContest?.skills ?? null;
      const horseWinner = curContest?.horse ?? contestEntryFromAllStar(asHorse?.winnerName, asHorse?.winnerId) ?? sourceContest?.horse ?? null;
      const asThrone = (state.allStar as any)?.throne;
      const throneWinner = curContest?.throne ?? contestEntryFromAllStar(asThrone?.champion?.playerName, asThrone?.champion?.playerId);

      // Multi-game bracket recap (round-robin/knockout). For 2-team formats,
      // bracket exists but only has one game — skip the recap line.
      const bracket = (state.allStar as any)?.bracket;
      const playedGames = (bracket?.games ?? []).filter((g: any) => g.played);
      let bracketRecap: string | null = null;
      if (bracket && playedGames.length > 1) {
        const ranked = [...(bracket.teams ?? [])].sort((a: any, b: any) =>
          (b.wins ?? 0) - (a.wins ?? 0) || ((b.pf - b.pa) - (a.pf - a.pa))
        );
        bracketRecap = ranked
          .map((t: any) => `${t.abbrev} ${t.wins ?? 0}-${t.losses ?? 0}`)
          .join(' · ');
      }

      const rsBracket = (state.allStar as any)?.risingStarsBracket;
      const rsMvpRaw = (state.allStar as any)?.risingStarsMvp;
      const rsMvp: { name: string; team: string } | null = rsMvpRaw
        ? { name: rsMvpRaw.name, team: rsMvpRaw.team }
        : null;

      rowMap.set(currentYear, {
        year: currentYear,
        isCurrent: true,
        isFuture: false,
        isSim: true,
        teams: [homeTeam, awayTeam],
        winner,
        finalScore: { [homeTeam]: asBox.homeScore, [awayTeam]: asBox.awayScore },
        host: existing?.host ?? hostFromLeagueStats(currentYear, state.leagueStats),
        mvps: mvp ? [{ name: mvp.name ?? mvp, team: mvp.teamAbbrev ?? mvp.team ?? '' }] : [],
        dunkWinner,
        danceWinner: asDance?.complete ? asDance.winnerLabel : existing?.danceWinner ?? null,
        threeWinner,
        shootingStarsWinners,
        skillsWinner,
        horseWinner,
        throneWinner,
        bracketRecap,
        rsMvp,
      });
    }

    // Source 3: leagueStats.allStarHosts — fills in host city/arena for any year
    // that's not in the gist, or overrides if commissioner assigned their own host.
    const hosts = state.leagueStats?.allStarHosts ?? [];
    hosts.forEach((h: any) => {
      if (Number(h.year ?? 0) > maxVisibleYear) return;
      const existing = rowMap.get(h.year);
      const played = hasPlayed(h.year);
      if (existing) {
        // Commissioner host overrides gist host (in case of rename/move).
        existing.host = { city: h.city, arena: h.arena, teamIds: h.teamIds };
        return;
      }
      const contest = contestForYear(h.year);
      rowMap.set(h.year, {
        year: h.year,
        isCurrent: h.year === currentYear,
        isFuture: !played,
        isSim: false,
        teams: [],
        winner: null,
        finalScore: null,
        host: { city: h.city, arena: h.arena, teamIds: h.teamIds },
        mvps: [],
        dunkWinner: contest?.dunk ?? null,
        threeWinner: contest?.three ?? null,
        shootingStarsWinners: contest.shootingStars,
        skillsWinner: contest?.skills ?? null,
        horseWinner: contest?.horse ?? null,
        throneWinner: contest?.throne ?? null,
        bracketRecap: null,
        rsMvp: null,
      });
    });

    return Array.from(rowMap.values())
      .map(row => {
        if (hasPlayed(row.year)) return row;
        const active = Number(state.allStar?.season) === row.year ? state.allStar : undefined;
        const activeData = active as any;
        const risingStarsComplete = !!active?.risingStarsMvp && (
          state.boxScores.some(box => Number(box.gameId) === Number(active?.risingStarsGameId)) ||
          (active.risingStarsBracket?.games ?? []).some(game => game.played && game.round === 'final')
        );
        const hasResolvedEvent = risingStarsComplete || !!(
          active?.dunkContest?.complete || active?.danceContest?.complete || active?.threePointContest?.complete ||
          active?.shootingStars?.complete || active?.skillsChallenge?.complete || active?.horseTournament?.complete ||
          active?.throne?.complete
        );
        const shootingStarsTeam = active?.shootingStars?.teams?.find((team: any) => team.teamId === active.shootingStars?.winnerTeamId);
        return {
          ...row,
          isFuture: !hasResolvedEvent,
          teams: [],
          winner: null,
          finalScore: null,
          mvps: [],
          dunkWinner: active?.dunkContest?.complete
            ? row.dunkWinner ?? contestEntryFromAllStar(activeData.dunkContest.winnerName, active.dunkContest.winnerId)
            : null,
          danceWinner: active?.danceContest?.complete ? row.danceWinner ?? active.danceContest.winnerLabel : null,
          threeWinner: active?.threePointContest?.complete
            ? row.threeWinner ?? contestEntryFromAllStar(activeData.threePointContest.winnerName, active.threePointContest.winnerId)
            : null,
          shootingStarsWinners: active?.shootingStars?.complete
            ? row.shootingStarsWinners.length > 0 ? row.shootingStarsWinners : (shootingStarsTeam?.playerNames ?? []).map((name: string, index: number) => ({
                playerId: shootingStarsTeam?.playerIds?.[index],
                name,
                team: shootingStarsTeam?.label ?? active.shootingStars?.winnerLabel ?? '',
              }))
            : [],
          skillsWinner: active?.skillsChallenge?.complete
            ? row.skillsWinner ?? contestEntryFromAllStar(active.skillsChallenge.winnerName, active.skillsChallenge.winnerId)
            : null,
          horseWinner: active?.horseTournament?.complete
            ? row.horseWinner ?? contestEntryFromAllStar(active.horseTournament.winnerName, active.horseTournament.winnerId)
            : null,
          throneWinner: active?.throne?.complete
            ? row.throneWinner ?? contestEntryFromAllStar(active.throne.champion?.playerName, active.throne.champion?.playerId)
            : null,
          bracketRecap: null,
          rsMvp: risingStarsComplete
            ? row.rsMvp ?? { name: active?.risingStarsMvp?.name, team: active?.risingStarsMvp?.team }
            : null,
        };
      })
      .sort((a, b) => b.year - a.year);
  }, [history, historicalWhatIf, historyPlayerLookup, state.teams, state.players, state.boxScores, state.allStar, state.allStarHistory, state.leagueStats, state.date, state.leagueType, state.moddedLeagueBase, state.nbaStartYear, state.wnbaStartYear, isFictional, isNbaHistoryMode, isPba, isWnba]);

  const showRisingStars = !isWnba;
  const showDunk = !isWnba;
  const showShootingStars = !isWnba && (isShootingStarsEnabled(state.leagueStats) || rows.some(row => row.shootingStarsWinners.length > 0));
  const showDance = !isWnba && (state.leagueStats.uiMode === 'pba_isolated' || rows.some(row => row.danceWinner));
  const showSkills = isSkillsChallengeEnabled(state.leagueStats) || rows.some(row => row.skillsWinner);
  const showHorse = !isWnba && (state.leagueStats.allStarHorse === true || rows.some(row => row.horseWinner));
  const showThrone = !isWnba && (state.leagueStats.allStarThroneEnabled === true || rows.some(row => row.throneWinner));
  const columnCount = 6 + Number(showRisingStars) + Number(showDunk) + Number(showDance) +
    Number(showShootingStars) + Number(showSkills) + Number(showHorse) + Number(showThrone);

  if (quick.fullPageView) return quick.fullPageView;

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col">
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
        <div className="mb-6 shrink-0 flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <Trophy className="text-amber-400" size={32} />
              All-Star History
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            ← Back to Weekend
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col">
          <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                <tr>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">Year</th>
                  <th className="p-3 font-bold text-amber-400 border-b border-slate-800 whitespace-nowrap">Winner</th>
                  <th className="p-3 font-bold text-slate-400 border-b border-slate-800 whitespace-nowrap">Score</th>
                  <th className="p-3 font-bold text-slate-300 border-b border-slate-800 whitespace-nowrap">MVP</th>
                  {showRisingStars && (
                    <th className="p-3 font-bold text-sky-400 border-b border-slate-800 whitespace-nowrap">Rising Stars MVP 🌟</th>
                  )}
                  {showDunk && (
                    <th className="p-3 font-bold text-orange-400 border-b border-slate-800 whitespace-nowrap">Dunk 🏀</th>
                  )}
                  {showDance && (
                    <th className="p-3 font-bold text-fuchsia-300 border-b border-slate-800 whitespace-nowrap">Dance</th>
                  )}
                  <th className="p-3 font-bold text-blue-400 border-b border-slate-800 whitespace-nowrap">3PT 🎯</th>
                  {showShootingStars && (
                    <th className="p-3 font-bold text-sky-400 border-b border-slate-800 whitespace-nowrap">Shooting Stars</th>
                  )}
                  {showSkills && (
                    <th className="p-3 font-bold text-orange-400 border-b border-slate-800 whitespace-nowrap">Skills</th>
                  )}
                  {showHorse && (
                    <th className="p-3 font-bold text-yellow-300 border-b border-slate-800 whitespace-nowrap">H-O-R-S-E</th>
                  )}
                  {showThrone && (
                    <th className="p-3 font-bold text-yellow-400 border-b border-slate-800 whitespace-nowrap">Throne 👑</th>
                  )}
                  <th className="p-3 font-bold text-sky-400 border-b border-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-1"><MapPin size={12} /> Host</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={columnCount} className="p-6 text-center text-slate-500 italic">
                      {history === null ? 'Loading All-Star history…' : 'No All-Star history is available for this league yet.'}
                    </td>
                  </tr>
                )}
                {rows.map(row => (
                  <tr
                    key={row.year}
                    className={`group transition-colors ${
                      row.isCurrent ? 'bg-blue-950/20' :
                      row.isFuture ? 'bg-amber-950/10' :
                      'hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-sm">{row.year}</span>
                        {row.isCurrent && (
                          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">NOW</span>
                        )}
                        {row.isFuture && (
                          <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">UPCOMING</span>
                        )}
                        {row.bracketRecap && (
                          <span className="text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">BRACKET</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {row.winner ? (
                        <span className="font-bold text-amber-400 text-sm">{row.winner}</span>
                      ) : row.gameNote ? (
                        <span
                          className="cursor-help text-xs font-semibold text-slate-400 underline decoration-dotted underline-offset-4"
                          title={row.gameNote}
                          aria-label={row.gameNote}
                          tabIndex={0}
                        >
                          Cancelled
                        </span>
                      ) : (
                        <span className="italic text-xs text-slate-700">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {row.finalScore ? (
                        <div className="flex flex-col leading-tight gap-0.5">
                          <span className="text-xs text-slate-300">
                            {row.teams.map(t => `${t} ${row.finalScore![t] ?? '?'}`).join(' – ')}
                          </span>
                          {row.bracketRecap && (
                            <span className="text-[9px] text-purple-300/80 font-bold tracking-wide">
                              {row.bracketRecap}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="italic text-xs text-slate-700">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {(row.mvps.length > 0 ? row.mvps : [null]).map((mvp, index) => (
                          <MvpCell key={`${mvp?.name ?? 'none'}-${index}`} mvp={mvp} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                        ))}
                      </div>
                    </td>
                    {showRisingStars && (
                      <td className="p-3 whitespace-nowrap">
                        <MvpCell mvp={row.rsMvp} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                      </td>
                    )}
                    {showDunk && (
                      <td className="p-3 whitespace-nowrap">
                        <MvpCell mvp={row.dunkWinner} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                      </td>
                    )}
                    {showDance && (
                      <td className="p-3 whitespace-nowrap">
                        <span className="text-sm font-bold text-fuchsia-200">{row.danceWinner ?? '—'}</span>
                      </td>
                    )}
                    <td className="p-3 whitespace-nowrap">
                      <MvpCell mvp={row.threeWinner} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                    </td>
                    {showShootingStars && (
                      <td className="p-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5">
                          {(row.shootingStarsWinners.length > 0 ? row.shootingStarsWinners : [null]).map((winner, index) => (
                            <MvpCell key={`${winner?.playerId ?? winner?.name ?? 'none'}-${index}`} mvp={winner} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                          ))}
                        </div>
                      </td>
                    )}
                    {showSkills && (
                      <td className="p-3 whitespace-nowrap">
                        <MvpCell mvp={row.skillsWinner} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                      </td>
                    )}
                    {showHorse && (
                      <td className="p-3 whitespace-nowrap">
                        <MvpCell mvp={row.horseWinner} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                      </td>
                    )}
                    {showThrone && (
                      <td className="p-3 whitespace-nowrap">
                        <MvpCell mvp={row.throneWinner} teams={state.teams} playerLookup={historyPlayerLookup} season={row.year} onOpenPlayer={quick.openFor} allowSource={isNbaHistoryMode} />
                      </td>
                    )}
                    <td className="p-3 whitespace-nowrap">
                      <HostCell host={row.host} teams={state.teams} season={row.year} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {quick.portals}
    </div>
  );
};

function hostFromLeagueStats(year: number, leagueStats: any): { city: string; arena?: string; teamIds?: number[] } | null {
  const h = (leagueStats?.allStarHosts ?? []).find((x: any) => x.year === year);
  return h ? { city: h.city, arena: h.arena, teamIds: h.teamIds } : null;
}

export default AllStarHistoryView;
