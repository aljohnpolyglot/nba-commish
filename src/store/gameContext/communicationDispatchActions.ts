import { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { GameState, UserAction } from '../../types';
import { sendChatMessage } from '../../services/llm/llm';
import { SettingsManager } from '../../services/SettingsManager';
import { normalizeDate } from '../../utils/helpers';

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
    const { chatId, text, imageUrl, targetId, targetName, targetRole, targetOrg, avatarUrl, isHypnotized } = action.payload;
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
          { id: 'commissioner', name: stateRef.current.commissionerName, role: 'Commissioner' },
          { id: targetId, name: targetName, role: targetRole, avatarUrl },
        ],
        messages: [],
        unreadCount: 0,
        isTyping: true,
      };
      newChats.unshift(chat);
      chatIndex = 0;
    } else {
      chat.isTyping = true;
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
      const responseText = await sendChatMessage(stateRef.current, targetName, targetRole, targetOrg, chat.messages, isHypnotized, targetId);
      if (isHypnotized) {
        const commandText = text.replace('[HYPNOTIC COMMAND]: ', '').trim();
        dispatchAction({ type: 'ADD_PENDING_HYPNOSIS', payload: { targetName, command: commandText } } as any);
        setState(prev => ({
          ...prev,
          lastOutcome: `Hypnotic command transmitted to ${targetName}. They are now under your influence. The effects will manifest as the simulation progresses.`,
        }));
      }

      if (responseText && responseText.trim().length > 0 && !responseText.toLowerCase().includes('[seen zone]')) {
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
          updatedChats[updatedChatIndex] = { ...updatedChats[updatedChatIndex], isTyping: false };
        }
        return { ...prev, chats: updatedChats };
      });
    }
    return { handled: true };
  }

  if (action.type === 'SIMULATE_TO_DATE') {
    const targetNorm = normalizeDate(action.payload.targetDate);
    const currentNorm = normalizeDate(stateRef.current.date);
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
    const genId = ++generationIdRef.current;
    const simMode = diffDays > 30 ? 'overlay' : 'silent';
    const stopBefore = action.payload?.stopBefore === true;
    const assistantGM = action.payload?.assistantGM === true;
    console.log('[SIM_TO_DATE] ⚙️ runLazySim options', {
      simMode,
      batchSize: diffDays > 30 ? 7 : 1,
      stopBefore,
      assistantGM,
    });
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
    const { runLazySim } = await import('../../services/logic/lazySimRunner');
    const result = await runLazySim(
      stateRef.current,
      action.payload.targetDate,
      (progress: any) => {
        if (simMode === 'overlay') {
          setState(prev => ({ ...prev, lazySimProgress: progress }));
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
        onGame: simMode === 'silent' ? (gameResult: any) => {
          const raw = gameResult?.date;
          if (!raw) return;
          const date = normalizeDate(raw);
          flushSync(() => {
            setState(prev => (prev.simCurrentDate === date ? prev : { ...prev, simCurrentDate: date }));
          });
        } : undefined,
      },
    );
    console.log('[SIM_TO_DATE] ✅ runLazySim returned', {
      endStateDate: result.state.date,
      endStateDay: result.state.day,
      endNorm: normalizeDate(result.state.date),
      lastSimResultsCount: result.lastSimResults.length,
      lastSimResultsDates: [...new Set(result.lastSimResults.map((simResult: any) => simResult.date))],
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
    return { handled: true };
  }

  return { handled: false };
}
