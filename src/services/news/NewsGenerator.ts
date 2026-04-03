import { NEWS_TEMPLATES, NewsCategory } from './newsTemplates';
import { NewsItem } from '../../types';

export class NewsGenerator {
  private static sample<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private static interpolate(text: string, vars: Record<string, string | number>): string {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return result;
  }

  static generate(
    category: NewsCategory,
    dateString: string,
    vars: Record<string, string | number>,
    image?: string,
    newsType?: 'daily' | 'weekly'
  ): NewsItem | null {
    const template = NEWS_TEMPLATES.find(t => t.category === category);
    if (!template) return null;

    const headlineTpl = this.sample(template.headlines);
    const contentTpl = this.sample(template.contents);

    // Default weekly categories
    const weeklyCategories: NewsCategory[] = ['batch_recap', 'preseason_recap'];
    const resolvedType = newsType ?? (weeklyCategories.includes(category) ? 'weekly' : 'daily');

    return {
      id: `news-${category}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      headline: this.interpolate(headlineTpl, vars),
      content: this.interpolate(contentTpl, vars),
      date: dateString,
      category,
      isNew: true,
      image,
      newsType: resolvedType,
    };
  }
}
