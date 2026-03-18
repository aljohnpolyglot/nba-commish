export interface ShotZoneData {
  zone: string;
  pct: number;
  vol: string;
}

export interface ShotChartResult {
  slug: string;
  zones: ShotZoneData[];
  source: 'live' | 'fallback';
}

const WORKER_URL = 'https://shiny-sky-8d8a.pitanbatman.workers.dev/';

// SANDBOX: league averages hardcoded
// TRANSPLANT: compute from state.leagueStats.threePointZoneAverages for current season
// SANDBOX: year = new Date().getFullYear()
// TRANSPLANT: use state.leagueStats.year
export const LEAGUE_AVERAGES: ShotZoneData[] = [
  { zone: 'Left Corner',  pct: 37.8, vol: 'Med' },
  { zone: 'Left Wing',    pct: 35.2, vol: 'High' },
  { zone: 'Top of Key',   pct: 35.9, vol: 'High' },
  { zone: 'Right Wing',   pct: 35.4, vol: 'High' },
  { zone: 'Right Corner', pct: 38.1, vol: 'Med' },
];

const cache = new Map<string, ShotChartResult>();

// SANDBOX: shot chart from worker URL
// TRANSPLANT: pull from player.stats[currentSeason].shotZones — same [L-Corner, L-Wing, Top, R-Wing, R-Corner] structure
export async function fetchShotChart(slug: string): Promise<ShotChartResult> {
  if (cache.has(slug)) return cache.get(slug)!;

  try {
    const res = await fetch(`${WORKER_URL}?player=${slug}`);
    const json = await res.json();

    if (!json.success || !json.racks || json.racks.length < 5) {
      throw new Error('Bad response');
    }

    const zones: ShotZoneData[] = json.racks.map((r: { pct: string; vol: string }, i: number) => ({
      zone: LEAGUE_AVERAGES[i].zone,
      pct: parseFloat(r.pct) || LEAGUE_AVERAGES[i].pct,
      vol: r.vol || LEAGUE_AVERAGES[i].vol,
    }));

    const result: ShotChartResult = { slug, zones, source: 'live' };
    cache.set(slug, result);
    return result;

  } catch {
    const result: ShotChartResult = {
      slug,
      zones: LEAGUE_AVERAGES.map(z => ({ ...z })),
      source: 'fallback',
    };
    cache.set(slug, result);
    return result;
  }
}

export async function fetchAllShotCharts(
  contestants: { id: string; nbaSlug: string }[]
): Promise<Map<string, ShotChartResult>> {
  const results = await Promise.allSettled(
    contestants.map(c => fetchShotChart(c.nbaSlug))
  );

  const map = new Map<string, ShotChartResult>();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      map.set(contestants[i].id, r.value);
    } else {
      map.set(contestants[i].id, {
        slug: contestants[i].nbaSlug,
        zones: LEAGUE_AVERAGES.map(z => ({ ...z })),
        source: 'fallback',
      });
    }
  });
  return map;
}
