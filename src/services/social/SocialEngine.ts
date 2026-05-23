import { GameResult, PlayerGameStats } from '../simulation/StatGenerator';
import { NBAPlayer, NBATeam, SocialPost, PlayoffBracket, Game } from '../../types';
import { getSocialHandles } from '../../data/social/handles';
import { SOCIAL_TEMPLATES } from './SocialRegistry';
import { SocialContext } from './types';
import { TEAM_ARENAS } from '../../data/arenas';
import { TEAM_HANDLES } from '../../data/teamHandles';
import { fetchAvatarData, getAvatarByHandle } from '../avatarService';
import { SettingsManager } from '../SettingsManager';
import { generatePlayoffPosts } from './generatePlayoffPosts';

// Handles whose injury/news templates are suppressed when LLM is active
// (the LLM generates richer, more contextual versions of these posts)
const LLM_OWNED_HANDLES = new Set(['shams', 'woj']);

// ─────────────────────────────────────────────────────────────────────────────
// HOW MANY POSTS PER HANDLE PER GAME (max)
// Keeps the feed feeling like a real timeline, not a spam wall
// ─────────────────────────────────────────────────────────────────────────────
const HANDLE_POST_CAPS: Record<string, number> = {
    statmuse:        3,
    bball_forever:   3,
    legion_hoops:    3,
    nba_central:     2,
    hoop_central:    2,
    bleacher_report: 3,
    nba_official:    2,
    underdog_nba:    4, // injury/lineup utility — more is fine
    shams:           2,
    nba_centel:      1,
    nba_memes:       1,
};
const DEFAULT_CAP = 2;

export class SocialEngine {

  private _leagueType?: string;

  constructor() {}

  async generateDailyPosts(
    gameResults: GameResult[],
    players: NBAPlayer[],
    teams: NBATeam[],
    date: string,
    daysToSimulate: number = 1,
    playoffs?: PlayoffBracket | null,
    schedule?: Game[],
    leagueType?: string
  ): Promise<SocialPost[]> {
    this._leagueType = leagueType;
    console.log(`[SocialEngine] ENTER generateDailyPosts — games=${gameResults.length}, players=${players.length}, date=${date}`);
    const posts: SocialPost[] = [];
    if (gameResults.length === 0) {
      console.log('[SocialEngine] offseason/no-game early exit');
      return posts;
    }
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    console.log(`[SocialEngine] before await fetchAvatarData`);
    const avatars = await fetchAvatarData();
    console.log(`[SocialEngine] after fetchAvatarData — avatars=${avatars?.length ?? 0}`);

    const multiplier = daysToSimulate <= 1 ? 1.0 : Math.max(0.05, 1.0 / daysToSimulate);

    for (const result of gameResults) {
        // ── Per-game dedup maps ──────────────────────────────────────────────
        // usedTemplateIds: prevents same template firing twice in same game
        const usedTemplateIds = new Set<string>();

        // handlePlayerUsed: prevents same handle posting about same player twice
        // key: `${handleId}::${playerId}`
        const handlePlayerUsed = new Set<string>();

        // handlePostCount: enforces per-handle caps per game
        // key: handleId → count
        const handlePostCount: Record<string, number> = {};

        const homeTeam = teams.find(t => t.id === result.homeTeamId);
        const awayTeam = teams.find(t => t.id === result.awayTeamId);
        if (!homeTeam || !awayTeam) continue;

        // During playoffs, skip regular-season game-recap templates for playoff games
        // (generatePlayoffPosts handles those with proper series context). Only injury
        // context still fires so Shams injury posts work during playoffs.
        const isPlayoffGame = playoffs && schedule
          ? schedule.some(g => g.gid === result.gameId && (g.isPlayoff || g.isPlayIn))
          : false;

        const baseCtx = { game: result, date, dayOfWeek, players, teams };

        if (!isPlayoffGame) {
          // 1. Team Contexts (no player — game recap posts)
          this.processContext(posts, {
              ...baseCtx, team: homeTeam, opponent: awayTeam, stats: null
          }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);

          this.processContext(posts, {
              ...baseCtx, team: awayTeam, opponent: homeTeam, stats: null
          }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);

          // 2. Player Contexts — sorted by gameScore desc so stars get priority
          const allStats = [...result.homeStats, ...result.awayStats]
              .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));

          for (const stat of allStats) {
              const player = players.find(p => p.internalId === stat.playerId);
              if (!player) continue;

              const team     = player.tid === homeTeam.id ? homeTeam : awayTeam;
              const opponent = player.tid === homeTeam.id ? awayTeam : homeTeam;

              this.processContext(posts, {
                  ...baseCtx, player, team, opponent, stats: stat
              }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);
          }

          // 3. Injury Contexts (regular season only — Shams handles injuries during playoffs)
          if (result.injuries) {
              for (const injury of result.injuries) {
                  const player = players.find(p => p.internalId === injury.playerId);
                  if (!player || ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || '')) continue;

                  const team     = player.tid === homeTeam.id ? homeTeam : awayTeam;
                  const opponent = player.tid === homeTeam.id ? awayTeam : homeTeam;

                  this.processContext(posts, {
                      ...baseCtx, player, team, opponent, injury
                  }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier);
              }
          }
        } // end !isPlayoffGame
    }

    console.log(`[SocialEngine] after for-loop — posts=${posts.length}, playoffs=${!!playoffs}, schedule=${!!schedule}`);

    // Playoff-specific social posts — fire when series context is available
    if (playoffs && schedule) {
      const avatars = await fetchAvatarData();
      const playoffPosts = generatePlayoffPosts({
        avatars,
        date,
        daysToSimulate,
        gameResults,
        leagueType: this._leagueType,
        players,
        playoffs,
        schedule,
        teams,
      });
      posts.push(...playoffPosts);
    }

    console.log(`[SocialEngine] RETURN — total posts=${posts.length}`);
    return posts;
  }

  private processContext(
      posts: SocialPost[], 
      ctx: SocialContext, 
      usedTemplateIds: Set<string>,
      handlePlayerUsed: Set<string>,
      handlePostCount: Record<string, number>,
      avatars: any[],
      multiplier: number = 1.0
  ) {
      // Sort by priority desc so highest-priority templates get first shot
      const sortedTemplates = [...SOCIAL_TEMPLATES].sort((a, b) => {
          const pa = typeof a.priority === 'function' ? a.priority(ctx) : (a.priority ?? 0);
          const pb = typeof b.priority === 'function' ? b.priority(ctx) : (b.priority ?? 0);
          return pb - pa;
      });

      const llmEnabled = SettingsManager.getSettings().enableLLM;

      for (const template of sortedTemplates) {
          try {
              const handleId = template.handle;

              // ── LLM override: skip injury/news templates for LLM-owned handles ──
              // When LLM is ON it generates richer versions; templates would duplicate.
              if (llmEnabled && LLM_OWNED_HANDLES.has(handleId) && template.type === 'news') continue;

              // ── Dedup: same template already fired this game ───────────────
              if (usedTemplateIds.has(template.id)) continue;

              // ── Dedup: this handle already posted about this player ────────
              if (ctx.player) {
                  const hpKey = `${handleId}::${ctx.player.internalId}`;
                  if (handlePlayerUsed.has(hpKey)) continue;
              }

              // ── Cap: handle hit its post limit for this game ───────────────
              const cap = HANDLE_POST_CAPS[handleId] ?? DEFAULT_CAP;
              if ((handlePostCount[handleId] ?? 0) >= cap) continue;

              // ── Condition check ────────────────────────────────────────────
              if (!template.condition(ctx)) continue;

              // ── Priority / probability gate ────────────────────────────────
              let priority = typeof template.priority === 'function'
                  ? template.priority(ctx)
                  : (template.priority ?? 0);
              priority = priority * multiplier;
              if (Math.random() * 100 > priority) continue;

              // ── Handle lookup ──────────────────────────────────────────────
              const handle = Object.values(getSocialHandles(this._leagueType)).find(h => h.id === handleId);
              if (!handle) continue;

              // ── Content generation ─────────────────────────────────────────
              let content = typeof template.template === 'function'
                  ? template.template(ctx)
                  : template.template;

              // Standard replacements
              const replacements: Record<string, string> = {
                  '{{player}}':          ctx.player?.name || '',
                  '{{PLAYER}}':          (ctx.player?.name || '').toUpperCase(),
                  '{{team}}':            ctx.team?.name || '',
                  '{{TEAM}}':            (ctx.team?.name || '').toUpperCase(),
                  '{{team_handle}}':     ctx.team ? (TEAM_HANDLES[ctx.team.name] || ctx.team.name) : '',
                  '{{opponent}}':        ctx.opponent?.name || '',
                  '{{OPPONENT}}':        (ctx.opponent?.name || '').toUpperCase(),
                  '{{opponent_handle}}': ctx.opponent ? (TEAM_HANDLES[ctx.opponent.name] || ctx.opponent.name) : '',
                  '{{city}}':            '',
                  '{{arena}}':           '',
                  '{{day}}':             ctx.dayOfWeek || '',
                  '{{ot_suffix}}':       ctx.game.otCount > 0 ? (ctx.game.otCount > 1 ? ` (${ctx.game.otCount}OT)` : ' (OT)') : '',
                  '{{ot_text}}':         ctx.game.otCount > 0 ? (ctx.game.otCount > 1 ? ` in ${ctx.game.otCount}OT` : ' in OT') : '',
                  '{{winner_score}}':    (ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.homeScore : ctx.game.awayScore).toString(),
                  '{{loser_score}}':     (ctx.game.winnerId === ctx.game.homeTeamId ? ctx.game.awayScore : ctx.game.homeScore).toString(),
                  '{{age}}':             ctx.player ? (ctx.player.age || 25).toString() : '',
                  '{{seasons}}':         ctx.player?.stats ? ctx.player.stats.length.toString() : '0',
              };

              if (ctx.stats) {
                  replacements['{{pts}}'] = ctx.stats.pts.toString();
                  replacements['{{reb}}'] = ctx.stats.reb.toString();
                  replacements['{{ast}}'] = ctx.stats.ast.toString();
                  replacements['{{blk}}'] = ctx.stats.blk.toString();
                  replacements['{{stl}}'] = ctx.stats.stl.toString();
                  replacements['{{tov}}'] = ctx.stats.tov.toString();
                  replacements['{{fgm}}'] = ctx.stats.fgm.toString();
                  replacements['{{fga}}'] = ctx.stats.fga.toString();
                  replacements['{{3pm}}'] = ctx.stats.threePm.toString();
                  replacements['{{3pa}}'] = ctx.stats.threePa.toString();
              }

              if (ctx.injury) {
                  replacements['{{injury_type}}']  = ctx.injury.injuryType.toLowerCase();
                  replacements['{{games_missed}}'] = ctx.injury.gamesRemaining.toString();
              }

              const homeTeamObj = [ctx.team, ctx.opponent].find(t => t?.id === ctx.game.homeTeamId);
              if (homeTeamObj) {
                  replacements['{{city}}']  = homeTeamObj.region || homeTeamObj.name.split(' ')[0];
                  replacements['{{arena}}'] = TEAM_ARENAS[homeTeamObj.name] || 'the arena';
              }

              Object.entries(replacements).forEach(([key, value]) => {
                  const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                  content = content.replace(regex, value);
              });

              // Custom resolver
              let avatarOverride = null;
              let mediaUrl = null;
              let mediaBackgroundColor = null;
              let extraData: Record<string, any> = {};
              if (template.resolve) {
                  const resolved = template.resolve(content, ctx);
                  if (typeof resolved === 'object') {
                      content = resolved.content;
                      avatarOverride = resolved.avatarUrl;
                      mediaUrl = resolved.mediaUrl;
                      mediaBackgroundColor = resolved.mediaBackgroundColor;
                      if (resolved.data) extraData = resolved.data;
                  } else {
                      content = resolved;
                  }
              }

              // Skip empty or unreplaced content
              if (!content || content.includes('{{') || content.trim() === '') continue;

              // ── Build post ─────────────────────────────────────────────────
              const avatarUrl = avatarOverride || getAvatarByHandle(handle.handle, avatars) || handle.avatarUrl;
              const postDate  = new Date(ctx.game.date || ctx.date);
              postDate.setHours(23 - Math.floor(Math.random() * 12), 59 - Math.floor(Math.random() * 60));

              posts.push({
                  id:                   crypto.randomUUID(),
                  author:               handle.name,
                  handle:               `@${handle.handle}`,
                  avatarUrl,
                  playerPortraitUrl:    ctx.player?.imgURL,
                  teamLogoUrl:          ctx.team?.logoUrl,
                  content,
                  likes:                Math.floor(Math.random() * 5000) + 100,
                  retweets:             Math.floor(Math.random() * 1000) + 50,
                  date:                 postDate.toISOString(),
                  source:               'TwitterX',
                  category:             'GAME_EVENT',
                  data:                 { gameId: ctx.game.gameId, templateId: template.id, ...extraData },
                  mediaUrl:             mediaUrl || undefined,
                  mediaBackgroundColor: mediaBackgroundColor || undefined,
                  isNew:                true,
              });

              // ── Mark used ──────────────────────────────────────────────────
              usedTemplateIds.add(template.id);
              handlePostCount[handleId] = (handlePostCount[handleId] ?? 0) + 1;
              if (ctx.player) {
                  handlePlayerUsed.add(`${handleId}::${ctx.player.internalId}`);
              }

              // One post per template per context — move to next context
              break;

          } catch (e) {
              console.error('Error processing template:', template.id, e);
          }
      }
  }
}
