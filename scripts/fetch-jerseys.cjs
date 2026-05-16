#!/usr/bin/env node
/**
 * fetch-jerseys.js — pulls basketball jerseys from Wikipedia and serves a gallery.
 *
 *   node scripts/fetch-jerseys.js          # fetch all leagues, then start gallery on :3000
 *   node scripts/fetch-jerseys.js fetch    # just download (creates ./public/img/jerseys/)
 *   node scripts/fetch-jerseys.js serve    # just serve existing ./public/img/jerseys/
 *   node scripts/fetch-jerseys.js fetch NBA PBA   # fetch only specific leagues
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const TEAMS = {
  NBA: [
    'Atlanta_Hawks', 'Boston_Celtics', 'Brooklyn_Nets', 'Charlotte_Hornets',
    'Chicago_Bulls', 'Cleveland_Cavaliers', 'Dallas_Mavericks', 'Denver_Nuggets',
    'Detroit_Pistons', 'Golden_State_Warriors', 'Houston_Rockets', 'Indiana_Pacers',
    'Los_Angeles_Clippers', 'Los_Angeles_Lakers', 'Memphis_Grizzlies', 'Miami_Heat',
    'Milwaukee_Bucks', 'Minnesota_Timberwolves', 'New_Orleans_Pelicans',
    'New_York_Knicks', 'Oklahoma_City_Thunder', 'Orlando_Magic',
    'Philadelphia_76ers', 'Phoenix_Suns', 'Portland_Trail_Blazers',
    'Sacramento_Kings', 'San_Antonio_Spurs', 'Toronto_Raptors',
    'Utah_Jazz', 'Washington_Wizards',
  ],
  EUROLEAGUE: [
    'Anadolu_Efes_S.K.', 'AS_Monaco_Basket', 'Saski_Baskonia',
    'KK_Crvena_zvezda', 'Dubai_Basketball', 'Olimpia_Milano',
    'FC_Barcelona_Bàsquet', 'FC_Bayern_Munich_(basketball)',
    'Fenerbahçe_Men%27s_Basketball', 'Hapoel_Tel_Aviv_B.C.',
    'ASVEL_Basket', 'Maccabi_Tel_Aviv_B.C.', 'Olympiacos_B.C.',
    'Panathinaikos_B.C.', 'Paris_Basketball', 'KK_Partizan',
    'Real_Madrid_Baloncesto', 'Valencia_Basket', 'Virtus_Bologna',
    'BC_Žalgiris',
  ],
  ENDESA: [
    'Real_Madrid_Baloncesto', 'FC_Barcelona_Bàsquet',
    'Unicaja_(basketball)', 'Valencia_Basket', 'Saski_Baskonia',
    'Bàsquet_Manresa', 'CB_Gran_Canaria', 'Joventut_Badalona',
    'Bilbao_Basket', 'Club_Baloncesto_Breogán', 'CB_Granada',
    'BC_Andorra', 'Basket_Zaragoza', 'UCAM_Murcia_CB',
    'CB_Canarias', 'San_Pablo_Burgos',
  ],
  PBA: [
    'Barangay_Ginebra_San_Miguel', 'Blackwater_Bossing',
    'Converge_FiberXers', 'Magnolia_Hotshots_Pambansang_Manok',
    'Meralco_Bolts', 'NLEX_Road_Warriors', 'NorthPort_Batang_Pier',
    'Phoenix_Super_LPG_Fuel_Masters', 'Rain_or_Shine_Elasto_Painters',
    'San_Miguel_Beermen', 'Terrafirma_Dyip', 'TNT_Tropang_Giga',
  ],
};

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUT_DIR    = path.join(PROJECT_ROOT, 'public', 'img', 'jerseys');
const PORT       = process.env.PORT || 3000;
const USER_AGENT = 'nba-commish-jersey-fetcher/1.0 (https://github.com/aljohnmogatas/nba-commish; lemakicatta@gmail.com) Node.js';
const DELAY_MS   = 400;

const KIT_RE = /\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^"'\s]+Kit_(body|shorts)_[^"'\s]+\.png/gi;

function rawGet(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Encoding': 'identity',
        'Referer': 'https://en.wikipedia.org/',
        'Accept': 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
    };
    https.get(opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return rawGet(next, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        const err = new Error(`HTTP ${res.statusCode} for ${url}`);
        err.statusCode = res.statusCode;
        err.retryAfter = parseInt(res.headers['retry-after'] || '0', 10);
        res.resume();
        return reject(err);
      }
      resolve(res);
    }).on('error', reject);
  });
}

async function get(url, redirects = 5) {
  let attempt = 0;
  while (true) {
    try {
      return await rawGet(url, redirects);
    } catch (e) {
      if (e.statusCode === 429 && attempt < 5) {
        const wait = (e.retryAfter > 0 ? e.retryAfter * 1000 : 2000 * Math.pow(2, attempt));
        await sleep(wait);
        attempt++;
        continue;
      }
      throw e;
    }
  }
}

async function getText(url) {
  const res = await get(url);
  return new Promise((resolve, reject) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => (data += c));
    res.on('end', () => resolve(data));
    res.on('error', reject);
  });
}

async function downloadTo(url, dest) {
  const res = await get(url);
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
    file.on('error', (e) => { fs.unlink(dest, () => reject(e)); });
    res.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrapeTeam(league, slug) {
  const url = `https://en.wikipedia.org/wiki/${slug}`;
  let html;
  try {
    html = await getText(url);
  } catch (e) {
    return { team: slug, league, kits: [], error: e.message };
  }

  const urls = [...new Set(html.match(KIT_RE) || [])].map((u) => 'https:' + u);
  if (urls.length === 0) {
    return { team: slug, league, kits: [], error: 'no kit images found' };
  }

  const teamDir = path.join(OUT_DIR, league, slug.replace(/[/\\]/g, '_'));
  const kits = [];
  for (const fullUrl of urls) {
    const filename = decodeURIComponent(path.basename(fullUrl));
    const dest = path.join(teamDir, filename);
    if (!fs.existsSync(dest)) {
      try {
        await downloadTo(fullUrl, dest);
        await sleep(150);
      } catch (e) {
        kits.push({ filename, url: fullUrl, error: e.message });
        continue;
      }
    }
    const m = filename.match(/^Kit_(body|shorts)_(.+?)\.png$/i);
    kits.push({
      filename,
      url: fullUrl,
      part: m ? m[1].toLowerCase() : 'unknown',
      variant: m ? m[2] : '',
      localPath: path.relative(PROJECT_ROOT, dest).split(path.sep).join('/'),
    });
  }
  return { team: slug, league, kits };
}

async function runFetch(leagueFilter = null) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const results = {};
  const leagues = leagueFilter && leagueFilter.length
    ? Object.fromEntries(Object.entries(TEAMS).filter(([k]) => leagueFilter.includes(k)))
    : TEAMS;

  for (const [league, slugs] of Object.entries(leagues)) {
    results[league] = [];
    console.log(`\n=== ${league} (${slugs.length} teams) ===`);
    let i = 0;
    for (const slug of slugs) {
      i++;
      process.stdout.write(`  [${String(i).padStart(2)}/${slugs.length}] ${slug.padEnd(48)} `);
      const r = await scrapeTeam(league, slug);
      results[league].push(r);
      if (r.error) console.log(`x ${r.error}`);
      else console.log(`OK ${r.kits.length} kit images`);
      await sleep(DELAY_MS);
    }
  }

  await fs.promises.writeFile(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(results, null, 2)
  );

  const total = Object.values(results).flat().reduce((s, t) => s + t.kits.length, 0);
  const failed = Object.values(results).flat().filter((t) => t.error).length;
  console.log(`\nDone. ${total} kit images across ${Object.values(results).flat().length - failed} teams. ${failed} teams failed (check slugs).`);
  return results;
}

function loadCatalog() {
  const p = path.join(OUT_DIR, 'index.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = decodeURI(req.url.split('?')[0]);

      if (url === '/' || url === '/index.html') {
        const catalog = loadCatalog();
        if (!catalog) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('No catalog found. Run: node scripts/fetch-jerseys.js fetch');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderGallery(catalog));
        return;
      }

      if (url === '/api/jerseys') {
        const catalog = loadCatalog();
        res.writeHead(catalog ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(catalog || { error: 'no catalog' }, null, 2));
        return;
      }

      if (url.startsWith('/public/img/jerseys/') || url.startsWith('/img/jerseys/')) {
        const rel = url.replace(/^\/(public\/)?/, '');
        const filepath = path.join(PROJECT_ROOT, rel);
        if (!filepath.startsWith(OUT_DIR)) {
          res.writeHead(403); res.end('forbidden'); return;
        }
        if (!fs.existsSync(filepath) || fs.statSync(filepath).isDirectory()) {
          res.writeHead(404); res.end('not found'); return;
        }
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
        fs.createReadStream(filepath).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('server error: ' + e.message);
    }
  });
  server.listen(PORT, () => {
    console.log(`\nGallery -> http://localhost:${PORT}`);
    console.log(`JSON    -> http://localhost:${PORT}/api/jerseys`);
  });
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function groupKits(kits) {
  const looks = {};
  for (const k of kits) {
    if (!k.localPath) continue;
    const v = k.variant || 'default';
    looks[v] = looks[v] || { variant: v, body: null, shorts: null };
    if (k.part === 'body')   looks[v].body   = k;
    if (k.part === 'shorts') looks[v].shorts = k;
  }
  return Object.values(looks);
}

function renderGallery(catalog) {
  const totalTeams = Object.values(catalog).flat().length;
  const totalKits  = Object.values(catalog).flat().reduce((s, t) => s + t.kits.filter(k => k.localPath).length, 0);
  const leagueOrder = Object.keys(catalog);

  const leagueSections = leagueOrder.map((league) => {
    const teams = catalog[league];
    const teamCards = teams.map((t, idx) => {
      const looks = groupKits(t.kits);
      const displayName = t.team.replace(/_/g, ' ').replace(/\(.*?\)/g, '').replace(/%27/g, "'").trim();
      if (t.error || looks.length === 0) {
        return `<article class="team team--empty"><div class="team__num">${String(idx+1).padStart(2,'0')}</div><h3 class="team__name">${escape(displayName)}</h3><p class="team__error">${escape(t.error || 'no kits')}</p></article>`;
      }
      const looksHtml = looks.map((l) => `<figure class="look"><div class="look__kit">${l.body?`<img loading="lazy" src="/${escape(l.body.localPath)}" alt="">`:'<span class="look__missing">-</span>'}${l.shorts?`<img loading="lazy" src="/${escape(l.shorts.localPath)}" alt="">`:''}</div><figcaption>${escape(l.variant)}</figcaption></figure>`).join('');
      return `<article class="team"><div class="team__num">${String(idx+1).padStart(2,'0')}</div><h3 class="team__name">${escape(displayName)}</h3><div class="team__looks">${looksHtml}</div></article>`;
    }).join('');
    return `<section class="league" id="${escape(league)}"><header class="league__head"><span class="league__tag">${escape(league)}</span><span class="league__count">${teams.length} clubs</span></header><div class="league__grid">${teamCards}</div></section>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Jersey Index</title></head><body><h1>Jersey Index — ${totalKits} kit images / ${totalTeams} clubs</h1>${leagueSections}</body></html>`;
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const leagueArgs = rest.map(s => s.toUpperCase()).filter(s => TEAMS[s]);

  if (cmd === 'serve') {
    startServer();
  } else if (cmd === 'fetch') {
    await runFetch(leagueArgs.length ? leagueArgs : null);
  } else {
    await runFetch(leagueArgs.length ? leagueArgs : null);
    startServer();
  }
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
