import { useState, type ReactNode } from 'react';
import { AlertTriangle, Check, MapPin } from 'lucide-react';
import type { GameState } from '../../types';
import { getAllStarHostDecisionYear } from '../../services/allStar/hostAutoResolver';
import { buildOwnerCoachChatContacts } from '../../services/staff/historicalChatContacts';
import { getTeamFullName } from '../../utils/teamNames';
import { AllStarHostPickerModal, type HostDraft } from '../seasonal/AllStarHostPickerModal';
import { PbaAllStarVenuePickerModal } from './PbaAllStarVenuePickerModal';

interface Props {
  state: GameState;
  onClose: () => void;
  onCommit: (hosts: HostDraft[]) => Promise<void>;
}

interface Acknowledgement {
  ownerName: string;
  roleLabel: string;
  teamName: string;
  teamLogoUrl?: string;
  city: string;
  year: number;
}

const AcknowledgementShell = ({ children }: { children: ReactNode }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
    <div className="w-full max-w-lg rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
      {children}
    </div>
  </div>
);

export function AllStarHostTaskFlow({ state, onClose, onCommit }: Props) {
  const isPba = state.leagueStats.uiMode === 'pba_isolated';
  const [submitting, setSubmitting] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState<Acknowledgement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmHost = async (hosts: HostDraft[]) => {
    if (submitting) return;
    const decisionYear = isPba ? state.leagueStats.year : getAllStarHostDecisionYear(state.leagueStats);
    const host = hosts.find(candidate => candidate.year === decisionYear);
    const team = state.teams.find(candidate => candidate.id === host?.teamIds[0]);
    const teamName = isPba
      ? host?.arena || host?.city || 'the host venue'
      : team ? getTeamFullName(team) : host?.city || 'the host city';
    const owner = team
      ? buildOwnerCoachChatContacts(state).find(contact => contact.league === 'Owner' && contact.org === teamName)
      : undefined;
    setSubmitting(true);
    setError(null);
    try {
      await onCommit(hosts);
      setAcknowledgement({
        ownerName: isPba ? 'PBA Events Office' : owner?.name ?? `${teamName} Ownership Group`,
        roleLabel: isPba ? 'Venue' : 'Owner',
        teamName,
        teamLogoUrl: team?.logoUrl,
        city: host?.city || teamName,
        year: host?.year ?? decisionYear,
      });
    } catch {
      setError('The host assignment could not be saved. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <AcknowledgementShell>
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
          <AlertTriangle size={28} />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white">Host Not Confirmed</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{error}</p>
          <div className="mt-7 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/15 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-emerald-400"
            >
              Try Again
            </button>
          </div>
        </div>
      </AcknowledgementShell>
    );
  }

  if (acknowledgement) {
    return (
      <AcknowledgementShell>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/15 text-emerald-300">
          {acknowledgement.teamLogoUrl
            ? <img src={acknowledgement.teamLogoUrl} alt={acknowledgement.teamName} className="h-12 w-12 object-contain" referrerPolicy="no-referrer" />
            : <Check size={28} />}
        </div>
        <div className="text-center">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Host Confirmed</div>
          <h2 className="text-2xl font-black text-white">{acknowledgement.ownerName}</h2>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">{acknowledgement.roleLabel} · {acknowledgement.teamName}</p>
          <p className="mx-auto mt-6 max-w-sm text-sm leading-6 text-slate-300">
            “Thank you for trusting us with All-Star Weekend {acknowledgement.year}. We’re honored to welcome the league to {acknowledgement.city}.”
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-emerald-400"
          >
            Continue to Next Task
          </button>
        </div>
      </AcknowledgementShell>
    );
  }

  if (submitting) {
    return (
      <AcknowledgementShell>
        <div className="flex items-center justify-center gap-3 py-8 text-sm font-bold text-slate-300">
          <MapPin size={18} className="text-emerald-400" />
          Confirming host…
        </div>
      </AcknowledgementShell>
    );
  }

  if (isPba) {
    return (
      <PbaAllStarVenuePickerModal
        seasonYear={state.leagueStats.year}
        onClose={onClose}
        onConfirm={venue => {
          const hosts: HostDraft[] = [
            ...(state.leagueStats.allStarHosts ?? [])
              .filter(host => host.year !== state.leagueStats.year)
              .map(host => ({ ...host, arena: host.arena ?? '', teamIds: host.teamIds ?? [] })),
            {
              year: state.leagueStats.year,
              city: venue.city,
              arena: venue.name,
              teamIds: [],
            },
          ].sort((left, right) => left.year - right.year);
          void confirmHost(hosts);
        }}
      />
    );
  }

  return <AllStarHostPickerModal onClose={onClose} onConfirm={hosts => void confirmHost(hosts)} />;
}
