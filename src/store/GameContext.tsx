import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { GameState, UserAction, Tab, Bet, BetLeg, NBAPlayer } from '../types';
import { processTurn, handleStartGame, handleAnnounceChange } from './logic/gameLogic';
import { useGameActions } from './useGameActions';
import { initialState } from './initialState';
import { sendChatMessage } from '../services/llm/llm';
import { prefetchPlayerBio } from '../components/central/view/bioCache';
import { SettingsManager } from '../services/SettingsManager';
import { initImageCache } from '../services/imageCache';
import { normalizeDate } from '../utils/helpers';
import { setActiveSaveId } from './gameplanStore';
import { setActiveSaveId as setTradingBlockSaveId } from './tradingBlockStore';
import { setActiveSaveId as setScoringOptionsSaveId } from './scoringOptionsStore';
import { setActiveSaveId as setCoachStrategySaveId } from './coachStrategyLockStore';
import { setActiveSaveId as setIdealRotationSaveId } from './idealRotationStore';
import { setActiveSaveId as setCoachSystemSaveId } from './coachSystemStore';
import { enforceExternalMinRoster, repairGeneratedExternalPlayer } from '../services/externalLeagueSustainer';
import { applyCupAwardsToPlayers } from '../services/nbaCup/awards';
import { computeRookieSalaryUSD } from '../utils/rookieContractUtils';
import { generateAIBids, isPlausibleActiveMarket, MAX_FA_MARKET_DECISION_WINDOW_DAYS } from '../services/freeAgencyBidding';
import { setAssistantGMActive } from '../services/assistantGMFlag';
import { getCurrentOffseasonEffectiveFAStart, getCurrentOffseasonFAMoratoriumEnd, parseGameDate, toISODateString } from '../utils/dateUtils';
import {
  defaultOffseasonChecklist,
  setRowStatus,
  OFFSEASON_ROW_TAB,
  getOffseasonState,
} from '../services/offseason/offseasonState';
import type { OffseasonChecklistRow } from '../types';

interface GameContextType {
  state: GameState;
  dispatchAction: (action: UserAction) => Promise<void>;
  markEmailRead: (id: string) => void;
  clearOutcome: () => void;
  saveSocialThread: (postId: string, replies: any[]) => void;
  toggleLike: (postId: string) => void;
  toggleRetweet: (postId: string) => void;
  markSocialRead: () => void;
  markNewsRead: () => void;
  markChatRead: (chatId: string) => void;
  followUser: (handle: string) => void;
  unfollowUser: (handle: string) => void;
  markPayslipsRead: () => void;
  currentView: Tab;
  setCurrentView: (view: Tab) => void;
  selectedTeamId: number | null;
  setSelectedTeamId: (id: number | null) => void;
  navigateToTeam: (teamId: number) => void;
  navigateToTeamFinances: (teamId: number) => void;
  pendingStatSort: { type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null;
  setPendingStatSort: (sort: { type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null) => void;
  placeBet: (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => void;
  updatePlayerRatings: (playerId: string, season: number, ratings: Record<string, number>) => void;
  createPlayer: (player: import('../types').NBAPlayer) => void;
  healPlayer: (playerId: string) => void;
  updateProfile: (profile: Partial<import('../types').UserProfile>) => void;
  addPost: (post: import('../types').SocialPost) => void;
  addReply: (postId: string, reply: import('../types').SocialPost) => void;
  generateReplies: (postId: string) => Promise<void>;
  isGeneratingReplies: Record<string, boolean>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<GameState>(initialState);
  const [currentView, setCurrentView] = useState<Tab>('Schedule');
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [pendingStatSort, setPendingStatSort] = useState<{ type: 'player' | 'team'; field: string; order: 'asc' | 'desc' } | null>(null);
  const generationIdRef = useRef(0);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    // Expose live state for debug cheats (SPAM/WARP/STUCK need post-dispatch snapshots).
    (window as any).__nbaGetLiveState = () => stateRef.current;
  }, [state]);

  useEffect(() => {
    setActiveSaveId(state.saveId);
    setTradingBlockSaveId(state.saveId);
    setScoringOptionsSaveId(state.saveId);
    setCoachStrategySaveId(state.saveId);
    setIdealRotationSaveId(state.saveId);
    setCoachSystemSaveId(state.saveId);
  }, [state.saveId]);

  // Set default view for GM mode when game first loads
  useEffect(() => {
    if (state.isDataLoaded && state.gameMode === 'gm' && currentView === 'Schedule') {
      setCurrentView('Team Office');
    }
  }, [state.isDataLoaded, state.gameMode]);

  // ── Offseason 2K-style checklist auto-lifecycle ────────────────────────
  // Lazy-init when calendar enters an offseason phase (anything besides
  // 'inSeason'); tear down when calendar returns to 'inSeason'. GM mode only
  // — commissioners see the regular calendar UI. Skipped if state isn't
  // loaded yet to avoid spurious init during game-start.
  useEffect(() => {
    if (!state.isDataLoaded) return;
    if (state.gameMode !== 'gm') return;
    if (!state.date) return;
    // Pass playoffsActive signal so bracketComplete inside the offseason
    // calendar window correctly flips us out of 'inSeason' (Finals overrun).
    const playoffsActive = !!(state.playoffs?.series ?? []).some(
      (s: any) => s.status !== 'complete',
    );
    let phase: string;
    try {
      phase = getOffseasonState(
        state.date,
        state.leagueStats as any,
        state.schedule as any,
        { playoffsActive, draftComplete: !!state.draftComplete },
      ).phase;
    } catch {
      return;
    }
    // Offseason mode triggers when:
    //   - phase derivation says we're past inSeason (post-Finals → opening night)
    //   - OR the draft lottery has been resolved (lottery happens DURING playoffs
    //     in real life, mid-May; sidebar should appear so user can mark it done
    //     and see what comes next without waiting for Finals to wrap)
    const inOffseason =
      phase !== 'inSeason' ||
      !!(state.draftLotteryResult && state.draftLotteryResult.length > 0);
    // Tear-down condition: only when calendar is past opening night AND no
    // pending checklist activity (avoid wiping the user's mid-FA progress).
    const isFullyInSeason = phase === 'inSeason' && !inOffseason;
    const hasChecklist = !!state.offseasonChecklist;
    if (inOffseason && !hasChecklist) {
      setState(prev => ({ ...prev, offseasonChecklist: defaultOffseasonChecklist() }));
    } else if (isFullyInSeason && hasChecklist) {
      setState(prev => ({
        ...prev,
        offseasonChecklist: undefined,
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
    }
  }, [state.isDataLoaded, state.gameMode, state.date, state.offseasonChecklist, state.playoffs, state.draftComplete, state.draftLotteryResult]);

const actions = useGameActions(setState, () => stateRef.current);

  const navigateToTeam = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('NBA Central');
  };

  const navigateToTeamFinances = (teamId: number) => {
    setSelectedTeamId(teamId);
    setCurrentView('Team Finances');
  };

  const dispatchAction = async (action: UserAction) => {
    if (action.type === 'CLEAR_OUTCOME') {
      actions.clearOutcome();
      return;
    }

    if (action.type === 'SAVE_SOCIAL_THREAD') {
      actions.saveSocialThread(action.payload.postId, action.payload.replies);
      return;
    }

    if (action.type === 'SET_TRAINING_DAILY_PLAN') {
      // ISO-date-keyed (`YYYY-MM-DD`). User-set plans are marked `auto: false`
      // so the auto-scheduler never clobbers them.
      const { teamId, dayKey, plan } = action.payload as { teamId: number; dayKey: string; plan: any };
      setState(prev => ({
        ...prev,
        teams: prev.teams.map(t => t.id === teamId
          ? { ...t, trainingCalendar: { ...(t.trainingCalendar || {}), [dayKey]: { ...plan, auto: false } } }
          : t),
      }));
      return;
    }

    if (action.type === 'SET_PLAYER_TRAINING_INTENSITY') {
      const { playerId, intensity } = action.payload as { playerId: string; intensity: 'Rest' | 'Half' | 'Normal' | 'Double' };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p => p.internalId === playerId ? { ...p, trainingIntensity: intensity } : p),
      }));
      return;
    }

    if (action.type === 'AUTOFILL_TEAM_TRAINING_CALENDAR') {
      // Manual trigger from the UI — regenerate the auto-fill for the given team
      // (preserving any user-set plans). Useful when the player wants a clean
      // slate without losing their overrides.
      const { teamId } = action.payload as { teamId: number };
      const { autoGenerateTrainingCalendar } = await import('../services/training/trainingScheduler');
      setState(prev => {
        const team = prev.teams.find(t => t.id === teamId);
        if (!team) return prev;
        const preservedUserPlans = Object.fromEntries(
          Object.entries((team.trainingCalendar as any) ?? {}).filter(([, plan]: [string, any]) => plan?.auto === false)
        );
        const calendar = autoGenerateTrainingCalendar(prev.schedule || [], teamId, prev.date, 365, preservedUserPlans as any);
        return {
          ...prev,
          teams: prev.teams.map(t => t.id === teamId ? { ...t, trainingCalendar: calendar } : t),
        };
      });
      return;
    }

    if (action.type === 'SET_PLAYER_DEV_FOCUS') {
      const { playerId, devFocus } = action.payload as { playerId: string; devFocus: string };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p => p.internalId === playerId ? { ...p, devFocus } : p),
      }));
      return;
    }

    if (action.type === 'SET_PLAYER_MENTOR') {
      const { playerId, mentorId } = action.payload as { playerId: string; mentorId: string | null };
      // One mentor per player (docs/mentorship.md §1) — enforce uniqueness at the
      // dispatch boundary so the relationship is atomic. Assigning mentor X to
      // player A automatically clears X from any other mentee.
      setState(prev => {
        const today = (prev.date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        const closeOpenEntry = (history: NBAPlayer['mentorHistory']) =>
          (history ?? []).map(h => (h.endDate ? h : { ...h, endDate: today }));
        return {
          ...prev,
          players: prev.players.map(p => {
            if (p.internalId === playerId) {
              const closed = closeOpenEntry(p.mentorHistory);
              const next = mentorId
                ? [...closed, { mentorId, startDate: today }]
                : closed;
              return { ...p, mentorId, mentorHistory: next };
            }
            // Mentor reassigned away from a previous mentee — close their open entry too.
            if (mentorId && p.mentorId === mentorId) {
              return { ...p, mentorId: null, mentorHistory: closeOpenEntry(p.mentorHistory) };
            }
            return p;
          }),
        };
      });
      return;
    }

    if (action.type === 'RESET_PLAYER_FAMILIARITY') {
      // Reserved for trade / coach-fire "Clean Slate" hook (docs/training.md §2).
      // Currently familiarity lives on team, not player — this is a no-op stub
      // until Phase 3 wires per-player familiarity tracking.
      return;
    }

    if (action.type === 'ADD_PENDING_HYPNOSIS') {
      setState(prev => ({
        ...prev,
        pendingHypnosis: [...(prev.pendingHypnosis || []), action.payload]
      }));
      return;
    }

    if (action.type === 'UPDATE_SAVE_ID') {
      setState(prev => ({ ...prev, saveId: action.payload }));
      return;
    }

    if (action.type === 'SAVE_CONTEST_RESULT') {
      const { contest, result } = action.payload;
      setState(prev => {
        if (!prev.allStar) return prev;
        return {
          ...prev,
          allStar: {
            ...prev.allStar,
            ...(contest === 'dunk' ? { dunkContest: result } : { threePointContest: result }),
          }
        };
      });
      return;
    }

    if (action.type === 'SAVE_THRONE_RESULT') {
      const { result } = action.payload;
      setState(prev => prev.allStar
        ? { ...prev, allStar: { ...prev.allStar, throne: result } }
        : prev);
      return;
    }

    if (action.type === 'RECORD_WATCHED_GAME') {
      const { gameId, result } = action.payload;
      setState(prev => {
        const newSchedule = prev.schedule.map((g: any) =>
          g.gid === gameId ? { ...g, played: true, homeScore: result.homeScore, awayScore: result.awayScore } : g
        );
        const boxScoreEntry = { ...result, gameId, date: prev.date };
        const existing = (prev.boxScores || []).findIndex((b: any) => b.gameId === gameId);
        const newBoxScores = existing >= 0
          ? (prev.boxScores || []).map((b: any, i: number) => i === existing ? boxScoreEntry : b)
          : [...(prev.boxScores || []), boxScoreEntry];
        // NOTE: wins/losses are NOT updated here — ADVANCE_DAY handles that via the watchedGameResult
        // injection in simulateGames to avoid double-counting (RECORD_WATCHED_GAME + ADVANCE_DAY race).
        return { ...prev, schedule: newSchedule, boxScores: newBoxScores };
      });

      // Fire photo fetch for watched game — non-blocking
      const watchedHome = state.teams.find(t => t.id === result.homeTeamId);
      const watchedAway = state.teams.find(t => t.id === result.awayTeamId);
      if (watchedHome && watchedAway) {
        import('../services/ImagnPhotoService').then(({ fetchGamePhotos }) => {
          fetchGamePhotos({ homeTeam: watchedHome, awayTeam: watchedAway }).catch(() => {});
        });
      }
      return;
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
      return;
    }

    if (action.type === 'REAL_ESTATE_INVENTORY_UPDATE') {
      setState(prev => ({ ...prev, realEstateInventory: action.payload.inventory }));
      return;
    }

    if (action.type === 'COMMISH_STORE_INVENTORY_UPDATE') {
      setState(prev => ({ ...prev, commishStoreInventory: action.payload.inventory }));
      return;
    }

    if (action.type === 'RIG_ALL_STAR_VOTING') {
      const { playerId, ghostVotes } = action.payload as { playerId: string; ghostVotes: number };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? {
          ...prev.allStar,
          hasRiggedVoting: true,
          votes: prev.allStar.votes.map(v =>
            v.playerId === playerId ? { ...v, votes: v.votes + ghostVotes } : v
          ),
        } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'SET_DUNK_CONTESTANTS') {
      const { contestants } = action.payload as { contestants: any[] };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? { ...prev.allStar, dunkContestContestants: contestants, dunkContestAnnounced: true } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'SET_THREE_POINT_CONTESTANTS') {
      const { contestants } = action.payload as { contestants: any[] };
      setState(prev => ({
        ...prev,
        allStar: prev.allStar ? { ...prev.allStar, threePointContestants: contestants, threePointAnnounced: true } : prev.allStar,
      }));
      return;
    }

    if (action.type === 'ADD_ALL_STAR_REPLACEMENT') {
      const { injuredId, replacementId, replacementName, conference, position } = action.payload as any;
      setState(prev => {
        if (!prev.allStar) return prev;
        const replacementPlayer = prev.players.find(p => p.internalId === replacementId);
        const replacementTeam = prev.teams.find(t => t.id === replacementPlayer?.tid);
        // Mark injured player as DNP
        const updatedRoster = prev.allStar.roster.map(r =>
          r.playerId === injuredId ? { ...r, isInjuredDNP: true } : r
        );
        // Only add replacement if not already in roster
        const alreadyIn = updatedRoster.some(r => r.playerId === replacementId);
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
      return;
    }

    if (action.type === 'LOAD_GAME') {
      const loaded = action.payload as any;
      // Portrait migration: external league players whose imgURL came from bio gists
      // (non-ProBallers URLs) get cleared so they show initials rather than wrong headshots.
      // The externalRosterService now correctly prefers item.imgURL (ProBallers) over bio.image,
      // but existing saves may still have bio.image stored. Clear them here.
      const EXTERNAL_STATUSES_SET = new Set(['WNBA','Euroleague','PBA','B-League','G-League','Endesa','China CBA','NBL Australia']);
      // Clear bad portrait URLs: only the ProBallers default "no photo" placeholder (head-par-defaut)
      // and NBA CDN headshots on external-league players (those are passport-style shots of wrong player).
      // Do NOT clear other URLs — external gists store legit portrait URLs (basketball-ref, ESPN, etc.)
      const isBadPortrait = (p: any) => {
        if (!p.imgURL) return false;
        if (p.imgURL.includes('head-par-defaut')) return true; // ProBallers default placeholder
        // NBA CDN headshots on external players = wrong person's passport photo,
        // UNLESS the player has a srID (real Basketball-Reference slug) — then it's
        // a real NBA player demoted to G-League/Euroleague and the photo is correct.
        if (EXTERNAL_STATUSES_SET.has(p.status ?? '') && p.imgURL.includes('cdn.nba.com/headshots') && !p.srID) return true;
        return false;
      };
      // Contract amount sync: update contract.amount from contractYears[] for the current season.
      // Without this, saved games always use the year the save was first created (e.g. $13.9M rookie opt
      // for Cade Cunningham in year 1, even after he signs a max extension for $46M+ in year 2+).
      const currentSeasonYear: number = loaded.leagueStats?.year ?? new Date().getFullYear();
      const currentSeasonStr = `${currentSeasonYear - 1}-${String(currentSeasonYear).slice(-2)}`;

      // Contract.amount is stored in BBGM thousands — even the richest max
      // contract tops out near 80,000 (= $80M). Anything above 250,000 (= $250M)
      // is garbage. The user reported Season-2 payrolls in the trillions per
      // team, which means some flow leaked a USD or inflated value into the
      // thousands slot. We don't know the upstream source yet, but we can
      // repair the save on LOAD_GAME: prefer contractYears[currentSeason]
      // (the source of truth), fall back to the closest season with a sane
      // guaranteed value, else clamp to a plausible max.
      const SANE_CONTRACT_CAP_THOUSANDS = 250_000; // $250M
      const SANE_GUARANTEED_CAP_USD     = 250_000_000; // $250M

      const recoverAmountFromContractYears = (p: any): number | undefined => {
        const cy = p.contractYears as Array<{ season: string; guaranteed: number }> | undefined;
        if (!Array.isArray(cy) || cy.length === 0) return undefined;
        // Exact current-season match first.
        const exact = cy.find(e => e.season === currentSeasonStr);
        const candidates: number[] = [];
        if (exact && exact.guaranteed > 0 && exact.guaranteed <= SANE_GUARANTEED_CAP_USD) {
          candidates.push(Math.round(exact.guaranteed / 1000));
        }
        // Any other season entry whose USD value looks sane (back-up path if the
        // exact-season entry itself is corrupt — grab the first reasonable one).
        for (const e of cy) {
          if (e === exact) continue;
          if (e.guaranteed > 0 && e.guaranteed <= SANE_GUARANTEED_CAP_USD) {
            candidates.push(Math.round(e.guaranteed / 1000));
          }
        }
        return candidates.find(v => v > 0 && v <= SANE_CONTRACT_CAP_THOUSANDS);
      };

      let normalizedFreeAgentTypoCount = 0;
      const migratedPlayers = (loaded.players as any[] | undefined)?.map(p => {
        let updated = isBadPortrait(p) ? { ...p, imgURL: undefined } : p;
        updated = repairGeneratedExternalPlayer(updated as any, currentSeasonYear) as any;
        // Sync contract.amount to current season from contractYears[] if available.
        // Guard against corrupt guaranteed values — only apply the sync if the
        // result falls in a sane range.
        if (updated.contract && Array.isArray(updated.contractYears)) {
          const entry = updated.contractYears.find((cy: any) => cy.season === currentSeasonStr);
          if (entry && entry.guaranteed > 0 && entry.guaranteed <= SANE_GUARANTEED_CAP_USD) {
            const syncedAmount = Math.round(entry.guaranteed / 1000);
            if (syncedAmount > 0 && syncedAmount <= SANE_CONTRACT_CAP_THOUSANDS && syncedAmount !== updated.contract.amount) {
              updated = { ...updated, contract: { ...updated.contract, amount: syncedAmount } };
            }
          }
        }
        // Rookie contract heal: prior to the rookieContractUtils unit fix,
        // computeRookieSalaryUSD treated salaryCap (USD) as millions, inflating
        // every drafted rookie contract by ~1,000,000×. Saves with that
        // damage have garbage contract.amount AND garbage contractYears.
        // Recompute both from pickSlot when we can identify the rookie.
        if (
          updated.contract?.rookie &&
          updated.draft?.round && updated.draft?.pick &&
          updated.draft?.year &&
          typeof updated.contract.amount === 'number' &&
          updated.contract.amount > SANE_CONTRACT_CAP_THOUSANDS
        ) {
          const round: number = Number(updated.draft.round);
          const pickInRound: number = Number(updated.draft.pick);
          const pickSlot = (round - 1) * 30 + pickInRound;
          const fixedUSD = computeRookieSalaryUSD(pickSlot, loaded.leagueStats);
          const fixedAmount = Math.round(fixedUSD / 1000);
          const draftYear: number = Number(updated.draft.year);
          const expYear: number = Number(updated.contract.exp ?? 0);
          const totalYrs = expYear > draftYear && expYear - draftYear <= 6 ? expYear - draftYear : null;
          const teamOptExp = updated.contract.teamOptionExp;
          const firstOptionYr = updated.contract.hasTeamOption && teamOptExp ? Number(teamOptExp) : undefined;
          const rebuiltCY = totalYrs
            ? Array.from({ length: totalYrs }, (_, i) => {
                const yr = draftYear + i;
                const leagueYr = yr + 1;
                return {
                  season: `${yr}-${String(yr + 1).slice(-2)}`,
                  guaranteed: Math.round(fixedUSD * Math.pow(1.05, i)),
                  option: firstOptionYr != null && leagueYr >= firstOptionYr ? 'Team' : '',
                };
              })
            : updated.contractYears;
          console.warn(`[LOAD_GAME] Repaired inflated rookie contract for ${updated.name}: ${updated.contract.amount} → ${fixedAmount}`);
          updated = {
            ...updated,
            contract: { ...updated.contract, amount: fixedAmount },
            ...(rebuiltCY ? { contractYears: rebuiltCY } : {}),
          };
        }
        // Repair corrupt contract.amount — see comment above. Kicks in when a
        // prior session left the value in USD-like units, producing $16.7T
        // payrolls. Try contractYears first; if no sane source, fall back to
        // the league min ($1.3M = 1300 thousand).
        const amt = updated.contract?.amount;
        if (updated.contract && typeof amt === 'number' && (amt > SANE_CONTRACT_CAP_THOUSANDS || amt < 0 || !Number.isFinite(amt))) {
          const recovered = recoverAmountFromContractYears(updated) ?? 1300;
          console.warn(`[LOAD_GAME] Repaired corrupt contract.amount for ${updated.name}: ${amt} → ${recovered}`);
          updated = { ...updated, contract: { ...updated.contract, amount: recovered } };
        }
        // First-season two-way detection: BBGM data doesn't set twoWay:true, but two-way players
        // have ~$625K salary (< $800K threshold for grace). Mark them so roster-trim excludes them.
        if (!updated.twoWay && updated.tid >= 0 && (updated.contract?.amount ?? 0) > 0 && (updated.contract?.amount ?? 9999) < 800) {
          updated = { ...updated, twoWay: true };
        }
        // FA purgatory repair: `simulationHandler.autoTrimOversizedRosters` used to
        // write `status: 'FreeAgent'` (no space) — the canonical FA status is
        // `'Free Agent'` (with space) per types.ts and every FA signing filter.
        // Trim-released players became invisible to Pass 1/2/3/4/5 and got stuck
        // as FAs forever. Fixed upstream 2026-04-24; normalize existing saves here.
        if ((updated as any).status === 'FreeAgent') {
          updated = { ...updated, status: 'Free Agent' };
          normalizedFreeAgentTypoCount++;
        }
        // Repair off-by-one teamOptionExp for sim-generated draft picks.
        // Old formula: teamOptionExp = draftYear + guaranteedYrs  → fires 1 yr too early.
        // Correct:     teamOptionExp = draftYear + guaranteedYrs + 1 (after all guaranteed years).
        // exp had the same -1 error: old = draftYear + totalYrs - 1, correct = draftYear + totalYrs.
        // Only applies when hasTeamOption is still set (option not yet exercised/declined).
        if (updated.contract?.hasTeamOption && updated.draft?.year) {
          const draftYear: number = Number(updated.draft.year);
          const guaranteedYrs: number = loaded.leagueStats?.rookieContractLength ?? 2;
          if (updated.contract.teamOptionExp === draftYear + guaranteedYrs) {
            updated = {
              ...updated,
              contract: {
                ...updated.contract,
                teamOptionExp: draftYear + guaranteedYrs + 1,
                exp: (updated.contract.exp ?? 0) + 1,
              },
            };
          }
        }
        // Backfill contractYears[] for already-drafted rookies. Prior to the draft-
        // pick fix, computeDraftPickFields never seeded per-season rows, so Path A
        // in PlayerBioContractTab had nothing to render and Path B's currentYear..exp
        // loop silently dropped past rookie seasons. Synthesize from draft.year +
        // contract.exp + contract.amount so salary history shows every rookie year.
        if (
          updated.contract?.rookie &&
          updated.draft?.year &&
          updated.contract?.exp &&
          (!Array.isArray(updated.contractYears) || updated.contractYears.length === 0)
        ) {
          const draftYear: number = Number(updated.draft.year);
          const expYear: number = Number(updated.contract.exp);
          // exp is the last season's leagueStats year (= end year). First season
          // is "draftYear-(draftYear+1)" whose leagueStats year = draftYear + 1.
          // totalYrs = exp - (draftYear + 1) + 1 = exp - draftYear.
          const totalYrs = expYear - draftYear;
          if (totalYrs > 0 && totalYrs <= 6) {
            const baseUSD = (updated.contract.amount ?? 0) * 1000;
            if (baseUSD > 0) {
              const teamOptExp: number | undefined = updated.contract.teamOptionExp;
              // Option years sit at the tail of the deal. When hasTeamOption is
              // still set, teamOptionExp marks the FIRST option year (leagueStats
              // year convention). Post-exercise, the flag is cleared — we don't
              // know which years were options, so fall back to no option labels
              // (salaries still render; option annotation lost is acceptable).
              const firstOptionYr = updated.contract.hasTeamOption && teamOptExp ? teamOptExp : undefined;
              const backfilled = Array.from({ length: totalYrs }, (_, i) => {
                const yr = draftYear + i;
                const leagueYr = yr + 1; // "2026-27" row represents leagueStats.year = 2027
                return {
                  season: `${yr}-${String(yr + 1).slice(-2)}`,
                  guaranteed: Math.round(baseUSD * Math.pow(1.05, i)),
                  option: firstOptionYr != null && leagueYr >= firstOptionYr ? 'Team' : '',
                };
              });
              updated = { ...updated, contractYears: backfilled };
            }
          }
        }
        // Backfill contractYears[] for active NBA players who slipped through without
        // gist coverage (e.g. SGA — name mismatch, not in gist). Without this,
        // Path B in PlayerBioContractTab renders currentYear→exp, which shrinks
        // to 1 row by the final contract season. Seeds from contract.amount (BBGM
        // thousands) + 5% escalator to match the rosterService.ts fallback.
        if (
          updated.tid >= 0 && updated.tid < 100 &&
          updated.contract?.amount &&
          updated.contract?.exp &&
          (!Array.isArray((updated as any).contractYears) || (updated as any).contractYears.length === 0) &&
          !updated.contract.rookie // rookies handled by the block above
        ) {
          const amt: number = updated.contract.amount;
          const exp: number = updated.contract.exp;
          if (amt > 0 && exp >= currentSeasonYear) {
            const salaryUSD = amt * 1_000;
            const backfilled = Array.from({ length: exp - currentSeasonYear + 1 }, (_, i) => {
              const yr = currentSeasonYear + i;
              return {
                season: `${yr - 1}-${String(yr).slice(-2)}`,
                guaranteed: Math.round(salaryUSD * Math.pow(1.05, i)),
                option: '',
              };
            });
            updated = { ...updated, contractYears: backfilled } as any;
          }
        }
        // Age-bloat cleanup: retired players that aged past plausible lifespan in
        // saves predating Fix 13 (mortalityChecker). One-shot retroactive fix.
        if ((updated as any).status === 'Retired' && !(updated as any).diedYear) {
          const currentAge = currentSeasonYear - ((updated as any).born?.year ?? 2000);
          if (currentAge > 95) {
            const assumedDeathAge = Math.max(85, currentAge - 8);
            updated = { ...updated, diedYear: ((updated as any).born?.year ?? 2000) + assumedDeathAge } as any;
          }
        }
        return updated;
      }) ?? loaded.players;

      if (normalizedFreeAgentTypoCount > 0) {
        console.log(`[LOAD_GAME] Healed ${normalizedFreeAgentTypoCount} legacy 'FreeAgent' status records → 'Free Agent'.`);
      }

      let healedPhantomUserRosterCount = 0;
      const loadedPlayers = ((migratedPlayers ?? loaded.players ?? []) as any[]).map((p: any) => {
        const userTid = loaded.gameMode === 'gm' ? Number(loaded.userTeamId) : -999;
        if (!Number.isFinite(userTid) || p.tid !== userTid || p.status !== 'Free Agent') return p;
        const hasCommittedContract =
          !!p.contract &&
          Number(p.contract.amount ?? 0) > 0 &&
          Number(p.contract.exp ?? 0) >= currentSeasonYear;
        if (hasCommittedContract) return p;
        healedPhantomUserRosterCount++;
        return {
          ...p,
          tid: -1,
          twoWay: undefined,
          nonGuaranteed: false,
          gLeagueAssigned: false,
          signedDate: undefined,
          tradeEligibleDate: undefined,
        };
      });
      if (healedPhantomUserRosterCount > 0) {
        console.warn(`[LOAD_GAME] Released ${healedPhantomUserRosterCount} phantom user-roster FA(s) back to free agency.`);
      }
      const { additions: externalRosterRepairs } = enforceExternalMinRoster({
        ...loaded,
        players: loadedPlayers,
      } as any, currentSeasonYear);
      const finalPlayers = externalRosterRepairs.length > 0
        ? [...loadedPlayers, ...externalRosterRepairs]
        : loadedPlayers;

      // Backfill Cup awards from all historical cups + current cup.
      // Needed because the ID-mismatch bug (numeric internalId) meant real players
      // like Jokic/Doncic/Sengun never received their awards at cup completion.
      const allHistoricalCups = Object.values((loaded.nbaCupHistory ?? {}) as Record<string, any>);
      if (loaded.nbaCup?.mvpPlayerId) allHistoricalCups.push(loaded.nbaCup);
      const backfilledPlayers = allHistoricalCups.reduce(
        (players: any[], cup: any) => cup?.mvpPlayerId || cup?.allTournamentTeam?.length || cup?.championTid != null
          ? applyCupAwardsToPlayers(cup, players)
          : players,
        finalPlayers,
      );

      // Legacy exhibition-rules migration. The seeds in constants.ts are now correct,
      // but saves from before the default flip persist the old values. Three patterns
      // get rewritten to the modern tournament defaults:
      //   - allStarMirrorLeagueRules=true  (legacy seed) — keep at the old 4×12=48 min,
      //     unless QL is explicitly the legacy 12; flip to mirror=false + QL=3.
      //   - allStarMirrorLeagueRules=false + QL=12 — incoherent (12 IS league mirror).
      //   - risingStarsFormat='tournament' or 'rookies_vs_sophomores' — invalid /
      //     legacy; replace with the canonical '4team_tournament'.
      const ls: any = loaded.leagueStats ?? {};
      const migratedLeagueStats = { ...ls };
      let staleRulesMigrated = false;
      if (ls.allStarMirrorLeagueRules === true && ls.allStarQuarterLength === 12) {
        migratedLeagueStats.allStarMirrorLeagueRules = false;
        migratedLeagueStats.allStarQuarterLength = 3;
        staleRulesMigrated = true;
      }
      if (ls.allStarMirrorLeagueRules === false && ls.allStarQuarterLength === 12) {
        migratedLeagueStats.allStarQuarterLength = 3;
        staleRulesMigrated = true;
      }
      if (ls.risingStarsMirrorLeagueRules === false && ls.risingStarsQuarterLength === 12) {
        migratedLeagueStats.risingStarsQuarterLength = 3;
        staleRulesMigrated = true;
      }
      if (ls.risingStarsFormat === 'rookies_vs_sophomores' || ls.risingStarsFormat === 'tournament') {
        migratedLeagueStats.risingStarsFormat = '4team_tournament';
        staleRulesMigrated = true;
      }
      if (staleRulesMigrated) {
        console.log('[LOAD_GAME] Migrated stale exhibition rules to tournament defaults.');
      }

      // Strip rounding-noise dead-money entries from existing saves: any year-row
      // below $50K, plus any entry whose total drops below $50K after the cleanup.
      // New waivers already filter at write time.
      const DEAD_MONEY_FLOOR_USD = 50_000;
      let deadMoneyTrimmed = 0;
      const teamsWithCleanDeadMoney = (loaded.teams ?? []).map((t: any) => {
        if (!t.deadMoney || t.deadMoney.length === 0) return t;
        const cleanedEntries = t.deadMoney
          .map((e: any) => ({
            ...e,
            remainingByYear: (e.remainingByYear ?? []).filter((y: any) => (y.amountUSD ?? 0) >= DEAD_MONEY_FLOOR_USD),
          }))
          .filter((e: any) => {
            if (!e.remainingByYear || e.remainingByYear.length === 0) return false;
            const total = e.remainingByYear.reduce((s: number, y: any) => s + y.amountUSD, 0);
            return total >= DEAD_MONEY_FLOOR_USD;
          });
        const removed = t.deadMoney.length - cleanedEntries.length;
        if (removed > 0) deadMoneyTrimmed += removed;
        return { ...t, deadMoney: cleanedEntries };
      });
      if (deadMoneyTrimmed > 0) {
        console.log(`[LOAD_GAME] Stripped ${deadMoneyTrimmed} zero-amount dead-money entries.`);
      }

      const loadedForMarketCheck = {
        ...initialState,
        ...loaded,
        leagueStats: migratedLeagueStats,
        players: backfilledPlayers,
        teams: teamsWithCleanDeadMoney as any,
      } as GameState;
      const playerById = new Map(backfilledPlayers.map((p: any) => [p.internalId, p]));
      let purgedResolvedFAMarkets = 0;
      let purgedExpiredFAMarkets = 0;
      let purgedSignedFAMarkets = 0;
      const cleanedFAMarkets = (loaded.faBidding?.markets ?? []).filter((m: any) => {
        const player = playerById.get(m.playerId) as any;
        if (m.resolved) {
          purgedResolvedFAMarkets++;
          return false;
        }
        if (player && player.tid >= 0) {
          purgedSignedFAMarkets++;
          return false;
        }
        if (m.openedDay != null && ((loadedForMarketCheck.day ?? 0) - m.openedDay) > MAX_FA_MARKET_DECISION_WINDOW_DAYS) {
          purgedExpiredFAMarkets++;
          return false;
        }
        if (!isPlausibleActiveMarket(m, loadedForMarketCheck, player)) {
          purgedExpiredFAMarkets++;
          return false;
        }
        return true;
      });
      const removedFAMarkets = purgedResolvedFAMarkets + purgedExpiredFAMarkets + purgedSignedFAMarkets;
      if (removedFAMarkets > 0) {
        console.log(`[LOAD_GAME] Purged ${removedFAMarkets} stale FA markets (resolved=${purgedResolvedFAMarkets}, expired=${purgedExpiredFAMarkets}, signed=${purgedSignedFAMarkets})`);
      }

      const seenOptionHistory = new Set<string>();
      let removedOptionHistory = 0;
      const cleanedHistory = [...(loaded.history ?? [])].reverse().filter((entry: any) => {
        const text = String(entry?.text ?? '').toLowerCase();
        const isOptionDecision =
          text.includes('player option') ||
          text.includes('team option');
        if (!isOptionDecision) return true;
        const playerKey = Array.isArray(entry.playerIds) && entry.playerIds.length > 0
          ? entry.playerIds.join(',')
          : text.replace(/\$[\d.]+m/g, '').replace(/\s+/g, ' ').trim();
        const kind = text.includes('player option') ? 'player-option' : 'team-option';
        const key = `${kind}|${entry.date ?? ''}|${playerKey}`;
        if (seenOptionHistory.has(key)) {
          removedOptionHistory++;
          return false;
        }
        seenOptionHistory.add(key);
        return true;
      }).reverse();
      if (removedOptionHistory > 0) {
        console.log(`[LOAD_GAME] Removed ${removedOptionHistory} duplicate option transaction(s).`);
      }

      // Training calendar migration — purge legacy numeric-keyed entries (pre-ISO format)
      // and re-run the auto-scheduler to clear stale July/transactions plans on old saves.
      // User overrides marked `auto: false` are preserved by the scheduler.
      let teamsWithFreshTraining: any[] = teamsWithCleanDeadMoney as any;
      try {
        const { autoGenerateTrainingCalendarsForAllTeams } = await import('../services/training/trainingScheduler');
        let migratedCount = 0;
        teamsWithFreshTraining = teamsWithFreshTraining.map((t: any) => {
          const cal = t.trainingCalendar;
          if (!cal) return t;
          // Strip any non-ISO keys (legacy numeric format) and entries with no ISO `YYYY-MM-DD` shape.
          const isoOnly: Record<string, any> = {};
          for (const [k, v] of Object.entries(cal)) {
            if (typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) isoOnly[k] = v;
            else migratedCount++;
          }
          return { ...t, trainingCalendar: isoOnly };
        });
        if (migratedCount > 0) {
          console.log(`[LOAD_GAME] Stripped ${migratedCount} legacy training-calendar entries (numeric-keyed).`);
        }
        // Re-run auto-scheduler so banned-phase days (July FA, offseason, trade week)
        // get cleared and missing days get filled. Preserves user-set plans (auto: false).
        if (loaded.schedule && Array.isArray(loaded.schedule) && loaded.date) {
          teamsWithFreshTraining = autoGenerateTrainingCalendarsForAllTeams(
            teamsWithFreshTraining,
            loaded.schedule,
            loaded.date,
            365
          );
          console.log('[LOAD_GAME] Refreshed training calendars via auto-scheduler.');
        }
      } catch (e) {
        console.warn('[LOAD_GAME] training-calendar migration failed', e);
      }

      setState({
        ...initialState,
        ...loaded,
        leagueStats: migratedLeagueStats,
        players: backfilledPlayers,
        teams: teamsWithFreshTraining as any,
        history: cleanedHistory,
        faBidding: { markets: cleanedFAMarkets },
        isProcessing: false
      });

      // Kick off background image caching if enabled
      if (SettingsManager.getSettings().enableImageCache && finalPlayers) {
        initImageCache(finalPlayers).catch(() => {});
      }
      return;
    }
    if (action.type === 'UPDATE_STATE') {
      setState(prev => ({ ...prev, ...action.payload }));
      return;
    }

    // ── Offseason 2K-style checklist actions (Phase A) ────────────────────
    // Pure UI-state mutations: navigation + row-status flips. Heavy work
    // (auto-resolve, FA tag advance) is delegated to existing services and
    // wired in subsequent phases.
    if (action.type === 'OFFSEASON_ENTER_PHASE') {
      const row = (action.payload as { row: OffseasonChecklistRow }).row;
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'in-progress'),
      }));
      // Auto-navigate to the right view so user lands where the action lives.
      const target = OFFSEASON_ROW_TAB[row];
      if (target) setCurrentView(target);
      return;
    }

    if (action.type === 'OFFSEASON_COMPLETE_PHASE') {
      const row = (action.payload as { row: OffseasonChecklistRow }).row;
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'done'),
      }));
      return;
    }

    if (action.type === 'OFFSEASON_SKIP_PHASE') {
      // Skip = trust the AI auto-resolve already baked into seasonRollover /
      // autoResolvers. Phase B/C will hook actual auto-resolution per row;
      // for now this just flips the status so the sidebar advances.
      const row = (action.payload as { row: OffseasonChecklistRow }).row;
      setState(prev => ({
        ...prev,
        offseasonChecklist: setRowStatus(prev.offseasonChecklist, row, 'skipped'),
      }));
      return;
    }

    if (action.type === 'OFFSEASON_RESET_CHECKLIST') {
      // Called once when offseason starts (or by debug tools to retry a phase).
      setState(prev => ({
        ...prev,
        offseasonChecklist: defaultOffseasonChecklist(),
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
      return;
    }

    // ── Auto-resolve every remaining phase via assistantGM lazy sim ─────
    // Single button at the top of AUFGABEN. Skips straight to opening
    // night using the existing lazy-sim path with assistantGM=true so
    // every user-team transaction (re-signs, FA bids, options) is
    // handled by the AI assistant. Auto-tear-down useEffect wipes the
    // checklist when calendar phase returns to 'inSeason'.
    if (action.type === 'OFFSEASON_AUTO_RESOLVE_ALL') {
      const ls = stateRef.current.leagueStats as any;
      const lsYear: number = ls?.year ?? 2026;
      // Next opening night = Oct 21 of cYear (calendar year). Pass
      // lsYear+1 so getOpeningNightDate returns the upcoming Oct (it
      // computes Oct of seasonYear-1 per BBGM convention).
      const cMonth = stateRef.current.date ? new Date(stateRef.current.date).getUTCMonth() + 1 : 0;
      const cYear = stateRef.current.date ? new Date(stateRef.current.date).getUTCFullYear() : lsYear;
      // Pre-rollover (lsYear === cYear, summer of same calendar year)
      // means we want next season's opening; post-rollover lsYear was
      // already bumped so use lsYear directly.
      const openingSeasonYear = (cMonth <= 6 && cYear === lsYear) ? lsYear + 1 : lsYear;
      const { getOpeningNightDate } = await import('../utils/dateUtils');
      const target = toISODateString(getOpeningNightDate(openingSeasonYear));
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: target, stopBefore: true, assistantGM: true },
      } as any);
      return;
    }

    // ── Qualifying Offer submission (Phase D — RFA decision) ─────────────
    // Submit: stamps contract.restrictedFA so the FA market gives the prior
    // team match rights when offers come in (faMarketTicker pendingMatch
    // flow already handles this).
    // Skip: clears the flag so the player walks as UFA — no match rights.
    // The default for R1 rookies is RFA via isPlayerRFA fallback; this lets
    // the GM explicitly opt out for a player they don't want to retain.
    if (action.type === 'SUBMIT_QUALIFYING_OFFER') {
      const { playerId } = (action as any).payload as { playerId: string };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.internalId === playerId
            ? { ...p, contract: { ...(p.contract as any), restrictedFA: true, isRestrictedFA: true, qualifyingOfferSubmitted: true } } as any
            : p,
        ),
      }));
      return;
    }

    if (action.type === 'SKIP_QUALIFYING_OFFER') {
      const { playerId } = (action as any).payload as { playerId: string };
      setState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.internalId === playerId
            ? { ...p, contract: { ...(p.contract as any), restrictedFA: false, isRestrictedFA: false, qualifyingOfferSkipped: true, qualifyingOfferSubmitted: false } } as any
            : p,
        ),
      }));
      return;
    }

    if (action.type === 'OFFSEASON_EXIT') {
      // Tear down — calendar is back in regular season, sidebar disappears.
      setState(prev => ({
        ...prev,
        offseasonChecklist: undefined,
        faTagCounter: undefined,
        pendingOfferDecisions: [],
      }));
      return;
    }

    // ── FA Tag system (Phase C) ──────────────────────────────────────────
    // The 2K-style "Free Agency · Tag X/13" counter. Each Tag advance is
    // ~5 calendar days under the hood — but the user only ever sees the
    // counter. Reuses the existing SIMULATE_TO_DATE path so all the
    // FA market ticker / AI signing / Bird Rights logic from the
    // orchestrator fires correctly.
    //
    // Tag 1 lands on the first legal signing day (post-moratorium). On
    // initial Enter we skip the moratorium silently so the user never has
    // to look at a "signings disabled" wait period.
    if (action.type === 'OFFSEASON_ADVANCE_FA_TAG') {
      const total = stateRef.current.faTagsTotal ?? 13;
      const counter = stateRef.current.faTagCounter ?? 0;
      const currentDateStr = stateRef.current.date;
      if (!currentDateStr) return;

      // First Tag — skip moratorium
      if (counter === 0) {
        const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(
          currentDateStr,
          stateRef.current.leagueStats as any,
          stateRef.current.schedule as any,
        );
        const targetISO = toISODateString(moratoriumEnd);
        const currentNorm = normalizeDate(currentDateStr);
        if (currentNorm < targetISO) {
          // Recursive dispatch — runs through SIMULATE_TO_DATE which handles
          // the lazy sim, AI signings, market ticks all via the orchestrator.
          await dispatchAction({
            type: 'SIMULATE_TO_DATE',
            payload: { targetDate: targetISO, stopBefore: false },
          } as any);
        }
        setState(prev => ({
          ...prev,
          faTagCounter: 1,
          faTagsTotal: total,
        }));
        return;
      }

      // Subsequent Tags — advance ~62/N days (≈5 for N=13)
      const daysPerTag = Math.max(1, Math.floor(62 / total));
      const currentDate = new Date(`${normalizeDate(currentDateStr)}T00:00:00Z`);
      currentDate.setUTCDate(currentDate.getUTCDate() + daysPerTag);
      const targetISO = toISODateString(currentDate);
      await dispatchAction({
        type: 'SIMULATE_TO_DATE',
        payload: { targetDate: targetISO, stopBefore: true },
      } as any);

      const newCounter = counter + 1;
      if (newCounter >= total) {
        // Final Tag — mark FA row done, clear counter
        setState(prev => ({
          ...prev,
          offseasonChecklist: setRowStatus(prev.offseasonChecklist, 'freeAgency', 'done'),
          faTagCounter: undefined,
          faTagsTotal: undefined,
        }));
      } else {
        setState(prev => ({ ...prev, faTagCounter: newCounter }));
      }
      return;
    }

    if (action.type === 'SUBMIT_FA_BID') {
      // User enters the competitive FA market instead of signing instantly.
      // Creates a market if none exists, replaces any prior user bid on the
      // same player (only one active user bid at a time), and lets the daily
      // market ticker resolve at decidesOnDay. Does NOT mutate the player —
      // resolution is the only path that applies the contract.
      const { playerId, playerName, teamId, teamName, teamLogoUrl, salaryUSD, years, option } = action.payload as {
        playerId: string;
        playerName: string;
        teamId: number;
        teamName: string;
        teamLogoUrl?: string;
        salaryUSD: number;
        years: number;
        option: 'NONE' | 'PLAYER' | 'TEAM';
      };
      setState(prev => {
        const currentDay = prev.day ?? 0;
        const currentPlayer = prev.players.find(p => p.internalId === playerId);
        if (prev.gameMode === 'gm' && currentPlayer && (currentPlayer.tid === -1 || currentPlayer.status === 'Free Agent') && prev.date) {
          const currentDate = parseGameDate(prev.date);
          const faStart = getCurrentOffseasonEffectiveFAStart(currentDate, prev.leagueStats as any, prev.schedule as any);
          if (currentDate < faStart) return prev;
        }
        const moratoriumEndDay = (() => {
          if (!prev.date) return currentDay + 4;
          const currentDate = parseGameDate(prev.date);
          const moratoriumEnd = getCurrentOffseasonFAMoratoriumEnd(currentDate, prev.leagueStats as any, prev.schedule as any);
          if (isNaN(currentDate.getTime()) || isNaN(moratoriumEnd.getTime())) return currentDay + 4;
          return currentDay + Math.max(0, Math.ceil((moratoriumEnd.getTime() - currentDate.getTime()) / 86_400_000));
        })();
        // Always give bids placed during moratorium at least 4 days post-moratorium
        // before resolution — otherwise a "skip through moratorium" lands ON the
        // boundary day, resolution fires immediately, and the user has no chance
        // to react to AI counter-bids that opened during the lockout.
        const decisionDay = Math.max(currentDay + 4, moratoriumEndDay + 4);
        const playerById = new Map(prev.players.map(p => [p.internalId, p]));
        const markets = (prev.faBidding?.markets ?? [])
          .filter((m: any) => m.resolved || isPlausibleActiveMarket(m, prev, playerById.get(m.playerId) ?? currentPlayer))
          // Drop stale resolved markets for THIS player — they pile up across
          // FA cycles (player gets signed → waived → re-enters FA) and confuse
          // the UI's "live bid tracker" which picks the first match by playerId.
          // Without this, a fresh Warren bid lands while a months-old "resolved
          // today" market is still on screen.
          .filter((m: any) => !(m.resolved && m.playerId === playerId))
          .map((m: any) => ({ ...m, bids: [...(m.bids ?? [])] }));
        const newUserBid = {
          id: `user-bid-${playerId}-${teamId}-${Date.now()}`,
          playerId,
          teamId,
          teamName,
          teamLogoUrl,
          salaryUSD,
          years,
          option,
          isUserBid: true,
          submittedDay: currentDay,
          // Stay active until the market's decision day; if market doesn't exist
          // yet we'll seed a 4-day window.
          expiresDay: decisionDay,
          status: 'active' as const,
        };
        const aiCounterBids = currentPlayer
          ? generateAIBids(currentPlayer, prev, 5)
          : [];
        const existingIdx = markets.findIndex(m => m.playerId === playerId && !m.resolved);
        if (existingIdx >= 0) {
          const existing = markets[existingIdx];
          const existingDecisionDay = Math.max(
            existing.decidesOnDay ?? decisionDay,
            decisionDay,
            ...aiCounterBids.map(b => b.expiresDay ?? decisionDay),
          );
          const withoutPrior = existing.bids.filter(b => !b.isUserBid);
          const existingAiTeamIds = new Set(withoutPrior.map(b => b.teamId));
          const newCounterBids = aiCounterBids
            .filter(b => !existingAiTeamIds.has(b.teamId))
            .map(b => ({ ...b, expiresDay: Math.max(b.expiresDay ?? existingDecisionDay, existingDecisionDay) }));
          markets[existingIdx] = {
            ...existing,
            bids: [...withoutPrior, ...newCounterBids, { ...newUserBid, expiresDay: existingDecisionDay }],
            decidesOnDay: existingDecisionDay,
            season: existing.season ?? (prev.leagueStats?.year ?? 2026),
            openedDay: existing.openedDay ?? currentDay,
            openedDate: existing.openedDate ?? prev.date,
          };
        } else {
          const marketDecisionDay = Math.max(
            decisionDay,
            ...aiCounterBids.map(b => b.expiresDay ?? decisionDay),
          );
          markets.push({
            playerId,
            playerName,
            bids: [
              ...aiCounterBids.map(b => ({ ...b, expiresDay: Math.max(b.expiresDay ?? marketDecisionDay, marketDecisionDay) })),
              { ...newUserBid, expiresDay: marketDecisionDay },
            ],
            decidesOnDay: marketDecisionDay,
            resolved: false,
            season: prev.leagueStats?.year ?? 2026,
            openedDay: currentDay,
            openedDate: prev.date,
          });
        }
        const stored = markets.find(m => m.playerId === playerId && !m.resolved);
        console.log(`[SUBMIT_FA_BID] Stored user bid for ${playerName} → ${teamName}: $${(salaryUSD / 1_000_000).toFixed(1)}M/${years}yr. Market entry: resolved=${stored?.resolved}, decidesOnDay=${stored?.decidesOnDay}, totalBids=${stored?.bids?.length ?? 0}`);
        return { ...prev, faBidding: { markets } };
      });
      return;
    }

    // ── RFA matching offer-sheet actions ────────────────────────────────────
    // User-owned RFA gets a winning offer from another team → market goes into
    // pending-match state. User has to MATCH (apply contract to user's team) or
    // DECLINE (let signing team have him). Both trigger the next ticker pass to
    // resolve and emit transactions/news.
    if (action.type === 'MATCH_RFA_OFFER' || action.type === 'DECLINE_RFA_OFFER') {
      const { playerId } = (action as any).payload as { playerId: string };
      const decision = action.type === 'MATCH_RFA_OFFER' ? 'match' : 'decline';
      setState(prev => {
        const markets = (prev.faBidding?.markets ?? []).slice();
        const idx = markets.findIndex(m => m.playerId === playerId && m.pendingMatch);
        if (idx < 0) return prev;
        const m = markets[idx];
        const userTid = (prev as any).userTeamId ?? -999;
        // Force the AI tick to pick up this user's decision: flip the prior tid
        // off the user's team if they declined (so the tick auto-declines next
        // pass), or leave it set to userTid + bypass the user-skip via pre-applied
        // mutation below if they matched.
        if (decision === 'match') {
          // Apply the match here directly — flip winning bid's teamId to userTid.
          const offerBid = m.bids.find(b => b.id === m.pendingMatchOfferBidId);
          if (!offerBid) return prev;
          const player = prev.players.find(p => p.internalId === playerId);
          if (!player) return prev;
          const team = prev.teams.find(t => t.id === userTid);
          if (!team) return prev;
          const finalYears = offerBid.years;
          const currentYear = prev.leagueStats?.year ?? new Date().getFullYear();
          const newContract = {
            amount: Math.round(offerBid.salaryUSD / 1_000),
            exp: currentYear + finalYears - 1,
            hasPlayerOption: offerBid.option === 'PLAYER',
          };
          const newContractYears = Array.from({ length: finalYears }, (_, i) => {
            const yr = currentYear + i;
            return {
              season: `${yr - 1}-${String(yr).slice(-2)}`,
              guaranteed: Math.round(offerBid.salaryUSD * Math.pow(1.05, i)),
              option: i === finalYears - 1 && offerBid.option === 'PLAYER' ? 'Player'
                    : i === finalYears - 1 && offerBid.option === 'TEAM' ? 'Team' : '',
            };
          });
          const histYears = ((player as any).contractYears ?? []).filter((cy: any) => {
            const yr = parseInt(cy.season.split('-')[0], 10) + 1;
            return yr < currentYear;
          });
          const updatedPlayers = prev.players.map(p =>
            p.internalId === playerId
              ? {
                  ...p,
                  tid: userTid,
                  status: 'Active' as const,
                  contract: newContract,
                  contractYears: [...histYears, ...newContractYears],
                } as any
              : p,
          );
          markets[idx] = { ...m, resolved: true, pendingMatch: false, matchedByPriorTeam: true };
          const annualM = Math.round(offerBid.salaryUSD / 100_000) / 10;
          const totalM = Math.round(annualM * finalYears);
          const signingTeam = prev.teams.find(t => t.id === offerBid.teamId);
          const histEntry = {
            text: `${team.name} matched ${signingTeam?.name ?? 'opposing'} offer sheet on ${player.name}: $${totalM}M/${finalYears}yr.`,
            date: prev.date,
            type: 'Signing',
            playerIds: [player.internalId],
          };
          return {
            ...prev,
            players: updatedPlayers,
            faBidding: { markets },
            history: [...((prev as any).history ?? []), histEntry] as any,
          } as any;
        } else {
          // Decline — clear pendingMatchPriorTid so the next tick treats it as
          // an expired window and resolves to the signing team.
          markets[idx] = {
            ...m,
            pendingMatchExpiresDay: (prev.day ?? 0) - 1,  // immediate expiry
            pendingMatchPriorTid: -1,                     // unset prior to short-circuit user check
          };
          return { ...prev, faBidding: { markets } };
        }
      });
      return;
    }

    // ── Social-only actions — pure state patches, never run the simulation ──
    if (action.type === 'CACHE_PROFILE') {
      const { handle, profile } = (action as any).payload;
      setState(prev => ({
        ...prev,
        cachedProfiles: { ...(prev.cachedProfiles || {}), [handle.replace('@', '')]: profile },
      }));
      return;
    }
    if (action.type === 'TOGGLE_LIKE') {
      const id = (action as any).payload;
      setState(prev => ({
        ...prev,
        socialFeed: prev.socialFeed.map((p: any) =>
          p.id === id ? { ...p, isLiked: !p.isLiked, likes: p.isLiked ? p.likes - 1 : p.likes + 1 } : p
        ),
      }));
      return;
    }
    if (action.type === 'TOGGLE_RETWEET') {
      const id = (action as any).payload;
      setState(prev => ({
        ...prev,
        socialFeed: prev.socialFeed.map((p: any) =>
          p.id === id ? { ...p, isRetweeted: !p.isRetweeted, retweets: p.isRetweeted ? p.retweets - 1 : p.retweets + 1 } : p
        ),
      }));
      return;
    }
    if (action.type === 'ADD_POST') {
      setState(prev => ({ ...prev, socialFeed: [(action as any).payload, ...prev.socialFeed] }));
      return;
    }
    if (action.type === 'ADD_REPLY' || action.type === 'ADD_REPLIES') {
      const { replies, reply } = (action as any).payload;
      const newPosts: any[] = replies ?? (reply ? [reply] : []);
      if (newPosts.length > 0) {
        setState(prev => {
          const existingIds = new Set(prev.socialFeed.map((p: any) => p.id));
          const unique = newPosts.filter((p: any) => !existingIds.has(p.id));
          return unique.length > 0 ? { ...prev, socialFeed: [...prev.socialFeed, ...unique] } : prev;
        });
      }
      return;
    }

    if (action.type === 'RETIRE_JERSEY_NUMBER') {
      const {
        teamId, playerId, number, playerName,
        seasonsWithTeam, gamesWithTeam, allStarAppearances, championships,
        tier, reason,
      } = (action as any).payload as {
        teamId: number; playerId: string; number: string; playerName: string;
        seasonsWithTeam: number; gamesWithTeam: number;
        allStarAppearances: number; championships: number;
        tier: import('../types').RetiredJerseyRecord['tier'];
        reason: import('../types').RetiredJerseyRecord['reason'];
      };
      setState(prev => {
        const team = prev.teams.find(t => t.id === teamId);
        if (!team) return prev;
        const player = prev.players.find(p => p.internalId === playerId);
        const existing = ((team as any).retiredJerseyNumbers ?? []) as import('../types').RetiredJerseyRecord[];
        if (existing.some(j => j.playerId === playerId)) return prev;
        const newRecord: import('../types').RetiredJerseyRecord = {
          number, text: playerName,
          pid: (player as any)?.pid,
          playerId,
          seasonRetired: prev.leagueStats?.year ?? new Date(prev.date).getFullYear(),
          teamId,
          reason, tier,
        };
        const teamDisplayName = [team.region, team.name].filter(Boolean).join(' ');
        const accoladeBits: string[] = [];
        if (allStarAppearances > 0) accoladeBits.push(`${allStarAppearances}× All-Star`);
        if (championships > 0) accoladeBits.push(`${championships}× Champion`);
        const accoladeStr = accoladeBits.length
          ? ` The honor follows a franchise tenure that included ${accoladeBits.join(', ')}.`
          : '';
        const newsItem: import('../types').NewsItem = {
          id: `jersey-retire-${playerId}-${teamId}-${Date.now()}`,
          headline: `${teamDisplayName} Retire #${number} for ${playerName}`,
          content: `${teamDisplayName} have retired #${number} in honor of ${playerName}, recognizing ${seasonsWithTeam} seasons and ${gamesWithTeam} games with the franchise.${accoladeStr}`,
          date: prev.date,
          category: 'Transaction',
          isNew: true,
          read: false,
        };
        const historyEntry: import('../types').HistoryEntry = {
          text: `${teamDisplayName} retired #${number} in honor of ${playerName}.`,
          date: prev.date,
          type: 'Jersey Retirement',
          playerIds: [playerId],
        };
        return {
          ...prev,
          teams: prev.teams.map(t =>
            t.id === teamId ? { ...t, retiredJerseyNumbers: [...existing, newRecord] } : t
          ),
          news: [newsItem, ...(prev.news ?? [])],
          history: [...(prev.history ?? []), historyEntry],
        };
      });
      return;
    }

    const isClubbing = action.type === 'GO_TO_CLUB';
    const isWatchingGame = action.payload?.isWatchingGame === true;
    setState(prev => ({
      ...prev,
      isProcessing: true,
      isClubbing: isClubbing,
      isWatchingGame: isWatchingGame,
      pendingStartPayload: action.type === 'START_GAME' ? action.payload : prev.pendingStartPayload,
      lastActionType: action.type,
      lastActionPayload: action.payload,
      lastSimResults: [],
      simCurrentDate: undefined,
      prevTeams: prev.teams,
    }));

    if (isClubbing) {
        setTimeout(() => {
            setState(prev => ({ ...prev, isClubbing: false }));
        }, SettingsManager.getDelay(5000));
    }

    try {
      let newStatePatch: Partial<GameState> = {};

      if (action.type === 'START_GAME') {
        const genId = ++generationIdRef.current;
        setState(prev => ({ ...prev, isProcessing: true, pendingStartPayload: action.payload }));

        const payloadWithProgress = {
          ...action.payload,
          onProgress: (progress: any) => {
            setState(prev => ({ ...prev, lazySimProgress: progress }));
          },
        };

        const newStatePatch = await handleStartGame(payloadWithProgress);

        setState(prev => {
          if (genId === generationIdRef.current) {
            return { ...prev, ...newStatePatch, lazySimProgress: undefined, pendingStartPayload: undefined };
          }
          return prev;
        });
        return;
      } else if (action.type === 'ANNOUNCE_CHANGE') {
        newStatePatch = await handleAnnounceChange(state, action.payload);
      } else if (action.type === 'UPDATE_RULES') {
        const updatedLeagueStats = { ...state.leagueStats, ...action.payload };
        let updatedSchedule = state.schedule;
        // When a media deal is finalized, re-attach broadcasters to all unplayed games
        if (action.payload.mediaRights) {
          const { attachBroadcastersToGames } = await import('../utils/broadcastingUtils');
          updatedSchedule = attachBroadcastersToGames(state.schedule, action.payload.mediaRights, state.teams);
        }
        newStatePatch = {
          leagueStats: updatedLeagueStats,
          schedule: updatedSchedule,
          isProcessing: false
        };
      } else if (action.type === 'SEND_CHAT_MESSAGE') {
        // Handle chat message
        const { chatId, text, imageUrl, targetId, targetName, targetRole, targetOrg, avatarUrl, isHypnotized } = action.payload;
        
        // 1. Add user message immediately
        let newChats = [...stateRef.current.chats];
        let chatIndex = newChats.findIndex(c => c.id === chatId);
        let chat = chatIndex !== -1 ? { ...newChats[chatIndex] } : null;

        if (!chat && targetId) {
          // Check if a chat with this target already exists by participants
          const existingChatIndex = newChats.findIndex(c => 
            c.participants.includes('commissioner') && c.participants.includes(targetId)
          );
          
          if (existingChatIndex !== -1) {
            chat = { ...newChats[existingChatIndex] };
            chatIndex = existingChatIndex;
          }
        }

        if (!chat) {
          // Create new chat
          chat = {
            id: chatId || `chat-${Date.now()}`,
            participants: ['commissioner', targetId],
            participantDetails: [
              { id: 'commissioner', name: stateRef.current.commissionerName, role: 'Commissioner' },
              { id: targetId, name: targetName, role: targetRole, avatarUrl }
            ],
            messages: [],
            unreadCount: 0,
            isTyping: true
          };
          newChats.unshift(chat);
          chatIndex = 0;
        } else {
          chat.isTyping = true;
          chat.messages = chat.messages.map(m => ({ ...m, seen: true })); // Mark previous messages as seen when user replies
          newChats[chatIndex] = chat;
          // Move to top
          newChats.splice(chatIndex, 1);
          newChats.unshift(chat);
          chatIndex = 0;
        }

        const gameDate = new Date(stateRef.current.date);
        const now = new Date();
        gameDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const timestamp = gameDate.toISOString();

        const userMessage = {
          id: `msg-${Date.now()}`,
          senderId: 'commissioner',
          senderName: stateRef.current.commissionerName,
          text,
          imageUrl,
          timestamp,
          read: true,
          seen: false,
          type: 'text' as const
        };

        chat.messages = [...chat.messages, userMessage];
        // Limit history to 100 messages in state (50 for prompt is handled in llm service)
        if (chat.messages.length > 100) {
          chat.messages = chat.messages.slice(-100);
        }
        chat.lastMessage = userMessage;

        setState(prev => ({ ...prev, chats: newChats, isProcessing: false })); // Update UI immediately

        // 2. Get LLM response asynchronously
        try {
          const responseText = await sendChatMessage(stateRef.current, targetName, targetRole, targetOrg, chat.messages, isHypnotized, targetId);

          // If hypnotized, add to pending hypnosis to be processed next day
          if (isHypnotized) {
              const commandText = text.replace('[HYPNOTIC COMMAND]: ', '').trim();
              dispatchAction({
                  type: 'ADD_PENDING_HYPNOSIS',
                  payload: { targetName, command: commandText }
              });
              
              // Set outcome for hypnotize so the user knows it worked
              setState(prev => ({
                  ...prev,
                  lastOutcome: `Hypnotic command transmitted to ${targetName}. They are now under your influence. The effects will manifest as the simulation progresses.`
              }));
          }

          // 3. Add bot message with realistic delay and potential splitting
          if (responseText && responseText.trim().length > 0 && !responseText.toLowerCase().includes("[seen zone]")) {
            // Split by sentences or paragraphs for realism if long
            const parts = responseText.split(/\n\n+/).filter(p => p.trim().length > 0);
            
            for (let i = 0; i < parts.length; i++) {
              // Typing delay based on length
              const part = parts[i];
              const baseDelay = Math.min(3000, Math.max(1000, part.length * 20));
              const delay = SettingsManager.getDelay(baseDelay);
              await new Promise(resolve => setTimeout(resolve, delay));

              setState(prev => {
                const updatedChats = [...prev.chats];
                const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
                if (updatedChatIndex !== -1) {
                  const updatedChat = { ...updatedChats[updatedChatIndex] };
                  // Only stop typing on the last part
                  if (i === parts.length - 1) {
                    updatedChat.isTyping = false;
                  }
                  
                  const botTimestamp = new Date(timestamp);
                  botTimestamp.setSeconds(botTimestamp.getSeconds() + i + 1);

                  const botMessage = {
                    id: `msg-${Date.now()}-${i}`,
                    senderId: targetId,
                    senderName: targetName,
                    text: part,
                    timestamp: botTimestamp.toISOString(),
                    read: false,
                    seen: false,
                    type: 'text' as const
                  };
                  updatedChat.messages = [...updatedChat.messages, botMessage];
                  updatedChat.lastMessage = botMessage;
                  updatedChat.unreadCount += 1;
                  updatedChats[updatedChatIndex] = updatedChat;
                }
                return { ...prev, chats: updatedChats };
              });
            }
          } else {
            // Seen zone or empty response
            const baseDelay = 1500 + Math.random() * 2000;
            const delay = SettingsManager.getDelay(baseDelay);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            setState(prev => {
              const updatedChats = [...prev.chats];
              const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
              if (updatedChatIndex !== -1) {
                const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
                // Mark user message as seen
                updatedChat.messages = updatedChat.messages.map(m => 
                  m.senderId === 'commissioner' ? { ...m, seen: true } : m
                );
                updatedChats[updatedChatIndex] = updatedChat;
              }
              return { ...prev, chats: updatedChats };
            });
          }
        } catch (error) {
          console.error("Chat LLM Error:", error);
          setState(prev => {
            const updatedChats = [...prev.chats];
            const updatedChatIndex = updatedChats.findIndex(c => c.id === chat!.id);
            if (updatedChatIndex !== -1) {
              const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
              updatedChats[updatedChatIndex] = updatedChat;
            }
            return { ...prev, chats: updatedChats };
          });
        }
        return;
      } else if (action.type === 'SIMULATE_TO_DATE') {
        // ── UNIFIED: ALL simulate-to-date goes through runLazySim ──
        // Always overlay mode — shows the progress screen (phase labels, %).
        // Short skips (≤30d) use batch=1 for precise event ordering.
        // Long skips (>30d) use batch=7 for speed.
        const targetNorm = normalizeDate(action.payload.targetDate);
        const currentNorm = normalizeDate(stateRef.current.date);
        const diffDays = Math.round(
          (new Date(`${targetNorm}T00:00:00Z`).getTime() - new Date(`${currentNorm}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24)
        );
        console.log('[SIM_TO_DATE] ▶️ dispatched', {
          rawTargetDate: action.payload.targetDate,
          targetNorm,
          currentStateDate: stateRef.current.date,
          currentNorm,
          diffDays,
          stateDay: stateRef.current.day,
        });
        const genId = ++generationIdRef.current;
        // Short sims (≤30 days, e.g. playoff round) use silent mode to avoid
        // the full-screen lazy-sim overlay that looks like the jumpstart screen.
        const simMode = diffDays > 30 ? 'overlay' : 'silent';
        // stopBefore: true — land on opening night with games unplayed.
        const stopBefore = action.payload?.stopBefore === true;
        const assistantGM = action.payload?.assistantGM === true;
        console.log('[SIM_TO_DATE] ⚙️ runLazySim options', {
          simMode,
          batchSize: diffDays > 30 ? 7 : 1,
          stopBefore,
          assistantGM,
        });
        // Overlay mode: pre-seed lazySimProgress BEFORE the dynamic import so the
        // full-screen progress ring renders immediately — no "Processing Executive
        // Order" flash while the chunk loads.
        if (simMode === 'overlay') {
          flushSync(() => setState(prev => ({
            ...prev,
            lazySimProgress: {
              currentDate: currentNorm,
              targetDate: targetNorm,
              daysComplete: 0,
              daysTotal: diffDays,
              currentPhase: 'Warming up simulation...',
              percentComplete: 0,
            },
          })));
        }
        const { runLazySim } = await import('../services/logic/lazySimRunner');
        const result = await runLazySim(
          stateRef.current,
          action.payload.targetDate,
          (progress: any) => {
            if (simMode === 'overlay') {
              setState(prev => ({ ...prev, lazySimProgress: progress }));
            } else {
              // Silent mode fallback: keep the date current on no-games days.
              // On game days, onGame takes over with finer-grained per-game updates.
              setState(prev =>
                prev.simCurrentDate === progress.currentDate ? prev : { ...prev, simCurrentDate: progress.currentDate }
              );
            }
          },
          {
            mode: simMode,
            batchSize: diffDays > 30 ? 7 : 1,
            stopBefore,
            assistantGM,
            // Silent mode: fire per-game so simCurrentDate "dances" with games as they
            // finish. flushSync defeats React 18 batching so each game's date paints
            // before the next game's sync sim call. Normalize to YYYY-MM-DD to stay
            // in lockstep with the progress-callback format.
            onGame: simMode === 'silent' ? (gameResult: any) => {
              const raw = gameResult?.date;
              if (!raw) return;
              const d = normalizeDate(raw);
              flushSync(() => {
                setState(prev => (prev.simCurrentDate === d ? prev : { ...prev, simCurrentDate: d }));
              });
            } : undefined,
          }
        );
        console.log('[SIM_TO_DATE] ✅ runLazySim returned', {
          endStateDate: result.state.date,
          endStateDay: result.state.day,
          endNorm: normalizeDate(result.state.date),
          lastSimResultsCount: result.lastSimResults.length,
          lastSimResultsDates: [...new Set(result.lastSimResults.map((r: any) => r.date))],
        });
        setState(prev => {
          if (genId !== generationIdRef.current) {
            console.log('[SIM_TO_DATE] ⚠️ genId mismatch — discarding result', { genId, current: generationIdRef.current });
            return prev;
          }
          return {
            ...prev,
            ...result.state,
            lazySimProgress: undefined,
            simCurrentDate: undefined,
            isProcessing: false,
            lastSimResults: result.lastSimResults.length > 0 ? result.lastSimResults : prev.lastSimResults,
          };
        });
        return;
      } else {
        const assistantGM = action.payload?.assistantGM === true;
        if (assistantGM) setAssistantGMActive(true);
        try {
          newStatePatch = await processTurn(
            stateRef.current,
            action,
            undefined,
            undefined,
          );
        } finally {
          if (assistantGM) setAssistantGMActive(false);
        }
      }

      // Phase 1 (immediate — show modal)
      setState(prev => ({
        ...prev,
        ...newStatePatch,
        stats: newStatePatch.stats || prev.stats,
        leagueStats: newStatePatch.leagueStats || prev.leagueStats,
        lastOutcome: newStatePatch.lastOutcome !== undefined ? newStatePatch.lastOutcome : prev.lastOutcome,
        lastConsequence: newStatePatch.lastConsequence || prev.lastConsequence,
        date: newStatePatch.date || prev.date,
        day: newStatePatch.day || prev.day,
        teams: newStatePatch.teams || prev.teams,
        players: newStatePatch.players || prev.players,
        schedule: newStatePatch.schedule || prev.schedule,
        lastSimResults: newStatePatch.lastSimResults || [],
        isProcessing: false,
      }));

        // Phase 2 (background — silent patch inbox/news/social)
        setTimeout(() => {
          setState(prev => {
            // Merge new chats with existing — don't overwrite if patch is empty
            const patchChats = newStatePatch.chats;
            const mergedChats = patchChats && patchChats.length > 0
              ? patchChats
              : prev.chats;
            return {
              ...prev,
              inbox: (newStatePatch.inbox ?? []).length > 0 ? newStatePatch.inbox! : prev.inbox,
              news: (newStatePatch.news ?? []).length > 0 ? newStatePatch.news! : prev.news,
              socialFeed: (newStatePatch.socialFeed ?? []).length > 0
                ? newStatePatch.socialFeed!
                : prev.socialFeed,
              chats: mergedChats,
            };
          });
        }, 100);

      // Phase 3 — fire generateLeaguePulse in background
      // Only for ADVANCE_DAY and similar non-action turns
      if (!action || action.type === 'ADVANCE_DAY') {
        const shouldRunPulse = Math.random() < ((newStatePatch as any).daysSimulated > 1 ? 0.90 : 0.60);
        if (shouldRunPulse) {
          import('../services/llm/llm').then(({ generateLeaguePulse }) => {
            generateLeaguePulse(stateRef.current, (newStatePatch as any).lastSimResults || []).then(pulse => {
              if (!pulse || (!pulse.newNews?.length && !pulse.newSocialPosts?.length && !pulse.newEmails?.length)) return;
              setState(prev => {
                const existingPostIds = new Set(prev.socialFeed.map((p: any) => p.id));
                const existingNewsIds = new Set(prev.news.map((n: any) => n.id));
                const existingEmailIds = new Set(prev.inbox.map((e: any) => e.id));
                const newPosts = (pulse.newSocialPosts || [])
                  .filter((p: any) => !existingPostIds.has(p.id))
                  .map((p: any, i: number) => ({ ...p, id: p.id || `pulse-${Date.now()}-${i}`, isNew: true }));
                const newNews = (pulse.newNews || [])
                  .filter((n: any) => !existingNewsIds.has(n.id))
                  .map((n: any, i: number) => ({ ...n, id: n.id || `pulse-news-${Date.now()}-${i}`, isNew: true }));
                const newEmails = (pulse.newEmails || [])
                  .filter((e: any) => !existingEmailIds.has(e.id));
                return {
                  ...prev,
                  socialFeed: [...newPosts, ...prev.socialFeed].slice(0, 500),
                  news: [...newNews, ...prev.news],
                  inbox: [...newEmails, ...prev.inbox],
                };
              });
            }).catch(err => console.warn('[Pulse] Background league pulse failed:', err));
          });
        }
      }
    } catch (error) {
      console.error("Failed to process action:", error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lazySimProgress: undefined,
        lastOutcome: "An error occurred while processing your action. The simulation glitched."
      }));
    }
  };
  useEffect(() => {
    if (!state.players || state.players.length === 0) return;
    const sorted = [...state.players]
      .filter(p => p.status === 'Active')
      .sort((a, b) => (b.overallRating ?? 0) - (a.overallRating ?? 0));
    sorted.forEach((player, i) => {
      setTimeout(() => prefetchPlayerBio(player), i * 4000);
    });
  }, [!!state.players?.length]);

  // Lazy-load staff when the browser is idle after game init
  useEffect(() => {
    if (!state.isDataLoaded || state.staff || !state.players?.length || !state.teams?.length) return;

    const load = () => {
      Promise.all([
        import('../services/staffService'),
        import('../data/photos/coaches'),
      ]).then(([staffMod, coachesMod]) => {
        const teamNameMap = new Map(state.teams.map(t => [t.name.toLowerCase(), t]));
        Promise.all([
          staffMod.getStaffData(state.players, teamNameMap),
          coachesMod.fetchCoachData(),
        ]).then(([staff]) => {
          setState(prev => ({ ...prev, staff }));
        });
      });
    };

    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(load, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(load, 2000);
      return () => clearTimeout(id);
    }
  }, [state.isDataLoaded, !!state.staff]);

  const placeBet = (bet: { type: Bet['type']; wager: number; potentialPayout: number; legs: BetLeg[] }) => {
    const newBet: Bet = {
      id: `bet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: state.date,
      type: bet.type,
      status: 'pending',
      wager: bet.wager,
      potentialPayout: bet.potentialPayout,
      legs: bet.legs,
    };
    setState(prev => ({
      ...prev,
      bets: [newBet, ...(prev.bets ?? [])],
      stats: {
        ...prev.stats,
        personalWealth: Math.max(0, Number((prev.stats.personalWealth - bet.wager / 1_000_000).toFixed(4))),
      },
    }));
  };

  return (
    <GameContext.Provider value={{
      state,
      dispatchAction,
      placeBet,
      currentView,
      setCurrentView,
      selectedTeamId,
      setSelectedTeamId,
      navigateToTeam,
      navigateToTeamFinances,
      pendingStatSort,
      setPendingStatSort,
      ...actions
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};
