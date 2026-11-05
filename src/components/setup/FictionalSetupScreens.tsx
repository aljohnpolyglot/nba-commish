import React from 'react';
import { Calendar, Trophy, Users } from 'lucide-react';
import type { FictionalHistoryMode, FictionalNationalityFrequency, FictionalPlayerPool, FictionalRosterMode } from '../../types';
import { FIRST_BASKETBALL_YEAR } from '../../services/era/basketballEraRules';
import { CountryFlag } from '../shared/CountryFlag';

const panelClass = 'relative z-10 flex h-screen w-full max-w-[1400px] flex-col px-4 py-6 mx-auto';
const shellClass = 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-800 bg-black/60 shadow-2xl backdrop-blur-md';

export function FictionalYearScreen({ year, onChange, onContinue }: {
  year: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-gray-800 bg-black/60 p-8 shadow-2xl backdrop-blur-md">
        <h1 className="mb-2 text-4xl font-black italic uppercase tracking-widest text-white">Association</h1>
        <p className="mb-8 text-sm font-bold uppercase tracking-wider text-gray-400">Choose Starting Year</p>
        <input
          type="number"
          value={year}
          min={FIRST_BASKETBALL_YEAR}
          max={9999}
          onChange={event => onChange(event.target.value)}
          placeholder="e.g. 2024"
          className="mb-8 w-full rounded border-2 border-red-800 bg-gray-900 p-4 text-xl font-bold text-white transition-colors focus:border-red-500 focus:outline-none"
        />
        <button
          onClick={onContinue}
          className="w-full rounded bg-red-600 py-4 text-xl font-black uppercase tracking-widest text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all hover:bg-red-500 hover:shadow-[0_0_25px_rgba(220,38,38,0.7)]"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export function FictionalLeagueTypeScreen({ onSelect }: { onSelect: (pool: FictionalPlayerPool) => void }) {
  const options: Array<{ pool: FictionalPlayerPool; title: string; description: string; cardClass: string; iconClass: string }> = [
    { pool: 'mens', title: "Men's", description: 'Generate male players and prospects.', cardClass: 'hover:border-blue-500', iconClass: 'text-blue-400' },
    { pool: 'womens', title: "Women's", description: 'Generate female players and prospects.', cardClass: 'hover:border-pink-500', iconClass: 'text-pink-400' },
    { pool: 'mixed', title: 'Mixed', description: 'Generate both male and female players and prospects.', cardClass: 'hover:border-violet-500', iconClass: 'text-violet-400' },
  ];
  return (
    <div className={panelClass}>
      <div className={shellClass}>
        <div className="shrink-0 border-b border-gray-800 p-6 sm:p-8">
          <h2 className="text-3xl font-black uppercase tracking-tight text-white">League Type</h2>
          <p className="font-medium text-gray-500">Select the player pool for your league.</p>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-stretch justify-center gap-5 overflow-y-auto p-5 md:flex-row md:items-center md:gap-8 md:p-8">
          {options.map(option => (
            <button
              key={option.pool}
              onClick={() => onSelect(option.pool)}
              className={`group relative flex min-h-52 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-gray-800 bg-gray-900/50 p-8 text-center transition-all hover:bg-gray-800/80 md:max-h-[350px] md:p-10 ${option.cardClass}`}
            >
              <Users className={`mx-auto mb-6 h-12 w-12 ${option.iconClass}`} />
              <h3 className="mb-4 text-3xl font-black uppercase tracking-tight text-white">{option.title}</h3>
              <p className="font-medium leading-relaxed text-gray-400">{option.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FictionalNationalitiesScreen({ nationalities, onChange, onContinue }: {
  nationalities: FictionalNationalityFrequency[];
  onChange: (country: string, frequency: number) => void;
  onContinue: () => void;
}) {
  return (
    <div className={panelClass}>
      <div className={shellClass}>
        <div className="flex shrink-0 flex-col gap-4 border-b border-gray-800 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tight text-white">Nationalities</h2>
            <p className="font-medium text-gray-500">Configure frequencies for auto-generated player nationalities.</p>
          </div>
          <button onClick={onContinue} className="rounded bg-red-600 px-6 py-3 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-all hover:bg-red-500 sm:px-8 sm:text-lg">
            Next: League Rules
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 sm:p-8">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/50">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-800 bg-black/40">
                  <th className="px-3 py-4 text-xs font-bold uppercase tracking-widest text-gray-400 sm:px-6">Flag</th>
                  <th className="px-3 py-4 text-xs font-bold uppercase tracking-widest text-gray-400 sm:px-6">Country</th>
                  <th className="px-3 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-400 sm:px-6">Relative Frequency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {nationalities.map(nationality => (
                  <tr key={nationality.country} className="transition-colors hover:bg-gray-800/30">
                    <td className="px-3 py-3 sm:px-6"><CountryFlag country={nationality.country} /></td>
                    <td className="px-3 py-3 font-medium text-white sm:px-6">{nationality.country}</td>
                    <td className="px-3 py-3 text-right sm:px-6">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={nationality.frequency}
                        onChange={event => onChange(nationality.country, Math.max(0, Number(event.target.value) || 0))}
                        className="w-20 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right font-mono text-sm text-gray-300 transition-all hover:bg-gray-700 focus:border-red-500 focus:outline-none sm:w-24 sm:px-3"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FictionalLeagueOriginScreen({ onSelect }: { onSelect: (mode: FictionalHistoryMode) => void }) {
  return (
    <div className={panelClass}>
      <div className={shellClass}>
        <div className="shrink-0 border-b border-gray-800 p-6 sm:p-8">
          <h2 className="text-3xl font-black uppercase tracking-tight text-white">League Origin</h2>
          <p className="font-medium text-gray-500">Choose how you want to begin your journey.</p>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-stretch justify-center gap-5 overflow-y-auto p-5 md:flex-row md:items-center md:gap-8 md:p-8">
          <button onClick={() => onSelect('brand_new')} className="group relative flex min-h-72 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-gray-800 bg-gray-900/50 p-8 text-left transition-all hover:border-red-500 hover:bg-gray-800/80 md:max-h-[400px] md:p-10">
            <div className="absolute left-0 top-0 h-1 w-full bg-red-600 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="mb-6"><span className="inline-flex rounded-full border border-red-500/30 bg-red-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-400">0 Years of History</span></div>
            <h3 className="mb-4 text-3xl font-black uppercase tracking-tight text-white transition-colors group-hover:text-red-400">Create New Timeline</h3>
            <p className="font-medium leading-relaxed text-gray-400">Begin with a blank league history. Records, champions, awards, and rivalries will be created by your simulation.</p>
            <div className="mt-auto pt-8"><span className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-red-500">Fantasy Draft <Calendar className="h-4 w-4" /></span></div>
          </button>
          <button onClick={() => onSelect('established')} className="group relative flex min-h-72 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-gray-800 bg-gray-900/50 p-8 text-left transition-all hover:border-blue-500 hover:bg-gray-800/80 md:max-h-[400px] md:p-10">
            <div className="absolute left-0 top-0 h-1 w-full bg-blue-600 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="mb-6"><span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-400">Continue History</span></div>
            <h3 className="mb-4 text-3xl font-black uppercase tracking-tight text-white transition-colors group-hover:text-blue-400">Continue History</h3>
            <p className="font-medium leading-relaxed text-gray-400">Preserve everything that happened before your selected season, then let the simulation create the future.</p>
            <div className="mt-auto pt-8"><span className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-blue-500">Historical Start <Trophy className="h-4 w-4" /></span></div>
          </button>
        </div>
      </div>
    </div>
  );
}

export function FictionalRosterSetupScreen({ onSelect }: { onSelect: (mode: FictionalRosterMode) => void }) {
  return (
    <div className={panelClass}>
      <div className={shellClass}>
        <div className="shrink-0 border-b border-gray-800 p-6 sm:p-8">
          <h2 className="text-3xl font-black uppercase tracking-tight text-white">Roster Setup</h2>
          <p className="font-medium text-gray-500">How should teams receive players?</p>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-stretch justify-center gap-5 overflow-y-auto p-5 md:flex-row md:items-center md:gap-8 md:p-8">
          <RosterChoice color="emerald" badge="Recommended" title="Use Current Rosters" description="Every team keeps its existing roster. History begins from this point." action="Start With Current Rosters" onClick={() => onSelect('current')} />
          <RosterChoice color="amber" badge="Draft Required" title="Fantasy Draft" description="Clear every roster and hold a league-wide fantasy draft before the first season." action="Start With Fantasy Draft" onClick={() => onSelect('fantasy_draft')} />
        </div>
      </div>
    </div>
  );
}

function RosterChoice({ color, badge, title, description, action, onClick }: { color: 'emerald' | 'amber'; badge: string; title: string; description: string; action: string; onClick: () => void }) {
  const badgeClass = color === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' : 'border-amber-500/30 bg-amber-500/20 text-amber-400';
  const buttonClass = color === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]';
  return (
    <div className="group relative flex min-h-72 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-gray-800 bg-gray-900/50 p-8 text-left transition-all hover:bg-gray-800/80 md:max-h-[400px] md:p-10">
      <div className="mb-6"><span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badgeClass}`}>{badge}</span></div>
      <h3 className="mb-4 text-3xl font-black uppercase tracking-tight text-white">{title}</h3>
      <p className="mb-8 flex-1 font-medium leading-relaxed text-gray-400">{description}</p>
      <button onClick={onClick} className={`w-full rounded py-4 text-lg font-black uppercase tracking-widest text-white transition-all ${buttonClass}`}>{action}</button>
    </div>
  );
}
