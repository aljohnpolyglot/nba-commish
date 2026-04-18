import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Search, Crown, Hourglass } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';
import { SettingsManager } from '../../../../services/SettingsManager';
import { careerWinShares, upcomingHOFCandidates, HOF_WAIT_YEARS, getHOFCeremonyDateString } from '../../../../services/playerDevelopment/hofChecker';
import { fetchHOFData, ProcessedHOFPlayer } from '../../../../data/HOFData';
import type { NBAPlayer } from '../../../../types';
import HOFSection, { HOFInductee } from './components/HOFSection';

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

// Adapt a ProcessedHOFPlayer (external gist shape) into our NBAPlayer-ish shape so
// the same HOFCard renders both simulated retirees and real-world HOF legends.
function adaptExternalPlayer(p: ProcessedHOFPlayer): NBAPlayer {
  return {
    internalId: `ext-${normalize(p.name)}`,
    name: p.name,
    tid: p.tid ?? -1,
    pos: p.pos,
    hgt: p.hgt,
    weight: p.weight,
    imgURL: p.imgURL,
    born: p.born,
    draft: p.draft as any,
    awards: p.awards,
    hof: true,
    retiredYear: p.retiredYear,
    hofInductionYear: p.inductionYear,
    status: 'Retired',
    overallRating: 0,
  } as unknown as NBAPlayer;
}

export default function HallofFameView() {
  const { state } = useGame();
  const [searchQuery, setSearchQuery] = useState('');
  const [externalInductees, setExternalInductees] = useState<ProcessedHOFPlayer[]>([]);
  const [externalLoading, setExternalLoading] = useState(true);

  const currentYear = state.leagueStats?.year ?? 2026;
  const hofThreshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  // Ceremony cutoff (Sept 6 of each induction year). External classes only
  // appear once their ceremony date has been reached in-game.
  const currentDate = (state.date ?? `${currentYear - 1}-08-06`).slice(0, 10);

  // Load real-world HOF data on mount (merges roster + missing + heavy gists)
  useEffect(() => {
    let cancelled = false;
    fetchHOFData()
      .then(data => { if (!cancelled) setExternalInductees(data); })
      .catch(err => console.error('[HOF] External fetch failed:', err))
      .finally(() => { if (!cancelled) setExternalLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Merge external + in-game inductees, dedupe by normalized name (in-game wins)
  const inductees: HOFInductee[] = useMemo(() => {
    const byName = new Map<string, HOFInductee>();

    externalInductees.forEach(p => {
      if (!p.name || !p.inductionYear) return;
      // Date gate: a class only appears after its ceremony (first Saturday of September) in-game
      const ceremonyDate = getHOFCeremonyDateString(p.inductionYear);
      if (currentDate < ceremonyDate) return;
      const key = normalize(p.name);
      byName.set(key, {
        player: adaptExternalPlayer(p),
        inductionYear: p.inductionYear,
        careerWS: 0, // no sim stats for real-world legends
      });
    });

    // Only in-game players formally inducted by runHOFChecks (hofInductionYear
    // set) can overwrite an external entry. Source-data hof flags from the BBGM
    // import (Dwight Howard, etc.) must NOT clobber the curated induction year
    // from the HOF gist — otherwise Howard ends up in Class of 2023 (retiredYear)
    // instead of Class of 2025 (his real ceremony).
    (state.players ?? []).filter(p => p.hof === true && p.hofInductionYear).forEach(p => {
      const key = normalize(p.name);
      byName.set(key, {
        player: p,
        inductionYear: p.hofInductionYear as number,
        careerWS: careerWinShares(p),
      });
    });

    return Array.from(byName.values());
  }, [externalInductees, state.players, currentYear, currentDate]);

  const filteredInductees = useMemo(() => {
    if (!searchQuery.trim()) return inductees;
    const q = searchQuery.toLowerCase();
    return inductees.filter(i => i.player.name.toLowerCase().includes(q));
  }, [inductees, searchQuery]);

  const groupedByYear = useMemo(() => {
    const groups: Record<number, HOFInductee[]> = {};
    filteredInductees.forEach(i => {
      if (!groups[i.inductionYear]) groups[i.inductionYear] = [];
      groups[i.inductionYear].push(i);
    });
    return Object.entries(groups)
      .map(([year, players]) => ({ year: parseInt(year), players }))
      .sort((a, b) => b.year - a.year);
  }, [filteredInductees]);

  const upcoming = useMemo(() => {
    return upcomingHOFCandidates(state.players ?? [], currentYear, hofThreshold).slice(0, 8);
  }, [state.players, currentYear, hofThreshold]);

  return (
    <div className="h-full overflow-y-auto bg-regal-black text-regal-paper selection:bg-regal-gold selection:text-regal-black" style={{ scrollbarWidth: 'thin' }}>
      {/* Hero — cinematic basketball background */}
      <header className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
        <div className="absolute inset-0 z-0">
          <div
            className="absolute inset-0 bg-cover bg-center bg-fixed opacity-20"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop')" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.05),transparent_50%)]" />
          <div className="absolute inset-0 bg-regal-black/40" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="relative z-10"
        >
          <Crown className="mx-auto mb-4 text-regal-gold" size={48} />
          <span className="mb-4 block font-serif text-lg italic text-regal-gold md:text-xl">Celebrating Greatness</span>
          <h1 className="mb-6 font-display text-5xl font-black leading-tight text-regal-paper md:text-8xl lg:text-9xl">
            HALL OF <br />
            <span className="gold-gradient-text">FAME</span>
          </h1>
          <p className="mx-auto max-w-2xl px-4 font-serif text-base italic text-zinc-400 md:text-xl">
            "The legends who defined the game, honored for eternity in the hallowed halls of basketball history."
          </p>
        </motion.div>

      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-12">
        {/* Search */}
        <div className="mb-16 flex flex-col gap-4 rounded-2xl border border-zinc-900 bg-zinc-950/50 p-5 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input
              type="text"
              placeholder="Search legends..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-zinc-800 bg-zinc-900/50 py-3 pl-12 pr-6 text-sm text-regal-paper outline-none transition-all placeholder:text-zinc-600 focus:border-regal-gold/50 focus:ring-1 focus:ring-regal-gold/50"
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            <Trophy size={14} className="text-regal-gold" />
            <span>{filteredInductees.length} {filteredInductees.length === 1 ? 'Legend' : 'Legends'}</span>
          </div>
        </div>

        {/* Upcoming Inductees — HOF Watch */}
        {upcoming.length > 0 && (
          <section className="mb-16 rounded-2xl border border-regal-gold/20 bg-gradient-to-br from-regal-gold/5 to-transparent p-6">
            <div className="mb-4 flex items-center gap-3">
              <Hourglass className="text-regal-gold" size={20} />
              <div>
                <h2 className="font-display text-xl font-bold text-regal-paper">Awaiting Induction</h2>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">Retired greats inside the {HOF_WAIT_YEARS}-season waiting period</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {upcoming.map(c => (
                <div key={c.player.internalId} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-center gap-3">
                    {c.player.imgURL ? (
                      <img src={c.player.imgURL} alt={c.player.name} className="h-10 w-10 rounded-full object-cover object-top" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
                        <Trophy size={14} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-regal-paper">{c.player.name}</div>
                      {c.firstBallot && (
                        <div className="mt-0.5">
                          <span className="rounded bg-regal-gold/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-regal-gold">1st Ballot</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase tracking-wider text-zinc-600">Class of</div>
                      <div className="text-sm font-bold text-regal-gold">
                        {c.eligibleYear}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sections */}
        {externalLoading && inductees.length === 0 ? (
          <div className="flex h-96 flex-col items-center justify-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-regal-gold border-t-transparent" />
            <span className="font-serif text-lg italic text-regal-gold">Curating the gallery...</span>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {groupedByYear.length > 0 ? (
              groupedByYear.map(group => (
                <HOFSection key={group.year} year={group.year} inductees={group.players} />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-24 text-center"
              >
                <Trophy className="mx-auto mb-6 text-zinc-700" size={48} />
                <p className="mb-2 font-serif text-xl italic text-zinc-500">
                  No legends found matching your search.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
