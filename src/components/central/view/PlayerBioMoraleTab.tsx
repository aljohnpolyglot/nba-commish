import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { computeMoodScore, moodLabel, normalizeMoodTraits } from '../../../utils/mood/moodScore';
import { retireProb } from '../../../services/playerDevelopment/retirementChecker';
import type { NBAPlayer } from '../../../types';
import type { MoodTrait } from '../../../utils/mood/moodTypes';
import { getDisplayAge } from '../../../store/playerRatingStore';
import {
  classifyResignIntent,
  computeResignProbability,
  getContractThoughts,
  moraleColor,
  moraleLabel,
  resignColor,
  resignLabel,
  RetiredCareerSummary,
  TRAIT_CONFIG,
} from './playerBioMoraleShared';

interface PlayerBioMoraleTabProps {
  player: NBAPlayer;
}

export { classifyResignIntent, computeResignProbability } from './playerBioMoraleShared';

export const PlayerBioMoraleTab: React.FC<PlayerBioMoraleTabProps> = ({ player }) => {
  const { state } = useGame();
  const currentYear = state.leagueStats.year;

  const team = useMemo(() => state.teams.find(t => t.id === player.tid), [state.teams, player.tid]);

  const { moodScore, morale, traits, components, teamWinPct } = useMemo(() => {
    const { score, components } = computeMoodScore(
      player,
      team,
      state.date,
      false, false, false,
      state.players.filter(p => p.tid === player.tid),
    );
    const morale = Math.round(((score + 10) / 20) * 100);
    const traits: MoodTrait[] = normalizeMoodTraits((player as any).moodTraits ?? []);
    const gp = (team?.wins ?? 0) + (team?.losses ?? 0);
    const teamWinPct = gp > 0 ? (team?.wins ?? 0) / gp : 0.5;
    return { moodScore: score, morale, traits, components, teamWinPct };
  }, [player, team, state.date, state.players]);

  const contractThoughts = useMemo(
    () => getContractThoughts(player, traits, moodScore, currentYear, teamWinPct),
    [player, traits, moodScore, currentYear, teamWinPct],
  );

  const resign = useMemo(
    () => computeResignProbability(player, traits, moodScore, currentYear, teamWinPct, team),
    [player, traits, moodScore, currentYear, teamWinPct, team],
  );

  const mColor = moraleColor(morale);
  const coreBBGMTraits = traits.filter(t => ['DIVA', 'LOYAL', 'MERCENARY', 'COMPETITOR'].includes(t));
  const dramaTraits = traits.filter(t => ['VOLATILE', 'AMBASSADOR', 'DRAMA_MAGNET'].includes(t));
  const isFarewellTour = !!(player as any).farewellTour;

  const retirementRisk = useMemo(() => {
    if (isFarewellTour || player.status === 'Retired') return null;
    const age = getDisplayAge(player, currentYear);
    if (age < 34) return null;
    const prob = retireProb(age, player.overallRating ?? 60);
    if (prob <= 0) return null;
    const pct = Math.round(prob * 100);
    if (pct < 5) return null;
    const label = pct >= 70 ? 'Very Likely' : pct >= 40 ? 'Likely' : pct >= 20 ? 'Possible' : 'Low';
    const color = pct >= 70 ? '#f43f5e' : pct >= 40 ? '#f97316' : pct >= 20 ? '#eab308' : '#94a3b8';
    return { age, pct, label, color };
  }, [currentYear, isFarewellTour, player]);

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-xl mx-auto">
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Player Morale</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black" style={{ color: mColor }}>{morale}</span>
            <span className="text-xs text-slate-500">/ 100</span>
          </div>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden mb-2">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${morale}%`, backgroundColor: mColor }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: mColor }}>{moraleLabel(morale)}</span>
          <span className="text-[10px] text-slate-600">{moodLabel(moodScore)} ({moodScore > 0 ? '+' : ''}{moodScore.toFixed(1)})</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]">
          {[
            { label: 'Playing Time', val: components.playingTime },
            { label: 'Team Success', val: components.teamSuccess },
            { label: 'Contract', val: components.contractSatisfaction },
            { label: 'Role', val: components.roleStability },
            { label: 'Market Size', val: components.marketSize },
            { label: 'Commish Rel.', val: components.commishRelationship },
            { label: 'Family', val: components.familyTies },
            { label: 'Travel', val: components.travelComfort },
          ].map(({ label, val }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-slate-500">{label}</span>
              <span className={`font-black ${val > 0 ? 'text-emerald-400' : val < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                {val > 0 ? '+' : ''}{val.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {traits.length > 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Personality</p>
          {coreBBGMTraits.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {coreBBGMTraits.map(trait => {
                const cfg = TRAIT_CONFIG[trait];
                return (
                  <div key={trait} title={cfg.desc} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black ${cfg.bg} ${cfg.color}`}>
                    <span className="text-sm font-black">{cfg.letter}</span>
                    <span className="uppercase tracking-wider">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {dramaTraits.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dramaTraits.map(trait => {
                const cfg = TRAIT_CONFIG[trait];
                return (
                  <div key={trait} title={cfg.desc} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>
                    <span>{cfg.letter}</span>
                    <span className="uppercase tracking-wider">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Personality</p>
          <p className="text-xs text-slate-600 italic">No personality traits assigned.</p>
        </div>
      )}

      {player.status !== 'Retired' ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Contract Thoughts</p>
          {(() => {
            const isFA = player.tid === -1 || player.status === 'Free Agent';
            const isExternal = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia', 'WNBA'].includes(player.status ?? '');
            const exp = player.contract?.exp;
            if (isFA) return <p className="text-[9px] text-rose-400 mb-3">Contract Expired · Unrestricted Free Agent</p>;
            if (isExternal) return <p className="text-[9px] text-sky-400 mb-3">Plays in {player.status}</p>;
            if (!exp) return null;
            const yearsLeft = exp - currentYear;
            return yearsLeft <= 0
              ? <p className="text-[9px] text-amber-400 mb-3">Expiring · Exp. {exp - 1}–{String(exp).slice(-2)}</p>
              : <p className="text-[9px] text-slate-600 mb-3">{yearsLeft}yr left · Exp. {exp - 1}–{String(exp).slice(-2)}</p>;
          })()}
          <p className="text-sm text-slate-200 leading-relaxed italic">"{contractThoughts}"</p>

          {resign && (() => {
            const rColor = resignColor(resign.score);
            return (
              <div className="mt-5 pt-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Re-sign Probability</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black" style={{ color: rColor }}>{resign.score}</span>
                    <span className="text-[10px] text-slate-500">%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${resign.score}%`, backgroundColor: rColor }} />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold" style={{ color: rColor }}>{resignLabel(resign.score)}</span>
                </div>

                {resign.factors.length > 0 ? (
                  <div className="grid grid-cols-1 gap-y-1 text-[10px]">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-0.5">Influences</p>
                    {resign.factors.map(factor => (
                      <div key={factor.label} className="flex items-center justify-between">
                        <span className="text-slate-400">{factor.label}</span>
                        <span className={`font-black tabular-nums ${factor.delta > 0 ? 'text-emerald-400' : factor.delta < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                          {factor.delta > 0 ? '+' : ''}{factor.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600 italic">No strong factors either way — purely neutral.</p>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Career Summary</p>
          <RetiredCareerSummary player={player} traits={traits} currentYear={currentYear} />
        </div>
      )}

      {isFarewellTour && (
        <div className="bg-amber-500/8 border border-amber-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xl">🏆</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Farewell Tour</p>
              <p className="text-xs text-amber-300/70 mt-0.5">Expected final season</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {player.name.split(' ')[0]} is widely expected to hang up his sneakers at the end of this season.
            This is his farewell tour — fans, teammates, and the league are soaking in every moment.
          </p>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-amber-400/60 font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Retirement guaranteed at season end</span>
          </div>
        </div>
      )}

      {retirementRisk && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Retirement Watch</p>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: retirementRisk.color, backgroundColor: `${retirementRisk.color}18`, border: `1px solid ${retirementRisk.color}40` }}>
              {retirementRisk.label}
            </span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${retirementRisk.pct}%`, backgroundColor: retirementRisk.color }} />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Age {retirementRisk.age} — retirement probability this offseason</span>
            <span className="font-black" style={{ color: retirementRisk.color }}>{retirementRisk.pct}%</span>
          </div>
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            {retirementRisk.pct >= 70
              ? `At ${retirementRisk.age}, it's increasingly unlikely that teams continue offering contracts. This offseason could be the last.`
              : retirementRisk.pct >= 40
              ? `Age and declining production are starting to factor in. This player faces a real chance of retiring at the end of this season.`
              : `Still viable, but the window is narrowing. A strong season lowers the odds considerably.`}
          </p>
        </div>
      )}
    </div>
  );
};
