import React, { useState } from 'react';
import { LeagueOfficeSearcher, Personnel } from '../central/view/LeagueOfficeSearcher';
import { PersonnelActionsModal, PersonnelActionType } from '../central/view/PersonnelActionsModal';
import { PersonnelBioView } from '../central/view/PersonnelBioView';
import { useActionModals } from '../actions/hooks/useActionModals';
import { motion, AnimatePresence } from 'motion/react';
import { Building2 } from 'lucide-react';
import { ActionModalsRenderer } from '../actions/view/ActionModalsRenderer';
import { useGame } from '../../store/GameContext';
import { PersonSelectorModal } from '../modals/PersonSelectorModal';
import ContactModal from '../ContactModal';
export const LeagueOfficeView: React.FC = () => {
  const { state, dispatchAction } = useGame();
  const modals = useActionModals();
  // Personnel-specific state
  const [selectedPersonnel, setSelectedPersonnel] = useState<Personnel | null>(null);
  const [viewingBio,        setViewingBio]        = useState<Personnel | null>(null);
  const [contactModalPerson, setContactModalPerson] = useState<any>(null);
  const [directAction, setDirectAction] = useState<{
    type: 'contact' | 'bribe' | 'fine' | 'dinner' | 'movie' | 'suspension';
    person: Personnel;
  } | null>(null);

  const ACTION_TYPE_MAP: Record<string, string> = {
    contact:    'SEND_MESSAGE',
    bribe:      'BRIBE_PERSON',
    fine:       'FINE_PERSON',
    dinner:     'INVITE_DINNER',
    movie:      'INVITE_DINNER',
    suspension: 'SUSPEND_PLAYER',
  };

  // Stub kept for ActionModalsRenderer prop compatibility (not used in LeagueOffice flow)
  const handlePersonSelected = (contacts: any[], reason?: string, amount?: number, location?: string, duration?: string) => {};

  const handleActionSelect = (actionType: PersonnelActionType) => {
    if (!selectedPersonnel) return;

    if (actionType === 'view_bio') {
      setViewingBio(selectedPersonnel);
      setSelectedPersonnel(null);
      return;
    }

    if (actionType === 'contact') {
      setContactModalPerson({
        id: `personnel-${selectedPersonnel.id}`,
        name: selectedPersonnel.name,
        title: selectedPersonnel.jobTitle || selectedPersonnel.type,
        organization: selectedPersonnel.team || 'NBA League Office',
        type: selectedPersonnel.type,
        playerPortraitUrl: selectedPersonnel.playerPortraitUrl,
      });
      setSelectedPersonnel(null);
      return;
    }

    // Store the action + person, close the actions modal
    setDirectAction({
      type: actionType as any,
      person: selectedPersonnel,
    });
    setSelectedPersonnel(null);
  };

  return (
    <div className="h-full overflow-hidden p-4 md:p-8 flex flex-col bg-slate-950">

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="mb-8 flex-shrink-0">
        <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <span className="w-2 h-8 bg-indigo-500 rounded-full" />
          League Office
        </h2>
        <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
          <Building2 size={12} className="text-indigo-500" />
          Official Personnel Directory &amp; Operations Center
        </p>
      </div>

      {/* ── Searcher ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <LeagueOfficeSearcher onPersonnelClick={setSelectedPersonnel} />
      </div>

      {/* ── Actions modal ───────────────────────────────────── */}
      <PersonnelActionsModal
        person={selectedPersonnel}
        isOpen={!!selectedPersonnel}
        onClose={() => setSelectedPersonnel(null)}
        onActionSelect={handleActionSelect}
      />

      {/* ── Bio view overlay ────────────────────────────────── */}
      <AnimatePresence>
        {viewingBio && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingBio(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{   opacity: 0, scale: 0.95, y: 20  }}
              className="relative w-full max-w-4xl h-[88vh] bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <PersonnelBioView
                person={viewingBio}
                onBack={() => setViewingBio(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Direct action modal — pre-selects the chosen personnel */}
      {directAction && (
        <PersonSelectorModal
          title={
            directAction.type === 'contact'    ? 'Contact Person'    :
            directAction.type === 'bribe'      ? 'Offer Bribe'       :
            directAction.type === 'fine'       ? 'Levy Fine'         :
            directAction.type === 'dinner'     ? 'Invite to Dinner'  :
            directAction.type === 'movie'      ? 'Invite to Movie'   :
            'Suspend Personnel'
          }
          actionType={directAction.type}
          preSelectedContact={{
            id:               `personnel-${directAction.person.id}`,
            name:             directAction.person.name,
            title:            directAction.person.jobTitle || directAction.person.type,
            organization:     directAction.person.team || 'NBA League Office',
            type:             directAction.person.type as any,
            playerPortraitUrl: directAction.person.playerPortraitUrl,
          }}
          skipPersonSelection={true}
          onClose={() => setDirectAction(null)}
          onSelect={async (contacts, reason, amount, location, duration) => {
            const actionType = directAction!.type;
            setDirectAction(null);
            const dispatchType = ACTION_TYPE_MAP[actionType];
            if (!dispatchType) return;
            const targetNames = contacts.map((c: any) => c.name).join(', ');
            const targetRoles = contacts.map((c: any) => c.title).join(', ');
            const targetIds   = contacts.map((c: any) => c.id).join(',');
            let finalReason = reason || (actionType === 'movie' ? 'Movie Night' : 'No reason provided.');
            if (location) finalReason += ` at ${location}`;
            await dispatchAction({
              type: dispatchType as any,
              payload: {
                targetName: targetNames,
                targetRole:  targetRoles,
                targetId:    targetIds,
                reason:      finalReason,
                amount,
                duration,
                count:    contacts.length,
                subType:  actionType,
                location,
                contacts,
              },
            });
          }}
        />
      )}

      {contactModalPerson && (
        <ContactModal
          contact={contactModalPerson}
          onClose={() => setContactModalPerson(null)}
          onSend={async ({ message }: { message: string }) => {
            const chat = state.chats.find(c =>
              c.participants.includes(contactModalPerson.id) &&
              c.participants.includes('commissioner')
            );
            await dispatchAction({
              type: 'SEND_CHAT_MESSAGE',
              payload: {
                chatId: chat?.id,
                text: message,
                targetId: contactModalPerson.id,
                targetName: contactModalPerson.name,
                targetRole: contactModalPerson.title,
                targetOrg: contactModalPerson.organization || 'NBA League Office',
                avatarUrl: contactModalPerson.playerPortraitUrl,
              }
            });
            setContactModalPerson(null);
          }}
          isLoading={state.isProcessing}
        />
      )}

      <ActionModalsRenderer
        modals={modals}
        state={state}
        handlePersonSelected={handlePersonSelected}
        handleCitySelectionConfirm={() => {}}
        handleCelebrityRosterConfirm={() => {}}
        handleAction={async () => {}}
        handleSendMessage={async () => {}}
        handleAnnouncementSubmit={async () => {}}
        executeConfirmedAction={async () => {}}
      />
    </div>
  );
};