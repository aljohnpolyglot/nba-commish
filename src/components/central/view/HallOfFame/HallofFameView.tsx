import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Search, Crown, Hourglass } from 'lucide-react';
import { useGame } from '../../../../store/GameContext';
import { SettingsManager } from '../../../../services/SettingsManager';
import { careerWinShares, upcomingHOFCandidates, HOF_FIRST_BALLOT_WAIT_YEARS, HOF_BORDERLINE_WAIT_YEARS, getHOFCeremonyDateString } from '../../../../services/playerDevelopment/hofChecker';
import { filterExternalHOFInducteesForTimeline, getExternalHOFMaxInductionYear } from '../../../../services/playerDevelopment/hofHistoryWindow';
import { adaptProcessedHOFPlayer, fetchHOFData, getCachedHOFData, ProcessedHOFPlayer } from '../../../../data/HOFData';
import type { NBAPlayer } from '../../../../types';
import { normalizeDate } from '../../../../utils/helpers';
import HOFSection, { HOFInductee } from './components/HOFSection';
import { PlayerBioView } from '../PlayerBioView';
import { CommissionerHofEndorsementPanel } from './CommissionerHofEndorsementPanel';
import { isStaffRetirementRecordInMode } from '../../../../services/staff/staffRetirement';
import { StaffHOFSection } from './components/StaffHOFSection';
import { getPlayerImage } from '../../../../utils/playerImage';
import { PlayerPortrait } from '../../../shared/PlayerPortrait';
import { resolveCanonicalPersonId, resolvePlayerByCanonicalPersonId } from '../../../../utils/playerIdentity';

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

export default function HallofFameView() {
  const { state, navigateToPlayer } = useGame();
  const [searchQuery, setSearchQuery] = useState('');
  const [externalInductees, setExternalInductees] = useState<ProcessedHOFPlayer[]>([]);
  const [externalLoading, setExternalLoading] = useState(true);
  const [viewingPlayer, setViewingPlayer] = useState<NBAPlayer | null>(null);

  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const hofThreshold = SettingsManager.getSettings().hofWSThreshold ?? 50;
  // Ceremony cutoff (Sept 6 of each induction year). External classes only
  // appear once their ceremony date has been reached in-game.
  const currentDate = normalizeDate(state.date ?? `${currentYear - 1}-08-06`);
  const isFictional = state.leagueType === 'fictional';
  const hofTimelineInput = {
    currentYear,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  };
  const externalMaxInductionYear = getExternalHOFMaxInductionYear(hofTimelineInput);
  const openPlayer = (player: NBAPlayer) => {
    const canonical = resolvePlayerByCanonicalPersonId(state.players, resolveCanonicalPersonId(player));
    if (canonical) navigateToPlayer(canonical);
    else setViewingPlayer(player);
  };

  // Load real-world HOF data on mount — skipped for fictional leagues
  useEffect(() => {
    if (isFictional) { setExternalLoading(false); return; }
    let cancelled = false;
    const cached = getCachedHOFData({ maxInductionYear: externalMaxInductionYear });
    if (cached.length > 0) {
      setExternalInductees(cached);
      setExternalLoading(false);
    }
    fetchHOFData({ maxInductionYear: externalMaxInductionYear })
      .then(data => { if (!cancelled) setExternalInductees(data); })
      .catch(err => console.error('[HOF] External fetch failed:', err))
      .finally(() => { if (!cancelled) setExternalLoading(false); });
    return () => { cancelled = true; };
  }, [externalMaxInductionYear, isFictional]);

  const timelineExternalInductees = useMemo(() => {
    return filterExternalHOFInducteesForTimeline(externalInductees, hofTimelineInput);
  }, [externalInductees, currentYear, state.leagueType, state.moddedLeagueBase, state.nbaStartYear]);

  // Merge external + in-game inductees, dedupe by normalized name (in-game wins)
  const inductees: HOFInductee[] = useMemo(() => {
    const byName = new Map<string, HOFInductee>();

    timelineExternalInductees.forEach(p => {
      if (!p.name || !p.inductionYear) return;
      // Date gate: a class only appears after its ceremony (first Saturday of September) in-game
      const ceremonyDate = getHOFCeremonyDateString(p.inductionYear);
      if (currentDate < ceremonyDate) return;
      const key = normalize(p.name);
      const player = adaptProcessedHOFPlayer(p);
      byName.set(key, {
        player,
        inductionYear: p.inductionYear,
        careerWS: careerWinShares(player),
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
  }, [timelineExternalInductees, state.players, currentYear, currentDate]);

  const filteredInductees = useMemo(() => {
    if (!searchQuery.trim()) return inductees;
    const q = searchQuery.toLowerCase();
    return inductees.filter(i => i.player.name.toLowerCase().includes(q));
  }, [inductees, searchQuery]);
  const filteredStaffHonorees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (state.staffHallOfFame ?? [])
      .filter(record => isStaffRetirementRecordInMode(record, state.leagueStats?.uiMode))
      .filter(record => !query || record.name.toLowerCase().includes(query) || record.teamName.toLowerCase().includes(query));
  }, [searchQuery, state.leagueStats?.uiMode, state.staffHallOfFame]);

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
    const byId = new Map<string, ReturnType<typeof upcomingHOFCandidates>[number]>();
    const currentCalendarYear = Number(currentDate.slice(0, 4)) || currentYear;
    upcomingHOFCandidates(state.players ?? [], currentYear, hofThreshold)
      .forEach(candidate => byId.set(candidate.player.internalId, candidate));

    (state.players ?? []).forEach(player => {
      if (player.hof) return;
      const scheduledYear = Number((player as any).scheduledHofInductionYear ?? 0);
      if (!scheduledYear || scheduledYear < currentCalendarYear) return;
      if (currentDate >= getHOFCeremonyDateString(scheduledYear)) return;
      const retiredYear = Number(player.retiredYear ?? 0);
      const firstBallot = retiredYear > 0 && scheduledYear === retiredYear + HOF_FIRST_BALLOT_WAIT_YEARS;
      byId.set(player.internalId, {
        player,
        yearsUntilEligible: scheduledYear - currentCalendarYear,
        eligibleYear: scheduledYear,
        careerWS: careerWinShares(player),
        firstBallot,
        tier: firstBallot ? 'first_ballot' : 'regular',
        tierLabel: firstBallot ? 'First Ballot' : 'Scheduled Class',
        waitYears: retiredYear > 0 ? Math.max(0, scheduledYear - retiredYear) : 0,
      });
    });

    return Array.from(byId.values())
      .sort((a, b) => a.eligibleYear - b.eligibleYear || b.careerWS - a.careerWS)
      .slice(0, 8);
  }, [state.players, currentYear, currentDate, hofThreshold, state.leagueType, state.moddedLeagueBase, state.nbaStartYear]);

  if (viewingPlayer) {
    return <PlayerBioView player={viewingPlayer} onBack={() => setViewingPlayer(null)} />;
  }

  return (
    <div className="h-full overflow-y-auto bg-regal-black text-regal-paper selection:bg-regal-gold selection:text-regal-black" style={{ scrollbarWidth: 'thin' }}>
      <CommissionerHofEndorsementPanel />
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
            <span>{filteredInductees.length + filteredStaffHonorees.length} {(filteredInductees.length + filteredStaffHonorees.length) === 1 ? 'Legend' : 'Legends'}</span>
          </div>
        </div>

        {/* Upcoming Inductees — HOF Watch */}
        {upcoming.length > 0 && (
          <section className="mb-16 rounded-2xl border border-regal-gold/20 bg-gradient-to-br from-regal-gold/5 to-transparent p-6">
            <div className="mb-4 flex items-center gap-3">
              <Hourglass className="text-regal-gold" size={20} />
              <div>
                <h2 className="font-display text-xl font-bold text-regal-paper">Awaiting Induction</h2>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">First ballot opens after {HOF_FIRST_BALLOT_WAIT_YEARS} seasons retired; late-ballot cases can run as long as {HOF_BORDERLINE_WAIT_YEARS}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {upcoming.map(c => (
                <div key={c.player.internalId} onClick={() => openPlayer(c.player)} className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition-all hover:border-regal-gold/50 hover:bg-zinc-900">
                  <div className="flex items-center gap-3">
                    <PlayerPortrait
                      imgUrl={getPlayerImage(c.player)}
                      face={c.player.face}
                      playerName={c.player.name}
                      size={40}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-regal-paper">{c.player.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <span className={`rounded px-1.5 text-[9px] font-bold uppercase tracking-wider ${
                          c.tier === 'first_ballot'
                            ? 'bg-regal-gold/20 text-regal-gold'
                            : c.tier === 'borderline'
                              ? 'bg-rose-500/15 text-rose-300'
                              : 'bg-sky-500/15 text-sky-300'
                        }`}>
                          {c.tierLabel}
                        </span>
                        <span className="rounded bg-zinc-800 px-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                          {c.yearsUntilEligible === 0 ? 'Eligible Now' : `${c.yearsUntilEligible}y Left`}
                        </span>
                      </div>
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
        <StaffHOFSection records={filteredStaffHonorees} currentDate={currentDate} />

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
                <HOFSection
                  key={group.year}
                  year={group.year}
                  inductees={group.players}
                  onPlayerClick={openPlayer}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-24 text-center"
              >
                <Trophy className="mx-auto mb-6 text-zinc-700" size={48} />
                <p className="mb-2 font-serif text-xl italic text-zinc-500">
                  {isFictional && !searchQuery.trim()
                    ? 'No Hall of Fame yet for this league.'
                    : 'No legends found matching your search.'}
                </p>
                {isFictional && !searchQuery.trim() && (
                  <p className="font-serif text-sm text-zinc-700 italic">
                    The first class will be inducted once players have retired and served their waiting period.
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
