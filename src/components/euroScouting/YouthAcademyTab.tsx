import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, Crosshair, Dumbbell, Info, Search, Star, Users, X } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import type { EuroAcademyPlayer } from '../../services/euroScouting/types';
import { EURO_ACADEMY_CAPACITY, getAcademyDirector, getEuroUserTeam } from '../../services/euroScouting/engine';
import { findEuroCountryProfile } from '../../services/euroScouting/countryProfiles';
import { getEuroAcademyEvaluatedRatings } from '../../services/euroScouting/prospectRatings';
import { nbaPlayerToTrainingPlayer } from '../../TeamTraining/adapters/fromGameState';
import { formatCurrencyWithCode, formatHeight } from '../../utils/helpers';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { CountryFlag } from '../shared/CountryFlag';
import { RatingBadge } from '../transferMarket/EuroTransferMarketShared';
import { PlayerRatingsModal } from '../modals/PlayerRatingsModal';
import { TrainingFocusModal } from '../../TeamTraining/components/TrainingFocusModal';
import { AcademyPlayerActionModal } from './AcademyPlayerActionModal';
import { getStaffImageUrl, resolveStaffImageId } from '../../utils/staffPortrait';
import { ACADEMY_BUDGET_MAX_EUR, ACADEMY_BUDGET_STEP_EUR, getAcademyBudgetStrength, getAcademyRegionalScoutingBudgetEUR, normalizeAcademyBudgetEUR } from '../../services/tycoon/economyScale';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { getPrimaryPlayerCountry } from '../../utils/playerNationality';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { isOnRoster } from '../../utils/teamLookup';

type SortKey = 'player' | 'overall' | 'potential' | 'age' | 'height' | 'focus';
type SortDirection = 'asc' | 'desc';

const AcademyFlag: React.FC<{ player: EuroAcademyPlayer }> = ({ player }) => {
  const country = getPrimaryPlayerCountry(player);
  const profile = findEuroCountryProfile(country);
  return <CountryFlag country={profile?.name ?? country} iso2={profile?.iso2} className="inline-flex h-3.5 w-5 rounded-sm" />;
};

const AcademySortHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}> = ({ label, sortKey, activeKey, direction, onSort }) => (
  <button type="button" onClick={() => onSort(sortKey)} className={`inline-flex items-center gap-1 text-left hover:text-white ${activeKey === sortKey ? 'text-emerald-300' : ''}`}>
    {label}
    {activeKey === sortKey && (direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
  </button>
);

export const YouthAcademyTab: React.FC<{
  onAcademyBudgetChange?: (budget: number) => void;
  budgetLocked?: boolean;
}> = ({ onAcademyBudgetChange, budgetLocked = false }) => {
  const { state, dispatchAction, setCurrentView } = useGame();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('potential');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selected, setSelected] = useState<EuroAcademyPlayer | null>(null);
  const [ratingsPlayer, setRatingsPlayer] = useState<EuroAcademyPlayer | null>(null);
  const [focusPlayer, setFocusPlayer] = useState<EuroAcademyPlayer | null>(null);
  const [promotionCandidate, setPromotionCandidate] = useState<EuroAcademyPlayer | null>(null);
  const [promotionPendingId, setPromotionPendingId] = useState<string | null>(null);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [promotionSuccess, setPromotionSuccess] = useState<string | null>(null);
  const year = state.leagueStats.year;
  const players = state.euroScouting?.academyPlayers ?? [];
  const team = getEuroUserTeam(state);
  const director = getAcademyDirector(team);
  const directorPortrait = director ? director.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(director)) : null;
  const economyIndex = Math.max(0.05, Number(team?.tycoon?.currentEconomyIndex ?? 1));
  const savedBudget = normalizeAcademyBudgetEUR(team?.tycoon?.academyBudget, team?.tycoon?.tier, economyIndex);
  const [draftBudget, setDraftBudget] = useState(savedBudget);
  useEffect(() => setDraftBudget(savedBudget), [savedBudget]);
  const budget = onAcademyBudgetChange ? draftBudget : savedBudget;
  const budgetDirty = onAcademyBudgetChange != null && draftBudget !== savedBudget;
  const scoutingWallet = team?.tycoon?.regionalScoutingBudget?.season === year ? team.tycoon.regionalScoutingBudget : undefined;
  const scoutingSpent = Math.max(0, Number(scoutingWallet?.spentEUR ?? 0));
  const savedScoutingBudget = Math.max(
    scoutingSpent,
    Number(scoutingWallet?.allocatedEUR ?? team?.tycoon?.scoutingInvestment ?? getAcademyRegionalScoutingBudgetEUR(savedBudget, team?.tycoon?.tier, economyIndex)),
  );
  const scoutingBudget = budgetDirty
    ? Math.max(scoutingSpent, getAcademyRegionalScoutingBudgetEUR(budget, team?.tycoon?.tier, economyIndex))
    : savedScoutingBudget;
  const budgetStep = Math.max(1, Math.round(ACADEMY_BUDGET_STEP_EUR * economyIndex));
  const budgetMax = Math.round(ACADEMY_BUDGET_MAX_EUR * economyIndex);
  const budgetContribution = Math.round(getAcademyBudgetStrength(budget, team?.tycoon?.tier, economyIndex) * 80);
  const currency = state.leagueStats.currency ?? 'EUR';
  const formatBudget = (value: number) => formatCurrencyWithCode(value, currency, false);
  const directorContribution = director
    ? Math.max(0, Math.min(20, Math.round(Number(director.rating ?? 60) / 5)))
    : 0;
  const academyRating = Math.min(100, budgetContribution + directorContribution);
  const evaluatedRatings = (player: EuroAcademyPlayer) => getEuroAcademyEvaluatedRatings(state, player, year, director?.rating);
  const academyAge = (player: EuroAcademyPlayer) => {
    const savedAge = Number(player.age);
    if (Number.isFinite(savedAge) && savedAge > 0) return Math.round(savedAge);
    const bornYear = Number(player.born?.year);
    return Number.isFinite(bornYear) && bornYear > 0 ? Math.max(0, year - bornYear) : 0;
  };
  const academyLocation = (player: EuroAcademyPlayer) => String(player.born?.loc ?? getPrimaryPlayerCountry(player)).trim() || 'Unknown';
  const sorted = useMemo(() => players
    .filter(player => player.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const comparison = sortBy === 'player'
        ? a.name.localeCompare(b.name)
        : sortBy === 'age'
          ? academyAge(a) - academyAge(b)
          : sortBy === 'height'
            ? Number(a.hgt ?? 0) - Number(b.hgt ?? 0)
            : sortBy === 'focus'
              ? String(a.developmentArchetype ?? 'Balanced').localeCompare(String(b.developmentArchetype ?? 'Balanced'))
              : sortBy === 'overall'
                ? evaluatedRatings(a).overall - evaluatedRatings(b).overall
                : evaluatedRatings(a).potential - evaluatedRatings(b).potential;
      const directed = sortDirection === 'asc' ? comparison : -comparison;
      return directed || a.name.localeCompare(b.name);
    }), [players, query, sortBy, sortDirection, state, year, director?.rating]);
  const focusStats = useMemo(() => focusPlayer
    ? nbaPlayerToTrainingPlayer(focusPlayer, year, { state }).stats
    : undefined, [focusPlayer, state, year]);

  const rosterLimit = getStandardRosterLimit(state.leagueStats);
  const seniorRosterSize = state.players.filter(player => player.tid === state.userTeamId && isOnRoster(player)).length;
  const promotionHasDuplicate = !!promotionCandidate && state.players.some(player =>
    String(player.internalId) === String(promotionCandidate.internalId)
    && (isOnRoster(player) || player.promotedFromAcademy),
  );
  const promotionRosterFull = seniorRosterSize >= rosterLimit;

  useEffect(() => {
    if (!promotionPendingId) return;
    const promoted = state.players.find(player => String(player.internalId) === promotionPendingId && player.promotedFromAcademy && player.tid === state.userTeamId);
    const stillInAcademy = players.some(player => String(player.internalId) === promotionPendingId);
    if (promoted && !stillInAcademy) {
      setPromotionSuccess(promoted.name);
      setPromotionCandidate(null);
      setPromotionPendingId(null);
      setPromotionError(null);
      return;
    }
    if (stillInAcademy && state.lastOutcome === 'There is no open place in the senior roster.') {
      setPromotionError(state.lastOutcome);
      setPromotionPendingId(null);
    }
  }, [players, promotionPendingId, state.lastOutcome, state.players, state.userTeamId]);

  const updateSort = (key: SortKey) => {
    if (key === sortBy) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(key);
    setSortDirection(key === 'overall' || key === 'potential' ? 'desc' : 'asc');
  };

  const releasePlayer = (player: EuroAcademyPlayer) => {
    void dispatchAction({ type: 'RELEASE_EURO_ACADEMY_PLAYER', payload: { playerId: player.internalId } });
    setSelected(null);
  };

  const confirmPromotion = () => {
    if (!promotionCandidate || promotionRosterFull || promotionHasDuplicate) return;
    setPromotionError(null);
    setPromotionPendingId(String(promotionCandidate.internalId));
    void dispatchAction({ type: 'PROMOTE_EURO_ACADEMY_PLAYER', payload: { playerId: promotionCandidate.internalId } });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-950 p-5">
          <Building2 size={22} className="text-emerald-400" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Academy Rating</p>
          <p className="mt-1 text-4xl font-black text-white">{academyRating}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${academyRating}%` }} /></div>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">Your academy budget and Head of Academy shape daily development and improve how confidently the club evaluates its youth.</p>
          {onAcademyBudgetChange ? <div className="mt-4 rounded-xl border border-emerald-500/20 bg-slate-950/35 p-3"><div className="mb-2 flex justify-between gap-3 text-[9px] font-black uppercase tracking-wider text-emerald-200"><span>Annual Budget</span><span>{formatBudget(budget)}</span></div><div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 p-2"><button type="button" disabled={budgetLocked || budget <= 0} onClick={() => setDraftBudget(Math.max(0, budget - budgetStep))} className="rounded-md p-2 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Lower academy budget"><ChevronLeft size={16} /></button><span className="text-sm font-black text-white">{formatBudget(budget)}</span><button type="button" disabled={budgetLocked || budget >= budgetMax} onClick={() => setDraftBudget(Math.min(budgetMax, budget + budgetStep))} className="rounded-md p-2 text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Raise academy budget"><ChevronRight size={16} /></button></div><button type="button" disabled={budgetLocked || !budgetDirty} onClick={() => onAcademyBudgetChange(draftBudget)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"><Check size={14} />Save Budget</button><div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3"><Crosshair size={21} className="shrink-0 text-emerald-300" /><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Scouting Budget</p><p className="mt-1 text-sm font-black text-white">{formatBudget(scoutingBudget)}</p></div><span title="Funds available for Regional Scout assignments." aria-label="Regional scouting budget information" className="text-slate-500"><Info size={16} /></span></div></div> : <button onClick={() => setCurrentView('Front Office Facilities')} className="mt-4 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-[10px] font-black uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/20">Manage Academy Budget</button>}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex items-center justify-between"><Users size={18} className="text-blue-400" /><span className="text-xl font-black text-white">{players.length}/{EURO_ACADEMY_CAPACITY}</span></div><p className="mt-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Academy Places</p></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              {directorPortrait ? <img src={directorPortrait} alt={director?.name ?? ''} className="h-full w-full object-cover" /> : <Star size={20} className="text-violet-400" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{director?.name ?? 'Vacant'}</p>
              <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Head of Academy</p>
              <p className="mt-1 text-[10px] text-slate-600">{director ? `Rating ${Math.round(director.rating ?? 60)}` : 'Fill this role in Team Office'}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"><Dumbbell size={18} className="text-amber-400" /><p className="mt-3 text-[9px] font-black uppercase tracking-widest text-slate-500">Academy Budget</p><p className="mt-1 text-lg font-black text-white">{formatBudget(budget)}</p></div>
      </aside>

      <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/55">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-4"><label className="flex min-w-[190px] flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2"><Search size={15} className="text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search academy" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" /></label><label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs text-slate-400 md:hidden"><ArrowDownUp size={14} /><select value={sortBy} onChange={event => updateSort(event.target.value as SortKey)} className="bg-transparent outline-none"><option className="bg-slate-900" value="player">Player</option><option className="bg-slate-900" value="overall">OVR</option><option className="bg-slate-900" value="potential">POT</option><option className="bg-slate-900" value="age">Age</option><option className="bg-slate-900" value="height">Height</option><option className="bg-slate-900" value="focus">Focus</option></select><button type="button" onClick={() => setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')} aria-label={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}>{sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button></label></div>
        {sorted.length === 0 ? <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><Users size={40} className="text-slate-700" /><h3 className="mt-4 text-lg font-black text-slate-300">Your academy is waiting</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">Send a regional scout abroad, review the report, and invite a player into your club.</p></div> : <>
          <div className="hidden md:block"><div className="grid grid-cols-[minmax(220px,2fr)_70px_70px_70px_90px_minmax(120px,1fr)] gap-3 bg-slate-950/60 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500"><AcademySortHeader label="Player" sortKey="player" activeKey={sortBy} direction={sortDirection} onSort={updateSort} /><AcademySortHeader label="OVR" sortKey="overall" activeKey={sortBy} direction={sortDirection} onSort={updateSort} /><AcademySortHeader label="POT" sortKey="potential" activeKey={sortBy} direction={sortDirection} onSort={updateSort} /><AcademySortHeader label="Age" sortKey="age" activeKey={sortBy} direction={sortDirection} onSort={updateSort} /><AcademySortHeader label="Height" sortKey="height" activeKey={sortBy} direction={sortDirection} onSort={updateSort} /><AcademySortHeader label="Focus" sortKey="focus" activeKey={sortBy} direction={sortDirection} onSort={updateSort} /></div>{sorted.map(player => { const { overall: ovr, potential: pot } = evaluatedRatings(player); return <button key={player.internalId} onClick={() => setSelected(player)} className="grid w-full grid-cols-[minmax(220px,2fr)_70px_70px_70px_90px_minmax(120px,1fr)] items-center gap-3 border-t border-slate-800 px-4 py-3 text-left hover:bg-slate-800/40"><span className="flex min-w-0 items-center gap-3"><PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={44} /><span className="min-w-0"><span className="block truncate text-sm font-black text-white">{player.name}</span><span className="flex min-w-0 items-center gap-1 text-[10px] text-slate-500"><AcademyFlag player={player} /><span className="truncate">{academyLocation(player)}</span><span>·</span><span>{normalizePositionLabel(player.pos, player.hgt)}</span></span></span></span><RatingBadge label="OVR" value={ovr} small /><RatingBadge label="POT" value={pot} small /><span className="font-bold text-slate-300">{academyAge(player)}</span><span className="text-xs text-slate-400">{player.hgt ? formatHeight(player.hgt) : '—'}</span><span className="truncate text-xs text-violet-300">{player.developmentArchetype ?? 'Balanced'}</span></button>; })}</div>
          <div className="space-y-3 p-3 md:hidden">{sorted.map(player => { const { overall: ovr, potential: pot } = evaluatedRatings(player); return <button key={player.internalId} onClick={() => setSelected(player)} className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left"><div className="flex items-center gap-3"><PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={54} /><div className="min-w-0 flex-1"><h3 className="truncate font-black text-white">{player.name}</h3><p className="flex min-w-0 items-center gap-1 text-xs text-slate-500"><AcademyFlag player={player} /><span className="truncate">{academyLocation(player)}</span><span>· {normalizePositionLabel(player.pos, player.hgt)}</span></p><p className="mt-1 text-[10px] text-slate-600">Age {academyAge(player)}</p><div className="mt-2 flex gap-2"><RatingBadge label="OVR" value={ovr} small /><RatingBadge label="POT" value={pot} small /></div></div></div><div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-[10px]"><span className="text-slate-500">{player.hgt ? formatHeight(player.hgt) : '—'}</span><span className="font-bold text-violet-300">{player.developmentArchetype ?? 'Balanced'}</span></div></button>; })}</div>
        </>}
      </section>

      {selected && <AcademyPlayerActionModal player={{ ...selected, age: academyAge(selected) }} onViewRatings={() => { setRatingsPlayer(selected); setSelected(null); }} onPromote={() => { setPromotionCandidate(selected); setPromotionError(null); setSelected(null); }} onRelease={() => releasePlayer(selected)} onOpenDevelopmentFocus={() => { setFocusPlayer(selected); setSelected(null); }} onClose={() => setSelected(null)} />}
      {promotionCandidate && <div className="fixed inset-0 z-[115] flex items-end justify-center bg-slate-950/90 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && !promotionPendingId && setPromotionCandidate(null)}><div className="w-full max-w-md rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Senior Team Assignment</p><h2 className="mt-1 text-xl font-black text-white">Promote {promotionCandidate.name}?</h2></div><button type="button" disabled={!!promotionPendingId} onClick={() => setPromotionCandidate(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white disabled:opacity-40"><X size={18} /></button></div><p className="mt-3 text-sm leading-relaxed text-slate-400">This permanently moves {promotionCandidate.name} from the youth academy to your senior roster.</p><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-center"><div><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Before</div><strong className={`mt-1 block text-2xl ${promotionRosterFull ? 'text-rose-300' : 'text-white'}`}>{seniorRosterSize} <span className="text-sm text-slate-500">/ {rosterLimit}</span></strong></div><ArrowRight size={20} className="text-emerald-400" /><div><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">After</div><strong className="mt-1 block text-2xl text-emerald-300">{Math.min(rosterLimit, seniorRosterSize + 1)} <span className="text-sm text-slate-500">/ {rosterLimit}</span></strong></div></div>{(promotionRosterFull || promotionHasDuplicate || promotionError) && <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100"><AlertTriangle size={16} className="shrink-0" /><span>{promotionError ?? (promotionRosterFull ? `Free one senior roster place before promoting ${promotionCandidate.name}. The academy record will remain unchanged.` : `${promotionCandidate.name} already exists in the senior player database. The academy record will remain unchanged.`)}</span></div>}<div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={!!promotionPendingId} onClick={() => setPromotionCandidate(null)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black text-slate-300 disabled:opacity-40">Keep in Academy</button><button type="button" disabled={promotionRosterFull || promotionHasDuplicate || !!promotionPendingId} onClick={confirmPromotion} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">{promotionPendingId ? 'Assigning…' : 'Confirm Assignment'}</button></div></div></div>}
      {promotionSuccess && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/90 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && setPromotionSuccess(null)}><div className="w-full max-w-md rounded-t-3xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-2xl sm:rounded-3xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300"><CheckCircle2 size={28} /></div><p className="mt-4 text-[10px] font-black uppercase tracking-widest text-emerald-400">Assigned to Senior Team</p><h2 className="mt-1 text-2xl font-black text-white">{promotionSuccess}</h2><div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/45 p-4 text-left"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-800">{directorPortrait ? <img src={directorPortrait} alt={director?.name ?? 'Head of Academy'} className="h-full w-full object-cover" /> : <Star size={19} className="text-emerald-300" />}</div><div><p className="text-xs font-black text-slate-300">{director?.name ?? 'Head of Academy'}</p><p className="mt-2 text-sm leading-relaxed text-slate-400">“{promotionSuccess} is ready for this next step. We are proud to see him leave the academy and join the senior team.”</p></div></div><button type="button" onClick={() => setPromotionSuccess(null)} className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white">Continue</button></div></div>}
      {ratingsPlayer && <PlayerRatingsModal player={ratingsPlayer} season={year} onClose={() => setRatingsPlayer(null)} />}
      <TrainingFocusModal
        isOpen={!!focusPlayer}
        playerName={focusPlayer?.name}
        playerPos={focusPlayer ? normalizePositionLabel(focusPlayer.pos, focusPlayer.hgt) : undefined}
        playerAge={focusPlayer ? academyAge(focusPlayer) : undefined}
        playerStats={focusStats}
        imgURL={focusPlayer?.imgURL}
        face={focusPlayer?.face}
        currentFocus={focusPlayer?.developmentArchetype}
        initialArchetype={focusPlayer?.developmentArchetype ?? null}
        onSelect={archetype => {
          if (!focusPlayer) return;
          void dispatchAction({ type: 'SET_EURO_ACADEMY_ARCHETYPE', payload: { playerId: focusPlayer.internalId, archetype } });
        }}
        onClose={() => {
          setSelected(focusPlayer);
          setFocusPlayer(null);
        }}
      />
    </div>
  );
};
