import React, { useState, useMemo } from 'react';
import './index.css';
import {
  Player,
  DraftSlot,
  DraftStage,
  CardOption,
  SlotPosition,
  DraftMode,
  OrdinaryDraftType,
  getResolvedOvr,
} from './types';
import { generateCardOptions } from './lib/draftPool';
import { partitionPlayersForBriefcase, shuffleBriefcases } from './lib/briefcaseDraft';
import {
  extractTeams,
  initializeFantasyLeague,
  resolveAITeamsSubset,
  FantasyTeam,
  AIRoundPickSummary,
  TeamInfo,
  draftPlayerForAITeam,
  getUndraftedPlayersForTeam,
  selectRandomValidTeam,
} from './lib/wheelDraft';
import { soundFx } from './lib/audio';
import { Pack } from './components/Pack';
import { MysteryCard } from './components/MysteryCard';
import { PlayerReveal } from './components/PlayerReveal';
import { DraftRoster } from './components/DraftRoster';
import { FinalRoster } from './components/FinalRoster';
import { BriefcaseDraftView } from './components/BriefcaseDraftView';
import { WheelOfTeamsView } from './components/WheelOfTeamsView';
import { BudgetDraftView } from './components/BudgetDraftView';
import { calculateBudgetDraftStartingBudget, calculateBudgetPrices, BudgetPlayer, generateAIFantasyTeamsBudget, pickPlayerForAIBudget } from './lib/budgetDraft';
import { getOrdinaryDraftOrder, pickPlayerForAIOrdinary } from './lib/ordinaryDraft';
import { acquirePlayer, shuffleArray } from './lib/draftUtils';
import { autoBuildRoster } from './lib/rosterOptimizer';
import { Volume2, VolumeX, Trophy, Briefcase as BriefcaseIcon, Box, Disc, DollarSign, Users } from 'lucide-react';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { useFantasyDraftSessionSync } from './useFantasyDraftSessionSync';
import { DraftOrderReviewPanel } from './components/DraftOrderReviewPanel';

export interface DraftHistoryEntry {
  round: number;
  pickNumber: number;
  player: Player;
  fantasyTeamAbbrev: string;
  fantasyTeamName: string;
  fantasyTeamId: number;
  playerId: string;
}

export interface FantasyDraftSession {
  currentRound: number;
  stage: DraftStage;
  draftMode: DraftMode | null;
  briefcaseRounds: Player[][];
  currentBriefcases: Player[];
  cardOptions: CardOption[];
  selectedOption: CardOption | null;
  draftedIds: string[];
  briefcaseLifelines: number;
  userDraftSlot: number;
  fantasyTeams: FantasyTeam[];
  recentAiPicks: AIRoundPickSummary[];
  currentRoundPreUserAiPicks: AIRoundPickSummary[];
  budgetPlayers: BudgetPlayer[];
  remainingBudget: number;
  ordinaryDraftType: OrdinaryDraftType | null;
  randomRoundOrders: Record<number, number[]>;
  showOrdinaryTypeModal: boolean;
  draftHistory: DraftHistoryEntry[];
}

function assertStateIntegrity(teams: FantasyTeam[], draftedSet: Set<string>) {
  const playerOwner = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const team of teams) {
    for (const player of team.players) {
      if (playerOwner.has(player.id)) {
        duplicates.add(player.id);
      }
      playerOwner.set(player.id, String(team.id));
    }
  }

  const draftedButOwnerless: string[] = [];
  for (const id of draftedSet) {
    if (!playerOwner.has(id)) {
      draftedButOwnerless.push(id);
    }
  }

  const rosterButNotDrafted: string[] = [];
  for (const team of teams) {
    for (const player of team.players) {
      if (!draftedSet.has(player.id)) {
        rosterButNotDrafted.push(player.id);
      }
    }
  }

  const errors: string[] = [];
  if (duplicates.size > 0) {
    errors.push(`Duplicate ownership detected for players: ${Array.from(duplicates).join(', ')}`);
  }
  if (draftedButOwnerless.length > 0) {
    errors.push(`Drafted-but-ownerless players (in draftedIds but not in any team roster): ${draftedButOwnerless.join(', ')}`);
  }
  if (rosterButNotDrafted.length > 0) {
    errors.push(`Roster-but-not-drafted players (in team roster but missing from draftedIds): ${rosterButNotDrafted.join(', ')}`);
  }

  if (errors.length > 0) {
    console.error("STATE INTEGRITY VIOLATED:", errors.join(" | "));
    throw new Error(`State Integrity Violated: ${errors.join(" | ")}`);
  }
}

function appendPicksToHistory(
  currentHistory: DraftHistoryEntry[],
  round: number,
  picks: Array<{ team: FantasyTeam; player: Player }>
): DraftHistoryEntry[] {
  const nextHistory = [...currentHistory];
  for (const pick of picks) {
    nextHistory.push({
      round: round + 1,
      pickNumber: nextHistory.length + 1,
      player: pick.player,
      fantasyTeamAbbrev: pick.team.abbrev,
      fantasyTeamName: pick.team.name,
      fantasyTeamId: pick.team.id,
      playerId: pick.player.id,
    });
  }
  return nextHistory;
}

interface FantasyDraftExperienceProps {
  allPlayers: Player[];
  controlledTeamAbbrev: string;
  rosterSize: number;
  initialSession?: FantasyDraftSession;
  onSessionChange?: (session: FantasyDraftSession) => void;
  onComplete: (result: {
    teams: FantasyTeam[];
    history: DraftHistoryEntry[];
    mode: DraftMode;
    ordinaryDraftType: OrdinaryDraftType | null;
  }) => void;
}

export default function FantasyDraftExperience({
  allPlayers,
  controlledTeamAbbrev: initialControlledTeamAbbrev,
  rosterSize,
  initialSession,
  onSessionChange,
  onComplete,
}: FantasyDraftExperienceProps) {
  const teamsInfo = useMemo(() => extractTeams(allPlayers), [allPlayers]);
  const teamCount = teamsInfo.length;
  const startingBudget = calculateBudgetDraftStartingBudget(allPlayers, teamCount, rosterSize);
  const [currentRound, setCurrentRound] = useState<number>(initialSession?.currentRound ?? 0);
  const [stage, setStage] = useState<DraftStage>(initialSession?.stage ?? 'MODE_SELECTION');
  const [draftMode, setDraftMode] = useState<DraftMode | null>(initialSession?.draftMode ?? null);
  const [briefcaseRounds, setBriefcaseRounds] = useState<Player[][]>(initialSession?.briefcaseRounds ?? []);
  const [currentBriefcases, setCurrentBriefcases] = useState<Player[]>(initialSession?.currentBriefcases ?? []);
  const [cardOptions, setCardOptions] = useState<CardOption[]>(initialSession?.cardOptions ?? []);
  const [selectedOption, setSelectedOption] = useState<CardOption | null>(initialSession?.selectedOption ?? null);
  const [draftedIds, setDraftedIds] = useState<Set<string>>(() => new Set(initialSession?.draftedIds ?? []));
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [briefcaseLifelines, setBriefcaseLifelines] = useState<number>(initialSession?.briefcaseLifelines ?? rosterSize);

  // League state
  const [controlledTeamAbbrev] = useState<string>(initialControlledTeamAbbrev);
  const [userDraftSlot] = useState<number>(() => initialSession?.userDraftSlot ?? Math.floor(Math.random() * Math.max(1, teamCount)) + 1);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>(() => {
    if (initialSession?.fantasyTeams?.length) return initialSession.fantasyTeams;
    return initializeFantasyLeague(teamsInfo, initialControlledTeamAbbrev, userDraftSlot, rosterSize);
  });
  const [recentAiPicks, setRecentAiPicks] = useState<AIRoundPickSummary[]>(initialSession?.recentAiPicks ?? []);
  const [currentRoundPreUserAiPicks, setCurrentRoundPreUserAiPicks] = useState<AIRoundPickSummary[]>(initialSession?.currentRoundPreUserAiPicks ?? []);

  // Budget Draft state
  const [budgetPlayers, setBudgetPlayers] = useState<BudgetPlayer[]>(initialSession?.budgetPlayers ?? []);
  const [remainingBudget, setRemainingBudget] = useState<number>(initialSession?.remainingBudget ?? startingBudget);

  // Ordinary Draft state
  const [ordinaryDraftType, setOrdinaryDraftType] = useState<OrdinaryDraftType | null>(initialSession?.ordinaryDraftType ?? null);
  const [randomRoundOrders, setRandomRoundOrders] = useState<Record<number, number[]>>(initialSession?.randomRoundOrders ?? {});
  const [showOrdinaryTypeModal, setShowOrdinaryTypeModal] = useState<boolean>(initialSession?.showOrdinaryTypeModal ?? false);
  const [showSimToEndConfirmation, setShowSimToEndConfirmation] = useState(false);

  // Authoritative ownership map derived directly from the current fantasyTeams array
  const playerOwnerById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of fantasyTeams) {
      for (const player of team.players) {
        map.set(player.id, String(team.id));
      }
    }
    return map;
  }, [fantasyTeams]);

  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>(initialSession?.draftHistory ?? []);

  const persistedSession = useMemo<FantasyDraftSession>(() => ({
      currentRound,
      stage,
      draftMode,
      briefcaseRounds,
      currentBriefcases,
      cardOptions,
      selectedOption,
      draftedIds: [...draftedIds],
      briefcaseLifelines,
      userDraftSlot,
      fantasyTeams,
      recentAiPicks,
      currentRoundPreUserAiPicks,
      budgetPlayers,
      remainingBudget,
      ordinaryDraftType,
      randomRoundOrders,
      showOrdinaryTypeModal,
      draftHistory,
    }), [briefcaseLifelines, briefcaseRounds, budgetPlayers, cardOptions, currentBriefcases, currentRound, currentRoundPreUserAiPicks, draftHistory, draftedIds, draftMode, fantasyTeams, ordinaryDraftType, randomRoundOrders, recentAiPicks, remainingBudget, selectedOption, showOrdinaryTypeModal, stage, userDraftSlot]);

  useFantasyDraftSessionSync(persistedSession, onSessionChange);

  const toggleSound = () => {
    soundFx.isMuted = !isMuted;
    setIsMuted(!isMuted);
  };

  const commitDraftTransaction = (
    newTeams: FantasyTeam[],
    newDrafted: Set<string>,
    newHistoryEntries: DraftHistoryEntry[]
  ) => {
    assertStateIntegrity(newTeams, newDrafted);
    setFantasyTeams(newTeams);
    setDraftedIds(newDrafted);
    setDraftHistory(newHistoryEntries);
  };

  const handleStartOrdinaryDraft = (type: OrdinaryDraftType) => {
    const league = fantasyTeams;
    setRecentAiPicks([]);

    const newDrafted = new Set<string>();
    const initialRandomOrders: Record<number, number[]> = type === 'RANDOM'
      ? { 0: [...league].sort((a, b) => a.draftSlot - b.draftSlot).map(team => team.id) }
      : {};

    const { order: round0Order, updatedRandomOrders } = getOrdinaryDraftOrder(
      league,
      0,
      type,
      initialRandomOrders
    );
    setRandomRoundOrders(updatedRandomOrders);

    const userTeam = league.find((t) => t.isUser)!;
    const userIndex = round0Order.findIndex((t) => t.id === userTeam.id);
    const preUserTeams = round0Order.slice(0, userIndex);

    let currentTeams = [...league];
    let currentDrafted = new Set<string>();
    let currentHistory: DraftHistoryEntry[] = [];
    const preSummaries: AIRoundPickSummary[] = [];

    for (const team of preUserTeams) {
      const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
      const picked = pickPlayerForAIOrdinary(team, available);
      const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(
        currentTeams,
        team.id,
        picked,
        currentDrafted
      );
      if (success) {
        currentTeams = updatedTeams;
        currentDrafted = updatedDraftedIds;
        currentHistory = appendPicksToHistory(currentHistory, 0, [{ team, player: picked }]);
        preSummaries.push({
          teamName: team.name,
          draftSlot: team.draftSlot,
          player: picked,
          spunTeamAbbrev: team.abbrev,
        });
      }
    }

    commitDraftTransaction(currentTeams, currentDrafted, currentHistory);
    setCurrentRound(0);
    setCurrentRoundPreUserAiPicks(preSummaries);
    setStage('ORDINARY_MARKET');
    soundFx.playClick();
  };

  const handleChooseOrdinaryDraft = (type: OrdinaryDraftType) => {
    setShowOrdinaryTypeModal(false);
    setDraftMode('ORDINARY');
    setOrdinaryDraftType(type);
    setStage('ORDER_REVIEW');
    soundFx.playClick();
  };

  const handleSelectMode = (mode: DraftMode) => {
    if (mode === 'ORDINARY') {
      setShowOrdinaryTypeModal(true);
      soundFx.playClick();
      return;
    }

    setDraftMode(mode);
    setOrdinaryDraftType(null);
    setStage('ORDER_REVIEW');
    soundFx.playClick();
  };

  const handleProceedToDraft = () => {
    if (!draftMode) return;
    if (draftMode === 'ORDINARY') {
      if (ordinaryDraftType) handleStartOrdinaryDraft(ordinaryDraftType);
      return;
    }

    const mode = draftMode;
    const league = fantasyTeams;
    setRecentAiPicks([]);

    const newDrafted = new Set<string>();
    
    if (mode === 'BLIND_PACK') {
      commitDraftTransaction(league, newDrafted, []);
      setCurrentRoundPreUserAiPicks([]);
      setStage('PACK_UNOPENED');
    } else if (mode === 'BRIEFCASE') {
      const rounds = partitionPlayersForBriefcase(allPlayers, teamCount, rosterSize);
      setBriefcaseRounds(rounds);
      setCurrentBriefcases(shuffleBriefcases(rounds[0]));
      setBriefcaseLifelines(rosterSize);
      
      commitDraftTransaction(league, newDrafted, []);
      setCurrentRoundPreUserAiPicks([]);
      setStage('BRIEFCASES_DISPLAYED');
    } else if (mode === 'WHEEL_OF_TEAMS') {
      // Resolve pre-user AI picks for Round 1
      const preUserAi = league.filter((t) => t.draftSlot < userDraftSlot);
      const { summaries: preSummaries, updatedTeams: nextLeague, updatedDraftedIds: nextDrafted } = resolveAITeamsSubset(preUserAi, allPlayers, teamsInfo, newDrafted, league, false, 0);

      const picks = preSummaries.map(s => {
        const team = nextLeague.find(t => t.draftSlot === s.draftSlot)!;
        return { team, player: s.player };
      });
      const initialHistory = appendPicksToHistory([], 0, picks);

      commitDraftTransaction(nextLeague, nextDrafted, initialHistory);
      setCurrentRoundPreUserAiPicks(preSummaries);
      setStage('CARDS_DISPLAYED');
    } else if (mode === 'BUDGET') {
      const bPlayers = calculateBudgetPrices(allPlayers, teamCount * rosterSize);
      setBudgetPlayers(bPlayers);
      setRemainingBudget(startingBudget);
      commitDraftTransaction(league, newDrafted, []);
      setStage('BUDGET_MARKET');
    }
    soundFx.playClick();
  };

  const handleOpenPack = () => {
    if (stage !== 'PACK_UNOPENED') return;
    setStage('PACK_OPENING');

    setTimeout(() => {
      const options = generateCardOptions(allPlayers, draftedIds, currentRound);
      setCardOptions(options);
      setStage('CARDS_DISPLAYED');
    }, 700);
  };

  const handleSelectCard = (option: CardOption) => {
    setSelectedOption(option);
    setStage('CARD_SELECTED_REVEALING');
  };

  const handleContinue = (player: Player, skipAdvance: boolean = false) => {
    const userTeam = fantasyTeams.find(t => t.isUser)!;
    
    // SAFE ACQUISITION WITH IMMUTABLE STATE UPDATES
    const { success, updatedTeams, updatedDraftedIds: newDraftedIds } = acquirePlayer(fantasyTeams, userTeam.id, player, draftedIds);
    if (!success) {
      return; // Prevent duplicate additions!
    }

    if (draftMode === 'ORDINARY') {
      let currentTeams = updatedTeams;
      let currentDrafted = newDraftedIds;
      let nextHistory = appendPicksToHistory(draftHistory, currentRound, [{ team: userTeam, player }]);

      // Resolve post-user AI picks for currentRound
      const { order: roundOrder } = getOrdinaryDraftOrder(
        currentTeams,
        currentRound,
        ordinaryDraftType!,
        randomRoundOrders
      );
      const userIndex = roundOrder.findIndex((t) => t.id === userTeam.id);
      const postUserTeams = roundOrder.slice(userIndex + 1);

      for (const aiTeam of postUserTeams) {
        const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
        const picked = pickPlayerForAIOrdinary(aiTeam, available);
        const { success: aiSuccess, updatedTeams: tTeams, updatedDraftedIds: tDrafted } = acquirePlayer(
          currentTeams,
          aiTeam.id,
          picked,
          currentDrafted
        );
        if (aiSuccess) {
          currentTeams = tTeams;
          currentDrafted = tDrafted;
          nextHistory = appendPicksToHistory(nextHistory, currentRound, [{ team: aiTeam, player: picked }]);
        }
      }

      // Round is complete
      if (currentRound + 1 >= rosterSize) {
        commitDraftTransaction(currentTeams, currentDrafted, nextHistory);
        setStage('DRAFT_COMPLETE');
        return;
      }

      // Next round
      const nextRound = currentRound + 1;
      const { order: nextRoundOrder, updatedRandomOrders: newOrders } = getOrdinaryDraftOrder(
        currentTeams,
        nextRound,
        ordinaryDraftType!,
        randomRoundOrders
      );
      setRandomRoundOrders(newOrders);

      const nextUserIndex = nextRoundOrder.findIndex((t) => t.id === userTeam.id);
      const nextPreUserTeams = nextRoundOrder.slice(0, nextUserIndex);
      const preSummaries: AIRoundPickSummary[] = [];

      for (const aiTeam of nextPreUserTeams) {
        const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
        const picked = pickPlayerForAIOrdinary(aiTeam, available);
        const { success: aiSuccess, updatedTeams: tTeams, updatedDraftedIds: tDrafted } = acquirePlayer(
          currentTeams,
          aiTeam.id,
          picked,
          currentDrafted
        );
        if (aiSuccess) {
          currentTeams = tTeams;
          currentDrafted = tDrafted;
          nextHistory = appendPicksToHistory(nextHistory, nextRound, [{ team: aiTeam, player: picked }]);
          preSummaries.push({
            teamName: aiTeam.name,
            draftSlot: aiTeam.draftSlot,
            player: picked,
            spunTeamAbbrev: aiTeam.abbrev,
          });
        }
      }

      commitDraftTransaction(currentTeams, currentDrafted, nextHistory);
      setCurrentRound(nextRound);
      setCurrentRoundPreUserAiPicks(preSummaries);
      return;
    }

    if (draftMode === 'BUDGET') {
      const bPlayer = player as BudgetPlayer;
      setRemainingBudget(prev => prev - bPlayer.fantasyPrice);
      
      const liveUserTeam = updatedTeams.find(t => t.id === userTeam.id)!;
      if (liveUserTeam.players.length === rosterSize) {
        // User finished. Resolve all AI teams.
        const bPlayers = budgetPlayers;
        const { updatedTeams: finalTeams, updatedDraftedIds: finalDrafted, aiPickHistory } = generateAIFantasyTeamsBudget(newDraftedIds, bPlayers, updatedTeams, rosterSize, startingBudget);

        // Append user's 15th pick, then all AI team picks to draftHistory
        let nextHistory = appendPicksToHistory(draftHistory, currentRound, [{ team: userTeam, player }]);
        
        // Use the event-based history returned by the budget generator
        nextHistory = appendPicksToHistory(nextHistory, currentRound, aiPickHistory);

        commitDraftTransaction(finalTeams, finalDrafted, nextHistory);
        setStage('DRAFT_COMPLETE');
        return;
      }

      const nextHistory = appendPicksToHistory(draftHistory, currentRound, [{ team: userTeam, player }]);
      commitDraftTransaction(updatedTeams, newDraftedIds, nextHistory);
      return;
    }

    let nextTeams = updatedTeams;
    let nextDrafted = newDraftedIds;
    let nextHistory = appendPicksToHistory(draftHistory, currentRound, [{ team: userTeam, player }]);

    if (draftMode === 'BLIND_PACK' || draftMode === 'BRIEFCASE') {
      const allRoundSummaries: AIRoundPickSummary[] = [];
      const aiTeams = nextTeams.filter(t => !t.isUser);
      const aiPicksList: Array<{ team: FantasyTeam; player: Player }> = [];

      if (draftMode === 'BRIEFCASE') {
        const rPlayers = briefcaseRounds[currentRound] || partitionPlayersForBriefcase(allPlayers, teamCount, rosterSize)[currentRound];
        let available = rPlayers.filter(p => !nextDrafted.has(p.id));
        available = available.sort(() => Math.random() - 0.5);
        for (const team of aiTeams) {
           const picked = available.pop();
           if (picked) {
             const { success: aiSuccess, updatedTeams: tTeams, updatedDraftedIds: tDrafted } = acquirePlayer(nextTeams, team.id, picked, nextDrafted);
             if (aiSuccess) {
               nextTeams = tTeams;
               nextDrafted = tDrafted;
               aiPicksList.push({ team, player: picked });
               allRoundSummaries.push({ teamName: team.name, draftSlot: team.draftSlot, player: picked, spunTeamAbbrev: team.abbrev });
             }
           }
        }
      } else if (draftMode === 'BLIND_PACK') {
        for (const team of aiTeams) {
           const options = generateCardOptions(allPlayers, nextDrafted, currentRound);
           const picked = options[Math.floor(Math.random() * options.length)].player;
           const { success: aiSuccess, updatedTeams: tTeams, updatedDraftedIds: tDrafted } = acquirePlayer(nextTeams, team.id, picked, nextDrafted);
           if (aiSuccess) {
             nextTeams = tTeams;
             nextDrafted = tDrafted;
             aiPicksList.push({ team, player: picked });
             allRoundSummaries.push({ teamName: team.name, draftSlot: team.draftSlot, player: picked, spunTeamAbbrev: team.abbrev });
           }
        }
      }
      
      nextHistory = appendPicksToHistory(nextHistory, currentRound, aiPicksList);

      const topPicks = [...allRoundSummaries].sort((a, b) => getResolvedOvr(b.player) - getResolvedOvr(a.player)).slice(0, 4);
      setRecentAiPicks(topPicks);
    } else {
      // WHEEL_OF_TEAMS: Resolve post-user AI picks for this round
      const teamsInfo = extractTeams(allPlayers);
      const isRoundEven = currentRound % 2 === 0;
      const postUserAi = nextTeams.filter((t) => 
        isRoundEven ? t.draftSlot > userDraftSlot : t.draftSlot < userDraftSlot
      );
      const { summaries: postSummaries, updatedTeams: pTeams, updatedDraftedIds: pDrafted } = resolveAITeamsSubset(
        postUserAi, allPlayers, teamsInfo, nextDrafted, nextTeams, !isRoundEven, currentRound
      );
      nextTeams = pTeams;
      nextDrafted = pDrafted;

      const postPicks = postSummaries.map(s => {
        const team = nextTeams.find(t => t.draftSlot === s.draftSlot)!;
        return { team, player: s.player };
      });
      nextHistory = appendPicksToHistory(nextHistory, currentRound, postPicks);

      const allRoundSummaries = [...currentRoundPreUserAiPicks, ...postSummaries];
      const topPicks = [...allRoundSummaries].sort((a, b) => getResolvedOvr(b.player) - getResolvedOvr(a.player)).slice(0, 4);
      setRecentAiPicks(topPicks);
    }

    if (skipAdvance) {
      commitDraftTransaction(nextTeams, nextDrafted, nextHistory);
      return;
    }

    // Now proceed to next round!
    const nextRoundNum = currentRound + 1;
    if (nextRoundNum >= rosterSize) {
      commitDraftTransaction(nextTeams, nextDrafted, nextHistory);
      setStage('DRAFT_COMPLETE');
    } else {
      setCurrentRound(nextRoundNum);
      setSelectedOption(null);
      setCardOptions([]);

      let finalTeams = nextTeams;
      let finalDrafted = nextDrafted;
      let finalHistory = nextHistory;

      if (draftMode === 'BLIND_PACK' || draftMode === 'BRIEFCASE') {
        setCurrentRoundPreUserAiPicks([]);
      } else {
        const teamsInfo = extractTeams(allPlayers);
        const isNextRoundEven = nextRoundNum % 2 === 0;
        const preUserAi = finalTeams.filter((t) => 
          isNextRoundEven ? t.draftSlot < userDraftSlot : t.draftSlot > userDraftSlot
        );
        const { summaries: preSummaries, updatedTeams: postPreTeams, updatedDraftedIds: postPreDrafted } = resolveAITeamsSubset(
          preUserAi, allPlayers, teamsInfo, finalDrafted, finalTeams, !isNextRoundEven, nextRoundNum
        );

        const picks = preSummaries.map(s => {
          const team = postPreTeams.find(t => t.draftSlot === s.draftSlot)!;
          return { team, player: s.player };
        });
        finalHistory = appendPicksToHistory(finalHistory, nextRoundNum, picks);
        finalTeams = postPreTeams;
        finalDrafted = postPreDrafted;

        setCurrentRoundPreUserAiPicks(preSummaries);
      }

      commitDraftTransaction(finalTeams, finalDrafted, finalHistory);

      if (draftMode === 'BRIEFCASE') {
        setCurrentBriefcases(shuffleBriefcases(briefcaseRounds[nextRoundNum]));
        setStage('BRIEFCASES_DISPLAYED');
      } else if (draftMode === 'BLIND_PACK') {
        setStage('PACK_UNOPENED');
      } else {
        setStage('CARDS_DISPLAYED');
      }
    }
  };

  const handleAdvanceRound = () => {
    const nextRoundNum = currentRound + 1;
    if (nextRoundNum >= rosterSize) {
      setStage('DRAFT_COMPLETE');
    } else {
      setCurrentRound(nextRoundNum);
      setSelectedOption(null);
      setCardOptions([]);

      let finalTeams = fantasyTeams;
      let finalDrafted = draftedIds;
      let finalHistory = draftHistory;

      if (draftMode === 'BLIND_PACK' || draftMode === 'BRIEFCASE') {
        setCurrentRoundPreUserAiPicks([]);
      } else {
        const teamsInfo = extractTeams(allPlayers);
        const isNextRoundEven = nextRoundNum % 2 === 0;
        const preUserAi = finalTeams.filter((t) => 
          isNextRoundEven ? t.draftSlot < userDraftSlot : t.draftSlot > userDraftSlot
        );
        const { summaries: preSummaries, updatedTeams: postPreTeams, updatedDraftedIds: postPreDrafted } = resolveAITeamsSubset(
          preUserAi, allPlayers, teamsInfo, finalDrafted, finalTeams, !isNextRoundEven, nextRoundNum
        );

        const picks = preSummaries.map(s => {
          const team = postPreTeams.find(t => t.draftSlot === s.draftSlot)!;
          return { team, player: s.player };
        });
        finalHistory = appendPicksToHistory(finalHistory, nextRoundNum, picks);
        finalTeams = postPreTeams;
        finalDrafted = postPreDrafted;

        setCurrentRoundPreUserAiPicks(preSummaries);
      }

      commitDraftTransaction(finalTeams, finalDrafted, finalHistory);

      if (draftMode === 'BRIEFCASE') {
        setCurrentBriefcases(shuffleBriefcases(briefcaseRounds[nextRoundNum]));
        setStage('BRIEFCASES_DISPLAYED');
      } else if (draftMode === 'BLIND_PACK') {
        setStage('PACK_UNOPENED');
      } else {
        setStage('CARDS_DISPLAYED');
      }
    }
  };

  const handleSimRound = () => {
    if (stage === 'DRAFT_COMPLETE' || currentRound >= rosterSize) return;

    if (draftMode === 'ORDINARY') {
      let currentTeams = [...fantasyTeams];
      let currentDrafted = new Set<string>(draftedIds);
      let nextHistory = [...draftHistory];
      const userTeam = currentTeams.find((t) => t.isUser)!;

      // Check if user has picked in currentRound
      const userPickedThisRound = userTeam.players.length > currentRound;

      if (!userPickedThisRound) {
        const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
        const userPick = pickPlayerForAIOrdinary(userTeam, available);
        const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(
          currentTeams,
          userTeam.id,
          userPick,
          currentDrafted
        );
        if (success) {
          currentTeams = updatedTeams;
          currentDrafted = updatedDraftedIds;
          nextHistory = appendPicksToHistory(nextHistory, currentRound, [{ team: userTeam, player: userPick }]);
        }
      }

      // Resolve remaining AI teams in currentRound
      const { order: roundOrder } = getOrdinaryDraftOrder(
        currentTeams,
        currentRound,
        ordinaryDraftType!,
        randomRoundOrders
      );
      const userIndex = roundOrder.findIndex((t) => t.id === userTeam.id);
      const postUserTeams = roundOrder.slice(userIndex + 1);

      for (const aiTeam of postUserTeams) {
        const liveAiTeam = currentTeams.find((t) => t.id === aiTeam.id)!;
        if (liveAiTeam.players.length <= currentRound) {
          const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
          const picked = pickPlayerForAIOrdinary(liveAiTeam, available);
          const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(
            currentTeams,
            liveAiTeam.id,
            picked,
            currentDrafted
          );
          if (success) {
            currentTeams = updatedTeams;
            currentDrafted = updatedDraftedIds;
            nextHistory = appendPicksToHistory(nextHistory, currentRound, [{ team: liveAiTeam, player: picked }]);
          }
        }
      }

      // Round is complete
      if (currentRound + 1 >= rosterSize) {
        commitDraftTransaction(currentTeams, currentDrafted, nextHistory);
        setStage('DRAFT_COMPLETE');
        return;
      }

      // Next round
      const nextRound = currentRound + 1;
      const { order: nextRoundOrder, updatedRandomOrders: newOrders } = getOrdinaryDraftOrder(
        currentTeams,
        nextRound,
        ordinaryDraftType!,
        randomRoundOrders
      );
      setRandomRoundOrders(newOrders);

      const nextUserIndex = nextRoundOrder.findIndex((t) => t.id === userTeam.id);
      const nextPreUserTeams = nextRoundOrder.slice(0, nextUserIndex);
      const preSummaries: AIRoundPickSummary[] = [];

      for (const aiTeam of nextPreUserTeams) {
        const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
        const picked = pickPlayerForAIOrdinary(aiTeam, available);
        const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(
          currentTeams,
          aiTeam.id,
          picked,
          currentDrafted
        );
        if (success) {
          currentTeams = updatedTeams;
          currentDrafted = updatedDraftedIds;
          nextHistory = appendPicksToHistory(nextHistory, nextRound, [{ team: aiTeam, player: picked }]);
          preSummaries.push({
            teamName: aiTeam.name,
            draftSlot: aiTeam.draftSlot,
            player: picked,
            spunTeamAbbrev: aiTeam.abbrev,
          });
        }
      }

      commitDraftTransaction(currentTeams, currentDrafted, nextHistory);
      setCurrentRound(nextRound);
      setCurrentRoundPreUserAiPicks(preSummaries);
      return;
    }

    if (draftMode === 'BLIND_PACK') {
      const userTeam = fantasyTeams.find(t => t.isUser)!;
      let currentDrafted = new Set<string>(draftedIds);
      let currentTeams = [...fantasyTeams];

      const options = cardOptions.length > 0 
        ? cardOptions 
        : generateCardOptions(allPlayers, currentDrafted, currentRound);

      const topOption = selectedOption || options[Math.floor(Math.random() * options.length)];
      if (!topOption) return;

      const userPlayer = topOption.player;
      const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(currentTeams, userTeam.id, userPlayer, currentDrafted);
      if (!success) return;

      currentTeams = updatedTeams;
      currentDrafted = updatedDraftedIds;

      let nextHistory = appendPicksToHistory(draftHistory, currentRound, [{ team: userTeam, player: userPlayer }]);

      const aiTeams = currentTeams.filter(t => !t.isUser);
      const aiPicksList: Array<{ team: FantasyTeam; player: Player }> = [];
      const allRoundSummaries: AIRoundPickSummary[] = [];

      for (const team of aiTeams) {
        const opts = generateCardOptions(allPlayers, currentDrafted, currentRound);
        const picked = opts[Math.floor(Math.random() * opts.length)].player;
        const { success: aiSuccess, updatedTeams: tTeams, updatedDraftedIds: tDrafted } = acquirePlayer(currentTeams, team.id, picked, currentDrafted);
        if (aiSuccess) {
          currentTeams = tTeams;
          currentDrafted = tDrafted;
          aiPicksList.push({ team, player: picked });
          allRoundSummaries.push({ teamName: team.name, draftSlot: team.draftSlot, player: picked, spunTeamAbbrev: team.abbrev });
        }
      }

      nextHistory = appendPicksToHistory(nextHistory, currentRound, aiPicksList);

      const topPicks = [...allRoundSummaries].sort((a, b) => getResolvedOvr(b.player) - getResolvedOvr(a.player)).slice(0, 4);
      setRecentAiPicks(topPicks);

      const nextRoundNum = currentRound + 1;
      commitDraftTransaction(currentTeams, currentDrafted, nextHistory);

      if (nextRoundNum >= rosterSize) {
        setStage('DRAFT_COMPLETE');
      } else {
        setCurrentRound(nextRoundNum);
        setSelectedOption(null);
        setCardOptions([]);
        setStage('PACK_UNOPENED');
      }
    } else if (draftMode === 'BRIEFCASE') {
      const userTeam = fantasyTeams.find(t => t.isUser)!;
      let currentDrafted = new Set<string>(draftedIds);
      let currentTeams = [...fantasyTeams];

      const rPlayers = briefcaseRounds[currentRound] || partitionPlayersForBriefcase(allPlayers, teamCount, rosterSize)[currentRound];
      let available = rPlayers.filter(p => !currentDrafted.has(p.id));

      if (available.length === 0) return;

      const randomIdx = Math.floor(Math.random() * available.length);
      const userPlayer = available.splice(randomIdx, 1)[0];
      const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(currentTeams, userTeam.id, userPlayer, currentDrafted);
      if (!success) return;

      currentTeams = updatedTeams;
      currentDrafted = updatedDraftedIds;

      let nextHistory = appendPicksToHistory(draftHistory, currentRound, [{ team: userTeam, player: userPlayer }]);

      const aiTeams = currentTeams.filter(t => !t.isUser);
      const aiPicksList: Array<{ team: FantasyTeam; player: Player }> = [];
      const allRoundSummaries: AIRoundPickSummary[] = [];

      available = shuffleArray(available);
      for (const team of aiTeams) {
        const picked = available.pop();
        if (picked) {
          const { success: aiSuccess, updatedTeams: tTeams, updatedDraftedIds: tDrafted } = acquirePlayer(currentTeams, team.id, picked, currentDrafted);
          if (aiSuccess) {
            currentTeams = tTeams;
            currentDrafted = tDrafted;
            aiPicksList.push({ team, player: picked });
            allRoundSummaries.push({ teamName: team.name, draftSlot: team.draftSlot, player: picked, spunTeamAbbrev: team.abbrev });
          }
        }
      }

      nextHistory = appendPicksToHistory(nextHistory, currentRound, aiPicksList);

      const topPicks = [...allRoundSummaries].sort((a, b) => getResolvedOvr(b.player) - getResolvedOvr(a.player)).slice(0, 4);
      setRecentAiPicks(topPicks);

      const nextRoundNum = currentRound + 1;
      commitDraftTransaction(currentTeams, currentDrafted, nextHistory);

      if (nextRoundNum >= rosterSize) {
        setStage('DRAFT_COMPLETE');
      } else {
        setCurrentRound(nextRoundNum);
        const nextRounds = briefcaseRounds.length > 0 ? briefcaseRounds : partitionPlayersForBriefcase(allPlayers, teamCount, rosterSize);
        if (nextRounds[nextRoundNum]) {
          setCurrentBriefcases(shuffleBriefcases(nextRounds[nextRoundNum]));
        }
        setStage('BRIEFCASES_DISPLAYED');
      }
    } else if (draftMode === 'WHEEL_OF_TEAMS') {
      const userTeam = fantasyTeams.find(t => t.isUser)!;
      let currentDrafted = new Set<string>(draftedIds);
      let currentTeams = [...fantasyTeams];
      const teamsInfo = extractTeams(allPlayers);
      const isRoundEven = currentRound % 2 === 0;

      if (userTeam.players.length <= currentRound) {
        const preUserAi = currentTeams.filter((t) =>
          isRoundEven ? t.draftSlot < userDraftSlot : t.draftSlot > userDraftSlot
        );
        const unpickedPre = preUserAi.filter(t => t.players.length <= currentRound);
        let preSummaries: AIRoundPickSummary[] = [];
        if (unpickedPre.length > 0) {
          const res = resolveAITeamsSubset(unpickedPre, allPlayers, teamsInfo, currentDrafted, currentTeams, !isRoundEven, currentRound);
          currentTeams = res.updatedTeams;
          currentDrafted = res.updatedDraftedIds;
          preSummaries = res.summaries;
        }

        const wheelPool = allPlayers.filter(p => !currentDrafted.has(p.id));
        const validWheelTeams = teamsInfo.filter(t => 
          getUndraftedPlayersForTeam(wheelPool, t.abbrev, currentDrafted).length > 0
        );

        if (validWheelTeams.length > 0) {
          const spunTeam = validWheelTeams[Math.floor(Math.random() * validWheelTeams.length)];
          const available = getUndraftedPlayersForTeam(wheelPool, spunTeam.abbrev, currentDrafted).sort((a, b) => getResolvedOvr(b) - getResolvedOvr(a));
          if (available.length > 0) {
            const userPlayer = available[0];
            const { success, updatedTeams: uTeams, updatedDraftedIds: uDrafted } = acquirePlayer(currentTeams, userTeam.id, userPlayer, currentDrafted);
            if (success) {
              currentTeams = uTeams;
              currentDrafted = uDrafted;

              const postUserAi = currentTeams.filter((t) => 
                isRoundEven ? t.draftSlot > userDraftSlot : t.draftSlot < userDraftSlot
              );
              const { summaries: postSummaries, updatedTeams: pTeams, updatedDraftedIds: pDrafted } = resolveAITeamsSubset(
                postUserAi, allPlayers, teamsInfo, currentDrafted, currentTeams, !isRoundEven, currentRound
              );
              currentTeams = pTeams;
              currentDrafted = pDrafted;

              const liveUserTeam = currentTeams.find(t => t.id === userTeam.id)!;
              const allPicks = [...preSummaries, { draftSlot: liveUserTeam.draftSlot, player: userPlayer, teamName: liveUserTeam.name, spunTeamAbbrev: spunTeam.abbrev }, ...postSummaries].map(s => {
                const team = currentTeams.find(t => t.draftSlot === s.draftSlot)!;
                return { team, player: s.player };
              });

              const nextHistory = appendPicksToHistory(draftHistory, currentRound, allPicks);

              const allSummaries = [...preSummaries, ...postSummaries];
              const topPicks = [...allSummaries].sort((a, b) => getResolvedOvr(b.player) - getResolvedOvr(a.player)).slice(0, 4);
              setRecentAiPicks(topPicks);

              const nextRoundNum = currentRound + 1;
              if (nextRoundNum >= rosterSize) {
                commitDraftTransaction(currentTeams, currentDrafted, nextHistory);
                setStage('DRAFT_COMPLETE');
              } else {
                const nextIsEven = nextRoundNum % 2 === 0;
                const nextPreUser = currentTeams.filter((t) =>
                  nextIsEven ? t.draftSlot < userDraftSlot : t.draftSlot > userDraftSlot
                );
                const { summaries: nextPreSummaries, updatedTeams: nextLeague, updatedDraftedIds: nextDrafted } = resolveAITeamsSubset(
                  nextPreUser, allPlayers, teamsInfo, currentDrafted, currentTeams, !nextIsEven, nextRoundNum
                );

                const nextPrePicks = nextPreSummaries.map(s => {
                  const team = nextLeague.find(t => t.draftSlot === s.draftSlot)!;
                  return { team, player: s.player };
                });
                const finalHistory = appendPicksToHistory(nextHistory, nextRoundNum, nextPrePicks);

                commitDraftTransaction(nextLeague, nextDrafted, finalHistory);
                setCurrentRound(nextRoundNum);
                setCurrentRoundPreUserAiPicks(nextPreSummaries);
                setStage('CARDS_DISPLAYED');
              }
            }
          }
        }
      }
    }
  };

  const handleSimToEnd = () => {
    if (draftMode === 'ORDINARY') {
      let currentTeams = [...fantasyTeams];
      let currentDrafted = new Set<string>(draftedIds);
      let nextHistory = [...draftHistory];
      let currentOrders = { ...randomRoundOrders };

      for (let r = currentRound; r < rosterSize; r++) {
        const { order: roundOrder, updatedRandomOrders: newOrders } = getOrdinaryDraftOrder(
          currentTeams,
          r,
          ordinaryDraftType!,
          currentOrders
        );
        currentOrders = newOrders;

        for (const team of roundOrder) {
          const liveTeam = currentTeams.find((t) => t.id === team.id)!;
          if (liveTeam.players.length <= r) {
            const available = allPlayers.filter((p) => !currentDrafted.has(p.id));
            const picked = pickPlayerForAIOrdinary(liveTeam, available);
            const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(
              currentTeams,
              liveTeam.id,
              picked,
              currentDrafted
            );
            if (success) {
              currentTeams = updatedTeams;
              currentDrafted = updatedDraftedIds;
              nextHistory = appendPicksToHistory(nextHistory, r, [{ team: liveTeam, player: picked }]);
            }
          }
        }
      }

      setRandomRoundOrders(currentOrders);
      commitDraftTransaction(currentTeams, currentDrafted, nextHistory);
      setCurrentRound(rosterSize - 1);
      setStage('DRAFT_COMPLETE');
      return;
    }

    if (draftMode === 'BUDGET') {
      let currentDrafted = new Set<string>(draftedIds);
      let currentBudget = remainingBudget;
      let currentTeams = [...fantasyTeams];
      const userSimPicks: Player[] = [];

      while (true) {
        const liveUserTeam = currentTeams.find(t => t.isUser)!;
        if (liveUserTeam.players.length >= rosterSize) break;

        const available = budgetPlayers.filter(p => !currentDrafted.has(p.id));
        const pick = pickPlayerForAIBudget(liveUserTeam, available, currentBudget, rosterSize);
        if (!pick) break;

        const { player, cost } = pick;
        const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(currentTeams, liveUserTeam.id, player, currentDrafted);
        if (success) {
          currentTeams = updatedTeams;
          currentDrafted = updatedDraftedIds;
          currentBudget -= cost;
          userSimPicks.push(player);
        } else {
          break;
        }
      }
      setRemainingBudget(currentBudget);

      const liveUserTeam = currentTeams.find(t => t.isUser)!;
      let nextHistory = appendPicksToHistory(draftHistory, currentRound, userSimPicks.map(p => ({ team: liveUserTeam, player: p })));

      const { updatedTeams: finalTeams, updatedDraftedIds: finalDrafted, aiPickHistory } = generateAIFantasyTeamsBudget(currentDrafted, budgetPlayers, currentTeams, rosterSize, startingBudget);

      nextHistory = appendPicksToHistory(nextHistory, currentRound, aiPickHistory);

      commitDraftTransaction(finalTeams, finalDrafted, nextHistory);
      setStage('DRAFT_COMPLETE');
      return;
    }

    // Other Modes: BLIND_PACK, BRIEFCASE, WHEEL_OF_TEAMS
    let round = currentRound;
    let currentDraftedIds = new Set<string>(draftedIds);
    let currentTeams = [...fantasyTeams];
    const teamsInfo = extractTeams(allPlayers);
    let nextHistory = [...draftHistory];

    while (round < rosterSize) {
      const isRoundEven = round % 2 === 0;
      const roundOrder = [...currentTeams].sort((a, b) => 
        isRoundEven ? a.draftSlot - b.draftSlot : b.draftSlot - a.draftSlot
      );

      for (const team of roundOrder) {
        const liveTeam = currentTeams.find(t => t.id === team.id)!;
        if (liveTeam.players.length > round) continue;

        if (draftMode === 'BRIEFCASE') {
          const rPlayers = briefcaseRounds[round] || partitionPlayersForBriefcase(allPlayers, teamCount, rosterSize)[round];
          const available = rPlayers.filter(p => !currentDraftedIds.has(p.id));
          if (available.length > 0) {
            const picked = available[Math.floor(Math.random() * available.length)];
            const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(currentTeams, liveTeam.id, picked, currentDraftedIds);
            if (success) {
              currentTeams = updatedTeams;
              currentDraftedIds = updatedDraftedIds;
              nextHistory.push({
                round: round + 1,
                pickNumber: nextHistory.length + 1,
                player: picked,
                fantasyTeamAbbrev: liveTeam.abbrev,
                fantasyTeamName: liveTeam.name,
                fantasyTeamId: liveTeam.id,
                playerId: picked.id,
              });
            }
          }
        } else if (draftMode === 'BLIND_PACK') {
          const options = generateCardOptions(allPlayers, currentDraftedIds, round);
          if (options.length > 0) {
            const picked = options[Math.floor(Math.random() * options.length)].player;
            const { success, updatedTeams, updatedDraftedIds } = acquirePlayer(currentTeams, liveTeam.id, picked, currentDraftedIds);
            if (success) {
              currentTeams = updatedTeams;
              currentDraftedIds = updatedDraftedIds;
              nextHistory.push({
                round: round + 1,
                pickNumber: nextHistory.length + 1,
                player: picked,
                fantasyTeamAbbrev: liveTeam.abbrev,
                fantasyTeamName: liveTeam.name,
                fantasyTeamId: liveTeam.id,
                playerId: picked.id,
              });
            }
          }
        } else if (draftMode === 'WHEEL_OF_TEAMS') {
          if (liveTeam.isUser) {
            const wheelPool = allPlayers.filter(p => !currentDraftedIds.has(p.id));
            const validWheelTeams = teamsInfo.filter(t => 
              getUndraftedPlayersForTeam(wheelPool, t.abbrev, currentDraftedIds).length > 0
            );
            if (validWheelTeams.length > 0) {
              const spunTeam = validWheelTeams[Math.floor(Math.random() * validWheelTeams.length)];
              const available = getUndraftedPlayersForTeam(wheelPool, spunTeam.abbrev, currentDraftedIds);
              if (available.length > 0) {
                const picked = available[0];
                const { success, updatedTeams, updatedDraftedIds: nextDrafted } = acquirePlayer(currentTeams, liveTeam.id, picked, currentDraftedIds);
                if (success) {
                  currentTeams = updatedTeams;
                  currentDraftedIds = nextDrafted;
                  nextHistory.push({
                    round: round + 1,
                    pickNumber: nextHistory.length + 1,
                    player: picked,
                    fantasyTeamAbbrev: liveTeam.abbrev,
                    fantasyTeamName: liveTeam.name,
                    fantasyTeamId: liveTeam.id,
                    playerId: picked.id,
                  });
                }
              }
            }
          } else {
            const { selectedPlayer, spunTeam, updatedTeams: nextTeams, updatedDraftedIds: nextDrafted } = draftPlayerForAITeam(
              liveTeam,
              allPlayers,
              teamsInfo,
              currentDraftedIds,
              currentTeams
            );
            currentTeams = nextTeams;
            currentDraftedIds = nextDrafted;
            nextHistory.push({
              round: round + 1,
              pickNumber: nextHistory.length + 1,
              player: selectedPlayer,
              fantasyTeamAbbrev: liveTeam.abbrev,
              fantasyTeamName: liveTeam.name,
              fantasyTeamId: liveTeam.id,
              playerId: selectedPlayer.id,
            });
          }
        }
      }
      round++;
    }

    commitDraftTransaction(currentTeams, currentDraftedIds, nextHistory);
    setCurrentRound(rosterSize - 1);
    setStage('DRAFT_COMPLETE');
  };

  const handleRemovePlayer = (playerId: string) => {
    if (draftMode !== 'BUDGET') return;
    if (stage === 'DRAFT_COMPLETE') return;

    const userTeam = fantasyTeams.find(t => t.isUser);
    if (!userTeam) return;

    const playerIndex = userTeam.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    // We must find the player's price.
    const playerToRemove = userTeam.players[playerIndex];
    const budgetPlayer = budgetPlayers.find(p => p.id === playerToRemove.id);
    const refund = budgetPlayer?.fantasyPrice || 1;

    // Remove from team immutably
    const updatedUserPlayers = userTeam.players.filter(p => p.id !== playerId);
    const updatedUserSlots = autoBuildRoster(updatedUserPlayers, userTeam.slots);
    const updatedUserTeam = {
      ...userTeam,
      players: updatedUserPlayers,
      slots: updatedUserSlots
    };
    const nextFantasyTeams = fantasyTeams.map(t => t.id === userTeam.id ? updatedUserTeam : t);

    // Remove from draftedIds
    const nextDrafted = new Set<string>(draftedIds);
    nextDrafted.delete(playerId);

    // Remove from draftHistory
    const nextHistory = draftHistory.filter(entry => entry.playerId !== playerId);

    // Refund budget
    setRemainingBudget(prev => prev + refund);

    // Commit state
    commitDraftTransaction(nextFantasyTeams, nextDrafted, nextHistory);
  };

  const userTeam: FantasyTeam = fantasyTeams.find(t => t.isUser) ?? {
    id: -1,
    draftSlot: userDraftSlot,
    name: 'Team',
    abbrev: controlledTeamAbbrev,
    isUser: true,
    players: [],
    slots: [],
  };

  const roundTitle =
    currentRound === 0
      ? 'ROUND 1 — FRANCHISE STAR'
      : currentRound < 5
      ? `ROUND ${currentRound + 1} — STARTER PICK`
      : currentRound < 10
      ? `ROUND ${currentRound + 1} — ROTATION PICK`
      : `ROUND ${currentRound + 1} — DEEP BENCH PICK`;

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-slate-950 text-white font-sans selection:bg-amber-500 selection:text-black flex flex-col justify-between relative">
      {/* Background Stadium Glow */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-950/20 via-slate-950 to-slate-950 pointer-events-none" />

      {/* HEADER BAR */}
      <header className="relative z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
            <Trophy className="w-5 h-5 fill-slate-950" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-wider uppercase leading-none text-white">
              {draftMode === 'ORDINARY'
                ? `ORDINARY DRAFT${ordinaryDraftType ? ` (${ordinaryDraftType})` : ''}`
                : draftMode === 'BRIEFCASE'
                ? 'BRIEFCASE DRAFT'
                : draftMode === 'WHEEL_OF_TEAMS'
                ? 'WHEEL OF TEAMS DRAFT'
                : draftMode === 'BLIND_PACK'
                ? 'BLIND PACK DRAFT'
                : draftMode === 'BUDGET'
                ? 'BUDGET DRAFT'
                : 'FANTASY DRAFT'}
            </h1>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSound}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors"
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" />
            )}
          </button>

        </div>
      </header>

      {/* MAIN DRAFTING STAGE */}
      {stage !== 'DRAFT_COMPLETE' && stage !== 'MODE_SELECTION' && stage !== 'ORDER_REVIEW' && (
        <main className="relative z-10 max-w-7xl w-full mx-auto p-4 sm:p-6 flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8">
          {/* STAGE CONTENT */}
          <div className="flex-1 w-full flex flex-col items-center justify-center min-h-[500px]">
            {draftMode === 'BLIND_PACK' ? (
              <>
                {/* Target Banner */}
                <div className="text-center mb-6">
                  <span className="text-xs font-bold font-mono tracking-widest text-slate-400 uppercase bg-slate-900 border border-slate-800 px-3 py-1 rounded-full">
                    ROUND {currentRound + 1} OF {rosterSize}
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-wider mt-2">
                    <span className="text-amber-400">{roundTitle}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Open mystery pack to reveal candidate clues and select blindly!
                  </p>
                </div>

                {/* PACK UNOPENED OR OPENING STAGE */}
                {(stage === 'PACK_UNOPENED' || stage === 'PACK_OPENING') && (
                  <Pack
                    roundTitle={roundTitle}
                    roundNumber={currentRound + 1}
                    onOpenPack={handleOpenPack}
                    isOpening={stage === 'PACK_OPENING'}
                    rosterSize={rosterSize}
                  />
                )}

                {/* MYSTERY CARDS DISPLAYED STAGE */}
                {stage === 'CARDS_DISPLAYED' && (
                  <div className="w-full flex flex-col items-center">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-4">
                      {cardOptions.map((option, idx) => (
                        <MysteryCard
                          key={option.id}
                          option={option}
                          cardNumber={idx + 1}
                          onSelect={handleSelectCard}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider animate-pulse mt-2">
                      Select 1 mystery card to draft to your team!
                    </p>
                  </div>
                )}

                {/* CARD REVEAL & SLOT ASSIGNMENT OVERLAY MODAL */}
                {stage === 'CARD_SELECTED_REVEALING' && selectedOption && (
                  <PlayerReveal
                    selectedOption={selectedOption}
                    otherOptions={cardOptions.filter((o) => o.id !== selectedOption.id)}
                    slots={userTeam.slots}
                    onContinue={handleContinue}
                  />
                )}
              </>
            ) : draftMode === 'BRIEFCASE' ? (
              <BriefcaseDraftView
                key={currentRound}
                roundNumber={currentRound + 1}
                players={currentBriefcases}
                slots={userTeam.slots}
                fantasyTeams={fantasyTeams}
                onAddToTeam={(p) => handleContinue(p, true)}
                onNextRound={handleAdvanceRound}
                lifelines={briefcaseLifelines}
                onUseLifeline={() => setBriefcaseLifelines((prev) => Math.max(0, prev - 1))}
                rosterSize={rosterSize}
              />
            ) : draftMode === 'BUDGET' ? (
              <BudgetDraftView
                players={budgetPlayers.filter(p => !draftedIds.has(p.id))}
                remainingBudget={remainingBudget}
                rosterCount={userTeam.players.length}
                onBuyPlayer={handleContinue}
                rosterSize={rosterSize}
                teamCount={teamCount}
              />
            ) : draftMode === 'ORDINARY' || stage === 'ORDINARY_MARKET' ? (
              <BudgetDraftView
                players={allPlayers.filter(p => !draftedIds.has(p.id))}
                rosterCount={userTeam.players.length}
                onBuyPlayer={handleContinue}
                isOrdinaryDraft={true}
                ordinaryDraftType={ordinaryDraftType}
                currentRound={currentRound}
                currentPickNumber={draftHistory.length + 1}
                pickInRound={
                  ordinaryDraftType
                    ? getOrdinaryDraftOrder(fantasyTeams, currentRound, ordinaryDraftType, randomRoundOrders).order.findIndex(t => t.isUser) + 1
                    : 1
                }
                rosterSize={rosterSize}
                teamCount={teamCount}
              />
            ) : (
              <WheelOfTeamsView
                key={currentRound}
                roundNumber={currentRound + 1}
                userDraftSlot={userDraftSlot}
                allPlayers={allPlayers}
                draftedIds={draftedIds}
                slots={userTeam.slots}
                recentAiPicks={recentAiPicks}
                aiTeams={fantasyTeams.filter(t => !t.isUser)}
                fantasyTeams={fantasyTeams}
                playerOwnerById={playerOwnerById}
                draftHistory={draftHistory}
                onContinue={handleContinue}
                rosterSize={rosterSize}
              />
            )}
          </div>

          {/* RIGHT: DRAFT ROSTER SIDEBAR */}
          <DraftRoster 
            fantasyTeams={fantasyTeams} 
            isBudgetMode={draftMode === 'BUDGET'}
            isDraftComplete={false}
            onSimRound={handleSimRound}
            onSimToEnd={() => setShowSimToEndConfirmation(true)}
            onRemovePlayer={handleRemovePlayer}
            rosterSize={rosterSize}
          />
        </main>
      )}

      {/* MODE SELECTION SCREEN */}
      {stage === 'MODE_SELECTION' && (
        <main className="relative z-10 flex-1 flex flex-col items-center justify-start sm:justify-center p-4 py-8 sm:p-6 text-center">
          <div className="max-w-4xl w-full">
            <h2 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tighter mb-3 italic">
              Choose Your <span className="text-amber-400">Draft Format</span>
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mb-10 font-medium">
              Pick your preferred way to build a {rosterSize}-player roster. Your team opens from draft slot #{userDraftSlot} of {teamCount}.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* STANDALONE FANTASY-DRAFT MODE LIST.
                  Note: Fantasy draft is available both as a mini-game mode in the game
                  and as part of the native league setup options.
                  This prototype currently contains the custom RNG/mini-game formats alongside Ordinary Draft.
                  WHEN WIRED INTO THE MAIN GAME:
                  also expose/reuse the game's native conventional fantasy-draft formats
                  here where appropriate, such as normal draft order / snake draft and
                  any other native draft types already supported by the main game.
                  Do NOT duplicate those systems inside this standalone prototype. */}
              
              {/* ORDINARY DRAFT */}
              <button
                onClick={() => handleSelectMode('ORDINARY')}
                className="group relative bg-slate-900 border-2 border-slate-800 hover:border-amber-500 p-6 rounded-3xl transition-all text-left overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Users className="w-20 h-20 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <Users className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase mb-2">Ordinary Draft</h3>
                  <p className="text-slate-400 text-xs sm:text-sm font-medium leading-relaxed">
                    Traditional {rosterSize}-round fantasy draft with {teamCount} teams. Choose Fixed, Snake, or Random order.
                  </p>
                </div>
                <div className="mt-6 text-xs font-black uppercase text-amber-400 flex items-center gap-1">
                  PLAY MODE →
                </div>
              </button>

              {/* BLIND PACK DRAFT */}
              <button
                onClick={() => handleSelectMode('BLIND_PACK')}
                className="group relative bg-slate-900 border-2 border-slate-800 hover:border-amber-500 p-6 rounded-3xl transition-all text-left overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Box className="w-20 h-20 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <Box className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase mb-2">Blind Pack Draft</h3>
                  <p className="text-slate-400 text-xs sm:text-sm font-medium leading-relaxed">
                    Analyze mystery clues (Team, Position, Age, College, etc.) to identify hidden gems. Strategic and calculated.
                  </p>
                </div>
                <div className="mt-6 text-xs font-black uppercase text-amber-400 flex items-center gap-1">
                  PLAY MODE →
                </div>
              </button>

              {/* BRIEFCASE DRAFT */}
              <button
                onClick={() => handleSelectMode('BRIEFCASE')}
                className="group relative bg-slate-900 border-2 border-slate-800 hover:border-amber-500 p-6 rounded-3xl transition-all text-left overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <BriefcaseIcon className="w-20 h-20 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <BriefcaseIcon className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase mb-2">Briefcase Draft</h3>
                  <p className="text-slate-400 text-xs sm:text-sm font-medium leading-relaxed">
                    Pure suspense. {teamCount} cases per round, zero clues. Choose a number and see what you missed across {rosterSize} OVR tiers.
                  </p>
                </div>
                <div className="mt-6 text-xs font-black uppercase text-amber-400 flex items-center gap-1">
                  PLAY MODE →
                </div>
              </button>

              {/* WHEEL OF TEAMS DRAFT */}
              <button
                onClick={() => handleSelectMode('WHEEL_OF_TEAMS')}
                className="group relative bg-slate-900 border-2 border-slate-800 hover:border-amber-500 p-6 rounded-3xl transition-all text-left overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Disc className="w-20 h-20 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <Disc className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase mb-2">Wheel of Teams</h3>
                  <p className="text-slate-400 text-xs sm:text-sm font-medium leading-relaxed">
                    Spin the {teamCount}-team wheel. Randomness chooses the team, then you choose any remaining player from its opening roster.
                  </p>
                </div>
                <div className="mt-6 text-xs font-black uppercase text-amber-400 flex items-center gap-1">
                  PLAY MODE →
                </div>
              </button>

              {/* BUDGET DRAFT */}
              <button
                onClick={() => handleSelectMode('BUDGET')}
                className="group relative bg-slate-900 border-2 border-slate-800 hover:border-amber-500 p-6 rounded-3xl transition-all text-left overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <DollarSign className="w-20 h-20 text-white" />
                </div>
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-6">
                    <DollarSign className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase mb-2">Budget Draft</h3>
                  <p className="text-slate-400 text-xs sm:text-sm font-medium leading-relaxed">
                    Build a {rosterSize}-player roster with a fixed ${startingBudget} budget. Every player has a price based on league-wide OVR percentiles.
                  </p>
                </div>
                <div className="mt-6 text-xs font-black uppercase text-amber-400 flex items-center gap-1">
                  PLAY MODE →
                </div>
              </button>
            </div>

          </div>
        </main>
      )}

      {stage === 'ORDER_REVIEW' && draftMode && (
        <DraftOrderReviewPanel
          teams={fantasyTeams}
          eyebrow="Opening Fantasy Draft"
          title="Opening Draft Order"
          description="Review the first-round order before the draft begins. Salaries and league roster minimums remain in effect."
          footerLabel={draftMode === 'ORDINARY' && ordinaryDraftType
            ? `${ordinaryDraftType} order selected`
            : `${draftMode.replaceAll('_', ' ')} selected`}
          primaryLabel="Proceed to Draft →"
          userDraftSlot={userDraftSlot}
          onBack={() => {
                setStage('MODE_SELECTION');
                setDraftMode(null);
                setOrdinaryDraftType(null);
          }}
          onPrimary={handleProceedToDraft}
        />
      )}

      {/* ORDINARY DRAFT SUB-TYPE SELECTION MODAL */}
      {showOrdinaryTypeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl relative">
            <h3 className="text-2xl sm:text-3xl font-black text-white uppercase italic mb-2">
              Ordinary Draft <span className="text-amber-400">Order</span>
            </h3>
            <p className="text-slate-400 text-xs sm:text-sm mb-6 font-medium">
              Choose the order for your {rosterSize}-round, {teamCount}-team fantasy draft. Your first-round slot is #{userDraftSlot}.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleChooseOrdinaryDraft('FIXED')}
                className="group bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white font-bold py-3.5 px-5 rounded-2xl transition-all text-left flex items-center justify-between border border-slate-700 hover:border-amber-400"
              >
                <div>
                  <div className="font-black uppercase tracking-wide">Fixed Order</div>
                  <div className="text-xs text-slate-400 group-hover:text-slate-900 font-medium">
                    Same draft order every round (1 → {teamCount}).
                  </div>
                </div>
                <span className="text-amber-400 group-hover:text-slate-950 font-black text-sm">SELECT →</span>
              </button>

              <button
                onClick={() => handleChooseOrdinaryDraft('SNAKE')}
                className="group bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white font-bold py-3.5 px-5 rounded-2xl transition-all text-left flex items-center justify-between border border-slate-700 hover:border-amber-400"
              >
                <div>
                  <div className="font-black uppercase tracking-wide">Snake Order</div>
                  <div className="text-xs text-slate-400 group-hover:text-slate-900 font-medium">
                    Reverses each round (1 → {teamCount}, {teamCount} → 1...).
                  </div>
                </div>
                <span className="text-amber-400 group-hover:text-slate-950 font-black text-sm">SELECT →</span>
              </button>

              <button
                onClick={() => handleChooseOrdinaryDraft('RANDOM')}
                className="group bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white font-bold py-3.5 px-5 rounded-2xl transition-all text-left flex items-center justify-between border border-slate-700 hover:border-amber-400"
              >
                <div>
                  <div className="font-black uppercase tracking-wide">Random Order</div>
                  <div className="text-xs text-slate-400 group-hover:text-slate-900 font-medium">
                    Randomized draft order generated each round.
                  </div>
                </div>
                <span className="text-amber-400 group-hover:text-slate-950 font-black text-sm">SELECT →</span>
              </button>
            </div>

            <button
              onClick={() => setShowOrdinaryTypeModal(false)}
              className="mt-6 text-xs text-slate-500 hover:text-slate-300 font-semibold uppercase tracking-wider underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FINAL ROSTER COMPLETE SCREEN */}
      {stage === 'DRAFT_COMPLETE' && (
        <FinalRoster
          slots={userTeam.slots}
          userTeam={userTeam}
          draftMode={draftMode}
          ordinaryDraftType={ordinaryDraftType}
          remainingBudget={remainingBudget}
          rosterSize={rosterSize}
          onContinue={() => {
            if (!draftMode) return;
            onComplete({ teams: fantasyTeams, history: draftHistory, mode: draftMode, ordinaryDraftType });
          }}
        />
      )}

      {showSimToEndConfirmation && (
        <ConfirmationModal
          title="Sim to End?"
          message="The remaining fantasy draft picks will be completed automatically. This cannot be undone after the final roster is confirmed."
          onCancel={() => setShowSimToEndConfirmation(false)}
          onConfirm={() => {
            setShowSimToEndConfirmation(false);
            handleSimToEnd();
          }}
        />
      )}
    </div>
  );
}
