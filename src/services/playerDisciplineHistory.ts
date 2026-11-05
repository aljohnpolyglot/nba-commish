import disciplineHistoryJson from '../../data/nba-discipline-history.json';
import type {
  GameState,
  HistoryEntry,
  NBAPlayer,
  PlayerDisciplineAction,
  PlayerDisciplineRecord,
} from '../types';
import { normalizeDate } from '../utils/helpers';
import { getHistoricalNbaBranchSeasonCutoff } from './playerDevelopment/hofHistoryWindow';

interface HistoricalDisciplineRow {
  id: string;
  playerSlug: string;
  playerName: string;
  date: string;
  season: number;
  action: PlayerDisciplineAction;
  amountUSD?: number;
  suspensionGames?: number;
  indefinite?: boolean;
  durationLabel?: string;
  reasonCategory: string;
  authority: 'league' | 'team';
}

interface HistoricalDisciplineCatalog {
  schemaVersion: number;
  records: HistoricalDisciplineRow[];
}

const historicalCatalog = disciplineHistoryJson as HistoricalDisciplineCatalog;

export function appendPlayerDisciplineRecord(
  player: NBAPlayer,
  record: PlayerDisciplineRecord,
): NBAPlayer {
  const current = player.disciplineHistory ?? [];
  if (current.some(entry => entry.id === record.id)) return player;
  return { ...player, disciplineHistory: [...current, record] };
}

function normalizeIdentity(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function playerSlug(player: NBAPlayer): string {
  return String((player as NBAPlayer & { slug?: string }).slug ?? player.srID ?? '')
    .trim()
    .toLowerCase();
}

function sourceHistoryAllowed(state: GameState, player: NBAPlayer): boolean {
  if (state.leagueType !== 'modded') return false;
  if (state.moddedLeagueBase === 'europe' || state.moddedLeagueBase === 'philippines') return false;
  return player.status !== 'WNBA'
    && player.status !== 'Euroleague'
    && player.status !== 'PBA'
    && player.tid < 100;
}

function sourceRecordsForPlayer(state: GameState, player: NBAPlayer): PlayerDisciplineRecord[] {
  if (!sourceHistoryAllowed(state, player)) return [];
  const slug = playerSlug(player);
  const nameKey = normalizeIdentity(player.name);
  const branchCutoff = getHistoricalNbaBranchSeasonCutoff({
    currentYear: state.leagueStats.year,
    leagueType: state.leagueType,
    moddedLeagueBase: state.moddedLeagueBase,
    nbaStartYear: state.nbaStartYear,
  });
  const currentDate = normalizeDate(state.date);

  return historicalCatalog.records
    .filter(row => (
      (!!slug && row.playerSlug === slug)
      || normalizeIdentity(row.playerName) === nameKey
    ))
    .filter(row => branchCutoff !== undefined
      ? row.season <= branchCutoff
      : normalizeDate(row.date) <= currentDate)
    .map(row => ({
      id: row.id,
      date: row.date,
      season: row.season,
      action: row.action,
      amount: row.amountUSD,
      currencyCode: 'USD',
      games: row.suspensionGames,
      indefinite: row.indefinite,
      durationLabel: row.durationLabel,
      reason: categoryLabel(row.reasonCategory),
      reasonCategory: row.reasonCategory,
      authority: row.authority,
      source: 'historical',
    }));
}

function historyEntry(raw: string | HistoryEntry, stateDate: string): HistoryEntry {
  return typeof raw === 'string' ? { text: raw, date: stateDate } : raw;
}

function legacyAction(entry: HistoryEntry): PlayerDisciplineAction | null {
  const text = entry.text.toLowerCase();
  const hasFine = entry.type === 'Fine' || /\bfin(?:e|ed)\b/.test(text);
  const hasSuspension = entry.type === 'Suspension' || /\bsuspend(?:ed|sion)\b/.test(text);
  if (hasFine && hasSuspension) return 'fine_and_suspension';
  if (hasFine) return 'fine';
  if (hasSuspension) return 'suspension';
  return null;
}

function legacyAmount(text: string): number | undefined {
  const match = text.match(/(?:[$€£₱¥]\s*|fine(?:\s+of)?\s+)([\d,.]+)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function legacyGames(text: string): number | undefined {
  const match = text.match(/(\d+)[-\s]game suspension|suspended (?:them|him|her)?\s*for (\d+) games?/i);
  const games = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(games) && games > 0 ? games : undefined;
}

function legacyReason(text: string): string {
  const match = text.match(/\bReason:\s*(.+?)(?:\.\s*$|$)/i);
  return match?.[1]?.trim() || 'League discipline';
}

function legacyRecordsForPlayer(state: GameState, player: NBAPlayer): PlayerDisciplineRecord[] {
  const currentDate = normalizeDate(state.date);
  return (state.history ?? [])
    .map(raw => historyEntry(raw, state.date))
    .filter(entry => normalizeDate(entry.date) <= currentDate)
    .filter(entry => entry.playerIds?.length
      ? entry.playerIds.includes(player.internalId)
      : entry.text.toLowerCase().includes(player.name.toLowerCase()))
    .flatMap((entry, index) => {
      const action = legacyAction(entry);
      if (!action) return [];
      const date = normalizeDate(entry.date);
      return [{
        id: `legacy-discipline-${date}-${index}-${player.internalId}`,
        date,
        season: seasonFromDate(date),
        action,
        amount: legacyAmount(entry.text),
        games: legacyGames(entry.text),
        reason: legacyReason(entry.text),
        authority: 'league',
        source: 'game',
      } satisfies PlayerDisciplineRecord];
    });
}

function seasonFromDate(date: string): number {
  const match = normalizeDate(date).match(/^(\d{4})-(\d{2})/);
  if (!match) return 0;
  const year = Number(match[1]);
  return Number(match[2]) >= 7 ? year + 1 : year;
}

function categoryLabel(value: string): string {
  const overrides: Record<string, string> = {
    criticizing_officiating: 'Public criticism of officiating',
    official_contact_or_abuse: 'Contact with or abuse of an official',
    fighting_or_punching: 'Fighting or punching',
    altercation_or_confrontation: 'Altercation or confrontation',
    media_or_social_media: 'Media or social-media misconduct',
    drug_or_substance_policy: 'Drug or substance policy',
    dangerous_contact: 'Dangerous contact',
    bench_leaving: 'Leaving the bench during an altercation',
    conduct_detrimental: 'Conduct detrimental',
    criminal_or_domestic_violence: 'Criminal or domestic-violence matter',
    missed_team_activity: 'Missed team activity',
  };
  return overrides[value]
    ?? value.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function includesFine(action: PlayerDisciplineAction): boolean {
  return action === 'fine' || action === 'fine_and_suspension';
}

function includesSuspension(action: PlayerDisciplineAction): boolean {
  return action === 'suspension' || action === 'fine_and_suspension';
}

function duplicatesStructuredRecord(
  legacy: PlayerDisciplineRecord,
  structured: PlayerDisciplineRecord[],
): boolean {
  return structured.some(record =>
    normalizeDate(record.date) === normalizeDate(legacy.date)
    && includesFine(record.action) === includesFine(legacy.action)
    && includesSuspension(record.action) === includesSuspension(legacy.action));
}

export function getPlayerDisciplineHistory(
  state: GameState,
  player: NBAPlayer,
): PlayerDisciplineRecord[] {
  const structured = (player.disciplineHistory ?? [])
    .filter(record => normalizeDate(record.date) <= normalizeDate(state.date));
  const source = sourceRecordsForPlayer(state, player);
  const legacy = legacyRecordsForPlayer(state, player)
    .filter(record => !duplicatesStructuredRecord(record, structured));

  return [...source, ...legacy, ...structured].sort((left, right) =>
    normalizeDate(right.date).localeCompare(normalizeDate(left.date))
    || right.id.localeCompare(left.id));
}
