export function evaluateFilter(value: string | number, filterStr: string): boolean {
  if (!filterStr) return true;
  
  // Split by | for OR logic first
  if (filterStr.includes('|')) {
    const orFilters = filterStr.split('|').map(s => s.trim());
    return orFilters.some(f => evaluateSingleFilter(value, f));
  }
  
  // Split by & for AND logic
  if (filterStr.includes('&')) {
    const andFilters = filterStr.split('&').map(s => s.trim());
    return andFilters.every(f => evaluateSingleFilter(value, f));
  }
  
  return evaluateSingleFilter(value, filterStr);
}

function evaluateSingleFilter(value: string | number, filter: string): boolean {
  const strVal = String(value).toLowerCase();
  const numVal = Number(value);
  const isNum = !isNaN(numVal);
  
  let f = filter.trim();
  if (!f) return true;
  
  // NOT operator
  if (f.startsWith('!')) {
    return !evaluateSingleFilter(value, f.substring(1));
  }
  
  // Exact match
  if (f.startsWith('"') && f.endsWith('"')) {
    const exact = f.substring(1, f.length - 1).toLowerCase();
    return strVal === exact;
  }
  
  // Numeric comparisons
  if (f.startsWith('>=')) {
    const cmp = Number(f.substring(2));
    if (!isNaN(cmp)) return numVal >= cmp;
  } else if (f.startsWith('<=')) {
    const cmp = Number(f.substring(2));
    if (!isNaN(cmp)) return numVal <= cmp;
  } else if (f.startsWith('>')) {
    const cmp = Number(f.substring(1));
    if (!isNaN(cmp)) return numVal > cmp;
  } else if (f.startsWith('<')) {
    const cmp = Number(f.substring(1));
    if (!isNaN(cmp)) return numVal < cmp;
  } else if (f.startsWith('=')) {
    const cmp = Number(f.substring(1));
    if (!isNaN(cmp)) return numVal === cmp;
  }
  
  // Default contains
  return strVal.includes(f.toLowerCase());
}
