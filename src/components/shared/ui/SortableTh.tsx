import React from 'react';

interface SortableThProps {
  field: string;
  label: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

/**
 * Reusable sortable table header cell.
 * Shows ↓/↑ indicator when this column is the active sort.
 *
 * Usage:
 *   <SortableTh field="pts" label="PTS" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
 */
export const SortableTh: React.FC<SortableThProps> = ({
  field, label, sortField, sortDir, onSort, align = 'left', className = ''
}) => {
  const isActive = sortField === field;
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';
  return (
    <th
      className={`px-3 py-3 font-semibold select-none cursor-pointer hover:text-white transition-colors ${alignClass} ${isActive ? 'text-indigo-400' : ''} ${className}`}
      onClick={() => onSort(field)}
    >
      {label}{isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
};
