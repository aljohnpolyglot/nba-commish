import type { GameState, NewsItem } from '../../../types';
import { NewsGenerator } from '../../news/NewsGenerator';
import { logPlanEvent } from '../../offseason/offseasonPlan';
import { backfillAllStarAwards } from './allStarSelectionResolvers';

export const autoOpenThroneSignups = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoOpenThroneSignups', 'fire', `date=${state.date}`);
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneSignupSchedule) return {};
  try {
    const { getAllStarWeekendDates } = await import('../../allStar/AllStarWeekendOrchestrator');
    const { initThroneSignups } = await import('../../allStar/throneOrchestrator');
    const dates = getAllStarWeekendDates(state.leagueStats.year);
    return initThroneSignups(state, dates.throneSignupOpens, dates.throneSignupCloses);
  } catch (err) {
    console.warn('autoOpenThroneSignups failed:', err);
    return {};
  }
};

export const autoCloseThroneSignups = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoCloseThroneSignups', 'fire', `date=${state.date}`);
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneSignupComplete) return {};
  try {
    const { closeThroneSignups } = await import('../../allStar/throneOrchestrator');
    return closeThroneSignups(state);
  } catch (err) {
    console.warn('autoCloseThroneSignups failed:', err);
    return {};
  }
};

export const autoOpenThroneVoting = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoOpenThroneVoting', 'fire', `date=${state.date}`);
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneAnnounced) return {};
  try {
    const { getAllStarWeekendDates } = await import('../../allStar/AllStarWeekendOrchestrator');
    const { tickThroneVoting } = await import('../../allStar/throneOrchestrator');
    const dates = getAllStarWeekendDates(state.leagueStats.year);
    return tickThroneVoting(state, dates.throneVotingOpens, dates.throneVotingOpens, dates.throneFieldReveal);
  } catch (err) {
    console.warn('autoOpenThroneVoting failed:', err);
    return {};
  }
};

export const autoLockThroneField = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoLockThroneField', 'fire', `date=${state.date}`);
  if (state.leagueStats.allStarThroneEnabled !== true) return {};
  if (!state.allStar) return {};
  if ((state.allStar as any).throneAnnounced) return {};
  try {
    const { lockThroneField } = await import('../../allStar/throneOrchestrator');
    return lockThroneField(state);
  } catch (err) {
    console.warn('autoLockThroneField failed:', err);
    return {};
  }
};

export const autoSimAllStarWeekend = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoSimAllStarWeekend', 'fire', `date=${state.date}`);
  if ((state.allStar as any)?.weekendComplete) {
    return backfillAllStarAwards(state);
  }
  try {
    const { AllStarWeekendOrchestrator } = await import('../../allStar/AllStarWeekendOrchestrator');

    let stateForSim = state;
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
        const INELIGIBLE_STATUSES = new Set(['Retired', 'WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia']);
        const eligible = [...stateForSim.players].filter(p =>
          !rosterIds.has(p.internalId) &&
          (!p.injury || p.injury.gamesRemaining <= 0) &&
          !INELIGIBLE_STATUSES.has(p.status ?? '') &&
          p.tid >= 0
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
        stateForSim.leagueStats
      );
      const win = AllStarWeekendOrchestrator.getBreakWindowStrings(stateForSim.leagueStats.year);
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
    if (allStarData?.dunkContest?.winnerId)
      awardEntries.push({ internalId: allStarData.dunkContest.winnerId, name: allStarData.dunkContest.winnerName, awardType: 'Slam Dunk Contest Winner' });
    if (allStarData?.threePointContest?.winnerId)
      awardEntries.push({ internalId: allStarData.threePointContest.winnerId, name: allStarData.threePointContest.winnerName, awardType: 'Three-Point Contest Winner' });
    if (allStarData?.gameMvp?.name)
      awardEntries.push({ name: allStarData.gameMvp.name, awardType: 'All-Star Game MVP' });
    if (allStarData?.throne?.champion?.playerId)
      awardEntries.push({
        internalId: allStarData.throne.champion.playerId,
        name: allStarData.throne.champion.playerName,
        awardType: 'The Throne',
      });

    if (awardEntries.length > 0) {
      patch.players = state.players.map(p => {
        const entry = awardEntries.find(e =>
          (e.internalId && p.internalId === e.internalId) ||
          (!e.internalId && e.name && p.name?.toLowerCase() === e.name.toLowerCase())
        );
        if (!entry) return p;
        if (p.awards?.some(a => a.type === entry.awardType && a.season === year)) return p;
        return { ...p, awards: [...(p.awards ?? []), { type: entry.awardType, season: year }] };
      });
    }

    const newNewsItems: NewsItem[] = [];
    const bracket = allStarData?.bracket;
    const playedBracketGames = (bracket?.games ?? []).filter((g: any) => g.played);
    if (bracket && playedBracketGames.length > 1) {
      for (const g of playedBracketGames) {
        const homeT = bracket.teams.find((t: any) => t.tid === g.homeTid);
        const awayT = bracket.teams.find((t: any) => t.tid === g.awayTid);
        if (!homeT || !awayT) continue;
        const homeWon = g.homeScore > g.awayScore;
        const winnerName = homeWon ? homeT.name : awayT.name;
        const loserName = homeWon ? awayT.name : homeT.name;
        const winnerScore = Math.max(g.homeScore, g.awayScore);
        const loserScore = Math.min(g.homeScore, g.awayScore);
        const roundLabel = g.round === 'final' ? 'Championship' : g.round === 'sf' ? 'Semifinal' : 'Round Robin';
        const news = NewsGenerator.generate(
          'all_star_bracket',
          state.date,
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
        state.date,
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

    return patch;
  } catch (err) {
    console.warn('autoSimAllStarWeekend failed:', err);
    return {};
  }
};
