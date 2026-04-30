/**
 * DraftScoutingModal.tsx
 * Shared scouting modal opened from:
 *  - DraftScoutingView (mock-draft slot click)
 *  - DraftSimulatorView (Available Players row click)
 *
 * Three tabs: Overview / Scouting Report / Skill Profile.
 * No numeric attribute ratings shown — qualitative only.
 * Archetype name is HIDDEN everywhere.
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Heart, Zap, Target } from 'lucide-react';
import type { NBAPlayer } from '../../types';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import {
  generateStructuredScoutingReport,
  getTendencies,
  getRiskProfile,
  getSkillGrades,
  getPhysicalSnapshot,
  getBackgroundBlurb,
  getComparisonsWithSimilarity,
  inferArchetype,
  type ClassPercentileMaps,
  type SkillAxis,
  SKILL_AXES,
  posBucketFor as scoutPosBucket,
} from '../../services/scoutingReport';
import type { GistProspect } from '../../services/draftScoutingGist';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DraftScoutingModalProps {
  player: NBAPlayer | null;
  onClose: () => void;
  classProspects: NBAPlayer[];
  activePlayers: NBAPlayer[];
  percentilesByPos: Map<string, ClassPercentileMaps>;
  classAverages: Record<SkillAxis, number>;
  draftYear: number;
  /** Optional gist match for ranks/college-stats/photo. */
  gistData?: GistProspect | null;
  /** Optional ESPN/NoCeilings/Consensus ranks for the header chips. */
  ranks?: { espn?: number; noCeilings?: number; consensus?: number };
  /** Team logo if the prospect has been mock-drafted to a team. */
  teamLogoUrl?: string;
  /** Pre-computed (deduped) comparisons — skips live recompute when provided. */
  preComputedComps?: ReturnType<typeof getComparisonsWithSimilarity>;
  /** Optional handler — clicking a pro-comparison card jumps to that player's bio. */
  onViewPlayerBio?: (player: NBAPlayer) => void;
  /** When provided, a "Confirm Pick" footer bar is shown (draft simulator). */
  onConfirmPick?: () => void;
  /** Label shown in the confirm button, e.g. "Pick #3". */
  pickLabel?: string;
}

type Tab = 'overview' | 'scouting' | 'skill';

// ── Helpers ──────────────────────────────────────────────────────────────────

function letterColor(score: number): string {
  if (score >= 82) return '#3b82f6'; // A — blue
  if (score >= 70) return '#22c55e'; // B — green
  if (score >= 58) return '#eab308'; // C — yellow
  if (score >= 46) return '#f97316'; // D — orange
  return '#f43f5e'; // F — red
}

function tierColor(label: string): string {
  if (/superstar|all-star/i.test(label)) return '#3b82f6';
  if (/quality starter|borderline/i.test(label)) return '#22c55e';
  if (/solid starter|bench rotation/i.test(label)) return '#eab308';
  if (/g-league|deep bench/i.test(label)) return '#f97316';
  return '#94a3b8';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Octagonal radar chart ────────────────────────────────────────────────────
// 8 axes, no numeric badges on dots, dashed reference polygon for class average.

function HybridRadarChart({
  values,
  baseline,
  axes,
}: {
  values: number[];
  baseline: number[];
  axes: string[];
}) {
  const cx = 250, cy = 250, maxR = 175;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });
  const polyPoints = (r: number) =>
    Array.from({ length: n }, (_, i) => pt(i, r))
      .map(p => `${p.x},${p.y}`).join(' ');

  // Skill scores are 25–99 BBGM-scale. Draft prospects realistically peak at ~80,
  // so compress the denominator so mid-range scores (50–70) fill the chart properly.
  const scale = (v: number) => Math.max(0, Math.min(1, (v - 25) / 55)) * maxR;

  const dataPoly = values.map((v, i) => pt(i, scale(v)))
    .map(p => `${p.x},${p.y}`).join(' ');
  const basePoly = baseline.map((v, i) => pt(i, scale(v)))
    .map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox="0 0 500 500" width="100%" className="max-w-sm mx-auto">
      {/* Reference rings */}
      {[0.33, 0.66, 1].map(f => (
        <polygon key={f} points={polyPoints(maxR * f)} fill="none" stroke="#334155" strokeWidth="1" />
      ))}

      {/* Axis spokes */}
      {Array.from({ length: n }, (_, i) => {
        const tip = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke="#334155" strokeWidth="1" />;
      })}

      {/* Class-average baseline (dashed) */}
      <polygon points={basePoly} fill="rgba(148,163,184,0.10)" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Player polygon */}
      <polygon points={dataPoly} fill="rgba(59,130,246,0.30)" stroke="#3b82f6" strokeWidth="2.5" />

      {/* Player dots — no numeric badges per spec */}
      {values.map((_, i) => {
        const p = pt(i, scale(values[i]));
        return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#60a5fa" />;
      })}

      {/* Axis labels */}
      {Array.from({ length: n }, (_, i) => {
        const lp = pt(i, maxR + 30);
        let anchor: 'start' | 'middle' | 'end' = 'middle';
        if (lp.x < cx - 20) anchor = 'end';
        else if (lp.x > cx + 20) anchor = 'start';
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor={anchor}
            fontSize="11" fontWeight="700" fill="#cbd5e1">
            {axes[i]}
          </text>
        );
      })}
    </svg>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export const DraftScoutingModal: React.FC<DraftScoutingModalProps> = ({
  player, onClose, classProspects, activePlayers, percentilesByPos,
  classAverages, draftYear, gistData, ranks, teamLogoUrl, onViewPlayerBio,
  onConfirmPick, pickLabel, preComputedComps,
}) => {
  const [tab, setTab] = useState<Tab>('overview');

  // Reset to Overview each time a new player opens.
  React.useEffect(() => { setTab('overview'); }, [player?.internalId]);

  const data = useMemo(() => {
    if (!player) return null;
    const report = generateStructuredScoutingReport(player);
    const tendencies = getTendencies(player);
    const risk = getRiskProfile(player);
    const grades = getSkillGrades(player);
    const physical = getPhysicalSnapshot(player);
    const blurb = getBackgroundBlurb(player, draftYear);
    const archetype = inferArchetype(player);
    return { report, tendencies, risk, grades, physical, blurb, archetype };
  }, [player, draftYear]);

  const comparisons = useMemo(() => {
    if (preComputedComps) return preComputedComps;
    if (!player) return [];
    return getComparisonsWithSimilarity(player, activePlayers, 3);
  }, [player, activePlayers, preComputedComps]);

  const cohort = player ? scoutPosBucket(player.pos) : 'Class';
  const cohortMaps = percentilesByPos.get(cohort);

  return (
    <AnimatePresence>
      {player && data && (
      <motion.div
        key={player.internalId}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-0 md:p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full h-full md:h-auto md:max-h-[92vh] md:max-w-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 p-4 md:p-6 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <PlayerPortrait
                  imgUrl={player.imgURL || gistData?.headshot}
                  face={(player as any).face}
                  teamLogoUrl={teamLogoUrl}
                  playerName={player.name}
                  size={64}
                />
                <div className="min-w-0 flex-1">
                  {data.archetype && (
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-400 mb-0.5">
                      {data.archetype}
                    </div>
                  )}
                  <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white truncate">
                    {player.name}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {player.pos}
                    {(player as any).college && <> &middot; {(player as any).college}</>}
                    {player.age != null && <> &middot; Age {player.age}</>}
                    {data.physical.heightDisplay && <> &middot; {data.physical.heightDisplay}</>}
                  </p>
                  {/* Ceiling / Floor tier badges */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
                      style={{ color: tierColor(data.report.ceiling), borderColor: `${tierColor(data.report.ceiling)}55`, backgroundColor: `${tierColor(data.report.ceiling)}15` }}
                    >
                      Ceiling: {data.report.ceiling}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
                      style={{ color: tierColor(data.report.floor), borderColor: `${tierColor(data.report.floor)}55`, backgroundColor: `${tierColor(data.report.floor)}15` }}
                    >
                      Floor: {data.report.floor}
                    </span>
                  </div>
                  {/* Rank chips */}
                  {(ranks?.consensus || ranks?.espn || ranks?.noCeilings) && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {ranks.consensus != null && (
                        <span className="text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5">
                          Consensus #{ranks.consensus}
                        </span>
                      )}
                      {ranks.espn != null && (
                        <span className="text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5">
                          ESPN #{ranks.espn}
                        </span>
                      )}
                      {ranks.noCeilings != null && (
                        <span className="text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5">
                          No Ceilings #{ranks.noCeilings}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Tab strip ──────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-4 md:px-6 pt-3 border-b border-slate-800 bg-slate-900/40">
            <div className="flex rounded-xl overflow-hidden border border-slate-700 mb-3">
              {(['overview', 'scouting', 'skill'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    tab === t
                      ? t === 'overview' ? 'bg-violet-600 text-white'
                        : t === 'scouting' ? 'bg-sky-600 text-white'
                        : 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'overview' ? 'Overview' : t === 'scouting' ? 'Scouting Report' : 'Skill Profile'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body ───────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
            {tab === 'overview' && (
              <OverviewTab
                blurb={data.blurb}
                physical={data.physical}
                comparisons={comparisons}
                gistData={gistData}
                onViewPlayerBio={onViewPlayerBio}
                onClose={onClose}
              />
            )}
            {tab === 'scouting' && (
              <ScoutingReportTab
                report={data.report}
                tendencies={data.tendencies}
                risk={data.risk}
              />
            )}
            {tab === 'skill' && (
              <SkillProfileTab
                grades={data.grades}
                cohortMaps={cohortMaps}
                classAverages={classAverages}
                playerId={player.internalId}
              />
            )}
          </div>

          {/* ── Confirm Pick footer (draft simulator only) ──────────────── */}
          {onConfirmPick && (
            <div className="flex-shrink-0 p-3 bg-slate-950/60 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white border border-slate-700 font-black uppercase text-[10px] h-8 px-5 rounded-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirmPick}
                className="bg-indigo-700 hover:bg-indigo-600 text-white font-black uppercase text-[10px] h-8 px-6 rounded-sm transition-colors"
              >
                {pickLabel ? `Confirm ${pickLabel}` : 'Confirm Pick'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Overview tab ─────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{
  blurb: string;
  physical: ReturnType<typeof getPhysicalSnapshot>;
  comparisons: ReturnType<typeof getComparisonsWithSimilarity>;
  gistData?: GistProspect | null;
  onViewPlayerBio?: (player: NBAPlayer) => void;
  onClose: () => void;
}> = ({ blurb, physical, comparisons, gistData, onViewPlayerBio, onClose }) => (
  <div className="space-y-5">
    {/* Background blurb */}
    <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
      <p className="text-sm text-slate-200 leading-relaxed">{blurb}</p>
    </div>

    {/* Physical snapshot */}
    <div>
      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Physical Snapshot</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Height', value: physical.heightDisplay },
          { label: 'Weight', value: `${physical.weightLbs} lbs` },
          { label: 'Wingspan', value: physical.wingspanDisplay },
          { label: 'Reach', value: physical.reachDisplay },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-center">
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{s.label}</div>
            <div className="text-sm font-bold text-white mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
    </div>

    {/* College stats — only when gist supplied them */}
    {gistData?.stats && (gistData.stats.pts != null || gistData.stats.reb != null || gistData.stats.ast != null) && (
      <div>
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">College Stats</h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'PPG', value: gistData.stats.pts ?? '—' },
            { label: 'RPG', value: gistData.stats.reb ?? '—' },
            { label: 'APG', value: gistData.stats.ast ?? '—' },
            { label: 'FG%', value: gistData.stats.fg ?? '—' },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-center">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{s.label}</div>
              <div className="text-sm font-bold text-white mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Pro comparisons — clickable cards open the comp player's bio */}
    {comparisons.length > 0 && (
      <div>
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">
          Pro Comparisons {onViewPlayerBio && <span className="text-slate-600 normal-case font-medium">· click for bio</span>}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {comparisons.map(({ comparison, similarityPct }) => {
            const clickable = !!onViewPlayerBio;
            const handleClick = () => {
              if (!onViewPlayerBio) return;
              onClose();
              onViewPlayerBio(comparison);
            };
            return (
              <button
                key={comparison.internalId}
                type="button"
                onClick={handleClick}
                disabled={!clickable}
                className={`bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3 text-left transition-all ${
                  clickable ? 'hover:border-indigo-500 hover:bg-slate-800 cursor-pointer' : 'cursor-default'
                }`}
              >
                <PlayerPortrait
                  imgUrl={comparison.imgURL}
                  face={(comparison as any).face}
                  playerName={comparison.name}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{comparison.name}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    {similarityPct}% match
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    )}
  </div>
);

// ── Scouting Report tab ──────────────────────────────────────────────────────

const ScoutingReportTab: React.FC<{
  report: ReturnType<typeof generateStructuredScoutingReport>;
  tendencies: ReturnType<typeof getTendencies>;
  risk: ReturnType<typeof getRiskProfile>;
}> = ({ report, tendencies, risk }) => {
  const riskColor = risk.bustRisk === 'Low' ? '#22c55e'
    : risk.bustRisk === 'High' ? '#f43f5e'
    : '#eab308';

  return (
    <div className="space-y-5">
      {/* Strengths */}
      <div>
        <h3 className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-2 flex items-center gap-1.5">
          <Zap size={11} /> Strengths
        </h3>
        <ul className="space-y-1.5">
          {report.strengths.length > 0 ? report.strengths.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-200 leading-relaxed">
              <span className="text-emerald-500 flex-shrink-0">✓</span>
              <span>{s}</span>
            </li>
          )) : (
            <li className="text-sm text-slate-500 italic">Adequate across the board; no elite standout attributes.</li>
          )}
        </ul>
      </div>

      {/* Weaknesses */}
      <div>
        <h3 className="text-[10px] font-black uppercase text-rose-400 tracking-widest mb-2 flex items-center gap-1.5">
          <ShieldAlert size={11} /> Weaknesses
        </h3>
        <ul className="space-y-1.5">
          {report.weaknesses.length > 0 ? report.weaknesses.map((w, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-200 leading-relaxed">
              <span className="text-rose-500 flex-shrink-0">✗</span>
              <span>{w}</span>
            </li>
          )) : (
            <li className="text-sm text-slate-500 italic">No glaring holes; well-rounded prospect.</li>
          )}
        </ul>
      </div>

      {/* Medical concern */}
      {report.medicalConcern && (
        <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 flex gap-3">
          <Heart size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-200">
            <span className="font-black uppercase tracking-widest text-[10px] text-rose-400">Medical Concern: </span>
            Significant injury history flagged; recommend further evaluation.
          </p>
        </div>
      )}

      {/* Tendencies — TeamIntel-style narrative bullets */}
      <div>
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 flex items-center gap-1.5">
          <Target size={11} /> Tendencies & Fit
        </h3>
        <div className="space-y-2.5 bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
          <div className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 mt-2 flex-shrink-0" />
            <p className="text-sm text-slate-200 leading-relaxed">{tendencies.offensive}</p>
          </div>
          <div className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 flex-shrink-0" />
            <p className="text-sm text-slate-200 leading-relaxed">{tendencies.defensive}</p>
          </div>
          <div className="flex gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
            <p className="text-sm text-slate-200 leading-relaxed">{tendencies.bestFit}</p>
          </div>
        </div>
      </div>

      {/* Risk profile */}
      <div>
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Risk Profile</h3>
        <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Bust Risk</span>
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: riskColor }}>
              {risk.bustRisk}
            </span>
          </div>
          {/* Floor → Ceiling bar */}
          <div>
            <div className="flex justify-between mb-1.5">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Floor</div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Ceiling</div>
            </div>
            <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{ width: `${risk.floorScore}%`, backgroundColor: '#64748b' }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-r-full opacity-70"
                style={{
                  left: `${risk.floorScore}%`,
                  width: `${Math.max(0, risk.ceilingScore - risk.floorScore)}%`,
                  backgroundColor: tierColor(risk.ceilingTier),
                }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] font-bold text-slate-400">
              <span>{risk.floorTier}</span>
              <span style={{ color: tierColor(risk.ceilingTier) }}>{risk.ceilingTier}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Skill Profile tab ────────────────────────────────────────────────────────

const SkillProfileTab: React.FC<{
  grades: Record<SkillAxis, { score: number; letter: string }>;
  cohortMaps: ClassPercentileMaps | undefined;
  classAverages: Record<SkillAxis, number>;
  playerId: string | number;
}> = ({ grades, cohortMaps, classAverages, playerId }) => {
  const values = SKILL_AXES.map(a => grades[a].score);
  const baseline = SKILL_AXES.map(a => classAverages[a] ?? 50);

  return (
    <div className="space-y-5">
      {/* Radar */}
      <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-3">
        <HybridRadarChart values={values} baseline={baseline} axes={SKILL_AXES as unknown as string[]} />
        <div className="flex items-center justify-center gap-4 text-[10px] font-bold mt-1">
          <span className="flex items-center gap-1.5 text-sky-300">
            <span className="w-3 h-0.5 bg-sky-400" /> Player
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-3 h-0.5 border-t border-dashed border-slate-400" /> Class average
          </span>
        </div>
      </div>

      {/* Letter-grade grid with position-relative percentiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {SKILL_AXES.map(axis => {
          const g = grades[axis];
          const pct = cohortMaps?.byAxis[axis].get(playerId);
          return (
            <div key={axis} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{axis}</div>
              <div className="text-2xl font-black mt-1" style={{ color: letterColor(g.score) }}>
                {g.letter}
              </div>
              {pct != null && cohortMaps && (
                <div className="text-[9px] font-bold text-slate-400 mt-1 leading-tight">
                  {ordinal(pct)} pct
                  <br />
                  <span className="text-slate-500">in {cohortMaps.cohortLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
