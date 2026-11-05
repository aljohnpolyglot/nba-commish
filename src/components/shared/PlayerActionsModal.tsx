import React, { useState } from 'react';
import { Crosshair, X, Handshake, HeartPulse, Plane, Repeat, RotateCcw, Send, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { NBAPlayer } from '../../types';
import { PERSON_ACTION_DEFS, isPlayerEligible } from '../../data/personActionDefs';
import { useGame } from '../../store/GameContext';
import { MyFace, isRealFaceConfig } from './MyFace';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';
import { getPlayerImage } from '../../utils/playerImage';
import { computeAge } from '../../utils/helpers';
import { isOnRoster, resolveAnyTeam } from '../../utils/teamLookup';
import { isTransferWindowOpen } from '../../utils/transferWindow';
import { getTwoWayRosterLimit } from '../../utils/rosterLimits';
import { getLoanOutCandidates } from '../../services/transfer/loanMarket';
import { isTransferMarketEligibleTeam } from '../../services/transfer/marketEligibility';
import { SettingsManager } from '../../services/SettingsManager';
import { getTradingBlock } from '../../store/tradingBlockStore';
import { areTwoWayContractsEnabled } from '../../utils/contractTypes';
import { eurostashPlayer, getEurostashEligibility } from '../../services/freeAgency/eurostashRights';
import { getReturnHomeSigningEligibility, signRetireeWithHomeClub } from '../../services/retirement/returnHomeSigning';
import { isUnavailableInternationalTournamentPlayer } from '../../utils/prospectUtils';

interface PlayerActionsModalProps {
  player: NBAPlayer;
  onClose: () => void;
  onActionSelect: (actionType: string) => void;
  onHeal?: () => void;
  context?: 'default' | 'draft-scouting' | 'retirement-review';
}

const MODAL_ACTION_IDS = [
  'view_bio',
  'view_scouting',
  'view_ratings',
  'contact',
  'endorse_hof',
  'sign_player',
  'resign_player',
  'sign_guaranteed',
  'convert_to_guaranteed',
  'convert_to_twoway',
  'trade_player',
  'fine',
  'drug_test',
  'dinner',
  'movie',
  'suspension',
  'waive',
  'sabotage',
  'hypnotize',
];

const GM_HIDDEN_ACTIONS = new Set(['fine', 'drug_test', 'suspension', 'sabotage']);
const PBA_HIDDEN_ACTIONS = new Set(['sign_guaranteed', 'convert_to_guaranteed', 'convert_to_twoway', 'trade_player']);

export const PlayerActionsModal: React.FC<PlayerActionsModalProps> = ({ player, onClose, onActionSelect, onHeal, context = 'default' }) => {
  const { state, dispatchAction } = useGame();
  const isGM = state.gameMode === 'gm';
  const godModeEnabled = state.godModeEnabled === true;
  const [confirmingHeal, setConfirmingHeal] = useState(false);
  const [healComplete, setHealComplete] = useState(false);
  const [confirmingEurostash, setConfirmingEurostash] = useState(false);
  const [confirmingReturnHome, setConfirmingReturnHome] = useState(false);
  const isInjured = (player as any)?.injury?.gamesRemaining > 0;
  const currentYear = state.leagueStats?.year ?? new Date().getUTCFullYear();
  const userTeamId = isGM ? state.userTeamId ?? null : null;
  const euroIsolated = isEuroIsolatedMode(state);
  const pbaIsolated = isPbaIsolatedMode(state);
  const twoWayContractsEnabled = getTwoWayRosterLimit(state.leagueStats as any) > 0 && areTwoWayContractsEnabled(state.leagueStats);
  const playerAge = computeAge(player, currentYear);
  const isRawDraftProspect = player.tid === -2 || player.status === 'Draft Prospect' || player.status === 'Prospect';
  const isEuroAcademyPlayer =
    euroIsolated &&
    userTeamId != null &&
    player.tid === userTeamId &&
    !(player as any).promotedFromAcademy &&
    playerAge >= 15 &&
    playerAge <= 19;
  const isPbaImportPlayer =
    pbaIsolated &&
    player.status === 'PBA' &&
    (player.isImport || !!player.importConference || !!(player as any).pbaImportContract);
  const showTransferMarketAction =
    euroIsolated &&
    isGM &&
    userTeamId != null &&
    player.tid === userTeamId &&
    isOnRoster(player) &&
    isTransferWindowOpen(state.date, state.leagueStats) &&
    !(state.transferListings ?? []).some(listing => listing.status === 'active' && listing.playerId === player.internalId);
  const showTransferInquiryAction =
    euroIsolated &&
    isGM &&
    userTeamId != null &&
    player.tid !== userTeamId &&
    isOnRoster(player) &&
    isTransferMarketEligibleTeam(resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? [])) &&
    !(state.loanAgreements ?? []).some(agreement => agreement.status === 'active' && agreement.playerId === player.internalId);
  const showLoanMarketAction =
    euroIsolated &&
    isGM &&
    userTeamId != null &&
    getLoanOutCandidates(state, userTeamId).some(candidate => candidate.player.internalId === player.internalId);
  const faMarket = state.faBidding?.markets?.find(
    market => market.playerId === player.internalId && !market.resolved,
  );
  const hasUserBid = !!faMarket?.bids?.some(bid => bid.status === 'active' && bid.isUserBid);
  const hasOffers = !!faMarket?.bids?.some(bid => bid.status === 'active') || hasUserBid;
  const showContactAgent =
    !isUnavailableInternationalTournamentPlayer(player)
    && (context === 'draft-scouting'
    || (!euroIsolated
    && (
      player.tid === -1
      || player.status === 'Free Agent'
      || (pbaIsolated && !!(player as any).pbaLocalEligible)
    )));
  const canReplaceAllStar =
    !isGM
    && !euroIsolated
    && !pbaIsolated
    && isInjured
    && state.allStar?.reservesAnnounced === true
    && state.allStar.roster.some(entry =>
      entry.playerId === player.internalId
      && !entry.isInjuredDNP
      && !entry.isInjuryReplacement,
    );
  const targetTeam = resolveAnyTeam(player.tid, state.teams, state.nonNBATeams ?? []);
  const targetTeamLeague = String((targetTeam as any)?.league ?? '');
  const isPbaTarget = pbaIsolated && (targetTeamLeague === 'PBA' || (player.tid >= 2000 && player.tid < 3000));
  const isPrimaryLeagueTarget = !pbaIsolated
    && !euroIsolated
    && state.teams.some(team => team.id === player.tid);
  const targetEntry = userTeamId == null ? null : getTradingBlock(userTeamId);
  const isTradeTarget = !!targetEntry?.targetIds.includes(player.internalId);
  const targetListFull = !isTradeTarget && (targetEntry?.targetIds.length ?? 0) >= 10;
  const isHallOfFameBound = player.hof === true
    || (player.hofInductionYear != null && Number.isFinite(Number(player.hofInductionYear)))
    || (player.scheduledHofInductionYear != null && Number.isFinite(Number(player.scheduledHofInductionYear)))
    || (state.endorsedPlayers ?? []).includes(player.internalId);
  const showTradeTargetAction =
    isGM
    && userTeamId != null
    && player.tid !== userTeamId
    && isOnRoster(player)
    && (isPbaTarget || isPrimaryLeagueTarget)
    && state.leagueStats?.tradesAllowed !== false;
  const isOwnActiveRosterPlayer = isGM
    && userTeamId != null
    && player.tid === userTeamId
    && isOnRoster(player);
  const eurostash = getEurostashEligibility(state, player);
  const returnHome = context === 'retirement-review'
    ? getReturnHomeSigningEligibility(state, player)
    : { eligible: false, club: null };
  const actions = MODAL_ACTION_IDS
    .map(id => PERSON_ACTION_DEFS.find(def => def.id === id))
    .filter((def): def is NonNullable<typeof def> => !!def)
    .filter(def => context !== 'draft-scouting' || def.id === 'view_bio' || def.id === 'view_scouting')
    .filter(def => isPlayerEligible(player, def.eligibility, { currentYear, userTeamId, euroIsolated, pbaIsolated }))
    .filter(def => !((euroIsolated || pbaIsolated) && def.id === 'trade_player'))
    .filter(def => !(pbaIsolated && PBA_HIDDEN_ACTIONS.has(def.id)))
    .filter(def => !(isPbaImportPlayer && def.id === 'resign_player'))
    .filter(def => !(pbaIsolated && def.id === 'view_scouting' && !isRawDraftProspect))
    .filter(def => !(isEuroAcademyPlayer && def.id === 'view_scouting'))
    .filter(def => def.id !== 'convert_to_twoway' || twoWayContractsEnabled)
    .filter(def => def.id !== 'hypnotize' || (godModeEnabled && SettingsManager.getSettings().enableLLM))
    .filter(def => def.id !== 'endorse_hof' || (!isGM && !isHallOfFameBound))
    .filter(def => !(!isGM && hasOffers && def.id === 'sign_player'))
    .filter(def => !isGM || !GM_HIDDEN_ACTIONS.has(def.id))
    .filter(def => !isGM || !['dinner', 'movie'].includes(def.id) || isOwnActiveRosterPlayer);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-actions-title"
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700 relative">
                {(() => {
                  const img = getPlayerImage(player);
                  const face = (player as any).face;
                  if (img) return <img src={img} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />;
                  if (isRealFaceConfig(face)) return <div className="absolute left-1/2 top-1/2" style={{ width: '85%', height: '127.5%', transform: 'translate(-50%, -50%)' }}><MyFace face={face} style={{ width: '100%', height: '100%' }} /></div>;
                  return <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">{player.name.charAt(0)}</div>;
                })()}
              </div>
              <div>
                <h3 id="player-actions-title" className="text-lg font-black uppercase tracking-tight text-white leading-none">{player.name}</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Select Action</p>
              </div>
            </div>
            <button aria-label="Close actions" onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          {confirmingReturnHome && returnHome.club ? (
            <div className="p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300"><RotateCcw size={30} /></div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-amber-400">International Signing</p>
              <h4 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Sign with {returnHome.club.name}?</h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{player.name} will leave the NBA and continue his career with his former club.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={() => setConfirmingReturnHome(false)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-slate-700">Cancel</button>
                <button onClick={async () => { await dispatchAction({ type: 'UPDATE_STATE', payload: signRetireeWithHomeClub(state, player.internalId) } as any); onClose(); }} className="min-h-11 rounded-xl bg-amber-400 px-4 text-xs font-black uppercase tracking-widest text-black hover:bg-amber-300">Confirm Signing</button>
              </div>
            </div>
          ) : confirmingEurostash && eurostash.club ? (
            <div className="p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-sky-400/40 bg-sky-400/10 text-sky-300"><Plane size={30} /></div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-sky-400">Eurostash</p>
              <h4 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Return to {eurostash.club.name}?</h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">His rookie contract ends and he leaves your roster and payroll. You retain exclusive NBA draft rights and may trade those rights or sign him later.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button onClick={() => setConfirmingEurostash(false)} className="min-h-11 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-slate-700">Cancel</button>
                <button onClick={async () => { await dispatchAction({ type: 'UPDATE_STATE', payload: eurostashPlayer(state, player.internalId) } as any); onClose(); }} className="min-h-11 rounded-xl bg-sky-500 px-4 text-xs font-black uppercase tracking-widest text-sky-950 hover:bg-sky-400">Confirm Eurostash</button>
              </div>
            </div>
          ) : healComplete ? (
            <div className="p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                <HeartPulse size={30} />
              </div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">God Mode Action</p>
              <h4 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{player.name} Healed</h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">The injury has been cleared and the player is available immediately.</p>
              <button onClick={onClose} className="mt-6 min-h-11 w-full rounded-xl bg-emerald-500 px-4 text-xs font-black uppercase tracking-widest text-emerald-950 hover:bg-emerald-400">
                Done
              </button>
            </div>
          ) : confirmingHeal ? (
            <div className="p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                <HeartPulse size={30} />
              </div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Power of God</p>
              <h4 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Heal {player.name}?</h4>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                This immediately clears the current injury and makes the player available.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConfirmingHeal(false)}
                  className="min-h-11 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-black uppercase tracking-widest text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onHeal?.();
                    setConfirmingHeal(false);
                    setHealComplete(true);
                  }}
                  className="min-h-11 rounded-xl border border-emerald-400/50 bg-emerald-500 px-4 text-xs font-black uppercase tracking-widest text-emerald-950 hover:bg-emerald-400"
                >
                  Confirm Heal
                </button>
              </div>
            </div>
          ) : (
          <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {returnHome.eligible && returnHome.club && (
              <button
                onClick={() => setConfirmingReturnHome(true)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-left transition-colors hover:bg-amber-400/10"
              >
                <div className="rounded-xl bg-amber-400/20 p-3 text-amber-200"><RotateCcw size={20} /></div>
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider text-amber-100">Sign with {returnHome.club.name}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">Leave the NBA and continue his career back home.</p>
                </div>
              </button>
            )}
            {eurostash.eligible && eurostash.club && (
              <button
                onClick={() => setConfirmingEurostash(true)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-sky-400/30 bg-sky-400/5 hover:bg-sky-400/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-sky-400/20 text-sky-200"><Plane size={20} /></div>
                <div>
                  <h4 className="text-sm font-bold text-sky-100 uppercase tracking-wider">Eurostash</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Return to {eurostash.club.name} and retain exclusive NBA draft rights.</p>
                </div>
              </button>
            )}
            {canReplaceAllStar && (
              <button
                onClick={() => onActionSelect('replace_all_star')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-rose-500/20 text-rose-300">
                  <Repeat size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-200 uppercase tracking-wider">Replace All-Star</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Choose an eligible replacement for the injured All-Star roster spot.</p>
                </div>
              </button>
            )}
            {showTradeTargetAction && (
              <button
                onClick={() => !targetListFull && onActionSelect(isTradeTarget ? 'remove_trade_target' : 'add_trade_target')}
                disabled={targetListFull}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-indigo-400/30 bg-indigo-400/5 hover:bg-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-indigo-400/20 text-indigo-200">
                  <Crosshair size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-indigo-100 uppercase tracking-wider">
                    {isTradeTarget ? 'Remove from Target List' : targetListFull ? 'Target List Full' : 'Add to Target List'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isTradeTarget
                      ? 'Stop tracking this player as a trade target.'
                      : 'Track this player in your Trade Hub.'}
                  </p>
                </div>
              </button>
            )}
            {isInjured && onHeal && godModeEnabled && (
              <button
                onClick={() => setConfirmingHeal(true)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-emerald-700/50 bg-emerald-950/30 hover:bg-emerald-900/40 transition-all text-left group"
              >
                <div className="p-3 rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 transition-colors">
                  <HeartPulse size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Heal Player</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Use God Mode to clear this injury immediately.</p>
                </div>
              </button>
            )}
            {showContactAgent && (
              <button
                onClick={() => onActionSelect(context === 'draft-scouting' ? 'contact_agent' : 'view_fa_offers')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-300 uppercase tracking-wider">Contact Agent</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {context === 'draft-scouting'
                      ? `Ask about ${player.name}'s background and draft plans.`
                      : `Review the market and talk with ${player.name}'s Agent`}
                  </p>
                </div>
              </button>
            )}
            {showTransferInquiryAction && (
              <button
                onClick={() => onActionSelect('inquire_transfer')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-amber-500/20 text-amber-300">
                  <Handshake size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-200 uppercase tracking-wider">Inquire About Transfer</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isTransferWindowOpen(state.date, state.leagueStats)
                      ? 'Ask the club what it would take to sign this player.'
                      : 'The transfer window is currently closed.'}
                  </p>
                </div>
              </button>
            )}
            {showTransferMarketAction && (
              <button
                onClick={() => onActionSelect('open_transfer_market')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-rose-500/20 text-rose-300">
                  <Repeat size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-rose-200 uppercase tracking-wider">Transfer Market</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Open the transfer listing flow for this player.</p>
                </div>
              </button>
            )}
            {showLoanMarketAction && (
              <button
                onClick={() => onActionSelect('open_loan_market')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 transition-all text-left group"
              >
                <div className="p-3 rounded-xl bg-sky-500/20 text-sky-300">
                  <Send size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-sky-200 uppercase tracking-wider">List For Loan</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Invite loan offers for this reserve player.</p>
                </div>
              </button>
            )}
            {actions.map(action => {
              const isEuroExtension = euroIsolated && action.id === 'resign_player';
              const isGodModeRatings = godModeEnabled && action.id === 'view_ratings';
              return (
                <button
                  key={action.id}
                  onClick={() => onActionSelect(action.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-800 transition-all text-left group"
                >
                  <div className={`p-3 rounded-xl text-white ${action.color} ${action.hover} transition-colors`}>
                    <action.icon size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                      {isEuroExtension ? 'Extend Contract' : isGodModeRatings ? 'Edit Ratings' : action.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isEuroExtension
                        ? 'Negotiate a new deal before the current contract expires.'
                        : isGodModeRatings
                          ? 'Review OVR ratings and make God Mode changes.'
                          : action.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
