import { getTeamFullName } from '../../utils/teamNames';
import type { Player } from './types';

export const DEFAULT_NBA_MINIGAME_ROSTER_URL =
  'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json';

export function parseBbgmMiniGamePlayers(data: any): Player[] {
  if (!data || !Array.isArray(data.players)) {
    throw new Error('Invalid JSON format: missing or invalid players array');
  }

  const teamAbbrevs = new Map<number, string>();
  const teamNames = new Map<number, string>();
  const teamColors = new Map<number, string[]>();
  for (const team of Array.isArray(data.teams) ? data.teams : []) {
    const tid = Number(team?.tid);
    if (!Number.isFinite(tid)) continue;
    if (team.abbrev) teamAbbrevs.set(tid, String(team.abbrev));
    const fullName = getTeamFullName(team);
    if (fullName) teamNames.set(tid, fullName);
    if (Array.isArray(team.colors)) {
      teamColors.set(tid, team.colors.map((color: unknown) => String(color)).filter(Boolean));
    }
  }

  const currentYear = Number(data.startingSeason) || new Date().getFullYear();
  return data.players.flatMap((source: any, index: number) => {
    if (!Array.isArray(source?.ratings) || source.ratings.length === 0) return [];
    const latestRating = [...source.ratings].sort((left, right) =>
      Number(left?.season ?? 0) - Number(right?.season ?? 0)
    ).at(-1);
    const tid = Number(source.tid);
    const weightLbs = Number(source.weight) || 215;
    const wtRating = Math.max(0, Math.min(99, ((weightLbs - 150) / (330 - 150)) * 99));
    const rawName = String(source.name ?? '').trim();
    const firstName = String(source.firstName ?? '').trim() || rawName.split(/\s+/)[0] || 'Unknown';
    const lastName = String(source.lastName ?? '').trim() || rawName.split(/\s+/).slice(1).join(' ');
    return [{
      pid: Number.isFinite(Number(source.pid)) ? Number(source.pid) : index,
      firstName,
      lastName,
      tid,
      teamAbbrev: teamAbbrevs.get(tid) || 'FA',
      teamName: teamNames.get(tid) || teamAbbrevs.get(tid) || 'Free Agent',
      teamColors: teamColors.get(tid),
      age: source.born?.year ? currentYear - Number(source.born.year) : 25,
      bornYear: Number(source.born?.year) || undefined,
      ovr: Number(latestRating?.ovr) || 50,
      hgt: Number(latestRating?.hgt) || 0,
      spd: Number(latestRating?.spd) || 0,
      jmp: Number(latestRating?.jmp) || 0,
      str: Number(latestRating?.stre) || 0,
      end: Number(latestRating?.endu) || 0,
      pss: Number(latestRating?.pss) || 0,
      wtRating,
      weightLbs,
      imgURL: String(source.imgURL ?? ''),
      pos: String(source.pos ?? latestRating?.pos ?? 'G'),
      jerseyNumber: source.jerseyNumber == null ? undefined : String(source.jerseyNumber),
    }];
  });
}
