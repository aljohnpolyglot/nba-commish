/**
 * Build the unified nbacoachesratings JSON for the nba-store-data gist repo.
 *
 *   HEAD COACHES → curated, hand-authored (src/data/coaches/headCoachAttributes.json)
 *   ASSISTANT COACHES → seeded deterministically from name + position, with a
 *                       role bias (ACs lean toward tactics / defense / development
 *                       so the spread is realistic instead of uniform 72/72/72).
 *
 * Output matches the `nbagmratings` schema convention used elsewhere in the
 * repo: an array of { name, role, team, attributes:{...15 fields} }.
 *
 * Run: node scripts/build-coach-attributes.mjs
 * Then: gh api -X PUT repos/aljohnpolyglot/nba-store-data/contents/nbacoachesratings ...
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const COACH_LIST_URL = 'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/main/nba2kcoachlist';
const CURATED_HC_PATH = path.join(REPO_ROOT, 'src/data/coaches/headCoachAttributes.json');
const OUT_PATH = path.join(REPO_ROOT, 'src/data/coaches/nbacoachesratings.json');

// ── Deterministic seed (matches displayAttributes.ts seedForStaff hash) ──────
function hashName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (Math.imul(31, hash) + name.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

// ── Per-attribute base + role bias for assistant coaches ─────────────────────
// Bases reflect "a typical NBA assistant coach": competent at coaching basics,
// weaker on negotiating/physiotherapy (not their domain), variable on the rest.
// Variance ±20 instead of the old ±10 so two different ACs visibly differ.
const AC_BASES = {
  offense: 74, defense: 76, tactics: 78, development: 80, conditioning: 70,
  adaptability: 75, determination: 80, levelOfDiscipline: 76, manManagement: 74, motivating: 76,
  physiotherapy: 55, sportsScience: 65, judgingPlayerAbility: 76, judgingPlayerPotential: 76, negotiating: 60,
};

function seedAssistantAttributes(name) {
  const seed = hashName(name);
  const out = {};
  let i = 0;
  for (const [key, base] of Object.entries(AC_BASES)) {
    i++;
    const swing = ((seed + i * 37) % 41) - 20; // -20..+20
    out[key] = Math.max(40, Math.min(95, base + swing));
  }
  return out;
}

// ── Player Development Coach / Sports Performance / etc. role bias ───────────
// Coaches whose title contains "development" should bias higher on development
// + motivating. Sports-performance / strength coaches bias on conditioning +
// sportsScience. Defensive coordinators bias on defense + tactics.
function applyRoleBias(attrs, position) {
  const pos = position.toLowerCase();
  const bias = (key, delta) => { attrs[key] = Math.max(40, Math.min(99, attrs[key] + delta)); };
  if (pos.includes('development') || pos.includes('player dev')) {
    bias('development', 10); bias('motivating', 5); bias('judgingPlayerPotential', 5);
  }
  if (pos.includes('performance') || pos.includes('strength')) {
    bias('conditioning', 12); bias('sportsScience', 8); bias('physiotherapy', 5);
  }
  if (pos.includes('defensive')) { bias('defense', 8); bias('tactics', 4); }
  if (pos.includes('offensive')) { bias('offense', 8); bias('tactics', 4); }
  return attrs;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching nba2kcoachlist…');
  const res = await fetch(COACH_LIST_URL);
  if (!res.ok) throw new Error(`coach list fetch failed: ${res.status}`);
  const coachList = await res.json();
  console.log(`  ${coachList.length} coaches in source.`);

  console.log('Loading curated head-coach attributes…');
  const curatedRaw = JSON.parse(await fs.readFile(CURATED_HC_PATH, 'utf-8'));
  const { _meta, ...curatedHCs } = curatedRaw;
  console.log(`  ${Object.keys(curatedHCs).length} HCs in curated file.`);

  const output = [];

  // 1) Emit curated HCs first, joining team info from the source list.
  for (const [name, attrs] of Object.entries(curatedHCs)) {
    const src = coachList.find(c => c.name === name);
    output.push({
      name,
      role: 'Head Coach',
      team: src?.team ?? null,
      source: 'curated',
      attributes: attrs,
    });
  }

  // 2) Emit assistant coaches (and any other non-HC coaching staff) with
  //    seeded attributes + position-aware role bias. Skip HCs already covered.
  const curatedNames = new Set(Object.keys(curatedHCs));
  let acCount = 0;
  for (const c of coachList) {
    const pos = (c.position ?? '').toLowerCase();
    if (pos.includes('head coach') && !pos.includes('assistant')) continue;
    if (curatedNames.has(c.name)) continue;
    const attrs = applyRoleBias(seedAssistantAttributes(c.name), c.position ?? '');
    output.push({
      name: c.name,
      role: c.position ?? 'Assistant Coach',
      team: c.team ?? null,
      source: 'seeded',
      attributes: attrs,
    });
    acCount++;
  }
  console.log(`  ${acCount} assistant/development coaches seeded.`);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote ${output.length} entries → ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch(err => { console.error(err); process.exit(1); });
