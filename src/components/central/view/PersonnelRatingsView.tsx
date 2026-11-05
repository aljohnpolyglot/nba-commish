import React, { useMemo } from 'react';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import type { Personnel } from './LeagueOfficeSearcher';
import { CoachPersonnelProfile } from './CoachPersonnelProfile';

const LABELS: Record<string, string> = {
  overall: 'Overall',
  trade_aggression: 'Trade Aggression',
  tradeAggression: 'Trade Aggression',
  scouting_focus: 'Scouting',
  scouting: 'Scouting',
  drafting: 'Drafting',
  negotiation: 'Negotiation',
  work_ethic: 'Work Ethic',
  workEthic: 'Work Ethic',
  spending: 'Spending',
  strictness: 'Strictness',
  freeThrowTendency: 'Free Throw Tendency',
  scoringEnvironment: 'Scoring Environment',
  consistency: 'Consistency',
  crewAuthority: 'Crew Authority',
  homeBias: 'Home Bias',
  awayBias: 'Away Bias',
  integrity: 'Integrity',
  tactics: 'Tactics',
  offense: 'Offense',
  defense: 'Defense',
  motivating: 'Motivating',
  manManagement: 'Man Management',
  levelOfDiscipline: 'Discipline',
  conditioning: 'Conditioning',
  physiotherapy: 'Physiotherapy',
  sportsScience: 'Sports Science',
  development: 'Development',
  adaptability: 'Adaptability',
  determination: 'Determination',
  judgingPlayerAbility: 'Judging Ability',
  judgingPlayerPotential: 'Judging Potential',
  negotiating: 'Negotiating',
};

const ORDER = Object.keys(LABELS);

function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function ratingTone(value: number): { bar: string; text: string } {
  if (value >= 85) return { bar: 'bg-emerald-400', text: 'text-emerald-300' };
  if (value >= 70) return { bar: 'bg-violet-400', text: 'text-violet-300' };
  if (value >= 55) return { bar: 'bg-amber-400', text: 'text-amber-300' };
  return { bar: 'bg-slate-500', text: 'text-slate-300' };
}

interface PersonnelRatingsViewProps {
  person: Personnel;
  onBack: () => void;
}

export const PersonnelRatingsView: React.FC<PersonnelRatingsViewProps> = ({ person, onBack }) => {
  const ratings = useMemo(() => {
    const source = person.attributes ?? person.refereeRatings ?? {};
    return Object.entries(source)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([key, value]) => ({ key, label: labelFor(key), value: Math.max(0, Math.min(100, Math.round(value))) }))
      .sort((a, b) => {
        const aIndex = ORDER.indexOf(a.key);
        const bIndex = ORDER.indexOf(b.key);
        if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
  }, [person.attributes, person.refereeRatings]);

  if (person.type === 'coach') {
    return (
      <CoachPersonnelProfile
        mode="ratings"
        person={person}
        onBack={onBack}
        portraitUrl={person.playerPortraitUrl}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <header className="flex items-center gap-4 border-b border-slate-800 bg-slate-900/90 p-4 backdrop-blur-md sm:p-5">
        <button onClick={onBack} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
          {person.playerPortraitUrl ? (
            <img src={person.playerPortraitUrl} alt={person.name} className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-black text-slate-500">{person.name.charAt(0)}</div>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-black text-white">{person.name}</h2>
          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {person.jobTitle ?? person.type.replace('_', ' ')}{person.team ? ` · ${person.team}` : ''}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <BarChart2 size={16} className="text-violet-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Ratings</span>
        </div>
        {ratings.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-8 text-center text-sm text-slate-500">
            No saved ratings are available for this person.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ratings.map(rating => {
              const tone = ratingTone(rating.value);
              return (
                <div key={rating.key} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-300">{rating.label}</span>
                    <span className={`text-sm font-black ${tone.text}`}>{rating.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${rating.value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
