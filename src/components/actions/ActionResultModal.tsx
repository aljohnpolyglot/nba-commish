import {
  Building2,
  Eye,
  HeartHandshake,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useGame } from '../../store/GameContext';
import { resolveAnyTeam } from '../../utils/teamLookup';
import { PlayerPortrait } from '../shared/PlayerPortrait';
import { ActionModalShell } from '../shared/actions/ActionModalShell';
import { getPlayerImage } from '../../utils/playerImage';
import { getStaffImageUrl, resolveStaffImageId } from '../../utils/staffPortrait';

const channelPresentation = {
  publicApproval: { label: 'Public', icon: Users, bar: 'bg-cyan-400' },
  ownerApproval: { label: 'Owners', icon: Building2, bar: 'bg-amber-400' },
  playerApproval: { label: 'Players', icon: HeartHandshake, bar: 'bg-violet-400' },
  legacy: { label: 'Legacy', icon: Trophy, bar: 'bg-emerald-400' },
  viewership: { label: 'Viewership', icon: Eye, bar: 'bg-sky-400' },
} as const;

export function ActionResultModal() {
  const { state, dispatchAction } = useGame();
  const effect = state.lastActionEffect;
  if (!effect) return null;

  const close = () => {
    void dispatchAction({ type: 'CLEAR_OUTCOME' });
  };

  return (
    <ActionModalShell
      title="Executive Outcome"
      description={effect.actionLabel}
      icon={<Sparkles size={30} />}
      accent="violet"
      wide
      elevated
      onClose={close}
      primaryLabel="Continue"
      onPrimary={close}
      showSecondary={false}
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/25 p-5 sm:p-6">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Executive Recap</p>
          <p className="text-sm leading-relaxed text-slate-300 sm:text-base">{effect.summary}</p>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">League Effects</h3>
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{effect.date}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(channelPresentation) as Array<keyof typeof channelPresentation>).map(key => {
              const item = effect.channels[key];
              const config = channelPresentation[key];
              const Icon = config.icon;
              const isViewership = key === 'viewership';
              const beforePercent = isViewership ? Math.min(100, item.before * 5) : item.before;
              const afterPercent = isViewership ? Math.min(100, item.after * 5) : item.after;
              return (
                <article key={key} className="rounded-2xl border border-slate-700/75 bg-slate-950/25 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300"><Icon size={18} /></span>
                    <span className={`text-sm font-black ${item.change > 0 ? 'text-emerald-300' : item.change < 0 ? 'text-rose-300' : 'text-slate-500'}`}>
                      {item.change > 0 ? '+' : ''}{item.change.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-black uppercase tracking-wide text-white">{config.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.before.toFixed(1)} → {item.after.toFixed(1)}</p>
                  <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="absolute inset-y-0 left-0 bg-slate-600/35" style={{ width: `${beforePercent}%` }} />
                    <motion.div
                      initial={{ width: `${beforePercent}%` }}
                      animate={{ width: `${afterPercent}%` }}
                      transition={{ duration: 1.15, ease: 'easeOut', delay: 0.2 }}
                      className={`absolute inset-y-0 left-0 rounded-full ${config.bar}`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {effect.relationships.length > 0 && (
          <section className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.035] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white">
                <HeartHandshake size={18} className="text-violet-300" />
                Relationship Changes
              </h3>
              <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-violet-300">
                Relationship Impact
              </span>
            </div>
            <div className="space-y-4">
              {effect.relationships.map(relationship => {
                const isPlayer = relationship.targetType.toLowerCase() === 'player';
                const isTeam = relationship.targetType.toLowerCase() === 'team';
                const player = isPlayer
                  ? state.players.find(candidate => candidate.internalId === relationship.targetId)
                    ?? state.players.find(candidate => candidate.name.toLowerCase() === relationship.targetName.toLowerCase())
                  : undefined;
                const team = isTeam
                  ? resolveAnyTeam(Number(relationship.targetId), state.teams, state.nonNBATeams)
                  : player && player.tid >= 0
                    ? resolveAnyTeam(player.tid, state.teams, state.nonNBATeams)
                    : null;
                const teamLogoUrl = (team as any)?.logoUrl ?? (team as any)?.imgURL;
                const staffMembers = state.staff
                  ? [...state.staff.owners, ...state.staff.gms, ...state.staff.coaches, ...state.staff.leagueOffice]
                  : [];
                const staffMember = !isPlayer && !isTeam
                  ? staffMembers.find(candidate =>
                      String((candidate as any).id ?? '') === relationship.targetId
                      || candidate.name.toLowerCase() === relationship.targetName.toLowerCase(),
                    )
                  : undefined;
                const beneficiaryPortraitUrl = player
                  ? getPlayerImage(player)
                  : staffMember
                    ? (staffMember.playerPortraitUrl ?? getStaffImageUrl(resolveStaffImageId(staffMember)))
                    : undefined;

                return (
                  <div key={relationship.key} className="rounded-xl border border-violet-400/10 bg-slate-950/30 p-3 sm:p-4">
                    <div className="flex items-center gap-3 sm:gap-4">
                      {(isPlayer || staffMember) && (
                        <PlayerPortrait
                          imgUrl={beneficiaryPortraitUrl ?? undefined}
                          teamLogoUrl={teamLogoUrl}
                          playerName={relationship.targetName}
                          face={player?.face}
                          disableNameFallback={!!staffMember}
                          size={52}
                        />
                      )}
                      {isTeam && teamLogoUrl && (
                        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-violet-400/15 bg-slate-900/70 p-2">
                          <img
                            src={teamLogoUrl}
                            alt=""
                            className="h-full w-full object-contain"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{relationship.targetName}</p>
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          {relationship.targetType}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-sm font-black ${
                        relationship.change >= 0
                          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                          : 'border-rose-400/20 bg-rose-400/10 text-rose-300'
                      }`}>
                        {relationship.change > 0 ? '+' : ''}{relationship.change}
                      </span>
                    </div>
                    <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                      <div className="absolute inset-y-0 left-0 bg-slate-600/35" style={{ width: `${relationship.before}%` }} />
                      <motion.div
                        initial={{ width: `${relationship.before}%` }}
                        animate={{ width: `${relationship.after}%` }}
                        transition={{ duration: 1.4, ease: 'easeOut', delay: 0.35 }}
                        className={`absolute inset-y-0 left-0 rounded-full ${relationship.change >= 0 ? 'bg-gradient-to-r from-violet-500 to-emerald-400' : 'bg-gradient-to-r from-violet-500 to-rose-400'}`}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-600">
                      <span>{relationship.before}</span>
                      <span>{relationship.after}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </ActionModalShell>
  );
}
