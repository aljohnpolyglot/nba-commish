import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Loader, Shield, Trophy, Zap } from 'lucide-react';
import { getAllCachedSeasons, matchTeamByWikiName, useBRefSeason } from '../../../data/brefFetcher';
import { fetchCoachData, getCoachPhoto } from '../../../data/photos/coaches';
import { AwardService } from '../../../services/logic/AwardService';
import { useGame } from '../../../store/GameContext';
import type { NBAPlayer } from '../../../types';
import { getResolvedTeamLogoUrl } from '../../../utils/teamAssets';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
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
  PbaConferenceChampionsSection,
  SemifinalsMvpsSection,
} from './LeagueHistoryDetailSections';

interface Props {
  season: number;
  onBack: () => void;
}

export const LeagueHistoryDetailView: React.FC<Props> = ({ season, onBack }) => {
  const { state } = useGame();
  const isFictional = state.leagueType === 'fictional';
  const euroIsolated = state.leagueStats?.uiMode === 'euro_isolated';
  const pbaIsolated = state.leagueStats?.uiMode === 'pba_isolated';
  const currentSeason = state.leagueStats.year;
  const isCurrent = season === currentSeason;
  const minGP = isCurrent ? 15 : 20;
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);
  const [coachPhotosReady, setCoachPhotosReady] = useState(false);
  const [notFoundName, setNotFoundName] = useState<string | null>(null);

  useEffect(() => {
    fetchCoachData().then(() => setCoachPhotosReady(true));
  }, []);

  const awardsAll = useMemo(
    () => (state.historicalAwards as any[]) ?? [],
    [state.historicalAwards],
  );
  const pbaTeams = useMemo(
    () => (state.nonNBATeams ?? []).filter((team: any) => {
      const tid = Number(team.tid ?? team.id);
      return team.league === 'PBA' || (tid >= 2000 && tid < 2100);
    }),
    [state.nonNBATeams],
  );
  const historyTeams = useMemo(
    () => pbaIsolated ? pbaTeams : state.teams,
    [pbaIsolated, pbaTeams, state.teams],
  );
  const allLookupTeams = useMemo(
    () => pbaIsolated ? [...state.teams, ...pbaTeams] : state.teams,
    [pbaIsolated, pbaTeams, state.teams],
  );
  const bbgmRecord = useMemo(
    () => awardsAll.find((award) => Number(award.season) === Number(season) && !award.type) as any,
    [awardsAll, season],
  );
  const flatAwards = useMemo(
    () => awardsAll.filter((award) => Number(award.season) === Number(season) && !!award.type),
    [awardsAll, season],
  );
  const pbaAwardAliases = {
    mvp: ['MVP', 'Most Valuable Player'],
    dpoy: ['DPOY', 'Defensive Player of the Year'],
    smoy: ['SMOY', 'Mr. Quality Minutes'],
    mqm: ['Mr. Quality Minutes', 'Sixth Man of the Year', 'SMOY'],
    mip: ['MIP', 'Most Improved Player'],
    roy: ['ROY', 'Rookie of the Year'],
    finalsMvp: ['Finals MVP'],
    coy: ['COY', 'Coach of the Year'],
    scoringChampion: ['Scoring Champion'],
    bestImport: ['Best Import of the Conference'],
  } as const;
  const normalizePbaKey = (value: unknown) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
  const isNonWinnerNote = (value: unknown) => {
    const key = normalizePbaKey(value);
    return (
      key.includes('no tournament')
      || key.includes('not held')
      || key.includes('cancelled')
      || key.includes('canceled')
      || key.includes('pandemic')
      || key.includes('fiba world cup')
      || key.includes('asian games')
    );
  };
  const normalizePbaConferenceKey = (
    value: unknown,
  ): 'philippine' | 'commissioners' | 'governors' | null => {
    const haystack = normalizePbaKey(value);
    if (!haystack) return null;
    if (haystack.includes('governor')) return 'governors';
    if (haystack.includes('commissioner')) return 'commissioners';
    if (
      haystack.includes('philippine')
      || haystack.includes('all filipino')
      || haystack.includes('all philippine')
      || haystack.includes('jun bernardino')
    ) {
      return 'philippine';
    }
    return null;
  };
  const getPbaConferenceKey = (award: any): 'philippine' | 'commissioners' | 'governors' | null => {
    return normalizePbaConferenceKey([award?.conference, award?.source, award?.type].filter(Boolean).join(' '));
  };
  const isPbaTeamTid = (tid: unknown) => {
    const numericTid = Number(tid);
    return Number.isFinite(numericTid) && numericTid >= 2000 && numericTid < 2100;
  };
  const isPbaHistoryAward = (award: any) => {
    if (award?.uiMode === 'pba_isolated' || award?.competitionId === 'pba') return true;
    if (String(award?.competitionId ?? '').startsWith('pba-')) return true;
    if (isPbaTeamTid(award?.tid)) return true;
    if (getPbaConferenceKey(award) !== null) return true;
    const awardPlayer = findHistoryPlayer(state.players, award);
    if (awardPlayer && isPbaTeamTid(awardPlayer.tid)) return true;
    const awardTeam = allLookupTeams.find((candidate: any) => {
      const target = normalizePbaKey(award?.team ?? award?.name);
      if (!target) return false;
      const fullName = normalizePbaKey(getTeamFullName(candidate as any) || candidate?.name || '');
      const shortName = normalizePbaKey(candidate?.name || '');
      const abbrev = normalizePbaKey(candidate?.abbrev || '');
      return (
        fullName === target
        || shortName === target
        || abbrev === target
        || fullName.includes(target)
        || target.includes(fullName)
        || shortName.includes(target)
        || target.includes(shortName)
      );
    });
    if (awardTeam) return true;
    const key = normalizePbaKey([award?.source, award?.awardName, award?.award_name, award?.conference, award?.competitionId].filter(Boolean).join(' '));
    return key.includes('pba');
  };
  const isEuroHistoryAward = (award: any) => {
    if (award?.uiMode === 'euro_isolated') return true;
    if (['euroleague', 'endesa', 'liga_acb', 'liga-acb'].includes(String(award?.competitionId ?? '').toLowerCase())) return true;
    const key = normalizePbaKey([award?.source, award?.awardName, award?.award_name, award?.type, award?.competitionId].filter(Boolean).join(' '));
    return (
      key.includes('euroleague')
      || key.includes('euro league')
      || key.includes('liga acb')
      || key.includes('endesa')
      || key.includes('alphonso ford')
      || key.includes('gomelskiy')
      || key.includes('final four mvp')
      || key.includes('all euroleague')
    );
  };
  const scopedFlatAwards = useMemo(
    () => pbaIsolated
      ? flatAwards.filter(isPbaHistoryAward)
      : euroIsolated
        ? flatAwards.filter(isEuroHistoryAward)
        : flatAwards,
    [euroIsolated, flatAwards, pbaIsolated],
  );
  const flat = (types: string | readonly string[]) => {
    const list = Array.isArray(types) ? types : [types];
    return scopedFlatAwards.find((award) => list.includes(String(award.type))) ?? null;
  };
  const getAwardEntry = (bbgmKey: string, flatTypes: string | readonly string[]) => {
    const flatHit = flat(flatTypes);
    if (pbaIsolated || euroIsolated) return flatHit;
    return flatHit ?? bbgmRecord?.[bbgmKey] ?? null;
  };
  const getPbaConferenceAward = (types: string | readonly string[], conference: 'philippine' | 'commissioners' | 'governors') => {
    const list = Array.isArray(types) ? types : [types];
    return scopedFlatAwards.find((award) =>
      list.includes(String(award.type))
      && getPbaConferenceKey(award) === conference
      && !isNonWinnerNote(award?.name ?? award?.team),
    ) ?? null;
  };
  const getPbaBestImportAward = () =>
    getPbaConferenceAward(pbaAwardAliases.bestImport, 'governors')
    ?? getPbaConferenceAward(pbaAwardAliases.bestImport, 'commissioners')
    ?? getPbaConferenceAward(pbaAwardAliases.bestImport, 'philippine');
  const findPbaTeamByName = React.useCallback((rawName?: string | null) => {
    const target = normalizePbaKey(rawName);
    if (!target) return null;
    return allLookupTeams.find((candidate: any) => {
      const fullName = normalizePbaKey(getTeamFullName(candidate as any) || candidate?.name || '');
      const shortName = normalizePbaKey(candidate?.name || '');
      const abbrev = normalizePbaKey(candidate?.abbrev || '');
      return (
        fullName === target
        || shortName === target
        || abbrev === target
        || fullName.includes(target)
        || target.includes(fullName)
        || shortName.includes(target)
        || target.includes(shortName)
      );
    }) ?? null;
  }, [allLookupTeams]);
  const getPbaDisplayTeam = React.useCallback((team: any, fallbackName?: string | null) => {
    const name = getTeamFullName(team as any) || team?.name || fallbackName || '';
    if (!name) return null;
    const tid = team?.id ?? team?.tid;
    return {
      ...(team ?? {}),
      id: tid,
      tid,
      name,
      abbrev: team?.abbrev ?? String(name).slice(0, 3).toUpperCase(),
      logoUrl: getResolvedTeamLogoUrl(team ?? { name, abbrev: team?.abbrev, league: 'PBA' }),
    };
  }, []);
  const getPbaConferenceSeasonCandidates = React.useCallback((
    _conference: 'philippine' | 'commissioners' | 'governors',
  ) => {
    const primary = Number(season);
    return [primary];
  }, [season]);
  const findPlayer = (awardEntry: any) => findHistoryPlayer(state.players, awardEntry);
  const shouldGroupAllStarsByConference = useMemo(() => {
    const format = String(state.leagueStats?.allStarFormat ?? 'east_vs_west').toLowerCase();
    return format === 'east_vs_west' || format === 'east vs west';
  }, [state.leagueStats?.allStarFormat]);
  const withLiveRecordFallback = React.useCallback((team: any, row: any) => {
    if (!team) return row;
    const rowWon = row?.won ?? row?.wins;
    const rowLost = row?.lost ?? row?.losses;
    const liveWon = team.wins;
    const liveLost = team.losses;
    const shouldUseLiveFallback =
      (rowWon == null && rowLost == null && liveWon != null && liveLost != null)
      || ((rowWon ?? 0) + (rowLost ?? 0) === 0 && (liveWon ?? 0) + (liveLost ?? 0) > 0);
    if (!shouldUseLiveFallback) return row;
    return {
      ...(row ?? {}),
      won: liveWon,
      lost: liveLost,
      wins: liveWon,
      losses: liveLost,
    };
  }, []);

  const { data: bref, loading: brefLoading } = useBRefSeason(!isCurrent && !isFictional && !pbaIsolated && !euroIsolated ? season : null);

  const awards = useMemo(() => {
    const resolved: Record<string, any> = {
      mvp: buildDetailAwardObject(getAwardEntry('mvp', pbaIsolated ? pbaAwardAliases.mvp : 'MVP'), allLookupTeams, state.players, season),
      dpoy: buildDetailAwardObject(getAwardEntry('dpoy', pbaIsolated ? pbaAwardAliases.dpoy : 'DPOY'), allLookupTeams, state.players, season),
      smoy: buildDetailAwardObject(getAwardEntry('smoy', pbaIsolated ? pbaAwardAliases.smoy : 'SMOY'), allLookupTeams, state.players, season),
      mqm: buildDetailAwardObject(getAwardEntry('smoy', pbaIsolated ? pbaAwardAliases.mqm : 'SMOY'), allLookupTeams, state.players, season),
      mip: buildDetailAwardObject(getAwardEntry('mip', pbaIsolated ? pbaAwardAliases.mip : 'MIP'), allLookupTeams, state.players, season),
      roy: buildDetailAwardObject(getAwardEntry('roy', pbaIsolated ? pbaAwardAliases.roy : 'ROY'), allLookupTeams, state.players, season),
      finalsMvp: buildDetailAwardObject(pbaIsolated ? getPbaConferenceAward(pbaAwardAliases.finalsMvp, 'philippine') : getAwardEntry('finalsMvp', pbaAwardAliases.finalsMvp), allLookupTeams, state.players, season),
      coy: buildDetailAwardObject(getAwardEntry('coy', pbaIsolated ? pbaAwardAliases.coy : 'COY'), allLookupTeams, state.players, season),
      scoringChampion: buildDetailAwardObject(getAwardEntry('mvp', pbaAwardAliases.scoringChampion), allLookupTeams, state.players, season),
      bestImport: buildDetailAwardObject(pbaIsolated ? getPbaBestImportAward() : getAwardEntry('mvp', pbaAwardAliases.bestImport), allLookupTeams, state.players, season),
    };
    if (bref) {
      if (!resolved.mvp) resolved.mvp = buildBrefAwardObject(bref.mvp, allLookupTeams, state.players, season);
      if (!resolved.dpoy) resolved.dpoy = buildBrefAwardObject(bref.dpoy, allLookupTeams, state.players, season);
      if (!resolved.smoy) resolved.smoy = buildBrefAwardObject(bref.smoy, allLookupTeams, state.players, season);
      if (!resolved.mip) resolved.mip = buildBrefAwardObject(bref.mip, allLookupTeams, state.players, season);
      if (!resolved.roy) resolved.roy = buildBrefAwardObject(bref.roy, allLookupTeams, state.players, season);
      if (!resolved.finalsMvp) resolved.finalsMvp = buildBrefAwardObject(bref.finalsMvp, allLookupTeams, state.players, season);
      if (!resolved.coy) resolved.coy = buildBrefAwardObject(bref.coy, allLookupTeams, state.players, season);
    }
    if (resolved.coy && coachPhotosReady) {
      const photo = getCoachPhoto(resolved.coy.name);
      if (photo) resolved.coy = { ...resolved.coy, imgURL: photo };
    }
    return resolved;
  }, [allLookupTeams, bref, coachPhotosReady, euroIsolated, pbaIsolated, scopedFlatAwards, season, state.players]);

  const champAward = pbaIsolated ? getPbaConferenceAward(['Champion'], 'philippine') : flat('Champion');
  const runnerAward = pbaIsolated ? getPbaConferenceAward(['Runner Up'], 'philippine') : flat('Runner Up');

  const champTeam = useMemo(() => {
    if (champAward) return allLookupTeams.find((team: any) => (team.id ?? team.tid) === champAward.tid) ?? null;

    let best: any = null;
    let maxRounds = -1;
    historyTeams.forEach((team: any) => {
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
        return allLookupTeams.find((team: any) => (team.id ?? team.tid) === tid) ?? null;
      }
    }

    if (bref?.champion) {
      return (matchTeamByWikiName(bref.champion.name, allLookupTeams as any[]) as any) ?? null;
    }
    return null;
  }, [allLookupTeams, awards.finalsMvp, bref, champAward, historyTeams, season, state.players]);

  const runnerUpTeam = useMemo(() => {
    if (pbaIsolated) return null;
    if (runnerAward) return allLookupTeams.find((team: any) => (team.id ?? team.tid) === runnerAward.tid) ?? null;

    let maxRounds = -1;
    historyTeams.forEach((team: any) => {
      const teamSeason = team.seasons?.find((entry: any) => Number(entry.season) === Number(season));
      if ((teamSeason?.playoffRoundsWon ?? -1) > maxRounds) maxRounds = teamSeason?.playoffRoundsWon ?? -1;
    });
    if (maxRounds > 0) {
      let runner: any = null;
      historyTeams.forEach((team: any) => {
        const teamSeason = team.seasons?.find((entry: any) => Number(entry.season) === Number(season));
        if (teamSeason?.playoffRoundsWon === maxRounds - 1) runner = team;
      });
      return runner;
    }

    if (bref?.runnerUp) {
      return (matchTeamByWikiName(bref.runnerUp.name, allLookupTeams as any[]) as any) ?? null;
    }
    return null;
  }, [allLookupTeams, bref, historyTeams, runnerAward, season]);

  const champRecord = withLiveRecordFallback(
    champTeam,
    champTeam?.seasons?.find((entry: any) => Number(entry.season) === Number(season)),
  );
  const runnerUpRecord = withLiveRecordFallback(
    runnerUpTeam,
    runnerUpTeam?.seasons?.find((entry: any) => Number(entry.season) === Number(season)),
  );
  const hasAllLeague = !pbaIsolated && !euroIsolated && (!!bbgmRecord?.allLeague || flatAwards.some((award) => award.type?.startsWith('All-NBA') || award.type?.startsWith('All-Defensive') || award.type?.startsWith('All-Rookie')));

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
    pts: getLeaders(state.players, historyTeams, season, 'PTS', 1, minGP),
    reb: getLeaders(state.players, historyTeams, season, 'REB', 1, minGP),
    ast: getLeaders(state.players, historyTeams, season, 'AST', 1, minGP),
    stl: getLeaders(state.players, historyTeams, season, 'STL', 1, minGP),
    blk: getLeaders(state.players, historyTeams, season, 'BLK', 1, minGP),
    tpm: getLeaders(state.players, historyTeams, season, '3PM', 1, minGP),
    per: getLeaders(state.players, historyTeams, season, 'PER', 1, minGP),
  }), [historyTeams, minGP, season, state.players]);

  const liveAwardRaces = useMemo(() => (
    isCurrent && !pbaIsolated
      ? AwardService.calculateAwardRaces(
          state.players as any,
          state.teams as any,
          season,
          state.staff as any,
          state.leagueStats.minGamesRequirement,
        )
      : null
  ), [isCurrent, pbaIsolated, season, state.leagueStats.minGamesRequirement, state.players, state.staff, state.teams]);

  const allStarRoster = useMemo(() => {
    const normalizeConference = (rawConference: any, fallbackConference: any) => {
      const raw = String(rawConference ?? fallbackConference ?? '').trim();
      const lower = raw.toLowerCase();
      if (lower.startsWith('east')) return 'East';
      if (lower.startsWith('west')) return 'West';
      return raw || null;
    };
    if (isCurrent && state.allStar?.roster?.length) {
      const normalized = (state.allStar.roster ?? [])
        .map((entry: any) => {
          const player = state.players.find((candidate: any) => String(candidate.internalId) === String(entry?.playerId));
          const team = player ? allLookupTeams.find((candidate: any) => (candidate.id ?? candidate.tid) === player.tid) : allLookupTeams.find((candidate: any) => candidate.abbrev === entry?.teamAbbrev);
          const conference = normalizeConference(entry?.conference, (team as any)?.conference);
          return { ...entry, teamAbbrev: entry?.teamAbbrev ?? team?.abbrev ?? '', conference };
        })
        .filter((entry: any) => entry && entry.playerId && entry.playerName);
      if (normalized.length > 0) return normalized;
    }
    return buildHistoricalAllStarRoster(state.players, historyTeams, season);
  }, [allLookupTeams, historyTeams, isCurrent, season, state.allStar, state.players]);

  const bestRecords = useMemo(() => buildBestRecords(historyTeams, season, bref), [bref, historyTeams, season]);

  const semifinalsMvps = useMemo(() => {
    if (pbaIsolated) return [];
    const entries: any[] = bbgmRecord?.sfmvp ?? scopedFlatAwards.filter((award) => award.type === 'Semifinals MVP' || award.type === 'Conference Finals MVP') ?? [];
    return buildSemifinalsMvpEntries(entries, allLookupTeams, state.players, season);
  }, [allLookupTeams, bbgmRecord, pbaIsolated, scopedFlatAwards, season, state.players]);

  const awardCounts = useMemo(() => {
    const priorAwards = awardsAll.filter((award) => Number(award.season) <= Number(season));

    const countForPlayer = (name: string | undefined, flatTypes: string | readonly string[], bbgmKey: string) => {
      if (!name) return 1;
      const list = Array.isArray(flatTypes) ? flatTypes : [flatTypes];
      return Math.max(1, priorAwards.reduce((count, award) => {
        if (award.type) return count + (list.includes(String(award.type)) && award.name === name ? 1 : 0);
        return count + (award[bbgmKey]?.name === name ? 1 : 0);
      }, 0));
    };

    const countChamp = (teamId: number | undefined) => {
      if (teamId == null) return 1;
      const championSeasons = new Set<number>();
      for (const award of priorAwards) {
        if (award.type === 'Champion' && award.tid === teamId) championSeasons.add(Number(award.season));
      }
      if (!isFictional && !pbaIsolated) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (year > Number(season) || !brefSeason.champion?.name) continue;
          const matched = matchTeamByWikiName(brefSeason.champion.name, allLookupTeams as any[]);
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
      if (!isFictional && !pbaIsolated) {
        for (const [year, brefSeason] of getAllCachedSeasons().entries()) {
          if (year > Number(season) || !brefSeason.runnerUp?.name) continue;
          const matched = matchTeamByWikiName(brefSeason.runnerUp.name, allLookupTeams as any[]);
          if (matched && (matched as any).id === teamId) finalsSeasons.add(year);
        }
      }
      return Math.max(finalsSeasons.size, 1);
    };

    const countPbaConferenceChampions = (teamId: number | undefined, conference?: string) => {
      if (teamId == null) return 1;
      const entries = Array.isArray(state.leagueStats?.pbaConferenceChampions) ? state.leagueStats.pbaConferenceChampions : [];
      const seasons = new Set<number>();
      for (const entry of entries) {
        if (Number(entry?.teamId) !== Number(teamId)) continue;
        if (conference && normalizePbaConferenceKey(entry?.conference) !== conference) continue;
        if (Number(entry?.season) > Number(season)) continue;
        seasons.add(Number(entry.season));
      }
      return Math.max(seasons.size, 1);
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

    return { countForPlayer, countChamp, countRunnerUp, countPbaConferenceChampions, countAllStar, countAllNBA, countAllDef };
  }, [allLookupTeams, awardsAll, isFictional, pbaIsolated, season, state.leagueStats?.pbaConferenceChampions, state.players]);

  const hasFlatAllNBA = flatAwards.some((award) => award.type?.startsWith('All-NBA'));
  const hasFlatAllDef = flatAwards.some((award) => award.type?.startsWith('All-Defensive'));
  const hasFlatAllRookie = flatAwards.some((award) => award.type?.startsWith('All-Rookie'));

  const pbaConferenceChampions = useMemo(() => {
    if (!pbaIsolated) return [];
    const entries = Array.isArray(state.leagueStats?.pbaConferenceChampions) ? state.leagueStats.pbaConferenceChampions : [];
    const conferenceMeta = [
      { key: 'philippine', label: 'Philippine Cup Champion', accent: 'amber' },
      { key: 'commissioners', label: "Commissioner's Cup Champion", accent: 'sky' },
      { key: 'governors', label: "Governors' Cup Champion", accent: 'emerald' },
    ] as const;

    return conferenceMeta.map((meta) => {
      const seasonCandidates = getPbaConferenceSeasonCandidates(meta.key);
      const entry = [...entries].reverse().find((candidate: any) =>
        seasonCandidates.includes(Number(candidate?.season))
        && normalizePbaConferenceKey(candidate?.conference) === meta.key
        && !isNonWinnerNote(candidate?.teamName ?? candidate?.name),
      );
      const award = scopedFlatAwards.find((candidate: any) =>
        seasonCandidates.includes(Number(candidate?.season))
        && candidate?.type === 'Champion'
        && getPbaConferenceKey(candidate) === meta.key
        && !isNonWinnerNote(candidate?.name ?? candidate?.team),
      ) ?? null;
      const entryTeamId = (entry as any)?.teamId ?? (entry as any)?.tid;
      const resolvedTeam = entryTeamId != null
        ? resolveAnyTeam(Number(entryTeamId), state.teams as any, state.nonNBATeams ?? []) ?? null
        : award?.tid != null
          ? resolveAnyTeam(Number(award.tid), state.teams as any, state.nonNBATeams ?? []) ?? null
          : findPbaTeamByName(award?.team ?? award?.name ?? entry?.teamName);
      const team = getPbaDisplayTeam(resolvedTeam, award?.team ?? award?.name ?? entry?.teamName);
      const teamAny = team as any;
      const record = teamAny?.seasons?.find((candidate: any) => Number(candidate.season) === Number(season)) ?? null;
      return {
        key: meta.key,
        label: meta.label,
        accent: meta.accent,
        team,
        record,
        count: teamAny ? awardCounts.countPbaConferenceChampions(teamAny.id ?? teamAny.tid, meta.key) : 0,
      };
    });
  }, [awardCounts, findPbaTeamByName, getPbaConferenceSeasonCandidates, getPbaDisplayTeam, pbaIsolated, scopedFlatAwards, season, state.leagueStats?.pbaConferenceChampions, state.nonNBATeams, state.teams]);

  const pbaMythicalTeams = useMemo(() => {
    if (!pbaIsolated) return [];
    return buildFlatHistoryTeams('PBA Mythical', ['First Team', 'Second Team'], scopedFlatAwards, allLookupTeams, state.players);
  }, [allLookupTeams, pbaIsolated, scopedFlatAwards, state.players]);

  const allNBATeams = useMemo(() => {
    if (liveAwardRaces) {
      return [
        { name: '1st Team', players: liveAwardRaces.allNBATeams.allNBA[0].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player, count: awardCounts.countAllNBA(spot.player.name) })) },
        { name: '2nd Team', players: liveAwardRaces.allNBATeams.allNBA[1].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player, count: awardCounts.countAllNBA(spot.player.name) })) },
        { name: '3rd Team', players: liveAwardRaces.allNBATeams.allNBA[2].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player, count: awardCounts.countAllNBA(spot.player.name) })) },
      ];
    }
    const teams = !hasFlatAllNBA && bbgmRecord?.allLeague
      ? [
          { name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[0]?.players, allLookupTeams, state.players) },
          { name: '2nd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[1]?.players, allLookupTeams, state.players) },
          { name: '3rd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allLeague[2]?.players, allLookupTeams, state.players) },
        ]
      : buildFlatHistoryTeams('All-NBA', ['First Team', 'Second Team', 'Third Team'], flatAwards, allLookupTeams, state.players);
    return applyBrefHistoryTeams(
      teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, count: awardCounts.countAllNBA(player.name) })) })),
      bref?.allNBA ?? [],
      state.players,
      allLookupTeams,
    );
  }, [allLookupTeams, awardCounts, bbgmRecord, bref, flatAwards, hasFlatAllNBA, liveAwardRaces, state.players]);

  const allDefTeams = useMemo(() => {
    if (liveAwardRaces) {
      return [
        { name: '1st Team', players: liveAwardRaces.allNBATeams.allDefense[0].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player, count: awardCounts.countAllDef(spot.player.name) })) },
        { name: '2nd Team', players: liveAwardRaces.allNBATeams.allDefense[1].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player, count: awardCounts.countAllDef(spot.player.name) })) },
      ];
    }
    const teams = pbaIsolated
      ? [{
          name: 'Team',
          players: resolveHistoryAwardPlayers(
            scopedFlatAwards.filter((award) => {
              const key = normalizePbaKey(award.type);
              return key === 'pba all defensive team';
            }),
            allLookupTeams,
            state.players,
          ),
        }]
      : !hasFlatAllDef && bbgmRecord?.allDefensive
        ? [
            { name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allDefensive[0]?.players, allLookupTeams, state.players) },
            { name: '2nd Team', players: resolveHistoryAwardPlayers(bbgmRecord.allDefensive[1]?.players, allLookupTeams, state.players) },
          ]
        : buildFlatHistoryTeams('All-Defensive', ['First Team', 'Second Team'], flatAwards, allLookupTeams, state.players);
    return applyBrefHistoryTeams(
      teams.map((team) => ({ ...team, players: team.players.map((player) => ({ ...player, count: awardCounts.countAllDef(player.name) })) })),
      bref?.allDefensive ?? [],
      state.players,
      allLookupTeams,
    );
  }, [allLookupTeams, awardCounts, bbgmRecord, bref, flatAwards, hasFlatAllDef, liveAwardRaces, scopedFlatAwards, state.players]);

  const allRookieTeams = useMemo(() => {
    if (liveAwardRaces) {
      return [
        { name: '1st Team', players: liveAwardRaces.allNBATeams.allRookie[0].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player })) },
        { name: '2nd Team', players: liveAwardRaces.allNBATeams.allRookie[1].map((spot: any) => ({ name: spot.player.name, team: spot.team?.abbrev ?? 'FA', imgURL: spot.player.imgURL, face: (spot.player as any)?.face, teamLogoUrl: spot.team?.logoUrl, playerRef: spot.player })) },
      ];
    }
    const teams = pbaIsolated
      ? [{
          name: 'Team',
          players: resolveHistoryAwardPlayers(
            scopedFlatAwards.filter((award) => {
              const key = normalizePbaKey(award.type);
              return key === 'pba all rookie team';
            }),
            allLookupTeams,
            state.players,
          ),
        }]
      : !hasFlatAllRookie && bbgmRecord?.allRookie
        ? [{ name: '1st Team', players: resolveHistoryAwardPlayers(bbgmRecord.allRookie, allLookupTeams, state.players) }]
        : buildFlatHistoryTeams('All-Rookie', ['First Team', 'Second Team'], flatAwards, allLookupTeams, state.players);
    return applyBrefHistoryTeams(teams, bref?.allRookie ?? [], state.players, allLookupTeams);
  }, [allLookupTeams, bbgmRecord, bref, flatAwards, hasFlatAllRookie, liveAwardRaces, scopedFlatAwards, state.players]);

  const hasPbaTeamAwards = pbaIsolated && (pbaMythicalTeams.length > 0 || allDefTeams.length > 0 || allRookieTeams.length > 0);

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

        {pbaIsolated ? (
          <PbaConferenceChampionsSection champions={pbaConferenceChampions} isCurrent={isCurrent} />
        ) : (
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
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={13} className="text-slate-400" />
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              {pbaIsolated ? 'PBA Season Awards' : 'Season Awards'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <AwardWinner label="MVP" award={awards.mvp} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mvp?.name, pbaIsolated ? pbaAwardAliases.mvp : 'MVP', 'mvp')} onClick={() => handlePlayerClick(getAwardEntry('mvp', pbaIsolated ? pbaAwardAliases.mvp : 'MVP'))} />
            <AwardWinner label="DPOY" award={awards.dpoy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.dpoy?.name, pbaIsolated ? pbaAwardAliases.dpoy : 'DPOY', 'dpoy')} onClick={() => handlePlayerClick(getAwardEntry('dpoy', pbaIsolated ? pbaAwardAliases.dpoy : 'DPOY'))} />
            <COYWinner award={awards.coy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.coy?.name, pbaIsolated ? pbaAwardAliases.coy : 'COY', 'coy')} />
            {pbaIsolated && (
              <AwardWinner label="SC" award={awards.scoringChampion} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.scoringChampion?.name, pbaAwardAliases.scoringChampion, 'mvp')} onClick={() => handlePlayerClick(getAwardEntry('mvp', pbaAwardAliases.scoringChampion))} />
            )}
            <AwardWinner label="SMOY" award={awards.smoy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.smoy?.name, pbaIsolated ? pbaAwardAliases.smoy : 'SMOY', 'smoy')} onClick={() => handlePlayerClick(getAwardEntry('smoy', pbaIsolated ? pbaAwardAliases.smoy : 'SMOY'))} />
            {pbaIsolated && (
              <AwardWinner label="MQM" award={awards.mqm} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mqm?.name, pbaAwardAliases.mqm, 'smoy')} onClick={() => handlePlayerClick(getAwardEntry('smoy', pbaAwardAliases.mqm))} />
            )}
            {pbaIsolated && (
              <AwardWinner label="Best Import" award={awards.bestImport} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.bestImport?.name, pbaAwardAliases.bestImport, 'mvp')} onClick={() => handlePlayerClick(getPbaBestImportAward())} />
            )}
            <AwardWinner label="MIP" award={awards.mip} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.mip?.name, pbaIsolated ? pbaAwardAliases.mip : 'MIP', 'mip')} onClick={() => handlePlayerClick(getAwardEntry('mip', pbaIsolated ? pbaAwardAliases.mip : 'MIP'))} />
            <AwardWinner label="ROY" award={awards.roy} isCurrent={isCurrent} winCount={awardCounts.countForPlayer(awards.roy?.name, pbaIsolated ? pbaAwardAliases.roy : 'ROY', 'roy')} onClick={() => handlePlayerClick(getAwardEntry('roy', pbaIsolated ? pbaAwardAliases.roy : 'ROY'))} />
          </div>
        </div>

        {!pbaIsolated ? (
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
        ) : null}

        {!pbaIsolated && brefLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
            <Loader size={14} className="animate-spin" />
            Loading season data…
          </div>
        ) : ((pbaIsolated && hasPbaTeamAwards) || (!pbaIsolated && (hasAllLeague || bref))) ? (
          <div className="space-y-6">
            {pbaIsolated ? (
              <AllTeamSection label="PBA Mythical Team" icon={<Trophy size={12} />} iconColor="text-amber-400" teams={pbaMythicalTeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} showCount />
            ) : (
              <AllTeamSection label="All-NBA" icon={<Trophy size={12} />} iconColor="text-amber-400" teams={allNBATeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} showCount />
            )}
            {(pbaIsolated ? allDefTeams.length > 0 : true) && (
              <AllTeamSection label={pbaIsolated ? 'PBA All-Defensive' : 'All-Defensive'} icon={<Shield size={12} />} iconColor="text-blue-400" teams={allDefTeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} showCount />
            )}
            {(pbaIsolated ? allRookieTeams.length > 0 : true) && (
              <AllTeamSection label={pbaIsolated ? 'PBA All-Rookie' : 'All-Rookie'} icon={<Zap size={12} />} iconColor="text-green-400" teams={allRookieTeams} onPlayerClick={(player) => player.playerRef ? setViewingPlayer(player.playerRef as NBAPlayer) : setNotFoundName(player.name ?? 'Player')} />
            )}
          </div>
        ) : null}

        {!pbaIsolated || bestRecords.length > 0 ? <BestRecordsSection bestRecords={bestRecords} /> : null}

        {(!pbaIsolated || semifinalsMvps.length > 0) ? <SemifinalsMvpsSection
          semifinalsMvps={semifinalsMvps}
          onPlayerSelect={(player) => setViewingPlayer(player)}
          onPlayerMissing={(name) => setNotFoundName(name)}
        /> : null}

        {!pbaIsolated && allStarRoster?.length ? <AllStarSection
          allStarRoster={allStarRoster}
          players={state.players}
          teams={historyTeams}
          season={season}
          countAllStar={awardCounts.countAllStar}
          onPlayerSelect={(player) => setViewingPlayer(player)}
          onPlayerMissing={(name) => setNotFoundName(name)}
          groupByConference={shouldGroupAllStarsByConference}
        /> : null}
      </div>
    </div>
  );
};
