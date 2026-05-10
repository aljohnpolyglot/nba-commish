// Expansion Draft — lokaler BBGM-Style Logo-Pool (Pool B).
//
// Enthält 205 fiktionale Teams mit Logo + Primary/Secondary-Farbe aus
// public/img/logos/. Region/Name werden runtime aus dem Slug abgeleitet — der
// User kann beides im Setup-Modal überschreiben. Population wird NICHT
// vorausgefüllt (User-Eingabe erforderlich, vgl. Pool-A-Pool-B-Trennung).
//
// Filename-Pattern (alle Varianten relativ zu /img/logos/):
//   <slug>1.png, <slug>2.png        → Haupt-Logos (mindestens eines existiert)
//   <slug>_small.png                → 32×32-Variante für Listen/Sidebars
//   <slug>_wordmark.png             → Schriftzug-Variante
//   <slug>_<HEX1>_<HEX2>.png        → Logo mit Farbcode im Filename (Pool-Source)

import logoPoolJson from './expansionLogoPool.json';

interface LogoPoolEntry {
  slug: string;
  primary: string;   // 6-char Hex ohne #
  secondary: string;
}

export interface ParsedLogoTeam {
  slug: string;
  region: string;
  name: string;
  /** Hex mit #-Prefix, ready für CSS. */
  primary: string;
  secondary: string;
  /** Pfade relativ zum public/-Root (Vite serviert das als /img/logos/...). */
  logoUrl: string;
  smallUrl: string;
  wordmarkUrl: string;
}

// ─── Slug-Parsing ──────────────────────────────────────────────────────────
// Default: letztes Wort = Name, Rest = Region. Override-Set für Mehrwort-Städte.
// Quelle für die Liste: visuelle Inspektion der 205 Slugs + bekannte US/CA-Cities.

const TWO_WORD_CITIES = new Set([
  'ann_arbor', 'atlantic_city', 'baton_rouge', 'broken_arrow', 'cape_coral',
  'carson_city', 'cedar_rapids', 'college_station', 'colorado_springs',
  'coral_springs', 'corpus_christi', 'costa_mesa', 'crystal_lake',
  'daly_city', 'des_moines', 'des_plaines', 'el_cajon', 'el_monte', 'el_paso',
  'eau_claire', 'ewa_beach', 'fort_collins', 'fort_lauderdale', 'fort_wayne',
  'fort_worth', 'garden_grove', 'grand_prairie', 'grand_rapids', 'green_bay',
  'high_point', 'huntington_beach', 'idaho_falls', 'jefferson_city',
]);

const THREE_WORD_CITIES = new Set([
  // bisher keine bekannten — Slot offen falls Pool wächst
]);

function titleCaseWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function parseSlug(slug: string): { region: string; name: string } {
  const parts = slug.split('_');
  if (parts.length < 2) {
    return { region: titleCaseWord(slug), name: '' };
  }

  // 3-word-city check (Anzahl Wörter ≥ 4)
  if (parts.length >= 4) {
    const cityKey = parts.slice(0, 3).join('_');
    if (THREE_WORD_CITIES.has(cityKey)) {
      return {
        region: parts.slice(0, 3).map(titleCaseWord).join(' '),
        name: parts.slice(3).map(titleCaseWord).join(' '),
      };
    }
  }

  // 2-word-city check (Anzahl Wörter ≥ 3)
  if (parts.length >= 3) {
    const cityKey = parts.slice(0, 2).join('_');
    if (TWO_WORD_CITIES.has(cityKey)) {
      return {
        region: parts.slice(0, 2).map(titleCaseWord).join(' '),
        name: parts.slice(2).map(titleCaseWord).join(' '),
      };
    }
  }

  // Default: erstes Wort = Region, Rest = Name. Funktioniert für 2-Wort-Slugs
  // (anaheim_seraphs → Anaheim Seraphs) UND längere Team-Namen
  // (allentown_mad_dogs → Allentown / Mad Dogs).
  return {
    region: titleCaseWord(parts[0]),
    name: parts.slice(1).map(titleCaseWord).join(' '),
  };
}

// ─── Pool-Konstruktion ─────────────────────────────────────────────────────

const LOGO_BASE = '/img/logos';

function pickPrimaryLogoUrl(slug: string): string {
  // Wir können nicht zur Build-Zeit prüfen, ob <slug>1.png oder <slug>2.png
  // existiert. Pattern in BBGM: alle Teams haben mindestens <slug>1.png.
  return `${LOGO_BASE}/${slug}1.png`;
}

let cachedPool: ParsedLogoTeam[] | null = null;

export function getExpansionLogoPool(): ParsedLogoTeam[] {
  if (cachedPool) return cachedPool;
  const raw = logoPoolJson as LogoPoolEntry[];
  cachedPool = raw.map(entry => {
    const { region, name } = parseSlug(entry.slug);
    return {
      slug: entry.slug,
      region,
      name,
      primary: `#${entry.primary}`,
      secondary: `#${entry.secondary}`,
      logoUrl: pickPrimaryLogoUrl(entry.slug),
      smallUrl: `${LOGO_BASE}/${entry.slug}_small.png`,
      wordmarkUrl: `${LOGO_BASE}/${entry.slug}_wordmark.png`,
    };
  });
  return cachedPool;
}

/** Lookup einzelner Eintrag per Slug — z. B. wenn der User im Modal eine
 *  Auswahl getroffen hat und wir die Default-Werte (region/name/colors)
 *  einsetzen müssen. */
export function getLogoTeamBySlug(slug: string): ParsedLogoTeam | undefined {
  return getExpansionLogoPool().find(t => t.slug === slug);
}

/** Anzahl verfügbarer Logos — für UI-Header. */
export function getLogoPoolSize(): number {
  return (logoPoolJson as LogoPoolEntry[]).length;
}
