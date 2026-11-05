import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameLoadProgress, GameState, UserAction } from '../../types';
import { SettingsManager } from '../../services/SettingsManager';
import { initImageCache } from '../../services/imageCache';
import { SaveManager, type SaveMetadata } from '../../services/SaveManager';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { getTeamFullName } from '../../utils/teamNames';
import { loadGameState } from './loadGameState';
import {
  addAllStarSelectionAward,
  applyAllStarInjuryReplacement,
  finalizeAllStarReplacementInbox,
  getOutstandingAllStarInjuries,
} from '../../services/allStar/allStarInjuryReplacements';
import { buildContestResultNews } from '../../services/allStar/contestResultNews';
import { resolveRigGameOffer } from '../../services/referees/rigGame';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type GameActionHelpers = {
  clearOutcome: () => void;
  saveSocialThread: (postId: string, replies: any[]) => void;
};

type HandleDirectDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
  actions: GameActionHelpers;
};

export async function handleDirectDispatchAction({
  action,
  setState,
  stateRef,
  actions,
}: HandleDirectDispatchActionArgs): Promise<boolean> {
  if (action.type === 'CLEAR_OUTCOME') {
    actions.clearOutcome();
    return true;
  }

  if (action.type === 'SAVE_SOCIAL_THREAD') {
    actions.saveSocialThread(action.payload.postId, action.payload.replies);
    return true;
  }

  if (action.type === 'AUTOFILL_ROSTER_COMPLIANCE') {
    const { applyRosterComplianceAutoFill } = await import('./rosterComplianceAutoFill');
    const teamId = Number(action.payload?.teamId);
    const playerIds = Array.isArray(action.payload?.playerIds) ? action.payload.playerIds : [];
    const next = await applyRosterComplianceAutoFill(stateRef.current, teamId, playerIds);
    stateRef.current = next;
    setState(next);
    return true;
  }

  if (action.type === 'ASSISTANT_RESIGN_EXPIRING_CONTRACTS') {
    const { applyAssistantResignOffers } = await import('../../services/freeAgency/assistantResign');
    const teamId = Number(action.payload?.teamId);
    const offers = Array.isArray(action.payload?.offers) ? action.payload.offers : [];
    const reviewedPlayerIds = Array.isArray(action.payload?.reviewedPlayerIds)
      ? [...new Set<string>(action.payload.reviewedPlayerIds.map((id: unknown) => String(id)))]
      : [];
    const next = await applyAssistantResignOffers(stateRef.current, teamId, offers);
    const reviewed = {
      ...next,
      expiringPlayersReview: {
        season: Number(action.payload?.season ?? next.leagueStats?.year ?? new Date().getFullYear()),
        playerIds: reviewedPlayerIds,
      },
    };
    stateRef.current = reviewed;
    setState(reviewed);
    return true;
  }

  if (action.type === 'SET_TRAINING_DAILY_PLAN') {
    const { teamId, dayKey, plan } = action.payload as { teamId: number; dayKey: string; plan: any };
    setState(prev => ({
      ...prev,
      teams: prev.teams.map(team => team.id === teamId
        ? { ...team, trainingCalendar: { ...(team.trainingCalendar || {}), [dayKey]: { ...plan, auto: false } } }
        : team),
    }));
    return true;
  }

  if (action.type === 'SET_TRAINING_NORMAL_DEFAULT') {
    const { teamId, template } = action.payload as { teamId: number; template: any };
    setState(prev => ({
      ...prev,
      teams: prev.teams.map(team => team.id === teamId ? { ...team, normalDayDefault: template } : team),
    }));
    return true;
  }

  if (action.type === 'SET_PLAYER_TRAINING_INTENSITY') {
    const { playerId, intensity } = action.payload as { playerId: string; intensity: 'Rest' | 'Half' | 'Normal' | 'Double' };
    setState(prev => ({
      ...prev,
      players: prev.players.map(player => player.internalId === playerId ? { ...player, trainingIntensity: intensity } : player),
    }));
    return true;
  }

  if (action.type === 'AUTOFILL_TEAM_TRAINING_CALENDAR') {
    const { teamId } = action.payload as { teamId: number };
    const { autoGenerateTrainingCalendar } = await import('../../services/training/trainingScheduler');
    const { normalizeDate: normalizeAutofillDate } = await import('../../utils/helpers');
    setState(prev => {
      const team = prev.teams.find(item => item.id === teamId);
      if (!team) return prev;
      const preservedUserPlans = Object.fromEntries(
        Object.entries((team.trainingCalendar as any) ?? {}).filter(([, plan]: [string, any]) => plan?.auto === false),
      );
      const startISO = normalizeAutofillDate(prev.date);
      const calendar = autoGenerateTrainingCalendar(prev.schedule || [], teamId, startISO, 365, preservedUserPlans as any, 240, prev.leagueStats);
      return {
        ...prev,
        teams: prev.teams.map(item => item.id === teamId ? { ...item, trainingCalendar: calendar } : item),
      };
    });
    return true;
  }

  if (action.type === 'SET_PLAYER_DEV_FOCUS') {
    const { playerId, devFocus } = action.payload as { playerId: string; devFocus: string };
    setState(prev => ({
      ...prev,
      players: prev.players.map(player => player.internalId === playerId ? { ...player, devFocus } : player),
    }));
    return true;
  }

  if (action.type === 'SET_PLAYER_MENTOR') {
    const { playerId, mentorId } = action.payload as { playerId: string; mentorId: string | null };
    setState(prev => {
      const today = (prev.date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
      const closeOpenEntry = (history: any[] | undefined) =>
        (history ?? []).map(entry => (entry.endDate ? entry : { ...entry, endDate: today }));
      return {
        ...prev,
        players: prev.players.map(player => {
          if (player.internalId === playerId) {
            const closed = closeOpenEntry((player as any).mentorHistory);
            const next = mentorId ? [...closed, { mentorId, startDate: today }] : closed;
            return { ...player, mentorId, mentorHistory: next };
          }
          if (mentorId && (player as any).mentorId === mentorId) {
            return { ...player, mentorId: null, mentorHistory: closeOpenEntry((player as any).mentorHistory) };
          }
          return player;
        }),
      };
    });
    return true;
  }

  if (action.type === 'RESET_PLAYER_FAMILIARITY') return true;

  if (action.type === 'ADD_PENDING_HYPNOSIS') {
    if (stateRef.current.godModeEnabled !== true) return true;
    setState(prev => ({
      ...prev,
      pendingHypnosis: [...(prev.pendingHypnosis || []), action.payload],
    }));
    return true;
  }

  if (action.type === 'UPDATE_SAVE_ID') {
    setState(prev => ({ ...prev, saveId: action.payload }));
    return true;
  }

  if (action.type === 'REPAIR_PBA_ALL_STAR_WEEKEND') {
    const prev = stateRef.current;
    if ((prev.leagueStats as any)?.uiMode !== 'pba_isolated') return true;
    const {
      backfillPbaAllStarAwards,
      buildPbaAllStarLeagueStats,
      buildPbaAllStarPatch,
      buildPbaContestPatch,
      isPbaAllStarStateLocal,
      pbaAllStarGameNeedsFullLengthRepair,
      resetPbaAllStarGameForResim,
    } = await import('../../services/pba/allStar');
    if (!pbaAllStarGameNeedsFullLengthRepair(prev, prev.allStar)) return true;

    const { AllStarWeekendOrchestrator } = await import('../../services/allStar/AllStarWeekendOrchestrator');
    const leagueStats = buildPbaAllStarLeagueStats(prev.leagueStats);
    const resetPatch = resetPbaAllStarGameForResim({ ...prev, leagueStats } as GameState, prev.allStar);
    const stateForSim = { ...prev, ...resetPatch, leagueStats } as GameState;
    let players = stateForSim.players ?? [];
    let allStar = stateForSim.allStar as any;
    const seedPatch = allStar?.reservesAnnounced && isPbaAllStarStateLocal(stateForSim, allStar)
      ? { players, allStar }
      : buildPbaAllStarPatch(stateForSim, players);
    players = seedPatch?.players ?? players;
    allStar = seedPatch?.allStar ?? allStar;

    if (!allStar?.reservesAnnounced) {
      setState(current => ({
        ...current,
        leagueStats,
        schedule: stateForSim.schedule,
        boxScores: stateForSim.boxScores,
        players,
        allStar,
      }));
      return true;
    }

    allStar = buildPbaContestPatch({ ...stateForSim, players, allStar } as GameState, players, allStar);
    const pbaTeams = ((stateForSim as any).nonNBATeams ?? [])
      .filter((team: any) => team?.league === 'PBA')
      .map((team: any) => ({ ...team, id: team.tid ?? team.id }));
    let schedule = stateForSim.schedule;
    if (!allStar.gamesInjected) {
      schedule = AllStarWeekendOrchestrator.injectAllStarGames(
        schedule,
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
        schedule,
        leagueStats,
        allStar,
      } as GameState,
      { friday: false, saturday: true, sunday: true },
    );
    const simulatedAllStar = patch.allStar ?? allStar;
    const { simulatePbaDanceContest } = await import('../../services/pba/danceContest');
    const danceContest = leagueStats.pbaAllStarDanceContestEnabled !== false
      ? simulatedAllStar.danceContest ?? simulatePbaDanceContest(simulatedAllStar.roster ?? [])
      : undefined;
    const finalAllStar = danceContest
      ? { ...simulatedAllStar, danceContest }
      : simulatedAllStar;
    const finalPlayers = backfillPbaAllStarAwards(
      { ...stateForSim, leagueStats, players, allStar: finalAllStar } as GameState,
      players,
      finalAllStar,
    );
    const danceNews = buildContestResultNews(
      { ...stateForSim, leagueStats, players: finalPlayers, allStar: finalAllStar } as GameState,
      'dance',
      danceContest,
    );
    setState(current => ({
      ...current,
      leagueStats,
      schedule: patch.schedule ?? schedule,
      boxScores: patch.boxScores ?? stateForSim.boxScores,
      players: finalPlayers,
      news: danceNews && !(current.news ?? []).some(item => item.id === danceNews.id)
        ? [danceNews, ...(current.news ?? [])].slice(0, 200)
        : current.news,
      allStar: finalAllStar,
    }));
    return true;
  }

  if (action.type === 'SAVE_CONTEST_RESULT') {
    const { contest, result, contestants } = action.payload;
    setState(prev => {
      if (!prev.allStar) return prev;
      if (contest === 'dance' && prev.allStar.danceContest?.complete) return prev;
      const season = prev.leagueStats?.year;
      const awardEntries: Array<{ playerId?: string; playerName?: string; awardType: string }> = [];
      if (contest === 'dunk' && result?.winnerId) {
        awardEntries.push({ playerId: result.winnerId, playerName: result.winnerName, awardType: 'Slam Dunk Contest Winner' });
      }
      if (contest === 'three' && result?.winnerId) {
        awardEntries.push({ playerId: result.winnerId, playerName: result.winnerName, awardType: 'Three-Point Contest Winner' });
      }
      if (contest === 'dance' && result?.winnerTeamId) {
        const winnerTeam = result.teams?.find((team: any) => team.teamId === result.winnerTeamId);
        (winnerTeam?.playerIds ?? []).forEach((playerId: string, index: number) => {
          awardEntries.push({ playerId, playerName: winnerTeam.playerNames?.[index], awardType: 'All-Star Dance Contest Champion' });
        });
      }
      if (contest === 'shooting-stars' && result?.winnerTeamId) {
        const winnerTeam = result.teams?.find((team: any) => team.teamId === result.winnerTeamId);
        (winnerTeam?.playerIds ?? []).forEach((playerId: string, index: number) => {
          awardEntries.push({ playerId, playerName: winnerTeam.playerNames?.[index], awardType: 'Shooting Stars Winner' });
        });
      }
      if (contest === 'skills' && result?.winnerId) {
        awardEntries.push({ playerId: result.winnerId, playerName: result.winnerName, awardType: 'Skills Challenge Winner' });
      }
      if (contest === 'horse' && result?.winnerId) {
        awardEntries.push({ playerId: result.winnerId, playerName: result.winnerName, awardType: 'H-O-R-S-E Winner' });
      }
      const players = awardEntries.length > 0
        ? prev.players.map(player => {
            const entry = awardEntries.find(item =>
              (item.playerId && player.internalId === item.playerId) ||
              (!item.playerId && item.playerName && player.name?.toLowerCase() === item.playerName.toLowerCase())
            );
            if (!entry || !season) return player;
            if ((player.awards ?? []).some(award => award.type === entry.awardType && award.season === season)) return player;
            return { ...player, awards: [...(player.awards ?? []), { type: entry.awardType, season }] };
          })
        : prev.players;

      const scheduleGid = contest === 'dunk' ? 90003
        : contest === 'three' ? 90004
        : contest === 'shooting-stars' ? 90006
        : contest === 'skills' ? 90007
        : contest === 'horse' ? 90008
        : null;
      const contestNews = contest === 'dance' || contest === 'shooting-stars' || contest === 'skills' || contest === 'horse'
        ? buildContestResultNews(prev, contest, result)
        : null;

      return {
        ...prev,
        players,
        news: contestNews ? [contestNews, ...(prev.news ?? [])].slice(0, 200) : prev.news,
        schedule: scheduleGid == null ? prev.schedule : prev.schedule.map((game: any) => game.gid === scheduleGid ? { ...game, played: true } : game),
        allStar: {
          ...prev.allStar,
          ...(contest === 'dunk' ? { dunkContest: result } : {}),
          ...(contest === 'three' ? { threePointContest: result } : {}),
          ...(contest === 'dance' ? { danceContest: result } : {}),
          ...(contest === 'shooting-stars' ? { shootingStars: result, shootingStarsContestants: contestants ?? (prev.allStar as any).shootingStarsContestants, shootingStarsAnnounced: true } : {}),
          ...(contest === 'skills' ? { skillsChallenge: result, skillsChallengeContestants: contestants ?? (prev.allStar as any).skillsChallengeContestants, skillsChallengeAnnounced: true } : {}),
          ...(contest === 'horse' ? { horseTournament: result, horseContestants: contestants ?? (prev.allStar as any).horseContestants, horseAnnounced: true } : {}),
        },
      };
    });
    return true;
  }

  if (action.type === 'SAVE_THRONE_RESULT') {
    const { result } = action.payload;
    setState(prev => {
      if (!prev.allStar) return prev;
      const championId = result?.champion?.playerId;
      const season = prev.leagueStats?.year;
      const players = championId && season
        ? prev.players.map(player => {
            if (player.internalId !== championId) return player;
            if ((player.awards ?? []).some(award => award.type === 'The Throne' && award.season === season)) return player;
            return { ...player, awards: [...(player.awards ?? []), { type: 'The Throne', season }] };
          })
        : prev.players;
      return { ...prev, players, allStar: { ...prev.allStar, throne: result } };
    });
    return true;
  }

  if (action.type === 'MERGE_THRONE_LIFECYCLE') {
    const patch = action.payload?.allStarPatch ?? {};
    setState(prev => prev.allStar ? { ...prev, allStar: { ...prev.allStar, ...patch } } : prev);
    return true;
  }

  if (action.type === 'RECORD_WATCHED_GAME') {
    const { gameId, result } = action.payload;
    const current = stateRef.current;
    const watchedGame = current.schedule.find((game: any) => game.gid === gameId);
    const newSchedule = current.schedule.map((game: any) =>
      game.gid === gameId ? {
        ...game,
        played: true,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winnerId: result.winnerId,
        tiebreaker: result.tiebreaker,
      } : game,
    );
    const boxScoreEntry = {
      ...result,
      gameId,
      date: current.date,
      season: current.leagueStats?.year,
      isPreseason: watchedGame?.isPreseason ?? result.isPreseason,
      isPlayoff: watchedGame?.isPlayoff ?? result.isPlayoff,
      isEliminationGame: watchedGame?.isEliminationGame ?? result.isEliminationGame,
      isPlayIn: watchedGame?.isPlayIn ?? result.isPlayIn,
      competitionId: watchedGame?.competitionId ?? result.competitionId,
      competitionPhase: watchedGame?.competitionPhase ?? result.competitionPhase,
    };
    const existing = (current.boxScores || []).findIndex((box: any) => box.gameId === gameId);
    const newBoxScores = existing >= 0
      ? (current.boxScores || []).map((box: any, index: number) => index === existing ? boxScoreEntry : box)
      : [...(current.boxScores || []), boxScoreEntry];
    const next = { ...current, schedule: newSchedule, boxScores: newBoxScores };
    stateRef.current = next;
    setState(next);

    const watchedHome = resolveAnyTeam(result.homeTeamId, next.teams, next.nonNBATeams ?? []);
    const watchedAway = resolveAnyTeam(result.awayTeamId, next.teams, next.nonNBATeams ?? []);
    if (watchedHome && watchedAway) {
      Promise.all([
        import('../../services/ImagnPhotoService'),
        import('../../services/social/photoEnricherHelpers'),
      ]).then(([{ fetchGamePhotos }, { buildGamePhotoInfo }]) => {
        const info = buildGamePhotoInfo(boxScoreEntry, watchedHome, watchedAway, next);
        fetchGamePhotos({
          homeTeam: watchedHome,
          awayTeam: watchedAway,
          date: info.date,
          season: info.season,
          league: info.league,
          competitionId: info.competitionId,
          uiMode: info.uiMode,
          branchCutoffDate: info.branchCutoffDate,
        }).catch(() => {});
      });
    }
    return true;
  }

  if (action.type === 'STORE_PURCHASE') {
    const { amountMillion } = action.payload as { amountMillion: number };
    setState(prev => ({
      ...prev,
      stats: {
        ...prev.stats,
        personalWealth: Math.max(0, Number((prev.stats.personalWealth - amountMillion).toFixed(4))),
      },
    }));
    return true;
  }

  if (action.type === 'SETTLE_RIG_GAME_OFFER') {
    const { gameId, refereeId, favoredTid } = action.payload as {
      gameId: number;
      refereeId: string;
      favoredTid: number;
    };
    setState(prev => {
      const referee = (prev.refereePool ?? prev.staff?.referees ?? [])
        .find(candidate => candidate.id === refereeId);
      const offer = resolveRigGameOffer(prev, gameId, referee, favoredTid);
      if (!offer.eligible || !offer.canAfford || !offer.settlement) {
        return { ...prev, lastOutcome: offer.error ?? 'The offer could not be made.' };
      }
      const settlement = offer.settlement;
      const existing = prev.rigGameSettlements?.[settlement.attemptKey];
      if (existing) {
        return { ...prev, lastOutcome: existing.message };
      }
      return {
        ...prev,
        stats: {
          ...prev.stats,
          personalWealth: Math.max(
            0,
            Number((prev.stats.personalWealth - settlement.chargedAmountMillion).toFixed(4)),
          ),
        },
        rigGameSettlements: {
          ...(prev.rigGameSettlements ?? {}),
          [settlement.attemptKey]: settlement,
        },
        lastOutcome: settlement.message,
      };
    });
    return true;
  }

  if (action.type === 'REAL_ESTATE_INVENTORY_UPDATE') {
    setState(prev => ({ ...prev, realEstateInventory: action.payload.inventory }));
    return true;
  }

  if (action.type === 'COMMISH_STORE_INVENTORY_UPDATE') {
    setState(prev => ({ ...prev, commishStoreInventory: action.payload.inventory }));
    return true;
  }

  if (action.type === 'RIG_ALL_STAR_VOTING') {
    const { playerId, ghostVotes } = action.payload as { playerId: string; ghostVotes: number };
    setState(prev => ({
      ...prev,
      allStar: prev.allStar ? {
        ...prev.allStar,
        hasRiggedVoting: true,
        votes: prev.allStar.votes.map(v => v.playerId === playerId ? { ...v, votes: v.votes + ghostVotes } : v),
      } : prev.allStar,
    }));
    return true;
  }

  if (action.type === 'SET_DUNK_CONTESTANTS') {
    const { contestants } = action.payload as { contestants: any[] };
    setState(prev => ({
      ...prev,
      allStar: prev.allStar ? { ...prev.allStar, dunkContestContestants: contestants, dunkContestAnnounced: true } : prev.allStar,
    }));
    return true;
  }

  if (action.type === 'SET_THREE_POINT_CONTESTANTS') {
    const { contestants } = action.payload as { contestants: any[] };
    setState(prev => ({
      ...prev,
      allStar: prev.allStar ? { ...prev.allStar, threePointContestants: contestants, threePointAnnounced: true } : prev.allStar,
    }));
    return true;
  }

  if (action.type === 'ADD_ALL_STAR_REPLACEMENT') {
    const { injuredId, replacementId, conference } = action.payload as any;
    setState(prev => {
      if (!prev.allStar) return prev;
      const updatedRoster = applyAllStarInjuryReplacement(prev, injuredId, replacementId, conference);
      if (updatedRoster === prev.allStar.roster) return prev;
      const next = {
        ...prev,
        players: addAllStarSelectionAward(prev.players, replacementId, prev.allStar.season ?? prev.leagueStats.year),
        allStar: { ...prev.allStar, roster: updatedRoster },
      };
      return getOutstandingAllStarInjuries(next).length === 0
        ? { ...next, inbox: finalizeAllStarReplacementInbox(next, updatedRoster, 'commissioner') }
        : next;
    });
    return true;
  }

  if (action.type === 'LOAD_GAME') {
    const payload = action.payload as SaveMetadata | GameState;
    const suppliedState = Array.isArray((payload as GameState)?.players)
      ? payload as GameState
      : undefined;
    const saveId = suppliedState?.saveId ?? (payload as SaveMetadata)?.id;
    const gameDate = suppliedState?.date ?? (payload as SaveMetadata)?.gameDate ?? '';
    const reportProgress = (progress: GameLoadProgress) => {
      const displayedProgress = suppliedState
        ? {
            ...progress,
            percentComplete: Math.min(99, Math.max(52, 50 + progress.percentComplete / 2)),
          }
        : progress;
      console.info('[LOAD_GAME_PROGRESS]', {
        step: displayedProgress.stepsComplete,
        total: displayedProgress.stepsTotal,
        percent: displayedProgress.percentComplete,
        phase: displayedProgress.currentPhase,
      });
      setState(prev => ({
        ...prev,
        isProcessing: true,
        lazySimProgress: {
          kind: 'save-load',
          currentDate: gameDate,
          targetDate: gameDate,
          daysComplete: displayedProgress.stepsComplete,
          daysTotal: displayedProgress.stepsTotal,
          currentPhase: displayedProgress.currentPhase,
          percentComplete: displayedProgress.percentComplete,
        },
      }));
    };

    try {
      if (!saveId && !suppliedState) throw new Error('Save file is missing its identifier.');
      const stored = suppliedState
        ? undefined
        : await SaveManager.loadGameWithMetadata(saveId!, reportProgress);
      const loaded = suppliedState ?? stored?.state;
      if (!loaded) throw new Error('Save file is corrupted or missing.');
      const { nextState, imageCachePlayers } = await loadGameState(loaded, reportProgress);
      stateRef.current = nextState;
      setState(nextState);
      if (SettingsManager.getSettings().enableImageCache && imageCachePlayers.length > 0) {
        const userTeamPlayers = nextState.userTeamId == null
          ? []
          : imageCachePlayers.filter(player => player.tid === nextState.userTeamId);
        const warmupPlayers = (userTeamPlayers.length > 0
          ? userTeamPlayers
          : imageCachePlayers.filter(player => player.status === 'Active').slice(0, 36));
        const startWarmup = () => initImageCache(warmupPlayers).catch(() => {});
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(startWarmup, { timeout: 4_000 });
        } else {
          globalThis.setTimeout(startWarmup, 500);
        }
      }
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error('The saved league could not be loaded.');
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lazySimProgress: undefined,
        lastOutcome: `Could not load the saved league. ${error.message}`,
      }));
      throw error;
    }
    return true;
  }

  if (action.type === 'UPDATE_STATE') {
    stateRef.current = { ...stateRef.current, ...action.payload };
    setState(prev => {
      const next = { ...prev, ...action.payload };
      stateRef.current = next;
      return next;
    });
    return true;
  }

  if (action.type === 'CACHE_PROFILE') {
    const { handle, profile } = (action as any).payload;
    setState(prev => ({
      ...prev,
      cachedProfiles: { ...(prev.cachedProfiles || {}), [handle.replace('@', '')]: profile },
    }));
    return true;
  }

  if (action.type === 'TOGGLE_LIKE') {
    const id = (action as any).payload;
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map((post: any) =>
        post.id === id ? { ...post, isLiked: !post.isLiked, likes: post.isLiked ? post.likes - 1 : post.likes + 1 } : post,
      ),
    }));
    return true;
  }

  if (action.type === 'TOGGLE_RETWEET') {
    const id = (action as any).payload;
    setState(prev => ({
      ...prev,
      socialFeed: prev.socialFeed.map((post: any) =>
        post.id === id ? { ...post, isRetweeted: !post.isRetweeted, retweets: post.isRetweeted ? post.retweets - 1 : post.retweets + 1 } : post,
      ),
    }));
    return true;
  }

  if (action.type === 'ADD_POST') {
    setState(prev => ({ ...prev, socialFeed: [(action as any).payload, ...prev.socialFeed] }));
    return true;
  }

  if (action.type === 'ADD_REPLY' || action.type === 'ADD_REPLIES') {
    const { replies, reply } = (action as any).payload;
    const newPosts: any[] = replies ?? (reply ? [reply] : []);
    if (newPosts.length > 0) {
      setState(prev => {
        const existingIds = new Set(prev.socialFeed.map((post: any) => post.id));
        const unique = newPosts.filter((post: any) => !existingIds.has(post.id));
        return unique.length > 0 ? { ...prev, socialFeed: [...prev.socialFeed, ...unique] } : prev;
      });
    }
    return true;
  }

  if (action.type === 'RETIRE_JERSEY_NUMBER') {
    const payload = (action as any).payload as {
      teamId: number;
      playerId: string;
      number: string;
      playerName: string;
      seasonsWithTeam: number;
      gamesWithTeam: number;
      allStarAppearances: number;
      championships: number;
      tier: import('../../types').RetiredJerseyRecord['tier'];
      reason: import('../../types').RetiredJerseyRecord['reason'];
    };
    setState(prev => {
      const team = prev.teams.find(item => item.id === payload.teamId);
      if (!team) return prev;
      const player = prev.players.find(item => item.internalId === payload.playerId);
      const existing = ((team as any).retiredJerseyNumbers ?? []) as import('../../types').RetiredJerseyRecord[];
      if (existing.some(jersey => jersey.playerId === payload.playerId)) return prev;
      const newRecord: import('../../types').RetiredJerseyRecord = {
        number: payload.number,
        text: payload.playerName,
        pid: (player as any)?.pid,
        playerId: payload.playerId,
        seasonRetired: prev.leagueStats?.year ?? new Date(prev.date).getFullYear(),
        teamId: payload.teamId,
        reason: payload.reason,
        tier: payload.tier,
      };
      const teamDisplayName = getTeamFullName(team);
      const accoladeBits: string[] = [];
      if (payload.allStarAppearances > 0) accoladeBits.push(`${payload.allStarAppearances}x All-Star`);
      if (payload.championships > 0) accoladeBits.push(`${payload.championships}x Champion`);
      const accoladeStr = accoladeBits.length
        ? ` The honor follows a franchise tenure that included ${accoladeBits.join(', ')}.`
        : '';
      const newsItem: import('../../types').NewsItem = {
        id: `jersey-retire-${payload.playerId}-${payload.teamId}-${Date.now()}`,
        headline: `${teamDisplayName} Retire #${payload.number} for ${payload.playerName}`,
        content: `${teamDisplayName} have retired #${payload.number} in honor of ${payload.playerName}, recognizing ${payload.seasonsWithTeam} seasons and ${payload.gamesWithTeam} games with the franchise.${accoladeStr}`,
        date: prev.date,
        category: 'Transaction',
        isNew: true,
        read: false,
      };
      const historyEntry: import('../../types').HistoryEntry = {
        text: `${teamDisplayName} retired #${payload.number} in honor of ${payload.playerName}.`,
        date: prev.date,
        type: 'Jersey Retirement',
        playerIds: [payload.playerId],
      };
      return {
        ...prev,
        teams: prev.teams.map(item =>
          item.id === payload.teamId ? { ...item, retiredJerseyNumbers: [...existing, newRecord] } : item,
        ),
        news: [newsItem, ...(prev.news ?? [])],
        history: [...(prev.history ?? []), historyEntry],
      };
    });
    return true;
  }

  return false;
}
