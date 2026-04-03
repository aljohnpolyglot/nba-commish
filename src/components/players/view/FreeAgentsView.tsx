import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, User, Globe, Trophy, Briefcase, UserX, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import { FreeAgentCard } from './FreeAgentCard';
import { ForceSignModal } from './ForceSignModal';
import { PlayerActionsModal } from '../../central/view/PlayerActionsModal';
import { PlayerBioView } from '../../central/view/PlayerBioView';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import ContactModal from '../../ContactModal';
import { getCountryFromLoc } from '../../../utils/helpers';
import type { NBAPlayer } from '../../../types';

const MARKET_POOLS = [
  { id: 'all', label: 'All Available', icon: Globe },
  { id: 'nba', label: 'NBA Free Agents', icon: Briefcase },
  { id: 'euroleague', label: 'Euroleague', icon: Trophy },
  { id: 'pba', label: 'PBA', icon: Trophy },
  { id: 'bleague', label: 'B-League', icon: Trophy },
];

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];

export const FreeAgentsView: React.FC = () => {
  const { state, dispatchAction, healPlayer } = useGame();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPool, setSelectedPool] = useState('all');
  const [selectedPosition, setSelectedPosition] = useState('All');
  const [sortBy, setSortBy] = useState<'ovr' | 'age' | 'name'>('ovr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedCountry, setSelectedCountry] = useState('All');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const [selectedActionPlayer, setSelectedActionPlayer] = useState<NBAPlayer | null>(null);
  const [selectedPlayerForSign, setSelectedPlayerForSign] = useState<NBAPlayer | null>(null);
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [viewingBioPlayer, setViewingBioPlayer] = useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = useState<NBAPlayer | null>(null);
  const [personSelectorOpen, setPersonSelectorOpen] = useState(false);
  const [personSelectorType, setPersonSelectorType] = useState<'contact' | 'bribe' | 'dinner' | 'movie' | 'suspension' | 'waive' | 'sabotage' | 'general'>('general');
  const [preSelectedContact, setPreSelectedContact] = useState<any>(null);
  const [contactModalPerson, setContactModalPerson] = useState<any>(null);

  const freeAgents = useMemo(() => {
    return state.players.filter(p => {
      if (p.status === 'Retired' || p.hof || p.tid === -100) return false;
      if (p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect') return false;

      const isInternational = p.status === 'Euroleague' || p.status === 'PBA' || p.status === 'B-League';
      const isNBAFreeAgent = p.tid === -1 || p.status === 'Free Agent';

      return isInternational || isNBAFreeAgent;
    });
  }, [state.players]);

  // All unique countries from the current free agent pool
  const allCountries = useMemo(() => {
    const set = new Set<string>();
    freeAgents.forEach(p => {
      const c = getCountryFromLoc(p.born?.loc);
      if (c) set.add(c);
    });
    return Array.from(set).sort();
  }, [freeAgents]);

  // Teams available for the selected non-NBA league
  const leagueTeams = useMemo(() => {
    if (selectedPool === 'all' || selectedPool === 'nba') return [];
    const leagueMap: Record<string, string> = { euroleague: 'Euroleague', pba: 'PBA', bleague: 'B-League' };
    const league = leagueMap[selectedPool];
    if (!league) return [];
    return state.nonNBATeams.filter(t => t.league === league);
  }, [selectedPool, state.nonNBATeams]);

  const filteredPlayers = useMemo(() => {
    let filtered = freeAgents.filter(p => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;

      if (selectedPool !== 'all') {
        if (selectedPool === 'nba' && p.status !== 'Free Agent' && p.tid !== -1) return false;
        if (selectedPool === 'euroleague' && p.status !== 'Euroleague') return false;
        if (selectedPool === 'pba' && p.status !== 'PBA') return false;
        if (selectedPool === 'bleague' && p.status !== 'B-League') return false;
      }

      if (selectedPosition !== 'All') {
        const pPos = p.pos || '';
        if (selectedPosition === 'PG' || selectedPosition === 'SG') {
          if (!pPos.includes(selectedPosition) && !pPos.includes('G')) return false;
        } else if (selectedPosition === 'SF' || selectedPosition === 'PF') {
          if (!pPos.includes(selectedPosition) && !pPos.includes('F')) return false;
        } else {
          if (!pPos.includes(selectedPosition)) return false;
        }
      }

      // Country filter
      if (selectedCountry !== 'All') {
        const c = getCountryFromLoc(p.born?.loc);
        if (c !== selectedCountry) return false;
      }

      // Team filter (only for non-NBA leagues)
      if (selectedTeamId !== null) {
        if (p.tid !== selectedTeamId) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      const currentYear = new Date().getFullYear();

      if (sortBy === 'ovr') {
        comparison = (a.overallRating || 0) - (b.overallRating || 0);
      } else if (sortBy === 'age') {
        const ageA = a.born?.year ? currentYear - a.born.year : a.age || 0;
        const ageB = b.born?.year ? currentYear - b.born.year : b.age || 0;
        comparison = ageA - ageB;
      } else {
        comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [freeAgents, searchTerm, selectedPool, selectedPosition, sortBy, sortOrder, selectedCountry, selectedTeamId]);

  const getContactFromPlayer = (player: NBAPlayer) => {
    const isNBA = !['WNBA', 'Euroleague', 'PBA', 'B-League'].includes(player.status || '');
    const playerTeam = isNBA ? state.teams.find(t => t.id === player.tid) : null;
    const nonNBATeam = !isNBA ? state.nonNBATeams?.find((t: any) => t.tid === player.tid) : null;
    return {
      id: player.internalId,
      name: player.name,
      title: 'Player',
      organization: playerTeam?.name || nonNBATeam?.name || player.status || 'Free Agent',
      type: 'player' as const,
      playerPortraitUrl: player.imgURL,
    };
  };

  const handleActionClick = (player: NBAPlayer) => {
    setSelectedActionPlayer(player);
  };

  const handleActionSelect = async (actionType: string) => {
    if (!selectedActionPlayer) return;

    if (actionType === 'view_bio') {
      setViewingBioPlayer(selectedActionPlayer);
      setSelectedActionPlayer(null);
      return;
    }

    if (actionType === 'view_ratings') {
      setViewingRatingsPlayer(selectedActionPlayer);
      setSelectedActionPlayer(null);
      return;
    }

    if (actionType === 'sign_player') {
      setSelectedPlayerForSign(selectedActionPlayer);
      setIsSignModalOpen(true);
      setSelectedActionPlayer(null);
      return;
    }

    const contact = getContactFromPlayer(selectedActionPlayer);
    setSelectedActionPlayer(null);

    if (actionType === 'contact') {
      setContactModalPerson({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        organization: contact.organization,
        type: contact.type,
        playerPortraitUrl: contact.playerPortraitUrl,
      });
      return;
    }

    // For all other actions: open PersonSelectorModal with player pre-selected
    setPreSelectedContact(contact);
    setPersonSelectorType(actionType as any);
    setPersonSelectorOpen(true);
  };

  const handlePersonSelected = async (contacts: any[], reason?: string, amount?: number, location?: string, duration?: string) => {
    setPersonSelectorOpen(false);
    setPreSelectedContact(null);

    const typeMap: Record<string, string> = {
      bribe: 'BRIBE_PERSON',
      dinner: 'INVITE_DINNER',
      movie: 'INVITE_DINNER',
      suspension: 'SUSPEND_PLAYER',
      waive: 'WAIVE_PLAYER',
      sabotage: 'SABOTAGE_PLAYER',
      drug_test: 'DRUG_TEST_PERSON',
      fine: 'FINE_PERSON',
      general: 'INVITE_DINNER',
    };
    const dispatchType = typeMap[personSelectorType];
    if (!dispatchType) return;

    const targetNames = contacts.map((c: any) => c.name).join(', ');
    const targetRoles = contacts.map((c: any) => c.title).join(', ');
    const targetIds = contacts.map((c: any) => c.id).join(',');
    let finalReason = reason || (personSelectorType === 'movie' ? 'Movie Night' : 'No reason provided.');
    if (location) finalReason += ` at ${location}`;

    await dispatchAction({
      type: dispatchType as any,
      payload: {
        targetName: targetNames,
        targetRole: targetRoles,
        targetId: targetIds,
        reason: finalReason,
        amount,
        duration,
        count: contacts.length,
        subType: personSelectorType,
        location,
        contacts,
      },
    });
  };

  const handleConfirmSigning = async (payload: { playerId: string; teamId: number; playerName: string; teamName: string }) => {
    setIsSignModalOpen(false);
    await dispatchAction({ type: 'SIGN_FREE_AGENT', payload });
    setSelectedPlayerForSign(null);
  };

  const nbaFreeAgents = freeAgents.filter(p => p.status === 'Free Agent' || p.tid === -1).length;
  const internationalPlayers = freeAgents.filter(p => ['Euroleague', 'PBA', 'B-League'].includes(p.status || '')).length;

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950 rounded-[2.5rem] border border-slate-800 shadow-2xl">
      <div className="p-4 sm:p-8 space-y-4 sm:space-y-8">
        {/* Header */}
        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-rose-600/20 rounded-xl sm:rounded-2xl flex items-center justify-center border border-rose-500/30 flex-shrink-0">
              <UserX size={20} className="text-rose-400 sm:hidden" />
              <UserX size={32} className="text-rose-400 hidden sm:block" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tight">Free Agent Market</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1 font-medium">Browse and interact with available players</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
              <span className="text-slate-400 font-medium">{nbaFreeAgents} NBA Free Agents</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <span className="text-slate-400 font-medium">{internationalPlayers} International</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span className="text-slate-400 font-medium">{freeAgents.length} Total Available</span>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              placeholder="Search free agents by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-white pl-12 pr-4 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {MARKET_POOLS.map(pool => (
                <button
                  key={pool.id}
                  onClick={() => { setSelectedPool(pool.id); setSelectedTeamId(null); setSelectedCountry('All'); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-tight transition-all border ${
                    selectedPool === pool.id
                      ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-500/20'
                      : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <pool.icon size={14} />
                  {pool.label}
                </button>
              ))}
            </div>

            <select
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight"
            >
              {POSITIONS.map(pos => (
                <option key={pos} value={pos}>{pos === 'All' ? 'All Positions' : pos}</option>
              ))}
            </select>

            {/* Team dropdown — visible when a non-NBA league is selected */}
            {leagueTeams.length > 0 && (
              <select
                value={selectedTeamId ?? ''}
                onChange={(e) => setSelectedTeamId(e.target.value ? parseInt(e.target.value) : null)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight max-w-[200px]"
              >
                <option value="">All Teams</option>
                {leagueTeams.map(t => {
                  const fullName = t.region ? `${t.region} ${t.name}`.trim() : t.name;
                  return <option key={t.tid} value={t.tid}>{fullName}</option>;
                })}
              </select>
            )}

            {/* Country dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="flex items-center gap-2 bg-slate-900 border border-slate-800 text-slate-300 text-xs py-2 px-3 rounded-xl focus:outline-none focus:border-rose-500 transition-colors font-bold uppercase tracking-tight min-w-[130px] justify-between"
              >
                <span className="truncate">{selectedCountry === 'All' ? 'All Countries' : selectedCountry}</span>
                <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${isCountryDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isCountryDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsCountryDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute z-50 mt-2 left-0 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"
                    >
                      <button
                        onClick={() => { setSelectedCountry('All'); setIsCountryDropdownOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors ${selectedCountry === 'All' ? 'bg-rose-500/10 text-rose-400' : 'text-slate-300'}`}
                      >
                        All Countries
                      </button>
                      {allCountries.map(c => (
                        <button
                          key={c}
                          onClick={() => { setSelectedCountry(c); setIsCountryDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-xs hover:bg-slate-800 transition-colors ${selectedCountry === c ? 'bg-rose-500/10 text-rose-400' : 'text-slate-300'}`}
                        >
                          {c}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {(['ovr', 'age', 'name'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (sortBy === s) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                    else { setSortBy(s); setSortOrder(s === 'name' ? 'asc' : 'desc'); }
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-tight transition-all ${
                    sortBy === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-900'
                  }`}
                >
                  {s === 'ovr' ? 'Overall' : s === 'age' ? 'Age' : 'A-Z'}
                  {sortBy === s && <ArrowUpDown size={12} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {filteredPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-600 bg-slate-900/10 rounded-[3rem] border border-dashed border-slate-800">
            <User size={64} className="mb-6 opacity-10" />
            <p className="font-black uppercase tracking-[0.3em] text-sm">No Free Agents Found</p>
            <p className="text-xs font-medium mt-3 text-slate-500 max-w-xs text-center leading-relaxed">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredPlayers.map(player => (
              <FreeAgentCard
                key={player.internalId}
                player={player}
                nonNBATeams={state.nonNBATeams}
                onClick={handleActionClick}
              />
            ))}
          </div>
        )}
      </div>

      {selectedActionPlayer && (
        <PlayerActionsModal
          player={selectedActionPlayer}
          onClose={() => setSelectedActionPlayer(null)}
          onActionSelect={handleActionSelect}
          onHeal={() => { healPlayer(selectedActionPlayer.internalId); setSelectedActionPlayer(null); }}
        />
      )}

      {isSignModalOpen && selectedPlayerForSign && (
        <ForceSignModal
          player={selectedPlayerForSign}
          teams={state.teams}
          onClose={() => {
            setIsSignModalOpen(false);
            setSelectedPlayerForSign(null);
          }}
          onConfirm={handleConfirmSigning}
        />
      )}

      {contactModalPerson && (
        <ContactModal
          contact={contactModalPerson}
          onClose={() => setContactModalPerson(null)}
          onSend={async ({ message }: { message: string }) => {
            const chat = state.chats.find((c: any) =>
              c.participants.includes(contactModalPerson.id) &&
              c.participants.includes('commissioner')
            );
            await dispatchAction({
              type: 'SEND_CHAT_MESSAGE',
              payload: {
                chatId: chat?.id,
                text: message,
                targetId: contactModalPerson.id,
                targetName: contactModalPerson.name,
                targetRole: contactModalPerson.title,
                targetOrg: contactModalPerson.organization || 'Unknown',
                avatarUrl: contactModalPerson.playerPortraitUrl,
              },
            });
            setContactModalPerson(null);
          }}
          isLoading={state.isProcessing}
        />
      )}

      {viewingRatingsPlayer && (
        <PlayerRatingsModal
          player={viewingRatingsPlayer}
          season={state.leagueStats?.year ?? 2026}
          onClose={() => setViewingRatingsPlayer(null)}
        />
      )}

      {personSelectorOpen && preSelectedContact && (
        <PersonSelectorModal
          title={
            personSelectorType === 'bribe' ? 'Offer Bribe' :
            personSelectorType === 'dinner' ? 'Invite to Dinner' :
            personSelectorType === 'movie' ? 'Invite to Movie' :
            personSelectorType === 'suspension' ? 'Suspend Player' :
            personSelectorType === 'waive' ? 'Waive Player' :
            personSelectorType === 'sabotage' ? 'Sabotage' :
            'Action'
          }
          actionType={personSelectorType as any}
          preSelectedContact={preSelectedContact}
          skipPersonSelection={true}
          onClose={() => { setPersonSelectorOpen(false); setPreSelectedContact(null); }}
          onSelect={handlePersonSelected}
        />
      )}
    </div>
  );
};
