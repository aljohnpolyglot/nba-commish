/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Trophy, Wallet, X, ShoppingCart, Filter, ChevronDown } from 'lucide-react';
import { Product, Category, FilterGroup, FilterOption, TOP_PICKS, CATEGORIES, PLAYERS } from './commishStoreassets';
import { useGame } from '../../../store/GameContext';
import { getTeamLogo } from '../../../utils/helpers';
import { AssetActionModal } from '../../modals/AssetActionModal';

const WORKER_URL = 'https://amazonfetcher.mogatas-princealjohn-05082003.workers.dev/?q=';

export default function CommishStore() {
  const { state, dispatchAction } = useGame();
  const personalWealth = state.stats.personalWealth; // in millions

  const [view, setView] = useState<'home' | 'search' | 'inventory'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedItem, setSelectedItem] = useState<Product | null>(null);
  const [topPicks, setTopPicks] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [productType, setProductType] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [assets, setAssets] = useState<{ product: Product; quantity: number; date: string }[]>([]);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [selectedAssetForAction, setSelectedAssetForAction] = useState<{
    product: Product;
    quantity: number;
    date: string;
  } | null>(null);

  // Master Database State
  const masterDbRef = useRef<any[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Filtering state
  const [currentFilters, setCurrentFilters] = useState<Record<string, string>>({});
  const [dynamicFilters, setDynamicFilters] = useState<FilterGroup[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Game teams split by conference
  const nbaTeams = state.teams.filter(t => t.id > 0);
  const westTeams = nbaTeams.filter(t => t.conference === 'West');
  const eastTeams = nbaTeams.filter(t => t.conference === 'East');

  useEffect(() => {
    loadMasterDatabase();
  }, []);

  useEffect(() => {
    if (view === 'home' && isDbLoaded) {
      setTopPicks(prev => [...prev].sort(() => Math.random() - 0.5));
    }
  }, [view, isDbLoaded]);

  const loadMasterDatabase = async () => {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/aljohnpolyglot/nba-store-data/refs/heads/main/nbastore_master_database.json'
      );
      const data = await res.json();
      masterDbRef.current = data;
      setIsDbLoaded(true);

      const shuffled = [...data]
        .sort(() => Math.random() - 0.5)
        .slice(0, 12)
        .map((item: any) => ({
          title: item.title,
          price: item.price,
          image: item.img,
          isStatic: true,
          link: item.link,
          category: item.category,
        }));
      setTopPicks(shuffled);
    } catch (e) {
      setTopPicks(TOP_PICKS.map(p => ({ ...p, isStatic: true })));
    }
  };

  const getFeaturedMasterItems = () => {
    if (!masterDbRef.current.length) return [];
    const categories = [
      'Accessories', 'Collectibles', 'Footwear', 'Hardwood Classics',
      'Hats', 'Hoodies', 'Jerseys', 'Shorts', 'T-Shirts',
    ];
    const shuffledCategories = [...categories].sort(() => Math.random() - 0.5);
    let featured: any[] = [];
    shuffledCategories.forEach(cat => {
      const items = masterDbRef.current.filter((item: any) => item.category === cat);
      featured.push(...[...items].sort(() => Math.random() - 0.5).slice(0, 3));
    });
    return featured.map((item: any) => ({
      title: item.title,
      price: item.price,
      image: item.img,
      isStatic: true,
      link: item.link,
      category: item.category,
    }));
  };

  const fetchWithRetry = async (url: string, retries = 2, delay = 1500): Promise<Response> => {
    try {
      const res = await fetch(url);
      if (!res.ok && retries > 0) throw new Error('Fetch failed');
      return res;
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delay));
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
    overrides?: { productType?: string; teamFilter?: string; minPrice?: string; maxPrice?: string }
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
    setStatus('Connecting...');
    setCurrentPage(page);

    const normalize = (str: string) =>
      str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const queryLower = query.toLowerCase();
    const queryNorm = normalize(query);
    const queryWords = queryNorm.split(' ').filter(w => w.length > 2);

    const masterMatches = masterDbRef.current
      .filter((item: any) => {
        const title = item.title.toLowerCase();
        const titleNorm = normalize(item.title);
        const category = item.category.toLowerCase();

        const priceVal = parseFloat(item.price.replace(/[^0-9.]/g, ''));
        if (activeMinPrice !== '' && !isNaN(priceVal) && priceVal < parseFloat(activeMinPrice)) return false;
        if (activeMaxPrice !== '' && !isNaN(priceVal) && priceVal > parseFloat(activeMaxPrice)) return false;

        const CATEGORY_MAP: Record<string, string> = {
          'T-Shirts': 'Tshirts',
          'Hardwood Classics': 'Hardwoodclassics',
          'Accessories': 'Accesories',
          'Outerwear': 'Hoodies',
        };
        if (activeProductType) {
          const expectedCat = CATEGORY_MAP[activeProductType] || activeProductType;
          if (item.category !== expectedCat) return false;
        }

        if (activeTeamFilter) {
          if (!item.title.toLowerCase().includes(activeTeamFilter.toLowerCase())) return false;
        }

        if (!query) return true;

        if (titleNorm.includes(queryNorm) || category.includes(queryLower)) return true;
        if (category === queryLower) return true;

        return (
          queryWords.length > 0 &&
          queryWords.every(word => titleNorm.includes(word) || category.includes(word))
        );
      })
      .map((item: any) => ({
        title: item.title,
        price: item.price,
        image: item.img,
        isStatic: true,
        link: item.link,
        category: item.category,
      }));

    const finalMasterMatches = !query
      ? [...masterMatches].sort(() => Math.random() - 0.5)
      : masterMatches;

    if (page === 1) setSearchResults(finalMasterMatches);

    const isCategoryQuery = CATEGORIES.some(
      c => c.query.toLowerCase() === queryLower || c.title.toLowerCase() === queryLower
    );
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
          const imgEl = item.querySelector(
            '.s-item__image-img img, .s-card__image, img'
          ) as HTMLImageElement;

          if (titleEl && priceEl && imgEl) {
            const t = titleEl.innerText.replace('New Listing', '').trim();
            const p = priceEl.innerText.trim();
            const i = imgEl.getAttribute('data-src') || imgEl.src;

            if (!t.includes('Shop on eBay') && !p.includes('to') && !i.includes('placeholder')) {
              let cleanPrice = p.replace('HKD', '$').replace('PHP', '$');
              if (!cleanPrice.includes('$')) cleanPrice = '$' + cleanPrice;
              results.push({ title: t, price: cleanPrice, image: i });
            }
          }
        });
        return results;
      };

      let ebayResults = parseEbay(doc);

      if (ebayResults.length === 0 && masterMatches.length === 0) {
        setStatus('Retrying global network...');
        await new Promise(r => setTimeout(r, 1500));
        res = await fetchWithRetry(ebayUrl);
        html = await res.text();
        doc = new DOMParser().parseFromString(html, 'text/html');
        ebayResults = parseEbay(doc);
      }

      const hasEbayFilters = Object.keys(filters).length > 0;
      const finalResults =
        page === 1
          ? hasEbayFilters
            ? [...ebayResults, ...masterMatches]
            : [...masterMatches, ...ebayResults]
          : ebayResults;
      setSearchResults(finalResults);

      if (page === 1) {
        const filterGroups: FilterGroup[] = [];
        const refineLists = doc.querySelectorAll('.x-refine__main__list');

        refineLists.forEach(list => {
          const titleEl = list.querySelector(
            '.x-refine__item__title-container, .x-refine__item__title'
          );
          if (!titleEl) return;

          let title = titleEl.textContent?.trim() || '';
          title = title
            .replace(
              /Category|Price|Condition|Shipping and pickup|Buying Format|Item Location|Show only/i,
              ''
            )
            .trim();
          if (!title) return;

          const options: FilterOption[] = [];
          const links = list.querySelectorAll(
            'a.x-refine__multi-select-link, a.x-refine__item--link, a.rbx'
          );

          let paramName = '';
          links.forEach(link => {
            const href = link.getAttribute('href') || '';
            const urlObj = new URL(href, 'https://ebay.com');
            const labelEl = link.querySelector(
              '.cbx, .x-refine__item--label, .cbx.x-refine__multi-select-cbx'
            );
            let label =
              labelEl?.textContent?.replace(/\(\d+(,\d+)?\)\s*Items/i, '').trim() || '';
            if (!label) {
              label =
                link.textContent?.replace(/\(\d+(,\d+)?\)\s*Items/i, '').trim() || '';
            }
            if (!label || label.toLowerCase() === 'more' || label.toLowerCase() === 'show more')
              return;

            for (const [key, value] of urlObj.searchParams.entries()) {
              if (
                ![
                  '_nkw', '_sacat', '_from', 'rt', '_dcat', 'LH_BIN', '_ipg',
                  '_fcid', '_localstpos', '_stpos', 'gbr',
                ].includes(key)
              ) {
                if (!paramName) paramName = key;
                if (key === paramName) options.push({ label, value });
              }
            }
          });

          if (options.length > 0 && paramName) filterGroups.push({ title, paramName, options });
        });
        setDynamicFilters(filterGroups);
      }

      setStatus('');
    } catch (e) {
      setStatus('Global nodes unresponsive.');
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
    executeSearch(searchQuery, newFilters, 1, false, {
      productType: '',
      teamFilter,
      minPrice,
      maxPrice,
    });
  };

  const handlePageChange = (newPage: number) => {
    executeSearch(searchQuery, currentFilters, newPage);
  };

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

  // Price of item in millions (personalWealth is stored in millions)
  const priceInMillions = (item: Product, qty: number) => {
    const dollars = parseFloat(item.price.replace(/[^0-9.]/g, '')) * qty;
    return dollars / 1_000_000;
  };

  const buyItem = () => {
    if (!selectedItem) return;
    const cost = priceInMillions(selectedItem, purchaseQuantity);
    if (cost > personalWealth) return;

    setAssets(prev => [
      ...prev,
      { product: selectedItem, quantity: purchaseQuantity, date: new Date().toISOString() },
    ]);
    dispatchAction({ type: 'STORE_PURCHASE', payload: { amountMillion: cost } });
    setSelectedItem(null);
    setPurchaseQuantity(1);
  };

  const updateAssetQuantity = (
    assetToUpdate: { product: Product; quantity: number; date: string },
    qtyToRemove: number
  ) => {
    setAssets(prev => {
      const index = prev.findIndex(
        a => a.product.title === assetToUpdate.product.title && a.date === assetToUpdate.date
      );
      if (index === -1) return prev;
      const newAssets = [...prev];
      if (newAssets[index].quantity <= qtyToRemove) {
        newAssets.splice(index, 1);
      } else {
        newAssets[index] = { ...newAssets[index], quantity: newAssets[index].quantity - qtyToRemove };
      }
      return newAssets;
    });
  };

  const formatFunds = (millions: number) => {
    if (millions >= 1000) return `$${(millions / 1000).toFixed(2)}B`;
    return `$${millions.toFixed(2)}M`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f4f4] text-[#333]">
      {/* Navbar */}
      <nav className="bg-nba-dark px-6 py-4 flex justify-between items-center sticky top-0 z-50 border-b-4 border-nba-blue shadow-xl">
        <h1
          className="text-white font-black text-xl tracking-tighter cursor-pointer flex items-center gap-2"
          onClick={goHome}
        >
          <span className="text-2xl">🏀</span> COMMISH STORE
        </h1>

        <div className="flex gap-2 items-center">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search"
              className="bg-white px-4 py-2 rounded-l-md outline-none w-48 md:w-64 text-sm focus:ring-2 focus:ring-nba-blue transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setProductType('');
                  setTeamFilter('');
                  setMinPrice('');
                  setMaxPrice('');
                  setCurrentFilters({});
                  executeSearch(searchQuery, {}, 1, false, {
                    productType: '',
                    teamFilter: '',
                    minPrice: '',
                    maxPrice: '',
                  });
                }
              }}
            />
            <button
              className="bg-nba-blue text-white px-4 py-2 rounded-r-md font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center h-[36px]"
              onClick={() => {
                setProductType('');
                setTeamFilter('');
                setMinPrice('');
                setMaxPrice('');
                setCurrentFilters({});
                executeSearch(searchQuery, {}, 1, false, {
                  productType: '',
                  teamFilter: '',
                  minPrice: '',
                  maxPrice: '',
                });
              }}
            >
              <Search size={18} />
            </button>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <button
            onClick={() => setView('inventory')}
            className={`flex items-center gap-2 font-mono font-bold text-sm transition-all ${
              view === 'inventory' ? 'text-white' : 'text-white/70 hover:text-white'
            }`}
          >
            <ShoppingCart size={18} />
            ASSETS ({assets.reduce((acc, curr) => acc + curr.quantity, 0)})
          </button>

          <div className="flex items-center gap-2 text-nba-green font-mono font-bold text-lg">
            <Wallet size={20} />
            {formatFunds(personalWealth)}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-screen-xl">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Hero Banner */}
              <div
                className="relative h-64 md:h-96 rounded-2xl overflow-hidden shadow-2xl cursor-pointer group"
                onClick={() => executeSearch('Golden State Warriors')}
              >
                <img
                  src="https://nbastore.com.ph/cdn/shop/files/GSW-FH_web_banner_1944x.png"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt="Hero Banner"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-8">
                  <div className="text-white">
                    <h2 className="text-3xl md:text-5xl font-black italic tracking-tighter">
                      CHAMPIONSHIP GEAR
                    </h2>
                    <p className="text-lg opacity-90">Procure the latest Warriors collection</p>
                  </div>
                </div>
              </div>

              {/* Top Picks */}
              <section>
                <h2 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">
                  Top Picks
                </h2>
                <div className="flex overflow-x-auto gap-6 pb-6 custom-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
                  {topPicks.map((product, idx) => (
                    <ProductCard
                      key={idx}
                      product={product}
                      onClick={() => setSelectedItem(product)}
                      className="w-72"
                    />
                  ))}
                </div>
              </section>

              {/* Categories */}
              <section>
                <h2 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">
                  Categories
                </h2>
                <div className="flex overflow-x-auto gap-6 pb-6 custom-scrollbar pl-4 md:pl-0">
                  {CATEGORIES.map((cat, idx) => (
                    <CategoryCard
                      key={idx}
                      item={cat}
                      onClick={() => {
                        setProductType(cat.title);
                        setTeamFilter('');
                        setMinPrice('');
                        setMaxPrice('');
                        setCurrentFilters({});
                        executeSearch('', {}, 1, true, {
                          productType: cat.title,
                          teamFilter: '',
                          minPrice: '',
                          maxPrice: '',
                        });
                      }}
                    />
                  ))}
                </div>
              </section>

              {/* Players */}
              <section>
                <h2 className="text-3xl font-black uppercase text-center mb-8 tracking-tight">
                  Player Collections
                </h2>
                <div className="flex overflow-x-auto gap-6 pb-6 custom-scrollbar pl-4 md:pl-0">
                  {PLAYERS.map((player, idx) => (
                    <CategoryCard
                      key={idx}
                      item={player}
                      onClick={() => {
                        setProductType('');
                        setTeamFilter('');
                        setMinPrice('');
                        setMaxPrice('');
                        setCurrentFilters({});
                        executeSearch(player.query, {}, 1, false, {
                          productType: '',
                          teamFilter: '',
                          minPrice: '',
                          maxPrice: '',
                        });
                      }}
                    />
                  ))}
                </div>
              </section>

              {/* Teams — using game roster */}
              <section className="space-y-12 mb-12">
                <h2 className="text-3xl font-black uppercase text-center mb-12 tracking-tight">
                  Shop By Team
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative">
                  <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-200 -translate-x-1/2" />

                  {/* Western Conference */}
                  <div className="space-y-6">
                    <h3 className="text-xl font-black text-nba-blue border-b-2 border-nba-blue pb-2 uppercase italic">
                      Western Conference
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                      {westTeams.map(team => (
                        <button
                          key={team.id}
                          onClick={() => {
                            const searchName = team.region ? `${team.region} ${team.name}` : team.name;
                            setProductType('');
                            setTeamFilter(searchName);
                            setMinPrice('');
                            setMaxPrice('');
                            setCurrentFilters({});
                            executeSearch(searchName, {}, 1, true, {
                              productType: '',
                              teamFilter: searchName,
                              minPrice: '',
                              maxPrice: '',
                            });
                          }}
                          className="flex flex-col items-center group"
                        >
                          <div className="w-12 h-12 mb-2 group-hover:scale-110 transition-transform">
                            <img
                              src={team.logoUrl || getTeamLogo(team.id)}
                              alt={team.name}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <span className="text-[10px] font-bold text-center leading-tight uppercase tracking-tighter">
                            {team.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Eastern Conference */}
                  <div className="space-y-6">
                    <h3 className="text-xl font-black text-nba-red border-b-2 border-nba-red pb-2 uppercase italic">
                      Eastern Conference
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                      {eastTeams.map(team => (
                        <button
                          key={team.id}
                          onClick={() => {
                            const searchName = team.region ? `${team.region} ${team.name}` : team.name;
                            setProductType('');
                            setTeamFilter(searchName);
                            setMinPrice('');
                            setMaxPrice('');
                            setCurrentFilters({});
                            executeSearch(searchName, {}, 1, true, {
                              productType: '',
                              teamFilter: searchName,
                              minPrice: '',
                              maxPrice: '',
                            });
                          }}
                          className="flex flex-col items-center group"
                        >
                          <div className="w-12 h-12 mb-2 group-hover:scale-110 transition-transform">
                            <img
                              src={team.logoUrl || getTeamLogo(team.id)}
                              alt={team.name}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <span className="text-[10px] font-bold text-center leading-tight uppercase tracking-tighter">
                            {team.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : view === 'inventory' ? (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between border-b-4 border-nba-blue pb-4">
                <h2 className="text-3xl font-black text-nba-dark tracking-tighter flex items-center gap-3 uppercase italic">
                  <ShoppingCart className="text-nba-blue" /> ASSET INVENTORY
                </h2>
                <button
                  onClick={() => setView('home')}
                  className="text-nba-red font-black text-sm hover:underline tracking-widest uppercase"
                >
                  BACK TO STORE
                </button>
              </div>

              {assets.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl shadow-inner border-2 border-dashed border-gray-200">
                  <ShoppingCart size={64} className="mx-auto text-gray-200 mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 uppercase tracking-widest">
                    No assets acquired yet.
                  </h3>
                  <button
                    onClick={() => setView('home')}
                    className="mt-6 bg-nba-blue text-white px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg"
                  >
                    START SHOPPING
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assets.map((asset, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl p-6 shadow-xl border border-gray-100 flex gap-4 hover:scale-[1.02] transition-all cursor-pointer group"
                      onClick={() => {
                        setSelectedAssetForAction(asset);
                      }}
                    >
                      <div className="w-24 h-24 bg-gray-50 rounded-xl flex-shrink-0 flex items-center justify-center p-2">
                        <img
                          src={asset.product.image}
                          alt={asset.product.title}
                          className="max-w-full max-h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex flex-col justify-between py-1 flex-grow">
                        <div>
                          <h3 className="font-bold text-sm line-clamp-2 leading-tight mb-1 group-hover:text-nba-blue transition-colors">
                            {asset.product.title}
                          </h3>
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Qty: {asset.quantity}
                            </div>
                            <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                              {new Date(asset.date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-end justify-between">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            Total Value
                          </div>
                          <div className="text-nba-blue font-black text-lg">
                            $
                            {(
                              parseFloat(asset.product.price.replace(/[^0-9.]/g, '')) *
                              asset.quantity
                            ).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col md:flex-row gap-8"
            >
              {/* Sidebar */}
              <aside className="w-full md:w-[280px] flex-shrink-0 space-y-6">
                <div className="bg-white rounded-xl p-6 border border-gray-200 sticky top-24 shadow-lg overflow-y-auto max-h-[calc(100vh-7rem)]">
                  <div className="flex items-center justify-between gap-2 text-nba-blue font-black uppercase tracking-widest text-sm mb-6 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Filter size={16} /> FILTERS
                    </div>
                    {(Object.keys(currentFilters).length > 0 ||
                      minPrice ||
                      maxPrice ||
                      productType ||
                      teamFilter) && (
                      <button
                        onClick={() => {
                          setCurrentFilters({});
                          setMinPrice('');
                          setMaxPrice('');
                          setProductType('');
                          setTeamFilter('');
                          executeSearch(searchQuery, {}, 1, false, {
                            productType: '',
                            teamFilter: '',
                            minPrice: '',
                            maxPrice: '',
                          });
                        }}
                        className="text-[10px] text-nba-red hover:underline"
                      >
                        CLEAR ALL
                      </button>
                    )}
                  </div>

                  {/* Price Filters */}
                  <div className="space-y-4 mb-8">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Price Range ($)
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none focus:border-nba-blue transition-colors"
                        value={minPrice}
                        onChange={e => setMinPrice(e.target.value)}
                        onBlur={e =>
                          executeSearch(searchQuery, currentFilters, 1, false, {
                            minPrice: e.target.value,
                          })
                        }
                        onKeyDown={e =>
                          e.key === 'Enter' &&
                          executeSearch(searchQuery, currentFilters, 1, false, {
                            minPrice: (e.target as HTMLInputElement).value,
                          })
                        }
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none focus:border-nba-blue transition-colors"
                        value={maxPrice}
                        onChange={e => setMaxPrice(e.target.value)}
                        onBlur={e =>
                          executeSearch(searchQuery, currentFilters, 1, false, {
                            maxPrice: e.target.value,
                          })
                        }
                        onKeyDown={e =>
                          e.key === 'Enter' &&
                          executeSearch(searchQuery, currentFilters, 1, false, {
                            maxPrice: (e.target as HTMLInputElement).value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Master DB Filters */}
                  <div className="space-y-6 mb-8">
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Product
                      </h3>
                      <div className="relative">
                        <select
                          className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none appearance-none cursor-pointer focus:border-nba-blue transition-colors"
                          value={productType}
                          onChange={e => {
                            setProductType(e.target.value);
                            executeSearch(searchQuery, currentFilters, 1, false, {
                              productType: e.target.value,
                            });
                          }}
                        >
                          <option value="" className="bg-white text-gray-400">
                            All Products
                          </option>
                          {CATEGORIES.filter(cat => cat.title !== 'Outerwear').map(cat => (
                            <option
                              key={cat.title}
                              value={cat.title}
                              className="bg-white text-gray-800"
                            >
                              {cat.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Team
                      </h3>
                      <div className="relative">
                        <select
                          className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none appearance-none cursor-pointer focus:border-nba-blue transition-colors"
                          value={teamFilter}
                          onChange={e => {
                            setTeamFilter(e.target.value);
                            executeSearch(searchQuery, currentFilters, 1, false, {
                              teamFilter: e.target.value,
                            });
                          }}
                        >
                          <option value="" className="bg-white text-gray-400">
                            All Teams
                          </option>
                          {nbaTeams.map(team => (
                            <option
                              key={team.id}
                              value={team.region ? `${team.region} ${team.name}` : team.name}
                              className="bg-white text-gray-800"
                            >
                              {team.region ? `${team.region} ${team.name}` : team.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={14}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Filters */}
                  <div className="space-y-6">
                    {dynamicFilters.map(group => (
                      <div key={group.paramName} className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                          {group.title}
                        </h3>
                        <div className="relative">
                          <select
                            className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-800 outline-none appearance-none cursor-pointer focus:border-nba-blue transition-colors"
                            value={currentFilters[group.paramName] || ''}
                            onChange={e => handleFilterChange(group.paramName, e.target.value)}
                          >
                            <option value="" className="bg-white text-gray-400">
                              All {group.title}
                            </option>
                            {group.options.map((opt, i) => (
                              <option key={i} value={opt.value} className="bg-white text-gray-800">
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={14}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {Object.keys(currentFilters).length > 0 && (
                    <button
                      onClick={() => {
                        setCurrentFilters({});
                        executeSearch(searchQuery, {});
                      }}
                      className="w-full mt-8 py-2 text-xs font-bold text-nba-red hover:text-white hover:bg-nba-red rounded transition-all border border-nba-red/30"
                    >
                      RESET ALL FILTERS
                    </button>
                  )}
                </div>
              </aside>

              {/* Main Search Content */}
              <div className="flex-grow space-y-6">
                <div className="flex justify-between items-center border-b pb-4">
                  <h2 className="text-2xl font-black uppercase tracking-tight text-gray-800">
                    {searchQuery}
                  </h2>
                  <button
                    onClick={goHome}
                    className="text-sm font-bold text-gray-500 hover:text-nba-red flex items-center gap-1"
                  >
                    <X size={16} /> CLOSE
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
                  {isSearching
                    ? Array.from({ length: 10 }).map((_, idx) => <ProductSkeleton key={idx} />)
                    : searchResults.map((product, idx) => (
                        <ProductCard
                          key={idx}
                          product={product}
                          onClick={() => setSelectedItem(product)}
                        />
                      ))}
                </div>

                {searchResults.length > 0 && (
                  <div className="flex justify-center items-center gap-4 py-8 border-t">
                    <button
                      disabled={currentPage === 1 || isSearching}
                      onClick={() => handlePageChange(currentPage - 1)}
                      className="px-6 py-2 bg-white border border-gray-200 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
                    >
                      PREVIOUS
                    </button>
                    <span className="font-mono font-bold text-nba-blue">PAGE {currentPage}</span>
                    <button
                      disabled={isSearching || searchResults.length < 10}
                      onClick={() => handlePageChange(currentPage + 1)}
                      className="px-6 py-2 bg-nba-dark text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-black transition-colors"
                    >
                      NEXT PAGE
                    </button>
                  </div>
                )}

                {!isSearching && searchResults.length === 0 && (
                  <div className="text-center py-20">
                    <Trophy size={64} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-xl font-bold text-gray-400">
                      No assets found in this sector.
                    </h3>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-nba-dark text-white/50 py-8 px-6 text-center text-xs font-mono uppercase tracking-widest mt-auto flex flex-col items-center gap-2">
        <div>COMMISH STORE</div>
        {isDbLoaded && <div className="text-[8px] opacity-30">MASTER DB CONNECTED</div>}
      </footer>

      {/* Purchase Modal */}
      <AnimatePresence>
        {selectedItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
              onClick={() => setSelectedItem(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-40%' }}
              className="fixed top-1/2 left-1/2 bg-white rounded-3xl overflow-hidden w-[95%] max-w-2xl z-[101] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] flex flex-col md:flex-row"
            >
              <div className="w-full md:w-1/2 bg-gray-50 p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-gray-100 relative">
                {selectedItem.isStatic && (
                  <div className="absolute top-4 left-4 bg-nba-dark text-white text-[10px] font-black px-3 py-1.5 rounded-full z-10 flex items-center gap-1.5 shadow-xl">
                    <Trophy size={10} /> OFFICIAL
                  </div>
                )}
                <img
                  src={selectedItem.image}
                  alt={selectedItem.title}
                  className="max-w-full max-h-[400px] object-contain drop-shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="w-full md:w-1/2 p-8 flex flex-col">
                <button
                  className="self-end text-gray-400 hover:text-gray-600 transition-colors mb-4"
                  onClick={() => setSelectedItem(null)}
                >
                  <X size={24} />
                </button>

                <div className="flex-grow">
                  <div className="text-nba-blue font-black text-xs uppercase tracking-widest mb-2">
                    AUTHENTIC GEAR
                  </div>
                  <h2 className="text-2xl font-black text-gray-900 leading-tight mb-4">
                    {selectedItem.title}
                  </h2>
                  <div className="text-4xl font-black text-nba-red mb-4">{selectedItem.price}</div>

                  {/* Quantity Selector */}
                  <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                      Select Quantity
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setPurchaseQuantity(Math.max(1, purchaseQuantity - 1))}
                          className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-nba-blue hover:text-nba-blue transition-all font-bold text-xl"
                        >
                          -
                        </button>
                        <span className="text-2xl font-black w-8 text-center">
                          {purchaseQuantity}
                        </span>
                        <button
                          onClick={() => setPurchaseQuantity(Math.min(10, purchaseQuantity + 1))}
                          className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center hover:border-nba-blue hover:text-nba-blue transition-all font-bold text-xl"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          Total Price
                        </div>
                        <div className="text-xl font-black text-nba-blue">
                          $
                          {(
                            parseFloat(selectedItem.price.replace(/[^0-9.]/g, '')) *
                            purchaseQuantity
                          ).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    {selectedItem.isStatic && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Trophy size={16} className="text-nba-dark" />
                        <span>Official NBA Licensed Product</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <ShoppingCart size={16} className="text-nba-blue" />
                      <span>Global Shipping Available</span>
                    </div>
                  </div>
                </div>

                {priceInMillions(selectedItem, purchaseQuantity) > personalWealth && (
                  <p className="text-red-500 text-xs font-bold text-center mb-3 uppercase tracking-widest">
                    Insufficient personal funds
                  </p>
                )}
                <button
                  className={`w-full text-white font-black py-4 rounded-2xl text-lg shadow-xl active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 ${
                    priceInMillions(selectedItem, purchaseQuantity) > personalWealth
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-nba-dark hover:bg-black'
                  }`}
                  onClick={buyItem}
                  disabled={priceInMillions(selectedItem, purchaseQuantity) > personalWealth}
                >
                  BUY NOW
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Asset Action Modal */}
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

function ProductSkeleton() {
  return (
    <div className="bg-white p-4 rounded-xl shadow-md border border-transparent">
      <div className="h-48 mb-4 rounded-lg skeleton-shimmer" />
      <div className="h-3 w-1/2 mb-2 rounded skeleton-shimmer" />
      <div className="h-4 w-full mb-1 rounded skeleton-shimmer" />
      <div className="h-4 w-3/4 mb-4 rounded skeleton-shimmer" />
      <div className="h-6 w-1/3 rounded skeleton-shimmer" />
    </div>
  );
}

function ProductCard({
  product,
  onClick,
  className = 'w-full',
}: {
  product: Product;
  onClick: () => void;
  className?: string;
  key?: React.Key;
}) {
  return (
    <div
      className={`flex-shrink-0 ${className} bg-white p-4 rounded-xl shadow-md hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border border-transparent hover:border-nba-blue group relative`}
      onClick={onClick}
    >
      {product.isStatic && (
        <div className="absolute top-2 right-2 bg-nba-dark text-white text-[8px] font-black px-2 py-1 rounded-full z-10 flex items-center gap-1 shadow-lg">
          <Trophy size={8} /> OFFICIAL
        </div>
      )}
      <div className="h-48 mb-4 overflow-hidden rounded-lg bg-gray-50 flex items-center justify-center">
        <img
          src={product.image}
          alt={product.title}
          className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
      </div>
      {product.brand && (
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
          {product.brand}
        </div>
      )}
      {product.category && (
        <div className="text-[10px] font-bold text-nba-blue uppercase tracking-widest mb-1">
          {product.category}
        </div>
      )}
      <h3 className="text-xs font-bold line-clamp-2 leading-snug mb-2 min-h-[2.5rem]">
        {product.title}
      </h3>
      <div className="mt-auto text-lg font-black text-nba-red">{product.price}</div>
    </div>
  );
}

function CategoryCard({
  item,
  onClick,
}: {
  item: Category;
  onClick: () => void;
  key?: React.Key;
}) {
  return (
    <div className="flex-shrink-0 w-40 md:w-48 cursor-pointer group" onClick={onClick}>
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-200 shadow-lg">
        <img
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-110 group-hover:brightness-110 transition-all duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <h3 className="absolute bottom-4 left-0 right-0 px-2 text-center text-white font-black uppercase text-sm md:text-lg leading-tight tracking-tight">
          {item.title}
        </h3>
      </div>
    </div>
  );
}
