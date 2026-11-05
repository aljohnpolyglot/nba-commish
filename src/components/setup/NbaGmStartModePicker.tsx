import React from 'react';
import { ArrowLeft, CalendarDays, ClipboardList, ShieldCheck, Trophy } from 'lucide-react';
import { getHistoricalNbaRuleOverrides } from '../../data/historicalNbaSeasons';
import { FIRST_ZENGM_RECONSTRUCTED_START_YEAR } from '../../data/historicalNbaRosterSources';
import { getPlayableInternationalWindowForSeason } from '../../services/fiba/tournamentWindows';
import type { NbaGmStartMode } from '../../types';
import { getDraftDate, toISODateString } from '../../utils/dateUtils';
import { playModdedSetupSound } from './moddedSetupAudio';

interface NbaGmStartModePickerProps {
  startYear: number;
  gameMode: 'commissioner' | 'gm';
  onSelect: (mode: NbaGmStartMode, date: string) => void;
  onBack: () => void;
}

type StartCard = {
  mode: NbaGmStartMode;
  title: string;
  stage: string;
  date: string;
  description: string;
  details: string[];
  icon: React.ReactNode;
  accent: string;
  available: boolean;
  unavailableText?: string;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDate = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export const NbaGmStartModePicker: React.FC<NbaGmStartModePickerProps> = ({
  startYear,
  gameMode,
  onSelect,
  onBack,
}) => {
  const seasonEndYear = startYear + 1;
  const rules = getHistoricalNbaRuleOverrides(startYear);
  const draftDate = getDraftDate(startYear, rules);
  const reviewFloor = new Date(Date.UTC(startYear, 5, 15));
  const tenDaysBeforeDraft = addDays(draftDate, -10);
  const reviewDate = toISODateString(
    tenDaysBeforeDraft.getTime() > reviewFloor.getTime() ? tenDaysBeforeDraft : reviewFloor,
  );
  const preseasonDate = `${startYear}-10-01`;
  const internationalWindow = getPlayableInternationalWindowForSeason(startYear);
  const fullOffseasonAvailable = startYear > FIRST_ZENGM_RECONSTRUCTED_START_YEAR;

  const cards: StartCard[] = [
    {
      mode: 'fixed_preseason',
      title: 'Opening Rosters',
      stage: 'Preseason',
      date: preseasonDate,
      description: 'Begin on October 1 with the selected season’s opening roster and lineups intact. The opening offseason is already complete.',
      details: ['Opening lineups', 'No offseason tasks', 'Schedule ready'],
      icon: <ShieldCheck size={26} />,
      accent: 'emerald',
      available: true,
    },
    {
      mode: 'full_offseason',
      title: 'Full Offseason',
      stage: 'Season Review',
      date: reviewDate,
      description: 'Begin with the completed-season review before Draft night. Run the lottery, NBA Draft, contracts, and free agency as a new branch.',
      details: ['Season Review', 'Redo the NBA Draft', 'Full player movement'],
      icon: <ClipboardList size={26} />,
      accent: 'indigo',
      available: fullOffseasonAvailable,
      unavailableText: `Full prior-season rosters begin with ${FIRST_ZENGM_RECONSTRUCTED_START_YEAR + 1}-${String(FIRST_ZENGM_RECONSTRUCTED_START_YEAR + 2).slice(-2)}.`,
    },
    ...(gameMode === 'gm' && internationalWindow ? [{
      mode: 'international' as const,
      title: internationalWindow.label,
      stage: 'Tournament Opening',
      date: internationalWindow.markerDate,
      description: 'Begin when the national-team tournament opens with the selected NBA rosters in place, then continue toward training camp.',
      details: ['National teams', 'Opening rosters', 'Before training camp'],
      icon: <Trophy size={26} />,
      accent: 'amber',
      available: true,
    }] : []),
  ];

  const accentClasses: Record<string, {
    border: string;
    icon: string;
    chip: string;
    button: string;
  }> = {
    emerald: {
      border: 'hover:border-emerald-400/70 hover:bg-emerald-500/5',
      icon: 'bg-emerald-500/15 text-emerald-300',
      chip: 'bg-emerald-500/10 text-emerald-300',
      button: 'bg-emerald-500 text-slate-950 group-hover:bg-emerald-400',
    },
    indigo: {
      border: 'hover:border-indigo-400/70 hover:bg-indigo-500/5',
      icon: 'bg-indigo-500/15 text-indigo-300',
      chip: 'bg-indigo-500/10 text-indigo-300',
      button: 'bg-indigo-500 text-white group-hover:bg-indigo-400',
    },
    amber: {
      border: 'hover:border-amber-400/70 hover:bg-amber-500/5',
      icon: 'bg-amber-500/15 text-amber-300',
      chip: 'bg-amber-500/10 text-amber-300',
      button: 'bg-amber-400 text-slate-950 group-hover:bg-amber-300',
    },
  };

  return (
    <div className="modded-setup modded-scanlines min-h-screen overflow-y-auto bg-[#07090e] px-4 py-20 text-slate-100 sm:px-6">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.22),_transparent_42%),linear-gradient(135deg,rgba(15,23,42,0.35),transparent_55%)]" />
      <button
        type="button"
        onClick={() => {
          playModdedSetupSound('back');
          onBack();
        }}
        className="fixed left-4 top-5 z-20 flex items-center gap-2 rounded px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-400 transition-colors hover:bg-white/5 hover:text-white sm:left-6 sm:top-6"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="mx-auto mb-9 max-w-2xl text-center">
          <div className="mb-3 text-[11px] font-black uppercase tracking-[0.24em] text-blue-400">
            {startYear}-{String(seasonEndYear).slice(-2)} NBA Career
          </div>
          <h1 className="modded-font-sport text-4xl font-black uppercase italic tracking-tight text-yellow-400 sm:text-5xl">Choose Your Starting Point</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {internationalWindow
              && gameMode === 'gm'
              ? 'Protect the opening roster, begin before the Draft, or open with international basketball.'
              : 'Protect the opening roster or begin before the Draft and shape the entire offseason.'}
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${gameMode === 'gm' && internationalWindow ? 'lg:grid-cols-3' : 'md:grid-cols-2'}`}>
          {cards.map(card => {
            const accent = accentClasses[card.accent];
            return (
              <button
                key={card.mode}
                type="button"
                disabled={!card.available}
                onMouseEnter={() => card.available && playModdedSetupSound('hover')}
                onClick={() => {
                  if (!card.available) return;
                  playModdedSetupSound('success');
                  onSelect(card.mode, card.date);
                }}
                className={`group relative flex min-h-[360px] flex-col overflow-hidden rounded-xl border-2 p-5 text-left transition-all sm:p-6 ${
                  card.available
                    ? `border-slate-800 bg-[#0b1021] shadow-[0_18px_50px_rgba(0,0,0,0.35)] ${accent.border}`
                    : 'cursor-not-allowed border-slate-900 bg-[#0b1021]/50 opacity-55'
                }`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-blue-500 to-yellow-400 opacity-80" />
                <div className="flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent.icon}`}>
                    {card.icon}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${accent.chip}`}>
                    {card.stage}
                  </span>
                </div>

                <h2 className="modded-font-sport mt-6 text-2xl font-black uppercase italic tracking-wide text-white">{card.title}</h2>
                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-400">
                  <CalendarDays size={15} />
                  {card.available ? formatDate(card.date) : card.unavailableText}
                </div>
                <p className="mt-5 flex-1 text-sm leading-6 text-slate-400">{card.description}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {card.details.map(detail => (
                    <span
                      key={detail}
                      className="rounded-lg border border-white/5 bg-slate-950/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-300"
                    >
                      {detail}
                    </span>
                  ))}
                </div>

                <div className={`mt-6 flex min-h-11 items-center justify-center rounded-lg border text-xs font-black uppercase italic tracking-widest transition-colors ${
                  card.available ? `${accent.button} border-white/20` : 'border-slate-700 bg-slate-800 text-slate-500'
                }`}>
                  {card.available ? 'Start Here' : 'Unavailable'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
