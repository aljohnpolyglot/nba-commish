import React from 'react';
import { Info } from 'lucide-react';
import { RULE_DEFINITIONS } from '../../../../constants/ruleDefinitions';

interface RuleToggleProps {
    id: string;
    value: boolean;
    onChange: (v: boolean) => void;
}

export const RuleToggle: React.FC<RuleToggleProps> = ({ id, value, onChange }) => {
    const def = RULE_DEFINITIONS[id];
    const [showTooltip, setShowTooltip] = React.useState(false);
    if (!def) return null;
    return (
        <div className="flex items-center justify-between group">
            <div className="flex flex-col">
                <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{def.label}</span>
                    <div className="relative group/info">
                        <button onClick={() => setShowTooltip(!showTooltip)} className="focus:outline-none">
                            <Info size={10} className="text-slate-600 cursor-pointer" />
                        </button>
                        <div className={`absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-400 ${showTooltip ? 'opacity-100' : 'opacity-0'} group-hover/info:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl`}>
                            {def.description}
                        </div>
                    </div>
                </div>
            </div>
            <button 
                onClick={() => onChange(!value)} 
                className={`w-8 h-4 rounded-full transition-all duration-200 relative ${value ? 'bg-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700'}`}
            >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ${value ? 'left-4.5' : 'left-0.5'}`} />
            </button>
        </div>
    );
};

interface RuleInputProps {
    id: string;
    value: number;
    onChange: (v: number) => void;
}

export const RuleInput: React.FC<RuleInputProps> = ({ id, value, onChange }) => {
    const def = RULE_DEFINITIONS[id];
    const [showTooltip, setShowTooltip] = React.useState(false);
    if (!def) return null;
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            onChange(0);
        } else {
            onChange(Number(val));
        }
    };

    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{def.label}</span>
                <div className="relative group/info">
                    <button onClick={() => setShowTooltip(!showTooltip)} className="focus:outline-none">
                        <Info size={10} className="text-slate-600 cursor-pointer" />
                    </button>
                    <div className={`absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-400 ${showTooltip ? 'opacity-100' : 'opacity-0'} group-hover/info:opacity-100 pointer-events-none transition-opacity z-50 shadow-2xl`}>
                        {def.description}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <input 
                    type="number" 
                    value={value || ''} 
                    onChange={handleInputChange} 
                    className="w-12 bg-slate-950 border border-slate-700 rounded-lg text-center text-white font-mono text-[10px] py-1 focus:outline-none focus:border-indigo-500 transition-colors" 
                    min={def.min} 
                    max={def.max} 
                />
                {def.unit && <span className="text-[9px] text-slate-600 font-black">{def.unit}</span>}
            </div>
        </div>
    );
};
