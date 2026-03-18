import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, ListFilter, Trophy, Briefcase, Scale, UserCheck, Building2,
  ChevronDown, User, Loader2, ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGame } from '../../../store/GameContext';
import type { StaffMember } from '../../../types';
import { ContactAvatar } from '../../common/ContactAvatar';
// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface Personnel {
  id: string;
  name: string;
  type: 'gm' | 'owner' | 'coach' | 'referee' | 'league_office';
  jobTitle?: string;
  team?: string;
  number?: string;   // referee jersey number
  conf?: string;     // coach conference
  div?: string;      // coach division
  slug?: string;     // for worker fetch
playerPortraitUrl?: string;
  teamLogoUrl?: string;
}

// ─────────────────────────────────────────────────────────────────
// HARDCODED DATA  (workers require a slug — lists can't be fetched)
// ─────────────────────────────────────────────────────────────────

export const REFS: { id: string; name: string; slug: string }[] = [
  { id: '54', name: 'Ray Acosta',             slug: 'ray-acosta' },
  { id: '67', name: 'Brandon Adair',          slug: 'brandon-adair' },
  { id: '36', name: 'Brent Barnaky',          slug: 'brent-barnaky' },
  { id: '74', name: 'Curtis Blair',           slug: 'courtney-kirkland-2' },
  { id: '25', name: 'Tony Brothers',          slug: 'tony-brothers' },
  { id: '3',  name: 'Nick Buchert',           slug: 'nick-buchert' },
  { id: '30', name: 'John Butler',            slug: 'john-butler' },
  { id: '19', name: 'James Capers',           slug: 'james-capers' },
  { id: '11', name: 'Derrick Collins',        slug: 'derrick-collins' },
  { id: '79', name: 'John Conley',            slug: 'john-conley' },
  { id: '33', name: 'Sean Corbin',            slug: 'sean-corbin' },
  { id: '34', name: 'Kevin Cutler',           slug: 'kevin-cutler' },
  { id: '28', name: 'Mousa Dagher',           slug: 'mousa-dagher' },
  { id: '37', name: 'Eric Dalen',             slug: 'eric-dalen' },
  { id: '8',  name: 'Marc Davis',             slug: 'marc-davis' },
  { id: '22', name: 'JB DeRosa',              slug: 'jb-derosa' },
  { id: '27', name: 'Mitchell Ervin',         slug: 'mitchell-ervin' },
  { id: '91', name: "Che Flores",             slug: 'cheryl-flores' },
  { id: '39', name: 'Tyler Ford',             slug: 'tyler-ford' },
  { id: '45', name: 'Brian Forte',            slug: 'brian-forte' },
  { id: '48', name: 'Scott Foster',           slug: 'scott-foster' },
  { id: '26', name: 'Pat Fraher',             slug: 'pat-fraher' },
  { id: '68', name: 'Jacyn Goble',            slug: 'jacyn-goble' },
  { id: '10', name: 'John Goble',             slug: 'john-goble' },
  { id: '35', name: 'Jason Goldenberg',       slug: 'jason-goldenberg' },
  { id: '65', name: 'Nate Green',             slug: 'nate-green' },
  { id: '16', name: 'David Guthrie',          slug: 'david-guthrie' },
  { id: '7',  name: 'Lauren Holtkamp-Sterling', slug: 'lauren-holtkamp' },
  { id: '85', name: 'Robert Hussey',          slug: 'robert-hussey' },
  { id: '96', name: 'Intae Hwang',            slug: 'intae-hwang' },
  { id: '81', name: 'Simone Jelks',           slug: 'simone-jelks' },
  { id: '88', name: 'Matt Kallio',            slug: 'matt-kallio' },
  { id: '55', name: 'Bill Kennedy',           slug: 'bill-kennedy' },
  { id: '61', name: 'Courtney Kirkland',      slug: 'courtney-kirkland' },
  { id: '32', name: 'Marat Kogut',            slug: 'marat-kogut' },
  { id: '77', name: 'Karl Lane',              slug: 'karl-lane' },
  { id: '29', name: 'Mark Lindsay',           slug: 'mark-lindsay' },
  { id: '23', name: 'Tre Maddox',             slug: 'tre-maddox' },
  { id: '14', name: 'Ed Malloy',              slug: 'ed-malloy' },
  { id: '82', name: 'Suyash Mehta',           slug: 'suyash-mehta' },
  { id: '98', name: "Sha'rae Mitchell",       slug: 'sharae-mitchell' },
  { id: '89', name: 'Dannica Mosher',         slug: 'dannica-mosher' },
  { id: '71', name: 'Rodney Mott',            slug: 'rodney-mott' },
  { id: '13', name: 'Ashley Moyer-Gleich',    slug: 'ashley-moyer-gleich' },
  { id: '43', name: 'Matt Myers',             slug: 'matt-myers' },
  { id: '83', name: 'Andy Nagy',              slug: 'andy-nagy' },
  { id: '44', name: 'Brett Nansel',           slug: 'brett-nansel' },
  { id: '72', name: 'J.T. Orr',              slug: 'j-t-orr' },
  { id: '50', name: 'Gediminas Petraitis',    slug: 'gediminas-petraitis' },
  { id: '94', name: 'JD Ralls',              slug: 'jd-ralls' },
  { id: '70', name: 'Phenizee Ransom',        slug: 'phenizee-ransom' },
  { id: '63', name: 'Derek Richardson',       slug: 'derek-richardson' },
  { id: '95', name: 'Tyler Ricks',            slug: 'tyler-ricks' },
  { id: '84', name: 'Jenna Schroeder',        slug: 'jenna-schroeder' },
  { id: '9',  name: 'Natalie Sago',           slug: 'natalie-sago' },
  { id: '86', name: 'Brandon Schwab',         slug: 'brandon-schwab' },
  { id: '87', name: 'Danielle Scott',         slug: 'danielle-scott' },
  { id: '78', name: 'Evan Scott',             slug: 'evan-scott' },
  { id: '24', name: 'Kevin Scott',            slug: 'kevin-scott' },
  { id: '51', name: 'Aaron Smith',            slug: 'aaron-smith' },
  { id: '38', name: 'Michael Smith',          slug: 'michael-smith' },
  { id: '17', name: 'Jonathan Sterling',      slug: 'jonathan-sterling' },
  { id: '46', name: 'Ben Taylor',             slug: 'ben-taylor' },
  { id: '21', name: 'Dedric Taylor',          slug: 'dedric-taylor' },
  { id: '58', name: 'Josh Tiven',             slug: 'joshua-tiven' },
  { id: '52', name: 'Scott Twardoski',        slug: 'scott-twardoski' },
  { id: '64', name: 'Justin Van Duyne',       slug: 'justin-van-duyne' },
  { id: '31', name: 'Scott Wall',             slug: 'scott-wall' },
  { id: '12', name: 'CJ Washington',          slug: 'cj-washington' },
  { id: '60', name: 'James Williams',         slug: 'james-williams' },
  { id: '49', name: 'Tom Washington',         slug: 'tom-washington' },
  { id: '40', name: 'Leon Wood',              slug: 'leon-wood' },
  { id: '4',  name: 'Sean Wright',            slug: 'sean-wright' },
  { id: '15', name: 'Zach Zarba',             slug: 'zach-zarba' },
];

const COACHES: {
  conf: string; div: string; name: string; team: string; slug: string; img: string;
}[] = [
  // EASTERN — ATLANTIC
  { conf: 'EAST', div: 'ATLANTIC', name: 'Joe Mazzulla',      team: 'Boston Celtics',       slug: 'joe-mazzulla',                    img: 'https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-JoeMazzulla_2025.jpg' },
  { conf: 'EAST', div: 'ATLANTIC', name: 'Jordi Fernandez',   team: 'Brooklyn Nets',         slug: 'jordi-fernandez-head-coach-bio',   img: 'https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-JordiFernandez_2025.jpg' },
  { conf: 'EAST', div: 'ATLANTIC', name: 'Mike Brown',        team: 'New York Knicks',       slug: 'mike-brown',                      img: 'https://nbacoaches.com/wp-content/uploads/2025/07/NBCA-headcoach-MikeBrown_2025.jpg' },
  { conf: 'EAST', div: 'ATLANTIC', name: 'Nick Nurse',        team: 'Philadelphia 76ers',    slug: 'nick-nurse',                      img: 'https://nbacoaches.com/wp-content/uploads/2023/05/Untitled-design-52.png' },
  { conf: 'EAST', div: 'ATLANTIC', name: 'Darko Rajaković',   team: 'Toronto Raptors',       slug: 'darko-rajakovic-head-coach-bio',   img: 'https://nbacoaches.com/wp-content/uploads/2023/06/Untitled-design-67.png' },
  // EASTERN — CENTRAL
  { conf: 'EAST', div: 'CENTRAL',  name: 'Billy Donovan',     team: 'Chicago Bulls',         slug: 'billy-donovan',                   img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-BillyDonovan-2.jpg' },
  { conf: 'EAST', div: 'CENTRAL',  name: 'Kenny Atkinson',    team: 'Cleveland Cavaliers',   slug: 'kenny-atkinson',                  img: 'https://nbacoaches.com/wp-content/uploads/2025/12/AtkinsonHeadshot-300x300.png' },
  { conf: 'EAST', div: 'CENTRAL',  name: 'J.B. Bickerstaff',  team: 'Detroit Pistons',       slug: 'j-b-bickerstaff',                 img: 'https://nbacoaches.com/wp-content/uploads/2024/07/Bickerstaff.png' },
  { conf: 'EAST', div: 'CENTRAL',  name: 'Rick Carlisle',     team: 'Indiana Pacers',        slug: 'rick-carlisle',                   img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-RickCarlisle.jpg' },
  { conf: 'EAST', div: 'CENTRAL',  name: 'Doc Rivers',        team: 'Milwaukee Bucks',       slug: 'doc-rivers',                      img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-DocRivers.jpg' },
  // EASTERN — SOUTHEAST
  { conf: 'EAST', div: 'SOUTHEAST', name: 'Quin Snyder',      team: 'Atlanta Hawks',         slug: 'quin-snyder',                     img: 'https://nbacoaches.com/wp-content/uploads/2023/02/NBCA-HeadCoach-QuinSnyder.jpg' },
  { conf: 'EAST', div: 'SOUTHEAST', name: 'Charles Lee',      team: 'Charlotte Hornets',     slug: 'charles-lee-head-coach-bio',      img: 'https://nbacoaches.com/wp-content/uploads/2024/05/CHARLES-LEE-2.png' },
  { conf: 'EAST', div: 'SOUTHEAST', name: 'Erik Spoelstra',   team: 'Miami Heat',            slug: 'erik-spoelstra',                  img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-ErikSpoelstra.jpg' },
  { conf: 'EAST', div: 'SOUTHEAST', name: 'Jamahl Mosley',    team: 'Orlando Magic',         slug: 'jamahl-mosley',                   img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-JamahlMosley.jpg' },
  { conf: 'EAST', div: 'SOUTHEAST', name: 'Brian Keefe',      team: 'Washington Wizards',    slug: 'brian-keefe',                     img: 'https://nbacoaches.com/wp-content/uploads/2024/01/Untitled-design-86.png' },
  // WESTERN — NORTHWEST
  { conf: 'WEST', div: 'NORTHWEST', name: 'David Adelman',    team: 'Denver Nuggets',        slug: 'david-adelman',                   img: 'https://nbacoaches.com/wp-content/uploads/2025/05/NBCA-HeadCoach-DavidAdelman.jpg' },
  { conf: 'WEST', div: 'NORTHWEST', name: 'Chris Finch',      team: 'Minnesota Timberwolves',slug: 'chris-finch',                     img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-ChrisFinch.jpg' },
  { conf: 'WEST', div: 'NORTHWEST', name: 'Mark Daigneault',  team: 'OKC Thunder',           slug: 'mark-daigneault',                 img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-MarkDaigneault.jpg' },
  { conf: 'WEST', div: 'NORTHWEST', name: 'Chauncey Billups', team: 'Portland Blazers',      slug: 'chauncey-billups',                img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-ChaunceyBilllups.jpg' },
  { conf: 'WEST', div: 'NORTHWEST', name: 'Will Hardy',       team: 'Utah Jazz',             slug: 'will-hardy',                      img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-WillHardy.jpg' },
  // WESTERN — PACIFIC
  { conf: 'WEST', div: 'PACIFIC',   name: 'Steve Kerr',       team: 'Golden State Warriors', slug: 'steve-kerr',                      img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-SteveKerr.jpg' },
  { conf: 'WEST', div: 'PACIFIC',   name: 'Tyronn Lue',       team: 'LA Clippers',           slug: 'tyronn-lue',                      img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-TyronnLue.jpg' },
  { conf: 'WEST', div: 'PACIFIC',   name: 'JJ Redick',        team: 'LA Lakers',             slug: 'jj-redick',                       img: 'https://nbacoaches.com/wp-content/uploads/2024/06/JJ-Redick-1.png' },
  { conf: 'WEST', div: 'PACIFIC',   name: 'Jordan Ott',       team: 'Phoenix Suns',          slug: 'jordan-ott',                      img: 'https://nbacoaches.com/wp-content/uploads/2025/12/OttHeadshot.png' },
  { conf: 'WEST', div: 'PACIFIC',   name: 'Doug Christie',    team: 'Sacramento Kings',      slug: 'doug-christie',                   img: 'https://nbacoaches.com/wp-content/uploads/2025/05/NBCA-HeadCoach-dougchristie.jpg' },
  // WESTERN — SOUTHWEST
  { conf: 'WEST', div: 'SOUTHWEST', name: 'Jason Kidd',       team: 'Dallas Mavericks',      slug: 'jason-kidd',                      img: 'https://nbacoaches.com/wp-content/uploads/2022/11/NBCA-HeadCoach-JasonKidd.jpg' },
  { conf: 'WEST', div: 'SOUTHWEST', name: 'Ime Udoka',        team: 'Houston Rockets',       slug: 'ime-udoka',                       img: 'https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-ImeUdoka_2025.jpg' },
  { conf: 'WEST', div: 'SOUTHWEST', name: 'Tuomas Iisalo',    team: 'Memphis Grizzlies',     slug: 'tuomas-iisalo',                   img: 'https://nbacoaches.com/wp-content/uploads/2025/10/NBCA-headcoach-Iisalo_2025.jpg' },
  { conf: 'WEST', div: 'SOUTHWEST', name: 'Mitch Johnson',    team: 'San Antonio Spurs',     slug: 'mitchell-johnson',                img: 'https://nbacoaches.com/wp-content/uploads/2025/05/NBCA-HeadCoach-mitchjohnson.jpg' },
];

// ─────────────────────────────────────────────────────────────────
// FILTER TABS
// ─────────────────────────────────────────────────────────────────

const TYPES = [
  { id: 'all',           label: 'All',           Icon: Building2 },
  { id: 'gm',            label: 'GMs',           Icon: Briefcase },
  { id: 'owner',         label: 'Owners',        Icon: Trophy },
  { id: 'coach',         label: 'Coaches',       Icon: UserCheck },
  { id: 'referee',       label: 'Referees',      Icon: Scale },
{ id: 'league_office', label: 'Executives', Icon: Building2 },
] as const;

type FilterType = typeof TYPES[number]['id'];

// ─────────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────────

const PersonnelCard: React.FC<{ person: Personnel; onClick: () => void }> = ({ person, onClick }) => {
  const typeColors: Record<string, string> = {
    referee:       'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    coach:         'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    gm:            'text-amber-400 bg-amber-500/10 border-amber-500/20',
    owner:         'text-rose-400 bg-rose-500/10 border-rose-500/20',
    league_office: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group relative bg-slate-900/40 border border-slate-800 hover:border-indigo-500/40 rounded-3xl p-4 cursor-pointer transition-all overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full -mr-8 -mt-8 group-hover:bg-indigo-500/10 transition-all" />

      <div className="flex gap-4 items-center relative z-10">
  
        {/* Portrait */}
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
{person.type === 'referee' && person.playerPortraitUrl ? (
            <img
              src={person.playerPortraitUrl}
              alt={person.name}
              loading="lazy"
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <ContactAvatar
              name={person.name}
              portraitUrl={person.playerPortraitUrl}
              teamLogoUrl={person.teamLogoUrl}
              size="lg"
              className="w-full h-full rounded-none group-hover:scale-105 transition-transform duration-300"
            />
          )}
          {/* Number badge for refs */}
          {person.type === 'referee' && person.number && (
            <div className="absolute bottom-0 right-0 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-tl-lg leading-none">
              #{person.number}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate group-hover:text-indigo-400 transition-colors">
            {person.name}
          </h4>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
            {person.jobTitle}
          </p>
          {person.team && (
            <p className="text-[10px] font-bold text-slate-600 mt-1 truncate">{person.team}</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between relative z-10">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${typeColors[person.type]}`}>
          {person.type.replace('_', ' ')}
        </span>
        <ChevronDown size={13} className="text-slate-600 group-hover:text-indigo-400 transition-colors -rotate-90" />
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────

interface LeagueOfficeSearcherProps {
  onPersonnelClick: (person: Personnel) => void;
}

export const LeagueOfficeSearcher: React.FC<LeagueOfficeSearcherProps> = ({ onPersonnelClick }) => {
  const { state } = useGame();
  const [search, setSearch]       = useState('');
  const [refPhotos, setRefPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('https://gist.githubusercontent.com/aljohnpolyglot/39217471bf53cc1f6f5673823e0e2da1/raw/22b6f73155a3e6a8f4b652d41ab0738f1891189c/referee_pics')
      .then(r => r.json())
      .then((data: { name: string; photo_url: string }[]) => {
        const map: Record<string, string> = {};
      data.forEach(entry => {
          map[entry.name] = entry.photo_url;
        });
        setRefPhotos(map);
      })
      .catch(e => console.error('[RefPhotos] Failed to fetch:', e));
  }, []);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [confFilter, setConfFilter] = useState<'ALL' | 'EAST' | 'WEST'>('ALL');
  const [sortBy, setSortBy] = useState<'last' | 'first'>('last');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // ── Build master list from hardcoded data + state.staff ──────
  const allPersonnel = useMemo<Personnel[]>(() => {
  const refs: Personnel[] = REFS.map(r => ({
  id:                `ref-${r.id}`,
  name:              r.name,
  type:              'referee',
  jobTitle:          'NBA Official',
  number:            r.id,
  slug:              r.slug,
playerPortraitUrl: refPhotos[r.name] || undefined,
}));

    const coaches: Personnel[] = COACHES.map((c, i) => ({
      id:               `coach-${i}`,
      name:             c.name,
      type:             'coach',
      jobTitle:         'Head Coach',
      team:             c.team,
      conf:             c.conf,
      div:              c.div,
      slug:             c.slug,
   playerPortraitUrl: c.img,
      teamLogoUrl:      state.teams.find(t => t.name === c.team)?.logoUrl,
    }));

 const gms: Personnel[] = (state.staff?.gms || []).map((m: StaffMember, i: number) => ({
      id:               `gm-${i}`,
      name:             m.name,
      type:             'gm',
      jobTitle:         m.jobTitle || 'General Manager',
      team:             m.team,
      playerPortraitUrl: m.playerPortraitUrl,
      teamLogoUrl:      m.teamLogoUrl || state.teams.find(t => t.name === m.team)?.logoUrl,
    }));

    const owners: Personnel[] = (state.staff?.owners || []).map((m: StaffMember, i: number) => ({
      id:               `owner-${i}`,
      name:             m.name,
      type:             'owner',
      jobTitle:         m.jobTitle || 'Team Owner',
      team:             m.team,
      playerPortraitUrl: m.playerPortraitUrl,
      teamLogoUrl:      m.teamLogoUrl || state.teams.find(t => t.name === m.team)?.logoUrl,
    }));

    const lo: Personnel[] = (state.staff?.leagueOffice || []).map((m: StaffMember, i: number) => ({
      id:               `lo-${i}`,
      name:             m.name,
      type:             'league_office',
      jobTitle:         m.jobTitle || 'League Executive',
      playerPortraitUrl: m.playerPortraitUrl,
    }));

    return [...refs, ...coaches, ...gms, ...owners, ...lo];
}, [state.staff, state.teams, refPhotos]);

  // ── Filter & Sort ───────────────────────────────────────────
  const filtered = useMemo(() => {
    return allPersonnel
      .filter(p => {
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
            !(p.team?.toLowerCase().includes(search.toLowerCase()))) return false;
        if (confFilter !== 'ALL' && p.type === 'coach' && p.conf !== confFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const getKey = (name: string) =>
          sortBy === 'last'
            ? name.split(' ').slice(-1)[0]   // last word = last name
            : name.split(' ')[0];             // first word = first name
        const res = getKey(a.name).localeCompare(getKey(b.name));
        return sortOrder === 'asc' ? res : -res;
      });
  }, [allPersonnel, typeFilter, search, confFilter, sortBy, sortOrder]);

  return (
    <div className="flex flex-col lg:flex-row h-full gap-8">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className="w-full lg:w-72 flex-shrink-0 space-y-6 bg-slate-900/50 border border-slate-800 p-4 lg:p-6 rounded-2xl h-fit lg:sticky lg:top-0 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ListFilter size={14} className="text-indigo-500" /> Filters
          </h3>
          <button
            onClick={() => { setSearch(''); setTypeFilter('all'); setConfFilter('ALL'); }}
            className="text-[10px] font-bold text-slate-600 hover:text-indigo-400 transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto pb-1 lg:pb-0 lg:space-y-1.5">
          {TYPES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTypeFilter(id)}
              className={`flex-shrink-0 lg:w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                typeFilter === id
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              {label}
              <span className="ml-auto text-[10px] opacity-60">
                {id === 'all' ? allPersonnel.length : allPersonnel.filter(p => p.type === id).length}
              </span>
            </button>
          ))}
        </div>

        {/* Conference filter — only relevant for coaches */}
        {(typeFilter === 'all' || typeFilter === 'coach') && (
          <div className="hidden lg:block pt-4 border-t border-slate-800 space-y-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Conference</p>
            {(['ALL', 'EAST', 'WEST'] as const).map(c => (
              <button
                key={c}
                onClick={() => setConfFilter(c)}
                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  confFilter === c
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'
                }`}
              >
                {c === 'ALL' ? 'All Conferences' : `${c}ern`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grid ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or team…"
            className="w-full bg-slate-900/80 border border-slate-800 text-white pl-11 pr-4 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 text-sm"
          />
        </div>

        {/* Sort Bar */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1">
          <button
            onClick={() => { setSortBy('last'); setSortOrder(sortBy === 'last' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
            className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sortBy === 'last' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
          >
            Last Name {sortBy === 'last' && <ArrowUpDown size={12} />}
          </button>
          <button
            onClick={() => { setSortBy('first'); setSortOrder(sortBy === 'first' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
            className={`flex-1 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${sortBy === 'first' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}
          >
            First Name {sortBy === 'first' && <ArrowUpDown size={12} />}
          </button>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-700 border border-dashed border-slate-800 rounded-3xl">
            <User size={40} className="mb-3 opacity-20" />
            <p className="uppercase tracking-widest text-xs font-bold">No personnel found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(person => (
              <PersonnelCard
                key={person.id}
                person={person}
                onClick={() => onPersonnelClick(person)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};