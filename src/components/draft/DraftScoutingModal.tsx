import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Heart, Zap, Target } from 'lucide-react';
import type { NBAPlayer } from '../../types';
import { useGame } from '../../store/GameContext';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { didPlayerAttendDraftCombine, generateCombineStats } from '../../services/draftCombineCalculator';
import {
  generateStructuredScoutingReport,
  getTendencies,
  getRiskProfile,
  getPhysicalSnapshot,
  getComparisonsWithSimilarity,
  inferArchetype,
} from '../../services/scoutingReport';
import type { GistProspect } from '../../services/draftScoutingGist';
import { findCollegeTeamProfile, type CollegeTeamProfile } from '../../services/collegeTeamCatalog';
import {
  getProspectBackgroundBlurb,
  rankProspectComparisons,
  resolveCollegeSnapshot,
  tierColor,
} from './DraftScoutingModalShared';
import { DraftScoutingCombineTab } from './DraftScoutingCombineTab';
import { fuzzPercentileValue } from '../../utils/scoutingFuzz';
import { isPbaIsolatedMode, isWnbaIsolatedMode } from '../../utils/uiMode';
import { ClassPercentileSkillProfile } from '../scouting/ClassPercentileSkillProfile';
import { loadBbrCollegeStatsForPlayer } from '../../services/college/bbrCollegeHistory';
import type { NBAGMStat } from '../../types';
import { getProspectPreDraftClub } from '../../utils/prospectUtils';

export interface DraftScoutingModalProps {
  player: NBAPlayer | null;
  onClose: () => void;
  classProspects: NBAPlayer[];
  activePlayers: NBAPlayer[];
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
  showCombineTab?: boolean;
}

type Tab = 'overview' | 'scouting' | 'skill' | 'combine';

export const DraftScoutingModal: React.FC<DraftScoutingModalProps> = ({
  player, onClose, classProspects, activePlayers,
  draftYear, gistData, ranks, teamLogoUrl, onViewPlayerBio,
  onConfirmPick, pickLabel, preComputedComps, showCombineTab = false,
}) => {
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>('overview');
  const [archivedCollegeStats, setArchivedCollegeStats] = useState<NBAGMStat[]>([]);
  React.useEffect(() => { setTab('overview'); }, [player?.internalId]);
  React.useEffect(() => {
    let active = true;
    setArchivedCollegeStats([]);
    if (!player) return () => { active = false; };
    loadBbrCollegeStatsForPlayer(player, draftYear)
      .then(rows => { if (active) setArchivedCollegeStats(rows); })
      .catch(() => { if (active) setArchivedCollegeStats([]); });
    return () => { active = false; };
  }, [draftYear, player]);
  const projectionContext = isPbaIsolatedMode(state) ? 'pba' : 'nba';

  const data = useMemo(() => {
    if (!player) return null;
    const report = generateStructuredScoutingReport(player, projectionContext, { cohortProspects: classProspects });
    const tendencies = getTendencies(player);
    const risk = getRiskProfile(player, projectionContext);
    const physical = getPhysicalSnapshot(player);
    const blurb = getProspectBackgroundBlurb(player, draftYear, gistData);
    const archetype = inferArchetype(player);
    return { report, tendencies, risk, physical, blurb, archetype };
  }, [player, draftYear, gistData, projectionContext, classProspects]);

  const comparisons = useMemo(() => {
    if (!player) return [];
    const live = getComparisonsWithSimilarity(player, activePlayers, 10, projectionContext);
    const byId = new Map<string, (typeof live)[number]>();
    for (const row of [...(preComputedComps ?? []), ...live]) byId.set(row.comparison.internalId, row);
    return rankProspectComparisons(player, [...byId.values()], 3);
  }, [player, activePlayers, preComputedComps, projectionContext]);

  const collegeSnapshot = useMemo(
    () => player ? resolveCollegeSnapshot(player, gistData, draftYear, archivedCollegeStats) : null,
    [archivedCollegeStats, draftYear, gistData, player],
  );
  const collegeName = collegeSnapshot?.college;
  const collegeProfile = useMemo(() => findCollegeTeamProfile(collegeName), [collegeName]);
  const preDraftClub = useMemo(() => player ? getProspectPreDraftClub(player, {
    currentSeason: draftYear,
    completedThrough: draftYear,
    teams: [...state.teams, ...(state.nonNBATeams ?? [])],
  }) : null, [draftYear, player, state.nonNBATeams, state.teams]);
  const programName = collegeName || preDraftClub?.name;
  const classRank = player ? classProspects.findIndex(row => row.internalId === player.internalId) : -1;
  const projectedRank = player
    ? ranks?.consensus ?? ranks?.espn ?? ranks?.noCeilings
      ?? player.preDraftClub?.projectedOverallPick
      ?? (classRank >= 0 ? classRank + 1 : 60)
    : 1;
  const attendedCombine = !player || isPbaIsolatedMode(state) || isWnbaIsolatedMode(state)
    || didPlayerAttendDraftCombine(player, draftYear, projectedRank);
  const combine = useMemo(
    () => player && showCombineTab && attendedCombine ? generateCombineStats(player) : null,
    [attendedCombine, player, showCombineTab],
  );

  return (
    <AnimatePresence>
      {player && data && (
      <motion.div
        key={player.internalId}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[170] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-0 md:p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }}
          className="bg-slate-900 border border-slate-800 w-full h-full md:h-auto md:max-h-[calc(100vh-2rem)] md:max-w-3xl md:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="flex-shrink-0 p-4 md:p-6 border-b border-slate-800 bg-slate-900/80">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <PlayerPortrait
                  imgUrl={player.imgURL || gistData?.headshot}
                  face={(player as any).face}
                  teamLogoUrl={collegeProfile?.logoUrl || preDraftClub?.logoUrl || teamLogoUrl}
                  playerName={player.name}
                  playerIdentity={player}
                  portraitSeason={draftYear}
                  isDraftProspect
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
                    {programName && <> &middot; {programName}</>}
                    {player.age != null && <> &middot; Age {player.age}</>}
                    {data.physical.heightDisplay && <> &middot; {data.physical.heightDisplay}</>}
                  </p>
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
                aria-label="Close scouting report"
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors flex-shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            {collegeSnapshot && (
              <div className="mt-4 grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(58px,1fr))] gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/5 p-2 sm:p-3">
                <div className="min-w-0 self-center px-1">
                  <div className="truncate text-xs font-black uppercase tracking-wide text-white">{collegeSnapshot.college}</div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                    {collegeSnapshot.seasonLabel}{collegeSnapshot.games ? ` · ${collegeSnapshot.games} GP` : ''}
                  </div>
                </div>
                {[
                  ['PPG', collegeSnapshot.ppg],
                  ['RPG', collegeSnapshot.rpg],
                  ['APG', collegeSnapshot.apg],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-slate-950/60 px-2 py-2 text-center">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</div>
                    <div className="mt-0.5 text-sm font-black tabular-nums text-white">
                      {typeof value === 'number' ? value.toFixed(1) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-4 md:px-6 pt-3 border-b border-slate-800 bg-slate-900/40">
            <div className="flex rounded-xl overflow-hidden border border-slate-700 mb-3">
              {(['overview', 'scouting', 'skill', ...(showCombineTab ? ['combine'] : [])] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    tab === t
                      ? t === 'overview' ? 'bg-violet-600 text-white'
                        : t === 'scouting' ? 'bg-sky-600 text-white'
                        : t === 'skill' ? 'bg-emerald-600 text-white'
                        : 'bg-fuchsia-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'overview'
                    ? 'Overview'
                    : t === 'scouting'
                      ? 'Scouting Report'
                      : t === 'skill'
                        ? 'Skill Profile'
                        : 'Combine Results'}
                </button>
              ))}
            </div>
          </div>

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
              <ClassPercentileSkillProfile
                player={player}
                classProspects={classProspects}
                fuzzPercentile={(value, salt) => fuzzPercentileValue(value, state, player, salt)}
              />
            )}
            {tab === 'combine' && (
              <DraftScoutingCombineTab playerName={player.name} combine={combine} />
            )}
          </div>

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

const OverviewTab: React.FC<{
  blurb: string;
  physical: ReturnType<typeof getPhysicalSnapshot>;
  comparisons: ReturnType<typeof getComparisonsWithSimilarity>;
  gistData?: GistProspect | null;
  onViewPlayerBio?: (player: NBAPlayer) => void;
  onClose: () => void;
}> = ({ blurb, physical, comparisons, gistData, onViewPlayerBio, onClose }) => (
  <div className="space-y-5">
    <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4">
      <p className="text-sm text-slate-200 leading-relaxed">{blurb}</p>
    </div>

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

      {report.medicalConcern && (
        <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 flex gap-3">
          <Heart size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-200">
            <span className="font-black uppercase tracking-widest text-[10px] text-rose-400">Medical Concern: </span>
            Significant injury history flagged; recommend further evaluation.
          </p>
        </div>
      )}

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

      <div>
        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Risk Profile</h3>
        <div className="bg-slate-800/40 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Bust Risk</span>
            <span className="text-sm font-black uppercase tracking-widest" style={{ color: riskColor }}>
              {risk.bustRisk}
            </span>
          </div>
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
