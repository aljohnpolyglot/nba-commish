import React, { useState, useMemo } from 'react';
import { getAllReferees, getRefereePhoto, fetchRefereeData } from '../../data/photos';
import { useGame } from '../../store/GameContext';
import { Search, X, Filter } from 'lucide-react';
import { motion } from 'motion/react';
import { ContactAvatar } from '../common/ContactAvatar';
import { convertTo2KRating } from '../../utils/helpers';

interface NewChatModalProps {
  onClose: () => void;
  onSelect: (contact: any) => void;
}

type FilterType = 'All' | 'NBA' | 'Euroleague' | 'PBA' | 'B-League' | 'G-League' | 'Endesa' | 'WNBA' | 'Draft Prospect' | 'Owner' | 'GM' | 'Coach' | 'Retired' | 'Referee';

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose, onSelect }) => {
  const { state } = useGame();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');

  React.useEffect(() => {
    fetchRefereeData();
  }, []);

  const contacts = useMemo(() => {
    const allContacts: any[] = [];
    
    // Players
    state.players.forEach(p => {
        // Exclude deceased players
        if (p.diedYear) return;

        let org = p.status || 'Free Agent';
        let league = 'NBA'; // Default
        let role = '';

        if (p.status === 'Retired' || p.tid === -3) {
            league = 'Retired';
            org = 'Retired';
            role = p.hof ? 'Retired • Hall of Famer' : 'Retired • Retired Player';
        } else if (p.status === 'WNBA' || p.tid === -100) {
            league = 'WNBA';
            const team = state.nonNBATeams.find(t => t.league === 'WNBA' && t.tid === p.tid);
            if (team) org = team.name;
        } else if (p.tid === -2 || p.status === 'Draft Prospect' || p.status === 'Prospect') {
            league = 'Draft Prospect';
            org = 'Draft Prospect';
        } else if (['PBA', 'Euroleague', 'B-League', 'G-League', 'Endesa'].includes(p.status || '')) {
            league = p.status as FilterType;
            const team = state.nonNBATeams.find(t => t.league === p.status && t.tid === p.tid);
            if (team) org = team.name;
        }

        const team = state.teams.find(t => t.id === p.tid);
        if (team && !['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'WNBA', 'Draft Prospect'].includes(league)) {
            org = team.name;
            league = 'NBA';
        }

        const rating2k = convertTo2KRating(p.overallRating || 0, p.ratings?.[p.ratings.length - 1]?.hgt ?? 50, p.ratings?.[p.ratings.length - 1]?.tp);

        allContacts.push({
            id: p.internalId,
            name: p.name,
            role: role || `${p.status === 'Draft Prospect' || p.status === 'Prospect' ? 'Prospect' : 'Player'} • ${org}`,
            org: org,
            league: league,
            avatarUrl: p.imgURL,
            ovr: Math.round(rating2k),
            teamId: p.tid,
            teamLogoUrl: team?.logoUrl
        });
    });

    // Staff
    if (state.staff) {
        state.staff.owners.forEach(o => {
          const team = state.teams.find(t => t.name === o.team);
          allContacts.push({ id: o.name, name: o.name, role: `Owner • ${o.team}`, org: o.team, league: 'Owner', avatarUrl: o.playerPortraitUrl, ovr: 0, teamLogoUrl: team?.logoUrl });
        });
        state.staff.gms.forEach(g => {
          const team = state.teams.find(t => t.name === g.team);
          allContacts.push({ id: g.name, name: g.name, role: `GM • ${g.team}`, org: g.team, league: 'GM', avatarUrl: g.playerPortraitUrl, ovr: 0, teamLogoUrl: team?.logoUrl });
        });
        state.staff.coaches.forEach(c => {
          const team = state.teams.find(t => t.name === c.team);
          allContacts.push({ id: c.name, name: c.name, role: `Coach • ${c.team}`, org: c.team, league: 'Coach', avatarUrl: c.playerPortraitUrl, ovr: 0, teamLogoUrl: team?.logoUrl });
        });
    }

    // Referees
    getAllReferees().forEach(ref => {
      allContacts.push({
        id: `ref-${ref.id}`,
        name: ref.name,
        role: `NBA Official • #${ref.id}`,
        org: 'NBA Officials',
        league: 'Referee',
        avatarUrl: getRefereePhoto(ref.name),
        ovr: 0,
        teamLogoUrl: undefined
      });
    });

    return allContacts.sort((a, b) => {
        const isStaffA = ['Owner', 'GM', 'Coach', 'Referee'].includes(a.league);
        const isStaffB = ['Owner', 'GM', 'Coach', 'Referee'].includes(b.league);
        
        if (isStaffA && isStaffB) {
            // Both are staff, sort alphabetically by team (org)
            return (a.org || '').localeCompare(b.org || '');
        } else if (!isStaffA && !isStaffB) {
            // Both are players, sort by ovr descending
            return (b.ovr || 0) - (a.ovr || 0);
        } else {
            // Players before staff
            return isStaffA ? 1 : -1;
        }
    });
  }, [state.players, state.staff, state.teams, state.nonNBATeams]);

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.org?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (activeFilter === 'All') return true;

    return c.league === activeFilter;
  }).slice(0, 50); // Limit to 50 for performance

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
      >
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">New Message</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Search people..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {(['All', 'NBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'WNBA', 'Draft Prospect', 'Owner', 'GM', 'Coach', 'Retired', 'Referee'] as FilterType[]).map((filter) => (
                <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                        activeFilter === filter 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                >
                    {filter}
                </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {filteredContacts.map((contact, i) => {
            const isRetired = contact.league === 'Retired' || contact.role?.toLowerCase().includes('retired');
            const showOvr = contact.ovr > 0 && !isRetired;
            
            return (
              <button
                key={`${contact.id}-${i}`}
                onClick={() => onSelect(contact)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 rounded-lg transition-colors text-left"
              >
                <ContactAvatar 
                  name={contact.name} 
                  portraitUrl={contact.avatarUrl} 
                  teamLogoUrl={contact.teamLogoUrl} 
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-200 truncate">{contact.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                      {contact.role}
                  </div>
                </div>
              </button>
            );
          })}
          {filteredContacts.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No contacts found
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
