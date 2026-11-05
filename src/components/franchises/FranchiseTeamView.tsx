import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Handshake, History, MapPin, Shirt, Ticket, Trophy, Users } from 'lucide-react';
import type {
  FranchiseAncillaryPrice,
  FranchiseOperationsState,
  FranchiseSponsorOffer,
  FranchiseTicketTier,
  GameState,
  NBAPlayer,
  NBATeam,
} from '../../types';
import {
  getFranchiseTaskItems,
  getFranchiseIdentityTimelineEntries,
  isJerseyPatchAvailable,
} from '../../services/franchises/franchiseState';
import { getFranchiseMatchdayProjection } from '../../services/franchises/franchiseMatchday';
import { getFranchiseSourceSeason } from '../../services/franchises/franchiseMath';
import { getFranchiseSponsorRevenue } from '../../services/franchises/franchiseSponsors';
import { getTeamFullName } from '../../utils/teamNames';
import { getArenaHistoryForTeam } from '../../utils/arenaData';
import { resolveAttendanceProfile } from '../../utils/attendanceUtils';
import { FranchiseArenaPanel } from './FranchiseArenaPanel';
import { FranchiseJerseySalesPanel } from './FranchiseJerseySalesPanel';
import { FranchiseSponsorshipPanel } from './FranchiseSponsorshipPanel';

type Props = {
  state: GameState;
  team: NBATeam;
  franchise: FranchiseOperationsState;
  canManage: boolean;
  canReturn: boolean;
  onReturn: () => void;
  onPriceChange: (tier: FranchiseTicketTier, value: number) => void;
  onAncillaryPriceChange: (item: FranchiseAncillaryPrice, value: number) => void;
  onSign: (offer: FranchiseSponsorOffer) => void;
  onAcceptArena: (facilityName: string) => void;
  onPlayerSelect: (player: NBAPlayer) => void;
  initialTab?: TeamTab;
};

export type TeamTab = 'overview' | 'arena' | 'sponsors' | 'jerseys' | 'history';

const money = (value: number) =>
  `$${value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value.toLocaleString()}`;

export const FranchiseTeamView: React.FC<Props> = ({
  state,
  team,
  franchise,
  canManage,
  canReturn,
  onReturn,
  onPriceChange,
  onAncillaryPriceChange,
  onSign,
  onAcceptArena,
  onPlayerSelect,
  initialTab,
}) => {
  const fullName = getTeamFullName(team);
  const color = team.colors?.find(value => /^#[0-9a-f]{6}$/i.test(value)) ?? '#22d3ee';
  const taskItems = getFranchiseTaskItems(franchise, state.leagueStats);
  const [tab, setTab] = useState<TeamTab>(
    initialTab
      ?? (taskItems.includes('New Arena Review')
      ? 'arena'
      : taskItems.length > 0
        ? 'sponsors'
        : 'overview'),
  );
  const sourceSeason = getFranchiseSourceSeason(state);
  const projection = useMemo(
    () => getFranchiseMatchdayProjection(state, team, franchise),
    [franchise, state, team],
  );
  const attendance = useMemo(
    () => resolveAttendanceProfile(state, team),
    [state, team],
  );
  const averageAttendance = attendance.avgAttendance;
  const attendanceRate = Math.max(0, Math.min(1, attendance.fillRate));
  const conferenceLabel = String(team.conference)
    .replace(/\s+Conference$/i, '')
    .replace(/^Eastern$/i, 'East')
    .replace(/^Western$/i, 'West');
  const arenaHistory = useMemo(
    () => state.leagueType === 'fictional'
      ? []
      : getArenaHistoryForTeam(team, sourceSeason),
    [sourceSeason, state.leagueType, team],
  );
  const timelineEntries = useMemo(() => {
    const savedEntries = franchise.history
      .filter(entry => Number(entry.season) <= sourceSeason)
      .map(entry => ({ ...entry, order: 1 }));
    const identityEntries = getFranchiseIdentityTimelineEntries(team, sourceSeason)
      .map(entry => ({ ...entry, order: 0 }));
    return [...savedEntries, ...identityEntries]
      .sort((left, right) =>
        right.season - left.season
        || right.order - left.order
        || left.id.localeCompare(right.id)
      );
  }, [franchise.history, sourceSeason, team]);
  const totalGames = team.wins + team.losses;
  const winRate = totalGames > 0 ? team.wins / totalGames : 0;
  const tabs: Array<{ id: TeamTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: Trophy },
    { id: 'arena', label: 'Arena & Tickets', icon: Ticket },
    { id: 'sponsors', label: 'Sponsorships', icon: Handshake },
    { id: 'jerseys', label: 'Jersey Sales', icon: Shirt },
    { id: 'history', label: 'History', icon: History },
  ];

  return (
    <div className="min-h-full bg-[#040811] px-3 py-5 text-slate-100 sm:px-7 sm:py-8">
      <div className="mx-auto w-full max-w-[1500px] space-y-5">
        <section className="relative overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-r from-[#091322] via-[#0d1c33] to-[#07111e] p-5 shadow-2xl sm:p-8">
          <div className="absolute -right-20 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl" style={{ backgroundColor: color }} />
          <div className="relative">
            {canReturn && <button onClick={onReturn} className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white"><ArrowLeft size={15} />All Franchises</button>}
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-2.5 sm:h-28 sm:w-28">
                  {team.logoUrl ? <img src={team.logoUrl} alt="" className="h-full w-full object-contain drop-shadow-xl" /> : <span className="text-2xl font-black" style={{ color }}>{team.abbrev}</span>}
                </div>
                <div><p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color }}>{team.conference} Conference · {state.leagueStats.year}</p><h1 className="mt-2 text-3xl font-black leading-none text-white sm:text-5xl">{fullName}</h1><p className="mt-3 flex items-center gap-2 text-sm text-slate-300"><MapPin size={15} />{franchise.arena.displayName}, {franchise.arena.location}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Record</p><p className="mt-1 text-xl font-black text-white">{team.wins}-{team.losses}</p></div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Win Rate</p><p className="mt-1 text-xl font-black text-white">{Math.round(winRate * 100)}%</p></div>
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Capacity</p><p className="mt-1 text-xl font-black text-white">{Math.round(franchise.arena.capacity / 100) / 10}K</p></div>
              </div>
            </div>
          </div>
        </section>

        <nav className="flex overflow-x-auto rounded-2xl border border-slate-800 bg-[#081120] p-1.5">
          {tabs.map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition-colors ${tab === item.id ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><item.icon size={16} />{item.label}</button>
          ))}
        </nav>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
            <section className="rounded-[24px] border border-[#2a405e] bg-[#071326] p-5 shadow-2xl sm:p-8 lg:p-10">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">Franchise Overview</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">{franchise.arena.displayName}</h2>
              <div className="relative mt-8 overflow-hidden rounded-3xl border border-[#2a405e] bg-[#08162b] p-5 shadow-xl sm:p-8">
                <div className="absolute inset-y-0 left-0 w-0.5" style={{ backgroundColor: color }} />
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-white/5" style={{ backgroundColor: `${color}18`, color }}>
                    <Users size={48} strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Average Attendance This Season</p>
                    <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                      <div><p className="text-4xl font-black tracking-tight text-white sm:text-5xl">{averageAttendance.toLocaleString()}</p><p className="mt-2 text-sm text-slate-400 sm:text-base">{franchise.arena.capacity.toLocaleString()} max capacity</p></div>
                      <div className="sm:text-right"><p className="text-3xl font-black text-cyan-300 sm:text-4xl">{Math.round(attendanceRate * 100)}%</p><p className="mt-1 text-sm text-slate-300">Capacity Filled</p></div>
                    </div>
                  </div>
                </div>
                <div className="mt-7">
                  <div className="h-4 overflow-hidden rounded-full bg-[#1d2d47]"><div className="h-full rounded-full" style={{ width: `${attendanceRate * 100}%`, background: `linear-gradient(90deg, ${color}, #d946ef)` }} /></div>
                  <div className="mt-3 flex justify-between text-xs text-slate-400"><span>0</span><span>{franchise.arena.capacity.toLocaleString()}</span></div>
                  <p className="mt-6 flex items-center gap-3 text-sm text-slate-300"><CheckCircle2 size={22} style={{ color }} />{attendanceRate >= 0.75 ? 'Strong home support this season' : 'Home support is still building this season'}</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { icon: Building2, label: 'Arena Capacity', value: franchise.arena.capacity.toLocaleString() },
                  { icon: Ticket, label: 'Annual Matchday Revenue', value: money(projection.annualMatchdayRevenue) },
                  { icon: Handshake, label: 'Annual Sponsor Revenue', value: money(getFranchiseSponsorRevenue(franchise, state.leagueStats.year, isJerseyPatchAvailable(state.leagueStats))) },
                ].map(item => <div key={item.label} className="rounded-2xl border border-[#2a405e] bg-[#08162b] p-5 sm:p-6"><div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/5" style={{ backgroundColor: `${color}18`, color }}><item.icon size={27} strokeWidth={1.8} /></div><p className="mt-5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</p><p className="mt-3 text-2xl font-black tracking-tight text-white">{item.value}</p></div>)}
              </div>
            </section>
            <section className="rounded-[24px] border border-[#2a405e] bg-[#071326] p-5 shadow-2xl sm:p-8 lg:p-10">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-300">Quick Info</p>
              <dl className="mt-6">
                {[
                  ['Club', fullName],
                  ['Abbreviation', team.abbrev],
                  ['Conference', conferenceLabel],
                  ['Market', team.region ?? fullName],
                  ['Arena', franchise.arena.displayName],
                ].map(([label, value]) => <div key={label} className="flex min-h-24 items-center justify-between gap-5 border-b border-[#2a405e] py-5 text-sm last:border-0 sm:text-base"><dt className="text-slate-500">{label}</dt><dd className="max-w-[65%] text-right font-black text-white">{value}</dd></div>)}
              </dl>
            </section>
          </div>
        )}
        {tab === 'arena' && <FranchiseArenaPanel state={state} team={team} franchise={franchise} readOnly={!canManage} onPriceChange={onPriceChange} onAncillaryPriceChange={onAncillaryPriceChange} onAcceptArena={onAcceptArena} />}
        {tab === 'sponsors' && <FranchiseSponsorshipPanel state={state} team={team} franchise={franchise} readOnly={!canManage} onSign={onSign} />}
        {tab === 'jerseys' && <FranchiseJerseySalesPanel state={state} team={team} onPlayerSelect={onPlayerSelect} />}
        {tab === 'history' && (
          <div className="space-y-5">
            {arenaHistory.length > 0 && (
              <section className="rounded-2xl border border-slate-800 bg-[#081120] p-5 sm:p-7">
                <div className="flex items-center gap-2"><Building2 className="text-amber-300" size={18} /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Arena History</h2></div>
                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {arenaHistory.map(arena => (
                    <article key={`${arena.name}-${arena.opening_year}`} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
                      {arena.imageUrl && <img src={arena.imageUrl} alt={arena.name} className="h-44 w-full object-cover" />}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4"><h3 className="font-black text-white">{arena.name}</h3><span className="font-mono text-xs font-black text-amber-300">{arena.opening_year || '—'}</span></div>
                        <p className="mt-2 text-sm text-slate-400">{arena.arena_location} · {arena.seating_capacity.toLocaleString()} seats</p>
                        {arena.formerNames.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">{arena.formerNames.map(row => `${row.name} (${row.season})`).join(' · ')}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section className="rounded-2xl border border-slate-800 bg-[#081120] p-5 sm:p-7">
              <div className="flex items-center gap-2"><CalendarDays className="text-cyan-300" size={18} /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Franchise Timeline</h2></div>
              <div className="mt-5 space-y-3">
                {timelineEntries.map(entry => <article key={entry.id} className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">{entry.logoUrl && <img src={entry.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white/5 object-contain p-1" />}<div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-4"><h3 className="font-black text-white">{entry.title}</h3><span className="font-mono text-xs font-black text-cyan-300">{entry.season}</span></div><p className="mt-2 text-sm leading-6 text-slate-400">{entry.detail}</p></div></article>)}
              </div>
            </section>
            </div>
        )}
      </div>
    </div>
  );
};
