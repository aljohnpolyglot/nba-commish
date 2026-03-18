import React from 'react';
import { Mail, Search, Reply } from 'lucide-react';
import { formatGameRelativeDate } from '../../utils/helpers';

interface EmailListProps {
  emails: any[];
  selectedEmailId: string | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onSelect: (id: string) => void;
  unreadCount: number;
  gameDate: string;
}

export const EmailList: React.FC<EmailListProps> = ({
  emails,
  selectedEmailId,
  searchTerm,
  setSearchTerm,
  onSelect,
  unreadCount,
  gameDate
}) => {
  return (
    <div className={`w-full md:w-1/3 border-r border-slate-800 flex-col bg-slate-900/30 backdrop-blur-md ${selectedEmailId ? 'hidden md:flex' : 'flex'}`}>
      <div className="p-8 border-b border-slate-800 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-white tracking-tight uppercase flex items-center gap-3">
            <Mail size={24} className="text-indigo-500" />
            Inbox
          </h2>
          <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">
            {unreadCount} New
          </span>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
          <input 
            type="text" 
            placeholder="Search communications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all outline-none placeholder:text-slate-700"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {emails.map((email) => (
          <button
            key={email.id}
            onClick={() => onSelect(email.id)}
            className={`w-full text-left px-4 py-3 border-b border-slate-800/30 transition-all duration-200 relative group ${
              selectedEmailId === email.id ? 'bg-indigo-600/10' : 'hover:bg-slate-800/40'
            }`}
          >
            {selectedEmailId === email.id && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
            )}
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-bold truncate max-w-[150px] ${!email.read ? 'text-white' : 'text-slate-400'}`}>
                {email.sender}
              </span>
              <span className="text-[10px] text-slate-500 shrink-0">
                {formatGameRelativeDate(email.date, gameDate)}
              </span>
            </div>
            <div className={`text-xs font-bold mb-1 line-clamp-1 ${!email.read ? 'text-slate-200' : 'text-slate-500'}`}>
              {email.subject}
            </div>
            <div className="text-[10px] text-slate-600 line-clamp-1 font-medium">
              {email.body.substring(0, 60)}...
            </div>
            {email.replied && (
              <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-emerald-500 uppercase tracking-wider">
                <Reply size={8} />
                Replied
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
