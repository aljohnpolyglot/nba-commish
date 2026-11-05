import {
  NEWS_TEMPLATES,
  type NewsCategory,
  type NewsTemplateContext,
} from './newsTemplates';
import { NewsItem } from '../../types';
import { isEuroIsolatedMode, isPbaIsolatedMode } from '../../utils/uiMode';

export interface RenderedNewsTemplate {
  headline: string;
  content: string;
}

function interpolate(text: string, vars: Record<string, string | number>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function stableIndex(seed: string | number, salt: string, length: number): number {
  let hash = 2166136261;
  for (const char of `${seed}:${salt}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

export function renderNewsTemplate(
  category: NewsCategory,
  vars: Record<string, string | number>,
  context: NewsTemplateContext = {},
): RenderedNewsTemplate | null {
  const template = NEWS_TEMPLATES.find(candidate => candidate.category === category);
  if (!template) return null;
  if (template.scope === 'euro' && !isEuroIsolatedMode({
    leagueStats: { uiMode: context.uiMode },
    moddedLeagueBase: context.moddedLeagueBase,
  })) return null;
  if (template.scope === 'pba' && !isPbaIsolatedMode({
    leagueStats: { uiMode: context.uiMode },
    moddedLeagueBase: context.moddedLeagueBase,
  })) return null;

  const headlineIndex = context.seed == null
    ? Math.floor(Math.random() * template.headlines.length)
    : stableIndex(context.seed, `${category}:headline`, template.headlines.length);
  const contentIndex = context.seed == null
    ? Math.floor(Math.random() * template.contents.length)
    : stableIndex(context.seed, `${category}:content`, template.contents.length);
  return {
    headline: interpolate(template.headlines[headlineIndex], vars),
    content: interpolate(template.contents[contentIndex], vars),
  };
}

export class NewsGenerator {
  static generate(
    category: NewsCategory,
    dateString: string,
    vars: Record<string, string | number>,
    image?: string,
    newsType?: 'daily' | 'weekly',
    context?: NewsTemplateContext,
  ): NewsItem | null {
    const rendered = renderNewsTemplate(category, vars, context);
    if (!rendered) return null;

    // Default weekly categories
    const weeklyCategories: NewsCategory[] = ['batch_recap', 'preseason_recap'];
    const resolvedType = newsType ?? (weeklyCategories.includes(category) ? 'weekly' : 'daily');

    return {
      id: `news-${category}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      headline: rendered.headline,
      content: rendered.content,
      date: dateString,
      category,
      isNew: true,
      image,
      newsType: resolvedType,
    };
  }
}
