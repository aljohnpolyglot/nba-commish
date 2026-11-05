import type { GameState, NewsItem } from '../../../types';
import { NewsGenerator } from '../../news/NewsGenerator';
import { logPlanEvent } from '../../offseason/offseasonPlan';
import { backfillAllStarAwards } from './allStarSelectionResolvers';
import { normalizePlayerAwardType } from '../../../utils/playerAwardNormalizer';
import { didHomeTeamWin } from '../../../utils/gameOutcome';
import {
  backfillPbaAllStarAwards,
  buildPbaAllStarLeagueStats,
  buildPbaAllStarPatch,
  buildPbaContestPatch,
  getPbaAllStarWeekendSimulationFlags,
  hasReachedPbaAllStarWeekend,
  isPbaAllStarStateLocal,
  pbaAllStarGameNeedsFullLengthRepair,
  resetPbaAllStarGameForResim,
} from '../../pba/allStar';
import { simulateDanceContest, type DanceContestResult } from '../../pba/danceContest';
import { isDanceContestEnabled } from '../../allStar/allStarEventAvailability';
import { buildContestResultNews } from '../../allStar/contestResultNews';
import { getAllStarPlayerEligibility } from '../../allStar/allStarSelectionHelpers';
import { withDeterministicRandom } from '../../simulation/deterministicRandom';
import { buildAllStarEventSeed } from '../../allStar/allStarDeterminism';
import { getAllStarWeekendCompletion } from '../../allStar/allStarCompletion';
import { getAllStarWeekendDates } from '../../allStar/allStarWeekendDates';
import { formatGameDateShort } from '../../../utils/dateUtils';
import { normalizeDate } from '../../../utils/helpers';

const skipIsolatedNonNbaAllStar = (state: GameState) =>
  state.leagueStats?.uiMode === 'euro_isolated';

const withDanceContestNews = (
  state: GameState,
  patch: Partial<GameState>,
  danceContest: DanceContestResult | undefined,
): Partial<GameState> => {
  const item = buildContestResultNews(state, 'dance', danceContest);
  if (!item) return patch;
  const currentNews = patch.news ?? state.news ?? [];
  if (currentNews.some(existing => existing.id === item.id)) return patch;
  return { ...patch, news: [item, ...currentNews].slice(0, 200) };
};

export const autoOpenThroneSignups = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoOpenThroneSignups', 'fire', `date=${state.date}`);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneSignupSchedule) return {};
  try {
    const { getAllStarWeekendDates } = await import('../../allStar/AllStarWeekendOrchestrator');
    const { initThroneSignups } = await import('../../allStar/throneOrchestrator');
    const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
    return withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-throne-signups'),
      () => initThroneSignups(state, dates.throneSignupOpens, dates.throneSignupCloses),
    );
  } catch (err) {
    console.warn('autoOpenThroneSignups failed:', err);
    return {};
  }
};

export const autoCloseThroneSignups = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoCloseThroneSignups', 'fire', `date=${state.date}`);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneSignupComplete) return {};
  try {
    const { closeThroneSignups } = await import('../../allStar/throneOrchestrator');
    return withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-throne-signups-close'),
      () => closeThroneSignups(state),
    );
  } catch (err) {
    console.warn('autoCloseThroneSignups failed:', err);
    return {};
  }
};

export const autoOpenThroneVoting = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoOpenThroneVoting', 'fire', `date=${state.date}`);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneAnnounced) return {};
  try {
    const { getAllStarWeekendDates } = await import('../../allStar/AllStarWeekendOrchestrator');
    const { tickThroneVoting } = await import('../../allStar/throneOrchestrator');
    const dates = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats);
    return withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-throne-voting'),
      () => tickThroneVoting(state, dates.throneVotingOpens, dates.throneVotingOpens, dates.throneFieldReveal),
    );
  } catch (err) {
    console.warn('autoOpenThroneVoting failed:', err);
    return {};
  }
};

export const autoLockThroneField = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoLockThroneField', 'fire', `date=${state.date}`);
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneAnnounced) return {};
  try {
    const { lockThroneField } = await import('../../allStar/throneOrchestrator');
    return withDeterministicRandom(
      buildAllStarEventSeed(state, 'allstar-throne-field'),
      () => lockThroneField(state),
    );
  } catch (err) {
    console.warn('autoLockThroneField failed:', err);
    return {};
  }
};

export const autoSimAllStarWeekend = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoSimAllStarWeekend', 'fire', `date=${state.date}`);
  if (state.leagueStats?.uiMode === 'pba_isolated') {
    const offseasonTaskState = state.offseasonChecklist?.pbaAllStarWeekend;
    if (offseasonTaskState === 'pending' || offseasonTaskState === 'in-progress') {
      return { _deferred: true } as any;
    }
    const leagueStats = buildPbaAllStarLeagueStats(state.leagueStats);
    const { stripUnsupportedPbaAllStarGames } = await import('../../pba/allStar');
    const cleanedSchedule = stripUnsupportedPbaAllStarGames(
      { ...state, leagueStats } as GameState,
      state.schedule,
    );
    const pbaState = { ...state, leagueStats, schedule: cleanedSchedule } as GameState;
    if (!hasReachedPbaAllStarWeekend(pbaState)) {
      return { leagueStats, schedule: cleanedSchedule };
    }
    if ((pbaState.allStar as any)?.weekendComplete &&
      isPbaAllStarStateLocal(pbaState, pbaState.allStar) &&
      !pbaAllStarGameNeedsFullLengthRepair(pbaState, pbaState.allStar)) {
      const danceContest = isDanceContestEnabled(leagueStats)
        ? pbaState.allStar?.danceContest ?? withDeterministicRandom(
            buildAllStarEventSeed(pbaState, 'allstar-dance-contest'),
            () => simulateDanceContest(pbaState.allStar?.roster ?? []),
          )
        : undefined;
      const completedState = danceContest
        ? { ...pbaState, allStar: { ...pbaState.allStar!, danceContest } }
        : pbaState;
      return withDanceContestNews(completedState, {
        ...backfillAllStarAwards(completedState),
        leagueStats,
        schedule: cleanedSchedule,
        ...(danceContest ? { allStar: completedState.allStar } : {}),
      }, danceContest);
    }
    try {
      const { AllStarWeekendOrchestrator } = await import('../../allStar/AllStarWeekendOrchestrator');
      const repairPatch = pbaAllStarGameNeedsFullLengthRepair(pbaState, pbaState.allStar)
        ? resetPbaAllStarGameForResim(pbaState, pbaState.allStar)
        : {};
      const stateForSim = { ...pbaState, ...repairPatch } as GameState;
      const pbaTeams = ((stateForSim as any).nonNBATeams ?? [])
        .filter((team: any) => team?.league === 'PBA')
        .map((team: any) => ({ ...team, id: team.tid ?? team.id }));
      const seedPatch = stateForSim.allStar?.reservesAnnounced && isPbaAllStarStateLocal(stateForSim, stateForSim.allStar)
        ? { players: stateForSim.players, allStar: stateForSim.allStar }
        : buildPbaAllStarPatch(stateForSim, stateForSim.players);
      const players = seedPatch?.players ?? stateForSim.players;
      let allStar = (seedPatch?.allStar ?? stateForSim.allStar) as any;
      if (!allStar?.reservesAnnounced) {
        return {
          ...(seedPatch ?? {}),
          ...repairPatch,
          leagueStats,
        };
      }
      allStar = buildPbaContestPatch({ ...stateForSim, players, allStar } as GameState, players, allStar);

      let schedule = stateForSim.schedule;
      if (!allStar.gamesInjected) {
        schedule = AllStarWeekendOrchestrator.injectAllStarGames(
          stateForSim.schedule,
          pbaTeams,
          leagueStats.year,
          allStar.roster ?? [],
          leagueStats,
          players,
        );
        allStar = { ...allStar, gamesInjected: true };
      }

      const patch = await AllStarWeekendOrchestrator.simulateWeekend(
        {
          ...stateForSim,
          players,
          teams: stateForSim.teams,
          nonNBATeams: (stateForSim as any).nonNBATeams,
          schedule,
          leagueStats,
          allStar,
        } as GameState,
        getPbaAllStarWeekendSimulationFlags(stateForSim),
      );
      const simulatedAllStar = patch.allStar ?? allStar;
      const danceContest = isDanceContestEnabled(leagueStats)
        ? simulatedAllStar.danceContest ?? withDeterministicRandom(
            buildAllStarEventSeed(stateForSim, 'allstar-dance-contest'),
            () => simulateDanceContest(simulatedAllStar.roster ?? []),
          )
        : undefined;
      const finalAllStar = danceContest
        ? { ...simulatedAllStar, danceContest }
        : simulatedAllStar;
      const completedState = {
        ...stateForSim,
        leagueStats,
        players,
        allStar: finalAllStar,
      } as GameState;
      return withDanceContestNews(completedState, {
        ...patch,
        leagueStats,
        schedule: patch.schedule ?? schedule,
        allStar: finalAllStar,
        players: backfillPbaAllStarAwards(
          completedState,
          players,
          finalAllStar,
        ),
      }, danceContest);
    } catch (err) {
      console.warn('autoSimPbaAllStarWeekend failed:', err);
      return { _deferred: true } as any;
    }
  }
  if (skipIsolatedNonNbaAllStar(state)) return {};
  if (getAllStarWeekendCompletion(state).complete) {
    const danceContest = isDanceContestEnabled(state.leagueStats)
      ? state.allStar?.danceContest ?? withDeterministicRandom(
          buildAllStarEventSeed(state, 'allstar-dance-contest'),
          () => simulateDanceContest(state.allStar?.roster ?? []),
        )
      : undefined;
    const completedState = danceContest
      ? { ...state, allStar: { ...state.allStar!, danceContest } }
      : state;
    return withDanceContestNews(completedState, {
      ...backfillAllStarAwards(completedState),
      ...(danceContest ? { allStar: completedState.allStar } : {}),
    }, danceContest);
  }
  try {
    const { AllStarWeekendOrchestrator } = await import('../../allStar/AllStarWeekendOrchestrator');

    const canonicalWeekendDate = getAllStarWeekendDates(state.leagueStats.year, state.leagueStats).risingStars;
    const canonicalWeekendIso = canonicalWeekendDate.toISOString().slice(0, 10);
    let stateForSim = normalizeDate(state.date) > canonicalWeekendIso
      ? { ...state, date: formatGameDateShort(canonicalWeekendDate) }
      : state;
    if (stateForSim.allStar?.roster && stateForSim.allStar.roster.length > 0) {
      const updatedRoster = [...stateForSim.allStar.roster];
      let rosterChanged = false;

      for (const rosterSpot of updatedRoster) {
        if (rosterSpot.isInjuredDNP) continue;
        const player = stateForSim.players.find(p => p.internalId === rosterSpot.playerId);
        if (!player?.injury || player.injury.gamesRemaining <= 0) continue;

        rosterSpot.isInjuredDNP = true;
        rosterChanged = true;

        const rosterIds = new Set(updatedRoster.map(r => r.playerId));
        const conf = rosterSpot.conference;
        const format = stateForSim.leagueStats?.allStarFormat ?? 'east_vs_west';
        const { getCountryFromLoc } = await import('../../../utils/helpers');
        const bucketMatch = (p: any): boolean => {
          if (stateForSim.leagueStats.uiMode === 'wnba_isolated') return true;
          if (format === 'captains_draft') return true;
          if (conf === 'East' || conf === 'West') {
            return stateForSim.teams.find(t => t.id === p.tid)?.conference === conf;
          }
          const country = getCountryFromLoc(p.born?.loc);
          const isUsa = country === 'United States';
          if (conf === 'USA1' || conf === 'USA2') return isUsa;
          if (conf === 'WORLD' || conf === 'WORLD1' || conf === 'WORLD2') return !isUsa;
          return true;
        };
        const isEligiblePlayer = getAllStarPlayerEligibility(stateForSim.leagueStats, stateForSim.teams);
        const eligible = [...stateForSim.players].filter(p =>
          !rosterIds.has(p.internalId) &&
          (!p.injury || p.injury.gamesRemaining <= 0) &&
          isEligiblePlayer(p)
        );
        const preferred = eligible.filter(bucketMatch);
        const pool = preferred.length > 0 ? preferred : eligible;
        const candidate = pool.sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0))[0];

        if (candidate) {
          const candidateTeam = stateForSim.teams.find(t => t.id === candidate.tid);
          updatedRoster.push({
            playerId: candidate.internalId,
            playerName: candidate.name,
            teamAbbrev: candidateTeam?.abbrev ?? '',
            nbaId: null,
            teamNbaId: null,
            conference: conf,
            isStarter: false,
            position: candidate.pos ?? 'F',
            category: (candidate.pos?.includes('G') ? 'Guard' : 'Frontcourt') as 'Guard' | 'Frontcourt',
            ovr: candidate.overallRating,
            isInjuryReplacement: true,
            injuredPlayerId: rosterSpot.playerId,
          });
        }
      }

      if (rosterChanged) {
        stateForSim = {
          ...stateForSim,
          allStar: { ...stateForSim.allStar, roster: updatedRoster },
        };
      }
    }

    if (!(stateForSim.allStar as any)?.gamesInjected) {
      const newSchedule = AllStarWeekendOrchestrator.injectAllStarGames(
        stateForSim.schedule,
        stateForSim.teams,
        stateForSim.leagueStats.year,
        stateForSim.allStar?.roster ?? [],
        stateForSim.leagueStats,
        stateForSim.players,
      );
      const win = AllStarWeekendOrchestrator.getBreakWindowStrings(stateForSim.leagueStats.year, stateForSim.leagueStats);
      stateForSim = {
        ...stateForSim,
        schedule: newSchedule,
        leagueStats: {
          ...stateForSim.leagueStats,
          allStarBreakStart: win.breakStart,
          allStarBreakEnd: win.breakEnd,
        },
        allStar: { ...(stateForSim.allStar as any), gamesInjected: true },
      };
    }

    const patch = await AllStarWeekendOrchestrator.simulateWeekend(stateForSim, {
      friday: true,
      saturday: true,
      sunday: true,
    });

    if (patch.allStar) {
      patch.allStar = { ...(patch.allStar as any), roster: stateForSim.allStar?.roster ?? (patch.allStar as any).roster };
    }

    const year = state.leagueStats.year;
    const allStarData = patch.allStar as any;
    const awardEntries: Array<{ internalId?: string; name?: string; awardType: string }> = [];
    for (const rosterEntry of allStarData?.roster ?? []) {
      awardEntries.push({ internalId: rosterEntry.playerId, name: rosterEntry.playerName, awardType: 'All-Star' });
    }
    if (allStarData?.dunkContest?.winnerId)
      awardEntries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
    if (allStarData?.threePointContest?.winnerId)
      awardEntries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
    if (allStarData?.danceContest?.winnerTeamId) {
      const winnerTeam = allStarData.danceContest.teams?.find((team: any) => team.teamId === allStarData.danceContest.winnerTeamId);
      (winnerTeam?.playerIds ?? []).forEach((playerId: string, index: number) => {
        awardEntries.push({ internalId: playerId, name: winnerTeam.playerNames?.[index], awardType: 'All-Star Dance Contest Champion' });
      });
    }
    if (allStarData?.shootingStars?.winnerTeamId) {
      const winnerTeam = allStarData.shootingStars.teams?.find((team: any) => team.teamId === allStarData.shootingStars.winnerTeamId);
      (winnerTeam?.playerIds ?? []).forEach((playerId: string, index: number) => {
        awardEntries.push({ internalId: playerId, name: winnerTeam.playerNames?.[index], awardType: 'Shooting Stars Winner' });
      });
    }
    if (allStarData?.skillsChallenge?.winnerId)
      awardEntries.push({ internalId: allStarData.skillsChallenge.winnerId, name: allStarData.skillsChallenge.winnerName, awardType: 'Skills Challenge Winner' });
    if (allStarData?.horseTournament?.winnerId)
      awardEntries.push({ internalId: allStarData.horseTournament.winnerId, name: allStarData.horseTournament.winnerName, awardType: 'H-O-R-S-E Winner' });
    if (allStarData?.gameMvp?.name)
      awardEntries.push({ internalId: allStarData.gameMvp.playerId, name: allStarData.gameMvp.name, awardType: 'All-Star MVP' });
    if (allStarData?.risingStarsMvp?.name)
      awardEntries.push({ internalId: allStarData.risingStarsMvp.playerId, name: allStarData.risingStarsMvp.name, awardType: 'Rising Stars MVP' });
    const finalAllStarGame = allStarData?.bracket?.games?.find((game: any) => game.round === 'final' && game.played && game.mvpName);
    if (!allStarData?.gameMvp?.name && finalAllStarGame?.mvpName)
      awardEntries.push({ internalId: finalAllStarGame.mvpId, name: finalAllStarGame.mvpName, awardType: 'All-Star MVP' });
    const finalRisingStarsGame = allStarData?.risingStarsBracket?.games?.find((game: any) => game.round === 'final' && game.played && game.mvpName);
    if (!allStarData?.risingStarsMvp?.name && finalRisingStarsGame?.mvpName)
      awardEntries.push({ internalId: finalRisingStarsGame.mvpId, name: finalRisingStarsGame.mvpName, awardType: 'Rising Stars MVP' });
    if (allStarData?.throne?.champion?.playerId)
      awardEntries.push({
        internalId: allStarData.throne.champion.playerId,
        name: allStarData.throne.champion.playerName,
        awardType: 'The Throne',
      });

    if (awardEntries.length > 0) {
      patch.players = state.players.map(p => {
        const entries = awardEntries.filter(e =>
          (e.internalId && p.internalId === e.internalId) ||
          (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())
        );
        const missing = entries.filter(entry =>
          !(p.awards ?? []).some(a => normalizePlayerAwardType(a.type) === entry.awardType && a.season === year)
        );
        return missing.length > 0
          ? { ...p, awards: [...(p.awards ?? []), ...missing.map(entry => ({ type: entry.awardType, season: year }))] }
          : p;
      });
    }

    const newNewsItems: NewsItem[] = [];
    const contestNews = [
      buildContestResultNews(stateForSim, 'dance', allStarData?.danceContest),
      buildContestResultNews(stateForSim, 'shooting-stars', allStarData?.shootingStars),
      buildContestResultNews(stateForSim, 'skills', allStarData?.skillsChallenge),
      buildContestResultNews(stateForSim, 'horse', allStarData?.horseTournament),
    ].filter((item): item is NewsItem => item !== null);
    newNewsItems.push(...contestNews);
    const bracket = allStarData?.bracket;
    const playedBracketGames = (bracket?.games ?? []).filter((g: any) => g.played);
    if (bracket && playedBracketGames.length > 1) {
      for (const g of playedBracketGames) {
        const homeT = bracket.teams.find((t: any) => t.tid === g.homeTid);
        const awayT = bracket.teams.find((t: any) => t.tid === g.awayTid);
        if (!homeT || !awayT) continue;
        const homeWon = didHomeTeamWin(g);
        const winnerName = homeWon ? homeT.name : awayT.name;
        const loserName = homeWon ? awayT.name : homeT.name;
        const winnerScore = Math.max(g.homeScore, g.awayScore);
        const loserScore = Math.min(g.homeScore, g.awayScore);
        const roundLabel = g.round === 'final' ? 'Championship' : g.round === 'sf' ? 'Semifinal' : 'Round Robin';
        const news = NewsGenerator.generate(
          'all_star_bracket',
          stateForSim.date,
          {
            winner: winnerName,
            loser: loserName,
            roundLabel,
            homeScore: winnerScore,
            awayScore: loserScore,
            year,
            mvpName: g.mvpName ?? 'Top scorer',
            mvpPts: g.mvpPts ?? 0,
          }
        );
        if (news) newNewsItems.push(news);
      }
    }

    if (allStarData?.gameMvp?.name) {
      const finalGame = playedBracketGames.find((g: any) => g.round === 'final')
        ?? playedBracketGames[playedBracketGames.length - 1];
      const mvpStats = (() => {
        if (!finalGame) return null;
        const box = patch.boxScores?.find((b: any) => b.gameId === finalGame.gid);
        if (!box) return null;
        const all = [...(box.homeStats ?? []), ...(box.awayStats ?? [])];
        return all.find((s: any) => s.name === allStarData.gameMvp.name) ?? null;
      })();
      const mvpNews = NewsGenerator.generate(
        'all_star_mvp',
        stateForSim.date,
        {
          playerName: allStarData.gameMvp.name,
          year,
          pts: mvpStats?.pts ?? 0,
          reb: mvpStats?.reb ?? 0,
          ast: mvpStats?.ast ?? 0,
          teamName: allStarData.gameMvp.team ?? '',
        }
      );
      if (mvpNews) newNewsItems.push(mvpNews);
    }

    if (newNewsItems.length > 0) {
      patch.news = [...newNewsItems, ...(state.news ?? [])].slice(0, 200);
    }

    const resolvedState = { ...stateForSim, ...patch } as GameState;
    const completion = getAllStarWeekendCompletion(resolvedState);
    if (!completion.complete) {
      throw new Error(`All-Star Weekend canonical resolution incomplete: ${completion.missing.join(', ') || 'completion marker'}`);
    }

    return patch;
  } catch (err) {
    console.warn('autoSimAllStarWeekend failed:', err);
    throw err;
  }
};

export const autoSimBackgroundNbaAllStarWeekend = async (state: GameState): Promise<Partial<GameState>> => {
  if (state.leagueStats?.uiMode !== 'pba_isolated') return {};
  const patch = await autoSimAllStarWeekend({
    ...state,
    leagueStats: { ...state.leagueStats, uiMode: 'nba' } as any,
    allStar: (state as any).backgroundNbaAllStar,
  } as GameState);
  if (!patch || Object.keys(patch).length === 0) return {};
  const next: any = { ...patch };
  if ('allStar' in next) {
    next.backgroundNbaAllStar = next.allStar;
    delete next.allStar;
  }
  if ('leagueStats' in next) {
    next.leagueStats = state.leagueStats;
  }
  delete next.schedule;
  delete next.boxScores;
  return next;
};
