import type { NBAPlayer } from '../../../types';
import { extractNbaId, hdPortrait } from '../../../utils/helpers';
import { getCachedImageUrl } from '../../../services/imageCache';
import { SettingsManager } from '../../../services/SettingsManager';

const CACHE_VER  = "nba_v21";

const PROXIES = [
  (u: string) => `https://tight-breeze-58b1.mogatas-princealjohn-05082003.workers.dev/?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
];
export const memCache  = new Map<string, any>();
const inFlight  = new Map<string, Promise<any>>();
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeRequests++;
      fn().then(resolve).catch(reject).finally(() => {
        activeRequests--;
        if (requestQueue.length > 0) requestQueue.shift()!();
      });
    };
    if (activeRequests < 1) run();
    else requestQueue.push(run);
  });
}

const EXTERNAL_STATUSES = new Set(['WNBA','Euroleague','PBA','B-League','G-League','Endesa','China CBA','NBL Australia','Draft Prospect','Prospect']);

/** True if imgURL is the ProBallers "no photo" placeholder — treat as absent. */
function isDefaultProballers(url: string): boolean {
  return url.includes('head-par-defaut');
}

export function getPlayerImage(player: NBAPlayer): string | undefined {
  // BBGM/ProBallers portrait is the canonical source for all leagues.
  // Skip the ProBallers default placeholder (head-par-defaut) — treat as no photo.
  if (player.imgURL && player.imgURL.trim() !== '' && !isDefaultProballers(player.imgURL)) {
    // Check blob cache first for instant offline loading
    if (SettingsManager.getSettings().enableImageCache) {
      const cached = getCachedImageUrl(player.imgURL);
      if (cached) return cached;
    }
    return player.imgURL;
  }
  // External league players: no CDN fallback — show initials instead of passport-style headshot.
  if (EXTERNAL_STATUSES.has(player.status ?? '')) return undefined;
  // NBA players without a BBGM portrait: try the official NBA CDN.
  const nbaId = extractNbaId('', player.name);
  if (nbaId) {
    const cdnUrl = hdPortrait(nbaId);
    if (SettingsManager.getSettings().enableImageCache) {
      const cached = getCachedImageUrl(cdnUrl);
      if (cached) return cached;
    }
    return cdnUrl;
  }
  return undefined;
}

export function isCacheValid(p: any): boolean {
  return !!(p?.bio?.pro || p?.bio?.pre || p?.bio?.per);
}

export async function fetchWithDedup(nbaId: string, simYear?: number): Promise<any> {
  if (memCache.has(nbaId)) return memCache.get(nbaId);
  if (inFlight.has(nbaId)) return inFlight.get(nbaId)!;
  const p = doFetch(nbaId, simYear).finally(() => inFlight.delete(nbaId));
  inFlight.set(nbaId, p);
  return p;
}

async function doFetch(nbaId: string, simYear?: number): Promise<any> {
  const cacheKey = `${CACHE_VER}_${nbaId}`;
  if (memCache.has(nbaId)) return memCache.get(nbaId);
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isCacheValid(parsed)) { memCache.set(nbaId, parsed); return parsed; }
      localStorage.removeItem(cacheKey);
    }
  } catch (_) {}

const url = `https://www.nba.com/player/${nbaId}/bio`;
  let html = "";
  for (const proxy of PROXIES) {
    try {
      const res  = await enqueue(() => fetch(proxy(url)));
      const text = await res.text();
      let candidate = text;
      try { candidate = JSON.parse(text).contents ?? text; } catch (_) {}
      if (candidate.includes("__NEXT_DATA__")) { html = candidate; break; }
    } catch (_) { continue; }
  }
  if (!html) throw new Error(`All proxies failed for ${nbaId}`);
  const doc     = new DOMParser().parseFromString(html, "text/html");
  const dataTag = doc.getElementById("__NEXT_DATA__");
  if (!dataTag) throw new Error("__NEXT_DATA__ missing");

  const nextData = JSON.parse(dataTag.textContent || "{}");
  const info = (() => {
    for (const path of [["props","pageProps","player","info"],["props","pageProps","PlayerSummary","info"]]) {
      try { let c = nextData; for (const k of path) { c = c[k]; if (c == null) break; } if (c) return c; } catch (_) {}
    }
    return {};
  })();
  const cmsBio = (() => {
    for (const path of [["props","pageProps","player","cmsBio"],["props","pageProps","PlayerSummary","cmsBio"]]) {
      try { let c = nextData; for (const k of path) { c = c[k]; if (c == null) break; } if (c) return c; } catch (_) {}
    }
    return "";
  })();

  const tDiv = document.createElement("div");
  tDiv.innerHTML = cmsBio;
  const bios = { pro: "", pre: "", per: "" };
  tDiv.querySelectorAll("h2").forEach(h => {
    const head = (h.textContent || "").toUpperCase();
    let body = "", sib = h.nextElementSibling;
    while (sib && sib.tagName !== "H2") { body += sib.outerHTML; sib = sib.nextElementSibling; }
    if      (head.includes("PROFESSIONAL"))                        bios.pro = bulletize(body);
    else if (head.includes("BEFORE") || head.includes("COLLEGE")) bios.pre = bulletize(body);
    else if (head.includes("PERSONAL"))                            bios.per = bulletize(body);
  });
  if (!bios.pro && (tDiv.textContent || "").trim().length > 20) bios.pro = bulletize(tDiv.innerHTML);

  const ageYear = simYear ?? new Date().getFullYear();
  const payload: Record<string, any> = { bio: bios, imgHD: hdPortrait(nbaId) };
  const birthStr = info.BIRTHDATE || info.birthdate || "";
  if (birthStr) {
    const bD = new Date(birthStr);
    let age = ageYear - bD.getFullYear();
    const now = new Date();
    if (now.getMonth() < bD.getMonth() || (now.getMonth() === bD.getMonth() && now.getDate() < bD.getDate())) age--;
    payload.b = bD.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });
    payload.a = `${age} years`;
  }
  const country = info.COUNTRY || info.country || "";
  const school  = info.SCHOOL  || info.school  || info.LAST_AFFILIATION || "";
  if (country) payload.c = country;
  if (school)  payload.s = school;

  if (isCacheValid(payload)) {
    memCache.set(nbaId, payload);
    try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch (_) {}
  }
  return payload;
}

function bulletize(html: string): string {
  if (!html || html.trim().length < 5) return "";
  let text = html
    .replace(/<\/p>/gi,      " [SEP] ")
    .replace(/<br\s*\/?>/gi, " [SEP] ")
    // Protect abbreviations BEFORE any dot-splitting
    .replace(/\b(vs|apr|jan|feb|mar|jun|jul|aug|sep|oct|nov|dec|st|no|inc|jr|sr|dr|mr|mrs|ft|fg)\.\s/gi, "$1%%DOT%% ")
    // Split on ellipsis (main separator in NBA.com bio text)
    .replace(/(\.\.\.)|(…)/g, " [SEP] ")
    // Split on sentence boundaries (capital letter after period)
    .replace(/\. ([A-Z])/g,  ". [SEP] $1")
    .replace(/%%DOT%%/g, ".")
    .replace(/(NBA:|Playoffs:|20\d{2}-\d{2}:|AS A COLLEGIAN:|AS A PROFESSIONAL:)/g," [SEP] <b>$1</b>");
  const lines = text.replace(/<b>/g,"%%B%%").replace(/<\/b>/g,"%%/B%%")
    .replace(/<[^>]+>/g,"").replace(/%%B%%/g,"<b>").replace(/%%\/B%%/g,"</b>")
    .split("[SEP]").map(l => l.replace(/^[\s.\W]+/,"").trim()).filter(l => l.length > 5);
  if (!lines.length) return "";
  return lines.map(line => {
    const cap = line.replace(/^([a-z])/,m => m.toUpperCase());
    return `<li>${cap.endsWith(".")||cap.endsWith("!") ? cap : cap+"."}</li>`;
  }).join("");
}

export function prefetchPlayerBio(player: NBAPlayer): void {
  const nbaId = extractNbaId(player.imgURL || "");
  if (!nbaId || memCache.has(nbaId) || inFlight.has(nbaId)) return;
  fetchWithDedup(nbaId).catch(() => {});
}

// ── NON-NBA BIO DATA ─────────────────────────────────────────────────────────
// For PBA, Euroleague, and B-League players, build bio data directly from the
// player's stored notes and stats fields — no HTTP fetch required.
// ─────────────────────────────────────────────────────────────────────────────
export function getNonNBABioData(player: NBAPlayer): { bio: { pro: string; pre: string; per: string } } | null {
  const NON_NBA = ['PBA', 'Euroleague', 'B-League', 'WNBA', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'];
  if (!NON_NBA.includes(player.status || '')) return null;

  const notes: string = (player as any).notes || '';
  let proBio = '';

  if (notes.trim().length > 10) {
    // Split into sentences and convert to bullet list
    const sentences = notes
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 8);
    proBio = sentences
      .map(s => `<li>${s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.'}</li>`)
      .join('');
  }

  // Build stats bullets from stored stats array
  const stats = player.stats;
  let statsBio = '';
  if (Array.isArray(stats) && stats.length > 0) {
    const latest = [...stats].sort((a, b) => (b.season || 0) - (a.season || 0))[0];
    if (latest) {
      const gp = latest.gp || 1;
      const pts = latest.pts != null ? (latest.pts / gp).toFixed(1) : null;
      const trb = (latest.trb ?? ((latest.orb || 0) + (latest.drb || 0)));
      const trbPg = trb != null ? (trb / gp).toFixed(1) : null;
      const ast = latest.ast != null ? (latest.ast / gp).toFixed(1) : null;
      const min = latest.min != null ? (latest.min / gp).toFixed(1) : null;
      const parts: string[] = [];
      if (min && parseFloat(min) > 0) parts.push(`${min} MPG`);
      if (pts && parseFloat(pts) > 0) parts.push(`${pts} PPG`);
      if (trbPg && parseFloat(trbPg) > 0) parts.push(`${trbPg} RPG`);
      if (ast && parseFloat(ast) > 0) parts.push(`${ast} APG`);
      if (parts.length > 0) {
        const season = latest.season ? `${latest.season - 1}-${String(latest.season).slice(-2)}` : 'Latest';
        statsBio = `<li><b>${season} Season Stats:</b> ${parts.join(' · ')} in ${gp} games.</li>`;
      }
    }
  }

  const combinedPro = [statsBio, proBio].filter(Boolean).join('');

  return {
    bio: {
      pro: combinedPro || '',
      pre: '',
      per: '',
    }
  };
}