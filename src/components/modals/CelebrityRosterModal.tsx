import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Search, Star, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { fetchRatedCelebrities, RatedCelebrity } from '../../data/celebrities';

interface Celebrity {
    id: string;
    name: string;
    type: string;
    isRated?: boolean;
}

const CELEBRITY_LIST_URL = 'https://gist.githubusercontent.com/mbejda/9c3353780270e7298763/raw/1bfc4810db4240d85947e6aef85fcae71f475493/Top-1000-Celebrity-Twitter-Accounts.csv';

const toNameCase = (str: string) => {
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const normalizeCelebrityName = (name: string) => {
    let normalized = name.replace(/"/g, '').trim();
    // Handle specific cases like Dwayne "The Rock" Johnson
    if (normalized.toLowerCase().includes('dwayne') && normalized.toLowerCase().includes('johnson')) {
        return 'Dwayne Johnson';
    }
    return toNameCase(normalized);
};

interface CelebrityRosterModalProps {
    onClose: () => void;
    onConfirm: (roster: Celebrity[]) => void;
}

export const CelebrityRosterModal: React.FC<CelebrityRosterModalProps> = ({ onClose, onConfirm }) => {
    const { state } = useGame();
    const [selectedCelebrities, setSelectedCelebrities] = useState<Celebrity[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [allCelebrities, setAllCelebrities] = useState<Celebrity[]>([]);
    const [loading, setLoading] = useState(true);
    const maxSelections = 20;

    useEffect(() => {
        const fetchCelebrities = async () => {
            try {
                // Fetch rated list first — warms cache
                // and provides the priority pool
                const rated = await fetchRatedCelebrities();
                
                // Convert to Celebrity shape for modal
                const priorityPool = rated.map(
                  (c, i) => ({
                    id: `rated-${i}`,
                    name: c.name,
                    type: c.type,
                    isRated: true,  // flag for UI
                  })
                );

                const response = await fetch(CELEBRITY_LIST_URL);
                const csvText = await response.text();
                
                // Simple CSV parser
                const lines = csvText.split('\n').filter(l => l.trim().length > 0);
                const headers = lines[0].split(',');
                const nameIndex = headers.indexOf('name');
                const typeIndex = headers.indexOf('type');

                const fetchedCelebs: Celebrity[] = [];
                const seenNames = new Set<string>();
                
                // Add priority celebs first to seenNames
                priorityPool.forEach(c => seenNames.add(normalizeCelebrityName(c.name)));

                // Get NBA player names for filtering
                const nbaPlayerNames = new Set(state.players.map(p => p.name.toLowerCase()));

                lines.slice(1).forEach((line, i) => {
                    const parts = line.split(',');
                    if (parts.length <= Math.max(nameIndex, typeIndex)) return;
                    
                    const rawName = parts[nameIndex];
                    const normalizedName = normalizeCelebrityName(rawName);
                    const type = parts[typeIndex] || 'Celebrity';

                    if (!seenNames.has(normalizedName) && !nbaPlayerNames.has(normalizedName.toLowerCase())) {
                        seenNames.add(normalizedName);
                        fetchedCelebs.push({
                            id: `fetched-${i}`,
                            name: normalizedName,
                            type: toNameCase(type)
                        });
                    }
                });

                const combined = [
                    ...priorityPool,
                    ...fetchedCelebs
                ];

                setAllCelebrities(combined);
            } catch (error) {
                console.error("Failed to fetch celebrity list:", error);
                // Fallback to priority list
                const rated = await fetchRatedCelebrities();
                const priorityPool = rated.map(
                  (c, i) => ({
                    id: `rated-${i}`,
                    name: c.name,
                    type: c.type,
                    isRated: true,
                  })
                );
                setAllCelebrities(priorityPool);
            } finally {
                setLoading(false);
            }
        };

        fetchCelebrities();
    }, [state.players]);

    const filteredCelebrities = useMemo(() => {
        if (!searchTerm) return allCelebrities.slice(0, 50);
        return allCelebrities.filter(c => 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.type.toLowerCase().includes(searchTerm.toLowerCase())
        ).slice(0, 50);
    }, [searchTerm, allCelebrities]);

    const handleToggle = (celebrity: Celebrity) => {
        if (selectedCelebrities.some(c => c.id === celebrity.id)) {
            setSelectedCelebrities(selectedCelebrities.filter(c => c.id !== celebrity.id));
        } else if (selectedCelebrities.length < maxSelections) {
            setSelectedCelebrities([...selectedCelebrities, celebrity]);
        }
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            >
                <motion.div 
                    initial={{ scale: 0.95, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 20 }}
                    className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                >
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                        <div className="flex flex-col">
                            <h3 className="text-xl font-black text-white uppercase tracking-tight">Celebrity Game Roster</h3>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                                Selected: {selectedCelebrities.length} / {maxSelections}
                            </span>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-6 border-b border-slate-800 space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search celebrities..."
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                                autoFocus
                            />
                            {loading && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                        {searchTerm && filteredCelebrities.length === 0 && !loading && (
                             <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                                <AlertCircle size={16} />
                                <span className="text-xs font-bold">Celebrity not found? Try a different spelling.</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {filteredCelebrities.map(celebrity => {
                                const isSelected = selectedCelebrities.some(c => c.id === celebrity.id);
                                return (
                                    <button
                                        key={celebrity.id}
                                        onClick={() => handleToggle(celebrity)}
                                        className={`flex items-center p-3 rounded-xl transition-colors text-left group border ${isSelected ? 'bg-indigo-500/10 border-indigo-500/50' : 'hover:bg-slate-800/50 border-transparent hover:border-indigo-500/20'}`}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                                            <Star size={18} className={isSelected ? "text-indigo-400" : "text-slate-500"} />
                                        </div>
                                        <div className="ml-3 flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className={`font-bold text-sm truncate transition-colors ${isSelected ? 'text-indigo-400' : 'text-slate-200 group-hover:text-indigo-400'}`}>{celebrity.name}</span>
                                                <div className="flex items-center gap-1">
                                                    {celebrity.isRated && (
                                                      <span className="text-[8px] text-amber-400 font-bold">★</span>
                                                    )}
                                                    {isSelected && <Check size={14} className="text-indigo-400" />}
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate">{celebrity.type}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 rounded-xl text-slate-400 font-bold hover:text-white hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(selectedCelebrities)}
                            disabled={selectedCelebrities.length < 10}
                            className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            Confirm Roster ({selectedCelebrities.length})
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
