import { GameState, Chat, ChatMessage } from '../../types';

export const addUserMessage = (state: GameState, payload: any): { chats: Chat[], chatId: string, target: any } => {
  const { chatId, text, targetId, targetName, targetRole, targetOrg } = payload;
  
  let newChats = [...state.chats];
  let chatIndex = newChats.findIndex(c => c.id === chatId);
  let chat: Chat;

  if (chatIndex === -1) {
    // Create new chat
    chat = {
      id: chatId || `chat-${Date.now()}`,
      participants: ['commissioner', targetId],
      participantDetails: [
        { id: 'commissioner', name: state.commissionerName, role: 'Commissioner' },
        { id: targetId, name: targetName, role: targetRole, avatarUrl: payload.avatarUrl } // Assuming avatarUrl is passed or we find it
      ],
      messages: [],
      unreadCount: 0,
      isTyping: true
    };
    newChats.unshift(chat); // Add to top
    chatIndex = 0;
  } else {
    chat = { ...newChats[chatIndex], isTyping: true };
    newChats[chatIndex] = chat;
    // Move to top
    newChats.splice(chatIndex, 1);
    newChats.unshift(chat);
  }

  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}`,
    senderId: 'commissioner',
    senderName: state.commissionerName,
    text,
    timestamp: new Date().toISOString(),
    read: true,
    type: 'text'
  };

  chat.messages = [...chat.messages, userMessage];
  chat.lastMessage = userMessage;

  return { 
    chats: newChats, 
    chatId: chat.id,
    target: { name: targetName, role: targetRole, org: targetOrg }
  };
};

export const addBotMessage = (state: GameState, chatId: string, text: string): Chat[] => {
  const newChats = [...state.chats];
  const chatIndex = newChats.findIndex(c => c.id === chatId);
  
  if (chatIndex === -1) return newChats;

  const chat = { ...newChats[chatIndex], isTyping: false };
  const participant = chat.participantDetails.find(p => p.id !== 'commissioner');

  if (text) {
    const botMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderId: participant?.id || 'unknown',
      senderName: participant?.name || 'Unknown',
      text,
      timestamp: new Date().toISOString(),
      read: false,
      type: 'text'
    };
    chat.messages = [...chat.messages, botMessage];
    chat.lastMessage = botMessage;
    chat.unreadCount += 1;
  }

  newChats[chatIndex] = chat;
  return newChats;
};
