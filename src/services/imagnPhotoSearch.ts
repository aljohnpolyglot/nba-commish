import { getTeamFullName, type TeamLike } from '../utils/teamNames';

export type ImagnPhotoAction = 'dunk' | 'shot' | 'drive' | 'pass' | 'celebration' | 'injury' | 'portrait' | 'general';

export interface ImagnSearchContext {
  league: string;
  competitionId?: string;
  uiMode?: string;
  season: number;
  gameDate: string;
  branchCutoffDate?: string;
  homeTeamName: string;
  awayTeamName: string;
  playerTeamName?: string;
  playerName?: string;
  action?: ImagnPhotoAction;
}

export interface ImagnSearchWindow {
  from: string;
  to: string;
}

export interface ImagnKeyword {
  id: number;
  name: string;
}

export interface ImagnRequest {
  query?: string;
  keywordNames?: string[];
  page?: number;
  setId?: number;
  leagueTerm: string;
  window: ImagnSearchWindow;
  simpleContentGroups: string;
  navigationContentGroups: string;
}

export interface ImagnCandidate {
  headLine?: string;
  caption?: string;
  captionClean?: string;
  players?: string[];
  date?: string;
  isLandscape?: boolean;
  isTopPic?: boolean;
}

const isUsableTeamSearchName = (value: string): boolean => Boolean(value)
  && !/^-?\d+$/.test(value)
  && !/^team\s+-?\d+$/i.test(value);

export function resolveImagnTeamSearchNames(homeTeam: TeamLike, awayTeam: TeamLike): {
  homeTeamName: string;
  awayTeamName: string;
  combinedTeamNames: string;
} {
  const resolvedHomeName = getTeamFullName(homeTeam) || String(homeTeam.name ?? '').trim();
  const resolvedAwayName = getTeamFullName(awayTeam) || String(awayTeam.name ?? '').trim();
  const homeTeamName = isUsableTeamSearchName(resolvedHomeName) ? resolvedHomeName : '';
  const awayTeamName = isUsableTeamSearchName(resolvedAwayName) ? resolvedAwayName : '';
  return {
    homeTeamName,
    awayTeamName,
    combinedTeamNames: homeTeamName === awayTeamName
      ? homeTeamName
      : `${homeTeamName} ${awayTeamName}`.trim(),
  };
}

const normalizeText = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function normalizeImagnPersonName(value: unknown): string {
  const tokens = normalizeText(value).split(/\s+/).filter(Boolean);
  while (['jr', 'sr', 'ii', 'iii', 'iv'].includes(tokens[tokens.length - 1] ?? '')) tokens.pop();
  const normalized: string[] = [];
  for (let index = 0; index < tokens.length;) {
    let end = index;
    while (end < tokens.length && tokens[end].length === 1) end += 1;
    if (end - index >= 2) {
      normalized.push(tokens.slice(index, end).join(''));
      index = end;
      continue;
    }
    normalized.push(tokens[index]);
    index += 1;
  }
  return normalized.join(' ');
}

export function extractImagnPrimarySubject(caption: string): string | null {
  const match = caption.match(/([A-Z][\p{L}'’.-]+(?:\s+(?:[A-Z][\p{L}'’.-]+|II|III|IV))+?)\s*\(\d+\)/u);
  return match?.[1] ?? null;
}

export function isImagnPrimarySubject(playerName: string, caption: string): boolean {
  const subject = extractImagnPrimarySubject(caption);
  return Boolean(subject)
    && normalizeImagnPersonName(subject) === normalizeImagnPersonName(playerName);
}

const isoDate = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const shiftMonths = (iso: string, months: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
};

const calendarYearLeague = (league: string): boolean => normalizeText(league).includes('wnba');

const fallbackDate = (context: ImagnSearchContext): string => {
  if (calendarYearLeague(context.league)) return `${context.season}-12-31`;
  return `${context.season}-07-31`;
};

export function resolveImagnSearchWindows(context: ImagnSearchContext): ImagnSearchWindow[] {
  const gameDate = isoDate(context.gameDate) ?? fallbackDate(context);
  const branchCutoffDate = isoDate(context.branchCutoffDate);
  const anchorDate = branchCutoffDate && gameDate > branchCutoffDate ? branchCutoffDate : gameDate;
  const upperBound = shiftMonths(anchorDate, 60);
  return [{
    from: shiftMonths(anchorDate, -60),
    to: upperBound,
  }];
}

export function formatImagnDate(iso: string, separator: '/' | '-'): string {
  const [year, month, day] = iso.split('-');
  return [month, day, year].join(separator);
}

export function buildImagnSearchUrl(request: ImagnRequest): string {
  const navigation = Boolean(request.keywordNames?.length);
  const url = new URL(navigation
    ? 'https://imagn.com/navigationSearchAjax/'
    : 'https://imagn.com/simpleSearchAjax/');
  if (navigation) {
    url.searchParams.set('q', request.leagueTerm);
    url.searchParams.set('tag', `,${request.keywordNames!.map(normalizeText).join(',')}`);
    url.searchParams.set('frmdate', formatImagnDate(request.window.from, '-'));
    url.searchParams.set('todate', formatImagnDate(request.window.to, '-'));
    url.searchParams.set('searchCGOnly', request.navigationContentGroups);
    url.searchParams.set('searchType', 'navigation');
    url.searchParams.set('sort', 'DESC');
    url.searchParams.set('npage', String(request.page ?? 1));
    url.searchParams.set('searchWithin', 'searchWithin');
    url.searchParams.set('searchText', request.query ?? '');
  } else {
    url.searchParams.set('searchCGOnly', request.simpleContentGroups);
    url.searchParams.set('searchtxt', [request.query, request.leagueTerm].filter(Boolean).join(' '));
    url.searchParams.set('frmdate', formatImagnDate(request.window.from, '-'));
    url.searchParams.set('todate', formatImagnDate(request.window.to, '-'));
    if (request.setId) url.searchParams.set('setId', String(request.setId));
    if ((request.page ?? 1) > 1) url.searchParams.set('npage', String(request.page));
  }
  return url.toString().replace(/%2C/gi, ',');
}

export function normalizeImagnKeywordEntry(entry: unknown): ImagnKeyword | null {
  if (Array.isArray(entry)) {
    const name = String(entry[0] ?? '').trim();
    const id = Number(entry[1]);
    return name && Number.isFinite(id) ? { id, name } : null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const name = String(row.keyword ?? row.name ?? row.label ?? '').trim();
  const id = Number(row.id ?? row.keywordId);
  return name && Number.isFinite(id) ? { id, name } : null;
}

export function resolveImagnLeagueTerm(context: Pick<ImagnSearchContext, 'league' | 'competitionId' | 'uiMode'>): string {
  const scope = normalizeText([context.league, context.competitionId, context.uiMode].filter(Boolean).join(' '));
  if (scope.includes('wnba')) return 'wnba';
  if (scope.includes('pba') || scope.includes('philippine')) return 'pba basketball';
  if (scope.includes('euro') || scope.includes('endesa')) return 'euroleague basketball';
  return 'nba';
}

export function normalizePhotoAction(value: unknown): ImagnPhotoAction {
  const hint = normalizeText(value);
  if (/injur|trainer|medical/.test(hint)) return 'injury';
  if (/dunk|slam|alley oop|fifty|monster/.test(hint)) return 'dunk';
  if (/buzzer|winner|shot|three|jumper|perfect|close/.test(hint)) return 'shot';
  if (/drive|layup|basket/.test(hint)) return 'drive';
  if (/pass|assist|triple double/.test(hint)) return 'pass';
  if (/celebr|champ|clinch|overtime/.test(hint)) return 'celebration';
  if (/portrait|headshot|profile/.test(hint)) return 'portrait';
  return 'general';
}

const candidateText = (photo: ImagnCandidate): string => normalizeText([
  photo.headLine,
  photo.captionClean,
  photo.caption,
  ...(photo.players ?? []),
].join(' '));

const hasPhrase = (haystack: string, needle: unknown): boolean => {
  const phrase = normalizeText(needle);
  return phrase.length > 1 && ` ${haystack} `.includes(` ${phrase} `);
};

export function isImagnCandidateEligible(
  photo: ImagnCandidate,
  context: ImagnSearchContext,
  windows = resolveImagnSearchWindows(context),
): boolean {
  const date = isoDate(photo.date);
  if (!date || !windows.some(window => date >= window.from && date <= window.to)) return false;
  const text = candidateText(photo);
  if (/\b(nfl|football|nhl|hockey|mlb|baseball)\b/.test(text)) return false;
  if (context.playerName && !hasPhrase(text, context.playerName)) return false;
  const captionText = normalizeText([photo.captionClean, photo.caption].join(' '));
  if (context.playerTeamName && !hasPhrase(captionText, context.playerTeamName)) return false;
  const teamMatch = hasPhrase(text, context.homeTeamName) || hasPhrase(text, context.awayTeamName);
  if (!teamMatch) return false;
  const leagueTerm = resolveImagnLeagueTerm(context).split(' ')[0];
  return leagueTerm === 'nba' || leagueTerm === 'wnba'
    ? hasPhrase(text, leagueTerm) || teamMatch
    : hasPhrase(text, leagueTerm) || teamMatch;
}

const ACTION_TERMS: Record<ImagnPhotoAction, string[]> = {
  dunk: ['dunk', 'slams', 'alley oop', 'hangs on the rim'],
  shot: ['shoots', 'shot', 'jumper', 'three point', 'buzzer', 'game winner'],
  drive: ['drives', 'layup', 'goes to the basket', 'goes to the hoop'],
  pass: ['passes', 'assist', 'dish'],
  celebration: ['celebrates', 'reacts', 'hugs', 'clinch', 'champion'],
  injury: ['injury', 'trainer', 'medical', 'limps', 'sideline'],
  portrait: ['portrait', 'headshot', 'poses'],
  general: ['basketball', 'shoots', 'drives', 'dunks'],
};

export function scoreImagnCandidate(photo: ImagnCandidate, context: ImagnSearchContext): number {
  if (!isImagnCandidateEligible(photo, context)) return Number.NEGATIVE_INFINITY;
  const text = candidateText(photo);
  const action = context.action ?? 'general';
  let score = 0;
  if (context.playerName && hasPhrase(text, context.playerName)) score += 100;
  if (hasPhrase(text, context.homeTeamName)) score += 25;
  if (hasPhrase(text, context.awayTeamName)) score += 25;
  if (ACTION_TERMS[action].some(term => hasPhrase(text, term))) score += 35;
  if (photo.isTopPic) score += 8;
  if (photo.isLandscape) score += 4;
  if (action !== 'portrait' && /\b(arrives|arrival|shoes|sneakers|fashion|looks on|bystander)\b/.test(text)) score -= 80;
  const photoDate = isoDate(photo.date);
  const targetDate = isoDate(context.gameDate);
  if (photoDate && targetDate) {
    const distance = Math.abs(new Date(`${targetDate}T00:00:00Z`).getTime() - new Date(`${photoDate}T00:00:00Z`).getTime());
    score += Math.max(0, 20 - Math.floor(distance / 86_400_000 / 30));
  }
  return score;
}
