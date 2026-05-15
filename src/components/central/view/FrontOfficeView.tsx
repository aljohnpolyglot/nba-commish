import React, { useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, TrendingUp, TrendingDown, HeartPulse, Plane, Hotel, Bus, Building2, Users, Target, Landmark, Shield, Timer, Dumbbell, Smile, AlertTriangle, Bed, Droplets, Snowflake, Moon, ScanLine, Search, SlidersHorizontal, Star, X, Award } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { formatCurrencyWithCode } from '../../../utils/helpers';
import { SponsorshipNegotiationModal, type NegotiationMode } from '../../tycoon/SponsorshipNegotiationModal';
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
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import { FacilitiesSection } from './FrontOffice/sections/FacilitiesSection';
import { FinanceSection, AnnualProjectionCard } from './FrontOffice/sections/FinanceSection';
import { SponsorshipSection } from './FrontOffice/sections/SponsorshipSection';
import { TravelSection } from './FrontOffice/sections/TravelSection';
import { MedicalSection } from './FrontOffice/sections/MedicalSection';
import { StaffSection } from './FrontOffice/sections/StaffSection';
import { ScoutingSection } from './FrontOffice/sections/ScoutingSection';
import { BoardPromisesCard } from './FrontOffice/sections/BoardPromisesCard';

type FrontOfficeSection = 'finances' | 'sponsorships' | 'medical' | 'facilities' | 'staff' | 'scouting';

interface FrontOfficeViewProps {
  initialSection?: FrontOfficeSection;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({ initialSection = 'finances' }) => {
  const { state, dispatchAction, applyTycoonMutation, setCurrentView } = useGame() as any;
  const currency = state.leagueStats?.currency ?? 'EUR';
  const userTeamId = state.userTeamId;
  const selectedTeam = resolveAnyTeam(userTeamId, state.teams, state.nonNBATeams ?? []);
  const tycoon = (selectedTeam as any)?.tycoon;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot; mode: NegotiationMode }>({ open: false, slot: 'kit', mode: 'renegotiate' });
  const [travelModalOpen, setTravelModalOpen] = useState(false);
  const [medicalModalOpen, setMedicalModalOpen] = useState(false);

  const handleTicketMultChange = (mult: number) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.ticketPriceMultiplier = Math.max(0.5, Math.min(2.0, mult));
    });
  };
  const handleScoutingInvestmentChange = (budget: number) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.scoutingInvestment = Math.max(50_000, Math.min(2_500_000, budget));
    });
  };
  const handleHireStaff = (hire: any) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      const staffMembers = (t.tycoon.staffMembers ?? []).filter((s: any) => s.role !== hire.role);
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
        },
      ];
      t.tycoon.cashOnHand = Math.round((t.tycoon.cashOnHand ?? 0) - (hire.bonus ?? 0));
    });
    if (hire.id && !String(hire.id).startsWith('emergency-')) {
      void dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          staffFreeAgents: (state.staffFreeAgents ?? []).filter((member: any) => member.id !== hire.id),
        },
      });
    }
  };

  const handleMedicalBudgetChange = (budget: number) => {
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.medicalBudget = Math.max(MEDICAL_BUDGET_MIN_EUR, Math.min(MEDICAL_BUDGET_MAX_EUR, budget));
    });
  };
  const handleTravelSave = (prefs: { hotel: number; flight: number; bus: number }) => {
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

  if (!selectedTeam || !tycoon) {
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
          <Briefcase size={12} /> Front Office · Tier {tycoon.tier}
        </div>
        <h1 className="text-3xl font-black tracking-tight mt-1">{getTeamFullName(selectedTeam as any)}</h1>
        <p className="text-sm text-slate-400 mt-1">Control club finances, sponsorships, medical investment, travel standards, staff, and scouting.</p>
      </div>
      {initialSection !== 'finances' && (
        <button onClick={() => setCurrentView('Front Office Finances')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-semibold">
          <ArrowLeft size={16} /> Back
        </button>
      )}
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
            onTravelDetails={() => setTravelModalOpen(true)}
            onMedicalDetails={() => setMedicalModalOpen(true)}
          />
        )}
        {initialSection === 'sponsorships' && (
          <SponsorshipSection
            tycoon={tycoon}
            currency={currency}
            avgOpponentPrestige={avgOpponentPrestige}
            marqueeOpponents={marqueeOpponents}
            onAction={(slot, mode) => setSponsorModal({ open: true, slot, mode })}
            onTicketMultChange={handleTicketMultChange}
          />
        )}
        {initialSection === 'facilities' && (
          <FacilitiesSection
            tycoon={tycoon}
            fmt={fmt}
            onTravelDetails={() => setTravelModalOpen(true)}
            onMedicalDetails={() => setMedicalModalOpen(true)}
          />
        )}
        {initialSection === 'staff' && (
          <StaffSection state={state} team={selectedTeam as any} onHireStaff={handleHireStaff} />
        )}
        {initialSection === 'scouting' && (
          <ScoutingSection tycoon={tycoon} currency={currency} onChange={handleScoutingInvestmentChange} />
        )}
      </div>

      <SponsorshipNegotiationModal
        open={sponsorModal.open}
        onClose={() => setSponsorModal({ open: false, slot: 'kit', mode: 'renegotiate' })}
        initialSlot={sponsorModal.slot}
        mode={sponsorModal.mode}
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
              className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
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
              <MedicalSection tycoon={tycoon} currency={currency} onMedicalBudgetChange={handleMedicalBudgetChange} />
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
              className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-hide bg-slate-900 rounded-2xl border border-slate-700 p-6"
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
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
