import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { GameState, UserAction } from '../../types';
import { sendChatMessage } from '../../services/llm/llm';
import { SettingsManager } from '../../services/SettingsManager';
import { normalizeDate } from '../../utils/helpers';
import { runLazySim } from '../../services/logic/lazySimRunner';
import { publishLongSimProgress, withLongSimLease } from '../../services/simulation/longSimCoordinator';
import { resolveSimulationProgressPresentation } from '../../services/simulation/targetPlanner';
import { finalizeCommittedSimulationState } from '../../services/simulation/durableSimulationCheckpoint';

type SetGameState = Dispatch<SetStateAction<GameState>>;

type HandleCommunicationDispatchActionArgs = {
  action: UserAction;
  setState: SetGameState;
  stateRef: MutableRefObject<GameState>;
  generationIdRef: MutableRefObject<number>;
  dispatchAction: (action: UserAction) => Promise<void>;
};

export async function handleCommunicationDispatchAction({
  action,
  setState,
  stateRef,
  generationIdRef,
  dispatchAction,
}: HandleCommunicationDispatchActionArgs): Promise<{ handled: boolean; newStatePatch?: Partial<GameState> }> {
  if (action.type === 'SEND_CHAT_MESSAGE') {
    const {
      chatId,
      text,
      imageUrl,
      targetId,
      targetName,
      targetRole,
      targetOrg,
      avatarUrl,
      teamLogoUrl,
      isHypnotized,
    } = action.payload;
    if (isHypnotized === true && stateRef.current.godModeEnabled !== true) {
      return { handled: true };
    }
    const godModeHypnosis = isHypnotized === true && stateRef.current.godModeEnabled === true;
    const newChats = [...stateRef.current.chats];
    let chatIndex = newChats.findIndex(chat => chat.id === chatId);
    let chat = chatIndex !== -1 ? { ...newChats[chatIndex] } : null;

    if (!chat && targetId) {
      const existingChatIndex = newChats.findIndex(entry =>
        entry.participants.includes('commissioner') && entry.participants.includes(targetId),
      );
      if (existingChatIndex !== -1) {
        chat = { ...newChats[existingChatIndex] };
        chatIndex = existingChatIndex;
      }
    }

    if (!chat) {
      chat = {
        id: chatId || `chat-${Date.now()}`,
        participants: ['commissioner', targetId],
        participantDetails: [
          { id: 'commissioner', name: stateRef.current.commissionerName, role: stateRef.current.gameMode === 'gm' ? 'General Manager' : 'Commissioner' },
          {
            id: targetId,
            name: targetName,
            role: targetRole,
            avatarUrl,
            teamLogoUrl,
            organization: targetOrg,
          },
        ],
        messages: [],
        unreadCount: 0,
        isTyping: true,
      };
      newChats.unshift(chat);
      chatIndex = 0;
    } else {
      chat.isTyping = true;
      chat.participantDetails = chat.participantDetails.map(participant => participant.id === 'commissioner'
        ? {
            ...participant,
            name: stateRef.current.commissionerName,
            role: stateRef.current.gameMode === 'gm' ? 'General Manager' : 'Commissioner',
          }
        : participant);
      chat.messages = chat.messages.map(message => ({ ...message, seen: true }));
      newChats[chatIndex] = chat;
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
      type: 'text' as const,
    };

    chat.messages = [...chat.messages, userMessage];
    if (chat.messages.length > 100) chat.messages = chat.messages.slice(-100);
    chat.lastMessage = userMessage;
    setState(prev => ({ ...prev, chats: newChats, isProcessing: false }));

    try {
      const responseText = await sendChatMessage(stateRef.current, targetName, targetRole, targetOrg, chat.messages, godModeHypnosis, targetId);
      if (godModeHypnosis) {
        const commandText = text.replace('[HYPNOTIC COMMAND]: ', '').trim();
        dispatchAction({ type: 'ADD_PENDING_HYPNOSIS', payload: { targetName, command: commandText } } as any);
        setState(prev => ({
          ...prev,
          lastOutcome: `Hypnotic command transmitted to ${targetName}. They are now under your influence. The effects will manifest as the simulation progresses.`,
        }));
      }

      if (responseText && responseText.trim().length > 0) {
        const parts = responseText.split(/\n\n+/).filter(part => part.trim().length > 0);
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const baseDelay = Math.min(3000, Math.max(1000, part.length * 20));
          await new Promise(resolve => setTimeout(resolve, SettingsManager.getDelay(baseDelay)));
          setState(prev => {
            const updatedChats = [...prev.chats];
            const updatedChatIndex = updatedChats.findIndex(entry => entry.id === chat!.id);
            if (updatedChatIndex !== -1) {
              const updatedChat = { ...updatedChats[updatedChatIndex] };
              if (i === parts.length - 1) updatedChat.isTyping = false;
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
                type: 'text' as const,
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
        const baseDelay = 1500 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, SettingsManager.getDelay(baseDelay)));
        setState(prev => {
          const updatedChats = [...prev.chats];
          const updatedChatIndex = updatedChats.findIndex(entry => entry.id === chat!.id);
          if (updatedChatIndex !== -1) {
            const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
            updatedChat.messages = updatedChat.messages.map(message =>
              message.senderId === 'commissioner' ? { ...message, seen: true } : message,
            );
            updatedChats[updatedChatIndex] = updatedChat;
          }
          return { ...prev, chats: updatedChats };
        });
      }
    } catch (error) {
      console.error('Chat LLM Error:', error);
      setState(prev => {
        const updatedChats = [...prev.chats];
        const updatedChatIndex = updatedChats.findIndex(entry => entry.id === chat!.id);
        if (updatedChatIndex !== -1) {
          const updatedChat = { ...updatedChats[updatedChatIndex], isTyping: false };
          updatedChat.messages = updatedChat.messages.map(message =>
            message.senderId === 'commissioner' ? { ...message, seen: true } : message,
          );
          updatedChats[updatedChatIndex] = updatedChat;
        }
        return { ...prev, chats: updatedChats };
      });
    }
    return { handled: true };
  }

  if (
    action.type === 'SIMULATE_TO_DATE'
    && action.payload?.freeAgencyDayStart === undefined
  ) {
    const targetNorm = normalizeDate(action.payload.targetDate);
    const currentNorm = normalizeDate(stateRef.current.date);
    const stopBefore = action.payload?.stopBefore === true;
    if (targetNorm < currentNorm || (stopBefore && targetNorm === currentNorm)) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        processingAction: undefined,
        lazySimProgress: undefined,
        simCurrentDate: undefined,
      }));
      return { handled: true };
    }
    const diffDays = Math.round(
      (new Date(`${targetNorm}T00:00:00Z`).getTime() - new Date(`${currentNorm}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24),
    );
    console.log('[SIM_TO_DATE] ▶️ dispatched', {
      rawTargetDate: action.payload.targetDate,
      targetNorm,
      currentStateDate: stateRef.current.date,
      currentNorm,
      diffDays,
      stateDay: stateRef.current.day,
    });
    const simMode = diffDays > 30 ? 'overlay' : 'silent';
    const assistantGM = action.payload?.assistantGM === true;
    console.log('[SIM_TO_DATE] ⚙️ runLazySim options', {
      simMode,
      batchSize: diffDays > 30 ? 7 : 1,
      stopBefore,
      assistantGM,
    });
    const saveKey = stateRef.current.saveId ?? [
      'unsaved',
      stateRef.current.leagueType,
      stateRef.current.leagueStats?.leagueName,
      stateRef.current.commissionerName,
      stateRef.current.userTeamId ?? 'commissioner',
    ].join(':');
    const lease = await withLongSimLease(saveKey, targetNorm, async control => {
      const genId = ++generationIdRef.current;
      let lastVisibleCheckpointDay = 0;
      let lastVisibleCheckpointAt = 0;
      if (simMode === 'overlay') {
        const presentation = resolveSimulationProgressPresentation(action.payload?.targetPlan, null, stateRef.current);
        const initialProgress = {
          currentDate: currentNorm,
          targetDate: targetNorm,
          daysComplete: 0,
          daysTotal: diffDays,
          currentPhase: 'Warming up simulation...',
          percentComplete: 0,
          targetName: action.payload?.targetPlan?.name,
          targetSemanticName: presentation.targetLabel,
          nextCheckpointLabel: presentation.nextCheckpointLabel,
          nextCheckpointRequiresAction: presentation.nextCheckpointRequiresAction,
          finalStopDate: action.payload?.targetPlan?.finalStopDate,
        };
        publishLongSimProgress(initialProgress);
        flushSync(() => setState(prev => ({
          ...prev,
          lazySimProgress: initialProgress,
        })));
      }
      const result = await runLazySim(
        stateRef.current,
        action.payload.targetDate,
        (progress: any) => {
          if (simMode === 'overlay') {
            publishLongSimProgress(progress);
          } else {
            setState(prev =>
              prev.simCurrentDate === progress.currentDate ? prev : { ...prev, simCurrentDate: progress.currentDate },
            );
          }
        },
        {
          mode: simMode,
          batchSize: diffDays > 30 ? 7 : 1,
          stopBefore,
          assistantGM,
          autoResolveOffseasonTasks: action.payload?.autoResolveOffseasonTasks === true,
          transferMarketDailySummary: action.payload?.transferMarketDailySummary === true,
          targetPlan: action.payload?.targetPlan,
          onCheckpoint: (checkpointState, progress) => {
            control.checkpoint(checkpointState, progress);
            if (simMode !== 'silent') return;
            const now = Date.now();
            const dayDelta = progress.daysComplete - lastVisibleCheckpointDay;
            if (dayDelta < 3 && now - lastVisibleCheckpointAt < 500 && progress.daysComplete < progress.daysTotal) return;
            lastVisibleCheckpointDay = progress.daysComplete;
            lastVisibleCheckpointAt = now;
            setState(previous => ({
              ...checkpointState,
              isProcessing: true,
              processingAction: previous.processingAction,
              lazySimProgress: undefined,
              simCurrentDate: progress.currentDate,
            }));
          },
        },
      );
      console.log('[SIM_TO_DATE] ✅ runLazySim returned', {
        endStateDate: result.state.date,
        endStateDay: result.state.day,
        endNorm: normalizeDate(result.state.date),
        lastSimResultsCount: result.lastSimResults.length,
        lastSimResultsDates: [...new Set(result.lastSimResults.map((simResult: any) => simResult.date))],
        status: result.status,
        blocker: result.blocker,
        nonProgressDiagnostic: result.nonProgressDiagnostic,
      });
      if (result.status === 'failed') {
        throw new Error(`Simulation target made no progress: ${JSON.stringify(result.nonProgressDiagnostic)}`);
      }
      if (genId !== generationIdRef.current) {
        console.log('[SIM_TO_DATE] ⚠️ genId mismatch — discarding result', { genId, current: generationIdRef.current });
        return;
      }
      const committedState = {
        ...stateRef.current,
        ...result.state,
        lazySimProgress: undefined,
        simCurrentDate: undefined,
        isProcessing: true,
        durableSavePending: true,
        lastDurableSaveError: undefined,
        lastSimResults: result.lastSimResults.length > 0
          ? result.lastSimResults
          : stateRef.current.lastSimResults,
      } as GameState;
      stateRef.current = committedState;
      setState(committedState);
      try {
        const finalized = await finalizeCommittedSimulationState(committedState);
        if (finalized.error) console.error('[SIM_TO_DATE] Durable checkpoint failed.', finalized.error);
        stateRef.current = finalized.state;
        setState(finalized.state);
      } finally {
        publishLongSimProgress(undefined);
      }
    });
    if (lease.acquired === false && lease.owner === 'another-tab') {
      publishLongSimProgress(undefined);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        processingAction: undefined,
        lazySimProgress: undefined,
        lastOutcome: 'This league is already being simulated in another tab.',
      }));
    }
    return { handled: true };
  }

  return { handled: false };
}
