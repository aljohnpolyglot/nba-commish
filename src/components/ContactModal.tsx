import React from 'react';
import { Contact } from '../types';
import { useGame } from '../store/GameContext';
import { ChatWindow } from './messages/ChatWindow';
import { motion, AnimatePresence } from 'motion/react';

interface ContactModalProps {
  contact: Contact | null;
  onClose: () => void;
  onSend: (params: { message: string }) => void;
  isLoading: boolean;
}

const ContactModal: React.FC<ContactModalProps> = ({ contact, onClose }) => {
  const { state } = useGame();

  if (!contact) return null;

  const chat = state.chats.find(c => c.participants.includes(contact.id) && c.participants.includes('commissioner'));

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex justify-center items-center z-[150] p-4 md:p-6"
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-slate-950 rounded-2xl md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl h-[80vh] md:h-[700px] border border-slate-800 overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <ChatWindow 
            chat={chat} 
            draftContactId={contact.id} 
            onBack={onClose} 
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ContactModal;
