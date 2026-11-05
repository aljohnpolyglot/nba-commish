import React from 'react';
import { motion } from 'motion/react';
import { Handshake, Reply, Send, UserCircle2, XCircle } from 'lucide-react';
import { formatCurrencyWithCode } from '../../utils/helpers';
import { useGame } from '../../store/GameContext';
import type { DisciplineSanctionType } from '../../types';
import type { DisciplineTemplateSelection } from '../../services/disciplinePolicy';
import { DisciplineInboxPanel } from './DisciplineInboxPanel';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { DeathMemorialInboxPanel } from './DeathMemorialInboxPanel';
import { MediaProjectInboxPanel } from './MediaProjectInboxPanel';
import { AspireInvestigationInboxPanel } from './AspireInvestigationInboxPanel';
import { SponsorLogo } from '../tycoon/SponsorLogo';

interface EmailContentProps {
  email: any;
  currency: string;
  replyText: string;
  setReplyText: (text: string) => void;
  onReply: () => void;
  onBack: () => void;
  isProcessing: boolean;
  getSenderPhoto: (email: any) => string | null;
  onSponsorNegotiate?: () => void;
  onSponsorReject?: () => void;
  onDisciplineResolve?: (
    sanction: DisciplineSanctionType,
    amountUSD: number,
    games: number,
    reason: string,
    disciplineTemplate?: DisciplineTemplateSelection,
  ) => void;
  onMemorialDecision?: (decision: 'ignore' | 'honor') => void;
  onMediaProjectDecision?: (decision: 'ignore' | 'respond') => void;
  onAspireResolve?: (pickCount: number) => void;
}

export const EmailContent: React.FC<EmailContentProps> = ({
  email,
  currency,
  replyText,
  setReplyText,
  onReply,
  onBack,
  isProcessing,
  getSenderPhoto,
  onSponsorNegotiate,
  onSponsorReject,
  onDisciplineResolve,
  onMemorialDecision,
  onMediaProjectDecision,
  onAspireResolve,
}) => {
  const { state } = useGame();
  const sponsorOffer = email.action?.type === 'sponsor-offer' ? email.action.offer : null;
  const senderPhoto = getSenderPhoto(email);
  const disciplineCase = email.action?.type === 'discipline-case' ? email.action : null;
  const replacementCase = email.action?.type === 'all-star-replacement' ? email.action : null;
  const memorialCase = email.action?.type === 'death-memorial' ? email.action : null;
  const mediaProject = email.action?.type === 'media-project' ? email.action : null;
  const aspireCase = email.action?.type === 'aspire-investigation' ? email.action : null;
  const replacementPlayer = replacementCase
    ? state.players.find(player => player.internalId === replacementCase.playerId)
    : undefined;
  const replacementTeam = replacementPlayer
    ? state.teams.find(team => team.id === replacementPlayer.tid)
    : undefined;
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

            <div className="relative shrink-0">
              {sponsorOffer ? (
                <SponsorLogo
                  name={sponsorOffer.brand}
                  meta={{ industry: sponsorOffer.industry ?? 'generic', domain: null, logoOverride: senderPhoto }}
                  size={48}
                />
              ) : senderPhoto ? (
                <img src={senderPhoto} alt={email.sender} className="w-12 h-12 rounded-full object-cover border border-slate-700 bg-slate-900" referrerPolicy="no-referrer" />
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
        {aspireCase ? (
          <AspireInvestigationInboxPanel
            action={aspireCase}
            commissioner={state.gameMode !== 'gm'}
            onResolve={onAspireResolve}
          />
        ) : mediaProject ? (
          <MediaProjectInboxPanel
            action={mediaProject}
            onDecision={decision => onMediaProjectDecision?.(decision)}
          />
        ) : memorialCase ? (
          <DeathMemorialInboxPanel
            action={memorialCase}
            onDecision={decision => onMemorialDecision?.(decision)}
          />
        ) : sponsorOffer ? (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10"><Handshake size={20} className="text-violet-300" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-300">Commercial Opportunity</p>
                <h4 className="mt-1 text-lg font-black text-white">{sponsorOffer.offerLabel}</h4>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Starting Value</p><p className="mt-1 font-black text-emerald-300">{formatCurrencyWithCode(sponsorOffer.valuePerYear, currency, false)}</p></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Term</p><p className="mt-1 font-black text-white">{sponsorOffer.oneTime ? 'One season' : `${sponsorOffer.contractYears} years`}</p></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Placement</p><p className="mt-1 truncate font-black text-white">{sponsorOffer.slotLabel}</p></div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button onClick={onSponsorReject} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-6 text-sm font-bold text-rose-300 hover:bg-rose-500/20"><XCircle size={16} /> Reject</button>
              <button onClick={onSponsorNegotiate} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-7 text-sm font-black text-white hover:bg-violet-400"><Handshake size={16} /> Negotiate</button>
            </div>
          </div>
        ) : disciplineCase ? (
          <DisciplineInboxPanel
            action={disciplineCase}
            currencyCode={currency}
            onResolve={(sanction, amountUSD, games, reason, disciplineTemplate) =>
              onDisciplineResolve?.(sanction, amountUSD, games, reason, disciplineTemplate)}
          />
        ) : replacementCase ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {replacementPlayer && (
                <PlayerPortrait
                  imgUrl={replacementPlayer.imgURL}
                  face={replacementPlayer.face}
                  playerName={replacementPlayer.name}
                  teamLogoUrl={replacementTeam?.logoUrl}
                  overallRating={replacementPlayer.overallRating}
                  size={64}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">All-Star Roster Action</p>
                <h4 className="mt-1 text-xl font-black text-white">{replacementCase.playerName} is unavailable</h4>
                <p className="mt-1 text-sm text-slate-400">Choose a healthy NBA player who is not already on the All-Star roster.</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-xs font-bold text-slate-400">
                Use the All-Star workspace to make the selection. If the deadline passes, {state.gameMode === 'gm' ? 'Basketball Operations' : 'the Assistant Commissioner'} will decide.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                <Reply size={14} className="text-indigo-500" />
                {state.gameMode === 'gm' ? 'Front Office Response' : 'Commissioner Response'}
              </h4>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Confidential</span>
            </div>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={state.gameMode === 'gm'
                ? 'Write your response as General Manager...'
                : "Draft your response as Commissioner. Your words will shape the league's future..."}
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
        )}
      </div>
    </motion.div>
  );
};
