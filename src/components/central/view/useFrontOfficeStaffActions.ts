import { ensureStaffPoolDepth, inferEuroStaffLeagueId, toStaffFreeAgent } from '../../../services/euro/staffPool';
import {
  appendStaffCareerRow,
  closePresentCareerRanges,
  currentStaffYearsWithTeam,
  displayStaffRole,
  finalizeStaffStint,
  staffTeamHiredYear,
} from '../../../services/staff/staffCareerRows';
import { getClubFinanceSnapshot, postClubTransaction } from '../../../services/tycoon/clubFinance';
import { isEuroIsolatedMode } from '../../../utils/uiMode';
import { resolveStaffMarketForTeam } from '../../../services/tycoon/economyScale';
import { PBA_STAFF_ECONOMY_VERSION } from '../../../services/pba/historicalEconomy';
import { consumeSponsorSigningPerk, getAvailableSigningSponsorPerks } from '../../../services/tycoon/sponsorPerkEngine';
import { getEraAwareStaffMarketSalary } from '../../../services/staff/nbaRealStaffSeed';

const ensureStaffShell = (teamState: any) => {
  if (!teamState.tycoon) teamState.tycoon = { staffMembers: [], firedStaffRoles: [], cashOnHand: 0 };
  if (!teamState.tycoon.staffMembers) teamState.tycoon.staffMembers = [];
  if (!teamState.tycoon.firedStaffRoles) teamState.tycoon.firedStaffRoles = [];
};

type StaffActionContext = {
  applyTycoonMutation: (teamId: number, updater: (team: any) => void) => void;
  currentYear: number;
  dispatchAction: (action: any) => void;
  selectedTeam: any;
  selectedTeamName: string;
  state: any;
  userTeamId: number;
};

const normalizeStaffName = (name: unknown) => String(name ?? '').trim().toLowerCase();
const normalizeStaffRole = (role: unknown) => String(role ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameStaffRole = (left: unknown, right: unknown) => normalizeStaffRole(left) === normalizeStaffRole(right);
const staffTeamKey = (value: unknown) => normalizeStaffName(value);

const isSameStaffPerson = (left: any, right: any) => {
  if (!left || !right) return false;
  if (left.id && right.id && left.id === right.id) return true;
  if (left.sourcePlayerId && right.sourcePlayerId && left.sourcePlayerId === right.sourcePlayerId) return true;
  const leftName = normalizeStaffName(left.name);
  const rightName = normalizeStaffName(right.name);
  return !!leftName && leftName === rightName;
};

export const useFrontOfficeStaffActions = ({
  applyTycoonMutation,
  currentYear,
  dispatchAction,
  selectedTeam,
  selectedTeamName,
  state,
  userTeamId,
}: StaffActionContext) => {
  const pushPersonnelHistory = (text: string) => {
    void dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        history: [
          ...(state.history ?? []),
          { text, date: state.date, type: 'Personnel', tid: userTeamId },
        ],
      },
    });
  };

  const handlePromoteStaff = (person: any, fromRole: string, toRole: string) => {
    const teamHiredYear = staffTeamHiredYear(person, currentYear);
    const yearsWithTeam = currentStaffYearsWithTeam({ ...person, hiredYear: teamHiredYear }, currentYear);
    const promotedSalary = getEraAwareStaffMarketSalary(
      selectedTeam,
      toRole,
      Number(person?.rating ?? person?.reputation ?? 66),
      currentYear,
      Math.max(0, currentYear - Number(person?.careerStartYear ?? currentYear)),
      yearsWithTeam,
    );
    applyTycoonMutation(userTeamId, (teamState: any) => {
      ensureStaffShell(teamState);
      teamState.tycoon.staffMembers = teamState.tycoon.staffMembers.filter((staff: any) =>
        !sameStaffRole(staff.role, fromRole) && !sameStaffRole(staff.role, toRole) && !isSameStaffPerson(staff, person)
      );
      teamState.tycoon.staffMembers.push({
        ...(person ?? {}),
        id: person?.id ?? `staff-${toRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        role: toRole,
        roleStartYear: currentYear,
        hiredYear: teamHiredYear,
        yearsWithTeam,
        salary: promotedSalary,
        isPlaceholder: false,
        career_history: appendStaffCareerRow(
          closePresentCareerRanges(person?.career_history ?? person?.coaching_career ?? '', currentYear),
          currentYear,
          selectedTeamName,
          toRole,
        ),
        coaching_career: appendStaffCareerRow(
          closePresentCareerRanges(person?.coaching_career ?? person?.career_history ?? '', currentYear),
          currentYear,
          selectedTeamName,
          toRole,
        ),
      });
      if (!teamState.tycoon.firedStaffRoles.includes(fromRole)) teamState.tycoon.firedStaffRoles.push(fromRole);
      teamState.tycoon.firedStaffRoles = teamState.tycoon.firedStaffRoles.filter((role: string) => role !== toRole);
    });
    const promotedName = normalizeStaffName(person?.name);
    const selectedTeamKeys = new Set(
      [
        selectedTeam?.name,
        selectedTeam?.teamName,
        selectedTeamName,
        selectedTeam?.region && selectedTeam?.name ? `${selectedTeam.region} ${selectedTeam.name}` : null,
      ].map(staffTeamKey).filter(Boolean),
    );
    const promotedCoach = {
      ...(person ?? {}),
      id: person?.id ?? `staff-${toRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      team: selectedTeamName,
      role: toRole,
      position: toRole,
      jobTitle: toRole,
      roleStartYear: currentYear,
      hiredYear: teamHiredYear,
      yearsWithTeam,
      salary: promotedSalary,
      isPlaceholder: false,
    };
    void dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        staff: {
          ...(state.staff ?? {}),
          coaches: [
            ...((state.staff?.coaches ?? []) as any[]).filter((coach: any) => {
              const sameTeam = selectedTeamKeys.has(staffTeamKey(coach?.team));
              if (!sameTeam) return true;
              const coachRole = normalizeStaffRole(coach?.role ?? coach?.position ?? coach?.jobTitle);
              const samePerson = promotedName && normalizeStaffName(coach?.name) === promotedName;
              return coachRole !== 'head coach' && !samePerson;
            }),
            promotedCoach,
          ],
        },
      },
    } as any);
    pushPersonnelHistory(`${selectedTeamName} promoted ${person?.name ?? 'a staff member'} from ${displayStaffRole(fromRole)} to ${displayStaffRole(toRole)}.`);
  };

  const handleFireStaff = (role: string, person?: any) => {
    let fired = finalizeStaffStint(
      (selectedTeam?.tycoon?.staffMembers ?? []).find((staff: any) => sameStaffRole(staff.role, role) || isSameStaffPerson(staff, person))
        ?? (person ? { ...person, role, team: person.team ?? selectedTeamName } : undefined),
      role,
      selectedTeamName,
      currentYear,
    );
    applyTycoonMutation(userTeamId, (teamState: any) => {
      ensureStaffShell(teamState);
      const currentMember = teamState.tycoon.staffMembers.find((staff: any) => sameStaffRole(staff.role, role) || isSameStaffPerson(staff, person));
      if (currentMember) {
        const finalized = finalizeStaffStint(currentMember, role, selectedTeamName, currentYear);
        Object.assign(currentMember, finalized, { contractYears: 0 });
        fired = finalized;
      }
      teamState.tycoon.staffMembers = teamState.tycoon.staffMembers.filter((staff: any) =>
        !sameStaffRole(staff.role, role) && !isSameStaffPerson(staff, fired)
      );
      if (!teamState.tycoon.firedStaffRoles.includes(role)) teamState.tycoon.firedStaffRoles.push(role);
    });
    if (fired?.name) {
      const leagueId = inferEuroStaffLeagueId(userTeamId, state.leagueType);
      void dispatchAction({
        type: 'UPDATE_STATE',
        payload: {
          staffFreeAgents: [
            ...(state.staffFreeAgents ?? []),
            toStaffFreeAgent(
              fired,
              leagueId,
              `staff-fired-${userTeamId}-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(fired.name ?? 'staff').replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`,
            ),
          ],
        },
      });
    }
    pushPersonnelHistory(`${selectedTeamName} fired ${fired?.name ?? 'a staff member'} as ${displayStaffRole(role)}.`);
  };

  const handleHireStaff = (hire: any) => {
    const currentStaff = (selectedTeam?.tycoon?.staffMembers ?? []).find((staff: any) => (
      sameStaffRole(staff.role, hire.role)
      && Number(staff.contractYears ?? 1) > 0
    ));
    const selectedTeamKeys = new Set(
      [selectedTeam?.name, selectedTeam?.teamName, selectedTeamName]
        .map(staffTeamKey)
        .filter(Boolean),
    );
    const directoryStaff = (selectedTeam?.tycoon?.firedStaffRoles ?? []).includes(hire.role)
      ? undefined
      : (state.staff?.coaches ?? []).find((staff: any) => (
          selectedTeamKeys.has(staffTeamKey(staff?.team))
          && sameStaffRole(staff?.role ?? staff?.position ?? staff?.jobTitle, hire.role)
        ));
    const currentRoleHolder = currentStaff ?? directoryStaff;
    const isExtensionRequest = String(hire?.id ?? '').startsWith('resign-');
    const isExtension = isExtensionRequest || (!!currentRoleHolder && isSameStaffPerson(currentRoleHolder, hire));
    if (currentRoleHolder && !isExtension) {
      void dispatchAction({
        type: 'UPDATE_STATE',
        payload: { lastOutcome: `Fire ${currentRoleHolder.name} before signing a new ${displayStaffRole(hire.role)}.` },
      });
      return false;
    }
    const signingBonus = Math.max(0, Math.round(Number(hire.bonus ?? 0)));
    const usesEuroCash = isEuroIsolatedMode(state);
    const isPbaStaffMarket = resolveStaffMarketForTeam(selectedTeam) === 'pba';
    let hireApplied = false;
    let failureMessage = '';
    const applyHireAgreement = (teamState: any) => {
      ensureStaffShell(teamState);
      const existingForRole = teamState.tycoon.staffMembers.find((staff: any) => sameStaffRole(staff.role, hire.role));
      const isRoleExtension = !!existingForRole && isSameStaffPerson(existingForRole, hire);
      const existingRoleIsActive = !!existingForRole && Number(existingForRole.contractYears ?? 1) > 0;
      if (existingRoleIsActive && !isRoleExtension) {
        failureMessage = `Fire ${existingForRole.name} before signing a new ${displayStaffRole(hire.role)}.`;
        return;
      }
      const availableSigningPerk = usesEuroCash && hire.sponsorSigningPerk
        ? getAvailableSigningSponsorPerks(teamState.tycoon, currentYear, 'staff', Number(hire.salary ?? 0))
            .find(choice => (
              choice.sponsor === hire.sponsorSigningPerk.sponsor
              && choice.perk.id === hire.sponsorSigningPerk.perkId
            ))
        : undefined;
      if (usesEuroCash && hire.sponsorSigningPerk && !availableSigningPerk) {
        failureMessage = 'That sponsor signing perk is no longer available.';
        return;
      }
      if (usesEuroCash && signingBonus > 0) {
        const finance = getClubFinanceSnapshot(teamState.tycoon, state.date);
        if (finance.availableEUR < signingBonus) {
          failureMessage = 'The club does not have enough available cash for that signing bonus.';
          return;
        }
        const transaction = postClubTransaction(teamState.tycoon, {
          sourceId: `staff-signing-bonus:${userTeamId}:${String(hire.id ?? hire.name)}:${hire.role}:${currentYear}:${state.date}`,
          date: state.date,
          season: currentYear,
          category: 'staff',
          label: `${hire.name} ${isExtension ? 'extension' : 'signing'} bonus`,
          amountEUR: -signingBonus,
        });
        if (!transaction) {
          failureMessage = 'That staff agreement has already been processed.';
          return;
        }
      }
      const signingPerk = usesEuroCash && hire.sponsorSigningPerk
        ? consumeSponsorSigningPerk(
          teamState.tycoon,
          currentYear,
          hire.sponsorSigningPerk.sponsor,
          hire.sponsorSigningPerk.perkId,
          'staff',
          Number(hire.salary ?? 0),
        )
        : undefined;
      if (usesEuroCash && hire.sponsorSigningPerk && !signingPerk) {
        failureMessage = 'That sponsor signing perk is no longer available.';
        return;
      }
      const baseMember = isRoleExtension ? { ...existingForRole, ...hire } : hire;
      const careerHistory = isRoleExtension
        ? (existingForRole.career_history ?? existingForRole.coaching_career ?? hire.career_history ?? hire.coaching_career ?? '')
        : appendStaffCareerRow(
          closePresentCareerRanges(hire.career_history ?? hire.coaching_career ?? '', currentYear),
          currentYear,
          selectedTeamName,
          hire.role,
        );
      const coachingCareer = isRoleExtension
        ? (existingForRole.coaching_career ?? existingForRole.career_history ?? hire.coaching_career ?? hire.career_history ?? '')
        : appendStaffCareerRow(
          closePresentCareerRanges(hire.coaching_career ?? hire.career_history ?? '', currentYear),
          currentYear,
          selectedTeamName,
          hire.role,
        );
      const staffMembers = teamState.tycoon.staffMembers.filter((staff: any) => staff.role !== hire.role);
      teamState.tycoon.staffMembers = [
        ...staffMembers,
        {
          ...baseMember,
          id: baseMember.id ?? `staff-${hire.role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
          role: hire.role,
          name: hire.name,
          isPlaceholder: false,
          nationality: hire.nationality,
          salary: hire.salary,
          staffEconomyVersion: isPbaStaffMarket ? PBA_STAFF_ECONOMY_VERSION : baseMember.staffEconomyVersion,
          contractYears: hire.years,
          rating: hire.rating,
          hiredYear: isRoleExtension ? existingForRole.hiredYear ?? hire.hiredYear ?? currentYear : currentYear,
          roleStartYear: isRoleExtension ? existingForRole.roleStartYear ?? existingForRole.hiredYear ?? hire.roleStartYear ?? currentYear : currentYear,
          signingBonus: hire.bonus,
          signingPerk,
          face: hire.face,
          staffImageId: hire.staffImageId,
          playerPortraitUrl: hire.playerPortraitUrl,
          career_history: careerHistory,
          coaching_career: coachingCareer,
        },
      ];
      if (!usesEuroCash) {
        teamState.tycoon.cashOnHand = Math.round((teamState.tycoon.cashOnHand ?? 0) - signingBonus);
      }
      teamState.tycoon.firedStaffRoles = (teamState.tycoon.firedStaffRoles ?? []).filter((role: string) => role !== hire.role);
      hireApplied = true;
    };
    if (!selectedTeam) {
      void dispatchAction({ type: 'UPDATE_STATE', payload: { lastOutcome: 'The managed club could not be found.' } });
      return false;
    }
    applyHireAgreement(structuredClone(selectedTeam));
    if (!hireApplied) {
      void dispatchAction({ type: 'UPDATE_STATE', payload: { lastOutcome: failureMessage || 'The staff agreement could not be completed.' } });
      return false;
    }
    hireApplied = false;
    failureMessage = '';
    applyTycoonMutation(userTeamId, applyHireAgreement);
    const remainingPool = (state.staffFreeAgents ?? []).filter((member: any) => member.id !== hire.id);
    const leagueId = inferEuroStaffLeagueId(userTeamId, state.leagueType);
    const refilled = ensureStaffPoolDepth({ ...state, staffFreeAgents: remainingPool } as any, leagueId);
    void dispatchAction({
      type: 'UPDATE_STATE',
      payload: {
        staffFreeAgents: refilled.staffFreeAgents ?? remainingPool,
        history: [
          ...(state.history ?? []),
          {
            text: isExtension
              ? `${hire.name} signed a ${hire.years}-year extension with ${selectedTeamName} as ${displayStaffRole(hire.role)}.`
              : `${selectedTeamName} hired ${hire.name} as ${displayStaffRole(hire.role)}.`,
            date: state.date,
            type: 'Personnel',
            tid: userTeamId,
          },
        ],
      },
    });
    return true;
  };

  return { handleFireStaff, handleHireStaff, handlePromoteStaff };
};
