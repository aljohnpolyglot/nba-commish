import React, { useState, useEffect } from 'react';
import { useGame } from '../store/GameContext';
import { getLeagueReserve, normalizeLeagueTreasuryStats } from '../services/logic/leagueTreasury';
import { AnimatePresence } from 'motion/react';
import { fetchAvatarData, getAvatarByName } from '../services/avatarService';
import { EmailList } from './inbox/EmailList';
import { EmailEmptyState } from './inbox/EmailEmptyState';
import { EmailContent } from './inbox/EmailContent';
import { StartNegotiationModal, KIT_PLACEMENT_MULTIPLIER } from './tycoon/StartNegotiationModal';
import { generateMockOffers } from './tycoon/openMarketModalShared';
import { getBrandMeta, resolveSponsorLeagueKey } from '../data/sponsorCatalogFetcher';
import { resolveSponsorLogoUrl } from '../utils/sponsorLogos';
import { getSeasonEconomyIndex, postClubTransaction } from '../services/tycoon/clubFinance';
import type { DeathMemorialInboxAction, DisciplineInboxAction, DisciplineSanctionType, MediaProjectInboxAction, SponsorInboxOffer } from '../types';
import type { SponsorshipSlot, TycoonTier } from '../types/tycoon';
import { isEuroIsolatedMode } from '../utils/uiMode';
import { resolveAnyTeam } from '../utils/teamLookup';
import { getTeamFullName } from '../utils/teamNames';
import { resolveMatchingDisciplineCases } from '../services/disciplineInbox';
import type { DisciplineTemplateSelection } from '../services/disciplinePolicy';
import { resolveDeathMemorialDecision } from '../services/playerDevelopment/deathMemorial';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { resolveMediaProjectDecision } from '../services/mediaProjects';
import { MediaProjectPlayerPickerModal } from './inbox/MediaProjectPlayerPickerModal';
import { compareGameDates } from '../utils/dateUtils';
import { resolveAspireInvestigation } from '../services/aspireSideDeals';

export const Inbox: React.FC = () => {
  const { state, dispatchAction, markEmailRead, addEmail, dismissEmail, applyTycoonMutation } = useGame();
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [avatars, setAvatars] = useState<any[]>([]);
  const [negotiatingOffer, setNegotiatingOffer] = useState<SponsorInboxOffer | null>(null);
  const [closureBrand, setClosureBrand] = useState<string | null>(null);
  const [memorialDecision, setMemorialDecision] = useState<{
    emailId: string;
    action: DeathMemorialInboxAction;
    decision: 'ignore' | 'honor';
  } | null>(null);
  const [mediaProjectPicker, setMediaProjectPicker] = useState<{
    emailId: string;
    action: MediaProjectInboxAction;
  } | null>(null);

  const userTeamId = state.userTeamId;
  const userTeam: any = userTeamId == null
    ? undefined
    : resolveAnyTeam(userTeamId, state.teams, state.nonNBATeams ?? []);
  const sponsorLeague = resolveSponsorLeagueKey(userTeam?.country, userTeam?.league, userTeam?.region, state.euroPrimaryCompetitionId);

  useEffect(() => {
    if (state.leagueType === 'fictional') {
      setAvatars([]);
      return;
    }
    fetchAvatarData().then(setAvatars);
  }, [state.leagueType]);

  useEffect(() => {
    if (state.gameMode !== 'gm' || !isEuroIsolatedMode(state) || !userTeam?.tycoon || userTeamId == null) return;
    const year = state.leagueStats.year;
    const marker = `sponsor-inbox-${userTeamId}-${year}`;
    if (userTeam.tycoon.sponsorInboxOfferIds?.includes(marker) || state.inbox.some(email => email.id === marker)) return;
    const economyIndex = getSeasonEconomyIndex(state, year);
    const offers = generateMockOffers(userTeam.tycoon.tier as TycoonTier, sponsorLeague, userTeamId, userTeam.tycoon.commercialTrust ?? 100, economyIndex);
    const source = offers.find(offer => offer.oneTime && offer.interestLevel !== 'not-interested');
    if (!source) return;
    const offer: SponsorInboxOffer = {
      id: source.id,
      brand: source.brand,
      slot: source.slot,
      industry: source.industry,
      archetype: source.archetype,
      interestLevel: source.interestLevel,
      offerLabel: source.offerLabel,
      slotLabel: source.slotLabel,
      valuePerYear: source.valuePerYear,
      contractYears: source.oneTime ? 1 : source.contractYears,
      dealType: source.dealType,
      oneTime: source.oneTime,
      country: sponsorLeague,
    };
    applyTycoonMutation(userTeamId, team => {
      const ids = team.tycoon?.sponsorInboxOfferIds ?? [];
      if (!ids.includes(marker)) team.tycoon!.sponsorInboxOfferIds = [...ids, marker];
    });
    addEmail({
      id: marker,
      sender: source.brand,
      senderRole: 'Commercial Partnerships',
      organization: source.brand,
      subject: `${source.offerLabel} opportunity`,
      body: `${source.brand} would like to discuss a ${source.oneTime ? 'one-season endorsement' : 'sponsorship'} with your club. Review the starting terms and decide whether to open negotiations.`,
      read: false,
      replied: false,
      date: state.date,
      action: { type: 'sponsor-offer', offer },
    });
  }, [addEmail, applyTycoonMutation, sponsorLeague, state.date, state.gameMode, state.inbox, state.leagueStats.year, userTeam, userTeamId]);

  const selectedEmail = state.inbox.find(e => e.id === selectedEmailId);
  const filteredEmails = state.inbox.filter(e => 
    (e.sender && e.sender.toLowerCase().includes((searchTerm || '').toLowerCase())) || 
    (e.subject && e.subject.toLowerCase().includes((searchTerm || '').toLowerCase()))
  ).sort((left, right) => compareGameDates(right.date, left.date));

  const handleSelect = (id: string) => {
    setSelectedEmailId(id);
    markEmailRead(id);
    setReplyText('');
  };

  const handleReply = () => {
    if (!replyText.trim() || !selectedEmail) return;
    dispatchAction({
      type: 'REPLY_EMAIL',
      payload: { emailId: selectedEmail.id, replyText }
    });
    setReplyText('');
  };

  const resolveDisciplineCase = async (
    action: DisciplineInboxAction,
    sanction: DisciplineSanctionType,
    amountUSD: number,
    games: number,
    reason: string,
    disciplineTemplate?: DisciplineTemplateSelection,
  ) => {
    const targets = new Set(action.playerIds);
    const contacts = state.players
      .filter(player => targets.has(player.internalId))
      .map(player => {
        const team = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? []);
        return {
          id: player.internalId,
          name: player.name,
          title: 'Player',
          organization: team ? getTeamFullName(team) : 'Free Agent',
          type: 'player' as const,
          playerPortraitUrl: player.imgURL,
          teamLogoUrl: (team as any)?.logoUrl ?? (team as any)?.imgURL,
        };
      });
    if (sanction !== 'warning' && contacts.length > 0) {
      await dispatchAction({
        type: sanction === 'fine'
          ? 'FINE_PERSON'
          : sanction === 'suspension' || sanction === 'fine_and_suspension'
            ? 'SUSPEND_PLAYER'
            : 'DRUG_TEST_PERSON',
        payload: {
          contacts,
          reason,
          amount: sanction === 'fine' ? amountUSD : undefined,
          fineAmount: sanction === 'fine_and_suspension' ? amountUSD : undefined,
          duration: sanction === 'suspension' || sanction === 'fine_and_suspension' ? String(Math.max(1, games)) : undefined,
          count: contacts.length,
          sourceIncidentId: action.incidentId,
          disciplineTemplateId: disciplineTemplate?.templateId,
          disciplineTemplateName: disciplineTemplate?.templateName,
        },
      } as any);
      return;
    }
    const appliedGames = sanction === 'suspension' || sanction === 'fine_and_suspension'
      ? Math.max(1, games)
      : sanction === 'drug_test' && action.incidentType === 'peds'
        ? Math.max(1, action.recommendedGames)
        : 0;
    const players = state.players.map(player => targets.has(player.internalId) && appliedGames > 0
      ? { ...player, suspension: { reason, gamesRemaining: appliedGames } }
      : player);
    const subjectNames = action.playerNames.join(' and ');
    const ruling = sanction === 'fine'
      ? `${subjectNames} received a ${amountUSD.toLocaleString()} fine.`
      : sanction === 'suspension'
        ? `${subjectNames} received a ${appliedGames}-game suspension.`
        : sanction === 'fine_and_suspension'
          ? `${subjectNames} received a ${amountUSD.toLocaleString()} fine and a ${appliedGames}-game suspension.`
        : sanction === 'drug_test'
          ? `${subjectNames} received a mandatory drug test order.${action.incidentType === 'peds' ? ` The confirmed positive result carries a ${appliedGames}-game suspension.` : ''}`
          : `${subjectNames} received a formal warning.`;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        players,
        inbox: resolveMatchingDisciplineCases(
          state.inbox,
          action.playerIds,
          sanction,
          state.date,
          sanction === 'fine' || sanction === 'fine_and_suspension' ? amountUSD : undefined,
          appliedGames || undefined,
        ),
        stats: sanction === 'fine' || sanction === 'fine_and_suspension'
          ? {
              ...normalizeLeagueTreasuryStats(state.stats),
              leagueReserve: getLeagueReserve(state.stats) + amountUSD / 1_000_000,
            }
          : state.stats,
        history: [...state.history, { text: `${ruling} Reason: ${reason}`, date: state.date, type: 'Discipline', playerIds: action.playerIds }],
        news: [{
          id: `discipline-ruling-${action.incidentId}`,
          headline: 'League Issues Discipline Ruling',
          content: `${ruling} The decision follows a review by League Operations.`,
          date: state.date,
          type: 'league',
          read: false,
          isNew: true,
          playerPortraitUrl: state.players.find(player => targets.has(player.internalId))?.imgURL,
        }, ...state.news],
      },
    } as any);
  };

  const rejectSponsorOffer = () => {
    if (!selectedEmail?.action || selectedEmail.action.type !== 'sponsor-offer') return;
    const brand = selectedEmail.action.offer.brand;
    dismissEmail(selectedEmail.id);
    setSelectedEmailId(null);
    setClosureBrand(brand);
  };

  const submitSponsorOffer = (submission: { slot: SponsorshipSlot; valuePerYear: number; contractYears: number }) => {
    if (!negotiatingOffer || userTeamId == null) return;
    const year = state.leagueStats.year;
    applyTycoonMutation(userTeamId, team => {
      const ledger = team.tycoon?.oneTimePayouts ?? [];
      if (ledger.some(entry => entry.id === `inbox-sponsor:${negotiatingOffer.id}:${year}`)) return;
      const sourceId = `inbox-sponsor:${negotiatingOffer.id}:${year}`;
      postClubTransaction(team.tycoon!, {
        sourceId,
        date: state.date,
        season: year,
        category: 'sponsorship',
        label: `${negotiatingOffer.brand} one-season partnership`,
        amountEUR: submission.valuePerYear,
      });
      team.tycoon!.oneTimePayouts = [...ledger, {
        id: sourceId,
        year,
        brand: negotiatingOffer.brand,
        amount: submission.valuePerYear,
        kind: negotiatingOffer.dealType === 'endorsement' ? 'endorsement' : 'sponsorship',
        date: state.date,
        expiresAfterYear: year + 1,
        offerLabel: negotiatingOffer.offerLabel,
        slotLabel: negotiatingOffer.slotLabel,
        industry: negotiatingOffer.industry,
      }];
    });
    if (selectedEmailId) dismissEmail(selectedEmailId);
    setSelectedEmailId(null);
  };

  const negotiationData = negotiatingOffer ? {
    brand: negotiatingOffer.brand,
    sponsorLeague,
    industry: negotiatingOffer.industry,
    slot: negotiatingOffer.slot,
    baseValuePerYear: Math.round(negotiatingOffer.valuePerYear / Math.max(0.01, KIT_PLACEMENT_MULTIPLIER[negotiatingOffer.slot] || 1)),
    interestLabel: negotiatingOffer.interestLevel === 'very-interested' ? 'Very Interested' as const
      : negotiatingOffer.interestLevel === 'interested' ? 'Interested' as const
        : negotiatingOffer.interestLevel === 'not-interested' ? 'Not Interested' as const
          : 'Neutral' as const,
    exclusivityScope: negotiatingOffer.slotLabel,
    expiresOn: state.date,
    negotiationDaysLeft: 12,
    currentSeasonYear: state.leagueStats.year,
    occupiedSlots: new Set<SponsorshipSlot>(),
    oneTime: negotiatingOffer.oneTime,
    dealTypeLabel: negotiatingOffer.offerLabel,
  } : null;

  const confirmMemorialDecision = () => {
    if (!memorialDecision) return;
    const resolved = resolveDeathMemorialDecision(state, memorialDecision.emailId, memorialDecision.decision);
    if (resolved !== state) {
      dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          inbox: resolved.inbox,
          offseasonChecklist: resolved.offseasonChecklist,
          stats: resolved.stats,
          leagueStats: resolved.leagueStats,
          lastActionEffect: resolved.lastActionEffect,
          actionAffinities: resolved.actionAffinities,
          scheduledEvents: resolved.scheduledEvents,
          history: resolved.history,
        },
      } as any);
    }
    setMemorialDecision(null);
  };

  const completeMediaProjectDecision = (
    emailId: string,
    decision: 'ignore' | 'respond',
    playerIds: string[] = [],
  ) => {
    const resolved = resolveMediaProjectDecision(state, emailId, decision, playerIds);
    if (resolved === state) return;
    dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        inbox: resolved.inbox,
        stats: resolved.stats,
        leagueStats: resolved.leagueStats,
        lastActionEffect: resolved.lastActionEffect,
        actionAffinities: resolved.actionAffinities,
        history: resolved.history,
      },
    } as any);
    setMediaProjectPicker(null);
  };

  const getSenderPhoto = (email: any) => {
    if (email.action?.type === 'sponsor-offer') {
      const logo = resolveSponsorLogoUrl(getBrandMeta(sponsorLeague, email.action.offer.brand));
      if (logo) return logo;
    }
    // Check for NBA prefix
    if (state.leagueType !== 'fictional' && email.sender && email.sender.toUpperCase().startsWith('NBA')) {
      return "https://upload.wikimedia.org/wikipedia/en/thumb/0/03/National_Basketball_Association_logo.svg/250px-National_Basketball_Association_logo.svg.png";
    }

    if (state.leagueType !== 'fictional' && email.playerPortraitUrl) return email.playerPortraitUrl;
    
    // Check if sender is a player in the roster
    const playerMatch = state.players.find(p => p.name && email.sender && p.name.toLowerCase() === email.sender.toLowerCase());
    if (playerMatch) return playerMatch.imgURL;

    const avatar = getAvatarByName(email.sender || '', avatars);
    if (avatar) return avatar;
    
    // If no avatar, check if the sender is associated with a team
    if (email.teamLogoUrl) return email.teamLogoUrl;

    // Check staff lists for team affiliation
    if (state.staff) {
        const staffMember = [...state.staff.gms, ...state.staff.owners, ...state.staff.coaches].find(s => s.name === email.sender);
        if (staffMember && staffMember.team) {
             const staffTeam = state.teams.find(t => t.name === staffMember.team);
             if (staffTeam) return staffTeam.logoUrl;
        }
    }

    const team = state.teams.find(t => 
      (email.sender && email.sender.toLowerCase().includes(t.name.toLowerCase())) || 
      (email.senderRole && email.senderRole.toLowerCase().includes(t.name.toLowerCase())) ||
      (email.organization && email.organization.toLowerCase().includes(t.name.toLowerCase()))
    );
    if (team) return team.logoUrl;
    
    return null;
  };

  return (
    <div className="flex h-full bg-slate-950 text-slate-300 overflow-hidden rounded-[2.5rem] border border-slate-800 shadow-2xl">
      <EmailList 
        emails={filteredEmails}
        selectedEmailId={selectedEmailId}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onSelect={handleSelect}
        unreadCount={state.inbox.filter(e => !e.read).length}
        gameDate={state.date}
      />

      {/* Email Content */}
      <div className={`flex-1 flex-col bg-slate-950 relative overflow-hidden ${!selectedEmailId ? 'hidden md:flex' : 'flex'}`}>
        {selectedEmail ? (
          <AnimatePresence mode="wait">
            <EmailContent 
              email={selectedEmail}
              currency={state.leagueStats.currency ?? 'EUR'}
              replyText={replyText}
              setReplyText={setReplyText}
              onReply={handleReply}
              onBack={() => setSelectedEmailId(null)}
              isProcessing={state.isProcessing}
              getSenderPhoto={getSenderPhoto}
              onSponsorNegotiate={() => {
                if (selectedEmail.action?.type === 'sponsor-offer') setNegotiatingOffer(selectedEmail.action.offer);
              }}
              onSponsorReject={rejectSponsorOffer}
              onDisciplineResolve={(sanction, amountUSD, games, reason, disciplineTemplate) => {
                if (selectedEmail.action?.type !== 'discipline-case') return;
                resolveDisciplineCase(selectedEmail.action, sanction, amountUSD, games, reason, disciplineTemplate);
              }}
              onMemorialDecision={decision => {
                if (selectedEmail.action?.type !== 'death-memorial' || selectedEmail.action.status !== 'open') return;
                setMemorialDecision({ emailId: selectedEmail.id, action: selectedEmail.action, decision });
              }}
              onMediaProjectDecision={decision => {
                if (selectedEmail.action?.type !== 'media-project' || selectedEmail.action.status !== 'open') return;
                if (decision === 'ignore') {
                  completeMediaProjectDecision(selectedEmail.id, 'ignore');
                  return;
                }
                setMediaProjectPicker({ emailId: selectedEmail.id, action: selectedEmail.action });
              }}
              onAspireResolve={pickCount => {
                if (selectedEmail.action?.type !== 'aspire-investigation') return;
                const resolved = resolveAspireInvestigation(state, selectedEmail.id, pickCount);
                if (resolved !== state) dispatchAction({
                  type: 'UPDATE_STATE',
                  payload: {
                    inbox: resolved.inbox,
                    draftPicks: resolved.draftPicks,
                    history: resolved.history,
                  },
                } as any);
              }}
            />
          </AnimatePresence>
        ) : (
          <EmailEmptyState />
        )}
      </div>
      <StartNegotiationModal
        open={!!negotiatingOffer}
        onClose={() => setNegotiatingOffer(null)}
        data={negotiationData}
        onSubmit={submitSponsorOffer}
        onRejected={() => {
          if (selectedEmailId) dismissEmail(selectedEmailId);
          setSelectedEmailId(null);
        }}
      />
      {closureBrand && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-6 text-center shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-300">Opportunity Closed</p>
            <h3 className="mt-2 text-2xl font-black text-white">Thank you for considering {closureBrand}</h3>
            <p className="mt-3 text-sm text-slate-400">The club has passed on this opportunity. The brand appreciates the response and will move on.</p>
            <button onClick={() => setClosureBrand(null)} className="mt-6 w-full rounded-xl bg-slate-800 py-3 text-sm font-black text-white hover:bg-slate-700">Continue</button>
          </div>
        </div>
      )}
      {memorialDecision && (
        <ConfirmationModal
          title={memorialDecision.decision === 'honor'
            ? `Honor ${memorialDecision.action.playerName}?`
            : `Take no formal action for ${memorialDecision.action.playerName}?`}
          message={memorialDecision.decision === 'honor'
            ? memorialDecision.action.scope === 'team'
              ? 'Your club will arrange a moment of silence at its next home game.'
              : 'The league will arrange a formal tribute with the organization this player represented most.'
            : 'This closes the request without scheduling a league or team memorial.'}
          onConfirm={confirmMemorialDecision}
          onCancel={() => setMemorialDecision(null)}
        />
      )}
      {mediaProjectPicker && (
        <MediaProjectPlayerPickerModal
          key={mediaProjectPicker.emailId}
          action={mediaProjectPicker.action}
          onClose={() => setMediaProjectPicker(null)}
          onConfirm={playerIds => completeMediaProjectDecision(mediaProjectPicker.emailId, 'respond', playerIds)}
        />
      )}
    </div>
  );
};
