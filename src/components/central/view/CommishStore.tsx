import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Product, FilterGroup, FilterOption, TOP_PICKS } from './commishStoreassets';
import { useGame } from '../../../store/GameContext';
import { AssetActionModal } from '../../modals/AssetActionModal';
import { CommishStoreNav } from './CommishStoreNav';
import { CommishStoreHomeView } from './CommishStoreHomeView';
import { CommishStoreInventoryView } from './CommishStoreInventoryView';
import { CommishStoreSearchView } from './CommishStoreSearchView';
import { CommishStorePurchaseModal } from './CommishStorePurchaseModal';

const WORKER_URL = 'https://amazonfetcher.mogatas-princealjohn-05082003.workers.dev/?q=';

export default function CommishStore() {
  const { state, dispatchAction } = useGame();
  const personalWealth = state.stats.personalWealth;
  const isFictional = state.leagueType === 'fictional';
  const [view, setView] = useState<'home' | 'search' | 'inventory'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Product | null>(null);
  const [topPicks, setTopPicks] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [productType, setProductType] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const assets = (state.commishStoreInventory ?? []) as { product: Product; quantity: number; date: string }[];
  const setAssets = (updater: typeof assets | ((prev: typeof assets) => typeof assets)) => {
    const next = typeof updater === 'function' ? updater(assets) : updater;
    dispatchAction({ type: 'COMMISH_STORE_INVENTORY_UPDATE', payload: { inventory: next } });
  };
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [selectedAssetForAction, setSelectedAssetForAction] = useState<{ product: Product; quantity: number; date: string } | null>(null);
  const masterDbRef = useRef<any[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<Record<string, string>>({});
  const [dynamicFilters, setDynamicFilters] = useState<FilterGroup[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const nbaTeams = state.teams.filter(team => team.id >= 0);
  const westTeams = nbaTeams.filter(team => team.conference === 'West');
  const eastTeams = nbaTeams.filter(team => team.conference === 'East');

  useEffect(() => {
    loadMasterDatabase();
  }, []);

  useEffect(() => {
    if (view === 'home' && isDbLoaded) setTopPicks(prev => [...prev].sort(() => Math.random() - 0.5));
  }, [view, isDbLoaded]);

  const loadMasterDatabase = async () => {
    try {
      const res = await fetch('https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbastore_master_database.json');
      const data = await res.json();
      masterDbRef.current = data;
      setIsDbLoaded(true);
      setTopPicks(
        [...data]
          .sort(() => Math.random() - 0.5)
          .slice(0, 12)
          .map((item: any) => ({ title: item.title, price: item.price, image: item.img, isStatic: true, link: item.link, category: item.category })),
      );
    } catch {
      setTopPicks(TOP_PICKS.map(product => ({ ...product, isStatic: true })));
    }
  };

  const getFeaturedMasterItems = () => {
    if (!masterDbRef.current.length) return [];
    const categories = ['Accessories', 'Collectibles', 'Footwear', 'Hardwood Classics', 'Hats', 'Hoodies', 'Jerseys', 'Shorts', 'T-Shirts'];
    const featured: any[] = [];
    [...categories].sort(() => Math.random() - 0.5).forEach(category => {
      const items = masterDbRef.current.filter((item: any) => item.category === category);
      featured.push(...[...items].sort(() => Math.random() - 0.5).slice(0, 3));
    });
    return featured.map((item: any) => ({ title: item.title, price: item.price, image: item.img, isStatic: true, link: item.link, category: item.category }));
  };

  const fetchWithRetry = async (url: string, retries = 2, delay = 1500): Promise<Response> => {
    try {
      const res = await fetch(url);
      if (!res.ok && retries > 0) throw new Error('Fetch failed');
      return res;
    } catch (err) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, retries - 1, delay);
      }
      throw err;
    }
  };

  const executeSearch = async (
    query: string,
    filters: Record<string, string> = {},
    page: number = 1,
    forceMasterOnly: boolean = false,
    overrides?: { productType?: string; teamFilter?: string; minPrice?: string; maxPrice?: string },
  ) => {
    const activeProductType = overrides?.productType !== undefined ? overrides.productType : productType;
    const activeTeamFilter = overrides?.teamFilter !== undefined ? overrides.teamFilter : teamFilter;
    const activeMinPrice = overrides?.minPrice !== undefined ? overrides.minPrice : minPrice;
    const activeMaxPrice = overrides?.maxPrice !== undefined ? overrides.maxPrice : maxPrice;

    if (!query && !activeProductType && !activeTeamFilter && !activeMinPrice && !activeMaxPrice) {
      setView('search');
      setIsSearching(false);
      setSearchResults(getFeaturedMasterItems());
      return;
    }

    setView('search');
    setSearchQuery(query);
    setIsSearching(true);
    setCurrentPage(page);

    const normalize = (str: string) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const queryLower = query.toLowerCase();
    const queryNorm = normalize(query);
    const queryWords = queryNorm.split(' ').filter(word => word.length > 2);

    const masterMatches = masterDbRef.current
      .filter((item: any) => {
        const title = item.title.toLowerCase();
        const titleNorm = normalize(item.title);
        const category = item.category.toLowerCase();
        const priceVal = parseFloat(item.price.replace(/[^0-9.]/g, ''));
        if (activeMinPrice !== '' && !isNaN(priceVal) && priceVal < parseFloat(activeMinPrice)) return false;
        if (activeMaxPrice !== '' && !isNaN(priceVal) && priceVal > parseFloat(activeMaxPrice)) return false;
        const CATEGORY_MAP: Record<string, string> = { 'T-Shirts': 'Tshirts', 'Hardwood Classics': 'Hardwoodclassics', Accessories: 'Accesories', Outerwear: 'Hoodies' };
        if (activeProductType) {
          const expectedCat = CATEGORY_MAP[activeProductType] || activeProductType;
          if (item.category !== expectedCat) return false;
        }
        if (activeTeamFilter && !item.title.toLowerCase().includes(activeTeamFilter.toLowerCase())) return false;
        if (!query) return true;
        if (titleNorm.includes(queryNorm) || category.includes(queryLower) || category === queryLower) return true;
        return queryWords.length > 0 && queryWords.every(word => titleNorm.includes(word) || category.includes(word));
      })
      .map((item: any) => ({ title: item.title, price: item.price, image: item.img, isStatic: true, link: item.link, category: item.category }));

    const finalMasterMatches = !query ? [...masterMatches].sort(() => Math.random() - 0.5) : masterMatches;
    if (page === 1) setSearchResults(finalMasterMatches);

    const isCategoryQuery = ['Accessories', 'Collectibles', 'Footwear', 'Hardwood Classics', 'Hats', 'Hoodies', 'Jerseys', 'Shorts', 'T-Shirts', 'Outerwear'].some(category => category.toLowerCase() === queryLower);
    if (!query || forceMasterOnly || isCategoryQuery || activeProductType) {
      setIsSearching(false);
      return;
    }

    let ebayUrl = WORKER_URL + encodeURIComponent(query);
    Object.entries(filters).forEach(([key, value]) => {
      if (value) ebayUrl += `&${key}=${encodeURIComponent(value)}`;
    });
    if (activeMinPrice) ebayUrl += `&_udlo=${activeMinPrice}`;
    if (activeMaxPrice) ebayUrl += `&_udhi=${activeMaxPrice}`;
    if (page > 1) ebayUrl += `&_pgn=${page}`;

    try {
      let res = await fetchWithRetry(ebayUrl);
      let html = await res.text();
      let doc = new DOMParser().parseFromString(html, 'text/html');

      const parseEbay = (document: Document) => {
        const items = document.querySelectorAll('.s-item__wrapper, .s-card, .s-item');
        const results: Product[] = [];
        items.forEach(item => {
          const titleEl = item.querySelector('.s-item__title, .s-card__title span') as HTMLElement;
          const priceEl = item.querySelector('.s-item__price, .s-card__price') as HTMLElement;
          const imgEl = item.querySelector('.s-item__image-img img, .s-card__image, img') as HTMLImageElement;
          if (titleEl && priceEl && imgEl) {
            const title = titleEl.innerText.replace('New Listing', '').trim();
            const price = priceEl.innerText.trim();
            const image = imgEl.getAttribute('data-src') || imgEl.src;
            if (!title.includes('Shop on eBay') && !price.includes('to') && !image.includes('placeholder')) {
              let cleanPrice = price.replace('HKD', '$').replace('PHP', '$');
              if (!cleanPrice.includes('$')) cleanPrice = '$' + cleanPrice;
              results.push({ title, price: cleanPrice, image });
            }
          }
        });
        return results;
      };

      let ebayResults = parseEbay(doc);
      if (ebayResults.length === 0 && masterMatches.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        res = await fetchWithRetry(ebayUrl);
        html = await res.text();
        doc = new DOMParser().parseFromString(html, 'text/html');
        ebayResults = parseEbay(doc);
      }

      const hasEbayFilters = Object.keys(filters).length > 0;
      setSearchResults(page === 1 ? (hasEbayFilters ? [...ebayResults, ...masterMatches] : [...masterMatches, ...ebayResults]) : ebayResults);

      if (page === 1) {
        const filterGroups: FilterGroup[] = [];
        doc.querySelectorAll('.x-refine__main__list').forEach(list => {
          const titleEl = list.querySelector('.x-refine__item__title-container, .x-refine__item__title');
          if (!titleEl) return;
          let title = titleEl.textContent?.trim() || '';
          title = title.replace(/Category|Price|Condition|Shipping and pickup|Buying Format|Item Location|Show only/i, '').trim();
          if (!title) return;

          const options: FilterOption[] = [];
          let paramName = '';
          list.querySelectorAll('a.x-refine__multi-select-link, a.x-refine__item--link, a.rbx').forEach(link => {
            const href = link.getAttribute('href') || '';
            const urlObj = new URL(href, 'https://ebay.com');
            const labelEl = link.querySelector('.cbx, .x-refine__item--label, .cbx.x-refine__multi-select-cbx');
            let label = labelEl?.textContent?.replace(/\(\d+(,\d+)?\)\s*Items/i, '').trim() || '';
            if (!label) label = link.textContent?.replace(/\(\d+(,\d+)?\)\s*Items/i, '').trim() || '';
            if (!label || label.toLowerCase() === 'more' || label.toLowerCase() === 'show more') return;
            for (const [key, value] of urlObj.searchParams.entries()) {
              if (!['_nkw', '_sacat', '_from', 'rt', '_dcat', 'LH_BIN', '_ipg', '_fcid', '_localstpos', '_stpos', 'gbr'].includes(key)) {
                if (!paramName) paramName = key;
                if (key === paramName) options.push({ label, value });
              }
            }
          });
          if (options.length > 0 && paramName) filterGroups.push({ title, paramName, options });
        });
        setDynamicFilters(filterGroups);
      }
    } catch {
      if (page === 1 && masterMatches.length > 0) setSearchResults(masterMatches);
    } finally {
      setIsSearching(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFilterChange = (param: string, value: string) => {
    const newFilters = { ...currentFilters, [param]: value };
    if (!value) delete newFilters[param];
    setCurrentFilters(newFilters);
    executeSearch(searchQuery, newFilters, 1, false, { productType: '', teamFilter, minPrice, maxPrice });
  };

  const handlePageChange = (newPage: number) => executeSearch(searchQuery, currentFilters, newPage);

  const goHome = () => {
    setView('home');
    setSearchQuery('');
    setSearchResults([]);
    setCurrentFilters({});
    setDynamicFilters([]);
    setMinPrice('');
    setMaxPrice('');
    setProductType('');
    setTeamFilter('');
    setCurrentPage(1);
  };

  const runSearchFromHome = ({ query = '', productType: nextProductType = '', teamFilter: nextTeamFilter = '', forceMasterOnly = false }: { query?: string; productType?: string; teamFilter?: string; forceMasterOnly?: boolean }) => {
    setProductType(nextProductType);
    setTeamFilter(nextTeamFilter);
    setMinPrice('');
    setMaxPrice('');
    setCurrentFilters({});
    executeSearch(query, {}, 1, forceMasterOnly, { productType: nextProductType, teamFilter: nextTeamFilter, minPrice: '', maxPrice: '' });
  };

  const submitSearch = () => {
    setProductType('');
    setTeamFilter('');
    setMinPrice('');
    setMaxPrice('');
    setCurrentFilters({});
    executeSearch(searchQuery, {}, 1, false, { productType: '', teamFilter: '', minPrice: '', maxPrice: '' });
  };

  const priceInMillions = (item: Product, qty: number) => (parseFloat(item.price.replace(/[^0-9.]/g, '')) * qty) / 1_000_000;

  const buyItem = () => {
    if (!selectedItem) return;
    const cost = priceInMillions(selectedItem, purchaseQuantity);
    if (cost > personalWealth) return;
    setAssets(prev => [...prev, { product: selectedItem, quantity: purchaseQuantity, date: new Date().toISOString() }]);
    dispatchAction({ type: 'STORE_PURCHASE', payload: { amountMillion: cost } });
    setSelectedItem(null);
    setPurchaseQuantity(1);
  };

  const updateAssetQuantity = (assetToUpdate: { product: Product; quantity: number; date: string }, qtyToRemove: number) => {
    setAssets(prev => {
      const index = prev.findIndex(asset => asset.product.title === assetToUpdate.product.title && asset.date === assetToUpdate.date);
      if (index === -1) return prev;
      const newAssets = [...prev];
      if (newAssets[index].quantity <= qtyToRemove) newAssets.splice(index, 1);
      else newAssets[index] = { ...newAssets[index], quantity: newAssets[index].quantity - qtyToRemove };
      return newAssets;
    });
  };

  const formatFunds = (millions: number) => (millions >= 1000 ? `$${(millions / 1000).toFixed(2)}B` : `$${millions.toFixed(2)}M`);

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f4f4] text-[#333]">
      <CommishStoreNav
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSubmit={submitSearch}
        view={view}
        onInventoryOpen={() => setView('inventory')}
        assetCount={assets.reduce((acc, asset) => acc + asset.quantity, 0)}
        personalWealthLabel={formatFunds(personalWealth)}
        onHome={goHome}
      />

      <main className="container mx-auto px-4 py-8 max-w-screen-xl">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <CommishStoreHomeView isFictional={isFictional} topPicks={topPicks} onProductSelect={setSelectedItem} onSearch={runSearchFromHome} westTeams={westTeams} eastTeams={eastTeams} />
            </motion.div>
          ) : view === 'inventory' ? (
            <motion.div key="inventory" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <CommishStoreInventoryView assets={assets} onBack={() => setView('home')} onAssetSelect={setSelectedAssetForAction} />
            </motion.div>
          ) : (
            <motion.div key="search" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <CommishStoreSearchView
                currentFilters={currentFilters}
                minPrice={minPrice}
                setMinPrice={setMinPrice}
                maxPrice={maxPrice}
                setMaxPrice={setMaxPrice}
                productType={productType}
                setProductType={setProductType}
                teamFilter={teamFilter}
                setTeamFilter={setTeamFilter}
                executeSearch={executeSearch}
                searchQuery={searchQuery}
                dynamicFilters={dynamicFilters}
                handleFilterChange={handleFilterChange}
                nbaTeams={nbaTeams}
                searchResults={searchResults}
                isSearching={isSearching}
                currentPage={currentPage}
                handlePageChange={handlePageChange}
                goHome={goHome}
                onProductSelect={setSelectedItem}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="bg-nba-dark text-white/50 py-8 px-6 text-center text-xs font-mono uppercase tracking-widest mt-auto flex flex-col items-center gap-2">
        <div>COMMISH STORE</div>
        {isDbLoaded && <div className="text-[8px] opacity-30">MASTER DB CONNECTED</div>}
        {isFictional && <div className="text-[8px] opacity-40 tracking-widest">FICTIONAL LEAGUE — SHOWING OFFICIAL BASKETBALL MERCHANDISE</div>}
      </footer>

      <CommishStorePurchaseModal
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        purchaseQuantity={purchaseQuantity}
        setPurchaseQuantity={setPurchaseQuantity}
        personalWealth={personalWealth}
        priceInMillions={priceInMillions}
        buyItem={buyItem}
      />

      {selectedAssetForAction && (
        <AssetActionModal
          asset={selectedAssetForAction}
          onClose={() => setSelectedAssetForAction(null)}
          onRemoveAsset={(asset, qty) => {
            updateAssetQuantity(asset, qty);
            setSelectedAssetForAction(null);
          }}
        />
      )}
    </div>
  );
}
