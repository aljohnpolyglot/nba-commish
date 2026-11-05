import fallbackArchive from '../../data/pba_draft_all_rows_single.json';
import { readJsonResponse } from '../utils/jsonResponse';
import { getPbaDraftYearForSeasonYear } from './draftCalendar';

const PBA_DRAFT_ARCHIVE_URLS = [
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pbadraftdata',
  'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/pba_draft_all_rows_single.json',
] as const;

type RawPbaDraftArchive = {
  rows?: RawPbaDraftRow[];
};

type RawPbaDraftRow = {
  draft_page?: string;
  draft_year_or_season?: string;
  round?: string;
  pick?: string;
  player?: string;
  pos?: string;
  country_of_birth?: string;
  team?: string;
  school_club_team?: string;
};

export type PbaDraftArchiveRow = {
  draftPage: string;
  draftLabel: string;
  draftYear: number;
  round: number | null;
  pick: number | null;
  overallPick: number;
  playerName: string;
  normalizedPlayerName: string;
  pos: string;
  countryOfBirth: string;
  draftedTeam: string;
  schoolClubTeam: string;
};

let cachedRows: PbaDraftArchiveRow[] | null = null;
let pendingFetch: Promise<PbaDraftArchiveRow[]> | null = null;

const scrubWikiText = (value: string | undefined): string => {
  if (!value) return '';
  return value
    .replace(/\.mw-parser-output[\s\S]*$/i, '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/#/g, '')
    .replace(/^\*+\s*/, '')
    .replace(/[\^*]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const cleanPlayerName = (value: string | undefined): string => scrubWikiText(value);

const cleanTeamName = (value: string | undefined): string =>
  scrubWikiText(value)
    .replace(/\s*\((?:from|via)[^)]+\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const normalizePbaSchoolClubTeam = (value: string | undefined): string => {
  const cleaned = scrubWikiText(value);
  if (!cleaned) return '';
  const primary = cleaned
    .split('/')
    .map(part => part.trim())
    .find(Boolean);
  return primary ?? cleaned;
};

const normalizeRawLookupName = (value: string | undefined): string =>
  cleanPlayerName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();

const PBA_PLAYER_NAME_ALIAS_GROUPS = [
  ['Mark Cardona', 'Mac Cardona', 'Mike Cardona'],
  ['Poy Erram', 'JP Erram'],
  ['Chris Banchero', 'Christopher Banchero', 'Christopher Clark Banchero'],
  ['Rodney Brondial', 'John Rodney Brondial'],
  ['Greg Slaughter', 'Gregory Slaughter'],
  ['Isaac Go', 'George Isaac Go'],
  ['Rey Suerte', 'Rey Anthony Suerte'],
  ['Bobby Ray Parks Jr.', 'Ray Parks'],
  ['Mikey Williams', 'Mike Williams', 'Michael Williams'],
  ['Jay Washington', 'Anthony Washington'],
  ['Baser Amer', 'Amer Baser'],
  ['Ranulfo Robles', 'Ranulfo Noni Robles'],
  ['Aurelio Jalmasco', 'Aurelio Epoy Jalmasco'],
  ['Peter Jao', 'Peter Apet Jao'],
  ['Gilbert Reyes Jr.', 'Gilbert Jun Reyes Jr.'],
  ['Edgar Macaraya', 'Egay Macaraya'],
  ['Rene Hawkins', 'Rene Bong Hawkins Jr.'],
  ['Jaime Gayoso', 'Jayvee Gayoso'],
  ['Bong Ravena', 'Ferdinand Ravena Jr.'],
  ['Marcelino Albarillo', 'Teroy Albarillo'],
  ['Zandro Limpot Jr.', 'Zandro Jun Limpot Jr.'],
  ['Boyet Fernandez', 'Teodorico Fernandez III'],
  ['Richard Bachmann', 'Richard Dickie Bachmann'],
  ['Noli Locsin', 'Manuel Luis Locsin'],
  ['Rey Evangelista', 'Reynaldo Evangelista'],
  ['Boybits Victoria', 'Emmanuel Victoria Jr.'],
  ['Edward Juinio', 'Edward Poch Juinio'],
  ['Vince Hizon', 'Vicente Hizon'],
  ['Ramon Singson', 'Ramon Montoy Singson'],
  ['Robert Jaworski Jr.', 'Robert Dodot Jaworski Jr.'],
  ['Andy Seigle', 'Andrew John Seigle'],
  ['Nic Belasco', 'Nicholas Belasco'],
  ['Estong Ballesteros', 'Ernesto Ballesteros'],
  ['Romulo Marata', 'Romulo Bong Marata'],
  ['Danny Ildefonso', 'Danilo Ildefonso'],
  ['Noy Castillo', 'Tito Noy Castillo'],
  ['Don Allado', 'Don Carlos Allado'],
  ['Joseph Gumatay', 'Joseph Ogie Gumatay'],
  ['Willie Miller', 'Willie Miller Jr.'],
  ['Jojo Tangkay', 'Jercules Tangkay'],
  ['Aris Dimaunahan', 'Aries Dimaunahan'],
  ['Richie Melencio', 'Richard Melencio'],
  ['Sonny Thoss', 'Joachim Sonny Thoss'],
  ['Dennis Miranda', 'Denok Miranda'],
  ['Kenneth Bono', 'Ken Bono'],
  ['Jayson Castro', 'Jayson Castro William'],
  ['Sol Mercado', 'Solomon Mercado'],
  ['TY Tang', 'Tyrone Tang'],
  ['Cholo Villanueva', 'Pocholo Villanueva'],
  ['Jeff Chan', 'Jeffrei Chan'],
  ['Rogemar Menor', 'Rogemar Ogie Menor'],
  ['Mark Benitez', 'Mark Lester Benitez'],
  ['Joshua Vanlandingham', 'Josh Vanlandingham'],
  ['Robert Labagala', 'Rob Labagala'],
  ['JVee Casio', 'Joseph Casio'],
  ['Paul Lee', 'Paul Lee Dalistan', 'Paul John Lee'],
  ['Mac Baracael', 'Marnel Baracael'],
  ['Magi Sison', 'Magi King Sison'],
  ['Pamboy Raymundo', 'John Raymundo'],
  ['Cliff Hodge', 'Clifford Hodge', 'Clifford Marion Hodge'],
  ['Chris Tiu', 'Christopher Tiu'],
  ['Yousef Taha', 'Yousif Taha'],
  ['Dave Marcelo', 'David Marcelo'],
  ['AJ Mandani', 'Alfred Mandani'],
  ['Emman Monfort', 'Emanuel Monfort'],
  ['Paul Zamar', 'Paul Christian Zamar'],
  ['Ian Sangalang', 'Ian Paul Sangalang'],
  ['Alex Nuyles', 'Alexander Nuyles'],
  ['Nico Salva', 'Nicolas Salva'],
  ['Jeric Fortuna', 'Jeric Marco Fortuna'],
  ['Eric Camson', 'Eric James Camson'],
  ['Chris Exciminiano', 'Christopher Exciminiano'],
  ['Sam Marata', 'Samuel Marata'],
  ['Jake Pascual', 'Jake Elvin Pascual'],
  ['Phillip Morrison', 'Phillip Aaron Morrison'],
  ['Gab Banal', 'Gabriel Banal'],
  ['Brian Heruela', 'Brian Quinton Heruela'],
  ['Troy Rosario', 'Jeth Troy Rosario'],
  ['Norbert Torres', 'Norberto Torres', 'Norberto Brian Torres'],
  ['Josan Nimes', 'Josan Michael Nimes'],
  ['Marion Magat', 'Marion Evan Magat'],
  ['Keith Agovida', 'Keith Jasper Agovida'],
  ['Mike DiGregorio', 'Michael DiGregorio', 'Michael Vincent DiGregorio'],
  ['Jeffrey Javillonar', 'Jeoffrey Javillonar'],
  ['Lervyn Flores', 'Lervin Flores'],
  ['Emil Palma', 'Emil Renz Palma'],
  ['Kyle Neypes', 'Kyle Drexler Neypes'],
  ['Abu Tratter', 'Abu Jahal Tratter'],
  ['MJ Ayaay', 'Mer Jesper Ayaay'],
  ['JP Calvo', 'John Paul Calvo'],
  ['Jaycee Marcelino', 'Jaycee Carlos Marcelino'],
  ['Vince Tolentino', 'Vincent Tolentino'],
  ['Bonbon Batiller', 'Bon Batiller'],
  ['Mike Canete', 'Michael Canete'],
  ['Daniel de Guzman', 'Daniel Guzman'],
  ['Dalph Panopio', 'Dalph Adem Panopio'],
  ['Lorenz Capulong', 'Lorenz John Capulong', 'John Lorenz Capulong'],
  ['William Navarro', 'William Raniel Navarro'],
  ['Calvin Oftana', 'Calvin John Oftana'],
  ['Rey Mark Acuno', 'Rey Acuno'],
  ['Brandon Ganuelas-Rosser', 'Brandon Rosser', 'Brandon Arnell Ganuelas-Rosser'],
  ['Gian Mamuyac', 'Gian Robert Mamuyac'],
  ['Ricci Rivero', 'Ricci Paolo Rivero'],
  ['John Lloyd Clemente', 'John Clemente'],
  ['Fran Yu', 'Fran Louie Yu'],
  ['Kamron Vigan-Fleming', 'Kamron Fleming'],
  ['Andre Flores', 'Andre Aveen Flores'],
  ['John Abis', 'John Cedrick Abis'],
  ['Japeth Aguilar', 'Japeth Paul Aguilar'],
  ['Stephen Holt', 'Stephen Jeffrey Holt'],
  ['John Pinto', 'Nard John Pinto'],
  ['Scottie Thompson', 'Earl Scottie Thompson'],
  ['Jed Mendoza', 'Jonathan Jed Mendoza'],
  ['James Una', 'James Paul Una'],
  ['Juan Gomez de Liano', 'Juan Gerardo Gomez de Liano'],
  ['Kurt Reyson', 'Kurt Spencer Reyson'],
  ['Alec Stockton', 'Alec June Stockton'],
  ['Mark Barroca', 'Andy Mark Barroca'],
  ['Rome dela Rosa', 'Rome Adler Dela Rosa'],
  ['Paolo Taha', 'Juan Paolo Taha'],
  ['Brandon Bates', 'Brandon Matthew Bates'],
  ['Aaron Black', 'Norman Aaron Black'],
  ['Jason Brickman', 'Jason Alexander Brickman'],
  ['Allein Maliksi', 'Allein Gail Maliksi'],
  ['Kyle Pascual', 'Kyle Nicholas Pascual'],
  ['Robert Bolick', 'Robert Lee Bolick'],
  ['Kevin Racal', 'Kevin Kent Racal'],
  ['Anthony Semerad', 'Anthony Paul Semerad'],
  ['Xyrus Torres', 'Xyrus Dane Torres'],
  ['Dave Ando', 'Arnold Dave Ando'],
  ['Prince Caperal', 'Prince Renmer Caperal'],
  ['Francis Escandor', 'Francis Gabriel Escandor'],
  ['Will Gozum', 'Will Allen Gozum'],
  ['Evan Nelle', 'Evan Heinrich Nikolai Nelle'],
  ['Tyler Tio', 'Christian Tyler Tio'],
  ['Kenneth Tuffin', 'Kenneth James Tuffin'],
  ['Anton Asistio', 'Anton Rafael Asistio'],
  ['Beau Belga', 'Beau Michael Vincent Belga'],
  ['Andrei Caracut', 'Joshua Andrei Caracut'],
  ['Joshua David', 'Vincent Joshua David'],
  ['Adrian Nocum', 'Adrian Clarence Nocum'],
  ['Caelan Tiongson', 'Caelan Todd Tiongson'],
  ['Andreas Cahilig', 'Philip Andreas Cahilig'],
  ['Jericho Cruz', 'Jericho Xavier Cruz'],
  ['Jeron Teng', 'Jeron Alvin Teng'],
  ['Jerrick Ahanmisi', 'Jerrick Vincent Ahanmisi'],
  ['Joseph Eriobu', 'Joseph Emmanuel Eriobu'],
  ['Didat Hanapi', 'Ahmad Didat Hanapi'],
  ['Paolo Hernandez', 'Paolo Jose Hernandez'],
  ['Shawn Umali', 'Shawn Michael Umali'],
  ['King Caralipio', 'King Danielle Caralipio'],
  ['Paolo Javillonar', 'Marc Paolo Javillonar'],
  ['Aljun Melecio', 'Aljun Jay Melecio'],
  ['Joshua Munzon', 'Joshua Eugene Munzon'],
  ['Mark Omega', 'Mark Denver Omega'],
  ['Bryan Sajonia', 'John Bryan Sajonia'],
  ['Mark Sangco', 'Mark Daniel Sangco'],
  ['Kim Aurin', 'Kim Cyril Aurin'],
  ['Justin Chua', 'Justin Shaun Chua'],
  ['Simon Enciso', 'Simon Nicholas Enciso'],
  ['Jordan Heading', 'Jordan Timothy Heading'],
  ['Rey Nambatac', 'Rey Benedict Nambatac'],
  ['RJ Abarrientos', 'Rhon Abarrientos', 'Rhon Jay Abarrientos'],
  ['RK Ilagan', 'Regile Ilagan', 'Regile Kent Ilagan'],
  ['Chris Newsome', 'Christopher Elijah Newsome'],
  ['Bong Quinto', 'Kier Quinto', 'Kier John Quinto'],
  ['Kevin Alas', 'Kevin Louie Alas'],
  ['Matt Nieto', 'Joseph Matthew Nieto'],
  ['Mike Nieto', 'Michael Joseph Nieto'],
  ['Robbie Herndon', 'Robert Conrad Herndon'],
  ['Mike Malonzo', 'Michael Malonzo', 'Michael John Malonzo'],
  ['Kris Rosales', 'Krismoir Rosales'],
  ['Chris Ross', 'Christopher Ross'],
  ['Juami Tiongson', 'Juan Miguel Tiongson'],
  ['Don Trollano', 'Celedonio Trollano'],
  ['Ben Adamos', 'Benedict Adamos'],
  ['Aris Dionisio', 'Aristotle Dionisio'],
  ['Ato Ular', 'Renato Ular'],
  ['CJ Perez', 'Jaymar Perez'],
  ['JM Calma', 'John Calma', 'John Michael Calma'],
  ['CJ Cansino', 'Crispin John Cansino'],
  ['Chris Koon', 'Christopher Tomas Koon'],
  ['Raffy Verano', 'Rafael Lorenzo Verano'],
  ['Anjo Caram', 'Antonio Jose Caram'],
  ['JB Bahio', 'John Bryle Bahio'],
  ['Henry Galinato', 'Henry Galinato Jr.'],
] as const;

const PBA_PLAYER_NAME_ALIASES = new Map<string, string>(
  PBA_PLAYER_NAME_ALIAS_GROUPS.flatMap(([canonical, ...aliases]) => (
    aliases.map(alias => [normalizeRawLookupName(alias), normalizeRawLookupName(canonical)] as const)
  )),
);

const PBA_PLAYER_CANONICAL_NAMES = new Map<string, string>(
  PBA_PLAYER_NAME_ALIAS_GROUPS.flatMap(([canonical, ...aliases]) => (
    [canonical, ...aliases].map(name => [normalizeRawLookupName(name), canonical] as const)
  )),
);

const normalizeLookupName = (value: string | undefined): string => {
  const normalized = normalizeRawLookupName(value);
  return PBA_PLAYER_NAME_ALIASES.get(normalized) ?? normalized;
};

const parseDraftYear = (label: string | undefined): number | null => {
  if (!label) return null;
  const directYear = label.match(/\b(19|20)\d{2}\b/);
  if (directYear) return Number(directYear[0]);

  const seasonNumber = label.match(/season\s+(\d+)\s+draft/i);
  if (seasonNumber) return getPbaDraftYearForSeasonYear(1975 + Number(seasonNumber[1]));

  return null;
};

const parseOptionalInt = (value: string | undefined): number | null => {
  const cleaned = scrubWikiText(value);
  if (!cleaned) return null;
  const match = cleaned.match(/\d+/);
  return match ? Number(match[0]) : null;
};

function normalizeArchiveRows(archive: RawPbaDraftArchive): PbaDraftArchiveRow[] {
  const seenRawRows = new Set<string>();
  const rows = (archive.rows ?? []).filter(row => {
    const fingerprint = [
      String(row.draft_page ?? '').trim().toLowerCase(),
      scrubWikiText(row.draft_year_or_season).toLowerCase(),
      scrubWikiText(row.round),
      scrubWikiText(row.pick),
      normalizeRawLookupName(row.player),
      cleanTeamName(row.team).toLowerCase(),
    ].join('|');
    if (seenRawRows.has(fingerprint)) return false;
    seenRawRows.add(fingerprint);
    return true;
  });
  const inferredRounds = new Map<number, { round: number; lastPick: number }>();
  const normalized = rows
    .map((row, index) => {
      const draftYear = parseDraftYear(row.draft_year_or_season);
      const playerName = cleanPlayerName(row.player);
      const pick = parseOptionalInt(row.pick);

      if (!draftYear || !playerName || pick == null) {
        return null;
      }

      const explicitRound = parseOptionalInt(row.round);
      const prior = inferredRounds.get(draftYear);
      const inferredRound = explicitRound
        ?? (prior ? prior.round + (pick <= prior.lastPick ? 1 : 0) : 1);
      inferredRounds.set(draftYear, { round: inferredRound, lastPick: pick });

      return {
        draftPage: row.draft_page?.trim() ?? '',
        draftLabel: scrubWikiText(row.draft_year_or_season) || `${draftYear} PBA Draft`,
        draftYear,
        round: inferredRound,
        pick,
        overallPick: index + 1,
        playerName,
        normalizedPlayerName: normalizeLookupName(playerName),
        pos: scrubWikiText(row.pos) || '—',
        countryOfBirth: scrubWikiText(row.country_of_birth) || '—',
        draftedTeam: cleanTeamName(row.team) || 'PBA Team',
        schoolClubTeam: normalizePbaSchoolClubTeam(row.school_club_team) || '—',
      } satisfies PbaDraftArchiveRow;
    })
    .filter((row): row is PbaDraftArchiveRow => row != null);

  const yearCounts = new Map<number, number>();
  return normalized.map(row => {
    const count = (yearCounts.get(row.draftYear) ?? 0) + 1;
    yearCounts.set(row.draftYear, count);
    return {
      ...row,
      overallPick: count,
    };
  });
}

cachedRows = normalizeArchiveRows(fallbackArchive as RawPbaDraftArchive);

export const getCachedPbaDraftArchive = (): PbaDraftArchiveRow[] => cachedRows ?? [];

export const findPbaDraftRowsByYear = (draftYear: number): PbaDraftArchiveRow[] =>
  getCachedPbaDraftArchive().filter(row => row.draftYear === draftYear);

export const findPbaDraftRowByPlayerName = (
  playerName: string,
  draftYear?: number,
): PbaDraftArchiveRow | undefined => {
  const normalizedName = normalizeLookupName(playerName);
  const rows = getCachedPbaDraftArchive().filter(row => row.normalizedPlayerName === normalizedName);
  if (Number.isFinite(draftYear)) {
    return rows.find(row => row.draftYear === draftYear) ?? rows[0];
  }
  return rows[0];
};

export const getPbaDraftBioLabel = (playerName: string, draftYear?: number): string | null => {
  const row = findPbaDraftRowByPlayerName(playerName, draftYear);
  if (!row) return null;
  return `PBA ${row.draftYear} R${row.round ?? 1} P${row.pick ?? row.overallPick}`;
};

export const normalizePbaDraftPlayerName = (name: string): string => normalizeLookupName(name);

export const getCanonicalPbaPlayerName = (name: string): string => (
  PBA_PLAYER_CANONICAL_NAMES.get(normalizeRawLookupName(name)) ?? cleanPlayerName(name)
);

export const hasCanonicalPbaPlayerIdentity = (name: string): boolean => (
  PBA_PLAYER_CANONICAL_NAMES.has(normalizeRawLookupName(name))
);

export const buildPbaDraftHistoryCardKey = (
  row: Pick<PbaDraftArchiveRow, 'draftYear' | 'round' | 'pick' | 'overallPick' | 'normalizedPlayerName'>,
  matchedPlayerId?: string,
): string => [
  'pba-draft',
  row.draftYear,
  row.round ?? 0,
  row.pick ?? 0,
  row.overallPick,
  row.normalizedPlayerName,
  matchedPlayerId || 'archive',
].join(':');

export const isKnownPbaPlayerAlias = (name: string): boolean => (
  PBA_PLAYER_NAME_ALIASES.has(normalizeRawLookupName(name))
);

export async function ensurePbaDraftArchive(): Promise<PbaDraftArchiveRow[]> {
  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    for (const url of PBA_DRAFT_ARCHIVE_URLS) {
      try {
        const response = await fetch(url);
        const archive = await readJsonResponse<RawPbaDraftArchive>(response, `PBA draft archive ${url}`);
        cachedRows = normalizeArchiveRows(archive);
        if (cachedRows.length > 0) {
          return cachedRows;
        }
      } catch {
        continue;
      }
    }
    return cachedRows ?? [];
  })().finally(() => {
      pendingFetch = null;
    });

  return pendingFetch;
}
