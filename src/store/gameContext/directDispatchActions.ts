import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { GameState, UserAction } from '../../types';
import { SettingsManager } from '../../services/SettingsManager';
import { initImageCache } from '../../services/imageCache';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { loadGameState } from './loadGameState';

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
      const calendar = autoGenerateTrainingCalendar(prev.schedule || [], teamId, startISO, 365, preservedUserPlans as any);
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

  if (action.type === 'SAVE_CONTEST_RESULT') {
    const { contest, result } = action.payload;
    setState(prev => prev.allStar ? {
      ...prev,
      allStar: {
        ...prev.allStar,
        ...(contest === 'dunk' ? { dunkContest: result } : { threePointContest: result }),
      },
    } : prev);
    return true;
  }

  if (action.type === 'SAVE_THRONE_RESULT') {
    const { result } = action.payload;
    setState(prev => prev.allStar ? { ...prev, allStar: { ...prev.allStar, throne: result } } : prev);
    return true;
  }

  if (action.type === 'MERGE_THRONE_LIFECYCLE') {
    const patch = action.payload?.allStarPatch ?? {};
    setState(prev => prev.allStar ? { ...prev, allStar: { ...prev.allStar, ...patch } } : prev);
    return true;
  }

  if (action.type === 'RECORD_WATCHED_GAME') {
    const { gameId, result } = action.payload;
    setState(prev => {
      const watchedGame = prev.schedule.find((game: any) => game.gid === gameId);
      const newSchedule = prev.schedule.map((game: any) =>
        game.gid === gameId ? { ...game, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : game,
      );
      const boxScoreEntry = {
        ...result,
        gameId,
        date: prev.date,
        competitionId: watchedGame?.competitionId ?? result.competitionId,
        competitionPhase: watchedGame?.competitionPhase ?? result.competitionPhase,
      };
      const existing = (prev.boxScores || []).findIndex((box: any) => box.gameId === gameId);
      const newBoxScores = existing >= 0
        ? (prev.boxScores || []).map((box: any, index: number) => index === existing ? boxScoreEntry : box)
        : [...(prev.boxScores || []), boxScoreEntry];
      return { ...prev, schedule: newSchedule, boxScores: newBoxScores };
    });

    const watchedHome = resolveAnyTeam(result.homeTeamId, stateRef.current.teams, stateRef.current.nonNBATeams ?? []);
    const watchedAway = resolveAnyTeam(result.awayTeamId, stateRef.current.teams, stateRef.current.nonNBATeams ?? []);
    if (watchedHome && watchedAway) {
      import('../../services/ImagnPhotoService').then(({ fetchGamePhotos }) => {
        fetchGamePhotos({ homeTeam: watchedHome, awayTeam: watchedAway }).catch(() => {});
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
      const replacementPlayer = prev.players.find(player => player.internalId === replacementId);
      const replacementTeam = prev.teams.find(team => team.id === replacementPlayer?.tid);
      const updatedRoster = prev.allStar.roster.map(player =>
        player.playerId === injuredId ? { ...player, isInjuredDNP: true } : player,
      );
      const alreadyIn = updatedRoster.some(player => player.playerId === replacementId);
      if (!alreadyIn && replacementPlayer) {
        updatedRoster.push({
          playerId: replacementPlayer.internalId,
          playerName: replacementPlayer.name,
          teamAbbrev: replacementTeam?.abbrev ?? '',
          nbaId: null,
          teamNbaId: null,
          conference: conference || (replacementTeam?.conference ?? 'East'),
          isStarter: false,
          position: replacementPlayer.pos ?? 'F',
          category: (replacementPlayer.pos?.includes('G') ? 'Guard' : 'Frontcourt') as 'Guard' | 'Frontcourt',
          ovr: replacementPlayer.overallRating,
          isInjuryReplacement: true,
          injuredPlayerId: injuredId,
        });
      }
      return { ...prev, allStar: { ...prev.allStar, roster: updatedRoster } };
    });
    return true;
  }

  if (action.type === 'LOAD_GAME') {
    const loaded = action.payload as any;
    const { nextState, imageCachePlayers } = await loadGameState(loaded);
    setState(nextState);
    if (SettingsManager.getSettings().enableImageCache && imageCachePlayers.length > 0) {
      initImageCache(imageCachePlayers).catch(() => {});
    }
    return true;
  }

  if (action.type === 'UPDATE_STATE') {
    setState(prev => ({ ...prev, ...action.payload }));
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
      const teamDisplayName = [team.region, team.name].filter(Boolean).join(' ');
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
