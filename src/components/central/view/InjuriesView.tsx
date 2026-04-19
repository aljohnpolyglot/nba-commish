import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { NBAPlayer, Contact, Game } from '../../../types';
import { PlayerActionsModal } from './PlayerActionsModal';
import { PlayerBioView } from './PlayerBioView';
import { PlayerRatingsModal } from '../../modals/PlayerRatingsModal';
import ContactModal from '../../ContactModal';
import { PersonSelectorModal } from '../../modals/PersonSelectorModal';
import { BoxScoreModal } from '../../modals/BoxScoreModal';
import { format, addDays } from 'date-fns';
import { getOwnTeamId, normalizeDate } from '../../../utils/helpers';

interface InjuriesViewProps {
  filteredTeamId?: number;  // pre-filter to a single team (used in TeamDetailView)
  embedded?: boolean;       // hide header/dropdown when embedded
}

export const InjuriesView: React.FC<InjuriesViewProps> = ({ filteredTeamId, embedded }) => {
  const { state, navigateToTeam, healPlayer, dispatchAction } = useGame();
  const ownTid = getOwnTeamId(state);
  const [actionsPlayer, setActionsPlayer] = React.useState<NBAPlayer | null>(null);
  const [selectedTeamId, setSelectedTeamId] = React.useState<number | 'all'>(filteredTeamId ?? 'all');
  const [viewingBioPlayer, setViewingBioPlayer] = React.useState<NBAPlayer | null>(null);
  const [viewingRatingsPlayer, setViewingRatingsPlayer] = React.useState<NBAPlayer | null>(null);
  const [selectedPlayerContact, setSelectedPlayerContact] = React.useState<Contact | null>(null);
  const [personSelectorOpen, setPersonSelectorOpen] = React.useState(false);
  const [personSelectorType, setPersonSelectorType] = React.useState<'suspension' | 'drug_test' | 'dinner' | 'general' | 'fine' | 'bribe' | 'movie' | 'leak_scandal' | 'give_money' | 'sabotage' | 'waive'>('general');
  const [boxScoreGame, setBoxScoreGame] = React.useState<Game | null>(null);

  // Whitelist the two real date formats the sim produces. Labels like "Summer 2025"
  // are partially parseable in some browsers (V8 rejects but WebKit returns Jan 1,
  // 2025), so a pure `isNaN` check isn't enough.
  //   ISO:   "2025-10-27" (optionally with time suffix)
  //   en-US: "Oct 27, 2025"
  const isParseableInjuryDate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}/.test(s) || /^[A-Za-z]{3,}\s+\d{1,2},\s+\d{4}/.test(s);

  // Locate the scheduled (played) game that caused a specific player's injury.
  // Only in-game injuries (origin set, parseable date) are eligible. Lookup via the
  // opponent abbrev parsed from origin so the click survives trades since the injury
  // (player.tid no longer necessarily matches the original team). Dates are
  // normalized to YYYY-MM-DD on both sides — state.date uses en-US locale, while
  // schedule dates use ISO toString, so raw === never matches.
  const findInjuryGame = (player: NBAPlayer): Game | null => {
    const startDate = player.injury?.startDate;
    const origin    = player.injury?.origin;
    if (!startDate || !origin) return null;
    if (!isParseableInjuryDate(startDate)) return null;
    const d = new Date(startDate);
    if (isNaN(d.getTime())) return null;
    const normStart = normalizeDate(startDate);
    const oppMatch  = origin.match(/(?:vs|@)\s+([A-Z0-9]+)/i);
    const oppAbbrev = oppMatch?.[1]?.toUpperCase();
    const sameDate  = state.schedule.filter(sg => sg.played && normalizeDate(sg.date) === normStart);
    if (sameDate.length === 0) return null;
    if (oppAbbrev) {
      for (const g of sameDate) {
        const home = state.teams.find(t => t.id === g.homeTid);
        const away = state.teams.find(t => t.id === g.awayTid);
        if ((home as any)?.abbrev?.toUpperCase() === oppAbbrev
         || (away as any)?.abbrev?.toUpperCase() === oppAbbrev) return g;
      }
    }
    return sameDate.find(g => g.homeTid === player.tid || g.awayTid === player.tid) ?? null;
  };

  const getContactFromPlayer = (player: NBAPlayer): Contact => {
    const playerTeam = state.teams.find(t => t.id === player.tid);
    return {
      id: player.internalId,
      name: player.name,
      title: 'Player',
      organization: playerTeam?.name || 'Free Agent',
      type: 'player',
      playerPortraitUrl: player.imgURL,
    };
  };

  const handleActionSelect = (actionType: string) => {
    if (!actionsPlayer) return;
    if (actionType === 'view_bio') {
      setViewingBioPlayer(actionsPlayer);
      setActionsPlayer(null);
      return;
    }
    if (actionType === 'view_ratings') {
      setViewingRatingsPlayer(actionsPlayer);
      setActionsPlayer(null);
      return;
    }
    const contact = getContactFromPlayer(actionsPlayer);
    setActionsPlayer(null);
    if (actionType === 'contact') {
      setSelectedPlayerContact(contact);
    } else {
      setPersonSelectorType(actionType as any);
      setSelectedPlayerContact(contact);
      setPersonSelectorOpen(true);
    }
  };

  const handleSendMessage = async (params: { message: string }) => {
    if (selectedPlayerContact) {
      const chat = state.chats.find(c => c.participants.includes(selectedPlayerContact.id));
      await dispatchAction({
        type: 'SEND_CHAT_MESSAGE',
        payload: {
          chatId: chat?.id,
          text: params.message,
          targetId: selectedPlayerContact.id,
          targetName: selectedPlayerContact.name,
          targetRole: selectedPlayerContact.title,
          targetOrg: (selectedPlayerContact as any).teamId || 'Unknown',
          avatarUrl: selectedPlayerContact.playerPortraitUrl
        }
      });
      setSelectedPlayerContact(null);
    }
  };

  const handlePersonSelected = async (contacts: Contact[], reason?: string, amount?: number, location?: string, duration?: string) => {
    setPersonSelectorOpen(false);
    setSelectedPlayerContact(null);
    let actionType = '';
    if (personSelectorType === 'suspension') actionType = 'SUSPEND_PLAYER';
    if (personSelectorType === 'dinner') actionType = 'INVITE_DINNER';
    if (personSelectorType === 'movie') actionType = 'INVITE_DINNER';
    if (personSelectorType === 'fine') actionType = 'FINE_PERSON';
    if (personSelectorType === 'bribe') actionType = 'BRIBE_PERSON';
    if (personSelectorType === 'sabotage') actionType = 'SABOTAGE_PLAYER';
    if (personSelectorType === 'waive') actionType = 'WAIVE_PLAYER';
    if (!actionType) return;
    const targetNames = contacts.map(c => c.name).join(', ');
    const targetRoles = contacts.map(c => c.title).join(', ');
    const targetIds = contacts.map(c => c.id).join(',');
    let finalReason = reason || (personSelectorType === 'movie' ? 'Movie Night' : 'No reason provided.');
    if (location) finalReason += ` at ${location}`;
    await dispatchAction({
      type: actionType as any,
      payload: { targetName: targetNames, targetRole: targetRoles, targetId: targetIds, reason: finalReason, amount, duration, count: contacts.length, subType: personSelectorType, location, contacts }
    });
  };

  const injuredPlayersByTeam = useMemo(() => {
    const grouped: Record<number, NBAPlayer[]> = {};

    state.players.forEach(player => {
      if (player.injury && player.injury.gamesRemaining > 0 && player.tid >= 0) {
        if (!grouped[player.tid]) {
          grouped[player.tid] = [];
        }
        grouped[player.tid].push(player);
      }
    });

    return grouped;
  }, [state.players]);

  const teamsWithInjuries = state.teams
    .filter(t => injuredPlayersByTeam[t.id] && injuredPlayersByTeam[t.id].length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredTeamsWithInjuries = teamsWithInjuries.filter(t => selectedTeamId === 'all' || t.id === selectedTeamId);

  const getStatus = (gamesRemaining: number) => {
    if (gamesRemaining <= 3) return { text: 'Day-To-Day', color: 'text-yellow-400', dot: 'bg-yellow-400' };
    return { text: 'Out', color: 'text-rose-400', dot: 'bg-rose-500' };
  };

  const getEstReturnDate = (gamesRemaining: number) => {
    // Rough estimate: 1 game = ~2.5 days
    const daysOut = Math.ceil(gamesRemaining * 2.5);
    const returnDate = addDays(new Date(state.date), daysOut);
    return format(returnDate, 'd MMM');
  };

  const formatOccurred = (injury: NBAPlayer['injury']) => {
    if (!injury?.startDate) return '—';
    // Backfill labels ("Last Season", "Summer 2025") render verbatim — some browsers
    // would parse "Summer 2025" as Jan 1 2025, so we whitelist the real formats.
    if (!isParseableInjuryDate(injury.startDate)) return injury.startDate;
    const d = new Date(injury.startDate);
    if (isNaN(d.getTime())) return injury.startDate;
    const dateStr = format(d, 'd MMM');
    return injury.origin ? `${dateStr} ${injury.origin}` : dateStr;
  };

  const injuryComments = useMemo(() => {
    const comments = new Map<string, string>();
    const reporters = ['Shams Charania of ESPN', 'Adrian Wojnarowski of ESPN', 'Chris Haynes of NBA TV', 'Marc Stein', 'local beat writers'];

    Object.values(injuredPlayersByTeam).flat().forEach((player: NBAPlayer) => {
      const team = state.teams.find(t => t.id === player.tid);
      if (!team) return;

      const gamesOut = player.injury?.gamesRemaining || 0;
      // Stable per player, but changes when they cross the day-to-day threshold (3 games)
      const statusBucket = gamesOut <= 3 ? 0 : gamesOut <= 15 ? 1 : 2;
      const seed = player.internalId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + statusBucket;
      const reporter = reporters[seed % reporters.length];
      const injuryType = player.injury?.type?.toLowerCase() || 'injury';
      const lastName = player.name.split(' ').pop() || player.name;
      const dateStr = format(new Date(state.date), 'd MMM');

      const nextGame = state.schedule.find(g => !g.played && (g.homeTid === team.id || g.awayTid === team.id));
      let nextGameClause: string | null = null; // e.g. "Friday's game against the Rockets"
      if (nextGame) {
        const oppTid  = nextGame.homeTid === team.id ? nextGame.awayTid : nextGame.homeTid;
        const oppTeam = state.teams.find(t => t.id === oppTid);
        let day = 'the next';
        try { day = `${format(new Date(nextGame.date), 'EEEE')}'s`; } catch {}
        nextGameClause = oppTeam
          ? `${day} game against the ${oppTeam.name}`
          : `${day} game`;
      }

      let comment = '';
      if (gamesOut <= 3) {
        // No next game on the books (All-Star break, offseason) → drop the opponent clause entirely.
        const clause = nextGameClause ?? 'the next game';
        const templates = [
          `${dateStr}: ${lastName} (${injuryType}) has been ruled out for ${clause}.`,
          `${dateStr}: ${lastName} (${injuryType}) is out for ${clause}, ${reporter} reports.`,
          `${dateStr}: ${lastName} (${injuryType}) is questionable for ${clause}.`,
          `${dateStr}: ${lastName} is listed as probable for ${clause} due to ${injuryType} soreness.`
        ];
        comment = templates[seed % templates.length];
      } else if (gamesOut <= 15) {
        const weeks = Math.ceil(gamesOut / 3);
        const templates = [
          `${dateStr}: ${lastName} (${injuryType}) will be re-evaluated in ${weeks} weeks, ${reporter} reports.`,
          `${dateStr}: An MRI confirmed a ${injuryType} for ${lastName} and he will be re-evaluated in ${weeks} weeks.`,
          `${dateStr}: ${lastName} (${injuryType}) will miss the ${team.name}'s next ${gamesOut} games.`
        ];
        comment = templates[seed % templates.length];
      } else {
        const year = new Date(state.date).getFullYear();
        const templates = [
          `${dateStr}: ${lastName} will undergo surgery for a ${injuryType} and will be sidelined for the rest of the ${year} season.`,
          `${dateStr}: ${lastName} successfully underwent surgery on his ${injuryType} and will miss the remainder of the season.`,
          `${dateStr}: ${lastName} has been diagnosed with a ${injuryType} and will require season-ending surgery, ${reporter} reports.`,
          `${dateStr}: ${lastName} underwent a procedure to address ${injuryType}, and there's hope he will make a full recovery in time for next season.`
        ];
        comment = templates[seed % templates.length];
      }

      comments.set(player.internalId, comment);
    });

    return comments;
  // Note: state.date and state.schedule intentionally excluded
  // Comments only regenerate when injury status changes (out → day-to-day)
  }, [injuredPlayersByTeam, state.teams]);

  if (viewingBioPlayer) {
    return (
      <PlayerBioView
        player={viewingBioPlayer}
        onBack={() => setViewingBioPlayer(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-hidden p-4 md:p-8">
      {actionsPlayer && (
        <PlayerActionsModal
          player={actionsPlayer}
          onClose={() => setActionsPlayer(null)}
          onActionSelect={handleActionSelect}
          onHeal={() => { healPlayer(actionsPlayer.internalId); setActionsPlayer(null); }}
        />
      )}
      {viewingRatingsPlayer && (
        <PlayerRatingsModal player={viewingRatingsPlayer} season={state.leagueStats?.year ?? 2026} onClose={() => setViewingRatingsPlayer(null)} />
      )}
      {selectedPlayerContact && !personSelectorOpen && (
        <ContactModal
          contact={selectedPlayerContact}
          onClose={() => setSelectedPlayerContact(null)}
          onSend={handleSendMessage}
          isLoading={state.isProcessing}
        />
      )}
      {personSelectorOpen && (
        <PersonSelectorModal
          title=""
          actionType={personSelectorType}
          onClose={() => { setPersonSelectorOpen(false); setSelectedPlayerContact(null); }}
          onSelect={handlePersonSelected}
          preSelectedContact={selectedPlayerContact || undefined}
        />
      )}
      {boxScoreGame && (() => {
        const bsResult = state.boxScores.find((b: any) => b.gameId === boxScoreGame.gid);
        const homeTeam = state.teams.find(t => t.id === boxScoreGame.homeTid);
        const awayTeam = state.teams.find(t => t.id === boxScoreGame.awayTid);
        if (!homeTeam || !awayTeam) return null;
        return (
          <BoxScoreModal
            game={boxScoreGame}
            result={bsResult}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            players={state.players}
            onClose={() => setBoxScoreGame(null)}
            onPlayerClick={() => setBoxScoreGame(null)}
          />
        );
      })()}
      <div className={embedded ? 'h-full overflow-y-auto' : 'max-w-6xl mx-auto h-full overflow-y-auto custom-scrollbar'}>
        {!embedded && (
          <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tight">NBA Injuries</h2>
              <p className="text-slate-500 font-medium">Current injury report across the league</p>
            </div>

            <div className="w-full md:w-64">
              <select
                className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 outline-none"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">All Teams</option>
                {[...state.teams].sort((a, b) => a.name.localeCompare(b.name)).map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          {filteredTeamsWithInjuries.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No players are currently injured for the selected team(s).
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {filteredTeamsWithInjuries.map(team => {
                const isOwn = ownTid !== null && team.id === ownTid;
                return (
                <div key={team.id} className={`p-0 ${isOwn ? 'ring-2 ring-indigo-500/40 ring-inset' : ''}`}>
                  <div
                    className={`flex items-center gap-3 p-4 border-b border-slate-800/50 cursor-pointer transition-colors ${isOwn ? 'bg-indigo-500/15 hover:bg-indigo-500/20' : 'bg-slate-800/30 hover:bg-slate-800/50'}`}
                    onClick={() => navigateToTeam(team.id)}
                  >
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-xs">
                        {team.abbrev}
                      </div>
                    )}
                    <h3 className="text-lg font-bold text-white">{team.name}</h3>
                    {isOwn && <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/40">Your Team</span>}
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-400 uppercase bg-slate-900/50 border-b border-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-semibold w-48">NAME</th>
                          <th className="px-6 py-3 font-semibold w-16">POS</th>
                          <th className="px-6 py-3 font-semibold w-36 whitespace-nowrap">OCCURRED</th>
                          <th className="px-6 py-3 font-semibold w-40 whitespace-nowrap">EST. RETURN DATE</th>
                          <th className="px-6 py-3 font-semibold w-32">STATUS</th>
                          <th className="px-6 py-3 font-semibold">COMMENT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {injuredPlayersByTeam[team.id].map(player => {
                          const status = getStatus(player.injury.gamesRemaining);
                          return (
                            <tr key={player.internalId} className="hover:bg-slate-800/30 transition-colors group">
                              <td className="px-6 py-4">
                                <span 
                                  className="font-medium text-indigo-400 cursor-pointer hover:text-indigo-300 hover:underline"
                                  onClick={() => setActionsPlayer(player)}
                                >
                                  {player.name}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-slate-400 font-medium">
                                {player.pos}
                              </td>
                              <td className="px-6 py-4 text-slate-300 whitespace-nowrap font-mono text-xs">
                                {(() => {
                                  const g = findInjuryGame(player);
                                  const text = formatOccurred(player.injury);
                                  if (!g) return text;
                                  return (
                                    <span
                                      className="cursor-pointer text-indigo-400 hover:text-indigo-300 hover:underline"
                                      onClick={() => setBoxScoreGame(g)}
                                    >
                                      {text}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4 text-slate-300 whitespace-nowrap">
                                {getEstReturnDate(player.injury.gamesRemaining)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${status.dot}`}></div>
                                  <span className={`${status.color} font-medium`}>{status.text}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-slate-400 text-xs leading-relaxed">
                                {injuryComments.get(player.internalId) || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
