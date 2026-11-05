import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';
import type { Chat, ChatMessage, GameState } from '../../types';
import { progressEuroAcademyPlayer } from '../../services/playerDevelopment/ProgressionEngine';
import { createEmptyEuroScoutingState } from '../../services/euroScouting/types';
import { getEuroUserTeam, getRegionalScouts, isLegacyEuroAcademyCandidate } from '../../services/euroScouting/engine';
import { isEuroIsolatedMode } from '../../utils/uiMode';
import { getDisplayOverall, getDisplayPotential } from '../../utils/playerRatings';
import { normalizePositionLabel } from '../../utils/positionUtils';

type SetGameState = Dispatch<SetStateAction<GameState>>;

const dateForOffset = (date: string, offsetDays: number): string => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return date;
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
};

const appendScoutMessage = (
  chats: Chat[],
  scoutId: string,
  scoutName: string,
  scoutPortraitUrl: string | undefined,
  text: string,
  date: string,
  assignmentId: string,
): Chat[] => {
  const chatId = `euro-scout-chat-${scoutId}`;
  const message: ChatMessage = {
    id: `${assignmentId}-complete`,
    senderId: scoutId,
    senderName: scoutName,
    text,
    timestamp: date,
    read: false,
    type: 'text',
  };
  const existing = chats.find(chat => chat.id === chatId);
  if (!existing) {
    return [{
      id: chatId,
      participants: ['commissioner', scoutId],
      participantDetails: [
        { id: 'commissioner', name: 'You', role: 'General Manager' },
        { id: scoutId, name: scoutName, role: 'Regional Scout', avatarUrl: scoutPortraitUrl },
      ],
      messages: [message],
      lastMessage: message,
      unreadCount: 1,
    }, ...chats];
  }
  if (existing.messages.some(item => item.id === message.id)) return chats;
  return chats.map(chat => chat.id === chatId ? {
    ...chat,
    participantDetails: chat.participantDetails.map(participant => participant.id === scoutId && scoutPortraitUrl
      ? { ...participant, avatarUrl: scoutPortraitUrl }
      : participant),
    messages: [...chat.messages, message],
    lastMessage: message,
    unreadCount: chat.unreadCount + 1,
  } : chat);
};

export const useEuroScoutingLifecycle = (state: GameState, setState: SetGameState) => {
  useEffect(() => {
    if (!state.isDataLoaded || !isEuroIsolatedMode(state) || state.gameMode !== 'gm') return;
    const scouting = state.euroScouting;
    if (!scouting?.legacyAcademyMigrated) {
      setState(prev => {
        if (prev.userTeamId == null || !isEuroIsolatedMode(prev) || prev.gameMode !== 'gm') return prev;
        const current = prev.euroScouting ?? createEmptyEuroScoutingState();
        const legacy = prev.players.filter(player => isLegacyEuroAcademyCandidate(player, prev.userTeamId!));
        const legacyIds = new Set(legacy.map(player => player.internalId));
        return {
          ...prev,
          players: legacy.length ? prev.players.filter(player => !legacyIds.has(player.internalId)) : prev.players,
          euroScouting: {
            ...current,
            legacyAcademyMigrated: true,
            academyPlayers: [
              ...current.academyPlayers,
              ...legacy.filter(player => !current.academyPlayers.some(existing => existing.internalId === player.internalId)).map(player => {
                const academyOverall = getDisplayOverall(player, prev.leagueStats.year);
                const academyPotential = getDisplayPotential(
                  player,
                  prev.leagueStats.year,
                  prev.leagueStats.year,
                  { floorAtEstimated: true },
                );
                return {
                  ...player,
                  pos: normalizePositionLabel(player.pos, player.hgt),
                  euroAcademyPlayer: true as const,
                  euroGeneratedYouth: true as const,
                  academyRatingVersion: 2 as const,
                  academyOverall,
                  academyBaseOverall: academyOverall,
                  academyDevelopmentForm: 0,
                  academyPotential: Math.max(academyOverall, academyPotential),
                  academyTeamId: prev.userTeamId!,
                  academyJoinedDate: prev.date,
                  academyJoinedDay: prev.day,
                  academyLastProgressDay: prev.day,
                  ovrTimeline: player.ovrTimeline?.length
                    ? player.ovrTimeline
                    : [{ date: prev.date, ovr: academyOverall, displayScale: 'k2' as const }],
                };
              }),
            ],
          },
        };
      });
      return;
    }
    const assignmentNeedsUpdate = scouting.assignments.some(assignment => (
      assignment.status === 'active' && state.day - assignment.startedDay >= assignment.durationDays
    ) || (assignment.status === 'ready' && !assignment.notificationSent));
    const academyNeedsUpdate = scouting.academyPlayers.some(player => player.academyLastProgressDay < state.day);
    const positionNeedsUpdate = scouting.assignments.some(assignment => assignment.prospects.some(
      player => player.pos !== normalizePositionLabel(player.pos, player.hgt),
    )) || scouting.academyPlayers.some(
      player => player.pos !== normalizePositionLabel(player.pos, player.hgt),
    ) || state.players.some(
      player => player.promotedFromAcademy
        && player.euroGeneratedYouth === true
        && player.pos !== normalizePositionLabel(player.pos, player.hgt),
    );
    if (!assignmentNeedsUpdate && !academyNeedsUpdate && !positionNeedsUpdate) return;

    setState(prev => {
      if (!isEuroIsolatedMode(prev) || prev.gameMode !== 'gm') return prev;
      const current = prev.euroScouting ?? createEmptyEuroScoutingState();
      const team = getEuroUserTeam(prev);
      const scoutPortraitById = new Map(getRegionalScouts(team, current.assignments)
        .map(scout => [scout.id, scout.portraitUrl] as const));
      let chats = prev.chats;
      let countryHistory = current.countryHistory;
      let assignmentChanged = false;
      const assignments = current.assignments.map(assignment => {
        const complete = assignment.status === 'active' && prev.day - assignment.startedDay >= assignment.durationDays;
        const normalizedProspects = assignment.prospects.map(player => {
          const pos = normalizePositionLabel(player.pos, player.hgt);
          return pos === player.pos ? player : { ...player, pos };
        });
        const positionsChanged = normalizedProspects.some((player, index) => player !== assignment.prospects[index]);
        const normalizedAssignment = positionsChanged ? { ...assignment, prospects: normalizedProspects } : assignment;
        const ready = complete ? { ...normalizedAssignment, status: 'ready' as const, completedDay: prev.day } : normalizedAssignment;
        if (positionsChanged) assignmentChanged = true;
        if (!complete && (ready.status !== 'ready' || ready.notificationSent)) return ready;
        const discoveryText = ready.prospects.length === 0
          ? `My trip to ${ready.countryName} is complete. I did not find a player ready for our academy this time.`
          : `My ${ready.countryName} report is ready. I found ${ready.prospects.length} ${ready.prospects.length === 1 ? 'player' : 'players'} for you to review.`;
        const scoutPortraitUrl = ready.scoutPortraitUrl ?? scoutPortraitById.get(ready.scoutId);
        chats = appendScoutMessage(chats, ready.scoutId, ready.scoutName, scoutPortraitUrl, discoveryText, prev.date, ready.id);
        countryHistory = {
          ...countryHistory,
          [ready.countryId]: {
            timesScouted: (countryHistory[ready.countryId]?.timesScouted ?? 0) + (complete ? 1 : 0),
            lastScoutedDate: prev.date,
          },
        };
        assignmentChanged = true;
        return { ...ready, scoutPortraitUrl, notificationSent: true };
      });

      const growthSpurtToasts: NonNullable<GameState['pendingAcademyGrowthSpurtToasts']> = [];
      const academyMentorIds = new Set(current.academyPlayers
        .map(player => player.mentorId)
        .filter((mentorId): mentorId is string => Boolean(mentorId)));
      const academyMentors = new Map(prev.players
        .filter(player => academyMentorIds.has(player.internalId))
        .map(player => [player.internalId, player] as const));
      const academyPlayers = current.academyPlayers.map(player => {
        const missedDays = Math.max(0, Math.min(730, prev.day - player.academyLastProgressDay));
        const normalizedPos = normalizePositionLabel(player.pos, player.hgt);
        const normalizedPlayer = normalizedPos === player.pos ? player : { ...player, pos: normalizedPos };
        if (missedDays === 0) return normalizedPlayer;
        let progressed = normalizedPlayer;
        for (let offset = missedDays - 1; offset >= 0; offset -= 1) {
          const previousHeight = Number(progressed.hgt ?? 0);
          const next = progressEuroAcademyPlayer(
            progressed,
            team,
            prev.leagueStats.year,
            dateForOffset(prev.date, -offset),
            academyMentors,
          ) as typeof player;
          const heightGain = Math.max(0, Number(next.hgt ?? 0) - previousHeight);
          if (heightGain >= 2) {
            growthSpurtToasts.push({
              playerName: next.name,
              inches: heightGain,
              newHeight: Number(next.hgt ?? previousHeight),
            });
          }
          progressed = next;
        }
        return {
          ...progressed,
          pos: normalizePositionLabel(progressed.pos, progressed.hgt),
          academyLastProgressDay: prev.day,
        };
      });
      const players = prev.players.map(player => {
        if (!player.promotedFromAcademy || player.euroGeneratedYouth !== true) return player;
        const pos = normalizePositionLabel(player.pos, player.hgt);
        return pos === player.pos ? player : { ...player, pos };
      });

      return {
        ...prev,
        players,
        chats,
        pendingAcademyGrowthSpurtToasts: growthSpurtToasts.length
          ? [...(prev.pendingAcademyGrowthSpurtToasts ?? []), ...growthSpurtToasts]
          : prev.pendingAcademyGrowthSpurtToasts,
        euroScouting: {
          ...current,
          assignments: assignmentChanged ? assignments : current.assignments,
          academyPlayers,
          countryHistory,
        },
      };
    });
  }, [setState, state.date, state.day, state.euroScouting, state.gameMode, state.isDataLoaded, state.leagueStats.year, state.leagueStats.uiMode, state.moddedLeagueBase, state.players]);
};
