import type { NBAGMStat, NBAPlayer } from '../../types';
import type { FibaSelectedPlayer, FibaSourcePlayer, FibaSourceRating } from '../fiba/types';
import { normalizeFibaPersonName } from '../fiba/countryIdentity';
import {
  calculateOverallFromRating,
  estimatePotentialBbgm,
} from '../../store/playerRatingStore';

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sourceId(player: FibaSourcePlayer): string {
  const pid = String(player.pid ?? '').trim();
  if (pid) return `summer-league-source-${pid}`;
  return `summer-league-source-${normalizeFibaPersonName(player.name).replace(/\s+/g, '-')}`;
}

function ratingRows(player: FibaSourcePlayer, year: number): FibaSourceRating[] {
  return (player.ratings ?? [])
    .filter(rating => {
      const season = finiteNumber(rating.season);
      return season != null && season <= year;
    })
    .sort((left, right) => Number(left.season) - Number(right.season))
    .map(rating => {
      const season = Number(rating.season);
      const overall = calculateOverallFromRating(rating);
      const age = Math.max(17, season - Number(player.born?.year ?? season - 22));
      return {
        ...rating,
        season,
        ovr: overall,
        pot: estimatePotentialBbgm(overall, age),
      };
    });
}

function draftForYear(player: FibaSourcePlayer, year: number): NBAPlayer['draft'] {
  const draft = player.draft as Record<string, unknown> | undefined;
  const draftYear = finiteNumber(draft?.year);
  const round = finiteNumber(draft?.round);
  const pick = finiteNumber(draft?.pick);
  if (draftYear == null || draftYear > year) return undefined;
  return {
    year: draftYear,
    tid: finiteNumber(draft?.tid) ?? -1,
    round: round ?? 0,
    pick: pick ?? 0,
    originalTid: finiteNumber(draft?.originalTid),
  };
}

function statsRows(player: FibaSourcePlayer, year: number): NBAGMStat[] {
  return (player.stats ?? [])
    .filter(row => Number(row.season) <= year && Number(row.gp ?? 0) > 0)
    .map(row => {
      const source = row as unknown as Record<string, unknown>;
      const value = (key: string) => finiteNumber(source[key]) ?? 0;
      const ratio = (made: number, attempts: number) => attempts > 0 ? made / attempts : 0;
      const fg = value('fg');
      const fga = value('fga');
      const tp = value('tp');
      const tpa = value('tpa');
      const ft = value('ft');
      const fta = value('fta');
      const orb = value('orb');
      const drb = value('drb');
      return {
        ...row,
        season: Number(row.season),
        tid: finiteNumber(row.tid) ?? -1,
        gp: value('gp'),
        gs: value('gs'),
        min: value('min'),
        fg,
        fga,
        fgp: finiteNumber(source.fgp) ?? ratio(fg, fga),
        tp,
        tpa,
        tpp: finiteNumber(source.tpp) ?? ratio(tp, tpa),
        ft,
        fta,
        ftp: finiteNumber(source.ftp) ?? ratio(ft, fta),
        orb,
        drb,
        trb: finiteNumber(source.trb) ?? orb + drb,
        ast: value('ast'),
        stl: value('stl'),
        blk: value('blk'),
        tov: value('tov'),
        pf: value('pf'),
        pts: value('pts'),
        per: value('per'),
        playoffs: false,
        competitionId: 'nba-summer-league',
        _source: 'summer-league-history',
        _seasonLabel: String(row.season),
      };
    });
}

export function buildSummerLeagueArchivePlayer(
  player: FibaSourcePlayer,
  year: number,
): NBAPlayer {
  const ratings = ratingRows(player, year);
  const current = ratings.at(-1);
  const bornYear = finiteNumber(player.born?.year);
  const overallRating = finiteNumber(current?.ovr) ?? 45;
  return {
    internalId: sourceId(player),
    tid: -3,
    name: player.name,
    overallRating,
    potential: finiteNumber(current?.pot) ?? overallRating,
    ratings,
    stats: statsRows(player, year),
    imgURL: player.imgURL,
    pos: player.pos,
    hgt: finiteNumber(player.hgt),
    weight: finiteNumber(player.weight),
    born: bornYear == null
      ? undefined
      : {
          year: bornYear,
          loc: String(player.born?.loc ?? ''),
        },
    college: player.college,
    draft: draftForYear(player, year),
    injury: { type: 'Healthy', gamesRemaining: 0 },
    externalArchiveOnly: true,
    externalLeagueId: 'NBA Summer League',
  } as NBAPlayer;
}

export function findSummerLeagueArchivePlayer(
  playersByName: ReadonlyMap<string, readonly FibaSourcePlayer[]>,
  name: string,
  birthYear: number | null | undefined,
): FibaSourcePlayer | undefined {
  const candidates = playersByName.get(normalizeFibaPersonName(name)) ?? [];
  return candidates.find(player =>
    birthYear != null && Number(player.born?.year) === Number(birthYear)
  ) ?? candidates[0];
}

export function hasExactSummerLeagueRating(player: NBAPlayer | undefined, year: number): boolean {
  return !!player?.ratings?.some(rating => Number(rating?.season) === year);
}

export function buildSummerLeagueRosterRatingPlayer(
  rosterPlayer: FibaSelectedPlayer,
  year: number,
  savedPlayer?: NBAPlayer,
): NBAPlayer {
  if (savedPlayer?.ratings?.length) return savedPlayer;
  const sourceRating = rosterPlayer.rating ?? {};
  const hasAttributes = ['hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'fg', 'tp', 'ft', 'pss', 'reb', 'drb', 'oiq', 'diq']
    .some(key => finiteNumber(sourceRating[key]) != null);
  const overall = finiteNumber(sourceRating.ovr)
    ?? (hasAttributes ? calculateOverallFromRating(sourceRating) : finiteNumber(rosterPlayer.strength))
    ?? 45;
  const age = Math.max(17, year - Number(rosterPlayer.birthYear ?? year - 22));
  const potential = finiteNumber(sourceRating.pot) ?? estimatePotentialBbgm(overall, age);
  return {
    internalId: rosterPlayer.savePlayerId ?? rosterPlayer.id,
    tid: -3,
    name: rosterPlayer.name,
    overallRating: overall,
    potential,
    ratings: [{ ...sourceRating, season: year, ovr: overall, pot: potential }],
    stats: [],
    imgURL: rosterPlayer.imageUrl,
    pos: rosterPlayer.position,
    born: rosterPlayer.birthYear == null ? undefined : { year: rosterPlayer.birthYear, loc: '' },
    injury: { type: 'Healthy', gamesRemaining: 0 },
    externalArchiveOnly: true,
    externalLeagueId: 'NBA Summer League',
  } as NBAPlayer;
}
