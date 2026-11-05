export type {
  NewsCategory,
  NewsTemplate,
  NewsTemplateContext,
  NewsTemplateScope,
} from './newsTemplateTypes';
import { AWARD_NEWS_TEMPLATES } from './templates/awardNewsTemplates';
import { CORE_NEWS_TEMPLATES } from './templates/coreNewsTemplates';
import { EURO_NEWS_TEMPLATES } from './templates/euroNewsTemplates';
import { EVENT_NEWS_TEMPLATES } from './templates/eventNewsTemplates';
import { RESULT_NEWS_TEMPLATES } from './templates/resultNewsTemplates';
import { PBA_NEWS_TEMPLATES } from './templates/pbaNewsTemplates';

export const NEWS_TEMPLATES = [
  ...CORE_NEWS_TEMPLATES,
  ...EVENT_NEWS_TEMPLATES,
  ...AWARD_NEWS_TEMPLATES,
  ...RESULT_NEWS_TEMPLATES,
  ...EURO_NEWS_TEMPLATES,
  ...PBA_NEWS_TEMPLATES,
];

