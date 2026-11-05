import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, Ruler, ShieldAlert, ShieldCheck, Sparkles, Target, X, Zap } from 'lucide-react';
import type { GameState } from '../../types';
import type { EuroScoutedProspect } from '../../services/euroScouting/types';
import { EURO_COUNTRY_BY_ID } from '../../services/euroScouting/countryProfiles';
import { getEuroYouthEvaluatorFuzzBand, getEuroYouthReportRatings } from '../../services/euroScouting/prospectRatings';
import { generateStructuredScoutingReport, getTendencies, inferArchetype } from '../../services/scoutingReport';
import { formatHeight } from '../../utils/helpers';
import { normalizePositionLabel } from '../../utils/positionUtils';
import { CountryFlag } from '../shared/CountryFlag';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { RatingBadge } from '../transferMarket/EuroTransferMarketShared';
import { ClassPercentileSkillProfile } from '../scouting/ClassPercentileSkillProfile';
import { fuzzPercentileValueWithBand } from '../../utils/scoutingFuzz';

export const ProspectDetailModal: React.FC<{
  state: GameState;
  player: EuroScoutedProspect;
  classProspects: EuroScoutedProspect[];
  scoutRating: number;
  assigned: boolean;
  onAssign: () => void;
  onClose: () => void;
}> = ({ state, player, classProspects, scoutRating, assigned, onAssign, onClose }) => {
  const [tab, setTab] = useState<'overview' | 'scouting' | 'skill'>('overview');
  const year = state.leagueStats.year;
  const { overall: ovr, potential: pot } = getEuroYouthReportRatings(state, player, year, scoutRating);
  const rating = player.ratings[player.ratings.length - 1] ?? {};
  const country = EURO_COUNTRY_BY_ID.get(player.scoutingCountryId);
  const position = normalizePositionLabel(player.pos, player.hgt);
  const scouting = useMemo(() => ({
    archetype: inferArchetype(player),
    report: generateStructuredScoutingReport(player, 'nba', { youth: true, scoutRating }),
    tendencies: getTendencies(player),
  }), [player, scoutRating]);
  const traits = [
    { icon: Ruler, label: 'Build', value: player.hgt ? formatHeight(player.hgt) : '—' },
    { icon: Activity, label: 'Athletic Base', value: Number(rating.spd ?? 50) + Number(rating.jmp ?? 50) >= 120 ? 'Explosive' : 'Developing' },
    { icon: ShieldCheck, label: 'Position', value: position },
    { icon: Sparkles, label: 'Age', value: String(player.age ?? '—') },
  ];
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/90 sm:items-center sm:p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[96vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-3xl">
        <div className="relative border-b border-slate-800 bg-gradient-to-br from-blue-600/20 via-slate-900 to-emerald-500/10 p-5">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-slate-950/50 p-2 text-slate-400 hover:text-white"><X size={18} /></button>
          <div className="flex items-center gap-4 pr-10">
            <PlayerPortrait imgUrl={player.imgURL} face={player.face} playerName={player.name} size={76} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300"><CountryFlag country={country?.name ?? player.scoutingCountryName} iso2={country?.iso2} className="inline-flex h-3.5 w-5 rounded-sm" />{player.scoutingCountryName}</p>
              <h2 className="mt-1 truncate text-2xl font-black text-white">{player.name}</h2>
              <p className="text-sm text-slate-400">{position} · Age {player.age}{scouting.archetype ? ` · ${scouting.archetype} projection` : ''}</p>
              <div className="mt-3 flex gap-2"><RatingBadge label="OVR" value={ovr} /><RatingBadge label="POT" value={pot} /></div>
            </div>
          </div>
        </div>
        <div className="border-b border-slate-800 p-3">
          <div className="flex rounded-xl border border-slate-700 bg-slate-950/40 p-1">
            {(['overview', 'scouting', 'skill'] as const).map(value => <button key={value} type="button" onClick={() => setTab(value)} className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider ${tab === value ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>{value === 'overview' ? 'Overview' : value === 'scouting' ? 'Scouting Notes' : 'Skill Profile'}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' ? <div className="grid grid-cols-2 gap-3">
            {traits.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                <Icon size={16} className="text-emerald-400" />
                <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-bold text-white">{value}</p>
              </div>
            ))}
          </div> : tab === 'scouting' ? <div className="space-y-5">
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400"><Zap size={13} /> Strengths</h3>
              <ul className="space-y-2">{scouting.report.strengths.length > 0 ? scouting.report.strengths.map(item => <li key={item} className="flex gap-2 text-sm leading-relaxed text-slate-200"><span className="text-emerald-500">✓</span><span>{item}</span></li>) : <li className="text-sm italic text-slate-500">No standout strength is clear yet.</li>}</ul>
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-rose-400"><ShieldAlert size={13} /> Concerns</h3>
              <ul className="space-y-2">{scouting.report.weaknesses.length > 0 ? scouting.report.weaknesses.map(item => <li key={item} className="flex gap-2 text-sm leading-relaxed text-slate-200"><span className="text-rose-500">×</span><span>{item}</span></li>) : <li className="text-sm italic text-slate-500">No major concern is clear yet.</li>}</ul>
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-300"><Target size={13} /> Projected Fit</h3>
              <p className="text-sm leading-relaxed text-slate-300">{scouting.tendencies.bestFit}</p>
            </section>
          </div> : <ClassPercentileSkillProfile
            player={player}
            classProspects={classProspects}
            cohortLabel="World Scouting"
            fuzzPercentile={(value, salt) => fuzzPercentileValueWithBand(
              value,
              state,
              player,
              salt,
              getEuroYouthEvaluatorFuzzBand(scoutRating),
            )}
          />}
        </div>
        <div className="border-t border-slate-800 p-4">
          <button disabled={assigned} onClick={onAssign} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500">
            {assigned ? 'Already in Academy' : 'Assign to Youth Academy'} {!assigned && <ArrowRight size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
};
