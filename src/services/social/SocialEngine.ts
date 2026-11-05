import { GameResult, PlayerGameStats } from '../simulation/StatGenerator';
import { NBAPlayer, NBATeam, SocialPost, PlayoffBracket, Game } from '../../types';
import { getSocialHandles } from '../../data/social/handles';
import { SOCIAL_TEMPLATES } from './SocialRegistry';
import { SocialContext, SocialTemplate } from './types';
import { TEAM_ARENAS } from '../../data/arenas';
import { TEAM_HANDLES } from '../../data/teamHandles';
import { fetchAvatarData, getAvatarByHandle } from '../avatarService';
import { SettingsManager } from '../SettingsManager';
import { generatePlayoffPosts } from './generatePlayoffPosts';
import { EURO_SOCIAL_TEMPLATES, generateEuroPlayoffPosts } from './templates/euroLeague';
import { getPrimaryInsiderKey, isTwitterAvailable } from '../../utils/mediaTimeline';
import { recordMediaRuntimeCall } from '../media/mediaRuntimeDiagnostics';
import { EURO_BASKETBALL_SOURCE_ARCHIVES, EUROLEAGUE_2026_SOURCE } from '../../data/euroBasketballSources';

// Handles whose injury/news templates are suppressed when LLM is active
// (the LLM generates richer, more contextual versions of these posts)
const LLM_OWNED_HANDLES = new Set(['shams', 'woj', 'euro_insider', 'euro_newsdesk']);

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
    woj:             2,
    nba_centel:      1,
    nba_memes:       1,
    euro_official:   2,
    euro_central:    2,
    euro_broadcast:  2,
    euro_insider:    2,
    euro_newsdesk:   2,
};
const DEFAULT_CAP = 2;

type SocialTemplateEntry = {
  template: SocialTemplate;
  index: number;
  priority: number;
};

type SocialTemplateSet = {
  staticTemplates: SocialTemplateEntry[];
  dynamicTemplates: Array<{ template: SocialTemplate; index: number }>;
};

const buildTemplateSet = (templates: SocialTemplate[]): SocialTemplateSet => ({
  staticTemplates: templates
    .flatMap((template, index) => typeof template.priority === 'function'
      ? []
      : [{ template, index, priority: template.priority ?? 0 }])
    .sort((left, right) => right.priority - left.priority || left.index - right.index),
  dynamicTemplates: templates
    .flatMap((template, index) => typeof template.priority === 'function' ? [{ template, index }] : []),
});

const NBA_TEMPLATE_SET = buildTemplateSet(SOCIAL_TEMPLATES);
const EURO_TEMPLATE_SET = buildTemplateSet(EURO_SOCIAL_TEMPLATES);

const getOrderedSocialTemplates = (ctx: SocialContext, templateSet: SocialTemplateSet): SocialTemplateEntry[] => {
  const dynamic = templateSet.dynamicTemplates
    .map(({ template, index }) => ({
      template,
      index,
      priority: typeof template.priority === 'function' ? template.priority(ctx) : (template.priority ?? 0),
    }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index);
  const ordered: SocialTemplateEntry[] = [];
  let staticIndex = 0;
  let dynamicIndex = 0;
  while (staticIndex < templateSet.staticTemplates.length || dynamicIndex < dynamic.length) {
    const staticEntry = templateSet.staticTemplates[staticIndex];
    const dynamicEntry = dynamic[dynamicIndex];
    if (!dynamicEntry || (staticEntry && (
      staticEntry.priority > dynamicEntry.priority
      || (staticEntry.priority === dynamicEntry.priority && staticEntry.index < dynamicEntry.index)
    ))) {
      ordered.push(staticEntry);
      staticIndex += 1;
    } else {
      ordered.push(dynamicEntry);
      dynamicIndex += 1;
    }
  }
  return ordered;
};

const EURO_COMPETITION_IDS = new Set([
  EUROLEAGUE_2026_SOURCE.competitionId,
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.competitionId),
  'endesa',
].map(id => id.toLowerCase()));
const EURO_TEAM_LEAGUES = new Set([
  EUROLEAGUE_2026_SOURCE.leagueStatus,
  ...EURO_BASKETBALL_SOURCE_ARCHIVES.map(source => source.leagueStatus),
  'Endesa',
].map(league => league.toLowerCase()));

const inferSocialUiMode = (gameResults: GameResult[], teams: NBATeam[]): string | undefined => {
  const hasEuroCompetition = gameResults.some(result => (
    result.competitionId != null && EURO_COMPETITION_IDS.has(String(result.competitionId).toLowerCase())
  ));
  const externalTeams = teams.filter(team => (
    Number(team.id) >= 1000
    && EURO_TEAM_LEAGUES.has(String((team as any).league ?? '').toLowerCase())
  ));
  if (externalTeams.length === 0) return undefined;
  const gameTeamIds = new Set(gameResults.flatMap(result => [result.homeTeamId, result.awayTeamId]));
  const euroResultTeamIds = new Set(gameResults
    .filter(result => result.competitionId != null && EURO_COMPETITION_IDS.has(String(result.competitionId).toLowerCase()))
    .flatMap(result => [result.homeTeamId, result.awayTeamId]));
  const allGameTeamsAreEuro = [...gameTeamIds].every(id => (
    externalTeams.some(team => team.id === id) || euroResultTeamIds.has(id)
  ));
  return gameTeamIds.size > 0 && allGameTeamsAreEuro && (hasEuroCompetition || externalTeams.some(team => gameTeamIds.has(team.id)))
    ? 'euro_isolated'
    : undefined;
};

export class SocialEngine {

  private _leagueType?: string;
  private _uiMode?: string;

  constructor() {
    recordMediaRuntimeCall('socialEngineConstructors');
  }

  async generateDailyPosts(
    gameResults: GameResult[],
    players: NBAPlayer[],
    teams: NBATeam[],
    date: string,
    daysToSimulate: number = 1,
    playoffs?: PlayoffBracket | null,
    schedule?: Game[],
    leagueType?: string,
    options?: { fetchAvatars?: boolean; uiMode?: string | null },
  ): Promise<SocialPost[]> {
    recordMediaRuntimeCall('socialPresentationCalls');
    this._leagueType = leagueType;
    this._uiMode = options?.uiMode ?? inferSocialUiMode(gameResults, teams);
    const posts: SocialPost[] = [];
    if (!isTwitterAvailable(date)) {
      return posts;
    }
    if (gameResults.length === 0) {
      return posts;
    }
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    // Long simulations build presentation output in batches. The app already
    // preloads avatar data, so those batches must never wait on an external
    // avatar request before the simulation can commit. Handle fallbacks still
    // provide the correct account avatar when the cache is not hydrated yet.
    const avatars = leagueType === 'fictional' || options?.fetchAvatars === false
      ? []
      : await fetchAvatarData();
    const playerById = new Map(players.map(player => [player.internalId, player]));
    const teamById = new Map(teams.map(team => [team.id, team]));
    const playoffGameIds = playoffs && schedule
      ? new Set(schedule.filter(game => game.isPlayoff || game.isPlayIn).map(game => game.gid))
      : undefined;
    const handlesById = new Map(Object.values(getSocialHandles(this._leagueType, this._uiMode)).map(handle => [handle.id, handle]));
    const llmEnabled = SettingsManager.getSettings().enableLLM;
    const templateSet = this._uiMode === 'euro_isolated' ? EURO_TEMPLATE_SET : NBA_TEMPLATE_SET;

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

        const homeTeam = teamById.get(result.homeTeamId);
        const awayTeam = teamById.get(result.awayTeamId);
        if (!homeTeam || !awayTeam) continue;

        // During playoffs, skip regular-season game-recap templates for playoff games
        // (generatePlayoffPosts handles those with proper series context). Only injury
        // context still fires so Shams injury posts work during playoffs.
        const isPlayoffGame = playoffGameIds?.has(result.gameId) ?? false;

        const baseCtx = { game: result, date, dayOfWeek, players, teams };

        if (!isPlayoffGame) {
          // 1. Team Contexts (no player — game recap posts)
          this.processContext(posts, {
              ...baseCtx, team: homeTeam, opponent: awayTeam, stats: null
          }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier, handlesById, llmEnabled, templateSet);

          this.processContext(posts, {
              ...baseCtx, team: awayTeam, opponent: homeTeam, stats: null
          }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier, handlesById, llmEnabled, templateSet);

          // 2. Player Contexts — sorted by gameScore desc so stars get priority
          const allStats = [...result.homeStats, ...result.awayStats]
              .sort((a, b) => (b.gameScore ?? 0) - (a.gameScore ?? 0));

          for (const stat of allStats) {
              const player = playerById.get(stat.playerId);
              if (!player) continue;

              const team     = player.tid === homeTeam.id ? homeTeam : awayTeam;
              const opponent = player.tid === homeTeam.id ? awayTeam : homeTeam;

              this.processContext(posts, {
                  ...baseCtx, player, team, opponent, stats: stat
              }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier, handlesById, llmEnabled, templateSet);
          }

          // 3. Injury Contexts (regular season only — Shams handles injuries during playoffs)
          if (result.injuries) {
              for (const injury of result.injuries) {
                  const player = playerById.get(injury.playerId);
                  if (!player || (this._uiMode !== 'euro_isolated'
                    && ['WNBA', 'Euroleague', 'PBA', 'B-League', 'G-League', 'Endesa', 'China CBA', 'NBL Australia'].includes(player.status || ''))) continue;

                  const team     = player.tid === homeTeam.id ? homeTeam : awayTeam;
                  const opponent = player.tid === homeTeam.id ? awayTeam : homeTeam;

                  this.processContext(posts, {
                      ...baseCtx, player, team, opponent, injury
                  }, usedTemplateIds, handlePlayerUsed, handlePostCount, avatars, multiplier, handlesById, llmEnabled, templateSet);
              }
          }
        } // end !isPlayoffGame
    }

    // Playoff-specific social posts — fire when series context is available
    if (playoffs && schedule) {
      const playoffPosts = this._uiMode === 'euro_isolated'
        ? generateEuroPlayoffPosts({ avatars, date, daysToSimulate, gameResults, players, playoffs, schedule, teams })
        : generatePlayoffPosts({
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

    return posts;
  }

  private processContext(
      posts: SocialPost[], 
      ctx: SocialContext, 
      usedTemplateIds: Set<string>,
      handlePlayerUsed: Set<string>,
      handlePostCount: Record<string, number>,
      avatars: any[],
      multiplier: number,
      handlesById: Map<string, ReturnType<typeof getSocialHandles>[string]>,
      llmEnabled: boolean,
      templateSet: SocialTemplateSet,
  ) {
      const sortedTemplates = getOrderedSocialTemplates(ctx, templateSet);

      for (const entry of sortedTemplates) {
          const { template } = entry;
          try {
              const rawHandleId = template.handle;
              const handleId = rawHandleId === 'shams' ? getPrimaryInsiderKey(ctx.date) : rawHandleId;

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
              const priority = entry.priority * multiplier;
              if (Math.random() * 100 > priority) continue;

              // ── Handle lookup ──────────────────────────────────────────────
              const handle = handlesById.get(handleId);
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
                  data: {
                    gameId: ctx.game.gameId,
                    templateId: template.id,
                    ...extraData,
                    ...(this._uiMode === 'euro_isolated' ? { league: 'euro', leagueId: 'euro' } : {}),
                    ...(this._uiMode === 'euro_isolated' && ctx.game.competitionId
                      ? { competitionId: ctx.game.competitionId }
                      : {}),
                  },
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
