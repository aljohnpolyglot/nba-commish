export type AwardTrophyNamespace = 'nba' | 'wnba' | 'euro' | 'ncaa' | 'basketball';

export interface AwardTrophyPhoto {
  name: string;
  logo: string;
  trophy: string;
  url: string;
}

type ResolveAwardTrophyInput = {
  awardType: string;
  namespace: AwardTrophyNamespace;
  competitionId?: string;
  competitionName?: string;
};

const CATALOG_PATH = '/data/awards/award_photos.json';
const COMPETITION_ALIASES: Record<string, string[]> = {
  endesa: ['Liga ACB'],
  'french-jeep-elite': ['LNB', 'LNB Pro A'],
  'italian-serie-a': ['Lega Basket'],
  'german-bbl': ['Basketball Bundesliga'],
  'greek-heba-a1': ['Greek Basket League'],
  'turkish-bsl': ['Basketbol Super Ligi'],
  'lithuanian-lkl': ['Lithuanian LKL'],
  'israeli-bsl': ['Israeli Basketball Premier League'],
  'vtb-united-league': ['VTB United League'],
  'adriatic-league': ['ABA League'],
  eurocup: ['FIBA EuroCup'],
  'copa-del-rey': ['Spanish Copa del Rey de Baloncesto', 'Copa del Rey de Baloncesto'],
  supercopa: ['Spanish Supercopa de Espana de Baloncesto'],
  'coppa-italia': ['Coppa Italiana di Pallacanestro'],
  'supercoppa-italiana': ['Supercoppa Italiana di Pallacanestro'],
  'coupe-de-france': ['Coupe de France de Basket'],
  'bbl-pokal': ['BBL-Pokal'],
  'greek-cup': ['Greek Basketball Cup'],
  'turkish-cup': ['Turkish Basketball Cup'],
  'presidential-cup': ['Turkish Basketball Presidential Cup'],
  'king-mindaugas-cup': ['Lithuanian King Mindaugas Cup'],
  'israel-state-cup': ['Israeli Basketball State Cup'],
};
let cachedCatalog: AwardTrophyPhoto[] = [];
let catalogRequest: Promise<AwardTrophyPhoto[]> | null = null;

const normalize = (value: string): string => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/gi, ' ')
  .trim()
  .toLowerCase();

function isAwardTrophyPhoto(value: unknown): value is AwardTrophyPhoto {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === 'string'
    && typeof row.logo === 'string'
    && typeof row.trophy === 'string'
    && typeof row.url === 'string';
}

export function getCachedAwardTrophyCatalog(): AwardTrophyPhoto[] {
  return cachedCatalog;
}

export async function loadAwardTrophyCatalog(): Promise<AwardTrophyPhoto[]> {
  if (cachedCatalog.length > 0) return cachedCatalog;
  if (catalogRequest) return catalogRequest;
  catalogRequest = fetch(CATALOG_PATH)
    .then(response => {
      if (!response.ok) throw new Error(`Award trophy catalog unavailable (${response.status})`);
      return response.json() as Promise<{ basketball?: unknown }>;
    })
    .then(source => {
      cachedCatalog = Array.isArray(source.basketball)
        ? source.basketball.filter(isAwardTrophyPhoto)
        : [];
      return cachedCatalog;
    })
    .catch(() => [])
    .finally(() => { catalogRequest = null; });
  return catalogRequest;
}

function namespacePrefix(namespace: AwardTrophyNamespace): string {
  if (namespace === 'nba') return 'NBA';
  if (namespace === 'wnba') return 'WNBA';
  if (namespace === 'euro') return 'EuroLeague';
  if (namespace === 'ncaa') return 'NCAA Basketball';
  return '';
}

function brandedNamespace(name: string): AwardTrophyNamespace | undefined {
  const key = normalize(name);
  if (/^(nba|all nba)\b/.test(key)) return 'nba';
  if (/^(wnba|all wnba)\b/.test(key)) return 'wnba';
  if (/^(euroleague|all euroleague)\b/.test(key)) return 'euro';
  if (/^ncaa basketball\b/.test(key)) return 'ncaa';
  return undefined;
}

function awardSuffixes(awardType: string, namespace: AwardTrophyNamespace): string[] {
  const type = normalize(awardType);
  if (/nba cup|in season tournament/.test(type) && /mvp/.test(type)) return ['In-Season Tournament MVP'];
  if (/commissioner s cup/.test(type)) return ['Commissioners Cup'];
  if (/nba cup|in season tournament/.test(type)) return ['In-Season Tournament'];
  if (/final four mvp/.test(type)) return ['Final Four MVP'];
  if (/playoff (mvp|most valuable player)/.test(type)) return [awardType];
  if (/finals (mvp|most valuable player)/.test(type) || /^(f ?mvp)$/.test(type)) {
    return namespace === 'euro' ? ['Final Four MVP'] : ['Finals MVP'];
  }
  if (/all star.*mvp/.test(type)) return namespace === 'wnba' ? ['All Star Game MVP'] : ['All Star MVP'];
  if (/rising stars.*mvp/.test(type)) return ['Rising Stars MVP'];
  if (/^(most valuable player|mvp|regular season mvp)$/.test(type)) return ['MVP'];
  if (/champion|championship|league title/.test(type)) return [''];
  if (/all.*defensive/.test(type) || /all.*rookie/.test(type)) return [awardType];
  if (/defensive player|best defender|\bdpoy\b/.test(type)) {
    return namespace === 'euro' ? ['Best Defender', 'Defensive Player of the Year'] : ['Defensive Player of the Year'];
  }
  if (/rookie|rising star|\broy\b/.test(type)) return namespace === 'euro' ? ['Rising Star'] : ['Rookie of the Year'];
  if (/sixth (man|player)|\bsmoy\b/.test(type)) return namespace === 'wnba' ? ['Sixth Player of the Year'] : ['Sixth Man of the Year'];
  if (/most improved|\bmip\b/.test(type)) return ['Most Improved Player'];
  if (/coach of (the )?year|\bcoy\b/.test(type)) return ['Coach of the Year'];
  if (/all star/.test(type)) return ['All Star'];
  if (/slam dunk/.test(type)) return ['Slam Dunk Contest'];
  if (/three point/.test(type)) return namespace === 'wnba' ? ['Three Point Contest'] : ['Three-Point Contest'];
  if (/scoring|top scorer/.test(type)) return namespace === 'euro' ? ['Top Scorer'] : ['scoring champion'];
  if (/rebound/.test(type)) return ['rebounding leader'];
  if (/assist/.test(type)) return ['assists leader'];
  if (/block/.test(type)) return ['blocks leader'];
  if (/steal/.test(type)) return ['steals leader'];
  if (/all.*first team/.test(type)) {
    if (namespace === 'wnba') return ['All-WNBA First Team'];
    if (namespace === 'euro') return ['All-EuroLeague First Team'];
    return ['All NBA First Team'];
  }
  if (/hall of fame/.test(type)) return ['Basketball Hall of Fame'];
  return [awardType];
}

function candidateNames(input: ResolveAwardTrophyInput): string[] {
  const suffixes = awardSuffixes(input.awardType, input.namespace);
  const candidates = [input.awardType];
  const competitionAliases = input.competitionId ? COMPETITION_ALIASES[input.competitionId] ?? [] : [];
  const prefixes = [...new Set([
    input.competitionName,
    ...competitionAliases,
    namespacePrefix(input.namespace),
  ].filter((value): value is string => !!value))];
  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      if (suffix) candidates.push(`${prefix} ${suffix}`);
      if (!suffix) candidates.push(prefix);
    }
  }
  for (const suffix of suffixes) {
    if (suffix) candidates.push(suffix);
  }
  candidates.push(...competitionAliases);
  if (input.competitionName) candidates.push(input.competitionName);
  if (input.competitionId) candidates.push(input.competitionId.replace(/-/g, ' '));
  if (input.namespace === 'nba' && /nba cup|in season tournament/i.test(input.awardType)) {
    candidates.push('NBA In-Season Tournament');
  }
  if (input.namespace === 'wnba' && /commissioner/i.test(input.awardType)) {
    candidates.push('WNBA Commissioners Cup');
  }
  if (input.namespace === 'ncaa') candidates.push('NCAA Basketball');
  return [...new Set(candidates.map(value => value.trim()).filter(Boolean))];
}

export function resolveAwardTrophyPhoto(
  catalog: AwardTrophyPhoto[],
  input: ResolveAwardTrophyInput,
): AwardTrophyPhoto | undefined {
  if (catalog.length === 0) return undefined;
  const competition = input.competitionId?.trim().toLowerCase();
  const competitionNamespace = competition === 'nba' ? 'nba'
    : competition === 'wnba' ? 'wnba'
    : competition === 'euroleague' ? 'euro'
    : undefined;
  const resolvedInput = competitionNamespace ? { ...input, namespace: competitionNamespace as AwardTrophyNamespace } : input;
  const indexed = new Map(catalog.map(entry => [normalize(entry.name), entry]));
  const candidates = candidateNames(resolvedInput);
  for (const candidate of candidates) {
    const exact = indexed.get(normalize(candidate));
    const branded = exact && brandedNamespace(exact.name);
    if (exact && (!branded || branded === resolvedInput.namespace)) return exact;
  }
  return undefined;
}
