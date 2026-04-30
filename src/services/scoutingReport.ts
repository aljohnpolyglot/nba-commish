/**
 * scoutingReport.ts
 * Algorithmic scouting report generator — no LLM required.
 *
 * Two output paths:
 *  - generateScoutingReport(player) → flat string (legacy; PlayerBioView Draft tab)
 *  - generateStructuredScoutingReport(player) → typed sections (new modal UI)
 *
 * Plus helpers used by the DraftScoutingModal:
 *  - getTendencies, getRiskProfile, getSkillGrades, getPhysicalSnapshot,
 *    getBackgroundBlurb, getComparisonsWithSimilarity, getClassPercentiles
 */

import type { NBAPlayer } from '../types';
import { findTopComparisons } from '../utils/playerComparisons';
import { convertTo2KRating } from '../utils/helpers';
import { estimatePotentialBbgm } from '../utils/playerRatings';
import { ARCHETYPE_PROFILES } from './genDraftPlayers';

// ── Thresholds (BBGM rating scale 0–99) ──────────────────────────────────────

const T = { elite: 80, great: 70, good: 60, avg: 50, below: 40, poor: 30 } as const;

function tier(val: number) {
  if (val >= T.elite) return 'elite';
  if (val >= T.great) return 'great';
  if (val >= T.good)  return 'good';
  if (val >= T.avg)   return 'avg';
  if (val >= T.below) return 'below';
  return 'poor';
}

// Deterministic pick from array using player id as seed
function pick<T>(arr: T[], seed: string | number, offset = 0): T {
  const h = [...String(seed)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return arr[(h + offset) % arr.length];
}

// Last ratings, with safe defaults so downstream math never NaNs.
function getRatings(player: NBAPlayer): Record<string, number> {
  const r: any = player.ratings?.[player.ratings.length - 1] ?? {};
  const defaults: Record<string, number> = {
    hgt: 50, stre: 50, spd: 50, jmp: 50, endu: 50,
    ins: 50, dnk: 50, ft: 50, fg: 50, tp: 50,
    oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50,
    ovr: player.overallRating ?? 50,
    pot: 50,
  };
  return { ...defaults, ...r };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Projection labels ─────────────────────────────────────────────────────────

// Thresholds operate on K2 SCALE (60–99) since that's what users see in the UI.
// Callers convert raw BBGM → K2 before invoking these helpers.
export function projectionCeiling(potK2: number): string {
  if (potK2 >= 95) return 'Hall of Fame / Superstar';
  if (potK2 >= 89) return 'All-Star / Franchise Player';
  if (potK2 >= 83) return 'Quality Starter / Borderline All-Star';
  if (potK2 >= 76) return 'Solid Starter / Efficient Rotation';
  return 'Rotation Role Player';
}

export function projectionFloor(ovrK2: number): string {
  if (ovrK2 >= 82) return 'Quality Starter';
  if (ovrK2 >= 75) return 'Bench Rotation';
  if (ovrK2 >= 68) return 'Deep Bench / G-League';
  return 'Out of the league / Overseas';
}

// ── Attribute strength/weakness templates ─────────────────────────────────────

interface AttrEntry {
  val: number;
  strengths: string[];
  weaknesses: string[];
}

function buildAttrData(r: Record<string, number>, player: NBAPlayer): AttrEntry[] {
  return [
    {
      val: r.tp,
      strengths: [
        'Deadly accurate from beyond the arc; a true floor-spacing threat.',
        'Elite shooter who forces defenses to stay glued on the perimeter.',
        'Lights-out range with a quick release; open looks are automatic.',
      ],
      weaknesses: [
        'Struggles to find consistency from the perimeter.',
        'Defenses dare him to shoot; three-point range is a major hole.',
        'Flat-footed shooter whose outside stroke needs a complete overhaul.',
      ],
    },
    {
      val: r.spd,
      strengths: [
        'Blazing first step that leaves defenders trailing in the open court.',
        'Elite lateral quickness; a nightmare to keep in front of.',
        'One of the fastest players in the class; end-to-end speed threat.',
      ],
      weaknesses: [
        'Lack of foot speed makes it hard to keep up at the next level.',
        'Heavy-footed; struggles to recover when beaten off the dribble.',
        'Lateral mobility is a real concern when defending quicker players.',
      ],
    },
    {
      val: r.diq,
      strengths: [
        'Exceptional defensive instincts; rarely out of position on rotations.',
        'High-level anticipation generates deflections and steals consistently.',
        'Disciplined team defender who anchors the defensive scheme.',
      ],
      weaknesses: [
        'Frequently lost in rotations; lacks awareness on the back line.',
        'Tends to ball-watch and surrender easy backdoor cuts.',
        'Defensive discipline is a major red flag for scouts.',
      ],
    },
    {
      val: r.pss,
      strengths: [
        'Elite court vision; sees plays two steps before they develop.',
        'Gifted passer who can thread the needle in tight windows.',
        'Unselfish facilitator who makes everyone around him more efficient.',
      ],
      weaknesses: [
        'Limited vision leads to forced passes and costly turnovers.',
        "Tunnel vision on drives; can't find the open man under pressure.",
        'Passing accuracy is inconsistent when retreating or off-balance.',
      ],
    },
    {
      val: r.reb,
      strengths: [
        'Relentless on the glass with a knack for tracking down boards.',
        'High-motor rebounder who aggressively pursues second-chance opportunities.',
        'Boxes out effectively and uses frame to control the paint.',
      ],
      weaknesses: [
        'Passive on the glass; gets out-muscled for positioning.',
        'Lacks the hunger to compete for contested rebounds.',
        "Doesn't show enough energy when chasing loose balls.",
      ],
    },
    {
      val: r.stre,
      strengths: [
        'Already possesses an NBA-ready body; welcomes contact in the paint.',
        'Superior frame used to create space and bully smaller defenders.',
        "Impressive core strength that won't be pushed around inside.",
      ],
      weaknesses: [
        'Thin frame; needs significant muscle to avoid being overpowered.',
        'Easily knocked off his spot against more physically mature opponents.',
        'Lack of core strength hurts his ability to maintain defensive posture.',
      ],
    },
    {
      val: r.oiq,
      strengths: [
        'Advanced offensive IQ; manipulates defenses with timing and angles.',
        'Master of the pick-and-roll with elite spacing intuition.',
        'Always seems to make the right play at the right moment.',
      ],
      weaknesses: [
        'Tunnel vision on offense; possession often dies in his hands.',
        'Low basketball IQ; struggles to read defensive shell adjustments.',
        'Tends to force bad shots rather than trusting the offensive rhythm.',
      ],
    },
    {
      val: r.dnk,
      strengths: [
        'Explosive above-the-rim finisher; challenges shot-blockers fearlessly.',
        'Spectacular athlete who can posterize anyone when driving the lane.',
        'Elite verticality and second-jump make him a constant lob threat.',
      ],
      weaknesses: [
        'Ground-bound; struggles to generate lift through contact.',
        'Timid finisher who settles for soft layups over power attempts.',
        'Vertical pop is noticeably absent at game speed.',
      ],
    },
    {
      val: (player as any).durability ?? 70,
      strengths: [
        'Iron-man durability; rarely misses time despite a heavy workload.',
        'Remarkably clean injury history; coaches trust him for big minutes.',
      ],
      weaknesses: [
        'Significant medical history raises red flags about long-term availability.',
        'Recurring lower-body injuries have repeatedly derailed his development.',
        'Fragile frame may struggle with the increased physical demands ahead.',
      ],
    },
  ];
}

// ── Structured report (the new canonical form) ──────────────────────────────

export interface StructuredScoutingReport {
  ceiling: string;
  floor: string;
  strengths: string[];
  weaknesses: string[];
  medicalConcern: boolean;
}

export function generateStructuredScoutingReport(player: NBAPlayer): StructuredScoutingReport {
  const r = getRatings(player);
  const ovr = player.overallRating ?? r.ovr;
  const storedPot = (player.ratings as any)?.[player.ratings?.length - 1]?.pot as number | undefined;
  const rawPot = (storedPot != null && storedPot > 0) ? storedPot : estimatePotentialBbgm(ovr, player.age ?? 20);
  const pot = Math.max(ovr, rawPot);
  const ovrK2 = convertTo2KRating(ovr, r.hgt, r.tp);
  const potK2 = convertTo2KRating(pot, r.hgt, r.tp);
  const pid = player.internalId ?? player.name ?? 'unknown';

  const strengths: { text: string; score: number }[] = [];
  const weaknesses: { text: string; score: number }[] = [];

  buildAttrData(r, player).forEach((a, i) => {
    if (a.val >= 58) strengths.push({ text: pick(a.strengths, pid, i), score: a.val });
    if (a.val <= 36) weaknesses.push({ text: pick(a.weaknesses, pid, i), score: 100 - a.val });
  });

  strengths.sort((a, b) => b.score - a.score);
  weaknesses.sort((a, b) => b.score - a.score);

  return {
    ceiling: projectionCeiling(potK2),
    floor: projectionFloor(ovrK2),
    strengths: strengths.slice(0, 5).map(s => s.text),
    weaknesses: weaknesses.slice(0, 5).map(w => w.text),
    medicalConcern: ((player as any).durability ?? 70) <= 35,
  };
}

// ── Legacy string export — thin formatter on top of the structured one ──────

export function generateScoutingReport(player: NBAPlayer): string {
  if (!player.ratings?.length) return 'No scouting data available.';
  const s = generateStructuredScoutingReport(player);
  const topStr = s.strengths.length ? s.strengths.map(t => `- ${t}`).join('\n')
    : '- Adequate across the board; no elite standout attributes.';
  const topWeak = s.weaknesses.length ? s.weaknesses.map(t => `- ${t}`).join('\n')
    : '- No glaring holes; well-rounded prospect.';
  const medical = s.medicalConcern
    ? '\n\nMEDICAL CONCERN\n- Significant injury history flagged; recommend further evaluation.'
    : '';
  return [
    `PROJECTION`,
    `- Ceiling: ${s.ceiling}`,
    `- Floor:   ${s.floor}`,
    ``,
    `STRENGTHS`,
    topStr,
    ``,
    `WEAKNESSES`,
    topWeak,
    medical,
  ].join('\n');
}

export function generateShortScoutingBlurb(player: NBAPlayer): string {
  const r = player.ratings?.[player.ratings.length - 1] as any;
  if (!r) return '';

  const pot = r.pot ?? player.overallRating ?? 50;
  const potLabel = pot >= 80 ? '⭐ Star' : pot >= 70 ? '🔵 Starter' : pot >= 60 ? '🟡 Reserve' : '⬜ Fringe';

  const checks: [number, string, string][] = [
    [r.tp ?? 50,                        'elite 3PT shooting',    'poor shooting range'],
    [r.spd ?? 50,                       'elite quickness',        'limited foot speed'],
    [r.diq ?? 50,                       'elite defensive IQ',     'poor defensive awareness'],
    [r.pss ?? 50,                       'elite playmaking',       'poor passing vision'],
    [(player as any).drivingDunk ?? 50, 'explosive finisher',     ''],
    [(player as any).durability ?? 70,  'iron-man durability',    'injury concerns'],
  ];

  const s: string[] = [];
  const w: string[] = [];
  for (const [val, str, weak] of checks) {
    if (val >= T.elite && str) s.push(str);
    else if (val < T.below && weak) w.push(weak);
  }

  return [potLabel, s.length ? `✅ ${s.slice(0, 2).join(', ')}` : '', w.length ? `⚠️ ${w.slice(0, 2).join(', ')}` : '']
    .filter(Boolean).join(' · ');
}

// ── Tendencies — narrative prose, archetype name never emitted ──────────────

export interface Tendencies {
  offensive: string;
  defensive: string;
  bestFit: string;
}

export function getTendencies(player: NBAPlayer): Tendencies {
  const r = getRatings(player);
  const pid = player.internalId ?? player.name ?? 'x';
  const pos = player.pos ?? 'F';
  const isGuard = pos.includes('G');
  const isCenter = pos.includes('C') || pos === 'FC';

  // Dominant offensive family
  const creator = r.pss * 0.55 + r.drb * 0.25 + r.oiq * 0.20;
  const shooter = r.tp * 0.55 + r.ft * 0.25 + r.fg * 0.20;
  const finisher = r.dnk * 0.60 + r.ins * 0.40;

  const offFams = [
    { key: 'creator', val: creator, lines: [
      'Projects as a primary creator with the ball in his hands; lives off pick-and-roll reads and live-dribble passing.',
      'A natural lead initiator who can dictate pace and set the table for shooters around him.',
      'High-usage offensive engine — possessions naturally flow through his hands.',
    ]},
    { key: 'shooter', val: shooter, lines: [
      'Best deployed as a movement shooter and floor-spacer; thrives off screens and relocations.',
      'A shot-making specialist whose gravity will warp NBA defensive schemes.',
      'Most valuable in catch-and-shoot looks where his stroke can do the heavy lifting.',
    ]},
    { key: 'finisher', val: finisher, lines: [
      'Vertical threat who flourishes as a roll man and lob target inside the arc.',
      'Pure finisher — his impact peaks above the rim and on dump-offs in the paint.',
      'A play-finisher who lets others create and punishes mistakes at the cup.',
    ]},
  ].sort((a, b) => b.val - a.val);

  const offensive = pick(offFams[0].lines, pid, 0);

  // Defensive identity
  const perim = r.diq * 0.55 + r.spd * 0.30 + r.stre * 0.15;
  const rim   = r.diq * 0.40 + r.hgt * 0.30 + r.jmp * 0.20 + r.stre * 0.10;
  const banger = r.stre * 0.50 + r.reb * 0.30 + r.hgt * 0.20;

  const defFams = [
    { key: 'perim', val: perim, lines: [
      'On defense, projects as a switchable wing capable of containing multiple positions.',
      'A perimeter stopper at his peak — quick feet and active hands at the point of attack.',
      'Defends ball handlers well and recovers quickly off closeouts.',
    ]},
    { key: 'rim', val: rim, lines: [
      'Defensively, the appeal is rim protection — verticality and length to deter shots at the basket.',
      'Anchors a drop coverage with his timing and shot-blocking instincts.',
      'A natural last line of defense; protects the paint without fouling.',
    ]},
    { key: 'banger', val: banger, lines: [
      'Defensively, he holds his ground in the post and ends possessions with the rebound.',
      'A physical interior defender who lives for matchups against bigger bodies.',
      'Brings the kind of toughness and box-out discipline that translates to playoff basketball.',
    ]},
  ];

  // Bias defensive selection by position (guards toward perim, centers toward rim)
  if (isGuard) defFams[0].val += 5;
  if (isCenter) defFams[1].val += 5;
  defFams.sort((a, b) => b.val - a.val);
  const defensive = pick(defFams[0].lines, pid, 1);

  // Best fit — pace + spacing recommendation
  const tempo = (r.spd + r.endu) / 2;
  const physical = (r.ins + r.stre) / 2;
  const spacing = r.tp;
  let bestFit: string;
  if (tempo >= 70 && spacing >= 65) {
    bestFit = pick([
      'Best fit: an up-tempo, five-out spacing system that keeps the lane open for downhill attacks.',
      'Ideal landing spot is a pace-and-space contender that lets him attack closeouts.',
      'Thrives in a free-flowing offense built on transition and drive-and-kick.',
    ], pid, 2);
  } else if (physical >= 65 && spacing < 55) {
    bestFit = pick([
      "Best fit: a half-court team that punishes mismatches in the post and on the glass.",
      'Belongs in a slower, physical system that values interior efficiency over perimeter creation.',
      'Lands cleanly with a contender that needs paint scoring and rebounding without sacrificing defense.',
    ], pid, 2);
  } else if (creator >= 70) {
    bestFit = pick([
      'Best fit: a team that needs a primary ball-handler to organize the offense and run pick-and-roll.',
      'Should land with a club that lacks a true lead initiator and is willing to give him keys.',
      'Pairs best with off-ball shooters who can capitalize on his playmaking gravity.',
    ], pid, 2);
  } else {
    bestFit = pick([
      'Best fit: a stable rotation team that values a connector who plays within himself.',
      'Lands cleanly anywhere the ask is to play hard, fill a role, and not break the offense.',
      'Most useful as a rotation glue piece on a team with established stars.',
    ], pid, 2);
  }

  return { offensive, defensive, bestFit };
}

// ── Risk profile ────────────────────────────────────────────────────────────

export interface RiskProfile {
  bustRisk: 'Low' | 'Med' | 'High';
  floorTier: string;
  ceilingTier: string;
  floorScore: number;   // 0..100 for bar viz
  ceilingScore: number; // 0..100
}

export function getRiskProfile(player: NBAPlayer): RiskProfile {
  const r = getRatings(player);
  const ovr = player.overallRating ?? r.ovr;
  const storedPot = (player.ratings as any)?.[player.ratings?.length - 1]?.pot as number | undefined;
  const rawPot = (storedPot != null && storedPot > 0) ? storedPot : estimatePotentialBbgm(ovr, player.age ?? 20);
  const pot = Math.max(ovr, rawPot);
  const ovrK2 = convertTo2KRating(ovr, r.hgt, r.tp);
  const potK2 = convertTo2KRating(pot, r.hgt, r.tp);
  const age = player.age ?? 20;
  const dur = (player as any).durability ?? 70;

  let risk = 0;
  if (age >= 21) risk += 2;
  if (age >= 23) risk += 1;
  if (dur <= 35) risk += 3;
  else if (dur <= 50) risk += 1;
  if (pot - ovr >= 15) risk += 2;
  if (r.oiq < 45 || r.diq < 45) risk += 1;
  if (pot >= 80 && ovr >= 70) risk -= 2;

  const bustRisk: RiskProfile['bustRisk'] = risk <= 1 ? 'Low' : risk >= 5 ? 'High' : 'Med';

  return {
    bustRisk,
    floorTier: projectionFloor(ovrK2),
    ceilingTier: projectionCeiling(potK2),
    floorScore: clamp(ovrK2, 0, 99),
    ceilingScore: clamp(potK2, 0, 99),
  };
}

// ── Skill grades — 8 hybrid scouting axes ───────────────────────────────────

export type SkillAxis =
  | 'Shooting' | 'Finishing' | 'Playmaking' | 'Defense'
  | 'Athleticism' | 'Rebounding' | 'Basketball IQ' | 'Physicality';

export const SKILL_AXES: SkillAxis[] = [
  'Shooting', 'Finishing', 'Playmaking', 'Defense',
  'Athleticism', 'Rebounding', 'Basketball IQ', 'Physicality',
];

export interface SkillGrade { score: number; letter: string; }

function letterFor(score: number): string {
  if (score >= 88) return 'A+';
  if (score >= 82) return 'A';
  if (score >= 76) return 'A-';
  if (score >= 70) return 'B+';
  if (score >= 64) return 'B';
  if (score >= 58) return 'B-';
  if (score >= 52) return 'C+';
  if (score >= 46) return 'C';
  if (score >= 40) return 'C-';
  if (score >= 34) return 'D';
  return 'F';
}

// Convert raw weight (lbs) into a 0–99 BBGM-style score so it fits in the formula.
function weightScaled(weightLbs: number | undefined): number {
  if (!weightLbs) return 50;
  return clamp((weightLbs - 160) / 1.4, 0, 99);
}

export function computeSkillScores(player: NBAPlayer): Record<SkillAxis, number> {
  const r = getRatings(player);
  const pos = player.pos ?? 'F';
  const isPerim = pos.includes('G') || pos === 'SF';
  const w = weightScaled((player as any).weight);

  const defense = isPerim
    ? 0.55 * r.diq + 0.30 * r.spd + 0.15 * r.stre
    : 0.45 * r.diq + 0.25 * r.hgt + 0.20 * r.jmp + 0.10 * r.stre;

  return {
    Shooting:        0.55 * r.tp  + 0.25 * r.ft  + 0.20 * r.fg,
    Finishing:       0.60 * r.dnk + 0.40 * r.ins,
    Playmaking:      0.55 * r.pss + 0.25 * r.drb + 0.20 * r.oiq,
    Defense:         defense,
    Athleticism:     0.40 * r.spd + 0.40 * r.jmp + 0.20 * r.endu,
    Rebounding:      0.55 * r.reb + 0.30 * r.hgt + 0.15 * r.jmp,
    'Basketball IQ': 0.50 * r.oiq + 0.50 * r.diq,
    Physicality:     0.45 * r.stre + 0.30 * r.hgt + 0.25 * w,
  };
}

export function getSkillGrades(player: NBAPlayer): Record<SkillAxis, SkillGrade> {
  const scores = computeSkillScores(player);
  const out: Record<string, SkillGrade> = {};
  for (const axis of SKILL_AXES) {
    const score = clamp(Math.round(scores[axis]), 25, 99);
    out[axis] = { score, letter: letterFor(score) };
  }
  return out as Record<SkillAxis, SkillGrade>;
}

// ── Physical snapshot ───────────────────────────────────────────────────────

export interface PhysicalSnapshot {
  heightInches: number;
  weightLbs: number;
  wingspanInches: number;
  reachInches: number;
  heightDisplay: string;
  wingspanDisplay: string;
  reachDisplay: string;
}

function inchesToDisplay(totalInches: number): string {
  // Round to 1 decimal first so 95.99" doesn't render as 7'12" via floor() drift.
  const rounded = Math.round(totalInches * 10) / 10;
  const ft = Math.floor(rounded / 12);
  const inches = Math.round((rounded - ft * 12) * 10) / 10;
  return `${ft}'${String(inches).replace(/\.0$/, '')}"`;
}

export function getPhysicalSnapshot(player: NBAPlayer): PhysicalSnapshot {
  // player.hgt is INCHES (≠ ratings.hgt which is the 0–99 scale).
  const heightInches = (player as any).hgt ?? 78;
  const weightLbs = (player as any).weight ?? 220;
  const wingspanInches = (player as any).wingspan ?? heightInches + 2;
  // Standing reach. Calibrated against real NBA combine data: avg reach/height ≈ 1.30,
  // with each inch of above-height wingspan adding ~0.5" to fingertip elevation.
  // Deterministic — modal can't have wobbling values per open.
  const reachInches = heightInches * 1.30 + (wingspanInches - heightInches) * 0.50;
  return {
    heightInches,
    weightLbs,
    wingspanInches,
    reachInches,
    heightDisplay: inchesToDisplay(heightInches),
    wingspanDisplay: inchesToDisplay(wingspanInches),
    reachDisplay: inchesToDisplay(reachInches),
  };
}

// ── Background blurb ────────────────────────────────────────────────────────

export function getBackgroundBlurb(player: NBAPlayer, draftYear?: number): string {
  const pid = player.internalId ?? player.name ?? 'x';
  const age = player.age ?? 20;
  const pos = player.pos ?? 'F';
  const college = (player as any).college as string | undefined;
  const country = (player as any).born?.loc as string | undefined;
  const isInternational = country && !/usa|united states/i.test(country);
  const yr = draftYear ?? (player as any).draft?.year ?? new Date().getFullYear();

  const positional = pos === 'PG' ? 'lead guard'
    : pos === 'SG' ? 'shooting guard'
    : pos === 'SF' ? 'wing'
    : pos === 'PF' ? 'combo forward'
    : pos === 'C' || pos === 'FC' ? 'big man'
    : 'prospect';

  if (isInternational) {
    const lines = [
      `An international ${positional} entering the ${yr} draft after carving out pro minutes overseas.`,
      `${player.name} arrives from ${country} with a pro résumé that already exceeds most peers in this class.`,
      `A globe-tested ${positional} whose decision to declare reflects confidence in his readiness to contribute.`,
    ];
    return pick(lines, pid, 3);
  }

  if (college && age <= 19) {
    const lines = [
      `A freshman phenom out of ${college}, ${player.name} declared for the draft with helium and very little tape against pros.`,
      `One-and-done ${positional} from ${college} riding a dominant freshman season into the lottery picture.`,
      `Young ${positional} who lit up the NCAA from day one at ${college}; teams are betting on the trajectory.`,
    ];
    return pick(lines, pid, 3);
  }

  if (college && age >= 22) {
    const lines = [
      `A polished, four-year ${positional} from ${college} who enters the league with a clear identity and few mysteries.`,
      `Veteran NCAA ${positional} out of ${college}; his floor is high and his game is already nearly finished.`,
      `Older prospect from ${college} whose age cools the upside but whose readiness should plug into a rotation.`,
    ];
    return pick(lines, pid, 3);
  }

  if (college) {
    const lines = [
      `A ${age}-year-old ${positional} from ${college} who showed scouts enough to declare after a strong season.`,
      `Hails from ${college}, where his sophomore tape painted a clearer picture of his NBA role.`,
      `${player.name} parlayed a productive run at ${college} into draft consideration as a developmental ${positional}.`,
    ];
    return pick(lines, pid, 3);
  }

  // Generated/synthesised prospect with no college/international tag — neutral fallback.
  const lines = [
    `A ${age}-year-old ${positional} entering the ${yr} draft with the physical tools NBA staffs love to bet on.`,
    `Late-bloomer ${positional} whose pre-draft profile leans more on potential than résumé.`,
    `${player.name} declared for the ${yr} draft on the back of a developmental arc that scouts believe still has ceiling.`,
  ];
  return pick(lines, pid, 3);
}

// ── Comparisons with similarity % ───────────────────────────────────────────

export interface ComparisonWithSim {
  comparison: NBAPlayer;
  similarityPct: number;
}

export function getComparisonsWithSimilarity(
  player: NBAPlayer,
  activePlayers: NBAPlayer[],
  n = 3,
): ComparisonWithSim[] {
  const lastIdx = (player.ratings?.length ?? 0) - 1;
  const last: any = lastIdx >= 0 ? player.ratings![lastIdx] : null;
  if (!last) return [];

  const rawOvr = player.overallRating ?? last.ovr ?? 50;
  const rawPot = Math.max(rawOvr, last.pot ?? rawOvr);

  // Aggressive ceiling projection: each attribute moves toward an elite target
  // proportional to its current strength. Strong attrs become star-tier, weak
  // attrs stay average. This lets a high-POT prospect's *profile shape* match
  // against current NBA stars rather than collapsing into bench-tier clusters.
  const projectAttr = (v: number | undefined): number => {
    const val = v ?? 50;
    const strength = Math.max(0, (val - 45) / 55); // 0..1, baseline = avg
    const target = Math.min(99, rawPot + strength * 15); // strong attrs project past pot
    if (target <= val) return val;
    return Math.round(val + (target - val) * 0.85);
  };

  const projectedRating = {
    ...last,
    hgt: last.hgt ?? 50, // height never projects
    stre: projectAttr(last.stre),
    spd:  projectAttr(last.spd),
    jmp:  projectAttr(last.jmp),
    endu: projectAttr(last.endu),
    ins:  projectAttr(last.ins),
    dnk:  projectAttr(last.dnk),
    ft:   projectAttr(last.ft),
    fg:   projectAttr(last.fg),
    tp:   projectAttr(last.tp),
    oiq:  projectAttr(last.oiq),
    diq:  projectAttr(last.diq),
    drb:  projectAttr(last.drb),
    pss:  projectAttr(last.pss),
    reb:  projectAttr(last.reb),
    ovr:  rawPot,
    pot:  rawPot,
  };
  const projectedPlayer = {
    ...player,
    overallRating: rawPot,
    ratings: [...player.ratings!.slice(0, -1), projectedRating],
  } as NBAPlayer;

  // Filter the comp pool to NBA rotation-quality players. End-of-bench rookies
  // shouldn't dominate the top-3 slots when comparing against a prospect's peak.
  // Fallback to the full pool if too few qualify (e.g., very early-season state).
  const elite = activePlayers.filter(p => (p.overallRating ?? 0) >= 65);
  const pool = elite.length >= 10 ? elite : activePlayers;

  const matches = findTopComparisons(projectedPlayer, pool, false);
  return matches.slice(0, n).map(m => ({
    comparison: m.comparison,
    // 1 decimal — multiple cosine sims at 1.000 would all round to 100% otherwise.
    similarityPct: Math.round(clamp(m.similarity * 100, 0, 100) * 10) / 10,
  }));
}

/**
 * Compute comps for every prospect at once, then deduplicate so no NBA player
 * appears more than `maxPerRank` times at a given rank slot (1st / 2nd / 3rd).
 * Pass prospects in priority order — earlier entries win the best available comp.
 * Returns a Map<internalId, ComparisonWithSim[]>.
 */
export function batchComparisonsDeduped(
  prospects: NBAPlayer[],
  activePlayers: NBAPlayer[],
  topN = 3,
  maxPerRank = 3,
): Map<string, ComparisonWithSim[]> {
  // Fetch raw top-(topN × 4) comps per prospect — enough alternatives for dedup
  const rawComps = new Map<string, ComparisonWithSim[]>();
  for (const p of prospects) {
    rawComps.set(p.internalId, getComparisonsWithSimilarity(p, activePlayers, topN * 4));
  }

  // Greedy assignment: for each rank slot independently, cap each comp at maxPerRank
  const rankCounts: Map<string, number>[] = Array.from({ length: topN }, () => new Map());
  const result = new Map<string, ComparisonWithSim[]>();

  for (const prospect of prospects) {
    const raw = rawComps.get(prospect.internalId) ?? [];
    const assigned: ComparisonWithSim[] = [];

    for (let rank = 0; rank < topN; rank++) {
      for (const comp of raw) {
        const cid = comp.comparison.internalId;
        if (assigned.some(a => a.comparison.internalId === cid)) continue; // no duplicates within a prospect
        const used = rankCounts[rank].get(cid) ?? 0;
        if (used < maxPerRank) {
          assigned.push(comp);
          rankCounts[rank].set(cid, used + 1);
          break;
        }
      }
    }

    result.set(prospect.internalId, assigned);
  }

  return result;
}

// ── Class percentiles (per position cohort) ────────────────────────────────

export type PositionBucket = 'Guard' | 'Forward' | 'Center' | 'Class';

export function posBucketFor(pos: string | undefined): PositionBucket {
  const p = pos ?? 'F';
  if (p.includes('G') || p === 'PG' || p === 'SG') return 'Guard';
  if (p.includes('C') || p === 'FC') return 'Center';
  return 'Forward';
}

export interface ClassPercentileMaps {
  byAxis: Record<SkillAxis, Map<string | number, number>>;
  cohortSize: number;
  cohortLabel: string; // "Guards", "Forwards", "Centers", or "Class"
}

/**
 * Compute per-axis percentile rank (0–100, higher = better) for each prospect
 * within a given position cohort. Cohorts <5 fall back to whole-class.
 */
export function getClassPercentiles(
  prospects: NBAPlayer[],
  cohort: PositionBucket,
): ClassPercentileMaps {
  // Decide cohort: filter to position bucket (or whole class if cohort='Class' or too small)
  let cohortProspects = cohort === 'Class'
    ? prospects
    : prospects.filter(p => posBucketFor(p.pos) === cohort);
  let cohortLabel: string = cohort === 'Class' ? 'Class'
    : cohort === 'Guard' ? 'Guards'
    : cohort === 'Forward' ? 'Forwards'
    : 'Centers';
  if (cohortProspects.length < 5) {
    cohortProspects = prospects;
    cohortLabel = 'Class';
  }

  const byAxis: Record<string, Map<string | number, number>> = {};
  const n = cohortProspects.length;
  for (const axis of SKILL_AXES) byAxis[axis] = new Map();
  if (n === 0) {
    return { byAxis: byAxis as Record<SkillAxis, Map<string | number, number>>, cohortSize: 0, cohortLabel };
  }

  for (const axis of SKILL_AXES) {
    const scored = cohortProspects.map(p => ({
      id: p.internalId ?? p.name,
      score: computeSkillScores(p)[axis],
    }));
    scored.sort((a, b) => a.score - b.score); // ascending
    scored.forEach((entry, i) => {
      // Percentile rank: (rank+1)/n × 100, so the worst is ~1, the best is 100.
      const pct = Math.round(((i + 1) / n) * 100);
      byAxis[axis].set(entry.id, pct);
    });
  }

  return {
    byAxis: byAxis as Record<SkillAxis, Map<string | number, number>>,
    cohortSize: n,
    cohortLabel,
  };
}

/**
 * Class average per axis — used as the dashed baseline polygon on the spider chart.
 */
export function getClassAverages(prospects: NBAPlayer[]): Record<SkillAxis, number> {
  const out: Record<string, number> = {};
  for (const axis of SKILL_AXES) {
    if (prospects.length === 0) { out[axis] = 50; continue; }
    let sum = 0;
    for (const p of prospects) sum += computeSkillScores(p)[axis];
    out[axis] = sum / prospects.length;
  }
  return out as Record<SkillAxis, number>;
}

// ── Archetype matcher ───────────────────────────────────────────────────────

// Position → candidate archetype names. Mirrors getArchetypeSelection() in
// genDraftPlayers.ts. Imported prospects (BBGM/gist) don't have an archetype
// field, so we infer the closest match from their rating profile.
const POS_ARCHETYPES: Record<string, string[]> = {
  PG: ['Primary Creator', 'Scoring Guard', 'Defensive Pest', 'Pass-First Floor Gen',
       'Two-Way PG', 'Jumbo Playmaker', 'Explosive Slasher', 'Limitless Sniper'],
  SG: ['Shooting Specialist', 'Volume Scorer', 'Mid-Range Maestro', 'Slasher',
       '3&D Wing', 'Combo Scorer', 'Defensive Stopper', 'Non-Scoring Lockdown', 'Movement Shooter'],
  SF: ['All-Around Wing', 'Mid-Range Maestro', 'Isolation Specialist', 'Volume Scorer',
       '3&D Forward', 'Athletic Finisher', 'Point Forward', 'Defensive Wing',
       'Non-Scoring Lockdown', 'Swiss Army Knife'],
  PF: ['Stretch Four', 'Isolation Specialist', 'Post-Up Master', 'Power Forward',
       'Two-Way Forward', 'Athletic Four', 'Face-Up Four', 'Below-Rim Banger',
       'Stretch Forward', 'Elite Spacing Wing', 'Switchable Spacer', 'High-Energy Finisher'],
  C:  ['Traditional Center', 'The Unicorn', 'Defensive Anchor', 'Stretch Big', 'Two-Way Big',
       'Offensive Hub', 'Athletic Rim-Runner', 'Undersized Big', 'Post Specialist',
       'High-Energy Finisher'],
};

// Compound positions (SG/SF, PF/C, etc.) — fall back to primary slot.
function archetypeCandidatesFor(pos: string | undefined): string[] {
  if (!pos) return POS_ARCHETYPES.SF;
  const primary = pos.split('/')[0] as keyof typeof POS_ARCHETYPES;
  return POS_ARCHETYPES[primary] ?? POS_ARCHETYPES.SF;
}

// Attributes that drive archetype identification. Skipping drivingDunk/standingDunk
// because those live on the player object, not on ratings, and aren't always populated.
const ARCHETYPE_KEYS = [
  'hgt', 'stre', 'spd', 'jmp', 'endu', 'ins', 'dnk', 'ft', 'fg', 'tp',
  'oiq', 'diq', 'drb', 'pss', 'reb',
] as const;

// Per-attribute weights — height + signature skills carry more identification signal
// than secondary stats. Tuned so a tall stretch-shooter doesn't get lumped with a guard.
const ARCHETYPE_WEIGHTS: Record<string, number> = {
  hgt: 3.0,
  tp:  1.6,  pss: 1.4,  diq: 1.3,  drb: 1.3,  pot: 1.2,
  ins: 1.2,  dnk: 1.2,  oiq: 1.2,  stre: 1.1,
  fg:  1.0,  ft:  1.0,  spd: 1.0,  jmp: 1.0,  endu: 0.8,  reb: 1.1,
};

/**
 * Infer the archetype that best matches the prospect's rating profile.
 * Works for both gen-draft prospects (have archetype directly) and BBGM imports.
 *
 * If the player already carries an `archetype` field (synthesized prospects),
 * that's returned directly — we trust the explicit assignment.
 */
export function inferArchetype(player: NBAPlayer): string | null {
  // Synthesised prospects: trust the explicit field (skip pricey distance math)
  const explicit = (player as any).archetype as string | undefined;
  if (explicit && ARCHETYPE_PROFILES[explicit]) return explicit;

  const r = getRatings(player);
  const candidates = archetypeCandidatesFor(player.pos);
  if (candidates.length === 0) return null;

  let bestName: string | null = null;
  let bestScore = Infinity;
  for (const name of candidates) {
    const profile = ARCHETYPE_PROFILES[name];
    if (!profile) continue;
    let dist = 0;
    for (const key of ARCHETYPE_KEYS) {
      const target = profile[key];
      if (target == null) continue;
      const actual = r[key] ?? 50;
      const w = ARCHETYPE_WEIGHTS[key] ?? 1;
      const d = actual - target;
      dist += w * d * d;
    }
    if (dist < bestScore) {
      bestScore = dist;
      bestName = name;
    }
  }
  return bestName;
}
