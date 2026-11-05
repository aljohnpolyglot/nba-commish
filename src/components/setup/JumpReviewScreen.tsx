import React, { useState } from 'react';
import { getLeagueLabels } from '../../utils/leagueLabels';
import { getPbaDateContext, getPbaKeyDates } from './keyDates';
import { isNbaCupEra, isPlayInEra } from '../../data/historicalNbaSeasons';
import { getAllStarWeekendStartDate, toISODateString } from '../../utils/dateUtils';
import { getPlayableInternationalWindowForSeason } from '../../services/fiba/tournamentWindows';
import { getConferenceStartIso } from '../../services/pba/conferenceTransition';
import { playModdedSetupSound } from './moddedSetupAudio';

interface JumpReviewScreenProps {
  chosenDate: string;
  gameMode?: 'commissioner' | 'gm';
  leagueType?: 'fictional' | 'modded';
  moddedLeagueBase?: string;
  seasonEndYear?: number;
  onContinue: (assistantGM: boolean) => void;
  onBack: () => void;
}

interface ReviewItem {
  date: string;
  label: string;
  how: string;
  status: 'live' | 'placeholder';
}

interface UpcomingItem {
  date: string;
  label: string;
  sublabel: string;
}

const AUTO_RESOLVED_ITEMS: ReviewItem[] = [
  { date: '2025-08-13', label: '🌍 Global Games Schedule',      how: 'Set to none — optional feature',                    status: 'live' },
  { date: '2025-12-25', label: '🎄 Christmas Day Games',        how: 'Top 5 matchups by combined team strength',          status: 'live' },
  { date: '2026-01-14', label: '🗳️ All-Star Fan Voting',        how: 'Simulated across full 28-day period',               status: 'live' },
  { date: '2026-01-22', label: '⭐ All-Star Starters',           how: 'Top vote-getters per conference',                   status: 'live' },
  { date: '2026-01-29', label: '📋 All-Star Reserves',          how: 'Coaches picks auto-selected by ratings',            status: 'live' },
  { date: '2026-01-29', label: '🌟 Celebrity Game Roster',      how: 'Random selection from celebrity pool',              status: 'live' },
  { date: '2026-02-01', label: '🏀 Rising Stars Roster',        how: 'Top rookies and sophomores by rating',              status: 'live' },
  { date: '2026-02-05', label: '🏅 Dunk Contest Field',         how: 'Most athletic players auto-selected',               status: 'live' },
  { date: '2026-02-08', label: '🎯 3-Point Contest Field',      how: 'Best shooters auto-selected',                      status: 'live' },
  { date: '2026-02-13', label: '✨ All-Star Weekend',           how: 'All events fully simulated',                       status: 'live' },
  { date: '2026-02-15', label: '🔄 Trade Deadline',             how: 'Passed with no trades — rosters unchanged',        status: 'live' },
  { date: '2025-08-06', label: '📺 Broadcasting Deal',          how: 'Default ESPN/ABC + NBC/Peacock + Amazon applied; edit in Broadcasting before the season begins', status: 'live' },
  { date: '2025-08-14', label: '📅 Schedule Generated',        how: 'Full 82-game schedule generated on Aug 14 — Christmas + Global Games embedded', status: 'live' },
  { date: '2026-01-29', label: '🩺 All-Star Replacements',      how: 'Not yet available — auto-handled',                 status: 'placeholder' },
  { date: '2026-01-29', label: '🎯 Skills Challenge',           how: 'Auto-selected and resolved on All-Star Saturday',  status: 'live' },
  { date: '2026-01-29', label: '🌟 Shooting Stars',             how: 'Auto-selected and resolved on All-Star Saturday',  status: 'live' },
];

const EURO_AUTO_RESOLVED_ITEMS: ReviewItem[] = [
  { date: '2025-07-01', label: '↔️ Transfer Market Opens',   how: 'AI listings, bids, and release-clause activity lazy-sim daily', status: 'live' },
  { date: '2025-07-01', label: '💼 Staff + Sponsors',        how: 'Offseason front-office tasks are auto-resolved during the jump', status: 'live' },
  { date: '2025-09-01', label: '💪 Training Camp Prep',       how: 'Camp and preseason task gates are resolved before fixtures', status: 'live' },
  { date: '2025-09-22', label: '⭐ Supercopa',                how: 'Spanish curtain-raiser simulated if passed', status: 'live' },
  { date: '2025-09-28', label: '🏀 Liga Endesa Opening',      how: 'Domestic fixtures simulate through the selected date', status: 'live' },
  { date: '2025-10-01', label: '🏆 EuroLeague Opening',       how: 'Continental fixtures simulate for qualified clubs', status: 'live' },
  { date: '2026-02-13', label: '🏆 Copa del Rey',             how: 'Cup bracket simulated if passed', status: 'live' },
  { date: '2026-04-28', label: '⚡ EuroLeague Playoffs',      how: 'Postseason series inject and simulate through the jump', status: 'live' },
  { date: '2026-05-22', label: '🏆 EuroLeague Final Four',    how: 'Final Four resolved if passed', status: 'live' },
  { date: '2026-06-01', label: '⚡ Liga Endesa Playoffs',     how: 'Domestic postseason injects and simulates through the jump', status: 'live' },
  { date: '2026-06-20', label: '🏆 Liga Endesa Finals',       how: 'ACB champion resolved if passed', status: 'live' },
];

const EURO_UPCOMING_ITEMS: UpcomingItem[] = [
  { date: '2025-07-01', label: '↔️ Transfer Market Opens',    sublabel: 'Listings, bids, staff, sponsors, facilities' },
  { date: '2025-09-01', label: '💪 Training Camp Prep',        sublabel: 'Camp setup and preseason friendlies' },
  { date: '2025-09-22', label: '⭐ Supercopa',                 sublabel: 'Spanish curtain-raiser' },
  { date: '2025-09-28', label: '🏀 Liga Endesa Opening',       sublabel: 'Domestic season starts' },
  { date: '2025-10-01', label: '🏆 EuroLeague Opening',        sublabel: 'Continental season starts' },
  { date: '2026-02-13', label: '🏆 Copa del Rey',              sublabel: 'Domestic cup weekend' },
  { date: '2026-04-28', label: '⚡ EuroLeague Playoffs',       sublabel: 'Quarterfinals' },
  { date: '2026-05-22', label: '🏆 EuroLeague Final Four',     sublabel: 'Semifinal and final weekend' },
  { date: '2026-06-01', label: '⚡ Liga Endesa Playoffs',      sublabel: 'ACB postseason' },
  { date: '2026-06-20', label: '🏆 Liga Endesa Finals',        sublabel: 'Domestic title series' },
  { date: '2026-06-29', label: '🏁 Offseason',                 sublabel: 'Season complete' },
];

const UPCOMING_ITEMS: UpcomingItem[] = [
  { date: '2025-08-13', label: '📅 Set Christmas & Global Games',  sublabel: 'Planning window Aug 6-13' },
  { date: '2025-08-06', label: '📺 Broadcasting Deal',             sublabel: 'Default deal active — customize before Opening Night' },
  { date: '2025-08-14', label: '📅 Schedule Release',              sublabel: '82-game schedule generated with your settings' },
  { date: '2025-10-24', label: '🎉 Opening Night',                 sublabel: 'Season tips off' },
  { date: '2025-11-28', label: '🏆 NBA Cup',                       sublabel: 'In-Season Tournament begins' },
  { date: '2025-12-17', label: '🗳️ All-Star Voting Opens',         sublabel: 'Fan voting starts' },
  { date: '2025-12-25', label: '🎄 Christmas Games',               sublabel: 'Set your marquee matchups' },
  { date: '2026-01-22', label: '⭐ Announce Starters',             sublabel: 'Review fan vote results' },
  { date: '2026-01-29', label: '📋 Announce Reserves',            sublabel: 'Full All-Star rosters set' },
  { date: '2026-02-05', label: '🏅 Dunk Contest Field',            sublabel: 'Choose your participants' },
  { date: '2026-02-08', label: '🎯 3-Point Contest Field',         sublabel: 'Choose your participants' },
  { date: '2026-02-10', label: '🎤 Book AS Performer',             sublabel: 'All-Star Weekend concert' },
  { date: '2026-02-13', label: '✨ All-Star Weekend',              sublabel: 'Rising Stars Friday' },
  { date: '2026-02-15', label: '🔄 Trade Deadline',                sublabel: 'Last chance for moves' },
  { date: '2026-04-15', label: '🏁 Regular Season Ends',           sublabel: 'Playoff bracket generates' },
  { date: '2026-04-16', label: '🏆 Play-In Begins',                sublabel: 'Postseason starts' },
];

const shiftSeasonDate = (date: string, seasonEndYear: number): string => {
  if (date.startsWith('2025-')) return `${seasonEndYear - 1}${date.slice(4)}`;
  if (date.startsWith('2026-')) return `${seasonEndYear}${date.slice(4)}`;
  return date;
};

const shiftReviewItem = <T extends { date: string; label: string }>(item: T, seasonEndYear: number): T => ({
  ...item,
  label: item.label.replace('2025-26', `${seasonEndYear - 1}-${String(seasonEndYear).slice(-2)}`),
  date: item.label.includes('All-Star Weekend')
    ? toISODateString(getAllStarWeekendStartDate(seasonEndYear))
    : shiftSeasonDate(item.date, seasonEndYear),
});

const keepForNbaEra = (item: Pick<ReviewItem, 'label'> & { sublabel?: string }, seasonEndYear: number): boolean => {
  const startYear = seasonEndYear - 1;
  const text = `${item.label} ${item.sublabel ?? ''}`;
  if (!isNbaCupEra(startYear) && /cup|tournament/i.test(text)) return false;
  if (!isPlayInEra(startYear) && /play-in/i.test(text)) return false;
  return true;
};

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}, ${y}`;
};

export const JumpReviewScreen: React.FC<JumpReviewScreenProps> = ({ chosenDate, gameMode, leagueType, moddedLeagueBase, seasonEndYear = 2026, onContinue, onBack }) => {
  const [assistantGM, setAssistantGM] = useState(true);
  const isModded = leagueType === 'modded';
  const labels = getLeagueLabels(leagueType);
  const isPba = moddedLeagueBase === 'philippines';
  const isEuro = moddedLeagueBase === 'europe';
  const internationalWindow = !isPba && !isEuro && leagueType === 'modded'
    ? getPlayableInternationalWindowForSeason(seasonEndYear - 1)
    : undefined;
  const nbaBaseDate = `${seasonEndYear - 1}-08-06`;
  const baseDate = isEuro
    ? '2025-07-01'
    : isPba
      ? getConferenceStartIso('philippine', seasonEndYear)
      : internationalWindow?.markerDate && internationalWindow.markerDate < nbaBaseDate
        ? internationalWindow.markerDate
        : nbaBaseDate;
  const daysSkipped = daysBetween(baseDate, chosenDate);
  const estSeconds = Math.max(1, Math.ceil(daysSkipped / 25));
  const estGames = Math.round(daysSkipped * 1.2);
  const pbaContext = isPba ? getPbaDateContext(chosenDate) : null;
  const pbaItems = isPba ? getPbaKeyDates(seasonEndYear) : [];
  const autoItems = isEuro
    ? EURO_AUTO_RESOLVED_ITEMS
    : isPba
      ? pbaItems.map(item => ({
          date: item.date,
          label: `${item.icon} ${item.label}`,
          how: item.sublabel ?? 'Completed during the jump',
          status: item.placeholder ? 'placeholder' as const : 'live' as const,
        }))
      : AUTO_RESOLVED_ITEMS
          .filter(item => keepForNbaEra(item, seasonEndYear))
          .map(item => shiftReviewItem(item, seasonEndYear));
  const upcomingItems = isEuro
    ? EURO_UPCOMING_ITEMS
    : isPba
      ? pbaItems.map(item => ({
          date: item.date,
          label: `${item.icon} ${item.label}`,
          sublabel: item.sublabel ?? '',
        }))
      : [
          ...UPCOMING_ITEMS
            .filter(item => keepForNbaEra(item, seasonEndYear))
            .map(item => shiftReviewItem(item, seasonEndYear)),
          ...(internationalWindow ? [{
            date: internationalWindow.markerDate,
            label: `🌍 ${internationalWindow.label}`,
            sublabel: 'National-team tournament available in International',
          }] : []),
        ];

  const resolved = autoItems
    .filter(item => item.date < chosenDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = upcomingItems
    .filter(item => item.date >= chosenDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
    .map(item => ({ ...item, daysAway: daysBetween(chosenDate, item.date) }));
  const normalizedUpcoming = isPba || isEuro ? upcoming : upcoming.map(item => ({
    ...item,
    label: item.label.replace('NBA Cup', labels.cupShort),
  }));

  return (
    <div className={`${isModded ? 'modded-setup modded-scanlines bg-[#07090e]' : 'bg-slate-950'} min-h-screen flex items-center justify-center p-6 relative overflow-hidden`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl">

        <div className="text-center mb-8">
          <h2 className={`${isModded ? 'modded-font-sport text-yellow-400 italic uppercase' : 'text-white'} text-3xl font-black tracking-tight mb-2`}>Before You Jump</h2>
          <p className="text-slate-400 text-sm">
            Starting on <span className="text-indigo-400 font-bold">{formatDate(chosenDate)}</span> —
            {pbaContext && <span> <span className="text-amber-300 font-bold">{pbaContext}</span> —</span>}
            here's what will be auto-resolved and what awaits you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

          {/* Auto-resolved */}
          <div className={`${isModded ? 'rounded-xl border-2 border-blue-600/70 bg-[#0b1021]' : 'rounded-2xl border border-slate-800 bg-slate-900/60'} p-5`}>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">
              Auto-Resolved Before {formatDate(chosenDate)}
            </h3>
            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
              {resolved.length === 0 ? (
                <p className="text-slate-600 text-sm italic">Nothing to auto-resolve — you're starting at the beginning.</p>
              ) : (
                resolved.map((item, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 py-2 border-b border-white/5 last:border-0 ${item.status === 'placeholder' ? 'opacity-40' : ''}`}
                  >
                    <div className={`mt-0.5 shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded ${item.status === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                      {item.status === 'live' ? '✓' : '🔮'}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold ${item.status === 'live' ? 'text-white' : 'text-slate-500 italic'}`}>
                        {item.label}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{item.how}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming */}
          <div className={`${isModded ? 'rounded-xl border border-blue-500/45 bg-[#050814]' : 'rounded-2xl border border-slate-800 bg-slate-900/60'} p-5`}>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">
              Awaiting You
            </h3>
            <div className="space-y-2">
              {normalizedUpcoming.length === 0 ? (
                <p className="text-slate-600 text-sm italic">Nothing scheduled in the near future.</p>
              ) : (
                normalizedUpcoming.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <div className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 whitespace-nowrap">
                      {item.daysAway === 0 ? 'Today' : `${item.daysAway}d`}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.label}</div>
                      <div className="text-[10px] text-slate-500">{item.sublabel}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Assistant GM toggle — GM mode only */}
        {gameMode === 'gm' && (
          <div
            className={`mb-6 rounded-2xl border p-4 flex items-start gap-4 cursor-pointer transition-all ${
              assistantGM
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
            }`}
            onClick={() => setAssistantGM(v => !v)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-black text-white">Assistant GM</span>
                {assistantGM && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                    ON
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {assistantGM
                  ? 'Your Assistant GM will run the franchise while you\'re away — re-signings, free agency, waivers, trades, two-way promotions, and extensions. We\'ll keep the lights on until you\'re back.'
                  : 'Your team will be frozen. No signings, no trades, no waivings. Contracts that expire will not be renewed — you may return to an empty roster.'}
              </p>
              {!assistantGM && daysSkipped > 100 && (
                <p className="text-xs text-amber-400 font-bold mt-1">
                  ⚠️ Long jump with no Assistant GM — expired contracts won't be renewed.
                </p>
              )}
            </div>
            <div className="shrink-0 mt-0.5">
              <div
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${assistantGM ? 'bg-emerald-600' : 'bg-slate-700'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${assistantGM ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between gap-4 px-2">
          <button
            onClick={() => {
              if (isModded) playModdedSetupSound('back');
              onBack();
            }}
            className="text-slate-400 hover:text-white text-sm font-bold transition-colors px-4 py-2"
          >
            ← Back
          </button>

          <div className="text-center text-xs text-slate-500">
            {pbaContext && (
              <>
                <span className="text-amber-300 font-bold">{pbaContext}</span>
                {' · '}
              </>
            )}
            Simulating <span className="text-white font-bold">{daysSkipped} days</span>
            {' · '}
            <span className="text-white font-bold">~{estGames} games</span>
            {' · '}
            Estimated <span className="text-white font-bold">{estSeconds}s</span>
          </div>

          <button
            onClick={() => {
              if (isModded) playModdedSetupSound('success');
              onContinue(gameMode === 'gm' ? assistantGM : false);
            }}
            className={`${isModded ? 'modded-font-sport rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-700 to-indigo-900 italic shadow-[0_0_24px_rgba(37,99,235,0.28)] hover:from-blue-600 hover:to-indigo-800' : 'rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/20 hover:bg-indigo-500'} px-6 py-2.5 text-white text-sm font-black transition-all flex items-center gap-2`}
          >
            Let's Go →
          </button>
        </div>

      </div>
    </div>
  );
};
