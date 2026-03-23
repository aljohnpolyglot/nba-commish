import React from 'react';
import { useGame } from '../../store/GameContext';
import { SocialPost, SocialSource } from '../../types';
import { UserPlus, UserMinus } from 'lucide-react';
import { formatTwitterDate } from '../../utils/helpers';
import { getUnavatarUrl, canUseUnavatar } from '../../data/photos/social';
import { ImagnPhotoEditor } from './ImagnPhotoEditor';
import { needsCanvasEditor } from '../../services/social/photoEnricher';

// Module-level cache — persists across tab switches and re-renders, cleared on page reload.
// string = resolved URL that loaded successfully; null = all sources failed, show icon.
const avatarCache = new Map<string, string | null>();

const SourceIcon: React.FC<{ source: SocialSource }> = ({ source }) => {
  if (source === 'TwitterX') {
    return (
      <svg className="h-6 w-6 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
      </svg>
    );
  }
  // Feddit Icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.03-5.22a.75.75 0 011.06-1.06l3 3a.75.75 0 11-1.06 1.06l-3-3zM9 12a1 1 0 112 0 1 1 0 01-2 0zm-2.5-1.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" clipRule="evenodd" />
        <path d="M10 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 4z" />
    </svg>
  );
};

interface SocialPostCardProps {
  post: SocialPost;
  onImageClick?: (url: string) => void;
}

const SocialPostCard: React.FC<SocialPostCardProps> = ({ post, onImageClick }) => {
  const { state, toggleLike, toggleRetweet, followUser, unfollowUser } = useGame();

  const cleanHandle = post.handle.replace('@', '');
  const isFollowing = (state.followedHandles || []).includes(cleanHandle);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(post.id);
  };

  const handleRetweet = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleRetweet(post.id);
  };

  const handleFollowToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) {
      unfollowUser(cleanHandle);
    } else {
      followUser(cleanHandle);
    }
  };

  const isDefaultAvatar = post.avatarUrl?.includes('default_profile') || post.avatarUrl?.includes('placeholder') || !post.avatarUrl;
  const primaryUrl = isDefaultAvatar ? (post.playerPortraitUrl || post.teamLogoUrl || null) : (post.avatarUrl || null);

  // avatarSrc: undefined = still trying, null = give up (show icon), string = show this URL
  const [avatarSrc, setAvatarSrc] = React.useState<string | null | undefined>(() => {
    const cached = avatarCache.get(post.handle);
    return cached !== undefined ? cached : undefined;
  });

  React.useEffect(() => {
    // Already resolved (from cache or previous render)
    if (avatarSrc !== undefined) return;

    const tryLoad = (url: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.onload = () => resolve(url);
        img.onerror = reject;
        img.src = url;
      });

    const resolve = async () => {
      // 1. Try primary URL (portrait / team logo / avatarUrl)
      if (primaryUrl) {
        try { const url = await tryLoad(primaryUrl); avatarCache.set(post.handle, url); setAvatarSrc(url); return; } catch {}
      }
      // 2. Try unavatar for TwitterX posts within budget
      if (post.source === 'TwitterX' && canUseUnavatar()) {
        const url = getUnavatarUrl(post.handle);
        if (url) {
          try { await tryLoad(url); avatarCache.set(post.handle, url); setAvatarSrc(url); return; } catch {}
        }
      }
      // 3. All sources failed — cache and show icon
      avatarCache.set(post.handle, null);
      setAvatarSrc(null);
    };

    resolve();
  }, [post.handle]);

  return (
    <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700/50 flex items-start space-x-4 hover:bg-zinc-800 transition-colors group/card">
      <div className="flex-shrink-0 w-12 h-12 relative">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={post.author}
            className="h-12 w-12 rounded-full object-cover bg-zinc-700"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-12 w-12 flex items-center justify-center bg-zinc-700 rounded-full">
            <SourceIcon source={post.source} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline space-x-1 truncate">
            <p className="font-bold text-white truncate">{post.author}</p>
            <p className="text-sm text-zinc-400 truncate">{post.handle}</p>
            <span className="text-zinc-500 text-sm flex-shrink-0">·</span>
            <p className="text-sm text-zinc-500 flex-shrink-0">{formatTwitterDate(post.date, state.date)}</p>
          </div>
          <button
            onClick={handleFollowToggle}
            className={`opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center space-x-1 text-xs font-medium px-2 py-1 rounded-full ${
              isFollowing 
                ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white' 
                : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white'
            }`}
          >
            {isFollowing ? (
              <>
                <UserMinus size={12} />
                <span>Unfollow</span>
              </>
            ) : (
              <>
                <UserPlus size={12} />
                <span>Follow</span>
              </>
            )}
          </button>
        </div>
        <p className="mt-1 text-zinc-300 whitespace-pre-wrap">{post.content}</p>

        {/* StatMuse cartoon — team color bg + watermark */}
        {post.mediaUrl && post.mediaBackgroundColor && !post.data?.type && (
          <div
            className="mt-3 rounded-2xl overflow-hidden border border-white/10 relative"
            style={{ background: post.mediaBackgroundColor, aspectRatio: '680 / 383' }}
          >
            <img
              src={post.mediaUrl}
              alt="StatMuse stat card"
              className="w-full h-full object-contain"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute top-2 right-3 opacity-50 pointer-events-none">
              <span className="text-[10px] font-black text-white uppercase tracking-widest">StatMuse</span>
            </div>
          </div>
        )}

        {/* Real game action photo from imagn.com */}
        {post.mediaUrl && !post.mediaBackgroundColor && !post.data?.type && (() => {
            const d = post.data as any;
            // @NBA posts → canvas ImagnPhotoEditor with score bar overlay
            if (needsCanvasEditor(post) && d?.homeTeam && d?.awayTeam) {
                return (
                    <div className="mt-3" onClick={e => e.stopPropagation()}>
                        <ImagnPhotoEditor
                            photo={{ medUrl: post.mediaUrl! } as any}
                            homeTeamColor={d.homeTeam?.color || '#1d428a'}
                            awayTeamColor={d.awayTeam?.color || '#c8102e'}
                            homeAbbrev={d.homeTeam?.abbrev || 'HOM'}
                            awayAbbrev={d.awayTeam?.abbrev || 'AWY'}
                            homeScore={d.homeTeam?.score ?? 0}
                            awayScore={d.awayTeam?.score ?? 0}
                        />
                    </div>
                );
            }
            // Hoop Central + all others → raw Imagn photo
            return (
                <img
                    src={post.mediaUrl}
                    alt=""
                    className="w-full rounded-2xl mt-3 cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ maxHeight: '510px', objectFit: 'contain', background: 'transparent' }}
                    referrerPolicy="no-referrer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onImageClick?.(post.mediaUrl!);
                    }}
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            );
        })()}

        {/* NBA Official stat card graphic */}
        {post.data?.type === 'stat_card' && (() => {
          const card = post.data;
          const playerIsHome = card.playerTeamId === card.homeTeam?.id;
          const teamColor = playerIsHome ? card.homeTeam?.color : card.awayTeam?.color;
          return (
            <div className="mt-3 rounded-2xl overflow-hidden border border-white/10"
                 style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #111827 100%)' }}>

              {/* Player + stats */}
              <div className="relative flex items-end gap-3 px-4 pt-4 pb-0 min-h-[148px] overflow-hidden"
                   style={{ background: `linear-gradient(135deg, ${teamColor}22 0%, transparent 60%)` }}>
                <div className="flex-1 pb-3 relative z-10">
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-0.5">
                    {playerIsHome ? card.homeTeam?.name : card.awayTeam?.name}
                  </p>
                  <p className="text-sm font-black text-white uppercase tracking-tight mb-2">
                    {card.playerName}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(card.statPills ?? []).map((pill: string, i: number) => (
                      <span key={i}
                        className="text-[11px] font-black px-2 py-0.5 rounded-full"
                        style={{
                          background: i === 0 ? `${teamColor}bb` : 'rgba(255,255,255,0.1)',
                          color: '#fff',
                        }}>
                        {pill}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Team logo watermark */}
                {(playerIsHome ? card.homeTeam?.logoUrl : card.awayTeam?.logoUrl) && (
                  <img
                    src={playerIsHome ? card.homeTeam.logoUrl : card.awayTeam.logoUrl}
                    alt="" aria-hidden
                    className="absolute right-3 top-3 w-14 h-14 object-contain opacity-[0.08] pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                )}
                {/* Real game photo if attached */}
                {post.mediaUrl && (
                  <img
                    src={post.mediaUrl}
                    alt="Game photo"
                    className="h-32 w-auto object-cover rounded-tl-xl flex-shrink-0 relative z-10"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>

              {/* Score bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-black/40 border-t border-white/5">
                <div className="flex items-center gap-2 flex-1">
                  {card.awayTeam?.logoUrl && (
                    <img src={card.awayTeam.logoUrl} alt={card.awayTeam.abbrev}
                      className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                  )}
                  <div>
                    <p className="text-[9px] font-black text-white/50 uppercase">{card.awayTeam?.abbrev}</p>
                    <p className={`text-lg font-black leading-none ${card.winnerId !== card.homeTeam?.id ? 'text-white' : 'text-white/30'}`}>
                      {card.awayTeam?.score}
                    </p>
                  </div>
                </div>
                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest px-2">
                  {card.isOT ? (card.otCount >= 2 ? `${card.otCount}OT` : 'OT') : 'FINAL'}
                </p>
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-white/50 uppercase">{card.homeTeam?.abbrev}</p>
                    <p className={`text-lg font-black leading-none ${card.winnerId === card.homeTeam?.id ? 'text-white' : 'text-white/30'}`}>
                      {card.homeTeam?.score}
                    </p>
                  </div>
                  {card.homeTeam?.logoUrl && (
                    <img src={card.homeTeam.logoUrl} alt={card.homeTeam.abbrev}
                      className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Real App embed — fires when post content contains "@realapp" */}
        {post.content?.includes('@realapp') && (() => {
            const d = post.data as any;
            const s = d?.stats || {};
            const teamColor = d?.teamColor || '#1d428a';
            const playerName = d?.playerName || post.author;
            const lastName = playerName.split(' ').pop() || playerName;
            return (
                <div className="mt-3 rounded-2xl overflow-hidden border border-white/10"
                     style={{ background: '#0a0a0f', fontFamily: 'system-ui, sans-serif' }}>

                    {/* Header */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                        <div className="flex items-center gap-2">
                            {(d?.teamLogoUrl || post.teamLogoUrl) && (
                                <img src={d?.teamLogoUrl || post.teamLogoUrl} alt=""
                                     className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                            )}
                            <div>
                                <p className="text-[11px] font-black text-white/40 uppercase tracking-widest leading-none">
                                    {lastName}
                                </p>
                                <p className="text-[9px] text-white/25 uppercase tracking-widest">
                                    {d?.fps ? `${d.fps} fps` : 'live'}
                                </p>
                            </div>
                        </div>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                            realapp.com
                        </p>
                    </div>

                    {/* Big stats row */}
                    <div className="flex items-end gap-6 px-4 pb-2">
                        {[
                            { val: s.pts ?? d?.pts, label: 'pts' },
                            { val: s.reb ?? d?.reb, label: 'reb' },
                            { val: s.ast ?? d?.ast, label: 'ast' },
                        ].map(({ val, label }) => val != null ? (
                            <div key={label}>
                                <span className="text-4xl font-black text-white leading-none">{val}</span>
                                <span className="text-[11px] font-black text-white/40 ml-1">{label}</span>
                            </div>
                        ) : null)}
                        {s.fgPct != null && (
                            <div>
                                <span className="text-4xl font-black text-white leading-none">{s.fgPct}</span>
                                <span className="text-[11px] font-black text-white/40 ml-1">%fg</span>
                            </div>
                        )}
                    </div>

                    {/* Stat grid */}
                    {(s.min != null || s.fgm != null) && (
                        <div className="grid grid-cols-5 gap-0 border-t border-white/5 mx-3 py-2">
                            {[
                                { val: s.min, label: 'MIN' },
                                { val: s.pts, label: 'PTS' },
                                { val: s.reb, label: 'REB' },
                                { val: s.ast, label: 'AST' },
                                { val: s.stl, label: 'STL' },
                                { val: s.blk, label: 'BLK' },
                                { val: s.fgm != null && s.fga != null ? `${s.fgm}/${s.fga}` : null, label: 'FG' },
                                { val: s.threePm != null && s.threePa != null ? `${s.threePm}/${s.threePa}` : null, label: '3FG' },
                                { val: s.tov, label: 'TO' },
                                { val: s.fgPct ? `${s.fgPct}%` : null, label: 'FG%' },
                            ].filter(x => x.val != null).map(({ val, label }) => (
                                <div key={label} className="flex flex-col items-center py-1">
                                    <span className="text-[13px] font-black text-white">{val}</span>
                                    <span className="text-[8px] text-white/30 uppercase tracking-wider">{label}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Score bar */}
                    {d?.homeTeam && d?.awayTeam && (
                        <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-t border-white/5">
                            <div className="flex items-center gap-1.5">
                                {d.awayTeam.logoUrl && (
                                    <img src={d.awayTeam.logoUrl} alt="" className="w-5 h-5 object-contain"
                                         referrerPolicy="no-referrer" />
                                )}
                                <span className="text-xs font-black text-white/50">{d.awayTeam.abbrev}</span>
                                <span className="text-base font-black text-white ml-1">{d.awayTeam.score}</span>
                            </div>
                            <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                                {d.isOT ? 'OT' : 'FINAL'}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-base font-black text-white mr-1">{d.homeTeam.score}</span>
                                <span className="text-xs font-black text-white/50">{d.homeTeam.abbrev}</span>
                                {d.homeTeam.logoUrl && (
                                    <img src={d.homeTeam.logoUrl} alt="" className="w-5 h-5 object-contain"
                                         referrerPolicy="no-referrer" />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Quarter tabs */}
                    <div className="flex gap-1 px-3 pb-3 pt-1">
                        {['All', 'Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                            <span key={q}
                                  className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                      i === 0
                                          ? 'text-white'
                                          : 'text-white/25'
                                  }`}
                                  style={i === 0 ? { background: teamColor } : { background: 'rgba(255,255,255,0.05)' }}>
                                {q}
                            </span>
                        ))}
                    </div>
                </div>
            );
        })()}

        <div className="mt-3 flex items-center space-x-6 text-zinc-500 text-xs">
          <button 
            onClick={handleLike}
            className={`flex items-center gap-1 transition-colors group ${post.isLiked ? 'text-rose-500' : 'hover:text-rose-500'}`}
          >
            <svg className={`w-4 h-4 group-active:scale-125 transition-transform ${post.isLiked ? 'fill-current' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            {post.likes}
          </button>
          <button 
            onClick={handleRetweet}
            className={`flex items-center gap-1 transition-colors group ${post.isRetweeted ? 'text-emerald-500' : 'hover:text-emerald-500'}`}
          >
            <svg className="w-4 h-4 group-active:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            {post.retweets}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SocialPostCard;
