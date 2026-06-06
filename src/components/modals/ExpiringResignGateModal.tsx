import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, Bot, CheckCircle, Eye, Users, X } from 'lucide-react';
import type { NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { computeAge, convertTo2KRating, formatCurrencyWithCode, getLeagueCurrencyCode } from '../../utils/helpers';
import { getDisplayPotential } from '../../utils/playerRatings';
import { getActiveLeagueTeams } from '../../utils/teamLookup';
import { PlayerPortrait } from '../shared/PlayerPortrait';

export type ResignIntentLabel = 'ready_to_extend' | 'open' | 'testing_market' | 'farewell' | 'not_expiring';

export interface ExpiringRow {
  player: NBAPlayer;
  intent: ResignIntentLabel;
  offerSalaryUSD: number;
  offerYears: number;
  resignBlockReason?: string;
}

interface ExpiringResignGateModalProps {
  isOpen: boolean;
  rows: ExpiringRow[];
  onAssistant: () => void;
  onManual: () => void;
  onDismiss: () => void;
  onMakeOffer: (playerId: string) => void;
  onReject: (playerId: string) => void;
  offeredIds: Set<string>;
  rejectedIds: Set<string>;
}

const intentBadge = (intent: ResignIntentLabel) => {
  switch (intent) {
    case 'ready_to_extend': return { text: 'You can sign now', cls: 'text-emerald-300', row: 'border-l-emerald-400' };
    case 'open':            return { text: 'Open to offer',    cls: 'text-sky-300',     row: 'border-l-sky-400' };
    case 'testing_market':  return { text: 'Testing FA',       cls: 'text-amber-300',   row: 'border-l-amber-400' };
    case 'farewell':        return { text: 'Retiring',         cls: 'text-rose-300',    row: 'border-l-rose-400' };
    default:                return { text: '',               cls: 'text-slate-500'   };
  }
};

const ratingTone = (rating: number) =>
  rating >= 88 ? 'text-emerald-300' :
  rating >= 80 ? 'text-sky-300' :
  rating >= 74 ? 'text-amber-300' :
  'text-slate-300';

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash) + value.charCodeAt(i);
  return Math.abs(hash);
};

const getLastSeasonLine = (player: NBAPlayer) => {
  const stats = (player.stats ?? [])
    .filter((s: any) => !s.playoffs && (s.gp ?? 0) > 0)
    .sort((a: any, b: any) => (b.season ?? 0) - (a.season ?? 0));
  const s: any = stats[0];
  if (!s) return 'No recent stats';
  const gp = Math.max(1, s.gp ?? 1);
  const pts = ((s.pts ?? 0) / gp).toFixed(1);
  const ast = ((s.ast ?? 0) / gp).toFixed(1);
  const trb = (((s.trb ?? 0) || ((s.orb ?? 0) + (s.drb ?? 0))) / gp).toFixed(1);
  return `${pts} PPG  ${trb} RPG  ${ast} APG`;
};

export const ExpiringResignGateModal: React.FC<ExpiringResignGateModalProps> = ({
  isOpen,
  rows,
  onAssistant,
  onManual,
  onDismiss,
  onMakeOffer,
  onReject,
  offeredIds,
  rejectedIds,
}) => {
  const { state } = useGame();
  const [confirmAssistant, setConfirmAssistant] = useState(false);
  const currency = getLeagueCurrencyCode(state.leagueStats);
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const teams = useMemo(
    () => state.leagueStats?.uiMode === 'euro_isolated' ? getActiveLeagueTeams(state as any) : state.teams,
    [state],
  );
  const willingRows = rows.filter(r => (r.intent === 'ready_to_extend' || r.intent === 'open') && !r.resignBlockReason);
  const totalMarket = rows.reduce((sum, r) => sum + r.offerSalaryUSD, 0);
  const hasRows = rows.length > 0;

  const interestTeamsFor = (player: NBAPlayer) => teams
    .filter((t: any) => t.id !== state.userTeamId && t.id !== player.tid)
    .map((team: any) => {
      const samePosCount = state.players.filter((p: any) => p.tid === team.id && p.pos === player.pos).length;
      const gp = (team.wins ?? 0) + (team.losses ?? 0);
      const winPct = gp > 0 ? (team.wins ?? 0) / gp : 0.5;
      const need = Math.max(0, 4 - samePosCount) * 12;
      const score = need + winPct * 10 + (hashString(`${player.internalId}-${team.id}`) % 40);
      return { team, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.team);

  return (
    <AnimatePresence>
      {isOpen && (
      <div className="fixed inset-0 z-[114] flex items-center justify-center p-4 md:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
          onClick={onDismiss}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-indigo-500/30 bg-slate-950 shadow-2xl"
        >
          <div className="flex flex-col gap-4 border-b border-white/10 bg-slate-900/70 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl border border-indigo-400/40 bg-indigo-500/15 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-indigo-300" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Expiring Contracts</h3>
                <p className="text-sm text-slate-300 mt-1 max-w-xl">
                  Make early offers to players who are willing now. Players testing the market can only be signed once free agency opens.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Expiring" value={String(rows.length)} />
              <Kpi label="Can Sign" value={String(willingRows.length)} tone="text-emerald-300" />
              <Kpi label="Test FA" value={String(rows.length - willingRows.length)} tone="text-amber-300" />
              <Kpi label="Total Salary" value={formatCurrencyWithCode(totalMarket, currency, false)} tone="text-violet-300" />
            </div>
            <button onClick={onDismiss} className="absolute right-5 top-5 text-slate-500 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto p-4 md:p-6">
            <div className="mb-4 hidden lg:grid grid-cols-[minmax(260px,1.35fr)_120px_150px_180px_190px] gap-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <span>Player</span>
              <span>OVR / POT</span>
              <span>Asking</span>
              <span>Interest Teams</span>
              <span>Status</span>
            </div>
            <div className="mb-5 max-h-[52vh] divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] sm:max-h-[56vh]">
              {!hasRows ? (
                <div className="px-5 py-10 text-center">
                  <div className="text-lg font-black uppercase tracking-tight text-white">No contract talks to handle</div>
                  <p className="mt-2 text-sm text-slate-400 max-w-xl mx-auto">
                    There are no current offseason expiring contracts on your roster that need a talks decision here.
                  </p>
                </div>
              ) : rows.map(({ player, intent, offerSalaryUSD, offerYears, resignBlockReason }) => {
                const offered = offeredIds.has(player.internalId);
                const rejected = rejectedIds.has(player.internalId);
                const decided = offered || rejected;
                const willingToSign = (intent === 'ready_to_extend' || intent === 'open') && !resignBlockReason;
                const badge = intentBadge(intent);
                const ratings = player.ratings?.[player.ratings.length - 1] ?? {};
                const ovr = convertTo2KRating(player.overallRating ?? ratings.ovr ?? 60, ratings.hgt ?? 50, ratings.tp);
                const pot = getDisplayPotential(player, currentYear, currentYear, { floorAtEstimated: true });
                const interestTeams = interestTeamsFor(player);
                const visibleInterest = interestTeams.slice(0, 3);
                const age = computeAge(player, currentYear);
                return (
                  <div key={player.internalId} className={`grid gap-3 border-l-4 px-4 py-3 ${badge.row ?? 'border-l-slate-700'} lg:grid-cols-[minmax(260px,1.35fr)_120px_150px_180px_190px] lg:items-center`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerPortrait
                        imgUrl={player.imgURL}
                        face={(player as any).face}
                        playerName={player.name}
                        overallRating={player.overallRating}
                        ratings={player.ratings}
                        size={52}
                      />
                      <div className="min-w-0">
                        <div className="font-black text-white truncate">{player.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {[player.pos ?? 'G', `${age} yrs`, getLastSeasonLine(player)].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    </div>
                    <div className="grid w-full max-w-[160px] grid-cols-2 gap-2">
                      <RatingBox label="OVR" value={ovr} tone={ratingTone(ovr)} />
                      <RatingBox label="POT" value={pot} tone={ratingTone(pot)} />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Asking Price</div>
                      <div className="text-sm font-black text-white tabular-nums">{formatCurrencyWithCode(offerSalaryUSD, currency, false)}</div>
                      <div className="text-[10px] text-slate-500">{offerYears} year{offerYears === 1 ? '' : 's'}</div>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
                      {visibleInterest.map((team: any) => (
                        team.logoUrl ? (
                          <img key={team.id} src={team.logoUrl} alt={team.abbrev ?? team.name} title={team.name} className="w-7 h-7 rounded-full bg-slate-900 border border-white/10 object-contain p-0.5" />
                        ) : (
                          <span key={team.id} title={team.name} className="w-7 h-7 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[9px] font-black text-slate-300">
                            {team.abbrev ?? team.name?.slice(0, 3)}
                          </span>
                        )
                      ))}
                      {interestTeams.length > visibleInterest.length && (
                        <span className="w-7 h-7 rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-400">
                          +{interestTeams.length - visibleInterest.length}
                        </span>
                      )}
                    </div>
                    {decided ? (
                      <span className={`shrink-0 text-[10px] font-black uppercase tracking-widest px-2 py-1 ${offered ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {offered ? 'Offered' : 'Letting Walk'}
                      </span>
                    ) : resignBlockReason ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                          Salary restricted
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {resignBlockReason}
                        </span>
                      </div>
                    ) : willingToSign ? (
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() => onMakeOffer(player.internalId)}
                          className="rounded-md border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/30"
                        >
                          Make Offer
                        </button>
                        <button
                          onClick={() => onReject(player.internalId)}
                          className="rounded-md border border-rose-500/30 bg-rose-500/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-300 transition-colors hover:bg-rose-500/25"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-300">
                        <Bell size={14} />
                        {badge.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              {(() => {
                const total = rows.length;
                const decidedCount = rows.filter(r =>
                  offeredIds.has(r.player.internalId) ||
                  rejectedIds.has(r.player.internalId) ||
                  !!r.resignBlockReason ||
                  !(r.intent === 'ready_to_extend' || r.intent === 'open')
                ).length;
                // Make Offer dispatches SIGN_FREE_AGENT which bumps contract.exp,
                // dropping the player from the rows memo. Treat empty-with-decisions
                // as all-done so the button collapses to Done.
                const anyDecisions = offeredIds.size + rejectedIds.size > 0;
                const allDone = total === 0 || (total > 0 && decidedCount === total);
                if (allDone) {
                  return (
                    <button
                      onClick={onAssistant}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <CheckCircle size={14} />
                      Done
                    </button>
                  );
                }
                return (
                  <>
                    <button
                      onClick={() => setConfirmAssistant(true)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-500 hover:bg-indigo-400 text-black rounded-xl font-black uppercase tracking-widest text-xs transition-colors"
                    >
                      <Bot size={14} />
                      Assistant GM: Offer All Willing
                    </button>
                    <button
                      onClick={onManual}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white/8 hover:bg-white/12 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors border border-white/10"
                    >
                      <Eye size={14} />
                      Review Manually
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
          <AnimatePresence>
            {confirmAssistant && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.96, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.96, y: 12 }}
                  className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-indigo-400/30 bg-slate-950 shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
                        <Bot size={20} className="text-indigo-300" />
                      </div>
                      <div>
                        <h4 className="text-white font-black uppercase tracking-tight">Confirm Assistant Offers</h4>
                        <p className="text-xs text-slate-400">The assistant will send offers to all currently willing players.</p>
                      </div>
                    </div>
                    <button onClick={() => setConfirmAssistant(false)} className="text-slate-500 hover:text-white transition-colors">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="rounded-xl border border-white/10 divide-y divide-white/10 overflow-hidden mb-4">
                      {willingRows.map(row => {
                        const ratings = row.player.ratings?.[row.player.ratings.length - 1] ?? {};
                        const ovr = convertTo2KRating(row.player.overallRating ?? ratings.ovr ?? 60, ratings.hgt ?? 50, ratings.tp);
                        const pot = getDisplayPotential(row.player, currentYear, currentYear, { floorAtEstimated: true });
                        const age = computeAge(row.player, currentYear);
                        return (
                          <div key={row.player.internalId} className="grid grid-cols-[1fr_88px_140px] gap-3 items-center px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate">{row.player.name}</div>
                              <div className="text-[10px] text-slate-500">
                                {[row.player.pos ?? 'G', age == null ? null : `${age}yrs`].filter(Boolean).join(' ')}
                              </div>
                            </div>
                            <div className="flex gap-1.5 justify-end">
                              <span className={`font-black tabular-nums ${ratingTone(ovr)}`}>{ovr}</span>
                              <span className="text-slate-600">/</span>
                              <span className={`font-black tabular-nums ${ratingTone(pot)}`}>{pot}</span>
                            </div>
                            <div className="text-right font-black text-white tabular-nums">
                              {formatCurrencyWithCode(row.offerSalaryUSD * row.offerYears, currency, false)}/{row.offerYears}yr{row.offerYears === 1 ? '' : 's'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Users size={15} />
                        {willingRows.length} player{willingRows.length === 1 ? '' : 's'} ready to sign
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmAssistant(false)} className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-white/5">
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setConfirmAssistant(false);
                            onAssistant();
                          }}
                          className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-black text-xs font-black uppercase tracking-widest"
                        >
                          Send Offers
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};

const Kpi: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-white' }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 min-w-28">
    <div className={`text-lg font-black tabular-nums ${tone}`}>{value}</div>
    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-black">{label}</div>
  </div>
);

const RatingBox: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
  <div className="rounded-lg bg-indigo-500/15 border border-indigo-400/20 px-2 py-1.5 text-center">
    <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{label}</div>
    <div className={`text-sm font-black tabular-nums ${tone}`}>{value}</div>
  </div>
);
