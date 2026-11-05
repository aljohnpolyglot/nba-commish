import React, { useCallback, useMemo } from 'react';
import { useGame } from '../../store/GameContext';
import type { NBAPlayer, NBATeam, NonNBATeam } from '../../types';
import { computeAge } from '../../utils/helpers';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { getPlayerImage } from '../../utils/playerImage';
import { getPrimaryPlayerCountry } from '../../utils/playerNationality';
import { getScoutedDisplayOverall, getScoutedDisplayPotential } from '../../utils/scoutingFuzz';
import { getTeamFullName } from '../../utils/teamNames';
import { getStandardRosterLimit } from '../../utils/rosterLimits';
import { normalizeTeamJerseyNumbers } from '../../utils/jerseyUtils';
import { getProspectCollege } from '../../utils/prospectUtils';
import {
  applyOpeningFantasyDraftOwnership,
  buildOpeningFantasyDraftHistoryEntries,
  getOpeningFantasyDraftHistoryYear,
} from '../../services/fantasyDraft/openingFantasyDraft';
import { autoGenerateSchedule } from '../../services/logic/autoResolversParts/scheduleResolvers';
import FantasyDraftExperience, { type FantasyDraftSession } from './FantasyDraftExperience';
import type { Player } from './types';
import { configureFantasyDraftBranding } from './lib/nbaBranding';

interface FantasyDraftViewProps {
  onViewChange?: (view: string) => void;
}

type DraftTeam = NBATeam | NonNBATeam;

const teamId = (team: DraftTeam): number => Number('id' in team ? team.id : team.tid);

function playerOriginalTeamId(player: NBAPlayer): number | null {
  const id = Number(player.openingOriginalTid ?? player.fictionalOriginalTid);
  return Number.isFinite(id) ? id : null;
}

export const FantasyDraftView: React.FC<FantasyDraftViewProps> = ({ onViewChange }) => {
  const { state, dispatchAction } = useGame();
  const season = Number(state.leagueStats?.year ?? new Date(state.date).getUTCFullYear());
  const historyYear = getOpeningFantasyDraftHistoryYear(state.date, season);
  const rosterSize = Math.max(5, Number(state.leagueStats?.minPlayersPerTeam ?? getStandardRosterLimit(state.leagueStats)));
  const persistSession = useCallback((session: FantasyDraftSession) => {
    dispatchAction({ type: 'UPDATE_STATE', payload: { openingFantasyDraftSession: session } });
  }, [dispatchAction]);

  const { pool, draftTeams } = useMemo(() => {
    const eligible = state.players.filter(player => player.openingFantasyDraftEligible || player.fictionalFantasyDraftEligible);
    const originalTeamIds = new Set(eligible.map(playerOriginalTeamId).filter((id): id is number => id !== null));
    const teams = [...state.teams, ...(state.nonNBATeams ?? [])]
      .filter(team => originalTeamIds.has(teamId(team))) as DraftTeam[];
    const byId = new Map(teams.map(team => [teamId(team), team]));
    configureFantasyDraftBranding(teams.map(team => {
      const colors = team.colors ?? [];
      return {
        abbrev: String(team.abbrev).toUpperCase(),
        name: getTeamFullName(team),
        primaryColor: colors[0] ?? '#1e293b',
        secondaryColor: colors[1] ?? '#334155',
        accentColor: colors[2] ?? colors[1] ?? '#f59e0b',
        logoUrl: ('logoUrl' in team ? team.logoUrl : undefined) ?? ('imgURL' in team ? team.imgURL : undefined) ?? '',
      };
    }));

    const mapped = eligible.flatMap((player): Player[] => {
      const originalTid = playerOriginalTeamId(player);
      const team = originalTid === null ? undefined : byId.get(originalTid);
      if (!team) return [];
      const fullName = String(player.name ?? '').trim();
      const nameParts = fullName.split(/\s+/);
      const displayOverall = getScoutedDisplayOverall(state, player, season);
      const displayPotential = getScoutedDisplayPotential(state, player, season);
      const draftTeam = byId.get(Number(player.draft?.tid));
      const formerTeams = [...new Set((player.transactions ?? [])
        .map(transaction => byId.get(Number(transaction.tid))?.abbrev)
        .filter((abbrev): abbrev is string => !!abbrev && abbrev !== team.abbrev))];
      const position = normalizePositionLabel(player.pos, player.hgt);
      const heightInches = Number(player.hgt ?? 77);
      const jerseyNumber = Number(player.jerseyNumber);
      const conference = Number('cid' in team ? team.cid : undefined) === 1 || String('conference' in team ? team.conference : '').toLowerCase().includes('west')
        ? 'Western' as const
        : 'Eastern' as const;
      const division = 'did' in team && team.did != null ? `Division ${team.did}` : undefined;

      return [{
        id: player.internalId,
        name: fullName,
        firstName: player.firstName ?? nameParts[0] ?? fullName,
        lastName: player.lastName ?? nameParts.slice(1).join(' '),
        position,
        displayPos: position,
        age: computeAge(player, season),
        heightFeetInches: `${Math.floor(heightInches / 12)}'${heightInches % 12}\"`,
        heightInches,
        weight: player.weight,
        jerseyNumber: Number.isFinite(jerseyNumber) ? jerseyNumber : undefined,
        teamId: originalTid,
        teamName: getTeamFullName(team),
        teamAbbrev: String(team.abbrev).toUpperCase(),
        conference,
        division,
        draftYear: player.draft?.year,
        draftPick: player.draft?.pick ? `Round ${player.draft.round ?? 1}, Pick ${player.draft.pick}` : undefined,
        draftTeamAbbrev: draftTeam?.abbrev ?? player.draftAbbrev,
        nationality: getPrimaryPlayerCountry(player),
        college: getProspectCollege(player) ?? undefined,
        formerTeams,
        ovr: displayOverall,
        nativeOvr: displayOverall,
        displayOvr: displayOverall,
        pot: displayPotential,
        headshotUrl: getPlayerImage(player),
      }];
    });

    return { pool: mapped, draftTeams: teams };
  }, [season, state]);

  if (state.gameMode !== 'gm') return null;

  const controlledTeam = draftTeams.find(team => teamId(team) === state.userTeamId) ?? draftTeams[0];
  if (!controlledTeam || pool.length < draftTeams.length * rosterSize) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div className="max-w-lg rounded-2xl border border-rose-500/30 bg-slate-900 p-8">
          <h2 className="text-xl font-black uppercase text-rose-300">Fantasy Draft Cannot Start</h2>
          <p className="mt-3 text-sm text-slate-300">The opening player pool does not contain enough standard-contract players to fill every team to the league minimum.</p>
        </div>
      </div>
    );
  }

  return (
    <FantasyDraftExperience
      allPlayers={pool}
      controlledTeamAbbrev={String(controlledTeam.abbrev).toUpperCase()}
      rosterSize={rosterSize}
      initialSession={state.openingFantasyDraftSession as FantasyDraftSession | undefined}
      onSessionChange={persistSession}
      onComplete={({ teams, history, mode, ordinaryDraftType }) => {
        const ownerByPlayer = new Map<string, number>();
        for (const team of teams) {
          for (const player of team.players) ownerByPlayer.set(player.id, team.id);
        }
        const selectionByPlayer = new Map(history.map(entry => [entry.playerId, {
          pickNum: entry.pickNumber,
        }]));
        const updatedPlayers = applyOpeningFantasyDraftOwnership(state.players, ownerByPlayer, historyYear, selectionByPlayer);
        const jerseyTeams = draftTeams.map(team => ({ ...team, id: teamId(team) })) as NBATeam[];
        const normalizedPlayers = normalizeTeamJerseyNumbers(updatedPlayers, jerseyTeams, season, {
          history: state.history,
          targetTeamIds: draftTeams.map(teamId),
        });
        const fantasyDraftRecord = {
          season: historyYear,
          date: state.date,
          name: `${historyYear} Fantasy Draft`,
          format: mode,
          orderType: ordinaryDraftType ?? undefined,
          picks: history.map(entry => ({
            pick: entry.pickNumber,
            round: entry.round,
            teamId: entry.fantasyTeamId,
            playerId: entry.playerId,
          })),
        };
        const fantasyDraftTransactions = buildOpeningFantasyDraftHistoryEntries(
          history.map(entry => ({
            playerId: entry.playerId,
            playerName: entry.player.name,
            teamId: entry.fantasyTeamId,
            teamName: entry.fantasyTeamName,
            pick: entry.pickNumber,
            round: entry.round,
          })),
          historyYear,
          state.date,
        );
        const completedLeagueStats = {
          ...state.leagueStats,
          openingFantasyDraftCompleted: true,
          openingFantasyDraftFormat: mode,
          openingFantasyDraftOrderType: ordinaryDraftType ?? undefined,
          fictionalFantasyDraftCompleted: true,
        };
        const completedState = {
          ...state,
          players: normalizedPlayers,
          openingFantasyDraftSession: undefined,
          offseasonChecklist: undefined,
          leagueStats: completedLeagueStats,
        };
        const schedulePatch = autoGenerateSchedule(completedState);
        dispatchAction({
          type: 'UPDATE_STATE',
          payload: {
            ...schedulePatch,
            players: normalizedPlayers,
            activeDraftOrder: undefined,
            activeDraftPicks: undefined,
            activeDraftPassedPicks: undefined,
            fantasyDraftHistory: [...(state.fantasyDraftHistory ?? []), fantasyDraftRecord],
            history: [...state.history, ...fantasyDraftTransactions],
            openingFantasyDraftSession: undefined,
            offseasonChecklist: undefined,
            leagueStats: completedLeagueStats,
          },
        });
        onViewChange?.('Schedule');
      }}
    />
  );
};
