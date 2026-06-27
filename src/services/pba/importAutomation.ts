import type { GameState } from '../../types';
import { formatExternalSalary } from '../../constants';
import { seasonLabelToYear } from '../../utils/salaryUtils';
import { getTeamFullName } from '../../utils/teamNames';
import {
  buildPbaImportContractMetadata,
  canSignInPba,
  clampPbaImportOfferSalary,
  getImportRuleForConference,
  getPbaImportContractLabel,
  getPbaImportK2,
  getPbaImportOfferRange,
  hasNbaExperience,
  isActiveExternalRosterPlayer,
  isPbaImportRatingEligible,
  isPbaRosterLocal,
  type PbaConference,
} from './importManager';

type ImportAutomationOptions = {
  allowInjuryReplacements?: boolean;
  excludeUserTeam?: boolean;
  fillMissingTeams?: boolean;
  replacementInjuryGames?: number;
};

const DEFAULT_REPLACEMENT_GAMES = 10;

function resolvePbaMarketMultiplier(team: any): number {
  const rawPop = Number(team?.pop);
  const pop = Number.isFinite(rawPop) && rawPop > 0 ? rawPop : 4.5;
  const normalizedPop = Math.max(1.5, Math.min(15, pop));
  const popMult = 0.82 + ((normalizedPop - 1.5) / (15 - 1.5)) * 0.36;
  const marketText = String(team?.marketSize ?? '').toLowerCase();
  const textMult =
    marketText.includes('large') ? 1.06 :
    marketText.includes('small') ? 0.94 :
    1;
  return Math.max(0.78, Math.min(1.42, popMult * textMult));
}

export function autoManagePbaImports(
  state: GameState,
  conference: PbaConference,
  options: ImportAutomationOptions = {},
): GameState {
  if (getImportRuleForConference(conference) === 'none') return state;

  const pbaTeams = (state.nonNBATeams ?? []).filter((team: any) => team?.league === 'PBA');
  if (pbaTeams.length === 0) return state;

  const allowInjuryReplacements = options.allowInjuryReplacements ?? false;
  const fillMissingTeams = options.fillMissingTeams ?? true;
  const replacementThreshold = options.replacementInjuryGames ?? DEFAULT_REPLACEMENT_GAMES;
  const excludeUserTeam = options.excludeUserTeam === true;
  const userTid = Number(state.userTeamId);
  const season = state.leagueStats?.year ?? new Date().getFullYear();
  const conferenceLabel = getPbaImportContractLabel(conference);

  const ratingOf = (player: any) => {
    const ratings = Array.isArray(player?.ratings) ? player.ratings : [];
    const last = ratings.length > 0 ? ratings[ratings.length - 1] : undefined;
    return Number(player?.overallRating ?? last?.ovr ?? 0);
  };
  const pbaPowerOf = (player: any) => getPbaImportK2(player);
  const teamWinPct = (team: any) => {
    const wins = Number(team?.wins ?? 0);
    const losses = Number(team?.losses ?? 0);
    return wins + losses > 0 ? wins / (wins + losses) : 0.5;
  };
  const repeatScore = (player: any, teamId: number) => {
    const history = ((player as any).pbaImportHistory ?? []) as any[];
    const lastIndex = history.length - 1;
    return history.reduce((score, entry, index) => {
      if (Number(entry.teamId) !== teamId) return score;
      const agePenalty = Math.max(0, season - Number(entry.season ?? season));
      const sameSeasonBonus = Number(entry.season) === Number(season) ? 45 : 0;
      const confBonus = entry.conference === conference ? 22 : 10;
      const lastTeamBonus = index === lastIndex ? 35 : 0;
      return score + Math.max(24, 80 - agePenalty * 8) + confBonus + sameSeasonBonus + lastTeamBonus;
    }, 0);
  };
  const importSalaryForTeam = (player: any, team: any) => {
    const range = getPbaImportOfferRange(player, state.leagueStats as any, conference);
    const marketMult = resolvePbaMarketMultiplier(team);
    return clampPbaImportOfferSalary(
      Math.round(range.marketSalaryUSD * marketMult),
      player,
      state.leagueStats as any,
      conference,
    );
  };
  const assignmentScore = (player: any, team: any) => {
    let seed = 0;
    const key = `${player.internalId}-${team.tid}-${season}-${conference}`;
    for (let i = 0; i < key.length; i++) seed = (Math.imul(31, seed) + key.charCodeAt(i)) | 0;
    const jitter = ((seed >>> 0) % 1000) / 1000;
    return pbaPowerOf(player) * 2.2
      + repeatScore(player, Number(team.tid))
      + teamWinPct(team) * 12
      + (importSalaryForTeam(player, team) / Math.max(1, Number(state.leagueStats?.salaryCap ?? 800_000))) * 18
      + jitter;
  };
  const isHealthyCandidate = (player: any) =>
    Number(player?.injury?.gamesRemaining ?? 0) <= 0 &&
    Number(player?.suspension?.gamesRemaining ?? 0) <= 0;
  const isImportCandidate = (player: any) =>
    String(player?.status ?? '') === 'Free Agent' &&
    isHealthyCandidate(player) &&
    !isActiveExternalRosterPlayer(player) &&
    !isPbaRosterLocal(player, state.leagueStats as any) &&
    hasNbaExperience(player) &&
    isPbaImportRatingEligible(player) &&
    canSignInPba(player, -1, conference, state.players as any, state.leagueStats as any).allowed;

  const currentImportsByTeam = new Map<number, any>();
  for (const player of state.players ?? []) {
    const teamId = Number((player as any)?.tid);
    if (!Number.isFinite(teamId)) continue;
    if (!(player as any)?.isImport || (player as any)?.importConference !== conference) continue;
    if (teamId < 2000 || teamId >= 2100) continue;
    currentImportsByTeam.set(teamId, player);
  }

  const teamsNeedingImports = pbaTeams.filter((team: any) => {
    const teamId = Number(team?.tid ?? team?.id);
    if (!Number.isFinite(teamId)) return false;
    if (excludeUserTeam && teamId === userTid) return false;
    const currentImport = currentImportsByTeam.get(teamId);
    if (!currentImport) return fillMissingTeams;
    if (!allowInjuryReplacements) return false;
    return Number(currentImport?.injury?.gamesRemaining ?? 0) > replacementThreshold;
  });
  if (teamsNeedingImports.length === 0) return state;

  const candidates = [...(state.players ?? [])]
    .filter(isImportCandidate)
    .sort((a: any, b: any) => pbaPowerOf(b) - pbaPowerOf(a) || ratingOf(b) - ratingOf(a));
  if (candidates.length === 0) return state;

  const assignments = new Map<string, { team: any; salaryUSD: number; replacedImport?: any }>();
  const assignedTeams = new Set<number>();
  const assignedPlayers = new Set<string>();
  const rankedMatches = teamsNeedingImports
    .flatMap((team: any) => candidates.flatMap(player => {
      const teamId = Number(team?.tid ?? team?.id);
      const gate = canSignInPba(player, teamId, conference, state.players as any, state.leagueStats as any);
      if (!gate.allowed) return [];
      return [{
        player,
        team,
        score: assignmentScore(player, team),
        replacedImport: currentImportsByTeam.get(teamId),
      }];
    }))
    .sort((a, b) => b.score - a.score);

  for (const match of rankedMatches) {
    const teamId = Number(match.team?.tid ?? match.team?.id);
    if (assignedTeams.has(teamId) || assignedPlayers.has(match.player.internalId)) continue;
    const salaryUSD = importSalaryForTeam(match.player, match.team);
    assignments.set(match.player.internalId, {
      team: match.team,
      salaryUSD,
      replacedImport: match.replacedImport,
    });
    assignedTeams.add(teamId);
    assignedPlayers.add(match.player.internalId);
    if (assignedTeams.size >= teamsNeedingImports.length) break;
  }
  if (assignments.size === 0) return state;

  const replacedImportIds = new Map<string, { teamId: number; teamName: string; replacementCount: number; reserveAllowed: boolean; player: any }>();
  const signings: Array<{ playerId: string; playerName: string; teamId: number; teamName: string; salaryUSD: number }> = [];

  for (const [playerId, assignment] of assignments) {
    const teamId = Number(assignment.team?.tid ?? assignment.team?.id);
    const teamName = getTeamFullName(assignment.team as any);
    signings.push({
      playerId,
      playerName: (state.players ?? []).find((p: any) => p.internalId === playerId)?.name ?? 'Import',
      teamId,
      teamName,
      salaryUSD: assignment.salaryUSD,
    });
    const replacedImport = assignment.replacedImport;
    if (replacedImport) {
      const previousMeta = (replacedImport as any).pbaImportContract ?? buildPbaImportContractMetadata(teamId, conference, state.date);
      const replacementCount = Number(previousMeta.replacementsUsed ?? 0) + 1;
      replacedImportIds.set(replacedImport.internalId, {
        teamId,
        teamName,
        replacementCount,
        reserveAllowed: Number(previousMeta.replacementsUsed ?? 0) === 0,
        player: replacedImport,
      });
    }
  }

  const players = (state.players ?? []).map((player: any) => {
    const replacementMeta = replacedImportIds.get(player.internalId);
    if (replacementMeta) {
      const previousMeta = (player as any).pbaImportContract ?? buildPbaImportContractMetadata(replacementMeta.teamId, conference, state.date);
      return replacementMeta.reserveAllowed
        ? {
            ...player,
            tid: -1,
            status: 'PBA Import Reserve',
            importTeamId: replacementMeta.teamId,
            importConference: conference,
            isImport: true,
            pbaImportContract: {
              ...previousMeta,
              status: 'reserve',
              reserveDate: state.date,
              replacementsUsed: replacementMeta.replacementCount,
            },
          }
        : {
            ...player,
            tid: -1,
            status: 'Free Agent',
            isImport: undefined,
            importConference: undefined,
            importTeamId: undefined,
            pbaImportContract: {
              ...previousMeta,
              status: 'released',
              releaseDate: state.date,
              replacementsUsed: replacementMeta.replacementCount,
            },
          };
    }

    const assignment = assignments.get(player.internalId);
    if (!assignment) return player;
    const teamId = Number(assignment.team?.tid ?? assignment.team?.id);
    const previousYears = ((player as any).contractYears ?? []).filter((cy: any) =>
      cy?.season && seasonLabelToYear(cy.season) < season,
    );
    const replacementCount = replacedImportIds.get(assignment.replacedImport?.internalId ?? '')?.replacementCount ?? 0;
    return {
      ...player,
      tid: teamId,
      status: 'PBA',
      contract: {
        amount: Math.round(assignment.salaryUSD / 1_000),
        exp: season,
        rookie: false,
        type: 'PBA_IMPORT',
      },
      contractYears: [
        ...previousYears,
        {
          season: `${season - 1}-${String(season).slice(-2)}`,
          guaranteed: assignment.salaryUSD,
          option: '',
          type: 'pba_import',
          conference,
        },
      ],
      isImport: true,
      importConference: conference,
      importTeamId: teamId,
      pbaImportContract: buildPbaImportContractMetadata(teamId, conference, state.date, replacementCount),
      pbaImportHistory: [
        ...((player as any).pbaImportHistory ?? []),
        { season, conference, teamId, signedDate: state.date },
      ],
    };
  });

  const history = [
    ...(state.history ?? []),
    ...Array.from(replacedImportIds.values()).map(({ player, teamId, teamName, reserveAllowed }) => ({
      type: 'Waiver',
      date: state.date,
      text: reserveAllowed
        ? `${player.name} replaced as ${teamName} import after a ${player.injury?.type ?? 'major'} injury (${player.injury?.gamesRemaining ?? 0} games) and moved to reserve.`
        : `${player.name} waived as ${teamName} import after a ${player.injury?.type ?? 'major'} injury (${player.injury?.gamesRemaining ?? 0} games).`,
      tid: teamId,
      league: 'PBA',
      playerIds: [player.internalId],
    })),
    ...signings.map(entry => ({
      type: 'Signing',
      date: state.date,
      text: `${entry.playerName} signed as ${entry.teamName} import for the ${season} ${conferenceLabel}: ${formatExternalSalary(entry.salaryUSD, 'PBA')}.`,
      tid: entry.teamId,
      league: 'PBA',
      playerIds: [entry.playerId],
    })),
  ] as any;

  return { ...state, players, history };
}
