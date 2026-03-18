import React, { useState } from 'react';
import { Trophy, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Rule } from '../../../types';
import { AwardModal } from '../AwardModal';

interface LeagueAwardsListProps {
  localAwards: Rule[];
  onRemoveAward: (id: string) => void;
  onAddAward: (name: string, criteria: string) => Promise<void>;
  isGeneratingAward: boolean;
}

export const LeagueAwardsList: React.FC<LeagueAwardsListProps> = ({
  localAwards,
  onRemoveAward,
  onAddAward,
  isGeneratingAward
}) => {
  const [expandedAward, setExpandedAward] = useState<string | null>(null);
  const [awardModalOpen, setAwardModalOpen] = useState(false);

  return (
    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[2.5rem] backdrop-blur-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400">
            <Trophy size={24} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-white tracking-tight">League Honors & MVP</h3>
            <p className="text-sm text-slate-500 font-medium">Customize the trophies and honors of the NBA</p>
          </div>
        </div>
        <button 
          onClick={() => setAwardModalOpen(true)}
          className="p-3 rounded-2xl bg-amber-600 text-white hover:bg-amber-500 transition-all duration-200 shadow-lg shadow-amber-500/20"
          title="Add New Award"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="space-y-3">
        {localAwards.map((award, index) => (
          <div key={award.id} className="flex flex-col p-4 bg-slate-800/40 border border-slate-800/50 rounded-2xl group hover:border-amber-500/30 transition-all duration-200 cursor-pointer" onClick={() => setExpandedAward(expandedAward === award.id ? null : award.id)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-amber-500/50 font-mono text-xs font-bold">
                  {index + 1}
                </div>
                <span className="text-slate-200 font-medium">{award.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {expandedAward === award.id ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                <button 
                  onClick={(e) => { e.stopPropagation(); onRemoveAward(award.id); }}
                  className="p-2 rounded-xl text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {expandedAward === award.id && (
              <div className="mt-4 pl-12 pr-4 pb-2 text-sm text-slate-400 leading-relaxed">
                {award.description}
              </div>
            )}
          </div>
        ))}
        
        {localAwards.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded-2xl">
            <p className="text-slate-600 font-medium">No custom honors created yet.</p>
          </div>
        )}
      </div>

      {awardModalOpen && (
        <AwardModal 
          onClose={() => setAwardModalOpen(false)}
          onAdd={onAddAward}
          isGenerating={isGeneratingAward}
        />
      )}
    </div>
  );
};
