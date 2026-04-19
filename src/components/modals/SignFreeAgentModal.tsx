import React, { useState, useMemo, useEffect } from 'react';
import { useGame } from '../../store/GameContext';
import { X, Search, User, CheckCircle2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NBAPlayer, NBATeam } from '../../types';
import { convertTo2KRating } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';
import SigningModal from './SigningModal';
import { classifyResignIntent } from '../central/view/PlayerBioMoraleTab';
import { computeMoodScore, normalizeMoodTraits } from '../../utils/mood/moodScore';

interface SigningDetails {
  playerId: string;
  teamId: number;
  playerName: string;
  teamName: string;
  salary: number;
  years: number;
  option: 'NONE' | 'PLAYER' | 'TEAM';
  twoWay: boolean;
  mleType: 'room' | 'non_taxpayer' | 'taxpayer' | null;
}

interface SignFreeAgentModalProps {
  onClose: () => void;
  onConfirm: (payload: SigningDetails) => void;
  /** Skip player picker and jump straight to team/negotiation for this player. */
  initialPlayer?: NBAPlayer;
  /** When set, skip team picker entirely (used for re-signings — team is the player's current team). */
  initialTeam?: NBATeam;
  /** Force the SigningModal's initial contract-type tab (e.g. 'GUARANTEED' for the 2W → Guaranteed promotion flow). */
  forceContractType?: 'GUARANTEED' | 'TWO_WAY';
}

export const SignFreeAgentModal: React.FC<SignFreeAgentModalProps> = ({ onClose, onConfirm, initialPlayer, initialTeam, forceContractType }) => {
  const { state, dispatchAction } = useGame();
  const isGM = state.gameMode === 'gm';
  const userTeam = useMemo(
    () => (isGM && state.userTeamId != null ? state.teams.find(t => t.id === state.userTeamId) ?? null : null),
    [isGM, state.userTeamId, state.teams],
  );

  type Step = 'player' | 'team' | 'negotiate';
  const lockedTeam = initialTeam ?? (isGM ? userTeam : null);
  const initialStep: Step = initialPlayer
    ? (lockedTeam ? 'negotiate' : 'team')
    : 'player';
  const [step, setStep] = useState<Step>(initialStep);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<NBAPlayer | null>(initialPlayer ?? null);
  const [selectedTeam, setSelectedTeam] = useState<NBATeam | null>(initialPlayer && lockedTeam ? lockedTeam : null);

  useEffect(() => {
    // In GM mode the team is pre-locked to the user's franchise.
    if (isGM && userTeam) setSelectedTeam(userTeam);
  }, [isGM, userTeam]);

  const freeAgents = useMemo(() => {
    return state.players.filter(p => {
      if (p.status === 'Retired' || p.status === 'WNBA' || p.tid === -100) return false;
      if (p.tid === -2 || p.status === 'Prospect' || p.status === 'Draft Prospect') return false;
      const isInternational = ['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(p.status || '');
      const isNBAFreeAgent = p.tid === -1 || p.status === 'Free Agent';
      return isInternational || isNBAFreeAgent;
    });
  }, [state.players]);

  const filteredPlayers = useMemo(() => {
    return freeAgents.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => b.overallRating - a.overallRating).slice(0, 1000);
  }, [freeAgents, searchTerm]);

  const filteredTeams = useMemo(() => {
    return state.teams.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.abbrev.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [state.teams, searchTerm]);

  // In negotiation step, SigningModal is the source of truth.
  // Commissioner mode auto-accepts the offer (executive authority); GM must win the interest check.
  if (step === 'negotiate' && selectedPlayer && selectedTeam) {
    // Re-sign preflight (GM mode only): if the player's contract thoughts say they're testing the market,
    // show the "Acknowledge" message in advance instead of opening the negotiation UI.
    let preflightMessage: { title: string; body: string; tone?: 'neutral' | 'positive' } | undefined;
    const isResign = selectedPlayer.tid === selectedTeam.id;
    // Preflight fires in both modes — but commissioner gets an override button via autoAccept.
    if (isResign) {
      const traits = normalizeMoodTraits((selectedPlayer as any).moodTraits ?? []);
      const { score } = computeMoodScore(
        selectedPlayer,
        selectedTeam,
        state.date,
        false, false, false,
        state.players.filter(p => p.tid === selectedPlayer.tid),
        state.leagueStats?.year,
      );
      const gp = (selectedTeam.wins ?? 0) + (selectedTeam.losses ?? 0);
      const winPct = gp > 0 ? (selectedTeam.wins ?? 0) / gp : 0.5;
      const intent = classifyResignIntent(selectedPlayer, traits, score, state.leagueStats?.year ?? 2026, winPct);
      if (intent === 'testing_market') {
        preflightMessage = {
          title: 'Testing Free Agency',
          body: `"My contract is up — I want to see what the market looks like before we talk extension. No hard feelings, it's just business."`,
          tone: 'neutral',
        };
      } else if (intent === 'farewell') {
        preflightMessage = {
          title: 'Farewell Tour',
          body: `"This is it for me. I've made my decision — I'm finishing out this season and walking away. An extension isn't in the cards."`,
          tone: 'neutral',
        };
      }
    }

    return (
      <SigningModal
        player={selectedPlayer}
        team={selectedTeam}
        leagueStats={state.leagueStats}
        autoAccept={!isGM}
        preflightMessage={preflightMessage}
        initialContractType={forceContractType}
        onClose={onClose}
        onSign={({ salary, years, option, twoWay, mleType }) => {
          onConfirm({
            playerId: selectedPlayer.internalId,
            teamId: selectedTeam.id,
            playerName: selectedPlayer.name,
            teamName: selectedTeam.name,
            salary,
            years,
            option,
            twoWay,
            mleType,
          });
        }}
        onSubmitBid={({ salary, years, option }) => {
          // Bidding-war path — post a competing offer into state.faBidding.markets
          // instead of signing right away. The ticker resolves it alongside AI bids
          // 3-5 days later. No tid/contract mutation happens here.
          dispatchAction({
            type: 'SUBMIT_FA_BID',
            payload: {
              playerId: selectedPlayer.internalId,
              playerName: selectedPlayer.name,
              teamId: selectedTeam.id,
              teamName: selectedTeam.name,
              teamLogoUrl: (selectedTeam as any).logoUrl,
              salaryUSD: salary,
              years,
              option,
            },
          } as any);
        }}
      />
    );
  }

  const goNextFromPlayer = () => {
    if (!selectedPlayer) return;
    if (lockedTeam) {
      setSelectedTeam(lockedTeam);
      setStep('negotiate');
    } else {
      setStep('team');
      setSearchTerm('');
    }
  };

  const goToNegotiation = () => {
    if (!selectedTeam) return;
    setStep('negotiate');
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
          className="bg-slate-900 border border-slate-800 w-[95vw] max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] md:max-h-[85vh]"
        >
          <div className="p-4 md:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
            <div className="flex items-center gap-2 md:gap-3 text-indigo-400">
                <User size={20} className="md:w-6 md:h-6" />
                <h3 className="text-lg md:text-xl font-black uppercase tracking-tight text-white">
                    {step === 'player'
                      ? (isGM && userTeam ? `Select Free Agent for ${userTeam.name}` : 'Select Free Agent')
                      : `Sign to ${selectedTeam?.name || 'Team'}`}
                </h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4 md:space-y-6">
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={step === 'player' ? "Search free agents..." : "Search teams..."}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-200 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none placeholder:text-slate-700 transition-all"
                    autoFocus
                />
            </div>

            {step === 'player' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredPlayers.map(player => (
                        <button
                            key={player.internalId}
                            onClick={() => setSelectedPlayer(player)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                                selectedPlayer?.internalId === player.internalId
                                    ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                                    : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <img src={getPlayerImage(player)} alt={player.name} className="w-10 h-10 rounded-full object-cover bg-slate-800" referrerPolicy="no-referrer" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate text-white">{player.name}</div>
                                <div className="text-xs text-slate-500">
                                    {player.pos} • OVR: {convertTo2KRating(player.overallRating, player.ratings?.[player.ratings.length - 1]?.hgt ?? 50, player.ratings?.[player.ratings.length - 1]?.tp)}
                                    {['Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '') && (
                                        <span className="ml-1 text-indigo-400 font-bold tracking-tighter">• {player.status}</span>
                                    )}
                                </div>
                            </div>
                            {selectedPlayer?.internalId === player.internalId && <CheckCircle2 size={16} className="text-indigo-400" />}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredTeams.map(team => (
                        <button
                            key={team.id}
                            onClick={() => setSelectedTeam(team)}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                                selectedTeam?.id === team.id
                                    ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                                    : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <div className="w-10 h-10 bg-slate-950 rounded-lg flex items-center justify-center p-1">
                                <img src={team.logoUrl} alt={team.abbrev} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate text-white">{team.name}</div>
                                <div className="text-xs text-slate-500">{team.conference}ern Conference</div>
                            </div>
                            {selectedTeam?.id === team.id && <CheckCircle2 size={16} className="text-indigo-400" />}
                        </button>
                    ))}
                </div>
            )}
          </div>

          <div className="p-4 md:p-6 border-t border-slate-800 bg-slate-900/50 flex flex-col md:flex-row justify-end gap-3">
            <button onClick={onClose} className="px-4 py-3 md:py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-white hover:bg-slate-800 transition-colors uppercase tracking-wider w-full md:w-auto text-center">
                Cancel
            </button>
            {step === 'player' ? (
                <button
                    onClick={goNextFromPlayer}
                    disabled={!selectedPlayer}
                    className="px-6 py-3 md:py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all uppercase tracking-wider flex items-center justify-center gap-2 w-full md:w-auto"
                >
                    {isGM && userTeam ? 'Open Negotiation' : 'Next: Select Team'} <ArrowRight size={14} />
                </button>
            ) : (
                <button
                    onClick={goToNegotiation}
                    disabled={!selectedTeam}
                    className="px-6 py-3 md:py-2 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all uppercase tracking-wider w-full md:w-auto text-center"
                >
                    Open Negotiation
                </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
