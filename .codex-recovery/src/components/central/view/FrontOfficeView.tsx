import React, { useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, TrendingUp, TrendingDown, HeartPulse, Plane, Building2, Users, Target, Landmark, Shield, Timer, Dumbbell, Smile, AlertTriangle, Bed, Droplets, Snowflake, Moon, ScanLine, Search, SlidersHorizontal, Star, X, Award } from 'lucide-react';
import { generate } from 'facesjs';
import { useGame } from '../../../store/GameContext';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { formatCurrencyWithCode } from '../../../utils/helpers';
import { SponsorshipCard } from '../../tycoon/SponsorshipCard';
import { SponsorshipNegotiationModal } from '../../tycoon/SponsorshipNegotiationModal';
import { TravelLogisticsCard } from '../../tycoon/TravelLogisticsCard';
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
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import { FacilitiesSection } from './FrontOffice/sections/FacilitiesSection';
import { FinanceSection, AnnualProjectionCard } from './FrontOffice/sections/FinanceSection';
import { SponsorshipSection } from './FrontOffice/sections/SponsorshipSection';
import { TravelSection } from './FrontOffice/sections/TravelSection';
import { MedicalSection } from './FrontOffice/sections/MedicalSection';
import { StaffSection } from './FrontOffice/sections/StaffSection';
import { ScoutingSection } from './FrontOffice/sections/ScoutingSection';
import { BoardPromisesCard } from './FrontOffice/sections/BoardPromisesCard';

type FrontOfficeSection = 'overview' | 'finances' | 'sponsorships' | 'travel' | 'medical' | 'facilities' | 'staff' | 'scouting';

interface FrontOfficeViewProps {
  initialSection?: FrontOfficeSection;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({ initialSection = 'overview' }) => {
  const { state, applyTycoonMutation, setCurrentView } = useGame() as any;
  const currency = state.leagueStats?.currency ?? 'EUR';
  const userTeamId = state.userTeamId;
  const selectedTeam = resolveAnyTeam(userTeamId, state.teams, state.nonNBATeams ?? []);
  const tycoon = (selectedTeam as any)?.tycoon;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();

  const [sponsorModal, setSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot }>({ open: false, slot: 'kit' });

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
  const backButton = (
    <button onClick={() => setCurrentView('Front Office')} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-semibold">
      <ArrowLeft size={16} /> Back to Overview
    </button>
  );

  const commonHeader = (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300 flex items-center gap-2">
          <Briefcase size={12} /> Front Office · Tier {tycoon.tier}
        </div>
        <h1 className="text-3xl font-black tracking-tight mt-1">{getTeamFullName(selectedTeam as any)}</h1>
        <p className="text-sm text-slate-400 mt-1">Control club finances, sponsorships, medical investment, travel standards, staff, and scouting.</p>
      </div>
      {initialSection === 'overview' ? (
        <button onClick={() => setCurrentView('Front Office Finances')} className="text-xs font-semibold text-slate-400 hover:text-white">
          View ledger →
        </button>
      ) : backButton}
    </div>
  );

  if (initialSection !== 'overview') {
    return (
      <div className="h-full overflow-y-auto scrollbar-hide bg-slate-950 text-white">
        <div className="max-w-[1680px] mx-auto p-4 md:p-8 space-y-6">
          {commonHeader}
          {initialSection === 'finances' && ledger && (
            <FinanceSection ledger={ledger} fmt={fmt} cashOnHand={tycoon.cashOnHand ?? 0} currentYear={currentYear} starPower={starPower} tycoon={tycoon} />
          )}
          {initialSection === 'sponsorships' && (
            <SponsorshipSection
              tycoon={tycoon}
              currency={currency}
              avgOpponentPrestige={avgOpponentPrestige}
              marqueeOpponents={marqueeOpponents}
              onNegotiate={(slot) => setSponsorModal({ open: true, slot })}
              onTicketMultChange={handleTicketMultChange}
            />
          )}
          {initialSection === 'travel' && (
            <TravelSection tycoon={tycoon} currency={currency} domesticAwayGames={17} internationalAwayGames={internationalAway} onSave={handleTravelSave} />
          )}
          {initialSection === 'medical' && (
            <MedicalSection tycoon={tycoon} currency={currency} onMedicalBudgetChange={handleMedicalBudgetChange} />
          )}
          {initialSection === 'facilities' && (
            <FacilitiesSection tycoon={tycoon} fmt={fmt} />
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
          onClose={() => setSponsorModal({ open: false, slot: 'kit' })}
          initialSlot={sponsorModal.slot}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-950 text-white">
      <div className="max-w-[1680px] mx-auto p-4 md:p-8 space-y-6">
        {commonHeader}

        {ledger && (
          <AnnualProjectionCard
            ledger={ledger}
            fmt={fmt}
            cashOnHand={tycoon.cashOnHand ?? 0}
            currentYear={currentYear}
            starPower={starPower}
          />
        )}

        <BoardPromisesCard tycoon={tycoon} />

        <div className="grid lg:grid-cols-2 gap-6">
          <SponsorshipCard
            tycoon={tycoon}
            currency={currency}
            onNegotiate={(slot) => setSponsorModal({ open: true, slot })}
            onTicketMultChange={handleTicketMultChange}
            avgOpponentPrestige={avgOpponentPrestige}
            marqueeOpponents={marqueeOpponents}
          />
          <div className="space-y-6">
            <MedicalCard
              tycoon={tycoon}
              currency={currency}
              onMedicalBudgetChange={handleMedicalBudgetChange}
            />
            <TravelLogisticsCard
              tycoon={tycoon}
              currency={currency}
              domesticAwayGames={17}
              internationalAwayGames={internationalAway}
              onSave={handleTravelSave}
            />
          </div>
        </div>

        <LedgerHistoryCard tycoon={tycoon} currency={currency} />
      </div>

      <SponsorshipNegotiationModal
        open={sponsorModal.open}
        onClose={() => setSponsorModal({ open: false, slot: 'kit' })}
        initialSlot={sponsorModal.slot}
      />
    </div>
  );
};

