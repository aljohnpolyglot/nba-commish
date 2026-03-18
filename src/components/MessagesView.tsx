import React, { useState } from 'react';
import { useGame } from '../store/GameContext';
import { Chat } from '../types';
import { MessageSquarePlus, Search } from 'lucide-react';
import { ChatList } from './messages/ChatList';
import { ChatWindow } from './messages/ChatWindow';
import { NewChatModal } from './messages/NewChatModal';

export const MessagesView: React.FC = () => {
  const { state, dispatchAction, markChatRead } = useGame();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  let selectedChat = state.chats.find(c => c.id === selectedChatId);
  
  if (!selectedChat && selectedChatId?.startsWith('new-')) {
    const draftContactId = selectedChatId.replace('new-', '');
    selectedChat = state.chats.find(c => 
      c.participants.includes(draftContactId) && c.participants.includes('commissioner')
    );
  }

  React.useEffect(() => {
    if (selectedChat && selectedChatId?.startsWith('new-')) {
      setSelectedChatId(selectedChat.id);
    }
  }, [selectedChat, selectedChatId]);

  React.useEffect(() => {
    if (selectedChatId && !selectedChatId.startsWith('new-')) {
      markChatRead(selectedChatId);
    }
  }, [selectedChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setSearchTerm('');
  };

  const handleStartNewChat = (contact: any) => {
    // Check if chat already exists
    const existingChat = state.chats.find(c => 
      c.participants.includes(contact.id) && c.participants.includes('commissioner')
    );

    if (existingChat) {
      setSelectedChatId(existingChat.id);
    } else {
      setSelectedChatId(`new-${contact.id}`);
    }
    setIsNewChatModalOpen(false);
  };

  return (
    <div className="h-full flex bg-slate-950 overflow-hidden">
      {/* Sidebar */}
      <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-slate-800 bg-slate-900/50`}>
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Messages</h2>
          <button 
            onClick={() => {
              setIsNewChatModalOpen(true);
              setSearchTerm('');
            }}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full transition-colors"
          >
            <MessageSquarePlus size={20} />
          </button>
        </div>
        
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search messages..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <ChatList 
            chats={state.chats} 
            selectedChatId={selectedChatId} 
            onSelectChat={handleSelectChat} 
            searchTerm={searchTerm}
          />
        </div>
      </div>

      {/* Chat Window */}
      <div className={`${!selectedChatId ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-slate-950`}>
        {selectedChatId ? (
          <ChatWindow 
            chat={selectedChat} 
            draftContactId={selectedChatId.startsWith('new-') ? selectedChatId.replace('new-', '') : undefined}
            onBack={() => setSelectedChatId(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-4">
              <MessageSquarePlus size={32} />
            </div>
            <p className="text-lg font-medium">Select a conversation or start a new one</p>
          </div>
        )}
      </div>

      {isNewChatModalOpen && (
        <NewChatModal 
          onClose={() => setIsNewChatModalOpen(false)} 
          onSelect={handleStartNewChat} 
        />
      )}
    </div>
  );
};
