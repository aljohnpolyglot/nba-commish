import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, TrendingUp, TrendingDown, HeartPulse, Plane, Hotel, Bus, Building2, Users, Target, Landmark, Shield, Timer, Dumbbell, Smile, AlertTriangle, Bed, Droplets, Snowflake, Moon, ScanLine, Search, SlidersHorizontal, Star, X, Award } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { formatCurrencyWithCode } from '../../../utils/helpers';
import { OpenMarketModal, type SponsorMarketDealType } from '../../tycoon/OpenMarketModal';
import { CurrentSponsorModal } from '../../tycoon/CurrentSponsorModal';
import { CurrentEndorsementModal } from '../../tycoon/CurrentEndorsementModal';
import { LedgerHistoryCard } from '../../tycoon/LedgerHistoryCard';
import {
  MEDICAL_BUDGET_MIN_EUR,
  MEDICAL_BUDGET_MAX_EUR,
  purchaseMedicalAreaUpgrade,
} from '../../../services/tycoon/medicalEngine';
import { buildBudgetContext, computeAnnualBudget } from '../../../services/tycoon/budgetEngine';
import { computeStarPower } from '../../../services/tycoon/starPower';
import { getCityPrestige } from '../../../services/tycoon/specs/spain';
import { ALL_SLOTS, type MedicalFacilityAreaKey, type OneTimePayout, type SponsorshipSlot, type StaffOfferRejection, type TrainingFacilityAreaKey, type TycoonState } from '../../../types/tycoon';
import { makePlaceholderCoach, makePlaceholderGM } from '../../../services/staff/staffFallback';
import { MyFace, isRealFaceConfig } from '../../shared/MyFace';
import { FacilitiesSection } from './FrontOffice/sections/FacilitiesSection';
import { FinanceSection } from './FrontOffice/sections/FinanceSection';
import { SponsorshipSection } from './FrontOffice/sections/SponsorshipSection';
import { TravelSection } from './FrontOffice/sections/TravelSection';
import { MedicalSection } from './FrontOffice/sections/MedicalSection';
import { StaffSection } from './FrontOffice/sections/StaffSection';
import { ScoutingSection } from './FrontOffice/sections/ScoutingSection';
import { ArenaSection } from './FrontOffice/sections/ArenaSection';
import { TrainingSection } from './FrontOffice/sections/TrainingSection';
import { BankSection } from './FrontOffice/sections/BankSection';
import { CommercialSection } from './FrontOffice/sections/CommercialSection';
import { YouthAcademyTab } from '../../euroScouting/YouthAcademyTab';
import { useFrontOfficeStaffActions } from './useFrontOfficeStaffActions';
import { getActiveLeagueFinanceTeams, getClubFinanceSnapshot, getSeasonEconomyIndex, getTicketPricingLevel, normalizeTicketPriceMultiplier } from '../../../services/tycoon/clubFinance';
import { resolveSponsorLeagueKey } from '../../../data/sponsorCatalogFetcher';
import { ACADEMY_BUDGET_MAX_EUR, ACADEMY_BUDGET_MIN_EUR, getAcademyRegionalScoutingBudgetEUR } from '../../../services/tycoon/economyScale';
import { getEuroTravelFixtureCounts } from '../../../services/tycoon/travelFixtures';
import { buildMissingSponsorHeadquarters } from '../../../services/tycoon/sponsorHeadquarters';
import { applyMidContractSponsorReplacement } from '../../../services/tycoon/sponsorshipEngine';
import {
  purchaseArenaCapacityProject,
  purchaseArenaFeature,
  purchaseTrainingAreaUpgrade,
} from '../../../services/tycoon/facilityUpgradeEngine';
import { createSponsorBenefitPackage } from '../../../services/tycoon/sponsorBenefits';
import { getEffectiveBankSponsorAccess, getOutstandingBankPrincipal, makeVoluntaryLoanRepayment, syncBankSponsorCreditFacility, takeSponsorLoan } from '../../../services/tycoon/bankEngine';
import { buildMissingArenaVenue } from '../../../services/tycoon/arenaVenueMarket';
import { isEuroIsolatedMode } from '../../../utils/uiMode';

type FrontOfficeSection = 'finances' | 'sponsorships' | 'commercial' | 'medical' | 'facilities' | 'staff' | 'bank';
type EditableDepartment = 'medical' | 'travel' | 'analytics';

interface FrontOfficeViewProps {
  initialSection?: FrontOfficeSection;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({ initialSection = 'finances' }) => {
  const { state, dispatchAction, applyTycoonMutation, setCurrentView, setInjuriesTeamFilter } = useGame() as any;
  const currency = state.leagueStats?.currency ?? 'EUR';
  const euroIsolated = isEuroIsolatedMode(state);
  const userTeamId = state.userTeamId;
  const selectedTeam = resolveAnyTeam(userTeamId, state.teams, state.nonNBATeams ?? []);
  const tycoon = (selectedTeam as any)?.tycoon;
  const facilitiesReviewOpen = state.offseasonChecklist?.facilityUpgrades === 'in-progress';
  const slidersLocked = !facilitiesReviewOpen;
  const currentYear = state.leagueStats?.year ?? new Date().getFullYear();
  const economyIndex = getSeasonEconomyIndex(state, currentYear);
  const selectedTeamName = selectedTeam ? getTeamFullName(selectedTeam as any) : 'Team';
  const sponsorLeague = resolveSponsorLeagueKey((selectedTeam as any)?.country, (selectedTeam as any)?.league, (selectedTeam as any)?.region, state.euroPrimaryCompetitionId);
  const leagueFacilityTycoons = useMemo(() => {
    const teams = [...(state.teams ?? []), ...(state.nonNBATeams ?? [])].filter((team: any) => team?.tycoon);
    const selectedLeague = String((selectedTeam as any)?.league ?? '').trim();
    const competitionTeams = euroIsolated
      ? getActiveLeagueFinanceTeams(state, state.euroPrimaryCompetitionId)
      : [];
    let scoped = competitionTeams.length > 0
      ? competitionTeams
      : selectedLeague
        ? teams.filter((team: any) => String(team.league ?? '').trim() === selectedLeague)
        : [];
    if (scoped.length < 2 && userTeamId >= 0 && userTeamId < 100) {
      scoped = (state.teams ?? []).filter((team: any) => {
        const id = Number(team.id ?? team.tid);
        return team?.tycoon && id >= 0 && id < 100;
      });
    }
    if (scoped.length < 2) {
      scoped = teams.filter((team: any) => (
        resolveSponsorLeagueKey(team.country, team.league, team.region, state.euroPrimaryCompetitionId) === sponsorLeague
      ));
    }
    const ranked = scoped.map((team: any) => team.tycoon as TycoonState);
    if (tycoon && !ranked.includes(tycoon)) ranked.push(tycoon);
    return [...new Set(ranked)];
  }, [euroIsolated, selectedTeam, sponsorLeague, state, tycoon, userTeamId]);
  const bankAccess = tycoon ? getEffectiveBankSponsorAccess(tycoon, currentYear) : null;
  const outstandingBankPrincipal = tycoon ? getOutstandingBankPrincipal(tycoon) : 0;
  const bankSyncKey = `${bankAccess?.sponsor ?? ''}:${bankAccess?.package.bankLoanLimitEUR ?? 0}:${bankAccess?.package.bankAnnualRate ?? 0}:${outstandingBankPrincipal}`;

  const [openMarketOpen, setOpenMarketOpen] = useState(false);
  const [openMarketSlot, setOpenMarketSlot] = useState<SponsorshipSlot | null>(null);
  const [openMarketDealType, setOpenMarketDealType] = useState<SponsorMarketDealType>('core');
  const [currentSponsorModal, setCurrentSponsorModal] = useState<{ open: boolean; slot: SponsorshipSlot | null }>({ open: false, slot: null });
  const [currentEndorsement, setCurrentEndorsement] = useState<OneTimePayout | null>(null);
  const [travelModalOpen, setTravelModalOpen] = useState(false);
  const [medicalModalOpen, setMedicalModalOpen] = useState(false);
  const [analyticsModalOpen, setAnalyticsModalOpen] = useState(false);
  const [departmentDirty, setDepartmentDirty] = useState<Record<EditableDepartment, boolean>>({ medical: false, travel: false, analytics: false });
  const [pendingDepartmentClose, setPendingDepartmentClose] = useState<{ key: EditableDepartment; close: () => void } | null>(null);
  const [arenaModalOpen, setArenaModalOpen] = useState(false);
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [academyModalOpen, setAcademyModalOpen] = useState(false);
  const updateDepartmentDirty = (key: EditableDepartment, dirty: boolean) => setDepartmentDirty(previous => (
    previous[key] === dirty ? previous : { ...previous, [key]: dirty }
  ));
  const requestDepartmentClose = (key: EditableDepartment, close: () => void) => {
    if (departmentDirty[key]) {
      setPendingDepartmentClose({ key, close });
      return;
    }
    close();
  };

  useEffect(() => {
    if (!tycoon) return;
    let cancelled = false;
    void buildMissingSponsorHeadquarters(tycoon, sponsorLeague).then((patches) => {
      if (cancelled || patches.length === 0) return;
      applyTycoonMutation(userTeamId, (team: any) => {
        for (const patch of patches) {
          const deal = team.tycoon?.sponsorships?.[patch.slot];
          if (!deal || deal.sponsor !== patch.sponsor || deal.headquartersCity) continue;
          deal.headquartersCity = patch.city;
          deal.headquartersCountry = patch.country;
          deal.headquartersIso2 = patch.iso2;
        }
      });
    });
    return () => { cancelled = true; };
  }, [applyTycoonMutation, sponsorLeague, tycoon, userTeamId]);

  useEffect(() => {
    if (!tycoon || state.leagueStats?.uiMode !== 'euro_isolated') return;
    let cancelled = false;
    const capacity = Math.max(1_000, Number(tycoon.facilities?.stadium?.baseCapacity ?? tycoon.facilities?.stadium?.capacity ?? (selectedTeam as any)?.stadiumCapacity ?? 8_000));
    void buildMissingArenaVenue({
      state: tycoon,
      league: sponsorLeague,
      teamName: selectedTeamName,
      arenaName: `${selectedTeamName} Arena`,
      capacity,
      currentYear,
    }).then(venue => {
      if (cancelled || !venue) return;
      applyTycoonMutation(userTeamId, (team: any) => {
        if (team.tycoon?.facilities?.stadium && !team.tycoon.facilities.stadium.venue) team.tycoon.facilities.stadium.venue = venue;
      });
    });
    return () => { cancelled = true; };
  }, [applyTycoonMutation, currentYear, selectedTeam, selectedTeamName, sponsorLeague, state.leagueStats?.uiMode, tycoon, userTeamId]);

  useEffect(() => {
    if (!tycoon || !Object.values(tycoon.sponsorships ?? {}).some((deal: any) => deal && deal.benefitPackageVersion !== 1)) return;
    applyTycoonMutation(userTeamId, (team: any) => {
      for (const [slot, deal] of Object.entries(team.tycoon?.sponsorships ?? {}) as Array<[SponsorshipSlot, any]>) {
        if (!deal || deal.benefitPackageVersion === 1) continue;
        deal.benefitPackage = createSponsorBenefitPackage({ sponsor: deal.sponsor, industry: deal.industry, slot, valuePerYear: deal.valuePerYear });
        deal.benefitPackageVersion = 1;
      }
    });
  }, [applyTycoonMutation, tycoon, userTeamId]);

  useEffect(() => {
    if (!tycoon) return;
    const current = tycoon.creditFacility;
    const expectedLimit = bankAccess?.package.bankLoanLimitEUR ?? 0;
    const expectedRate = bankAccess?.package.bankAnnualRate ?? current?.annualRate ?? 0.05;
    const expectedSponsor = bankAccess?.sponsor;
    if (current?.limitEUR === expectedLimit
      && current.drawnEUR === outstandingBankPrincipal
      && current.annualRate === expectedRate
      && current.sponsor === expectedSponsor) return;
    applyTycoonMutation(userTeamId, (team: any) => {
      if (team.tycoon) syncBankSponsorCreditFacility(team.tycoon, currentYear);
    });
  }, [applyTycoonMutation, bankAccess, bankSyncKey, currentYear, outstandingBankPrincipal, tycoon, userTeamId]);

  const handleTicketMultChange = (mult: number) => {
    if (slidersLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      const normalized = normalizeTicketPriceMultiplier(mult);
      const level = getTicketPricingLevel(normalized);
      t.tycoon.ticketPricingLevel = level;
      t.tycoon.ticketPriceMultiplier = normalized;
    });
  };
  const handleScoutingInvestmentChange = (budget: number) => {
    if (slidersLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      const currentWallet = t.tycoon.regionalScoutingBudget;
      const rawSpent = Number(currentWallet?.spentEUR ?? 0);
      const alreadySpent = currentWallet?.season === currentYear && Number.isFinite(rawSpent) ? Math.max(0, rawSpent) : 0;
      const maximum = Math.max(alreadySpent, Math.round(2_500_000 * economyIndex));
      const savedBudget = Math.max(alreadySpent, Math.round(50_000 * economyIndex), Math.min(maximum, budget));
      t.tycoon.scoutingInvestment = savedBudget;
      t.tycoon.regionalScoutingBudget = {
        season: currentYear,
        allocatedEUR: savedBudget,
        spentEUR: alreadySpent,
      };
    });
  };
  const { handleFireStaff, handleHireStaff, handlePromoteStaff } = useFrontOfficeStaffActions({
    applyTycoonMutation,
    currentYear,
    dispatchAction,
    selectedTeam,
    selectedTeamName,
    state,
    userTeamId,
  });
  const handleRecordStaffRejection = (rejection: StaffOfferRejection) => {
    applyTycoonMutation(userTeamId, (team: any) => {
      if (!team.tycoon) return;
      const prior = (team.tycoon.staffOfferRejections ?? []) as StaffOfferRejection[];
      const rejectedName = rejection.candidateName.trim().toLowerCase();
      team.tycoon.staffOfferRejections = [
        ...prior.filter(row =>
          row.candidateId !== rejection.candidateId
          && row.candidateName.trim().toLowerCase() !== rejectedName
        ),
        rejection,
      ];
    });
  };

  const handleMedicalBudgetChange = (budget: number) => {
    if (slidersLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      t.tycoon.medicalBudget = Math.max(Math.round(MEDICAL_BUDGET_MIN_EUR * economyIndex), Math.min(Math.round(MEDICAL_BUDGET_MAX_EUR * economyIndex), budget));
    });
  };
  const handleAcademyBudgetChange = (budget: number) => {
    if (slidersLocked) return;
    applyTycoonMutation(userTeamId, (t: any) => {
      if (!t.tycoon) return;
      const savedBudget = Math.max(Math.round(ACADEMY_BUDGET_MIN_EUR * economyIndex), Math.min(Math.round(ACADEMY_BUDGET_MAX_EUR * economyIndex), Math.round(budget)));
      const currentWallet = t.tycoon.regionalScoutingBudget;
      const rawSpent = Number(currentWallet?.spentEUR ?? 0);
      const alreadySpent = currentWallet?.season === currentYear && Number.isFinite(rawSpent) ? Math.max(0, rawSpent) : 0;
      const scoutingBudget = Math.max(alreadySpent, getAcademyRegionalScoutingBudgetEUR(savedBudget, t.tycoon.tier, economyIndex));
      t.tycoon.academyBudget = savedBudget;
      t.tycoon.scoutingInvestment = scoutingBudget;
      t.tycoon.regionalScoutingBudget = {
        season: currentYear,
        allocatedEUR: scoutingBudget,
        spentEUR: alreadySpent,
      };
    });
  };
  const handleTravelSave = (prefs: { hotel: number; flight: number; bus: number }) => {
    if (slidersLocked) return;
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
      .map(t => getTeamFullName(t))
      .slice(0, 5);
    return { avgOpponentPrestige: avg, marqueeOpponents: marquee };
  }, [selectedTeam, state.teams, state.nonNBATeams, userTeamId]);

  const starPower = useMemo(() => computeStarPower(state.players ?? [], userTeamId), [state.players, userTeamId]);
  const euroScheduleReleased = state.leagueStats?.uiMode !== 'euro_isolated'
    || !state.offseasonChecklist
    || state.offseasonChecklist.euroScheduleDraw === 'done'
    || state.offseasonChecklist.euroScheduleDraw === 'skipped'
    || !!state.euroScheduleReleaseDate;
  const fixtureProjectionState = useMemo(
    () => euroScheduleReleased ? state : { ...state, schedule: [] },
    [euroScheduleReleased, state],
  );
  const budgetContext = useMemo(
    () => buildBudgetContext(fixtureProjectionState, userTeamId, { avgOpponentPrestige }),
    [fixtureProjectionState, userTeamId, avgOpponentPrestige],
  );

  // Live ledger projection — reflects slider/sponsor changes immediately.
  const ledger = useMemo(() => {
    if (!selectedTeam || !tycoon) return null;
    return computeAnnualBudget(selectedTeam as any, budgetContext, state.players);
  }, [selectedTeam, tycoon, budgetContext, state.players]);
  const financeSnapshot = useMemo(() => tycoon
    ? getClubFinanceSnapshot(tycoon, state.date, ledger?.cashOnHandEnd)
    : null, [tycoon, state.date, ledger?.cashOnHandEnd]);

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

  const travelFixtures = getEuroTravelFixtureCounts(fixtureProjectionState, Number(userTeamId));
  const fmt = (v: number) => formatCurrencyWithCode(v, currency, false);
  const commonHeader = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300 flex items-center gap-2">
          <Briefcase size={12} /> Front Office{tycoon?.tier ? ` · Tier ${tycoon.tier}` : ''}
        </div>
        <h1 className="text-3xl font-black tracking-tight mt-1">{getTeamFullName(selectedTeam as any)}</h1>
      </div>
      {euroIsolated && financeSnapshot && (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80 sm:flex">
          <div className="border-b border-r border-slate-700 px-4 py-2 sm:border-b-0"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Cash</div><div className="text-sm font-black tabular-nums text-amber-300">{fmt(financeSnapshot.cashOnHandEUR)}</div></div>
          <div className="border-b border-slate-700 px-4 py-2 sm:border-b-0 sm:border-r"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Available</div><div className={`text-sm font-black tabular-nums ${financeSnapshot.availableEUR >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmt(financeSnapshot.availableEUR)}</div></div>
          <div className="border-r border-slate-700 px-4 py-2"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Due 30d</div><div className="text-sm font-black tabular-nums text-slate-200">{fmt(financeSnapshot.dueIn30DaysEUR)}</div></div>
          <div className="px-4 py-2"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Runway</div><div className="text-sm font-black tabular-nums text-slate-200">{financeSnapshot.runwayMonths >= 99 ? 'Stable' : `${financeSnapshot.runwayMonths.toFixed(1)} mo`}</div></div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-hide bg-slate-950 text-white">
      <div className="max-w-[1680px] mx-auto p-4 md:p-8 space-y-6">
        {initialSection !== 'sponsorships' && initialSection !== 'commercial' && commonHeader}
        {initialSection === 'finances' && ledger && (
          <FinanceSection
            ledger={ledger}
            fmt={fmt}
            cashOnHand={tycoon.cashOnHand ?? 0}
            currentYear={currentYear}
            currentDate={state.date}
            starPower={starPower}
            tycoon={tycoon}
          />
        )}
        {initialSection === 'sponsorships' && (
          <SponsorshipSection
            tycoon={tycoon}
            currency={currency}
            sponsorLeague={sponsorLeague}
            currentYear={currentYear}
            onCoreAction={(slot, action) => {
              if (action === 'find-new') {
                setOpenMarketSlot(slot);
                setOpenMarketDealType('core');
                setOpenMarketOpen(true);
              }
              else setCurrentSponsorModal({ open: true, slot });
            }}
            onOpenEndorsement={() => {
              setOpenMarketSlot(null);
              setOpenMarketDealType('endorsement');
              setOpenMarketOpen(true);
            }}
            onEndorsementDetails={setCurrentEndorsement}
          />
        )}
        {initialSection === 'facilities' && (
          <FacilitiesSection
            tycoon={tycoon}
            fmt={fmt}
            economyIndex={economyIndex}
            leagueTycoons={leagueFacilityTycoons}
            onTravelDetails={() => setTravelModalOpen(true)}
            onMedicalDetails={() => setMedicalModalOpen(true)}
            onAnalyticsDetails={() => setAnalyticsModalOpen(true)}
            onArenaDetails={() => setArenaModalOpen(true)}
            onTrainingDetails={() => setTrainingModalOpen(true)}
            onAcademyDetails={() => setAcademyModalOpen(true)}
          />
        )}
        {initialSection === 'staff' && (
          <StaffSection
            state={state}
            team={selectedTeam as any}
            onHireStaff={handleHireStaff}
            onFireStaff={handleFireStaff}
            onPromoteStaff={handlePromoteStaff}
            onRecordStaffRejection={handleRecordStaffRejection}
          />
        )}
        {initialSection === 'commercial' && (
          <CommercialSection
            tycoon={tycoon}
            currentYear={currentYear}
            currency={currency}
            players={state.players ?? []}
          />
        )}
        {initialSection === 'bank' && (
          <BankSection
            tycoon={tycoon}
            currency={currency}
            sponsorLeague={sponsorLeague}
            currentYear={currentYear}
            availableCash={financeSnapshot?.availableEUR ?? tycoon.cashOnHand ?? 0}
            onBorrow={(amountEUR, termMonths) => {
              applyTycoonMutation(userTeamId, (team: any) => {
                if (team.tycoon) takeSponsorLoan(team.tycoon, amountEUR, termMonths, state.date, currentYear);
              });
            }}
            onRepay={(loanId, amountEUR) => {
              applyTycoonMutation(userTeamId, (team: any) => {
                if (team.tycoon) makeVoluntaryLoanRepayment(team.tycoon, loanId, amountEUR, state.date, currentYear);
              });
            }}
          />
        )}
      </div>

      <OpenMarketModal
        open={openMarketOpen}
        initialSlot={openMarketSlot}
        dealType={openMarketDealType}
        onClose={() => {
          setOpenMarketOpen(false);
          setOpenMarketSlot(null);
          setOpenMarketDealType('core');
        }}
      />
      <CurrentSponsorModal
        open={currentSponsorModal.open}
        onClose={() => setCurrentSponsorModal({ open: false, slot: null })}
        slot={currentSponsorModal.slot}
        sponsor={currentSponsorModal.slot ? (tycoon?.sponsorships?.[currentSponsorModal.slot] ?? null) : null}
        tycoon={tycoon}
        currentYear={currentYear}
        currency={currency}
        sponsorLeague={sponsorLeague}
        onBreakContract={() => {
          const slot = currentSponsorModal.slot;
          if (!slot) return;
          applyTycoonMutation(userTeamId, (team: any) => {
            if (!team.tycoon) return;
            applyMidContractSponsorReplacement(team.tycoon, slot, currentYear);
            team.tycoon.sponsorships[slot] = null;
          });
          setCurrentSponsorModal({ open: false, slot: null });
        }}
      />
      <CurrentEndorsementModal
        endorsement={currentEndorsement}
        tycoon={tycoon}
        currentYear={currentYear}
        currency={currency}
        sponsorLeague={sponsorLeague}
        onClose={() => setCurrentEndorsement(null)}
      />

      <AnimatePresence>
        {medicalModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => requestDepartmentClose('medical', () => setMedicalModalOpen(false))} />
            <motion.div
              className="relative z-10 flex h-[100dvh] w-full max-w-[1450px] min-w-0 flex-col overflow-hidden border border-slate-700 bg-[#071225] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-3xl"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-7 sm:py-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-400/[0.08] text-rose-300 sm:h-14 sm:w-14">
                    <HeartPulse size={27} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white sm:text-2xl">Medical & Recovery</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">Balance seasonal medical spending and permanent facility development.</p>
                  </div>
                </div>
                <button type="button" aria-label="Close Medical and Recovery" onClick={() => requestDepartmentClose('medical', () => setMedicalModalOpen(false))} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <X size={23} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-hide sm:p-6">
                <MedicalSection
                  tycoon={tycoon}
                  currency={currency}
                  economyIndex={economyIndex}
                  availableCash={financeSnapshot?.availableEUR ?? tycoon.cashOnHand ?? 0}
                  onSave={(budget) => {
                    handleMedicalBudgetChange(budget);
                    updateDepartmentDirty('medical', false);
                  }}
                  onPurchaseArea={(area: MedicalFacilityAreaKey) => {
                    applyTycoonMutation(userTeamId, (team: any) => {
                      if (!team.tycoon) return;
                      purchaseMedicalAreaUpgrade(team.tycoon, area, state.date, currentYear, economyIndex);
                    });
                  }}
                  onDirtyChange={(dirty) => updateDepartmentDirty('medical', dirty)}
                  locked={slidersLocked}
                  onViewMedicalReport={() => {
                    requestDepartmentClose('medical', () => {
                      setMedicalModalOpen(false);
                      setInjuriesTeamFilter(userTeamId);
                      setCurrentView('Injuries');
                    });
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {travelModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => requestDepartmentClose('travel', () => setTravelModalOpen(false))} />
            <motion.div
              className="relative z-10 flex h-[100dvh] w-full max-w-[1200px] min-w-0 flex-col overflow-hidden border border-amber-400/20 bg-gradient-to-br from-[#08152a] via-[#071225] to-amber-950/25 shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-3xl"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800/90 bg-slate-950/20 px-4 py-4 sm:px-7 sm:py-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/[0.08] text-amber-300 sm:h-14 sm:w-14">
                    <Plane size={27} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white sm:text-2xl">Travel & Logistics</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">Set the club's hotel, flight and ground-travel standards for the season.</p>
                  </div>
                </div>
                <button type="button" aria-label="Close Travel and Logistics" onClick={() => requestDepartmentClose('travel', () => setTravelModalOpen(false))} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <X size={23} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-hide sm:p-6">
                <TravelSection
                  tycoon={tycoon}
                  currency={currency}
                  economyIndex={economyIndex}
                  currentYear={currentYear}
                  sponsorLeague={sponsorLeague}
                  domesticAwayGames={travelFixtures.domesticAwayGames}
                  internationalAwayGames={travelFixtures.internationalAwayGames}
                  fixtureStatus={travelFixtures.status}
                  onSave={(prefs) => { handleTravelSave(prefs); updateDepartmentDirty('travel', false); setTravelModalOpen(false); }}
                  onDirtyChange={(dirty) => updateDepartmentDirty('travel', dirty)}
                  locked={slidersLocked}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {analyticsModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => requestDepartmentClose('analytics', () => setAnalyticsModalOpen(false))} />
            <motion.div
              className="relative z-10 flex h-[100dvh] w-full max-w-[1450px] min-w-0 flex-col overflow-hidden border border-slate-700 bg-[#071225] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-3xl"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-7 sm:py-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/[0.08] text-cyan-300 sm:h-14 sm:w-14">
                    <TrendingUp size={27} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white sm:text-2xl">Analytics Lab</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-400 sm:text-sm">Fund player evaluation, market coverage, and the staff behind every report.</p>
                  </div>
                </div>
                <button type="button" aria-label="Close Analytics Lab" onClick={() => requestDepartmentClose('analytics', () => setAnalyticsModalOpen(false))} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                  <X size={23} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-hide sm:p-6">
                <ScoutingSection tycoon={tycoon} currency={currency} season={currentYear} economyIndex={economyIndex} onSave={(budget) => { handleScoutingInvestmentChange(budget); updateDepartmentDirty('analytics', false); }} onDirtyChange={(dirty) => updateDepartmentDirty('analytics', dirty)} locked={slidersLocked} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDepartmentClose && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl" initial={{ y: 18, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, scale: 0.98 }}>
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-300">Unsaved changes</div>
              <h3 className="mt-2 text-xl font-black text-white">Discard this department plan?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">Your changes have not been saved. Continue editing or discard them and close the panel.</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setPendingDepartmentClose(null)} className="rounded-xl border border-slate-700 px-4 py-3 text-xs font-black uppercase text-slate-200">Continue Editing</button>
                <button type="button" onClick={() => {
                  const pending = pendingDepartmentClose;
                  updateDepartmentDirty(pending.key, false);
                  setPendingDepartmentClose(null);
                  pending.close();
                }} className="rounded-xl bg-rose-500 px-4 py-3 text-xs font-black uppercase text-white">Discard Changes</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {arenaModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setArenaModalOpen(false)} />
            <motion.div
              className="relative z-10 flex h-[100dvh] w-full max-w-[1500px] flex-col overflow-hidden border border-slate-700 bg-[#071225] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-3xl"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-7 sm:py-5">
                <h2 className="flex items-center gap-3 text-lg font-black text-white sm:text-2xl">
                  <Landmark size={24} className="text-amber-400" /> Arena & Fan Experience
                </h2>
                <button type="button" aria-label="Close Arena and Fan Experience" onClick={() => setArenaModalOpen(false)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-hide sm:p-6">
                <ArenaSection
                  tycoon={tycoon}
                  teamName={getTeamFullName(selectedTeam as any)}
                  teamAbbrev={(selectedTeam as any).abbrev}
                  teamLogoUrl={(selectedTeam as any).logoUrl ?? (selectedTeam as any).imgURL}
                  currency={currency}
                  sponsorLeague={sponsorLeague}
                  homeGames={budgetContext.scheduledHomeGames}
                  onTicketMultChange={handleTicketMultChange}
                  economyIndex={economyIndex}
                  availableCash={financeSnapshot?.availableEUR ?? tycoon.cashOnHand ?? 0}
                  onPurchaseFeature={(feature) => {
                    applyTycoonMutation(userTeamId, (team: any) => {
                      if (!team.tycoon) return;
                      purchaseArenaFeature(team.tycoon, feature, state.date, currentYear, economyIndex);
                    });
                  }}
                  onPurchaseCapacity={(projectId, currentCapacity) => {
                    applyTycoonMutation(userTeamId, (team: any) => {
                      if (!team.tycoon) return;
                      purchaseArenaCapacityProject(team.tycoon, projectId, currentCapacity, state.date, currentYear, economyIndex);
                    });
                  }}
                  locked={slidersLocked}
                />
              </div>
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
                economyIndex={economyIndex}
                availableCash={financeSnapshot?.availableEUR ?? tycoon.cashOnHand ?? 0}
                onPurchaseArea={(area: TrainingFacilityAreaKey) => {
                  applyTycoonMutation(userTeamId, (team: any) => {
                    if (!team.tycoon) return;
                    purchaseTrainingAreaUpgrade(team.tycoon, area, state.date, currentYear, economyIndex);
                  });
                }}
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
              <YouthAcademyTab onAcademyBudgetChange={handleAcademyBudgetChange} budgetLocked={slidersLocked} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
