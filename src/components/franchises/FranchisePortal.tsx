import React, { useMemo, useState } from 'react';
import { ArrowRight, Building2, Search, Shield, SlidersHorizontal, Trophy, Users } from 'lucide-react';
import type { GameState, NBATeam } from '../../types';
import { ensureFranchiseOperations } from '../../services/franchises/franchiseState';
import { getFranchiseValuationSnapshot } from '../../services/franchises/franchiseValuation';
import { getTeamFullName } from '../../utils/teamNames';

type Props = {
  state: GameState;
  onSelectTeam: (teamId: number) => void;
};

const teamColor = (team: NBATeam) => {
  const color = team.colors?.find(value => /^#[0-9a-f]{6}$/i.test(value));
  return color ?? '#22d3ee';
};

const money = (value: number) =>
  `$${value >= 1_000_000_000 ? `${(value / 1_000_000_000).toFixed(2)}B` : `${(value / 1_000_000).toFixed(0)}M`}`;

export const FranchisePortal: React.FC<Props> = ({ state, onSelectTeam }) => {
  const [query, setQuery] = useState('');
  const [conference, setConference] = useState('All');
  const [division, setDivision] = useState<number | 'All'>('All');
  const [marketTier, setMarketTier] = useState('All');
  const [sort, setSort] = useState<'valuation' | 'population' | 'capacity' | 'name'>('valuation');
  const leagueName = state.leagueStats.leagueName ?? 'Basketball League';
  const showNbaLogo = state.leagueType === 'modded'
    && (state.moddedLeagueBase == null || state.moddedLeagueBase === 'nba');
  const conferences = useMemo(
    () => [...new Set(state.teams.map(team => team.conference).filter(Boolean))],
    [state.teams],
  );
  const snapshots = useMemo(
    () => new Map(state.teams.map(team => [
      team.id,
      getFranchiseValuationSnapshot(state, team),
    ])),
    [state],
  );
  const divisions = useMemo(() => {
    const eligibleTeams = conference === 'All'
      ? state.teams
      : state.teams.filter(team => team.conference === conference);
    return [...new Set(
      eligibleTeams
        .map(team => team.did)
        .filter((did): did is number => Number.isFinite(did)),
    )].map(did => ({
      did,
      name: state.leagueStats.divs?.find(item => item.did === did)?.name ?? `Division ${did + 1}`,
    }));
  }, [conference, state.leagueStats.divs, state.teams]);
  const teams = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...state.teams]
      .filter(team => conference === 'All' || team.conference === conference)
      .filter(team => division === 'All' || team.did === division)
      .filter(team => marketTier === 'All' || snapshots.get(team.id)?.marketTier === marketTier)
      .filter(team => {
        if (!normalizedQuery) return true;
        const franchise = ensureFranchiseOperations(state, team);
        return [
          getTeamFullName(team),
          team.abbrev,
          team.region,
          franchise.arena.displayName,
        ].some(value => String(value ?? '').toLowerCase().includes(normalizedQuery));
      })
      .sort((left, right) => {
        if (sort === 'capacity') {
          return ensureFranchiseOperations(state, right).arena.capacity
            - ensureFranchiseOperations(state, left).arena.capacity;
        }
        if (sort === 'population') {
          return (snapshots.get(right.id)?.populationMillions ?? 0)
            - (snapshots.get(left.id)?.populationMillions ?? 0);
        }
        if (sort === 'name') return getTeamFullName(left).localeCompare(getTeamFullName(right));
        return (snapshots.get(right.id)?.valuationUSD ?? 0)
          - (snapshots.get(left.id)?.valuationUSD ?? 0);
      });
  }, [conference, division, marketTier, query, snapshots, sort, state]);
  const totalCapacity = state.teams.reduce(
    (sum, team) => sum + ensureFranchiseOperations(state, team).arena.capacity,
    0,
  );

  return (
    <div className="min-h-full bg-[#040811] px-3 py-5 text-slate-100 sm:px-7 sm:py-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-r from-[#091322] via-[#0d1c33] to-[#07111e] p-6 shadow-2xl sm:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="flex items-start gap-4 sm:items-center sm:gap-6">
              {showNbaLogo ? (
                <img src="https://cdn.nba.com/logos/nba/nba-logoman-word-white.svg" alt="NBA" className="hidden h-16 w-auto shrink-0 object-contain drop-shadow-lg sm:block" />
              ) : (
                <div className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-cyan-300 sm:flex"><Shield size={38} /></div>
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">{leagueName}</p>
                <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
                  League Franchises
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                  Open any club to review its arena, ticket strategy, commercial partnerships and franchise history.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: 'Clubs', value: state.teams.length.toLocaleString(), icon: Shield },
                { label: 'Total Seats', value: totalCapacity.toLocaleString(), icon: Building2 },
                { label: 'Season', value: String(state.leagueStats.year), icon: Trophy },
              ].map(item => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 last:col-span-2 sm:last:col-span-1">
                  <div className="flex items-center gap-2 text-cyan-300"><item.icon size={15} /><span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span></div>
                  <div className="mt-1 text-lg font-black text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#081120] p-4 shadow-xl sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search franchise, city, arena or abbreviation..."
                className="w-full rounded-xl border border-slate-800 bg-[#050b16] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500/50"
              />
            </label>
            <div className="flex overflow-x-auto rounded-xl border border-slate-800 bg-[#050b16] p-1.5">
              {['All', ...conferences].map(value => (
                <button
                  key={value}
                  onClick={() => {
                    setConference(value);
                    setDivision('All');
                  }}
                  className={`shrink-0 rounded-lg px-4 py-2 text-xs font-black transition-colors ${
                    conference === value ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {value === 'All' ? `All ${state.teams.length} Clubs` : value}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#050b16] px-3">
              <SlidersHorizontal size={15} className="text-slate-500" />
              <select
                value={sort}
                onChange={event => setSort(event.target.value as typeof sort)}
                className="bg-transparent py-3 text-xs font-bold text-slate-200 outline-none"
              >
                <option value="valuation">Valuation</option>
                <option value="population">Market Population</option>
                <option value="capacity">Arena Capacity</option>
                <option value="name">Franchise Name</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-800/70 pt-4 xl:flex-row">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="mr-1 shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500">Divisions</span>
              <button onClick={() => setDivision('All')} className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold ${division === 'All' ? 'border-slate-500 bg-slate-700 text-white' : 'border-slate-800 bg-[#050b16] text-slate-400'}`}>All</button>
              {divisions.map(item => <button key={item.did} onClick={() => setDivision(item.did)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold ${division === item.did ? 'border-slate-500 bg-slate-700 text-white' : 'border-slate-800 bg-[#050b16] text-slate-400'}`}>{item.name}</button>)}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="mr-1 shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500">Market Tier</span>
              {['All', 'Tier 1 Mega', 'Tier 2 Large', 'Tier 3 Mid', 'Tier 4 Small'].map(value => (
                <button key={value} onClick={() => setMarketTier(value)} className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold ${marketTier === value ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-slate-800 bg-[#050b16] text-slate-400'}`}>{value}</button>
              ))}
            </div>
          </div>
        </section>

        {teams.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-slate-800 bg-[#081120] p-8 text-center">
            <Shield className="mb-3 text-slate-600" size={48} />
            <h2 className="text-xl font-black text-white">No franchises match</h2>
            <p className="mt-1 text-sm text-slate-400">Change the search or franchise filters.</p>
            <button
              onClick={() => {
                setQuery('');
                setConference('All');
                setDivision('All');
                setMarketTier('All');
              }}
              className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-black text-white"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {teams.map(team => {
              const franchise = ensureFranchiseOperations(state, team);
              const snapshot = snapshots.get(team.id)!;
              const color = teamColor(team);
              return (
                <button
                  key={team.id}
                  onClick={() => onSelectTeam(team.id)}
                  className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-[#081120] p-5 text-left shadow-xl transition-all hover:-translate-y-1 hover:border-slate-600 hover:bg-[#0c182c]"
                >
                  <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-20 blur-3xl transition-opacity group-hover:opacity-40" style={{ backgroundColor: color }} />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-2.5 shadow-lg">
                      {team.logoUrl ? (
                        <img src={team.logoUrl} alt="" className="h-full w-full object-contain drop-shadow-lg" />
                      ) : (
                        <span className="text-2xl font-black" style={{ color }}>{team.abbrev}</span>
                      )}
                    </div>
                    <span className="rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1 font-mono text-xs font-black text-white">{team.abbrev}</span>
                  </div>
                  <div className="relative mt-4">
                    <h2 className="text-xl font-black leading-tight text-white">{getTeamFullName(team)}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{team.conference} Conference</p>
                  </div>
                  <div className="relative mt-4 space-y-2 rounded-2xl border border-slate-800 bg-[#050b16] p-3 text-xs">
                    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-slate-400"><Building2 size={13} />Arena</span><span className="truncate font-bold text-white">{franchise.arena.displayName}</span></div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2"><span className="flex items-center gap-1.5 text-slate-400"><Users size={13} />Capacity</span><span className="font-mono font-bold text-white">{franchise.arena.capacity.toLocaleString()}</span></div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2"><span className="flex items-center gap-1.5 text-slate-400"><Users size={13} />Market Pop.</span><span className="font-mono font-bold text-white">{snapshot.populationMillions.toFixed(1)}M</span></div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2"><span className="flex items-center gap-1.5 text-slate-400"><Trophy size={13} />Championships</span><span className="font-mono font-bold text-amber-300">{snapshot.championships}</span></div>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2"><span className="text-slate-400">Valuation</span><span className="font-mono font-bold text-emerald-300">{money(snapshot.valuationUSD)}</span></div>
                  </div>
                  <div className="relative mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
                    <span className="rounded-lg border px-2.5 py-1 text-[11px] font-black" style={{ color, borderColor: `${color}66`, backgroundColor: `${color}18` }}>{snapshot.marketTier}</span>
                    <span className="flex items-center gap-1.5 text-xs font-black text-slate-300 transition-colors group-hover:text-white">Open <ArrowRight size={14} /></span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
