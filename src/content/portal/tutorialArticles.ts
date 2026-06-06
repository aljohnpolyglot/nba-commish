import welcomeContent from './welcome-to-basket-commissioner-sim.md?raw';
import firstSaveContent from './first-save-guide.md?raw';
import gmVsCommissionerContent from './gm-vs-commissioner.md?raw';
import fastVsRealisticContent from './fast-vs-realistic.md?raw';
import fictionalVsModdedContent from './fictional-vs-modded.md?raw';
import whyPlayersStickContent from './why-players-stick-with-this-sim.md?raw';
import updatesJune2026Content from './updates-june-2026.md?raw';

export type TutorialSection = 'guides' | 'articles' | 'news' | 'updates' | 'community';
export type TutorialCategory =
  | 'Getting Started'
  | 'Modes'
  | 'Simulation'
  | 'League Types'
  | 'Long-Term Play'
  | 'Project Updates';
export type TutorialArtwork = 'stadium' | 'trophy' | 'warroom' | 'blueprint' | 'spotlight' | 'dynasty';

export interface TutorialArticle {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  section: TutorialSection;
  category: TutorialCategory;
  readTime: string;
  publishedLabel: string;
  updatedLabel: string;
  authorName: string;
  artwork: TutorialArtwork;
  content: string;
  featured?: boolean;
  popular?: boolean;
}

export const tutorialArticles: TutorialArticle[] = [
  {
    id: 'why-players-stick',
    title: 'Why Players Stick With This Sim',
    eyebrow: 'Featured Article',
    description: 'Why long saves become impossible to drop once the league starts carrying memory, rivalries, and scars from previous seasons.',
    section: 'articles',
    category: 'Long-Term Play',
    readTime: '3 min read',
    publishedLabel: 'May 12, 2025',
    updatedLabel: 'Long-save editorial',
    authorName: 'Learn The Sim Team',
    artwork: 'stadium',
    content: whyPlayersStickContent,
    featured: true,
    popular: true,
  },
  {
    id: 'welcome',
    title: 'What Kind of Basketball Sim Is This, Really?',
    eyebrow: 'Start Here',
    description: 'A clearer brand-level introduction for players who want commissioner control, franchise-mode obsession, and free long-term sandbox play.',
    section: 'guides',
    category: 'Getting Started',
    readTime: '4 min read',
    publishedLabel: 'May 10, 2025',
    updatedLabel: 'Brand overview',
    authorName: 'Learn The Sim Team',
    artwork: 'dynasty',
    content: welcomeContent,
    popular: true,
  },
  {
    id: 'first-save',
    title: 'How to Start Your First Save Without Getting Lost',
    eyebrow: 'Guide',
    description: 'A better first-run playbook covering role choice, world setup, simulator choice, and the right first-season mindset.',
    section: 'guides',
    category: 'Getting Started',
    readTime: '4 min read',
    publishedLabel: 'May 8, 2025',
    updatedLabel: 'Starter playbook',
    authorName: 'Learn The Sim Team',
    artwork: 'spotlight',
    content: firstSaveContent,
  },
  {
    id: 'gm-vs-commissioner',
    title: 'GM Mode vs Commissioner Mode',
    eyebrow: 'Modes',
    description: 'Two different basketball fantasies: one franchise under pressure, or the whole league under your hand.',
    section: 'articles',
    category: 'Modes',
    readTime: '3 min read',
    publishedLabel: 'May 6, 2025',
    updatedLabel: 'Mode guide',
    authorName: 'Learn The Sim Team',
    artwork: 'warroom',
    content: gmVsCommissionerContent,
    popular: true,
  },
  {
    id: 'fast-vs-realistic',
    title: 'Fast vs Realistic: Which Simulator Should You Use?',
    eyebrow: 'Simulation',
    description: 'A practical breakdown of throughput versus texture, based on how the two sim paths actually behave in this project.',
    section: 'articles',
    category: 'Simulation',
    readTime: '3 min read',
    publishedLabel: 'May 4, 2025',
    updatedLabel: 'Simulator guide',
    authorName: 'Learn The Sim Team',
    artwork: 'blueprint',
    content: fastVsRealisticContent,
  },
  {
    id: 'fictional-vs-modded',
    title: 'Fictional Leagues vs Modded Leagues',
    eyebrow: 'League Types',
    description: 'Pick between a clean new basketball world and a more familiar frame that hooks faster.',
    section: 'articles',
    category: 'League Types',
    readTime: '3 min read',
    publishedLabel: 'May 2, 2025',
    updatedLabel: 'Universe guide',
    authorName: 'Learn The Sim Team',
    artwork: 'trophy',
    content: fictionalVsModdedContent,
  },
  {
    id: 'updates-june-2026',
    title: 'Recent Updates: What Actually Changed in the Sim',
    eyebrow: 'Updates',
    description: 'A player-facing changelog covering new All-Star depth, Euro-mode work, offseason cleanup, and the broader push toward a more complete free sim.',
    section: 'updates',
    category: 'Project Updates',
    readTime: '3 min read',
    publishedLabel: 'June 2, 2026',
    updatedLabel: 'Player-facing changelog',
    authorName: 'Learn The Sim Team',
    artwork: 'dynasty',
    content: updatesJune2026Content,
  },
];

export const tutorialSections: Array<{ id: TutorialSection; label: string }> = [
  { id: 'guides', label: 'Guides' },
  { id: 'articles', label: 'Articles' },
  { id: 'news', label: 'News' },
  { id: 'updates', label: 'Updates' },
  { id: 'community', label: 'Community' },
];
