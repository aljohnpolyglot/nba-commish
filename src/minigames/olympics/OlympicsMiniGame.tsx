import React, { useState } from 'react';
import { Player, EventResult } from './types';
import { EVENTS } from './lib/calculator';
import { Loader2, Anchor, Users, Trophy, ChevronLeft, Play, Medal, AlertCircle, Search, User, X, CheckSquare, Square } from 'lucide-react';
import { TrackSvg } from './components/TrackSvg';
import { FieldSvg } from './components/FieldSvg';
import { RaceView } from './components/RaceView';
import { JumpView } from './components/JumpView';
import { TugOfWarMatch } from './components/TugOfWarMatch';
import { SumoMatch } from './components/SumoMatch';
import { MarathonView } from './components/MarathonView';
import { RockClimbingView } from './components/RockClimbingView';
import { EventIcon } from './components/EventIcon';

const DEFAULT_URL = 'https://raw.githubusercontent.com/alexnoob/BasketBall-GM-Rosters/master/2025-26.NBA.Roster.json';

type AppStage = 'setup' | 'loading' | 'selection' | 'combat_mode_selection' | 'player_selection' | 'map_selection' | 'competition';

const RELAY_COLORS_HEX = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#f97316', '#ec4899', '#06b6d4'];

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<AppStage>('setup');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentResults, setCurrentResults] = useState<(EventResult & { rank: number, teamMembers?: Player[], teamColorIdx?: number })[]>([]);
  const [gameSeed, setGameSeed] = useState(1);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const isTugOfWar = selectedEventId === 'tug-of-war';
  const isSumo = selectedEventId === 'sumo';

  const parseBBGMJSON = (data: any) => {
    try {
      if (!data || !data.players || !Array.isArray(data.players)) {
        throw new Error('Invalid JSON format: missing or invalid players array');
      }

      const teamAbbrevs = new Map<number, string>();
      const teamNames = new Map<number, string>();
      if (data.teams && Array.isArray(data.teams)) {
        for (const t of data.teams) {
          if (t.tid !== undefined) {
             if (t.abbrev) teamAbbrevs.set(t.tid, t.abbrev);
             const fullName = [t.region, t.name].filter(Boolean).join(' ');
             if (fullName) teamNames.set(t.tid, fullName);
          }
        }
      }

      const parsedPlayers: Player[] = [];
      const currentYear = data.startingSeason || new Date().getFullYear();

      for (const p of data.players) {
        if (!p.ratings || !Array.isArray(p.ratings) || p.ratings.length === 0) continue;
        
        const latestRating = p.ratings[p.ratings.length - 1];
        const weightLbs = p.weight || 215; 
        const wtRating = Math.max(0, Math.min(99, ((weightLbs - 150) / (330 - 150)) * 99));
        
        parsedPlayers.push({
            pid: p.pid ?? Math.random(),
            firstName: p.firstName || p.name?.split(' ')[0] || 'Unknown',
            lastName: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
            tid: p.tid,
            teamAbbrev: teamAbbrevs.get(p.tid) || 'FA',
            teamName: teamNames.get(p.tid) || teamAbbrevs.get(p.tid) || 'Free Agent',
            age: p.born ? currentYear - p.born.year : 25,
            ovr: latestRating.ovr || 50,
            hgt: latestRating.hgt || 0,
            spd: latestRating.spd || 0,
            jmp: latestRating.jmp || 0,
            str: latestRating.stre || 0,
            end: latestRating.endu || 0,
            pss: latestRating.pss || 0,
            wtRating: wtRating,
            weightLbs: weightLbs,
            imgURL: p.imgURL || '',
          });
      }
      
      setPlayers(parsedPlayers);
    } catch (e: any) {
      setError(`Failed to parse BBGM data: ${e.message}`);
      throw e;
    }
  };

  const handleStartDefault = async () => {
    if (players.length > 0) {
      setStage('selection');
      return;
    }
    
    setStage('loading');
    setError(null);
    try {
      const response = await fetch(DEFAULT_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      parseBBGMJSON(data);
      setStage('selection');
    } catch (e: any) {
      setError(`Failed to fetch default JSON: ${e.message}`);
      setStage('setup');
    }
  };

  const doGenerateResults = (eventId: string, pIds: number[], seed: number) => {
    const event = EVENTS.find(e => e.id === eventId);
    if (!event) return [];
    const isRelay = event.id.startsWith('4x');
    const competingPlayers = pIds.length > 0 
        ? players.filter(p => pIds.includes(p.pid)).sort((a,b) => pIds.indexOf(a.pid) - pIds.indexOf(b.pid))
        : players; // Order matters for relay

    let results: (EventResult & { rank: number, teamMembers?: Player[], teamColorIdx?: number })[] = [];
    const relayColorNames = ['Amber', 'Blue', 'Green', 'Red', 'Purple', 'Orange', 'Pink', 'Cyan'];

    if (isRelay) {
      const numTeams = Math.floor(competingPlayers.length / 4);
      for(let i=0; i<numTeams; i++) {
        const teamPlayers = competingPlayers.slice(i*4, i*4+4);
        let totalScore = 0;
        for (const p of teamPlayers) {
          totalScore += event.calculate(p, seed);
        }
        const displayScore = event.format(totalScore);
        const p = teamPlayers[0];
        results.push({
           player: { ...p, lastName: `${relayColorNames[i % relayColorNames.length]} Team`, firstName: `Relay` },
           score: totalScore,
           displayScore,
           isSurprise: false,
           rank: 0,
           teamMembers: teamPlayers,
           teamColorIdx: i % RELAY_COLORS_HEX.length
        });
      }
    } else {
      results = competingPlayers.map(p => {
        const rawScore = event.calculate(p, seed);
        return {
          player: p,
          score: rawScore,
          displayScore: event.format(rawScore),
          isSurprise: false, 
          rank: 0,
        };
      });
    }

    results.sort((a, b) => {
      if (event.sortOrder === 'asc') return a.score - b.score;
      return b.score - a.score;
    });

    results.forEach((r, i) => { r.rank = i + 1; });
    return results;
  };

  const withRanks = (results: EventResult[]) =>
    results.map((result, index) => ({ ...result, rank: result.rank ?? index + 1 }));

  const renderSingleEvent = (eventId: string) => {
    const event = EVENTS.find(e => e.id === eventId);
    if (!event) return null;
    const isRelay = event.id.startsWith('4x');
    const isJump = event.id?.includes('jump') || event.id === 'javelin' || event.id === 'shot_put' || event.id === 'discus' || event.id === 'hammer_throw';
    const isMarathon = event.id === 'marathon';
    const displayedResults = isMarathon ? currentResults : currentResults.slice(0, 10);
    
    return (
      <div className="bg-zinc-900 rounded-xl overflow-hidden">
        <div className="px-6 py-6 border-b border-zinc-800 bg-zinc-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-y-2 relative">
          <div>
            <h3 className="text-2xl font-display font-medium tracking-tight text-zinc-100 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-amber-500" />
              {event.name} Results
            </h3>
            <p className="text-zinc-400 font-mono text-sm mt-1">Olympic Gold Standard: <strong className="text-amber-500">{event.goldStandardDisplay}</strong></p>
          </div>
        </div>
          
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
             <h4 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                {isMarathon ? `Global Top ${displayedResults.length}` : 'Global Top 10'}
             </h4>
          </div>

          <div className="overflow-x-auto pb-4">
            <table className="w-full min-w-max text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="text-zinc-500 font-medium uppercase tracking-wider text-xs border-b border-zinc-800 bg-zinc-950/40">
                  <th className="px-4 py-3 sm:px-6 sm:py-4 w-12 sm:w-16">Rank</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Team</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">Competitor{isRelay ? 's' : ''}</th>
                  {isJump ? (
                     <>
                        <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Round 1</th>
                        <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Round 2</th>
                     </>
                  ) : null}
                  <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {displayedResults.map((res, i) => {
                  const isGold = i === 0;
                  const isSilver = i === 1;
                  const isBronze = i === 2;

                  return (
                    <tr key={res.player.pid} className={`hover:bg-zinc-800/30 transition-colors ${isGold ? 'bg-amber-500/5' : ''}`}>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">
                        {isGold ? <span className="text-xl inline-block mr-2 pb-0.5">🥇</span> : 
                         isSilver ? <span className="text-xl inline-block mr-2 pb-0.5">🥈</span> : 
                         isBronze ? <span className="text-xl inline-block mr-2 pb-0.5">🥉</span> : 
                         <span className="text-zinc-500">{i + 1}</span>}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4 font-medium text-zinc-200">
                        {isRelay ? (
                          <div className="flex items-center gap-3">
                             <div className="w-4 h-4 rounded-full" style={{ backgroundColor: res.teamColorIdx !== undefined ? RELAY_COLORS_HEX[res.teamColorIdx] : '#f59e0b' }} />
                             <span className="font-sans text-xs sm:text-base">{res.player.lastName}</span>
                          </div>
                        ) : (
                          <div className="text-zinc-400 font-sans text-xs sm:text-sm">{res.player.teamName || res.player.teamAbbrev}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-6 sm:py-4">
                        {isRelay && res.teamMembers ? (
                          <div className="flex items-center -space-x-3">
                             {res.teamMembers.map(member => (
                               <div key={member.pid} className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-zinc-900 bg-zinc-800" title={`${member.firstName} ${member.lastName}`}>
                                 {member.imgURL ? (
                                   <img src={member.imgURL} alt={member.lastName} className="w-full h-full object-cover" />
                                 ) : (
                                   <div className="w-full h-full flex items-center justify-center font-bold uppercase text-[10px] text-zinc-500 bg-zinc-800">
                                     {member.lastName.slice(0, 2)}
                                   </div>
                                 )}
                               </div>
                             ))}
                          </div>
                        ) : (
                           <div className="flex items-center gap-3">
                             <div className={`w-10 h-10 rounded-full overflow-hidden shrink-0 border ${isGold ? 'border-amber-400 bg-amber-900/50' : 'border-zinc-700 bg-zinc-800'}`}>
                               {res.player.imgURL ? (
                                 <img src={res.player.imgURL} alt={res.player.lastName} className="w-full h-full object-cover" />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center font-bold uppercase text-[10px] text-zinc-500 bg-zinc-800">
                                   {res.player.lastName.slice(0, 2)}
                                 </div>
                               )}
                             </div>
                             <span className="font-sans text-base font-medium text-zinc-200">{res.player.firstName} {res.player.lastName}</span>
                           </div>
                        )}
                      </td>
                      {isJump ? (
                          <>
                              <td className="px-4 py-3 sm:px-6 sm:py-4 text-right text-zinc-400">{res.round1Score || '-'}</td>
                              <td className={`px-4 py-3 sm:px-6 sm:py-4 text-right ${res.round2Score === 'DNQ' ? 'text-zinc-600' : 'text-zinc-400'}`}>{res.round2Score || '-'}</td>
                          </>
                      ) : null}
                      <td className="px-4 py-3 sm:px-6 sm:py-4 text-right text-zinc-100 font-medium text-base">
                        {res.displayScore}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
    );
  };

  const renderTugOfWarQuickResults = () => {
    return (
      <div className="bg-zinc-900 rounded-xl overflow-hidden">
        <div className="px-6 py-6 border-b border-zinc-800 bg-zinc-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-y-2 relative">
          <div>
            <h3 className="text-2xl font-display font-medium tracking-tight text-zinc-100 flex items-center gap-3">
              <Users className="w-6 h-6 text-amber-500" />
              Tug of War Match Results
            </h3>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {currentResults.map((teamRes, i) => (
              <div key={i} className={`p-6 rounded-2xl border ${teamRes.rank === 1 ? 'border-amber-500/50 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
                 <h4 className="text-xl font-bold font-display uppercase tracking-widest text-white mb-4 flex items-center justify-between">
                     {teamRes.teamColorIdx === 0 ? <span className="text-amber-500">Team Amber</span> : <span className="text-blue-500">Team Blue</span>}
                     {teamRes.rank === 1 && <Trophy className="w-6 h-6 text-amber-500" />}
                 </h4>
                 <div className="text-sm font-mono text-zinc-400 mb-4">{teamRes.rank === 1 ? 'WINNER' : 'DEFEATED'}</div>
                 <div className="space-y-3">
                    {teamRes.teamMembers?.map(member => (
                       <div key={member.pid} className="flex items-center gap-3 bg-zinc-950 p-2 rounded-lg border border-zinc-800/50">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700">
                             {member.imgURL ? <img src={member.imgURL} alt={member.lastName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-[10px] text-zinc-500 uppercase">{member.lastName.slice(0, 2)}</div>}
                          </div>
                          <div>
                             <div className="text-zinc-200 font-medium text-sm">{member.firstName} {member.lastName}</div>
                             <div className="text-zinc-500 text-xs font-mono">{member.teamName || member.teamAbbrev}</div>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTugOfWar = () => {
    if (players.length === 0) return null;

    const teamMap = new Map<number, { player: Player, score: number }[]>();
    
    players.forEach(p => {
      if (p.tid !== undefined && p.tid >= 0) {
        if (!teamMap.has(p.tid)) {
          teamMap.set(p.tid, []);
        }
        const score = p.str * 0.65 + (Math.min(99, p.weightLbs / 300 * 99)) * 0.35;
        teamMap.get(p.tid)!.push({ player: p, score });
      }
    });

    const results = Array.from(teamMap.entries()).map(([tid, teamPlayers]) => {
      teamPlayers.sort((a, b) => b.score - a.score);
      const top12 = teamPlayers.slice(0, 12);
      const totalStrength = top12.reduce((sum, tp) => sum + tp.score, 0);
      return {
        tid,
        teamAbbrev: top12[0].player.teamAbbrev,
        teamName: top12[0].player.teamName || top12[0].player.teamAbbrev,
        totalStrength,
        roster: top12,
        anchors: top12.slice(0, 3),
        weakestLink: top12[top12.length - 1],
      };
    }).sort((a, b) => b.totalStrength - a.totalStrength);

    return (
      <div className="bg-zinc-900 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-zinc-800 bg-zinc-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-y-2 relative">
          <h3 className="text-xl sm:text-2xl font-display font-medium tracking-tight text-zinc-100 flex items-center gap-3">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
            Tug of War Power Rankings
          </h3>
          <div className="text-sm font-mono text-zinc-400 sm:pr-12">
            Team Power Rankings
          </div>
        </div>
          
          <div className="divide-y divide-zinc-800/60">
            {results.map((team, i) => (
              <div key={team.tid} className="p-4 sm:p-6 hover:bg-zinc-800/30 transition-colors flex flex-col lg:flex-row gap-4 sm:gap-6 items-start lg:items-center">
                
                <div className="flex-shrink-0 flex items-center gap-3 sm:gap-4 w-40 sm:w-52">
                  <div className="text-3xl font-display font-bold text-zinc-700 w-12 text-right">
                    #{i + 1}
                  </div>
                  <div>
                    <div className="text-xl font-bold text-zinc-100 uppercase tracking-wide truncate max-w-[200px]" title={team.teamName}>{team.teamName}</div>
                    <div className="text-sm font-mono text-indigo-400 font-medium mt-0.5 whitespace-nowrap">
                      {team.totalStrength.toFixed(1)} <span className="text-zinc-500 font-normal">PWR</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/80">
                    <div className="text-xs font-mono text-emerald-400/80 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                      <Anchor className="w-3.5 h-3.5" />
                      Top 3 Anchors
                    </div>
                    <div className="space-y-2">
                      {team.anchors.map((ach, j) => (
                        <div key={j} className="flex justify-between items-center text-sm gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 flex items-center justify-center">
                              {ach.player.imgURL ? (
                                <img src={ach.player.imgURL} alt={ach.player.lastName} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-3 h-3 text-zinc-500" />
                              )}
                            </div>
                            <span className="text-zinc-300 font-medium truncate">
                              {ach.player.firstName} {ach.player.lastName}
                            </span>
                          </div>
                          <span className="font-mono text-emerald-400 flex-shrink-0">
                            {ach.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-zinc-950/50 rounded-lg p-4 border border-zinc-800/80 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-mono text-rose-400/80 mb-3 uppercase tracking-wider">
                        Weakest Link (12th Man)
                      </div>
                      {team.weakestLink ? (
                        <div className="flex justify-between items-center text-sm gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800 shrink-0 border border-zinc-700 flex items-center justify-center">
                              {team.weakestLink.player.imgURL ? (
                                <img src={team.weakestLink.player.imgURL} alt={team.weakestLink.player.lastName} className="w-full h-full object-cover" />
                              ) : (
                                <User className="w-3 h-3 text-zinc-500" />
                              )}
                            </div>
                            <span className="text-zinc-300 font-medium truncate">
                              {team.weakestLink.player.firstName} {team.weakestLink.player.lastName}
                            </span>
                          </div>
                          <span className="font-mono text-rose-400 flex-shrink-0">
                            {team.weakestLink.score.toFixed(1)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-600">Not enough players</div>
                      )}
                    </div>
                    
                    <div className="text-xs text-zinc-500 font-mono mt-4 pt-4 border-t border-zinc-800/50">
                       <span className="text-zinc-500">Team Avg:</span> <span className="text-zinc-400">{(team.totalStrength / team.roster.length).toFixed(1)}</span>
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>
    );
  };

  if (stage === 'setup') {
     return (
       <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-sans">
         <div className="w-24 h-24 rounded-full bg-amber-500/10 flex items-center justify-center mb-8 ring-1 ring-amber-500/20">
             <Medal className="w-12 h-12 text-amber-500" />
         </div>
         <h1 className="text-5xl md:text-7xl font-display font-bold text-white tracking-tight mb-6 text-center">
           OLYMPIC <span className="text-amber-500">GAMES</span>
         </h1>
         <p className="text-zinc-400 font-mono mb-12 max-w-lg leading-relaxed text-sm mx-auto">
           Watch your favorite stars compete for gold in a full suite of Olympic events, from Track to Sumo.
         </p>
         
         <button 
           onClick={handleStartDefault} 
           className="bg-white hover:bg-zinc-200 text-black px-8 py-4 rounded-full font-bold font-display text-xl uppercase tracking-wider transition-all flex items-center gap-3 mb-8 shadow-2xl hover:scale-105 active:scale-95"
         >
           Start Games <Play className="w-5 h-5 fill-black" />
         </button>
         
         {error && (
            <div className="mb-6 flex items-center gap-2 text-red-400 font-mono text-sm max-w-md bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4" /> {error}
            </div>
         )}
         
       </div>
     );
  }

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center font-sans">
         <Loader2 className="w-12 h-12 animate-spin text-amber-500 mb-8" />
         <h2 className="text-2xl font-display font-semibold text-white tracking-tight mb-3">Preparing the Games</h2>
         <p className="text-zinc-500 font-mono text-sm uppercase tracking-widest outline outline-1 outline-zinc-800/50 bg-zinc-900/50 px-4 py-1.5 rounded-full">Organizing Heats...</p>
      </div>
    );
  }

  if (stage === 'selection') {
     return (
       <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 lg:p-12 font-sans selection:bg-amber-500/30">
         <div className="max-w-5xl mx-auto">
           <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-800/80 pb-6 mb-8 lg:pb-8 lg:mb-12">
               <div>
                   <h1 className="text-4xl font-display font-bold text-white tracking-tight flex items-center gap-4">
                      <Medal className="w-9 h-9 text-amber-500" />
                      Select Event
                   </h1>
                   <p className="text-zinc-500 font-mono mt-4 text-sm bg-zinc-900/50 inline-block px-3 py-1 rounded-md border border-zinc-800">
                      Roster: <span className="text-zinc-300">{players.length} competitors ready</span>
                   </p>
               </div>
               <button 
                  onClick={() => setStage('setup')}
                  className="mt-6 md:mt-0 text-zinc-500 hover:text-zinc-300 font-mono text-xs uppercase tracking-widest border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors px-4 py-2 rounded-lg"
               >
                 Change Roster
               </button>
           </header>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {EVENTS.filter(ev => ev.id !== 'golf').map(ev => {
                  return (
                      <button 
                         key={ev.id}
                        onClick={() => { 
                            if (ev.id === 'marathon') {
                                setSelectedEventId(ev.id);
                                setStage('map_selection');
                            } else if (ev.id === 'sumo') {
                                setSelectedEventId(ev.id);
                                setStage('combat_mode_selection');
                            } else {
                                setSelectedEventId(ev.id); 
                                setStage('player_selection'); 
                            }
                        }}
                        className="group relative bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-8 hover:border-amber-500/50 hover:bg-zinc-900 hover:shadow-2xl hover:shadow-amber-500/5 transition-all text-left flex flex-col items-center justify-center aspect-square"
                      >
                         <div className="w-24 h-24 rounded-full bg-zinc-900 border border-zinc-800/80 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-amber-500/40 transition-all duration-500 shadow-xl relative overflow-hidden group-hover:shadow-amber-500/20">
                            <EventIcon name={ev.name} className="w-12 h-12 text-zinc-300 group-hover:scale-110 transition-transform duration-300 z-10 relative opacity-60 group-hover:opacity-100" />
                            <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/20 to-transparent group-hover:from-amber-500/10 transition-colors duration-300" />
                         </div>
                         <h3 className="text-xl font-display font-bold text-zinc-300 group-hover:text-white transition-colors uppercase tracking-widest text-center">{ev.name}</h3>
                         {ev.id === 'sumo' && (
                            <span className="absolute top-5 right-5 text-[10px] bg-red-500/10 text-red-500 px-2.5 py-1 rounded font-mono uppercase font-bold tracking-widest border border-red-500/20">Combat</span>
                         )}
                      </button>
                  );
              })}
              
              <button 
                 onClick={() => { 
                     setSelectedEventId('tug-of-war'); 
                     setStage('combat_mode_selection');
                 }}
                 className="group relative bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-8 hover:border-amber-500/50 hover:bg-zinc-900 hover:shadow-2xl hover:shadow-amber-500/5 transition-all text-left flex flex-col items-center justify-center aspect-square"
              >
                 <div className="w-24 h-24 rounded-full bg-zinc-900 border border-zinc-800/80 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-amber-500/40 transition-all duration-500 shadow-xl relative overflow-hidden group-hover:shadow-amber-500/20">
                    <EventIcon name="tug" className="w-12 h-12 text-zinc-300 group-hover:scale-110 transition-transform duration-300 z-10 relative opacity-60 group-hover:opacity-100" />
                    <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/20 to-transparent group-hover:from-amber-500/10 transition-colors duration-300" />
                 </div>
                 <h3 className="text-xl font-display font-bold text-zinc-300 group-hover:text-white transition-colors uppercase tracking-widest text-center">Tug of War</h3>
                 <span className="absolute top-5 right-5 text-[10px] bg-indigo-500/10 text-indigo-400 px-2.5 py-1 rounded font-mono uppercase font-bold tracking-widest border border-indigo-500/20">Team Event</span>
              </button>
           </div>
         </div>

         {/* Removed the inline selectedEventId modal check here since it is moved to 'competition' stage below */}
       </div>
     );
  }

  if (stage === 'combat_mode_selection') {
      const eventName = isSumo ? 'Sumo Wrestling' : 'Tug of War';
      return (
         <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 md:p-12 pb-24 text-zinc-300 selection:bg-amber-500/30 font-sans">
            <div className="max-w-4xl mx-auto">
                 <button 
                    onClick={() => { setStage('selection'); setSelectedEventId(null); }} 
                    className="flex items-center gap-2 text-zinc-500 hover:text-white mb-6 sm:mb-10 font-mono text-sm uppercase tracking-widest transition-colors group px-4 py-2 -ml-4"
                 >
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Events
                 </button>

                 <h2 className="text-4xl font-display font-bold text-white mb-2">Select {eventName} Mode</h2>
                 <p className="text-zinc-400 mb-10 font-mono text-sm uppercase tracking-widest">Choose how you want to play</p>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                     <button 
                        onClick={() => {
                            setParticipantIds([]);
                            setStage('player_selection');
                        }}
                        className="text-left bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800/80 rounded-2xl p-8 transition-all group"
                     >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold text-white uppercase tracking-wider">Quick Match</h3>
                        </div>
                        <p className="text-zinc-400">
                            {isSumo 
                                ? "Handpick two competitors and watch them battle it out head-to-head in the dohyo." 
                                : "Handpick your competitors, form two even teams, and watch them battle it out on the rope."}
                        </p>
                     </button>
                     
                     <button 
                        disabled
                        className="text-left bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-8 transition-all opacity-60 cursor-not-allowed group relative"
                     >
                        <span className="absolute top-4 right-4 text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded font-mono uppercase font-bold tracking-widest border border-zinc-700">Soon</span>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500">
                                <Trophy className="w-6 h-6" />
                            </div>
                            <h3 className="text-2xl font-bold text-zinc-500 uppercase tracking-wider">Tournament</h3>
                        </div>
                        <p className="text-zinc-600">
                           {isSumo 
                               ? "The ultimate bracket. Simulation involving top seeded 32 competitors." 
                               : "The ultimate team powerhouse ranking. Simulation involving all distinct teams."}
                        </p>
                     </button>
                 </div>
            </div>
         </div>
      );
  }

  if (stage === 'player_selection') {
    const event = EVENTS.find(e => e.id === selectedEventId);
    const uniqueTeams = Array.from(new Set(players.map(p => p.tid))).filter((t): t is number => typeof t === 'number' && t >= 0).sort((a,b) => a - b);
    
    const filteredByTeam = teamFilter !== null ? players.filter(p => p.tid === teamFilter) : players;
    const displayedPlayers = searchQuery.trim() === '' 
        ? filteredByTeam 
        : filteredByTeam.filter(p => {
            const query = searchQuery.toLowerCase();
            return (p.firstName || '').toLowerCase().includes(query) || 
                   (p.lastName || '').toLowerCase().includes(query) || 
                   (p.teamName || '').toLowerCase().includes(query) ||
                   (p.teamAbbrev || '').toLowerCase().includes(query);
        });

    const isSprint = event?.unit === 's' && event?.id !== 'marathon' && event?.id !== 'rock_climbing';
    const isMarathon = event?.id === 'marathon';
    const isRockClimbing = event?.id === 'rock_climbing';
    const isJump = event?.id?.includes('jump') || event?.id === 'javelin' || event?.id === 'shot_put' || event?.id === 'discus' || event?.id === 'hammer_throw';
    const isRelay = event && event.id.startsWith('4x');
    const maxPlayers = isSumo ? 2 : (isRelay ? 32 : (isMarathon ? Infinity : (isRockClimbing ? 4 : (isTugOfWar ? Infinity : ((isSprint || isJump) ? 8 : Infinity)))));

    const relayColors = ['amber', 'blue', 'green', 'red', 'purple', 'orange', 'pink', 'cyan'];

    const getProceedButtonText = () => {
        if (!selectedEventId) return 'Proceed to Event';
        const evId = selectedEventId;
        if (evId === 'tug-of-war') return 'Head to Rope';
        if (evId === 'sumo') return 'Enter Dohyo';
        if (evId === 'marathon') return 'Head to Marathon Course';
        if (evId === '100m' || evId === '200m' || evId === '400m' || evId === '800m' || evId === '1500m' || evId.startsWith('4x') || evId.includes('hurdles')) {
            return 'Head to Track';
        }
        if (evId === 'high_jump') return 'Head to High Jump Mat';
        if (evId === 'long_jump' || evId === 'triple_jump') return 'Head to Jump Runway';
        if (evId === 'javelin') return 'Head to Javelin Runway';
        if (evId === 'shot_put') return 'Head to Shot Put Circle';
        if (evId === 'discus') return 'Head to Discus Circle';
        if (evId === 'hammer_throw') return 'Head to Hammer Cage';
        return 'Head to Court';
    };

    return (
        <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 md:p-12 pb-24 text-zinc-300 selection:bg-amber-500/30 font-sans">
            <div className="max-w-6xl mx-auto">
                 <button 
                    onClick={() => { setStage('selection'); setSelectedEventId(null); }} 
                    className="flex items-center gap-2 text-zinc-500 hover:text-white mb-6 sm:mb-10 font-mono text-sm uppercase tracking-widest transition-colors group px-4 py-2 -ml-4"
                 >
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Events Menu
                 </button>
                 
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-6">
                    <div>
                        <h2 className="text-4xl font-display font-bold text-white flex items-center gap-3">
                            {event ? <EventIcon name={event.name} className="w-8 h-8 opacity-80 text-white" /> : null}
                            Select Competitors
                        </h2>
                        <p className="text-zinc-500 font-mono text-sm mt-3 bg-zinc-900/50 inline-block px-3 py-1.5 rounded-md border border-zinc-800/80">
                           {event?.name} / <strong className="text-amber-400">{participantIds.length}</strong> selected (Min: {isRelay ? 8 : 2}{maxPlayers !== Infinity ? `, Max: ${maxPlayers}` : ''})
                        </p>
                    </div>
                    <button
                        disabled={participantIds.length < 2 || (isRelay && participantIds.length % 4 !== 0) || (isTugOfWar && participantIds.length % 2 !== 0) || (isSumo && participantIds.length !== 2) || (participantIds.length > maxPlayers)}
                        onClick={() => {
                            const newSeed = gameSeed + 1;
                            setGameSeed(newSeed);
                            if (isTugOfWar || isSumo) {
                                // Don't generate results via events array since combat matches uses custom logic
                                setStage('competition');
                                setShowResults(false);
                            } else {
                                setCurrentResults(doGenerateResults(selectedEventId!, participantIds, newSeed));
                                setStage('competition');
                                setShowResults(false);
                                const ev = EVENTS.find(e => e.id === selectedEventId);
                                const isJumpEvent = ev?.id?.includes('jump') || ev?.id === 'javelin' || ev?.id === 'shot_put' || ev?.id === 'discus' || ev?.id === 'hammer_throw';
                                const isMarathonEvent = ev?.id === 'marathon';
                                const isRockClimbingEvent = ev?.id === 'rock_climbing';
                                if (!isSprint && !isJumpEvent && !isMarathonEvent && !isRockClimbingEvent) {
                                    setTimeout(() => setShowResults(true), 2500);
                                }
                            }
                        }}
                        className="bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-50 disabled:hover:bg-zinc-100 px-8 py-3.5 rounded-full font-bold font-display tracking-widest uppercase flex items-center gap-3 transition-all transform active:scale-95"
                    >
                        {getProceedButtonText()} <Play className="w-4 h-4 fill-zinc-900" />
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-zinc-900/80 p-4 border border-zinc-800 rounded-xl mb-6 shadow-xl">
                    <div className="flex-1 flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input 
                                type="text"
                                placeholder="Search competitors by name or team..."
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-200 pl-10 pr-4 py-2 outline-none focus:border-amber-500/50 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col flex-wrap sm:flex-row sm:items-center gap-3">
                            <span className="text-xs text-zinc-500 font-mono uppercase tracking-widest whitespace-nowrap hidden sm:block">Filter:</span>
                            <div className="relative w-full sm:w-auto">
                                <Users className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select 
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-md text-sm text-zinc-200 pl-9 pr-4 py-2 outline-none focus:border-amber-500/50 appearance-none cursor-pointer sm:min-w-[160px]" 
                                    value={teamFilter === null ? '' : teamFilter} 
                                    onChange={e => setTeamFilter(e.target.value ? Number(e.target.value) : null)}
                                >
                                    <option value="">All Teams ({players.length})</option>
                                    {uniqueTeams.map(tid => {
                                        const teamPlayers = players.filter(p => p.tid === tid);
                                        const teamName = teamPlayers[0]?.teamName || teamPlayers[0]?.teamAbbrev || 'Unknown';
                                        return <option key={tid} value={tid}>{teamName} ({teamPlayers.length})</option>
                                    })}
                                </select>
                            </div>
                        </div>
                        
                        {participantIds.length > 0 && (
                            <button
                                onClick={() => setParticipantIds([])}
                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 text-sm font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {displayedPlayers.map(p => {
                        const isSelected = participantIds.includes(p.pid);
                        const isDisabled = !isSelected && participantIds.length >= maxPlayers;
                        
                        let selectColor = 'amber-500';
                        let selectBg = 'bg-amber-500/10';
                        let selectBorder = 'border-amber-500/50';
                        let selectText = 'text-amber-100';
                        let selectShadow = 'shadow-[0_0_15px_rgba(245,158,11,0.1)]';
                        let selectImgBg = 'bg-amber-950';

                        if (isRelay && isSelected) {
                            const index = participantIds.indexOf(p.pid);
                            const teamIdx = Math.floor(index / 4);
                            const col = relayColors[teamIdx % relayColors.length];
                            // Tailwind dynamic colors aren't perfectly supported like this so we Map it
                            const colorMap: Record<string, any> = {
                                'amber': { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-100', shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.1)]', imgBg: 'bg-amber-950', textM: 'text-amber-500/80' },
                                'blue': { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-100', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.1)]', imgBg: 'bg-blue-950', textM: 'text-blue-500/80' },
                                'green': { border: 'border-green-500/50', bg: 'bg-green-500/10', text: 'text-green-100', shadow: 'shadow-[0_0_15px_rgba(34,197,94,0.1)]', imgBg: 'bg-green-950', textM: 'text-green-500/80' },
                                'red': { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-100', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.1)]', imgBg: 'bg-red-950', textM: 'text-red-500/80' },
                                'purple': { border: 'border-purple-500/50', bg: 'bg-purple-500/10', text: 'text-purple-100', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.1)]', imgBg: 'bg-purple-950', textM: 'text-purple-500/80' },
                                'orange': { border: 'border-orange-500/50', bg: 'bg-orange-500/10', text: 'text-orange-100', shadow: 'shadow-[0_0_15px_rgba(249,115,22,0.1)]', imgBg: 'bg-orange-950', textM: 'text-orange-500/80' },
                                'pink': { border: 'border-pink-500/50', bg: 'bg-pink-500/10', text: 'text-pink-100', shadow: 'shadow-[0_0_15px_rgba(236,72,153,0.1)]', imgBg: 'bg-pink-950', textM: 'text-pink-500/80' },
                                'cyan': { border: 'border-cyan-500/50', bg: 'bg-cyan-500/10', text: 'text-cyan-100', shadow: 'shadow-[0_0_15px_rgba(6,182,214,0.1)]', imgBg: 'bg-cyan-950', textM: 'text-cyan-500/80' },
                            };
                            const c = colorMap[col] || colorMap['amber'];
                            selectBorder = c.border;
                            selectBg = c.bg;
                            selectText = c.text;
                            selectShadow = c.shadow;
                            selectImgBg = c.imgBg;
                            selectColor = c.textM;
                        } else if ((isTugOfWar || isSumo) && isSelected) {
                            const index = participantIds.indexOf(p.pid);
                            const isTeam1 = index % 2 === 0;
                            const col = isTeam1 ? 'amber' : 'red'; // Changed blue to red to match sumo visual
                            const colorMap: Record<string, any> = {
                                'amber': { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-100', shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.1)]', imgBg: 'bg-amber-950', textM: 'text-amber-500/80' },
                                'red': { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-100', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.1)]', imgBg: 'bg-red-950', textM: 'text-red-500/80' },
                                'blue': { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-100', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.1)]', imgBg: 'bg-blue-950', textM: 'text-blue-500/80' }
                            };
                            const c = colorMap[isSumo ? (isTeam1 ? 'red' : 'blue') : col];
                            selectBorder = c.border;
                            selectBg = c.bg;
                            selectText = c.text;
                            selectShadow = c.shadow;
                            selectImgBg = c.imgBg;
                            selectColor = c.textM;
                        } else {
                            selectColor = 'text-amber-500/80';
                        }

                        return (
                            <label key={p.pid} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isDisabled ? 'opacity-50 cursor-not-allowed bg-zinc-950 border-zinc-900' : 'cursor-pointer active:scale-95'} ${isSelected ? `${selectBg} ${selectBorder} ${selectText} ${selectShadow}` : (!isDisabled ? 'bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/80' : '')}`}>
                                <input type="checkbox" className="hidden" disabled={isDisabled} checked={isSelected} onChange={() => {
                                    setParticipantIds(prev => prev.includes(p.pid) ? prev.filter(id => id !== p.pid) : [...prev, p.pid]);
                                }} />
                                <div className={`w-10 h-10 rounded-full overflow-hidden shrink-0 border ${isSelected ? `${selectBorder} ${selectImgBg}` : 'border-zinc-700 bg-zinc-950'}`}>
                                    {p.imgURL ? <img src={p.imgURL} alt={p.lastName} className="w-full h-full object-cover" /> : <User className="w-5 h-5 m-auto text-zinc-600 mt-2.5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate font-sans tracking-wide">
                                        {p.firstName} <strong className="font-bold">{p.lastName}</strong>
                                    </div>
                                    <div className={`text-xs font-mono tracking-widest mt-0.5 ${isSelected ? selectColor : 'text-zinc-600'}`}>
                                        {p.teamName || p.teamAbbrev}
                                    </div>
                                </div>
                            </label>
                        )
                    })}
                </div>
            </div>
        </div>
    );
  }

  if (stage === 'map_selection') {
      return (
         <div className="min-h-screen bg-zinc-950 p-4 sm:p-8 md:p-12 pb-24 text-zinc-300 selection:bg-amber-500/30 font-sans">
            <div className="max-w-4xl mx-auto">
                 <button 
                    onClick={() => { setStage('selection'); setSelectedEventId(null); }} 
                    className="flex items-center gap-2 text-zinc-500 hover:text-white mb-6 sm:mb-10 font-mono text-sm uppercase tracking-widest transition-colors group px-4 py-2 -ml-4"
                 >
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Events
                 </button>

                 <h2 className="text-4xl font-display font-bold text-white mb-2">Select Map</h2>
                 <p className="text-zinc-400 mb-10 font-mono text-sm uppercase tracking-widest">Choose a course for the Marathon</p>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                     <button 
                        onClick={() => {
                            setStage('player_selection');
                        }}
                        className="text-left bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800/80 rounded-2xl p-6 transition-all group"
                     >
                        <div className="h-40 w-full bg-zinc-800 rounded-xl mb-6 relative overflow-hidden flex items-center justify-center border border-zinc-700/50">
                            <div className="absolute inset-0 bg-[url('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Boston_Marathon_route.png/800px-Boston_Marathon_route.png')] bg-cover bg-center opacity-30 mix-blend-luminosity group-hover:opacity-60 transition-opacity"></div>
                            <span className="relative z-10 font-black text-2xl uppercase tracking-widest text-white drop-shadow-xl">Boston</span>
                        </div>
                        <h3 className="text-xl font-bold text-zinc-200 mb-2">Boston Marathon</h3>
                        <p className="text-zinc-500 text-sm">42.195 km • Point-to-Point • Historic</p>
                     </button>
                 </div>
            </div>
         </div>
      );
  }

  if (stage === 'competition') {
      const event = EVENTS.find(e => e.id === selectedEventId);
      const competingPlayers = players.filter(p => participantIds.includes(p.pid)).sort((a,b) => participantIds.indexOf(a.pid) - participantIds.indexOf(b.pid));
      let SvgComponent = TrackSvg;
      
      if (isTugOfWar || isSumo) {
          SvgComponent = FieldSvg;
      } else {
          const lowerName = event?.name.toLowerCase() || '';
          if (lowerName.includes('jump') || lowerName.includes('shot put') || lowerName.includes('discus') || lowerName.includes('javelin') || lowerName.includes('hammer')) {
              SvgComponent = FieldSvg;
          }
      }

      const isSprint = event?.unit === 's' && event?.id !== 'marathon' && event?.id !== 'rock_climbing';
      const isMarathon = event?.id === 'marathon';
      const isRockClimbing = event?.id === 'rock_climbing';

      const isJump = event?.id?.includes('jump') || event?.id === 'javelin' || event?.id === 'shot_put' || event?.id === 'discus' || event?.id === 'hammer_throw';
      const isRelay = event && event.id.startsWith('4x');
      const maxPlayers = isRelay ? 32 : (isMarathon ? Infinity : (isRockClimbing ? 4 : ((isSprint || isJump) ? 8 : Infinity)));

      return (
         <div className="min-h-screen bg-zinc-950 flex flex-col font-sans relative overflow-hidden">
             
             {/* Dynamic SVG Background */}
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 md:p-12 opacity-90 animate-in fade-in zoom-in-95 duration-1000">
                 {(!isSumo && !isTugOfWar && !isRockClimbing) && (showResults || (!isSprint && !isJump && !isMarathon)) && <SvgComponent className="w-full h-full max-h-[80vh] object-contain drop-shadow-2xl" />}
             </div>

             {/* Cancel/Exit button when event is in progress and not showing results */}
             {!showResults && (
                 <div className="absolute top-4 left-4 z-40 pointer-events-auto">
                     <button
                         onClick={() => setShowExitConfirm(true)}
                         className="flex items-center gap-2 bg-zinc-900/95 hover:bg-zinc-850 text-zinc-400 hover:text-white px-4 py-2 rounded-xl border border-zinc-800/80 backdrop-blur-md shadow-xl transition-all cursor-pointer font-mono text-xs uppercase tracking-widest active:scale-95"
                     >
                         <ChevronLeft className="w-4 h-4" /> Cancel Event
                     </button>
                 </div>
             )}

             <div className="relative z-10 w-full p-0 sm:p-6 md:p-12 max-w-5xl mx-auto flex-1 flex flex-col justify-center pointer-events-none">
                 {!showResults && (
                     <>
                     {isSprint ? (
                         <div className="pointer-events-auto w-full">
                           <RaceView 
                              event={event!} 
                              players={competingPlayers.slice(0, maxPlayers)} 
                              gameSeed={gameSeed}
                              isPaused={showExitConfirm}
                              onFinish={() => {
                              setShowResults(true);
                              }} 
                           />
                         </div>
                     ) : isMarathon ? (
                         <div className="pointer-events-auto w-full">
                           <MarathonView 
                              event={event!} 
                              players={competingPlayers} 
                              gameSeed={gameSeed}
                              isPaused={showExitConfirm}
                              onFinish={(results) => {
                                  setCurrentResults(results);
                                  setShowResults(true);
                              }}
                           />
                         </div>
                     ) : selectedEventId === 'rock_climbing' ? (
                         <div className="pointer-events-auto w-full">
                             <RockClimbingView 
                                 event={event!} 
                                 players={competingPlayers}
                                 gameSeed={gameSeed}
                                 isPaused={showExitConfirm}
                                 onFinish={(results) => {
                                     setCurrentResults(withRanks(results));
                                     setShowResults(true);
                                 }}
                             />
                         </div>
                     ) : isTugOfWar ? (
                         <div className="pointer-events-auto w-full">
                             <TugOfWarMatch 
                                 players={competingPlayers}
                                 gameSeed={gameSeed}
                                 isPaused={showExitConfirm}
                                 onFinish={(results) => {
                                     setCurrentResults(results);
                                     setShowResults(true);
                                 }}
                             />
                         </div>
                     ) : isSumo ? (
                         <div className="pointer-events-auto w-full">
                             <SumoMatch 
                                 players={competingPlayers}
                                 gameSeed={gameSeed}
                                 isPaused={showExitConfirm}
                                 onFinish={(results) => {
                                     setCurrentResults(results);
                                     setShowResults(true);
                                 }}
                             />
                         </div>
                     ) : isJump ? (
                         <div className="pointer-events-auto w-full">
                           <JumpView 
                              event={event!} 
                              players={competingPlayers} 
                              gameSeed={gameSeed}
                              isPaused={showExitConfirm}
                              onFinish={(results) => {
                                  setCurrentResults(results);
                                  setShowResults(true);
                              }} 
                           />
                         </div>
                     ) : (
                         <div className="bg-zinc-950/80 backdrop-blur-xl px-10 py-10 rounded-3xl border border-zinc-800/80 flex flex-col items-center self-center shadow-2xl animate-in zoom-in-95 duration-300 pointer-events-auto">
                             <div className="relative w-20 h-20 mb-8 flex justify-center items-center">
                                 <div className="absolute inset-0 border-4 border-amber-500/20 rounded-full"></div>
                                 <div className="absolute inset-0 border-4 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
                                 {event ? <EventIcon name={event.name} className="w-8 h-8 opacity-80 text-white" /> : <Users className="w-8 h-8 text-amber-500" />}
                             </div>
                             <h3 className="text-3xl font-display font-black text-white tracking-widest uppercase mb-3 text-center">
                                 Event in Progress
                             </h3>
                             <p className="text-zinc-400 font-mono text-sm tracking-widest uppercase text-center">
                                 {isTugOfWar ? 'Calculating Team Powers...' : `${participantIds.length} Competitors Competing...`}
                             </p>
                         </div>
                     )}
                     </>
                 )}
             </div>

             {/* Results Modal */}
             {showResults && (
               <div className="absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                 <div 
                   className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md transition-opacity" 
                   onClick={() => setStage('selection')} 
                 />
                 <div className="relative z-10 w-full max-w-5xl max-h-[90vh] flex flex-col bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-500">
                    <button 
                      onClick={() => { setStage('selection'); setSelectedEventId(null); setSelectedPlayerId(null); }}
                      className="absolute top-6 right-6 text-zinc-500 hover:text-white bg-zinc-900 hover:bg-zinc-800 p-2.5 rounded-full z-20 transition-all active:scale-95"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    <div className="overflow-y-auto overflow-x-hidden flex-1 custom-scrollbar p-1">
                      {isTugOfWar ? renderTugOfWarQuickResults() : renderSingleEvent(selectedEventId!)}
                    </div>
                 </div>
               </div>
             )}

             {/* Exit Confirmation Modal */}
             {showExitConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center transform scale-100 animate-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2 font-display">Cancel Event?</h4>
                        <p className="text-zinc-400 text-sm mb-6">Are you sure you want to cancel the event? All current attempts and progress will be reset.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowExitConfirm(false)}
                                className="flex-1 py-2.5 rounded-xl bg-zinc-805 hover:bg-zinc-800 text-zinc-205 border border-zinc-800 font-bold uppercase text-xs tracking-widest transition-all font-mono active:scale-95 cursor-pointer"
                            >
                                Resume
                            </button>
                            <button
                                onClick={() => {
                                    setShowExitConfirm(false);
                                    setStage('selection');
                                    setSelectedEventId(null);
                                    setSelectedPlayerId(null);
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-red-650 hover:bg-red-600 text-white font-bold uppercase text-xs tracking-widest transition-all shadow-lg shadow-red-600/10 font-mono active:scale-95 cursor-pointer"
                            >
                                Exit Event
                            </button>
                        </div>
                    </div>
                </div>
             )}
         </div>
      );
  }

  return null;
}
