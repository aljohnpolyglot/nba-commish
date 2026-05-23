import React from 'react';
import { DefenseGameplan, DefenseTemplate } from '../../../../../../store/defenseGameplanStore';
import { DefenseTemplateCard, FamiliarityTone } from './defenseTabShared';

interface DefenseIdentitySectionProps {
  defFamiliarity: number;
  famTone: FamiliarityTone;
  plan: DefenseGameplan;
  identityCard: DefenseTemplateCard | null;
  templateCards: DefenseTemplateCard[];
  currentSummary: string[];
  onSelectTemplate: (template: Exclude<DefenseTemplate, 'Custom'>) => void;
}

export function DefenseIdentitySection({
  defFamiliarity,
  famTone,
  plan,
  identityCard,
  templateCards,
  currentSummary,
  onSelectTemplate,
}: DefenseIdentitySectionProps) {
  return (
    <>
      <div className="bg-[#1a1a1a] border border-gray-800 rounded p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wider">Defensive System Familiarity</span>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${famTone.pill}`}>{famTone.label}</span>
            <span className={`text-sm md:text-base font-black tabular-nums ${famTone.text}`}>{defFamiliarity}<span className="text-[10px] text-gray-500"> / 100</span></span>
          </div>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${famTone.bar} transition-all`}
            style={{ width: `${Math.max(0, Math.min(100, defFamiliarity))}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 italic">
          Trained in the Training Center via the Defense system practice picker. Higher familiarity scales scheme effectiveness in-game.
        </p>
      </div>

      <div className="space-y-3">
        <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase">Defensive Identity</h5>
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-3">
          <div className="bg-[#1a1a1a] border border-cyan-900/30 rounded p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.24em] text-cyan-400">
                  {plan.template === 'Custom' ? 'Custom Shell' : 'Active Identity'}
                </div>
                <h6 className="text-lg font-black text-white uppercase tracking-tight mt-1">
                  {plan.template === 'Custom' ? 'Hand-Tuned Coverage Matrix' : identityCard?.name}
                </h6>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
                  {plan.template === 'Custom'
                    ? 'This team is no longer living inside a stock template. The matrix below is your actual system.'
                    : identityCard?.meta.tagline}
                </p>
              </div>
              <div className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${famTone.pill}`}>
                Team {famTone.label}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="rounded border border-gray-800 bg-[#111] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Roster Fit</div>
                <div className="text-[11px] text-slate-300 mt-1">
                  {plan.template === 'Custom' ? 'User-defined shell.' : identityCard?.meta.bestFor}
                </div>
              </div>
              <div className="rounded border border-gray-800 bg-[#111] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">What You Get</div>
                <div className="text-[11px] text-slate-300 mt-1">
                  {plan.template === 'Custom'
                    ? currentSummary.join(' • ')
                    : identityCard?.meta.strengths.join(' • ')}
                </div>
              </div>
              <div className="rounded border border-gray-800 bg-[#111] p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">What You Give Up</div>
                <div className="text-[11px] text-slate-300 mt-1">
                  {plan.template === 'Custom'
                    ? 'Custom looks need manual upkeep in defender detail and matchup assignments.'
                    : identityCard?.meta.risk}
                </div>
              </div>
            </div>

            {plan.template !== 'Custom' && identityCard?.systemDetails && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="rounded border border-emerald-900/30 bg-emerald-950/20 p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1.5">Why It Fits</div>
                  <div className="space-y-1">
                    {identityCard.systemDetails.pos.slice(0, 2).map(item => (
                      <div key={item} className="text-[11px] text-slate-300">• {item}</div>
                    ))}
                  </div>
                </div>
                <div className="rounded border border-rose-900/30 bg-rose-950/20 p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-rose-400 mb-1.5">Primary Risks</div>
                  <div className="space-y-1">
                    {identityCard.systemDetails.neg.slice(0, 2).map(item => (
                      <div key={item} className="text-[11px] text-slate-300">• {item}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#1a1a1a] border border-gray-800 rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-black uppercase tracking-[0.24em] text-gray-400">Scheme Library</div>
              {plan.template === 'Custom' && (
                <div className="text-[9px] text-amber-400 italic">Custom from template baseline</div>
              )}
            </div>
            <div className="space-y-2">
              {templateCards.map(card => (
                <button
                  key={card.name}
                  onClick={() => onSelectTemplate(card.name)}
                  className={`w-full text-left rounded border p-3 transition-all ${
                    card.active
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : 'border-gray-800 bg-[#111] hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className={`text-xs font-black uppercase ${card.active ? 'text-yellow-400' : 'text-white'}`}>{card.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{card.meta.tagline}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-full border ${card.tone.pill}`}>{card.tone.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 tabular-nums">{card.familiarity}%</div>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div className={`h-full ${card.tone.bar}`} style={{ width: `${card.familiarity}%` }} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 mt-2 items-start">
                    <div className="text-[10px] text-slate-400">
                      {card.meta.strengths[0]} • {card.meta.strengths[1]}
                    </div>
                    <div className={`text-[9px] font-bold uppercase tracking-[0.16em] ${
                      card.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {card.delta >= 0 ? `+${card.delta}` : card.delta} vs team
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Risk: {card.meta.risk}</div>
                  {card.familiarity < 25 && (
                    <div className="text-[9px] text-rose-400 mt-1 font-bold uppercase tracking-widest">
                      Cold call — drill in Training Center
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
