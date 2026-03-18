import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Plus, RotateCcw, Save } from 'lucide-react';
import { Rule } from '../../../types';

interface ActiveRulesListProps {
  localRules: Rule[];
  onRemoveRule: (id: string) => void;
  onAddRule: (ruleText: string) => Promise<void>;
  onReset: () => void;
  onSave: () => void;
  isSaving: boolean;
  isGenerating: boolean;
}

export const ActiveRulesList: React.FC<ActiveRulesListProps> = ({
  localRules,
  onRemoveRule,
  onAddRule,
  onReset,
  onSave,
  isSaving,
  isGenerating
}) => {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');

  const handleAddClick = async () => {
    if (newRule.trim()) {
      await onAddRule(newRule.trim());
      setNewRule('');
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex flex-col">
          <h3 className="text-xl font-bold text-white tracking-tight">Active League Rules</h3>
          <p className="text-sm text-slate-500 font-medium">Modify the fundamental laws of the NBA</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onReset}
            className="p-3 rounded-2xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all duration-200"
            title="Reset Changes"
          >
            <RotateCcw size={18} />
          </button>
          <button 
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-all duration-200 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving ? 'Updating...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {localRules.map((rule, index) => (
          <div key={rule.id} className="flex flex-col p-4 bg-slate-800/40 border border-slate-800/50 rounded-2xl group hover:border-indigo-500/30 transition-all duration-200 cursor-pointer" onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-slate-500 font-mono text-xs font-bold">
                  {index + 1}
                </div>
                <span className="text-slate-200 font-medium">{rule.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {expandedRule === rule.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveRule(rule.id); }}
                  className="p-2 rounded-xl text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {expandedRule === rule.id && (
              <div className="mt-4 pl-12 pr-4 pb-2 text-sm text-slate-400 leading-relaxed">
                {rule.description}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 p-2 bg-slate-900 rounded-2xl border border-slate-800">
        <input 
          type="text" 
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
          placeholder="Propose a new rule (e.g., '4-Point Line', 'No Backcourt Violations')..."
          className="flex-1 bg-transparent border-none focus:ring-0 text-slate-200 px-4 py-2 text-sm font-medium placeholder:text-slate-600"
          disabled={isGenerating}
        />
        <button 
          onClick={handleAddClick}
          disabled={isGenerating || !newRule.trim()}
          className="p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 transition-all duration-200"
        >
          {isGenerating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus size={20} />}
        </button>
      </div>
    </div>
  );
};
