import React from 'react';
import { motion } from 'motion/react';
import { Reply, Send, UserCircle2 } from 'lucide-react';

interface EmailContentProps {
  email: any;
  replyText: string;
  setReplyText: (text: string) => void;
  onReply: () => void;
  onBack: () => void;
  isProcessing: boolean;
  getSenderPhoto: (email: any) => string | null;
}

export const EmailContent: React.FC<EmailContentProps> = ({
  email,
  replyText,
  setReplyText,
  onReply,
  onBack,
  isProcessing,
  getSenderPhoto
}) => {
  return (
    <motion.div
      key={email.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar"
    >
      <div className="p-6 md:p-8 border-b border-slate-800 bg-slate-900/10 shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Back button for mobile */}
            <button 
                onClick={onBack} 
                className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-full"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>

            <div className="relative">
              {getSenderPhoto(email) ? (
                <img src={getSenderPhoto(email)!} alt={email.sender} className="w-12 h-12 rounded-full object-cover border border-slate-700 bg-slate-900" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                  <UserCircle2 size={24} className="text-slate-500" />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{email.sender}</h3>
                <span className="text-[10px] font-bold text-slate-500">
                  &lt;{(() => {
                    const name = (email.sender || '').toLowerCase().replace(/\s/g, '.');
                    const role = (email.senderRole || '').toUpperCase();
                    const org = (email.organization || '').toUpperCase();
                    const body = (email.body || '').toUpperCase();
                    
                    if (role.includes('PBA') || org.includes('PBA') || body.includes('PBA')) return `${name}@pba.ph`;
                    if (role.includes('WNBA') || org.includes('WNBA') || body.includes('WNBA')) return `${name}@wnba.com`;
                    if (role.includes('EUROLEAGUE') || org.includes('EUROLEAGUE') || body.includes('EUROLEAGUE')) return `${name}@euroleague.net`;
                    if (role.includes('FIBA') || org.includes('FIBA') || body.includes('FIBA')) return `${name}@fiba.basketball`;
                    
                    if (email.organization) {
                        const cleanOrg = email.organization.toLowerCase().replace(/[^a-z0-9.]/g, '');
                        if (cleanOrg.includes('nba') || cleanOrg.includes('league')) return `${name}@nba.com`;
                        if (cleanOrg.includes('nbpa') || cleanOrg.includes('playersassociation')) return `${name}@nbpa.com`;
                        if (cleanOrg.includes('.com') || cleanOrg.includes('.net') || cleanOrg.includes('.org')) return `${name}@${cleanOrg}`;
                        if (cleanOrg.length > 0) return `${name}@${cleanOrg}.com`;
                    }
                    
                    return `${name}@nba.com`;
                  })()}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{email.senderRole}</span>
                <span className="text-[10px] text-slate-500">to me</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 font-medium">{email.date}</div>
        </div>
        
        <h4 className="text-xl font-bold text-slate-100 mb-6">{email.subject}</h4>
        
        <div className="space-y-6 text-slate-300 text-sm leading-relaxed max-w-3xl">
          {(email.thread || [{sender: email.sender, text: email.body}]).map((message: any, index: number) => (
            <div key={index} className={`p-4 rounded-xl ${message.sender === 'Commissioner' ? 'bg-indigo-600/5 border border-indigo-500/10' : 'bg-slate-900/30'}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500">{message.sender}</span>
                </div>
                <p className="whitespace-pre-wrap">
                    {message.text}
                </p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 md:p-10 bg-slate-950 flex flex-col shrink-0">
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                <Reply size={14} className="text-indigo-500" />
                Executive Response
              </h4>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Confidential</span>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Draft your response as Commissioner. Your words will shape the league's future..."
              className="w-full bg-slate-900/50 border border-slate-800 rounded-[2rem] p-8 text-slate-200 text-lg font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all outline-none resize-none mb-6 placeholder:text-slate-700 shadow-inner min-h-[200px]"
              disabled={isProcessing}
            />
            <div className="flex flex-col sm:flex-row justify-end gap-4">
              <button
                onClick={onReply}
                disabled={!replyText.trim() || isProcessing}
                className="flex items-center justify-center gap-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all duration-300 shadow-xl shadow-indigo-600/20 group"
              >
                {isProcessing ? 'Transmitting...' : 'Send Response'}
                <Send size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </div>
          </div>
      </div>
    </motion.div>
  );
};
