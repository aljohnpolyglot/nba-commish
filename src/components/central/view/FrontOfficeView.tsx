import React, { useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, TrendingUp, TrendingDown, HeartPulse, Plane, Hotel, Bus, Building2, Users, Target, Landmark, Shield, Timer, Dumbbell, Smile, AlertTriangle, Bed, Droplets, Snowflake, Moon, ScanLine, Search, SlidersHorizontal, Star, X, Award } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { formatCurrencyWithCode, computeAge } from '../../../utils/helpers';
import { SponsorshipNegotiationModal, type NegotiationMode } from '../../tycoon/SponsorshipNegotiationModal';
import { OpenMarketModal } from '../../tycoon/OpenMarketModal';
import { CurrentSponsorModal } from '../../tycoon/CurrentSponsorModal';
import { JerseyPreview } from '../../tycoon/JerseyPreview';
import { MedicalCard } from '../../tycoon/MedicalCard';
import { LedgerHistoryCard } from '../../tycoon/LedgerHistoryCard';
import {
  MEDICAL_BUDGET_MIN_EUR,
  MEDICAL_BUDGET_MAX_EUR,
  getFacilityTier,
  getImpactStats,
  medicalQuality,
  medicalQualityLabel,
  type MedicalFacilityKey,
} from '../../../services/tycoon/medicalEngine';
import { computeAnnualBudget } from '../../../services/tycoon/budgetEngine';
import { computeStarPower } from '../../../services/tycoon/starPower';
import { getCityPrestige } from '../../../services/tycoon/specs/spain';
import { ALL_SLOTS, type SponsorshipSlot, type TycoonState } from '../../../types/tycoon';
import { makePlaceholderCoach, makePlaceholderGM } from '../../../services/staff/staffFallback';
import { ensureStaffPoolDepth, inferEuroStaffLeagueId } from '../../../services/euro/staffPool';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import { FacilitiesSection } from './FrontOffice/sections/FacilitiesSection';
import { FinanceSection, AnnualProjectionCard } from './FrontOffice/sections/FinanceSection';
import { SponsorshipSection } from './FrontOffice/sections/SponsorshipSection';
import { TravelSection } from './FrontOffice/sections/TravelSection';
import { MedicalSection } from './FrontOffice/sections/MedicalSection';
import { StaffSection } from './FrontOffice/sections/StaffSection';
import { ScoutingSection } from './FrontOffice/sections/ScoutingSection';
import { ArenaSection } from './FrontOffice/sections/ArenaSection';
import { TrainingSection } from './FrontOffice/sections/TrainingSection';
import { AcademySection } from './FrontOffice/sections/AcademySection';
import { BoardPromisesCard } from './FrontOffice/sections/BoardPromisesCard';

type FrontOfficeSection = 'finances' | 'sponsorships' | 'medical' | 'facilities' | 'staff';

interface FrontOfficeViewProps {
  initialSection?: FrontOfficeSection;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({ initialSection = 'finances' }) => {
  const { state, dispatchAction, applyTycoonMutation, setCurrentView } = useGame() as any;
  const currency = state.leagueStats?.currency ?? 'EUR';
  const userTeamId = state.userTeamId;
  const selectedTeam = resolveAnyTeam(userTeamId, state.teams, state.nonNBATeams ?? []);
  const tycoon = (selectedTeam as any)?.tycoon;
  const budgetLocked = !!tycoon?.budgetLocked;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot; mode: NegotiationMode }>({ open: false, slot: 'kit', mode: 'renegotiate' });
  const [openMarketOpen, setOpenMarketOpen] = useState(false);
  const [currentSponsorModal, setCurrentSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot | null }>({ open: false, slot: null });
  const [travelModalOpen, setTravelModalOpen] = useState(false);
  const [medicalModalOpen, setMedicalModalOpen] = useState(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [arenaModalOpen, setArenaModalOpen] = useState(false);
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [academyModalOpen, setAcademyModalOpen] = useState(false);

  const handleTicketMultChange = (mult: number) => {
    if (budgetLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.ticketPriceMultiplier = Math.max(0.5, Math.min(2.0, mult));
    });
  };
  const handleScoutingInvestmentChange = (budget: number) => {
    if (budgetLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.scoutingInvestment = Math.max(50_000, Math.min(2_500_000, budget));
    });
  };
  // Lazily seed a minimal tycoon shell so NBA teams (no full tycoon state) can
  // still hire/fire/promote staff. Only the staff-related fields are touched;
  // none of the finance / sponsorship / medical fields get populated here.
  const ensureStaffShell = (t: any) => {
    if (!t.tycoon) t.tycoon = { staffMembers: [], firedStaffRoles: [], cashOnHand: 0 };
    if (!t.tycoon.staffMembers) t.tycoon.staffMembers = [];
    if (!t.tycoon.firedStaffRoles) t.tycoon.firedStaffRoles = [];
  };

  const handlePromoteStaff = (person: any, fromRole: string, toRole: string) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      ensureStaffShell(t);
      t.tycoon.staffMembers = t.tycoon.staffMembers.filter((s: any) => s.role !== fromRole && s.role !== toRole);
      t.tycoon.staffMembers.push({
        ...(person ?? {}),
        id: person?.id ?? `staff-${toRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        role: toRole,
      });
      if (!t.tycoon.firedStaffRoles.includes(fromRole)) t.tycoon.firedStaffRoles.push(fromRole);
      t.tycoon.firedStaffRoles = t.tycoon.firedStaffRoles.filter((r: string) => r !== toRole);
    });
  };

  const handleFireStaff = (role: string) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      ensureStaffShell(t);
      t.tycoon.staffMembers = t.tycoon.staffMembers.filter((s: any) => s.role !== role);
      if (!t.tycoon.firedStaffRoles.includes(role)) t.tycoon.firedStaffRoles.push(role);
    });
  };

  const handleHireStaff = (hire: any) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      ensureStaffShell(t);
      const staffMembers = t.tycoon.staffMembers.filter((s: any) => s.role !== hire.role);
      t.tycoon.staffMembers = [
        ...staffMembers,
        {
          id: `staff-${hire.role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
          role: hire.role,
          name: hire.name,
          nationality: hire.nationality,
          salary: hire.salary,
          contractYears: hire.years,
          rating: hire.rating,
          hiredYear: currentYear,
          signingBonus: hire.bonus,
          face: hire.face,
          staffImageId: hire.staffImageId,
        },
      ];
      t.tycoon.cashOnHand = Math.round((t.tycoon.cashOnHand ?? 0) - (hire.bonus ?? 0));
      t.tycoon.firedStaffRoles = (t.tycoon.firedStaffRoles ?? []).filter((r: string) => r !== hire.role);
    });
    // Hire pulls one member out of the FA pool; immediately top up to the
    // per-position floor so the modal never shows a depleted list next time.
    const remainingPool = (state.staffFreeAgents ?? []).filter((m: any) => m.id !== hire.id);
    const leagueId = inferEuroStaffLeagueId(userTeamId);
    const refilled = ensureStaffPoolDepth(
      { ...state, staffFreeAgents: remainingPool } as any,
      leagueId,
    );
    void dispatchAction({
      type: 'UPDATE_STATE',
      payload: { staffFreeAgents: refilled.staffFreeAgents ?? remainingPool },
    });
  };

  const handleMedicalBudgetChange = (budget: number) => {
    if (budgetLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.medicalBudget = Math.max(MEDICAL_BUDGET_MIN_EUR, Math.min(MEDICAL_BUDGET_MAX_EUR, budget));
    });
  };
  const handleAcademyBudgetChange = (budget: number) => {
    if (budgetLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.academyBudget = Math.max(0, Math.min(5, Math.round(budget)));
    });
  };
  const handleTravelSave = (prefs: { hotel: number; flight: number; bus: number }) => {
    if (budgetLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.travelPreferences = prefs;
    });
  };

  // Compute average opponent prestige + marquee opponent list (excl. self).
  const { avgOpponentPrestige, marqueeOpponents } = useMemo(() => {
    if (!selectedTeam) return { avgOpponentPrestige: 0.5, marqueeOpponents: [] as string[] };
    const opponents: any[] = [...(state.teams ?? []), ...(state.nonNBATeams ?? [])]
      .filter((t: any) => (t.id ?? t.tid) !== userTeamId && t.tycoon);
    if (opponents.length === 0) return { avgOpponentPrestige: 0.5, marqueeOpponents: [] };
    const prestigeOf = (t: any): number =>
      t.tycoon?.cityPrestige ?? getCityPrestige(t.name ?? t.region ?? '', t.tycoon?.tier ?? 'D');
    const total = opponents.reduce((sum, t) => sum + prestigeOf(t), 0);
    const avg = total / opponents.length;
    const marquee = opponents
      .filter(t => prestigeOf(t) >= 0.7)
      .map(t => (t.region && !String(t.name).includes(t.region)) ? `${t.region} ${t.name}` : t.name)
      .slice(0, 5);
    return { avgOpponentPrestige: avg, marqueeOpponents: marquee };
  }, [selectedTeam, state.teams, state.nonNBATeams, userTeamId]);

  const starPower = useMemo(() => computeStarPower(state.players ?? [], userTeamId), [state.players, userTeamId]);

  // Live ledger projection — reflects slider/sponsor changes immediately.
  const ledger = useMemo(() => {
    if (!selectedTeam || !tycoon) return null;
    return computeAnnualBudget(selectedTeam as any, {
      year: currentYear,
      endesaFinishPosition: (selectedTeam as any).lastEndesaFinish ?? 9,
      euroleagueStage: (selectedTeam as any).lastEuroleagueStage ?? 'none',
      euroleagueAwayGames: (selectedTeam as any).lastEuroAwayGames ?? 0,
      endesaPrizeEUR: 0,
      euroleaguePrizeEUR: 0,
      avgOpponentPrestige,
    }, state.players);
  }, [selectedTeam, tycoon, currentYear, avgOpponentPrestige, state.players]);

  // Staff section is also available in NBA GM mode where the team has no
  // tycoon shell — handlers below lazily init the staffMembers/firedRoles
  // fields they need. All the other sections (finances, sponsorships, etc.)
  // are euro-only and still require a real tycoon.
  if (!selectedTeam || (!tycoon && initialSection !== 'staff')) {
    return (
      <div className="h-full overflow-y-auto p-8 bg-slate-950 text-white">
        <button onClick={() => setCurrentView('Schedule')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-6">
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-slate-400">Front office is only available in club-management mode. Try reloading the save.</p>
      </div>
    );
  }

  const internationalAway = (selectedTeam as any).lastEuroAwayGames ?? 0;
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const commonHeader = (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300 flex items-center gap-2">
          <Briefcase size={12} /> Front Office{tycoon?.tier ? ` · Tier ${tycoon.tier}` : ''}
        </div>
        <h1 className="text-3xl font-black tracking-tight mt-1">{getTeamFullName(selectedTeam as any)}</h1>
        <p className="text-sm text-slate-400 mt-1">{tycoon ? 'Control club finances, sponsorships, medical investment, travel standards, staff, and scouting.' : 'Manage coaching, performance, and scouting staff.'}</p>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-slate-950 text-white">
      <div className="max-w-[1680px] mx-auto p-4 md:p-8 space-y-6">
        {commonHeader}
        {initialSection === 'finances' && ledger && (
          <FinanceSection
            ledger={ledger}
            fmt={fmt}
            cashOnHand={tycoon.cashOnHand ?? 0}
            currentYear={currentYear}
            starPower={starPower}
            tycoon={tycoon}
          />
        )}
        {initialSection === 'sponsorships' && (
          <SponsorshipSection
            tycoon={tycoon}
            currency={currency}
            avgOpponentPrestige={avgOpponentPrestige}
            marqueeOpponents={marqueeOpponents}
            onAction={(slot, mode) => {
              if (mode === 'find-new') setOpenMarketOpen(true);
              else if (mode === 'details') setCurrentSponsorModal({ open: true, slot });
              else setSponsorModal({ open: true, slot, mode });
            }}
            onTicketMultChange={handleTicketMultChange}
          />
        )}
        {initialSection === 'facilities' && (
          <FacilitiesSection
            tycoon={tycoon}
            fmt={fmt}
            onTravelDetails={() => setTravelModalOpen(true)}
            onMedicalDetails={() => setMedicalModalOpen(true)}
            onAnalyticsDetails={() => setAnalyticsModalOpen(true)}
            onArenaDetails={() => setArenaModalOpen(true)}
            onTrainingDetails={() => setTrainingModalOpen(true)}
            onAcademyDetails={() => setAcademyModalOpen(true)}
          />
        )}
        {initialSection === 'staff' && (
          <StaffSection state={state} team={selectedTeam as any} onHireStaff={handleHireStaff} onFireStaff={handleFireStaff} onPromoteStaff={handlePromoteStaff} />
        )}
      </div>

      <SponsorshipNegotiationModal
        open={sponsorModal.open}
        onClose={() => setSponsorModal({ open: false, slot: 'kit', mode: 'renegotiate' })}
        initialSlot={sponsorModal.slot}
        mode={sponsorModal.mode}
      />
      <OpenMarketModal open={openMarketOpen} onClose={() => setOpenMarketOpen(false)} />
      <CurrentSponsorModal
        open={currentSponsorModal.open}
        onClose={() => setCurrentSponsorModal({ open: false, slot: null })}
        slot={currentSponsorModal.slot}
        sponsor={currentSponsorModal.slot ? (tycoon?.sponsorships?.[currentSponsorModal.slot] ?? null) : null}
        currentYear={currentYear}
        currency={currency}
        jerseyPreview={selectedTeam ? <JerseyPreview teamName={getTeamFullName(selectedTeam as any)} /> : undefined}
        onRenegotiate={() => {
          const slot = currentSponsorModal.slot;
          if (!slot) return;
          setCurrentSponsorModal({ open: false, slot: null });
          setSponsorModal({ open: true, slot, mode: 'renegotiate' });
        }}
        onFindNewSponsors={() => {
          setCurrentSponsorModal({ open: false, slot: null });
          setOpenMarketOpen(true);
        }}
      />

      <AnimatePresence>
        {medicalModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMedicalModalOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-6xl min-w-0 sm:min-w-[800px] max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                  <HeartPulse size={18} className="text-rose-400" /> Medical & Recovery
                </h2>
                <button onClick={() => setMedicalModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <MedicalSection tycoon={tycoon} currency={currency} onMedicalBudgetChange={handleMedicalBudgetChange} locked={budgetLocked} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {travelModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTravelModalOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                  <Plane size={18} className="text-amber-400" /> Travel & Logistics
                </h2>
                <button onClick={() => setTravelModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <TravelSection
                tycoon={tycoon}
                currency={currency}
                domesticAwayGames={17}
                internationalAwayGames={internationalAway}
                onSave={(prefs) => { handleTravelSave(prefs); setTravelModalOpen(false); }}
                locked={budgetLocked}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {analyticsModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAnalyticsModalOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-6xl min-w-0 sm:min-w-[800px] max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                  <TrendingUp size={18} className="text-cyan-400" /> Analytics Lab
                </h2>
                <button onClick={() => setAnalyticsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <ScoutingSection tycoon={tycoon} currency={currency} onChange={handleScoutingInvestmentChange} locked={budgetLocked} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {arenaModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setArenaModalOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                  <Landmark size={18} className="text-amber-400" /> Arena & Fan Experience
                </h2>
                <button onClick={() => setArenaModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <ArenaSection
                tycoon={tycoon}
                teamName={getTeamFullName(selectedTeam as any)}
                teamAbbrev={(selectedTeam as any).abbrev}
                teamLogoUrl={(selectedTeam as any).logoUrl ?? (selectedTeam as any).imgURL}
                currency={currency}
                onTicketMultChange={handleTicketMultChange}
                locked={budgetLocked}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {trainingModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTrainingModalOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                  <Dumbbell size={18} className="text-sky-400" /> Training Facilities
                </h2>
                <button onClick={() => setTrainingModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <TrainingSection
                tycoon={tycoon}
                teamName={getTeamFullName(selectedTeam as any)}
                teamLogoUrl={(selectedTeam as any).logoUrl ?? (selectedTeam as any).imgURL}
                currency={currency}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {academyModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setAcademyModalOpen(false)} />
            <motion.div
              className="relative z-10 w-full max-w-5xl max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2 text-white">
                  <Target size={18} className="text-emerald-400" /> Youth Academy
                </h2>
                <button onClick={() => setAcademyModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <AcademySection
                tycoon={tycoon}
                teamName={getTeamFullName(selectedTeam as any)}
                players={state.players ?? []}
                userTeamId={userTeamId}
                simYear={currentYear}
                seniorRosterSize={(state.players ?? []).filter((p: any) => p.tid === userTeamId && computeAge(p, currentYear) > 19).length}
                onAcademyBudgetChange={handleAcademyBudgetChange}
                locked={budgetLocked}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
