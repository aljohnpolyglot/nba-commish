import React from 'react';
import { K2_CATS, type K2Data } from '../../services/simulation/convert2kAttributes';
import { K2_CAT_COLORS, getRatingColor } from './PlayerRatingsModalShared';

interface PlayerRatingsEditorProps {
  k2: K2Data;
  onDetailChange: (category: string, index: number, value: number) => void;
}

export const PlayerRatingsEditor: React.FC<PlayerRatingsEditorProps> = ({
  k2,
  onDetailChange,
}) => (
  <div className="space-y-3">
    <div className="space-y-4">
        {K2_CATS.map(category => {
          const color = K2_CAT_COLORS[category.k];
          return (
            <div key={category.k}>
              <p className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color }}>
                {category.n}
              </p>
              <div className="space-y-1.5">
                {category.sub.map((name, index) => {
                  const value = Number.isFinite(k2[category.k].sub[index])
                    ? k2[category.k].sub[index]
                    : 50;
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-300 w-28 flex-shrink-0 truncate">
                        {name}
                      </span>
                      <input
                        type="range"
                        min={category.k === 'MI' ? 0 : 25}
                        max={99}
                        value={value}
                        onChange={event => onDetailChange(category.k, index, Number(event.target.value))}
                        className="flex-1 h-1.5"
                        style={{ accentColor: color }}
                      />
                      <span
                        className="text-[10px] font-black w-7 text-right tabular-nums"
                        style={{ color: getRatingColor(value) }}
                      >
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  </div>
);
