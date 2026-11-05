import React, { useMemo } from 'react';
import { useGame } from '../../../store/GameContext';
import { ArrowRightLeft, Calendar, Info, UserCheck, UserX, AlertTriangle, Users, Sunset, Trophy, CheckCircle, Plane, Flag } from 'lucide-react';
import { motion } from 'motion/react';
import type { NBAPlayer } from '../../../types';
import { isEuroIsolatedMode, isPbaIsolatedMode, isWnbaIsolatedMode } from '../../../utils/uiMode';
import { resolveAnyTeam } from '../../../utils/teamLookup';
import { getTeamFullName } from '../../../utils/teamNames';
import { getPlayerImage } from '../../../utils/playerImage';
import { STATIC_NBA_TEAMS, staticNbaTeamLogo } from '../../../data/staticNbaTeams';
import { normalizeDate } from '../../../utils/helpers';
import { formatGameDateShort } from '../../../utils/dateUtils';
import { getLeagueCalendarDates } from '../../../services/leagueCalendar';
import { getLeagueLabels } from '../../../utils/leagueLabels';
import { getBioByName, getNativeDraftProfileForIdentity } from '../../../data/realPlayerDataFetcher';
import { getHistoricalNbaCompletedSeasonCutoff } from '../../../services/playerDevelopment/hofHistoryWindow';
import { buildExpansionDraftHistoryEntry } from '../../../services/expansion/expansionDraftHistory';
import { sortTransactionHistoryNewestFirst, stripTransactionNarrative } from './TransactionsShared';
import type { TradeEntry } from './TradeDetailTypes';

// ─── Types & helpers ──────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
  Draft:          { color: 'text-violet-400',  bg: 'bg-violet-500/10',  icon: <Trophy size={18}/>,         label: 'Draft' },
  Trade:          { color: 'text-blue-400',    bg: 'bg-blue-500/10',    icon: <ArrowRightLeft size={18}/>, label: 'Trade' },
  Transfer:       { color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    icon: <Plane size={18}/>,          label: 'Transfer' },
  Signing:        { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <UserCheck size={18}/>,      label: 'Signing' },
  'Contract Option': { color: 'text-sky-400', bg: 'bg-sky-500/10', icon: <CheckCircle size={18}/>,        label: 'Contract Option' },
  Waive:          { color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: <UserX size={18}/>,          label: 'Waiver' },
  Suspension:     { color: 'text-rose-400',    bg: 'bg-rose-500/10',    icon: <AlertTriangle size={18}/>,  label: 'Suspension' },
  Personnel:      { color: 'text-purple-400',  bg: 'bg-purple-500/10',  icon: <Users size={18}/>,          label: 'Personnel' },
  Retirement:     { color: 'text-amber-300',   bg: 'bg-amber-500/10',   icon: <Sunset size={18}/>,         label: 'Retirement' },
  'Jersey Retirement': { color: 'text-yellow-300', bg: 'bg-yellow-500/10', icon: <Trophy size={18}/>,      label: 'Jersey Retirement' },
  Citizenship:     { color: 'text-cyan-300', bg: 'bg-cyan-500/10', icon: <Flag size={18}/>,                label: 'Citizenship' },
  'NG Guaranteed':{ color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <CheckCircle size={18}/>,    label: 'Guaranteed' },
  'League Event': { color: 'text-slate-400',   bg: 'bg-slate-800',      icon: <Info size={18}/>,           label: 'League Event' },
};

function detectType(text: string, type?: string): string {
  const t = text.toLowerCase();
  if (type === 'Personnel') return 'Personnel';
  if (type === 'Citizenship' || t.includes('obtained') && t.includes('citizenship')) return 'Citizenship';
  if (type === 'Draft'       || t.includes('overall pick of the') || t.includes('went undrafted in the')) return 'Draft';
  if (type === 'NG Guaranteed' || (t.includes('guaranteed by') && t.includes('january 10'))) return 'NG Guaranteed';
  if (type === 'Death' || t.includes('cause of death') || t.includes(' passed away ') || t.includes(' died at age ')) return 'Retirement';
  if (type === 'Jersey Retirement' || t.includes('retired #') || t.includes('retired jersey')) return 'Jersey Retirement';
  if (type === 'Retirement'  || t.includes('has retired') || t.includes('announced his retirement')) return 'Retirement';
  if (type === 'Transfer'    || t.includes('transferred from') || t.includes(' transferred to ')) return 'Transfer';
  if (type === 'Trade'       || t.includes('trade'))   return 'Trade';
  if (type === 'Contract Option' || t.includes('player option') || t.includes('team option')) return 'Contract Option';
  if (type === 'Signing'     || t.includes('signed') || t.includes('re-signed') || t.includes('signs with')) return 'Signing';
  if (type === 'Waive'       || t.includes('waived'))  return 'Waive';
  if (type === 'Suspension'  || t.includes('suspended')) return 'Suspension';
  if (t.includes('fired') || t.includes('hired')) return 'Personnel';
  return 'League Event';
}

export function isPrivatePlayerActivity(type?: string): boolean {
  return ['dinner', 'movie night'].includes(String(type ?? '').trim().toLowerCase());
}

interface PlayerBioTransactionsTabProps {
  player: NBAPlayer;
  onTradeClick?: (entry: TradeEntry) => void;
}

export function hasOriginalDraftHistoryEntry(
  entries: Array<{ kind?: string; text?: string }>,
  draftYear: number,
): boolean {
  return entries.some(entry => (
    entry.kind === 'Draft'
    && !/fantasy draft/i.test(String(entry.text ?? ''))
    && String(entry.text ?? '').includes(String(draftYear))
  ));
}

export const getPlayerBioDraftOverallPick = (round: number, pick: number, teamsPerRound: number): number =>
  (round - 1) * teamsPerRound + pick;

export const PlayerBioTransactionsTab: React.FC<PlayerBioTransactionsTabProps> = ({ player, onTradeClick }) => {
  const { state } = useGame();
  const pbaMode = isPbaIsolatedMode(state);

  // Pre-build player portrait lookup
  const playerPortraitMap = useMemo(() => {
    const m = new Map<string, string>();
    state.players.forEach(p => {
      const img = getPlayerImage(p);
      if (img) m.set(p.name.toLowerCase(), img);
    });
    return m;
  }, [state.players]);

  // Filter history to entries mentioning this player, enrich with team + portrait.
  // Prefer structured playerIds attribution (set at emission time) so two players
  // with the same name don't cross-contaminate each other's bios. Fall back to
  // substring-on-name matching for legacy entries and events that never carried
  // ids (e.g. team-option news, some league events).
  const playerTransactions = useMemo(() => {
    const name = player.name.toLowerCase();
    const pid = player.internalId;
    const nonNBATeams = (state as any).nonNBATeams ?? [];
    const pbaTeamIds = new Set(
      nonNBATeams
        .filter((team: any) => team.league === 'PBA')
        .map((team: any) => Number(team.tid ?? team.id)),
    );
    const allTeams = [
      ...state.teams,
      ...nonNBATeams
        .map((team: any) => resolveAnyTeam(Number(team.tid ?? team.id), state.teams, nonNBATeams))
        .filter(Boolean),
    ];
    const entries = sortTransactionHistoryNewestFirst([...(state.history || [])], state.date)
      .filter(raw => typeof raw === 'string' || normalizeDate((raw as any).date || state.date) <= normalizeDate(state.date))
      .map(raw => {
        const entry = typeof raw === 'string'
          ? { text: raw, date: state.date, type: undefined, playerIds: undefined as string[] | undefined }
          : raw as TradeEntry & { type?: string };
        return entry;
      })
      .filter(entry => !isPrivatePlayerActivity(entry.type))
      .filter(entry => {
        if (entry.playerIds && entry.playerIds.length > 0) {
          return entry.playerIds.includes(pid);
        }
        return (entry.text || '').toLowerCase().includes(name);
      })
      .map(entry => {
        const text = stripTransactionNarrative(entry.text || '');
        const kind = detectType(text, entry.type);

        // Find the primary team mentioned
        let team: any = null;
        for (const t of allTeams) {
          const fullName = getTeamFullName(t as any);
          if (text.includes(t.name) || text.includes(t.abbrev) || (!!fullName && text.includes(fullName))) {
            team = t;
            break;
          }
        }

        // For trades: pick the best portrait among mentioned players
        let portraitSrc = getPlayerImage(player) ?? null;
        if (kind === 'Trade') {
          // Try to find another player mentioned in the trade text to show alongside
          for (const [nm, url] of playerPortraitMap) {
            if (nm !== name && text.toLowerCase().includes(nm)) {
              portraitSrc = url; // Show best other player in trade
              break;
            }
          }
        }

        return { ...entry, kind, team, portraitSrc };
      });

    for (const transaction of player.transactions ?? []) {
      if (transaction.type !== 'expansion-draft' || !transaction.pickNum) continue;
      const alreadyRecorded = entries.some(entry =>
        entry.kind === 'Draft'
        && /expansion draft/i.test(entry.text ?? '')
        && String(entry.text ?? '').includes(String(transaction.season)),
      );
      if (alreadyRecorded) continue;
      const historyEntry = buildExpansionDraftHistoryEntry({
        state,
        player,
        tid: transaction.tid,
        pick: transaction.pickNum,
        season: transaction.season,
        date: transaction.date ?? String(transaction.season),
      });
      entries.push({
        ...historyEntry,
        kind: 'Draft',
        team: resolveAnyTeam(transaction.tid, state.teams, nonNBATeams),
        portraitSrc: getPlayerImage(player) ?? null,
      } as any);
    }

    for (const record of player.naturalizations ?? []) {
      if (normalizeDate(record.date) > normalizeDate(state.date)) continue;
      const alreadyRecorded = entries.some(entry =>
        entry.kind === 'Citizenship' && normalizeDate(entry.date) === normalizeDate(record.date),
      );
      if (alreadyRecorded) continue;
      entries.push({
        text: `${player.name} obtained ${record.country === 'Philippines' ? 'Filipino' : record.country} citizenship and became eligible to represent ${record.country} in international tournaments.`,
        date: record.date,
        type: 'Citizenship',
        playerIds: [player.internalId],
        kind: 'Citizenship',
        team: null,
        portraitSrc: getPlayerImage(player) ?? null,
      } as any);
    }

    const savedDraft = (player as any).draft;
    const nativeDraft = getNativeDraftProfileForIdentity(player);
    const draft = savedDraft && Number(savedDraft.round) > 0 && Number(savedDraft.pick) > 0
      ? savedDraft
      : nativeDraft
        ? { ...savedDraft, year: nativeDraft.year, round: nativeDraft.round, pick: nativeDraft.pick }
        : savedDraft;
    const completedSeasonCutoff = getHistoricalNbaCompletedSeasonCutoff({
      currentYear: state.leagueStats.year,
      leagueType: state.leagueType,
      moddedLeagueBase: state.moddedLeagueBase,
      nbaStartYear: state.nbaStartYear,
    }) ?? state.leagueStats.year;
    const isDrafted = draft
      && Number(draft.round) > 0
      && Number(draft.pick) > 0
      && Number(draft.year) > 0
      && Number(draft.year) <= completedSeasonCutoff;
    const hasOriginalDraftEntry = isDrafted
      ? hasOriginalDraftHistoryEntry(entries, Number(draft.year))
      : false;
    if (!hasOriginalDraftEntry && isDrafted) {
      const draftedTid = Number(draft.tid);
      const pbaDraftSourceTeam = nonNBATeams.find(
        (team: any) => team.league === 'PBA' && Number(team.tid ?? team.id) === draftedTid,
      );
      const draftAbbrev = String((player as any).draftAbbrev ?? nativeDraft?.abbrev ?? getBioByName(player.name)?.draftAbbrev ?? '').trim().toUpperCase();
      const archivedNbaTeam = draftAbbrev
        ? [...state.teams, ...((state as any).teamArchive ?? [])].find((team: any) =>
            String(team?.abbrev ?? '').toUpperCase() === draftAbbrev
            || (team?.identitySeasons ?? []).some((identity: any) => String(identity?.abbrev ?? '').toUpperCase() === draftAbbrev),
          )
        : null;
      const staticNbaTeam = draftAbbrev ? STATIC_NBA_TEAMS.find(team => team.abbrev === draftAbbrev) : null;
      const draftTeam = pbaDraftSourceTeam
        ? resolveAnyTeam(Number(pbaDraftSourceTeam.tid ?? pbaDraftSourceTeam.id), [], [pbaDraftSourceTeam])
        : archivedNbaTeam
          ?? (draftedTid >= 0 ? resolveAnyTeam(draftedTid, state.teams, nonNBATeams) : null)
          ?? (staticNbaTeam ? {
            id: staticNbaTeam.tid,
            name: staticNbaTeam.fullName,
            region: staticNbaTeam.region,
            abbrev: staticNbaTeam.abbrev,
            logoUrl: staticNbaTeamLogo(staticNbaTeam),
          } : null);
      const isPbaDraft = !!pbaDraftSourceTeam || (
        pbaMode &&
        player.status === 'PBA' &&
        !player.isImport &&
        !player.importConference &&
        !(player as any).pbaImportContract
      );
      const teamsPerRound = isPbaDraft
        ? (pbaTeamIds.size || 12)
        : isWnbaIsolatedMode(state) || state.leagueType === 'fictional'
          ? Math.max(1, state.teams.length)
          : 30;
      const leagueLabels = getLeagueLabels(state.leagueType, state.leagueStats.uiMode, state.leagueStats.leagueName);
      const draftLabel = isPbaDraft ? 'PBA Draft' : nativeDraft && isEuroIsolatedMode(state) ? 'NBA Draft' : leagueLabels.draft;
      const recordedDraftDate = String(draft.date ?? (player as any).draftDate ?? '').trim();
      const activeLeagueDraftDate = isPbaDraft
        ? undefined
        : getLeagueCalendarDates(Number(draft.year), state.leagueStats).draftDate;
      const fallbackDate = recordedDraftDate
        || (activeLeagueDraftDate ? formatGameDateShort(activeLeagueDraftDate) : String(draft.year));
      const ordinal = (n: number) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
      };
      entries.push({
        text: `The ${getTeamFullName(draftTeam) || 'team'} selected ${player.name} as the ${ordinal(getPlayerBioDraftOverallPick(Number(draft.round), Number(draft.pick), teamsPerRound))} overall pick of the ${draft.year} ${draftLabel}.`,
        date: fallbackDate,
        type: 'Draft',
        playerIds: [player.internalId],
        kind: 'Draft',
        team: draftTeam,
        portraitSrc: getPlayerImage(player) ?? null,
      } as any);
    }

    return entries;
  }, [pbaMode, player, state, playerPortraitMap]);

  if (playerTransactions.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
          <ArrowRightLeft size={32} />
        </div>
        <p className="text-base font-medium">No transactions on record for {player.name}.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-3 max-w-3xl mx-auto">
      {playerTransactions.map((entry, index) => {
        const style = TYPE_STYLE[entry.kind] ?? TYPE_STYLE['League Event'];
        const teamColor = (entry.team as any)?.colors?.[0];
        const teamLogo = (entry.team as any)?.logoUrl || (entry.team as any)?.imgURL;

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.25 }}
            className={`relative bg-slate-900/40 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden transition-all hover:bg-slate-900/60 ${entry.kind === 'Trade' && onTradeClick ? 'cursor-pointer' : ''}`}
            onClick={entry.kind === 'Trade' && onTradeClick ? () => onTradeClick(entry) : undefined}
          >
            {/* Team color ribbon */}
            {teamColor && (
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                style={{ backgroundColor: teamColor }}
              />
            )}

            <div className="flex gap-4 p-4 pl-5">
              {/* Type icon */}
              <div className={`mt-1 w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${style.bg} ${style.color}`}>
                {style.icon}
              </div>

              {/* Main text area */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${style.color}`}>
                      {style.label}
                    </span>
                    {entry.text?.toLowerCase().includes('player option') && (
                      <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Player Opt.</span>
                    )}
                    {entry.text?.toLowerCase().includes('team option') && (
                      <span className="text-[9px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">Team Opt.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <Calendar size={11} />
                    <span>{entry.date}</span>
                  </div>
                </div>
                <p className="text-slate-200 text-sm leading-relaxed font-medium">
                  {entry.text}
                </p>
              </div>

              {/* Right: portrait + team logo + view arrow for trades */}
              <div className="flex items-center gap-2 shrink-0 ml-1">
                {entry.portraitSrc && (
                  <img
                    src={entry.portraitSrc}
                    alt={player.name}
                    className="w-11 h-11 rounded-full object-cover border-2 border-slate-700 shrink-0"
                    referrerPolicy="no-referrer"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {teamLogo && (
                  <img
                    src={teamLogo}
                    alt={entry.team?.name}
                    className="w-9 h-9 object-contain opacity-80 shrink-0"
                    referrerPolicy="no-referrer"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {entry.kind === 'Trade' && onTradeClick && (
                  <span className="text-[10px] text-blue-400/70 font-medium whitespace-nowrap">View →</span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
