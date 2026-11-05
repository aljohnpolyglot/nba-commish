import type { GameState } from '../../types';
import type { StaffMember } from '../../types/staff';
import { getTeamFullName } from '../../utils/teamNames';
import { isOnRoster } from '../../utils/teamLookup';
import { displayStaffRole } from '../staff/staffCareerRows';

const normalizeKey = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const getUserTeam = (state: GameState) => {
  const nbaTeam = state.teams.find(team => team.id === state.userTeamId);
  if (nbaTeam) return nbaTeam;
  return state.nonNBATeams.find(team => team.tid === state.userTeamId);
};

const getTeamId = (state: GameState): number | undefined => {
  const team = getUserTeam(state);
  if (team && 'tid' in team && typeof team.tid === 'number') return team.tid;
  if (team && 'id' in team) return team.id;
  return state.userTeamId;
};

const getTeamNameById = (state: GameState, teamId: number): string => {
  const team = state.teams.find(item => item.id === teamId)
    ?? state.nonNBATeams.find(item => item.tid === teamId);
  return team ? getTeamFullName(team) : `Team ${teamId}`;
};

export const findManagedStaffMember = (
  state: GameState,
  recipientId: string,
  targetName?: string,
): StaffMember | undefined => {
  const team = getUserTeam(state);
  const members = team?.tycoon?.staffMembers ?? [];
  const idKey = normalizeKey(recipientId.replace(/^staff-/, ''));
  const nameKey = normalizeKey(targetName ?? recipientId.replace(/^(?:coach|staff)-/, ''));
  return members.find(member => normalizeKey(member.id) === idKey || normalizeKey(member.name) === nameKey);
};

const getProspectAge = (state: GameState, bornYear: number | undefined, age: number | undefined): number | null => {
  const value = Number(age ?? (bornYear ? state.leagueStats.year - bornYear : NaN));
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
};

const describeProspect = (state: GameState, prospect: GameState['players'][number]): string => {
  const age = getProspectAge(state, prospect.born?.year, prospect.age);
  return `${prospect.name} (${prospect.pos}${age === null ? '' : `, age ${age}`})`;
};

const getStaffAssignments = (state: GameState, member: StaffMember) => {
  const idKey = normalizeKey(member.id);
  const nameKey = normalizeKey(member.name);
  return [...(state.euroScouting?.assignments ?? [])]
    .filter(assignment => normalizeKey(assignment.scoutId) === idKey || normalizeKey(assignment.scoutName) === nameKey)
    .sort((a, b) => (b.completedDay ?? b.startedDay) - (a.completedDay ?? a.startedDay));
};

const isMedicalRole = (role: string): boolean => /doctor|medical|physio|recovery|sports science/i.test(role);

const getCurrentInjuries = (state: GameState, teamId: number | undefined) => state.players
  .filter(player => player.tid === teamId && isOnRoster(player) && player.injury?.gamesRemaining > 0);

const getSavedInjuryEvents = (state: GameState, teamId: number | undefined) => state.boxScores
  .filter(result => result.date <= state.date)
  .flatMap(result => (result.injuries ?? [])
    .filter(injury => injury.teamId === teamId)
    .map(injury => ({ ...injury, date: result.date, competitionId: result.competitionId })))
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 12);

const getRecentResults = (state: GameState, teamId: number | undefined): string[] => state.boxScores
  .filter(result => result.date <= state.date && (result.homeTeamId === teamId || result.awayTeamId === teamId))
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 5)
  .map(result => {
    const isHome = result.homeTeamId === teamId;
    const opponentId = isHome ? result.awayTeamId : result.homeTeamId;
    const ownScore = isHome ? result.homeScore : result.awayScore;
    const opponentScore = isHome ? result.awayScore : result.homeScore;
    const outcome = result.winnerId === teamId ? 'W' : 'L';
    const competition = result.competitionId ? `, ${result.competitionId}` : '';
    return `${result.date}${competition}: ${outcome} ${ownScore}-${opponentScore} vs ${getTeamNameById(state, opponentId)}`;
  });

const getUpcomingFixtures = (state: GameState, teamId: number | undefined): string[] => state.schedule
  .filter(game => !game.played && game.date >= state.date && (game.homeTid === teamId || game.awayTid === teamId))
  .sort((a, b) => a.date.localeCompare(b.date))
  .slice(0, 5)
  .map(game => {
    const isHome = game.homeTid === teamId;
    const opponentId = isHome ? game.awayTid : game.homeTid;
    const competition = game.competitionId ? `, ${game.competitionId}` : '';
    return `${game.date}${competition}: ${isHome ? 'home' : 'away'} vs ${getTeamNameById(state, opponentId)}`;
  });

const getRoleBrief = (role: string): string => {
  if (/regional scout/i.test(role)) return 'You identify youth prospects in your assigned countries and can discuss only reports you have completed or trips currently assigned to you.';
  if (/chief scout/i.test(role)) return 'You coordinate the scouting department, its assignments, and the volume and quality of prospect reports.';
  if (/academy/i.test(role)) return 'You oversee youth-academy development, player roles, and promotion readiness.';
  if (isMedicalRole(role)) return 'You oversee player health, injuries, rehabilitation, and availability.';
  if (/coach|development/i.test(role)) return 'You coach the senior roster and can discuss player roles, development, preparation, and team performance.';
  if (/analytics/i.test(role)) return 'You support basketball decisions with team, player, and opponent analysis.';
  return `You handle the responsibilities of the club's ${role}.`;
};

export const buildManagedStaffChatContext = (
  state: GameState,
  member: StaffMember,
): string => {
  const team = getUserTeam(state);
  const teamId = getTeamId(state);
  const teamName = team ? getTeamFullName(team) : 'the club';
  const role = displayStaffRole(member.role ?? member.position ?? member.jobTitle ?? 'Staff Member');
  const roster = state.players.filter(player => player.tid === teamId && isOnRoster(player));
  const assignments = getStaffAssignments(state, member);
  const lines = [
    `You are ${member.name}, the ${role} for ${teamName}.`,
    getRoleBrief(role),
    `Current date: ${state.date}. Current season: ${state.leagueStats.year}.`,
  ];

  if (member.contractYears != null || member.salary != null) {
    const contract = [
      member.contractYears != null ? `${member.contractYears} contract years` : null,
      member.salary != null ? `annual salary EUR ${Math.round(member.salary).toLocaleString('en-US')}` : null,
    ].filter(Boolean).join(', ');
    lines.push(`Your employment: ${contract}.`);
  }

  if (/regional scout/i.test(role)) {
    if (assignments.length === 0) {
      lines.push('Assignment status: Available for Assignment. You have no saved scouting assignments yet. Do not invent prospects or reports.');
    } else {
      const active = assignments.find(assignment => assignment.status === 'active');
      const ready = assignments.find(assignment => assignment.status === 'ready');
      if (active) {
        const remainingDays = Math.max(0, active.startedDay + active.durationDays - state.day);
        lines.push(`Assignment status: On Assignment in ${active.countryName}; started ${active.startedDate}; planned duration ${active.durationDays} days; ${remainingDays} days remaining.`);
      } else if (ready) {
        lines.push(`Assignment status: Report Ready/Pending Review for ${ready.countryName}. You are not available for a new assignment until that report is finalized.`);
      } else {
        lines.push('Assignment status: Available for Assignment.');
      }
      lines.push(`Your saved assignments: ${assignments.slice(0, 5).map(assignment => {
        const prospects = assignment.prospects.map(prospect => describeProspect(state, prospect));
        return `${assignment.countryName}, started ${assignment.startedDate}, ${assignment.durationDays} days (${assignment.status}): ${prospects.length ? prospects.join(', ') : 'no prospects identified'}`;
      }).join(' | ')}`);
    }
  } else if (/chief scout/i.test(role)) {
    const reports = [...(state.euroScouting?.assignments ?? [])]
      .sort((a, b) => (b.completedDay ?? b.startedDay) - (a.completedDay ?? a.startedDay))
      .slice(0, 8)
      .map(assignment => `${assignment.scoutName}: ${assignment.countryName}, ${assignment.status}, ${assignment.prospects.length} identified`);
    lines.push(reports.length ? `Recent department assignments: ${reports.join(' | ')}` : 'The department has no saved scouting assignments yet.');
  } else if (/academy/i.test(role)) {
    const academy = state.euroScouting?.academyPlayers ?? [];
    lines.push(academy.length ? `Current academy players: ${academy.slice(0, 15).map(player => {
      const report = (state.euroScouting?.assignments ?? []).find(assignment => assignment.assignedProspectIds.includes(player.internalId));
      const reportOrigin = report ? `; report ${report.countryName} by ${report.scoutName}` : '';
      const focus = player.developmentArchetype ?? player.devFocus ?? 'Balanced';
      return `${describeProspect(state, player)} — In Academy since ${player.academyJoinedDate}; focus ${focus}${reportOrigin}`;
    }).join(' | ')}` : 'There are no players in the youth academy right now.');
  } else if (isMedicalRole(role)) {
    const injured = getCurrentInjuries(state, teamId);
    lines.push(injured.length
      ? `Current medical report: ${injured.map(player => `${player.name} (${player.pos}): ${player.injury.type}, ${player.injury.gamesRemaining} games remaining${player.injury.startDate ? `, recorded ${player.injury.startDate}` : ''}${player.injury.origin ? `, ${player.injury.origin}` : ''}`).join(' | ')}`
      : 'Current medical report: every senior-roster player is available; there are no saved active injuries.');
    const injuryEvents = getSavedInjuryEvents(state, teamId);
    lines.push(injuryEvents.length
      ? `Recent saved injury events: ${injuryEvents.map(event => `${event.date}: ${event.playerName}, ${event.injuryType}, initial absence ${event.gamesRemaining} games${event.competitionId ? `, ${event.competitionId}` : ''}`).join(' | ')}`
      : 'There are no saved in-game injury events for this club in the available branch history.');
  } else {
    lines.push(roster.length
      ? `Current senior roster: ${roster.slice(0, 20).map(player => `${player.name} (${player.pos})`).join(', ')}.`
      : 'There is no saved senior roster for the club right now.');
    const injured = roster.filter(player => player.injury && player.injury.gamesRemaining > 0);
    if (injured.length) {
      lines.push(`Current injuries: ${injured.map(player => `${player.name}: ${player.injury?.type}, ${player.injury?.gamesRemaining} games remaining`).join(' | ')}.`);
    }
    if (/coach|development|analytics/i.test(role)) {
      const recentResults = getRecentResults(state, teamId);
      const upcoming = getUpcomingFixtures(state, teamId);
      lines.push(recentResults.length ? `Recent team results: ${recentResults.join(' | ')}` : 'There are no saved recent results for the club.');
      lines.push(upcoming.length ? `Upcoming fixtures: ${upcoming.join(' | ')}` : 'There are no saved upcoming fixtures for the club.');
    }
  }

  lines.push('Answer only from this save context. Never invent a completed report, prospect, injury, result, or contract detail.');
  return lines.join('\n');
};

export const getManagedStaffFallbackReply = (
  state: GameState,
  member: StaffMember,
  historyText: string,
): string => {
  const role = displayStaffRole(member.role ?? member.position ?? member.jobTitle ?? 'staff member');
  const assignments = getStaffAssignments(state, member);
  const lastMessage = historyText.toLowerCase();
  const asksAboutAvailability = /available|availability|assignment|mission|trip|where are you|where.*scout|how long|return/i.test(lastMessage);
  if (/regional scout/i.test(role) && asksAboutAvailability) {
    const active = assignments.find(assignment => assignment.status === 'active');
    if (active) {
      const remainingDays = Math.max(0, active.startedDay + active.durationDays - state.day);
      return `I'm on assignment in ${active.countryName}. I left on ${active.startedDate} for ${active.durationDays} days, with ${remainingDays} days remaining.`;
    }
    const ready = assignments.find(assignment => assignment.status === 'ready');
    if (ready) return `My ${ready.countryName} report is ready and waiting for review. Finalize it before sending me on another assignment.`;
    return assignments.length
      ? `I'm available for assignment. My saved trips include ${assignments.slice(0, 5).map(assignment => `${assignment.countryName} (${assignment.status})`).join(', ')}.`
      : `I'm available for assignment. I don't have a saved trip yet.`;
  }
  const asksAboutReport = /who|find|found|report|prospect|player/i.test(historyText);
  if (/regional scout/i.test(role) && asksAboutReport) {
    const latest = assignments.find(assignment => assignment.status !== 'active') ?? assignments[0];
    if (!latest) return `I don't have a completed report for you yet.`;
    if (latest.status === 'active') return `I'm still working in ${latest.countryName}. I'll send the names when the report is complete.`;
    if (latest.prospects.length === 0) return `My latest ${latest.countryName} report did not identify a player ready for review.`;
    const names = latest.prospects.slice(0, 10).map(prospect => describeProspect(state, prospect)).join(', ');
    return `My latest ${latest.countryName} report identified ${latest.prospects.length}: ${names}${latest.prospects.length > 10 ? ', and others' : ''}. Open the report archive for the full notes.`;
  }

  const teamId = getTeamId(state);
  if (isMedicalRole(role) && /injur|medical|health|available|status|report|return/i.test(lastMessage)) {
    const injured = getCurrentInjuries(state, teamId);
    if (injured.length === 0) return `The current medical report is clear: every senior-roster player is available, with no saved active injuries.`;
    return `Current medical report: ${injured.map(player => `${player.name} — ${player.injury.type}, ${player.injury.gamesRemaining} games remaining`).join('; ')}.`;
  }

  if (/academy/i.test(role) && /academy|youth|player|status|report|develop|focus|promot/i.test(lastMessage)) {
    const academy = state.euroScouting?.academyPlayers ?? [];
    if (academy.length === 0) return `There are no players assigned to the youth academy right now.`;
    return `We have ${academy.length} in the academy: ${academy.slice(0, 10).map(player => `${player.name} (${player.pos}, ${player.developmentArchetype ?? player.devFocus ?? 'Balanced'} focus)`).join(', ')}${academy.length > 10 ? ', and others' : ''}.`;
  }

  if (/coach|development|analytics/i.test(role) && /team|roster|fixture|schedule|result|form|injur/i.test(lastMessage)) {
    const roster = state.players.filter(player => player.tid === teamId && isOnRoster(player));
    const recent = getRecentResults(state, teamId);
    return `${roster.length} players are on the senior roster.${recent.length ? ` Our latest result: ${recent[0]}.` : ' We do not have a saved recent result yet.'}`;
  }

  const team = getUserTeam(state);
  const teamName = team ? getTeamFullName(team) : 'the club';
  return `I'm the ${role} for ${teamName}. Ask me about my department and I'll answer from the information currently available to me.`;
};
