import { ensureStaffPoolDepth, inferEuroStaffLeagueId, toStaffFreeAgent } from '../../../services/euro/staffPool';

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

const closePresentRanges = (career: string, endYear: number) =>
  String(career ?? '').replace(/(\d{4})\s*-\s*Present/gi, `$1-${endYear}`);

const appendCareerRow = (career: string, startYear: number, teamName: string, role: string) => {
  const normalizedRole = role.replace(/ \d+$/, '');
  const roleLabel = normalizedRole === 'Assistant Coach' ? 'Assistant Coach' : normalizedRole;
  const row = `${startYear}-Present ${teamName} (${roleLabel})`;
  const base = String(career ?? '').trim();
  return base ? `${base}\n${row}` : row;
};

const displayStaffRole = (role: string) => role.replace(/ \d+$/, '');

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
    applyTycoonMutation(userTeamId, (teamState: any) => {
      ensureStaffShell(teamState);
      teamState.tycoon.staffMembers = teamState.tycoon.staffMembers.filter((staff: any) => staff.role !== fromRole && staff.role !== toRole);
      teamState.tycoon.staffMembers.push({
        ...(person ?? {}),
        id: person?.id ?? `staff-${toRole.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        role: toRole,
        career_history: appendCareerRow(
          closePresentRanges(person?.career_history ?? person?.coaching_career ?? '', currentYear),
          currentYear,
          selectedTeamName,
          toRole,
        ),
        coaching_career: appendCareerRow(
          closePresentRanges(person?.coaching_career ?? person?.career_history ?? '', currentYear),
          currentYear,
          selectedTeamName,
          toRole,
        ),
      });
      if (!teamState.tycoon.firedStaffRoles.includes(fromRole)) teamState.tycoon.firedStaffRoles.push(fromRole);
      teamState.tycoon.firedStaffRoles = teamState.tycoon.firedStaffRoles.filter((role: string) => role !== toRole);
    });
    pushPersonnelHistory(`${selectedTeamName} promoted ${person?.name ?? 'a staff member'} from ${displayStaffRole(fromRole)} to ${displayStaffRole(toRole)}.`);
  };

  const handleFireStaff = (role: string) => {
    const fired = (selectedTeam?.tycoon?.staffMembers ?? []).find((staff: any) => staff.role === role);
    applyTycoonMutation(userTeamId, (teamState: any) => {
      ensureStaffShell(teamState);
      const currentMember = teamState.tycoon.staffMembers.find((staff: any) => staff.role === role);
      if (currentMember) {
        currentMember.career_history = closePresentRanges(currentMember.career_history ?? currentMember.coaching_career ?? '', currentYear);
        currentMember.coaching_career = closePresentRanges(currentMember.coaching_career ?? currentMember.career_history ?? '', currentYear);
      }
      teamState.tycoon.staffMembers = teamState.tycoon.staffMembers.filter((staff: any) => staff.role !== role);
      if (!teamState.tycoon.firedStaffRoles.includes(role)) teamState.tycoon.firedStaffRoles.push(role);
    });
    if (fired) {
      const leagueId = inferEuroStaffLeagueId(userTeamId);
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
    const currentStaff = (selectedTeam?.tycoon?.staffMembers ?? []).find((staff: any) => staff.role === hire.role);
    const isExtension = currentStaff && currentStaff.name === hire.name;
    applyTycoonMutation(userTeamId, (teamState: any) => {
      ensureStaffShell(teamState);
      const staffMembers = teamState.tycoon.staffMembers.filter((staff: any) => staff.role !== hire.role);
      teamState.tycoon.staffMembers = [
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
          playerPortraitUrl: hire.playerPortraitUrl,
          career_history: appendCareerRow(
            closePresentRanges(hire.career_history ?? hire.coaching_career ?? '', currentYear),
            currentYear,
            selectedTeamName,
            hire.role,
          ),
          coaching_career: appendCareerRow(
            closePresentRanges(hire.coaching_career ?? hire.career_history ?? '', currentYear),
            currentYear,
            selectedTeamName,
            hire.role,
          ),
        },
      ];
      teamState.tycoon.cashOnHand = Math.round((teamState.tycoon.cashOnHand ?? 0) - (hire.bonus ?? 0));
      teamState.tycoon.firedStaffRoles = (teamState.tycoon.firedStaffRoles ?? []).filter((role: string) => role !== hire.role);
    });
    const remainingPool = (state.staffFreeAgents ?? []).filter((member: any) => member.id !== hire.id);
    const leagueId = inferEuroStaffLeagueId(userTeamId);
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
  };

  return { handleFireStaff, handleHireStaff, handlePromoteStaff };
};
