export type { NewsCategory, NewsTemplate } from './newsTemplateTypes';
import { AWARD_NEWS_TEMPLATES } from './templates/awardNewsTemplates';
import { CORE_NEWS_TEMPLATES } from './templates/coreNewsTemplates';
import { EVENT_NEWS_TEMPLATES } from './templates/eventNewsTemplates';
import { RESULT_NEWS_TEMPLATES } from './templates/resultNewsTemplates';

export const NEWS_TEMPLATES = [
  ...CORE_NEWS_TEMPLATES,
  ...EVENT_NEWS_TEMPLATES,
  ...AWARD_NEWS_TEMPLATES,
  ...RESULT_NEWS_TEMPLATES,
];

