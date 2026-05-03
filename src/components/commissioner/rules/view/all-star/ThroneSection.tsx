import React from 'react';
import { Crown } from 'lucide-react';

interface ThroneSectionProps {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  fieldSize: number;
  setFieldSize: (v: number) => void;
  firstPossession: 'shootout' | 'higher_seed_choice';
  setFirstPossession: (v: 'shootout' | 'higher_seed_choice') => void;
  scoring: '2s_and_3s' | '1s_and_2s';
  setScoring: (v: '2s_and_3s' | '1s_and_2s') => void;
  shotClock: number;
  setShotClock: (v: number) => void;
  targetScore: number;
  setTargetScore: (v: number) => void;
  hardCap: number;
  setHardCap: (v: number) => void;
  prizePool: number;
  setPrizePool: (v: number) => void;
  mandatoryDefense: boolean;
  setMandatoryDefense: (v: boolean) => void;
}

const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; sub?: string }> = ({ label, value, onChange, sub }) => (
  <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800/50">
    <div>
      <p className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">{label}</p>
      {sub && <p className="text-[9px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
    <button
      onClick={() => onChange(!value)}
      className={`w-8 h-4 rounded-full transition-all duration-200 relative shrink-0 ${value ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30' : 'bg-slate-700'}`}
    >
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${value ? 'left-4.5' : 'left-0.5'}`} />
    </button>
  </div>
);

const NumInput: React.FC<{ label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; sub?: string }> = ({ label, value, onChange, min = 1, max = 999, sub }) => (
  <div className="flex items-center justify-between pl-4 border-l border-slate-800">
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[9px] text-slate-600">{sub}</p>}
    </div>
    <input
      type="number"
      value={value}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      className="w-20 bg-slate-950 border border-slate-700 rounded-lg text-center text-white font-mono text-[10px] py-1 focus:outline-none focus:border-yellow-500"
      min={min}
      max={max}
    />
  </div>
);

const Select: React.FC<{ label: string; value: string; onChange: (v: any) => void; options: Array<{ value: string; label: string }> }> = ({ label, value, onChange, options }) => (
  <div className="flex items-center justify-between pl-4 border-l border-slate-800">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-slate-950 border border-slate-700 rounded-lg text-white text-[10px] py-1 px-2 focus:outline-none focus:border-yellow-500"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

export const ThroneSection: React.FC<ThroneSectionProps> = (props) => {
  return (
    <div className="bg-gradient-to-br from-yellow-500/5 via-amber-900/5 to-slate-800/40 p-6 rounded-3xl border border-yellow-500/20 space-y-6">
      <div className="flex items-center gap-2">
        <Crown size={16} className="text-yellow-400" />
        <h2 className="text-lg font-black text-white uppercase tracking-tight">The Throne · 1v1 Tournament</h2>
        <span className="text-[8px] font-black bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full tracking-widest">PREMIUM</span>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        A single-evening, 16-player single-elimination 1v1 tournament. Composite vote (40% fan / 30% player / 20% media / 10% coach) selects the field. When enabled, this <strong>replaces</strong> the standard 1v1 Tournament event on Saturday.
      </p>

      <Toggle
        label="Enable The Throne"
        value={props.enabled}
        onChange={props.setEnabled}
        sub="Replaces the standard 1v1 tournament when on"
      />

      {props.enabled && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <h3 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest pl-2">Tournament Settings</h3>
          <Select
            label="First Possession"
            value={props.firstPossession}
            onChange={props.setFirstPossession}
            options={[
              { value: 'shootout', label: 'FT Shootout' },
              { value: 'higher_seed_choice', label: 'Higher Seed Choice' },
            ]}
          />
          <Select
            label="Scoring"
            value={props.scoring}
            onChange={props.setScoring}
            options={[
              { value: '2s_and_3s', label: '2s and 3s (NBA)' },
              { value: '1s_and_2s', label: '1s and 2s (Streetball)' },
            ]}
          />
          <NumInput label="Field Size" value={props.fieldSize} onChange={props.setFieldSize} min={8} max={16} />
          <NumInput label="Target Score" value={props.targetScore} onChange={props.setTargetScore} min={5} max={30} />
          <NumInput label="Hard Cap" value={props.hardCap} onChange={props.setHardCap} min={5} max={50} />
          <NumInput label="Shot Clock (sec)" value={props.shotClock} onChange={props.setShotClock} min={5} max={12} />
          <NumInput
            label="Prize Pool ($)"
            value={props.prizePool}
            onChange={props.setPrizePool}
            min={100_000}
            max={50_000_000}
            sub="Drives sign-up motivation — higher = more stars opt in"
          />

          <div className="pt-2">
            <h3 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest pl-2 mb-3">Storyline Hooks</h3>
            <Toggle
              label="Mandatory Title Defense"
              value={props.mandatoryDefense}
              onChange={props.setMandatoryDefense}
              sub="Defending king is auto-seeded #1 every year — must defend the throne or lose it"
            />
          </div>
        </div>
      )}
    </div>
  );
};
