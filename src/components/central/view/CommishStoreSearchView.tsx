import React from 'react';
import { ChevronDown, Filter, Search, Trophy, X } from 'lucide-react';
import { FilterGroup, Product } from './commishStoreassets';
import { ProductCard, ProductSkeleton } from './CommishStoreCards';

export function CommishStoreSearchView({
  currentFilters,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  productType,
  setProductType,
  teamFilter,
  setTeamFilter,
  executeSearch,
  searchQuery,
  dynamicFilters,
  handleFilterChange,
  nbaTeams,
  searchResults,
  isSearching,
  currentPage,
  handlePageChange,
  goHome,
  onProductSelect,
}: {
  currentFilters: Record<string, string>;
  minPrice: string;
  setMinPrice: React.Dispatch<React.SetStateAction<string>>;
  maxPrice: string;
  setMaxPrice: React.Dispatch<React.SetStateAction<string>>;
  productType: string;
  setProductType: React.Dispatch<React.SetStateAction<string>>;
  teamFilter: string;
  setTeamFilter: React.Dispatch<React.SetStateAction<string>>;
  executeSearch: (query: string, filters?: Record<string, string>, page?: number, forceMasterOnly?: boolean, overrides?: { productType?: string; teamFilter?: string; minPrice?: string; maxPrice?: string }) => void;
  searchQuery: string;
  dynamicFilters: FilterGroup[];
  handleFilterChange: (param: string, value: string) => void;
  nbaTeams: Array<{ id: number; name: string }>;
  searchResults: Product[];
  isSearching: boolean;
  currentPage: number;
  handlePageChange: (newPage: number) => void;
  goHome: () => void;
  onProductSelect: (product: Product) => void;
}) {
  const clearAll = () => {
    setMinPrice('');
    setMaxPrice('');
    setProductType('');
    setTeamFilter('');
    executeSearch(searchQuery, {}, 1, false, { productType: '', teamFilter: '', minPrice: '', maxPrice: '' });
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-[280px] flex-shrink-0 space-y-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200 sticky top-24 shadow-lg overflow-y-auto max-h-[calc(100vh-7rem)]">
          <div className="flex items-center justify-between gap-2 text-nba-blue font-black uppercase tracking-widest text-sm mb-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><Filter size={16} /> FILTERS</div>
            {(Object.keys(currentFilters).length > 0 || minPrice || maxPrice || productType || teamFilter) && <button onClick={clearAll} className="text-[10px] text-nba-red hover:underline">CLEAR ALL</button>}
          </div>

          <div className="space-y-4 mb-8">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Price Range ($)</h3>
            <div className="flex gap-2">
              <input type="number" placeholder="Min" className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none focus:border-nba-blue transition-colors" value={minPrice} onChange={e => setMinPrice(e.target.value)} onBlur={e => executeSearch(searchQuery, currentFilters, 1, false, { minPrice: e.target.value })} onKeyDown={e => e.key === 'Enter' && executeSearch(searchQuery, currentFilters, 1, false, { minPrice: (e.target as HTMLInputElement).value })} />
              <input type="number" placeholder="Max" className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none focus:border-nba-blue transition-colors" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} onBlur={e => executeSearch(searchQuery, currentFilters, 1, false, { maxPrice: e.target.value })} onKeyDown={e => e.key === 'Enter' && executeSearch(searchQuery, currentFilters, 1, false, { maxPrice: (e.target as HTMLInputElement).value })} />
            </div>
          </div>

          <div className="space-y-6 mb-8">
            <CommishStoreSelect label="Product" value={productType} options={[{ value: '', label: 'All Products' }, ...['Accessories', 'Collectibles', 'Footwear', 'Hardwood Classics', 'Hats', 'Hoodies', 'Jerseys', 'Shorts', 'T-Shirts'].map(value => ({ value, label: value }))]} onChange={value => { setProductType(value); executeSearch(searchQuery, currentFilters, 1, false, { productType: value }); }} />
            <CommishStoreSelect label="Team" value={teamFilter} options={[{ value: '', label: 'All Teams' }, ...nbaTeams.map(team => ({ value: team.name, label: team.name }))]} onChange={value => { setTeamFilter(value); executeSearch(searchQuery, currentFilters, 1, false, { teamFilter: value }); }} />
          </div>

          <div className="space-y-6">
            {dynamicFilters.map(group => (
              <CommishStoreSelect key={group.paramName} label={group.title} value={currentFilters[group.paramName] || ''} options={[{ value: '', label: `All ${group.title}` }, ...group.options.map((opt, i) => ({ value: opt.value, label: opt.label, key: `${group.paramName}-${i}` }))]} onChange={value => handleFilterChange(group.paramName, value)} />
            ))}
          </div>

          {Object.keys(currentFilters).length > 0 && <button onClick={() => { executeSearch(searchQuery, {}); }} className="w-full mt-8 py-2 text-xs font-bold text-nba-red hover:text-white hover:bg-nba-red rounded transition-all border border-nba-red/30">RESET ALL FILTERS</button>}
        </div>
      </aside>

      <div className="flex-grow space-y-6">
        <div className="flex justify-between items-center border-b pb-4">
          <h2 className="text-2xl font-black uppercase tracking-tight text-gray-800">{searchQuery}</h2>
          <button onClick={goHome} className="text-sm font-bold text-gray-500 hover:text-nba-red flex items-center gap-1"><X size={16} /> CLOSE</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
          {isSearching ? Array.from({ length: 10 }).map((_, idx) => <ProductSkeleton key={idx} />) : searchResults.map((product, idx) => <ProductCard key={idx} product={product} onClick={() => onProductSelect(product)} />)}
        </div>

        {searchResults.length > 0 && (
          <div className="flex justify-center items-center gap-4 py-8 border-t">
            <button disabled={currentPage === 1 || isSearching} onClick={() => handlePageChange(currentPage - 1)} className="px-6 py-2 bg-white border border-gray-200 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors">PREVIOUS</button>
            <span className="font-mono font-bold text-nba-blue">PAGE {currentPage}</span>
            <button disabled={isSearching || searchResults.length < 10} onClick={() => handlePageChange(currentPage + 1)} className="px-6 py-2 bg-nba-dark text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-black transition-colors">NEXT PAGE</button>
          </div>
        )}

        {!isSearching && searchResults.length === 0 && (
          <div className="text-center py-20">
            <Trophy size={64} className="mx-auto text-gray-300 mb-4" />
            <h3 className="text-xl font-bold text-gray-400">No assets found in this sector.</h3>
          </div>
        )}
      </div>
    </div>
  );
}

function CommishStoreSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; key?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</h3>
      <div className="relative">
        <select className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none appearance-none cursor-pointer focus:border-nba-blue transition-colors" value={value} onChange={e => onChange(e.target.value)}>
          {options.map((option, i) => <option key={option.key ?? `${option.value}-${i}`} value={option.value} className="bg-white text-gray-800">{option.label}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}
