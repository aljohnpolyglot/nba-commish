import React from 'react';
import { DefenseGameplan } from '../../../../../../store/defenseGameplanStore';
import { COVERAGE_MATRIX_ROWS, CoverageMatrixKey, STANDARD_DROPDOWN_CLASS } from './defenseTabShared';

interface CoverageMatrixSectionProps {
  plan: DefenseGameplan;
  onUpdateField: <K extends CoverageMatrixKey>(key: K, value: DefenseGameplan[K]) => void;
}

export function CoverageMatrixSection({ plan, onUpdateField }: CoverageMatrixSectionProps) {
  return (
    <div>
      <h5 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2 mt-4">Coverage Matrix</h5>
      <div className="space-y-2">
        {COVERAGE_MATRIX_ROWS.map((row, idx) => (
          <div
            key={row.key}
            className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
              idx % 2 === 1 ? 'bg-[#1a1a1a] p-2 rounded' : 'p-2'
            }`}
          >
            <span className="text-xs md:text-sm font-bold">{row.label}</span>
            <select
              className={`${STANDARD_DROPDOWN_CLASS} w-full sm:w-1/2`}
              value={plan[row.key]}
              onChange={e => onUpdateField(row.key, e.target.value as DefenseGameplan[typeof row.key])}
            >
              {row.options.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
