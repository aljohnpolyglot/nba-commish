import { useMemo, useState } from 'react';
import { Check, Lock, Radio, X } from 'lucide-react';
import type { BroadcastOffer, GameState } from '../../types';
import {
  buildBroadcastOffers,
  getBroadcastAgreementSeasonStart,
  resolveBroadcastPartnerLogoUrl,
} from '../../data/historicalBroadcastRights';
import { isHistoricalBroadcastMode } from '../../services/commissionerTasks/taskResolution';
import {
  FICTIONAL_BROADCASTER_BADGE,
  getBroadcasterDisplayName,
} from '../../utils/broadcastingUtils';
import { formatExternalSalary } from '../../constants';

interface Props {
  state: GameState;
  onClose: () => void;
  onConfirm: (offer: BroadcastOffer) => void;
}

const formatMoney = (value: number) => {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
};

const partnerLogo = (id: string) => resolveBroadcastPartnerLogoUrl(id, 96);

const NBA_MEDIA_CATEGORIES = [
  { id: 'openingweek', label: 'Opening Week' },
  { id: 'regularseason', label: 'National Windows' },
  { id: 'christmasdaygames', label: 'Christmas Games' },
  { id: 'nbacupinseason', label: 'In-Season Cup' },
  { id: 'allstarweekend', label: 'All-Star Weekend' },
  { id: 'playintournament', label: 'Play-In Tournament' },
  { id: 'playoffsround1', label: 'Early Playoffs' },
  { id: 'conferencefinals', label: 'Conference Finals' },
  { id: 'nbafinals', label: 'League Finals' },
  { id: 'nbadraft', label: 'Draft & Lottery' },
  { id: 'digitalrights', label: 'Digital & Streaming' },
] as const;

const PBA_MEDIA_CATEGORIES = [
  { id: 'openingweek', label: 'Season Opening' },
  { id: 'regularseason', label: 'Philippine Cup' },
  { id: 'christmasdaygames', label: "Commissioner's Cup" },
  { id: 'nbacupinseason', label: "Governors' Cup" },
  { id: 'allstarweekend', label: 'PBA All-Star' },
  { id: 'playintournament', label: 'Quarterfinals' },
  { id: 'playoffsround1', label: 'Semifinals' },
  { id: 'conferencefinals', label: 'Conference Finals' },
  { id: 'nbafinals', label: 'Grand Finals' },
  { id: 'nbadraft', label: 'PBA Draft' },
  { id: 'digitalrights', label: 'Digital & Streaming' },
] as const;

function recommendedPartner(offer: BroadcastOffer, categoryId: string, categoryIndex: number): string {
  const ids = offer.partnerIds.length > 0 ? offer.partnerIds : ['leaguepass'];
  if (ids.includes('espn') && ['christmasdaygames', 'nbafinals', 'nbadraft'].includes(categoryId)) return 'espn';
  if (ids.includes('nbc') && ['openingweek', 'allstarweekend', 'conferencefinals'].includes(categoryId)) return 'nbc';
  if (ids.includes('amazon') && ['digitalrights', 'regularseason', 'nbacupinseason', 'playintournament'].includes(categoryId)) return 'amazon';
  if (ids.includes('tnt') && ['allstarweekend', 'playoffsround1', 'conferencefinals'].includes(categoryId)) return 'tnt';
  return ids[Math.max(0, categoryIndex) % ids.length];
}

export function MediaRightsTaskPanel({ state, onClose, onConfirm }: Props) {
  const offers = useMemo(() => buildBroadcastOffers(state), [state]);
  const historicalLocked = isHistoricalBroadcastMode(state);
  const agreementSeasonStart = getBroadcastAgreementSeasonStart(state);
  const isFictional = state.leagueType === 'fictional';
  const isPba = state.leagueStats.uiMode === 'pba_isolated';
  const mediaCategories = isPba ? PBA_MEDIA_CATEGORIES : NBA_MEDIA_CATEGORIES;
  const offerMoney = (value: number) => isPba ? formatExternalSalary(value, 'PBA') : formatMoney(value);
  const defaultOffer = offers.find(offer => offer.historical) ?? offers[0];
  const [selectedId, setSelectedId] = useState(defaultOffer?.id ?? '');
  const [assignments, setAssignments] = useState<Record<string, Record<string, string>>>({});
  const selected = offers.find(offer => offer.id === selectedId) ?? defaultOffer;
  const selectedAssignments = selected
    ? Object.fromEntries(mediaCategories.map((category, index) => [
        category.id,
        assignments[selected.id]?.[category.id] ?? recommendedPartner(selected, category.id, index),
      ]))
    : {};
  const displayPartners = (offer: BroadcastOffer) =>
    offer.partnerIds.map(id => getBroadcasterDisplayName(id, isFictional));
  const displayOfferName = (offer: BroadcastOffer) =>
    isFictional ? `${displayPartners(offer).join(' + ')} Package` : offer.name;

  const finalize = () => {
    if (!selected) return;
    const phaseAssignments: Record<string, string[]> = {
      preseason: [selectedAssignments.openingweek],
      openingweek: [selectedAssignments.openingweek],
      regularseason: [selectedAssignments.regularseason],
      christmasdaygames: [selectedAssignments.christmasdaygames],
      nbacupinseason: [selectedAssignments.nbacupinseason],
      allstarweekend: [selectedAssignments.allstarweekend],
      playintournament: [selectedAssignments.playintournament],
      playoffsround1: [selectedAssignments.playoffsround1],
      playoffsround2: [selectedAssignments.playoffsround1],
      conferencefinals: [selectedAssignments.conferencefinals],
      nbafinals: [selectedAssignments.nbafinals],
      nbadraft: [selectedAssignments.nbadraft],
      nbadraftlottery: [selectedAssignments.nbadraft],
      digitalrights: [selectedAssignments.digitalrights],
    };
    const scheduleAssignments = Object.fromEntries(
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map(day => [day, [selectedAssignments.regularseason]]),
    );
    onConfirm({
      ...selected,
      name: displayOfferName(selected),
      partners: displayPartners(selected),
      phaseAssignments,
      scheduleAssignments,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300">{isPba ? 'PBA media package' : 'National package'}</p>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white">{isPba ? 'PBA Media Rights Renewal' : 'Media Rights Renewal'}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              {isPba
                ? "Choose the coverage partners for the Philippine, Commissioner's and Governors' Cups, PBA All-Star, playoffs, Draft and digital rights."
                : 'One agreement controls national windows, Christmas, All-Star Weekend, playoffs, Finals, Draft and streaming rights through one shared expiration.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20} /></button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_300px]">
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {historicalLocked && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                <Lock size={18} className="shrink-0 text-amber-300" />
                Historical broadcasts are active. The authentic package is installed automatically and cannot be replaced in this timeline.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {offers.map(offer => {
                const active = selected?.id === offer.id;
                const lockedOut = historicalLocked && !offer.historical;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    disabled={lockedOut}
                    onClick={() => setSelectedId(offer.id)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      active ? 'border-indigo-400 bg-indigo-500/15' : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                    } disabled:cursor-not-allowed disabled:opacity-35`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex -space-x-2">
                          {offer.partnerIds.slice(0, 3).map(id => {
                            const logo = isFictional ? null : partnerLogo(id);
                            const badge = FICTIONAL_BROADCASTER_BADGE[id];
                            return isFictional && badge ? (
                              <div
                                key={id}
                                className={`flex h-9 w-9 items-center justify-center border border-slate-700 text-[8px] ${badge.bg} ${badge.text} ${badge.shape} ${badge.font}`}
                              >
                                {badge.initials}
                              </div>
                            ) : logo ? (
                              <img key={id} src={logo} alt="" className="h-9 w-9 rounded-xl border border-slate-700 bg-white object-contain p-1" />
                            ) : (
                              <div key={id} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-[8px] font-black uppercase text-white">
                                {id.slice(0, 3)}
                              </div>
                            );
                          })}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{displayOfferName(offer)}</p>
                          <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">{displayPartners(offer).join(' + ')}</p>
                        </div>
                      </div>
                      {active ? <Check size={17} className="shrink-0 text-indigo-300" /> : <Radio size={17} className="shrink-0 text-slate-700" />}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-slate-500">Annual</span><p className="font-black text-emerald-300">{offerMoney(offer.annualValueUSD)}</p></div>
                      <div><span className="text-slate-500">Total</span><p className="font-black text-emerald-300">{offerMoney(offer.annualValueUSD * offer.years)}</p></div>
                      <div><span className="text-slate-500">Term</span><p className="font-black text-white">{offer.years} year{offer.years === 1 ? '' : 's'}</p></div>
                      <div><span className="text-slate-500">Reach</span><p className="font-black text-white">{offer.reach}</p></div>
                      <div><span className="text-slate-500">Approval</span><p className="font-black text-white">{offer.approval}</p></div>
                      <div><span className="text-slate-500">Specialty</span><p className="font-black text-white">{offer.specialty}</p></div>
                    </div>
                    {offer.partnerIds.includes('streameast') && (
                      <p className="mt-3 text-[10px] font-bold leading-relaxed text-rose-300">
                        Novelty offer: no rights fee, extreme reach and severe legal, security and integrity exposure.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="max-h-full overflow-y-auto border-t border-white/10 bg-slate-900/60 p-5 custom-scrollbar lg:border-l lg:border-t-0">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Selected agreement</p>
            <h3 className="mt-2 text-lg font-black text-white">{selected ? displayOfferName(selected) : 'No offer'}</h3>
            <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-500">Annual value</span><span className="font-black text-emerald-300">{offerMoney(selected?.annualValueUSD ?? 0)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Total value</span><span className="font-black text-emerald-300">{offerMoney((selected?.annualValueUSD ?? 0) * (selected?.years ?? 0))}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Reach</span><span className="font-black text-white">{selected?.reach ?? 0}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Approval</span><span className="font-black text-white">{selected?.approval ?? 0}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Profile</span><span className="text-right font-black text-white">{selected?.partnerType} · {selected?.specialty}</span></div>
              <div className="flex justify-between gap-3"><span className="text-slate-500">Shared expiry</span><span className="font-black text-white">{agreementSeasonStart + Math.max(1, selected?.years ?? 1) - 1}</span></div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Category assignments</p>
              {mediaCategories.map(category => (
                <label key={category.id} className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {category.label}
                  <select
                    disabled={historicalLocked || !selected || selected.partnerIds.length <= 1}
                    value={selectedAssignments[category.id] ?? ''}
                    onChange={event => selected && setAssignments(previous => ({
                      ...previous,
                      [selected.id]: {
                        ...(previous[selected.id] ?? {}),
                        [category.id]: event.target.value,
                      },
                    }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs normal-case text-white disabled:opacity-60"
                  >
                    {(selected?.partnerIds.length ? selected.partnerIds : ['leaguepass']).map((id, index) => (
                      <option key={id} value={id}>
                        {isFictional ? getBroadcasterDisplayName(id, true) : selected?.partners[index] ?? id}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={!selected}
              onClick={finalize}
              className="mt-5 w-full rounded-2xl bg-indigo-500 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {historicalLocked ? 'Install Historical Default' : 'Finalize Agreement'}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
