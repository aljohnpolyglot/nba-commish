import { NBAPlayer } from '../../../types';
import { ComputedRow } from './PlayerStatsTypes';

const BREF_PROXIES = [
  (u: string) => `https://tight-breeze-58b1.mogatas-princealjohn-05082003.workers.dev/?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
];

const brefCache = new Map<string, ComputedRow | null>();
const brefInFlight = new Set<string>();

function brefId(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return '';
  const last = parts[parts.length - 1].replace(/[^a-zA-Z]/g, '').toLowerCase();
  const first = parts[0].replace(/[^a-zA-Z]/g, '').toLowerCase();
  return `${last.slice(0, 5)}${first.slice(0, 2)}01`;
}

export async function fetchBrefRow(player: NBAPlayer): Promise<ComputedRow | null> {
  const pid = brefId(player.name);
  if (!pid) return null;
  const cacheKey = `bref_career_${pid}`;
  if (brefCache.has(cacheKey)) return brefCache.get(cacheKey)!;
  if (brefInFlight.has(cacheKey)) return null;
  brefInFlight.add(cacheKey);

  const url = `https://www.basketball-reference.com/players/${pid[0]}/${pid}.html`;
  let html = '';
  for (const proxy of BREF_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      const text = await res.text();
      let candidate = text;
      try {
        candidate = JSON.parse(text).contents ?? text;
      } catch (_) {}
      if (candidate.includes('per_game')) {
        html = candidate;
        break;
      }
    } catch (_) {
      continue;
    }
  }
  if (!html) {
    brefCache.set(cacheKey, null);
    brefInFlight.delete(cacheKey);
    return null;
  }

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('#per_game');
    if (!table) {
      brefCache.set(cacheKey, null);
      brefInFlight.delete(cacheKey);
      return null;
    }

    const headers = Array.from(table.querySelectorAll('thead tr:last-child th')).map(th =>
      (th.getAttribute('data-stat') ?? th.textContent ?? '').toLowerCase().trim(),
    );
    const careerRow = table.querySelector('tfoot tr');
    if (!careerRow) {
      brefCache.set(cacheKey, null);
      brefInFlight.delete(cacheKey);
      return null;
    }

    const cells = Array.from(careerRow.querySelectorAll('td, th'));
    const get = (stat: string) => {
      const idx = headers.indexOf(stat);
      return idx >= 0 ? parseFloat(cells[idx]?.textContent ?? '0') || 0 : 0;
    };

    const fg = get('fg');
    const fga = get('fga');
    const tp = get('fg3');
    const tpa = get('fg3a');
    const ft = get('ft');
    const fta = get('fta');
    const gp = get('g');

    const row: ComputedRow = {
      player,
      season: 'career',
      teamAbbrev: 'TOT',
      age: player.age ?? 0,
      gp,
      gs: get('gs'),
      min: get('mp'),
      fg,
      fga,
      fgPct: fga > 0 ? fg / fga : 0,
      tp,
      tpa,
      tpPct: tpa > 0 ? tp / tpa : 0,
      fp: 0,
      fpa: 0,
      fpPct: 0,
      twop: fg - tp,
      twopa: fga - tpa,
      twopPct: fga - tpa > 0 ? (fg - tp) / (fga - tpa) : 0,
      efgPct: fga > 0 ? (fg + 0.5 * tp) / fga : 0,
      ft,
      fta,
      ftPct: fta > 0 ? ft / fta : 0,
      orb: get('orb'),
      drb: get('drb'),
      trb: get('trb'),
      ast: get('ast'),
      tov: get('tov'),
      stl: get('stl'),
      blk: get('blk'),
      pf: get('pf'),
      pts: get('pts'),
      pm: 0,
      per: 0,
      ewa: 0,
      tsPct: 0,
      efgPctA: 0,
      usgPct: 0,
      ortg: 0,
      drtg: 0,
      bpm: 0,
      obpm: 0,
      dbpm: 0,
      ws: 0,
      ows: 0,
      dws: 0,
      ws48: 0,
      vorp: 0,
      orbPct: 0,
      drbPct: 0,
      trbPct: 0,
      astPct: 0,
      stlPct: 0,
      blkPct: 0,
      tovPct: 0,
      threePAr: 0,
      ftRate: 0,
      fromBref: true,
    };
    brefCache.set(cacheKey, row);
    brefInFlight.delete(cacheKey);
    return row;
  } catch (_) {
    brefCache.set(cacheKey, null);
    brefInFlight.delete(cacheKey);
    return null;
  }
}
