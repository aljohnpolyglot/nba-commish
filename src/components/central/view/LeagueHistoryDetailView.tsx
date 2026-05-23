import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader, Shield, Trophy, Zap } from 'lucide-react';
import { getAllCachedSeasons, matchTeamByWikiName, useBRefSeason } from '../../../data/brefFetcher';
import { fetchCoachData, getCoachPhoto } from '../../../data/photos/coaches';
import { useGame } from '../../../store/GameContext';
import type { NBAPlayer } from '../../../types';
import { PlayerBioView } from './PlayerBioView';
import {
  aggregateSeason,
  applyBrefHistoryTeams,
  buildBestRecords,
  buildBrefAwardObject,
  buildDetailAwardObject,
  buildFlatHistoryTeams,
  buildHistoricalAllStarRoster,
  buildHistoryPlayerStub,
  buildSemifinalsMvpEntries,
  findHistoryPlayer,
  getLeaders,
  resolveHistoryAwardPlayers,
} from './leagueHistoryDetailData';
import {
  AllStarSection,
  AllTeamSection,
  AwardWinner,
  BestRecordsSection,
  ChampionHeroSection,
  COYWinner,
  LeaderColumnWithSeason,
  SemifinalsMvpsSection,
} from './LeagueHistoryDetailSections';

interface Props {
  season: number;
  onBack: () => void;
}

export const LeagueHistoryDetailView: React.FC<Props> = ({ season, onBack }) => {
  const { state } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const currentSeason = state.leagueStats.year;
  const isCurrent = season === currentSeason;
  const minGP = isCurrent ? 15 : 20;
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [coachPhotosReady, setCoachPhotosReady] = useState(false);
  const [notFoundName, setNotFoundName] = useState<string | null>(null);

  useEffect(() => {
    fetchCoachData().then(() => setCoachPhotosReady(true));
  }, []);

  const awardsAll = (state.historicalAwards as any[]) ?? [];
  const bbgmRecord = awardsAll.find((award) => Number(award.season) === Number(season) && !award.type) as any;
  const flatAwards = awardsAll.filter((award) => Number(award.season) === Number(season) && !!award.type);
  const flat = (type: string) => flatAwards.find((award) => award.type === type) ?? null;
  const getAwardEntry = (bbgmKey: string, flatType: string) => flat(flatType) ?? bbgmRecord?.[bbgmKey] ?? null;
  const findPlayer = (awardEntry: any) => findHistoryPlayer(state.players, awardEntry);

  const { data: bref, loading: brefLoading } = useBRefSeason(!isCurrent && !isFictional ? season : null);

  const awards = useMemo(() => {
    const resolved: Record<string, any> = {
      mvp: buildDetailAwardObject(getAwardEntry('mvp', 'MVP'), state.teams, state.players, season),
      dpoy: buildDetailAwardObject(getAwardEntry('dpoy', 'DPOY'), state.teams, state.players, season),
      smoy: buildDetailAwardObject(getAwardEntry('smoy', 'SMOY'), state.teams, state.players, season),
      mip: buildDetailAwardObject(getAwardEntry('mip', 'MIP'), state.teams, state.players, season),
      roy: buildDetailAwardObject(getAwardEntry('roy', 'ROY'), state.teams, state.players, season),
      finalsMvp: buildDetailAwardObject(getAwardEntry('finalsMvp', 'Finals MVP'), state.teams, state.players, season),
      coy: buildDetailAwardObject(getAwardEntry('coy', 'COY'), state.teams, state.players, season),
    };
    if (bref) {
      if (!resolved.mvp) resolved.mvp = buildBrefAwardObject(bref.mvp, state.teams, state.players, season);
      if (!resolved.dpoy) resolved.dpoy = buildBrefAwardObject(bref.dpoy, state.teams, state.players, season);
      if (!resolved.smoy) resolved.smoy = buildBrefAwardObject(bref.smoy, state.teams, state.players, season);
      if (!resolved.mip) resolved.mip = buildBrefAwardObject(bref.mip, state.teams, state.players, season);
      if (!resolved.roy) resolved.roy = buildBrefAwardObject(bref.roy, state.teams, state.players, season);
      if (!resolved.finalsMvp) resolved.finalsMvp = buildBrefAwardObject(bref.finalsMvp, state.teams, state.players, season);
      if (!resolved.coy) resolved.coy = buildBrefAwardObject(bref.coy, state.teams, state.players, season);
    }
    if (resolved.coy && coachPhotosReady) {
      const photo = getCoachPhoto(resolved.coy.name);
      if (photo) resolved.coy = { ...resolved.coy, imgURL: photo };
    }
    return resolved;
  }, [bref, coachPhotosReady, season, state.players, state.teams]);

  const champAward = flat('Champion');
  const runnerAward = flat('Runner Up');

  const champTeam = useMemo(() => {
    if (champAward) return state.teams.find((team: any) => team.id === champAward.tid) ?? null;

    let best: any = null;
    let maxRounds = -1;
    state.teams.forEach((team: any) => {
      const teamSeason = team.seasons?.find((entry: any) => Number(entry.season) === Number(season));
      if ((teamSeason?.playoffRoundsWon ?? -1) > maxRounds) {
        maxRounds = teamSeason?.playoffRoundsWon ?? -1;
        best = team;
      }
    });
    if (maxRounds > 0) return best;

    if (awards.finalsMvp) {
      for (const player of state.players) {
        const hit = player.awards?.find((award: any) => Number(award.season) === Number(season) && award.type === 'Finals MVP');
        if (!hit) continue;
        const stats = player.stats?.filter((stat: any) => Number(stat.season) === Number(season) && !stat.playoffs && (stat.tid ?? -1) >= 0) ?? [];
        const tid = stats.length ? stats.reduce((left: any, right: any) => (left.gp >= right.gp ? left : right)).tid : player.tid;
        return state.teams.find((team: any) => team.id === tid) ?? null;
      }
    }

    if (bref?.champion) {
      return (matchTeamByWikiName(bref.champion.name, state.teams as any[]) as any) ?? null;
    }
    return null;
  }, [awards.finalsMvp, bref, champAward, season, state.players, state.teams]);

  const runnerUpTeam = useMemo(() => {
    if (runnerAward) return state.teams.find((team: any) => team.id === runnerAward.tid) ?? null;

    let maxRounds = -1;
    state.teams.forEach((team: any) => {
      const teamSeason = team.seasons?.find((entry: any) => Number(entry.season) === Number(season));
      if ((teamSeason?.playoffRoundsWon ?? -1) > maxRounds) maxRounds = teamSeason?.playoffRoundsWon ?? -1;
    });
    if (maxRounds > 0) {
      let runner: any = null;
      state.teams.forEach((team: any) => {
        const teamSeason = team.seasons?.find((entry: any) => Number(entry.season) === Number(season));
        if (teamSeason?.playoffRoundsWon === maxRounds - 1) runner = team;
      });
      return runner;
    }

    if (bref?.runnerUp) {
      return (matchTeamByWikiName(bref.runnerUp.name, state.teams as any[]) as any) ?? null;
    }
    return null;
  }, [bref, runnerAward, season, state.teams]);

  const champRecord = champTeam?.seasons?.find((entry: any) => Number(entry.season) === Number(season));
  const runnerUpRecord = runnerUpTeam?.seasons?.find((entry: any) => Number(entry.season) === Number(season));
  const hasAllLeague = !!bbgmRecord?.allLeague || flatAwards.some((award) => award.type?.startsWith('All-NBA') || award.type?.startsWith('All-Defensive') || award.type?.startsWith('All-Rookie'));

  const handlePlayerClick = (awardEntry: any) => {
    const player = findPlayer(awardEntry);
    if (player) {
      setViewingPlayer(player as NBAPlayer);
      return;
    }
    if (awardEntry?.name) {
      setViewingPlayer(buildHistoryPlayerStub(awardEntry.name));
      return;
    }
    setNotFoundName(awardEntry?.name ?? 'Player');
  };

  const leaders = useMemo(() => ({
    pts: getLeaders(state.players, state.teams, season, 'PTS', 1, minGP),
    reb: getLeaders(state.players, state.teams, season, 'REB', 1, minGP),
    ast: getLeaders(state.players, state.teams, season, 'AST', 1, minGP),
    stl: getLeaders(state.players, state.teams, season, 'STL', 1, minGP),
    blk: getLeaders(state.players, state.teams, season, 'BLK', 1, minGP),
    tpm: getLeaders(state.players, state.teams, season, '3PM', 1, minGP),
    per: getLeaders(state.players, state.teams, season, 'PER', 1, minGP),
  }), [minGP, season, state.players, state.teams]);

  const allStarRoster = useMemo(() => {
    if (isCurrent && state.allStar?.roster?.length) return state.allStar.roster;
    return buildHistoricalAllStarRoster(state.players, state.teams, season);
  }, [isCurrent, season, state.allStar, state.players, state.teams]);

  const bestRecords = useMemo(() => buildBestRecords(state.teams, season, bref), [bref, season, state.teams]);

  const semifinalsMvps = useMemo(() => {
    const entries: any[] = bbgmRecord?.sfmvp ?? flatAwards.filter((award) => award.type === 'Semifinals MVP' || award.type === 'Conference Finals MVP') ?? [];
    return buildSemifinalsMvpEntries(entries, state.teams, state.players, season);
  }, [bbgmRecord, flatAwards, season, state.players, state.teams]);

  const awardCounts = useMemo(() => {
    const priorAwards = awardsAll.filter((award) => Number(award.season) <= Number(season));

    const countForPlayer = (name: string | undefined, flatType: string, bbgmKey: string) => {
      if (!name) return 1;
      return Math.max(1, priorAwards.reduce((count, award) => {
        if (award.type) return count + (award.type === flatType && award.name === name ? 1 : 0);
        return count + (award[bbgmKey]?.name === name ? 1 : 0);
      }, 0));
    };

    const countChamp = (teamId: number | undefined) => {
      if (teamId == null) return 1;
      const championSeasons = new Set<number>();
      for (const award of priorAwards) {
        if (award.type === 'Champion' && award.tid === teamId) championSeasons.add(Number(award.season));
      }
      if (!isFictional) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (year > Number(season) || !brefSeason.champion?.name) continue;
          const matched = matchTeamByWikiName(brefSeason.champion.name, state.teams as any[]);
          if (matched && (matched as any).id === teamId) championSeasons.add(year);
        }
      }
      return Math.max(championSeasons.size, 1);
    };

    const countRunnerUp = (teamId: number | undefined) => {
      if (teamId == null) return 1;
      const finalsSeasons = new Set<number>();
      for (const award of priorAwards) {
        if (award.type === 'Runner Up' && award.tid === teamId) finalsSeasons.add(Number(award.season));
      }
      if (!isFictional) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (year > Number(season) || !brefSeason.runnerUp?.name) continue;
          const matched = matchTeamByWikiName(brefSeason.runnerUp.name, state.teams as any[]);
          if (matched && (matched as any).id === teamId) finalsSeasons.add(year);
        }
      }
      return Math.max(finalsSeasons.size, 1);
    };

    const countAllStar = (playerName: string | undefined) => {
      if (!playerName) return 1;
      let count = 0;
      for (const player of state.players) {
        if (player.name !== playerName) continue;
        for (const award of player.awards ?? []) {
          if (award.type === 'All-Star' && Number(award.season) <= Number(season)) count++;
        }
      }
      return Math.max(count, 1);
    };

    const countAllNBA = (playerName: string | undefined) => {
      if (!playerName) return 1;
      let count = 0;
      for (const award of priorAwards) {
        if (award.type) {
          if (award.name === playerName && /^All-NBA/.test(award.type)) count++;
          continue;
        }
        for (const team of award.allLeague ?? []) {
          if ((team.players ?? []).some((player: any) => player.name === playerName)) count++;
        }
      }
      return Math.max(count, 1);
    };

    const countAllDef = (playerName: string | undefined) => {
      if (!playerName) return 1;
      let count = 0;
      for (const award of priorAwards) {
        if (award.type) {
          if (award.name === playerName && /^All-Defensive/.test(award.type)) count++;
          continue;
        }
        for (const team of award.allDefensive ?? []) {
          if ((team.players ?? []).some((player: any) => player.name === playerName)) count++;
        }
      }
      return Math.max(count, 1);
    };

    return { countForPlayer, countChamp, countRunnerUp, countAllStar, countAllNBA, countAllDef };
  }, [awardsAll, isFictional, season, state.players, state.teams]);

  const allNBATeams = useMemo(() => {
    const teams = bbgmRecord?.allLeague
      ? [
          { name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[0]?.players, state.teams, state.players) },
          { name: '2nd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[1]?.players, state.teams, state.players) },
          { name: '3rd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[2]?.players, state.teams, state.players) },
        ]
      : buildFlatHistoryTeams('All-NBA', ['First Team', 'Second Team', 'Third Team'], flatAwards, state.teams, state.players);
    return applyBrefHistoryTeams(
      teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, count: awardCounts.countAllNBA(player.name) })) })),
      bref?.allNBA ?? [],
      state.players,
      state.teams,
    );
  }, [awardCounts, bbgmRecord, bref, flatAwards, state.players, state.teams]);

  const allDefTeams = useMemo(() => {
    const teams = bbgmRecord?.allDefensive
      ? [
          { name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allDefensive[0]?.players, state.teams, state.players) },
          { name: '2nd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allDefensive[1]?.players, state.teams, state.players) },
        ]
      : buildFlatHistoryTeams('All-Defensive', ['First Team', 'Second Team'], flatAwards, state.teams, state.players);
    return applyBrefHistoryTeams(
      teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, count: awardCounts.countAllDef(player.name) })) })),
      bref?.allDefensive ?? [],
      state.players,
      state.teams,
    );
  }, [awardCounts, bbgmRecord, bref, flatAwards, state.players, state.teams]);

  const allRookieTeams = useMemo(() => {
    const teams = bbgmRecord?.allRookie
      ? [{ name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allRookie, state.teams, state.players) }]
      : buildFlatHistoryTeams('All-Rookie', ['First Team', 'Second Team'], flatAwards, state.teams, state.players);
    return applyBrefHistoryTeams(teams, bref?.allRookie ?? [], state.players, state.teams);
  }, [bbgmRecord, bref, flatAwards, state.players, state.teams]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer as any} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {notFoundName && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2">
            <span>Records not available for <span className="text-white">{notFoundName}</span></span>
            <button onClick={() => setNotFoundName(null)} className="text-slate-500 hover:text-white ml-1">✕</button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors shrink-0">
            <ChevronLeft size={16} /> League History
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            {season - 1}–{String(season).slice(-2)} Season
            {isCurrent && (
              <span className="text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                In Progress
              </span>
            )}
          </h2>
        </div>

        <ChampionHeroSection
          champTeam={champTeam}
          champRecord={champRecord}
          runnerUpTeam={runnerUpTeam}
          runnerUpRecord={runnerUpRecord}
          finalsMvp={awards.finalsMvp}
          isCurrent={isCurrent}
          countChamp={awardCounts.countChamp}
          countRunnerUp={awardCounts.countRunnerUp}
          onFinalsMvpClick={() => handlePlayerClick(getAwardEntry('finalsMvp', 'Finals MVP'))}
        />

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={13} className="text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Season Awards</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <AwardWinner label="MVP" award={awards.mvp} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mvp?.name, 'MVP', 'mvp')} onClick={() => handlePlayerClick(getAwardEntry('mvp', 'MVP'))} />
            <AwardWinner label="DPOY" award={awards.dpoy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.dpoy?.name, 'DPOY', 'dpoy')} onClick={() => handlePlayerClick(getAwardEntry('dpoy', 'DPOY'))} />
            <COYWinner award={awards.coy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.coy?.name, 'COY', 'coy')} />
            <AwardWinner label="SMOY" award={awards.smoy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.smoy?.name, 'SMOY', 'smoy')} onClick={() => handlePlayerClick(getAwardEntry('smoy', 'SMOY'))} />
            <AwardWinner label="MIP" award={awards.mip} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mip?.name, 'MIP', 'mip')} onClick={() => handlePlayerClick(getAwardEntry('mip', 'MIP'))} />
            <AwardWinner label="ROY" award={awards.roy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.roy?.name, 'ROY', 'roy')} onClick={() => handlePlayerClick(getAwardEntry('roy', 'ROY'))} />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={13} className="text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Stat Leaders
              <span className="ml-2 text-slate-600 font-normal normal-case text-[10px]">min {minGP} GP</span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {([
              { key: 'pts', title: 'Scoring', unit: 'PPG' },
              { key: 'reb', title: 'Rebounds', unit: 'RPG' },
              { key: 'ast', title: 'Assists', unit: 'APG' },
              { key: 'stl', title: 'Steals', unit: 'SPG' },
              { key: 'blk', title: 'Blocks', unit: 'BPG' },
              { key: 'tpm', title: '3-Pointers', unit: '3PM' },
              { key: 'per', title: 'PER', unit: 'PER' },
            ] as const).map(({ key, title, unit }) => (
              <LeaderColumnWithSeason
                key={key}
                title={title}
                unit={unit}
                leaders={(leaders as any)[key]}
                isCurrent={isCurrent}
                onPlayerClick={(player) => setViewingPlayer(player as NBAPlayer)}
              />
            ))}
          </div>
        </div>

        {brefLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
            <Loader size={14} className="animate-spin" />
            Loading season data…
          </div>
        ) : (hasAllLeague || bref) ? (
          <div className="space-y-6">
            <AllTeamSection label="All-NBA" icon={<Trophy size={12} />} iconColor="text-amber-400" teams={allNBATeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} showCount />
            <AllTeamSection label="All-Defensive" icon={<Shield size={12} />} iconColor="text-blue-400" teams={allDefTeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} showCount />
            <AllTeamSection label="All-Rookie" icon={<Zap size={12} />} iconColor="text-green-400" teams={allRookieTeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} />
          </div>
        ) : null}

        <BestRecordsSection bestRecords={bestRecords} />

        <SemifinalsMvpsSection
          semifinalsMvps={semifinalsMvps}
          onPlayerSelect={(player) => setViewingPlayer(player)}
          onPlayerMissing={(name) => setNotFoundName(name)}
        />

        <AllStarSection
          allStarRoster={allStarRoster}
          players={state.players}
          teams={state.teams}
          season={season}
          countAllStar={awardCounts.countAllStar}
          onPlayerSelect={(player) => setViewingPlayer(player)}
          onPlayerMissing={(name) => setNotFoundName(name)}
        />
      </div>
    </div>
  );
};
