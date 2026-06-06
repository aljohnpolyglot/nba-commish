import React, { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  ChevronRight,
  Mail,
  Search,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import {
  tutorialArticles,
  tutorialSections,
  type TutorialArticle,
  type TutorialArtwork,
  type TutorialSection,
} from '../../content/portal/tutorialArticles';

interface TutorialPortalProps {
  isOpen: boolean;
  onClose: () => void;
}

const topicIcons = [Zap, Trophy, Users, BookOpenText];

const extractHeadings = (content: string) =>
  content
    .split('\n')
    .filter(line => line.startsWith('## '))
    .map(line => line.replace(/^## /, '').trim());

const formatCategoryCount = (label: string, count: number) => ({
  label,
  count: `${count} article${count === 1 ? '' : 's'}`,
});

const sectionStatusCopy: Record<Exclude<TutorialSection, 'guides' | 'articles' | 'updates'>, { title: string; body: string }> = {
  news: {
    title: 'News is coming soon',
    body: 'The news feed is planned as a player-facing surface for league stories, feature drops, and save-world coverage. It is not live yet.',
  },
  community: {
    title: 'Community is coming soon',
    body: 'Community pages will eventually surface player stories, strategy discussion, and shared save culture. That section is not live yet.',
  },
};

const PortalArtwork: React.FC<{
  variant: TutorialArtwork;
  compact?: boolean;
}> = ({ variant, compact = false }) => {
  const sizeClass = compact ? 'h-full min-h-[92px]' : 'h-full min-h-[240px]';

  const sharedLight = (
    <>
      <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.45),_transparent_55%)] opacity-70" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(2,6,23,0.1),_rgba(2,6,23,0.82))]" />
      <div className="absolute left-[-8%] right-[-8%] bottom-[-28%] h-[55%] rounded-[100%] border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.22),_rgba(2,6,23,0.96)_72%)]" />
    </>
  );

  return (
    <div className={`relative overflow-hidden rounded-[inherit] ${sizeClass}`}>
      {variant === 'stadium' && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_#081225,_#132c61_48%,_#050d1f)]">
          {sharedLight}
          <div className="absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-white shadow-[0_0_18px_8px_rgba(255,255,255,0.45)]" />
          <div className="absolute right-[16%] top-[16%] h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_22px_10px_rgba(255,255,255,0.42)]" />
          <div className="absolute left-[48%] bottom-[8%] h-[52%] w-[10%] rounded-t-[40%] bg-[linear-gradient(180deg,_rgba(17,24,39,0.3),_rgba(7,18,43,0.95))]" />
          <div className="absolute left-[50.4%] bottom-[30%] h-[18%] w-[2.2%] bg-[#09152e]" />
          <div className="absolute left-[42.5%] bottom-[42%] h-[4px] w-[11%] rotate-[-25deg] rounded-full bg-[#09152e]" />
          <div className="absolute left-[48%] bottom-[48%] h-[4px] w-[11%] rotate-[28deg] rounded-full bg-[#09152e]" />
        </div>
      )}
      {variant === 'trophy' && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_#0b1220,_#1a2f5f_52%,_#0b1220)]">
          {sharedLight}
          <div className="absolute left-1/2 top-[18%] h-[38%] w-[12%] -translate-x-1/2 rounded-b-[22%] rounded-t-[30%] border border-amber-200/50 bg-[linear-gradient(180deg,_rgba(250,204,21,0.65),_rgba(120,53,15,0.72))]" />
          <div className="absolute left-[39%] top-[22%] h-[20%] w-[6%] rounded-l-full border border-amber-100/35 border-r-0" />
          <div className="absolute right-[39%] top-[22%] h-[20%] w-[6%] rounded-r-full border border-amber-100/35 border-l-0" />
          <div className="absolute left-1/2 top-[56%] h-[10%] w-[2.4%] -translate-x-1/2 bg-amber-700/80" />
          <div className="absolute left-1/2 top-[64%] h-[4%] w-[12%] -translate-x-1/2 rounded-full bg-amber-500/80" />
        </div>
      )}
      {variant === 'warroom' && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_#08111f,_#152640_52%,_#060b16)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.32),_transparent_28%)]" />
          <div className="absolute left-[8%] top-[22%] h-[18%] w-[20%] rounded-2xl border border-sky-400/20 bg-slate-900/70" />
          <div className="absolute left-[32%] top-[26%] h-[22%] w-[24%] rounded-2xl border border-white/10 bg-slate-900/65" />
          <div className="absolute right-[10%] top-[18%] h-[28%] w-[22%] rounded-2xl border border-indigo-400/20 bg-slate-900/70" />
          <div className="absolute inset-x-[12%] bottom-[12%] h-[24%] rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.2),_rgba(15,23,42,0.85))]" />
        </div>
      )}
      {variant === 'blueprint' && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_#081326,_#0a2347_52%,_#081326)]">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.2)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="absolute left-[14%] top-[22%] h-[28%] w-[32%] rounded-[24px] border border-cyan-300/30 bg-cyan-400/8" />
          <div className="absolute right-[12%] top-[18%] h-[20%] w-[22%] rounded-[24px] border border-white/10 bg-white/5" />
          <div className="absolute right-[18%] bottom-[18%] h-[26%] w-[30%] rounded-[24px] border border-blue-300/20 bg-blue-400/10" />
        </div>
      )}
      {variant === 'spotlight' && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_#07101f,_#0f2347_45%,_#06111f)]">
          <div className="absolute left-1/2 top-[-10%] h-[58%] w-[58%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.32),_transparent_62%)] blur-2xl" />
          <div className="absolute left-[47%] bottom-[6%] h-[54%] w-[9%] rounded-t-[45%] bg-[linear-gradient(180deg,_rgba(14,23,42,0.3),_rgba(4,10,24,0.96))]" />
          <div className="absolute left-[42%] bottom-[34%] h-[4px] w-[10%] rotate-[-24deg] rounded-full bg-[#07111d]" />
          <div className="absolute left-[48%] bottom-[42%] h-[4px] w-[10%] rotate-[28deg] rounded-full bg-[#07111d]" />
        </div>
      )}
      {variant === 'dynasty' && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,_#091325,_#182d5d_50%,_#08111f)]">
          {sharedLight}
          <div className="absolute left-[10%] bottom-[12%] h-[36%] w-[16%] rounded-[24px] border border-white/10 bg-white/6" />
          <div className="absolute left-[30%] bottom-[12%] h-[48%] w-[16%] rounded-[24px] border border-white/10 bg-white/8" />
          <div className="absolute left-[50%] bottom-[12%] h-[64%] w-[16%] rounded-[24px] border border-amber-300/25 bg-amber-300/10" />
          <div className="absolute left-[70%] bottom-[12%] h-[28%] w-[16%] rounded-[24px] border border-white/10 bg-white/6" />
        </div>
      )}
    </div>
  );
};

export const TutorialPortal: React.FC<TutorialPortalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<TutorialSection>('articles');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(tutorialArticles[0]?.id ?? '');
  const [view, setView] = useState<'home' | 'article'>('home');

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const filteredArticles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tutorialArticles.filter(article => {
      const sectionMatch =
        activeSection === 'articles'
          ? article.section === 'articles' || article.section === 'guides'
          : article.section === activeSection;
      const searchMatch = !query
        || article.title.toLowerCase().includes(query)
        || article.description.toLowerCase().includes(query)
        || article.category.toLowerCase().includes(query);
      return sectionMatch && searchMatch;
    });
  }, [activeSection, search]);

  const selectedArticle = tutorialArticles.find(article => article.id === selectedId) ?? tutorialArticles[0];
  const featuredArticle = tutorialArticles.find(article => article.featured) ?? tutorialArticles[0];
  const latestArticles = filteredArticles.filter(article => article.id !== featuredArticle.id);
  const popularArticles = tutorialArticles.filter(article => article.popular).slice(0, 3);
  const topicCards = Array.from(new Set(tutorialArticles.map(article => article.category))).map((label, index) => ({
    ...formatCategoryCount(label, tutorialArticles.filter(article => article.category === label).length),
    Icon: topicIcons[index % topicIcons.length],
  }));
  const articleHeadings = extractHeadings(selectedArticle.content);
  const updatesArticle = tutorialArticles.find(article => article.section === 'updates') ?? tutorialArticles[0];

  const openArticle = (article: TutorialArticle) => {
    setSelectedId(article.id);
    setView('article');
  };

  const openSectionHome = (section: TutorialSection, nextSearch = '') => {
    setActiveSection(section);
    setSearch(nextSearch);
    setView('home');
  };

  useEffect(() => {
    if (!isOpen) {
      setView('home');
      setSearch('');
      setActiveSection('articles');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] overflow-y-auto bg-[#040b18] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),_transparent_35%),linear-gradient(180deg,_#050d1f,_#030814)]" />
      <div className="relative min-h-screen">
        <header className="sticky top-0 z-20 border-b border-white/8 bg-[#040b18]/90 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[1380px] items-center gap-4 px-4 py-4 sm:px-6">
            <button className="flex min-w-0 items-center gap-3" onClick={() => openSectionHome('articles')}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-400/35 bg-sky-500/10 text-sky-300">
                <BookOpenText size={22} />
              </div>
              <div className="min-w-0 text-left">
                <div className="truncate text-2xl font-black uppercase tracking-tight text-white">Learn The Sim</div>
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-sky-300">Tutorial Portal</div>
              </div>
            </button>

            <nav className="hidden flex-1 items-center justify-center gap-8 lg:flex">
              {tutorialSections.map(section => (
                <button
                  key={section.id}
                  onClick={() => {
                    openSectionHome(section.id);
                  }}
                  className={`border-b-2 px-1 py-3 text-sm transition-colors ${
                    activeSection === section.id
                      ? 'border-sky-500 text-white'
                      : 'border-transparent text-slate-300 hover:text-white'
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <label className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 lg:flex">
                <Search size={16} className="text-slate-500" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search articles..."
                  className="w-56 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
                <span className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">K</span>
              </label>
              <button
                onClick={onClose}
                className="rounded-xl bg-[#1f6fff] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#3b82f6]"
              >
                Back to Landing
              </button>
            </div>
          </div>
        </header>

        {view === 'home' ? (
          <div className="mx-auto w-full max-w-[1380px] px-4 py-6 sm:px-6 sm:py-8">
            {activeSection === 'updates' ? (
              <section className="mx-auto max-w-5xl">
                <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#07111f]">
                  <div className="border-b border-white/8">
                    <div className="h-[240px]">
                      <PortalArtwork variant={updatesArticle.artwork} />
                    </div>
                    <div className="px-6 pb-8 pt-6 sm:px-8">
                      <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
                        What has changed in the sim lately
                      </h1>
                      <p className="mt-4 max-w-3xl text-xl leading-relaxed text-slate-300">
                        Major improvements, new features, offseason polish, mode work, and long-save fixes explained in normal language.
                      </p>
                    </div>
                  </div>
                  <div className="px-6 py-8 sm:px-8">
                    <article className="max-w-none text-lg leading-8 text-slate-200 [&_h1]:hidden [&_h2]:mt-10 [&_h2]:text-3xl [&_h2]:font-black [&_h2]:tracking-tight [&_h3]:mt-8 [&_h3]:text-2xl [&_h3]:font-black [&_h3]:tracking-tight [&_p]:mt-4 [&_li]:mt-2 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:text-white">
                      <Markdown>{updatesArticle.content}</Markdown>
                    </article>
                  </div>
                </div>
              </section>
            ) : activeSection === 'news' || activeSection === 'community' ? (
              <section className="flex min-h-[70vh] items-center justify-center">
                <div className="w-full max-w-3xl rounded-[32px] border border-white/10 bg-white/[0.03] p-8 text-center sm:p-12">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-sky-300">{activeSection}</p>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">
                    {sectionStatusCopy[activeSection].title}
                  </h1>
                  <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
                    {sectionStatusCopy[activeSection].body}
                  </p>
                  <button
                    onClick={() => alert('Mailing list and section launch are coming soon.')}
                    className="mt-8 rounded-xl bg-[#1f6fff] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#3b82f6]"
                  >
                    Notify Me Later
                  </button>
                </div>
              </section>
            ) : (
            <>
            <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="flex flex-col justify-center py-4 sm:py-8">
                <p className="text-[10px] font-black uppercase tracking-[0.38em] text-sky-300">Built On BBGM Foundations</p>
                <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl">
                  A complete free basketball sim.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
                  Built for players who want one save to last for years.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => openSectionHome('articles')}
                    className="rounded-xl bg-[#1f6fff] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#3b82f6]"
                  >
                    Browse All Articles
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#081326]">
                <PortalArtwork variant="stadium" />
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_400px]">
              <button
                onClick={() => openArticle(featuredArticle)}
                className="group overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.03] text-left transition-colors hover:border-white/15"
              >
                <div className="grid min-h-[260px] gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="p-6 sm:p-8">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-sky-300">{featuredArticle.eyebrow}</p>
                    <h2 className="mt-5 max-w-xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                      {featuredArticle.title}
                    </h2>
                    <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-300">{featuredArticle.description}</p>
                    <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-400">
                      <span>{featuredArticle.authorName}</span>
                      <span>•</span>
                      <span>{featuredArticle.publishedLabel}</span>
                      <span>•</span>
                      <span>{featuredArticle.readTime}</span>
                    </div>
                    <div className="mt-8 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-white group-hover:bg-white/[0.08]">
                      Read Article <ArrowRight size={16} />
                    </div>
                  </div>
                  <div className="min-h-[240px] border-l border-white/6">
                    <PortalArtwork variant={featuredArticle.artwork} />
                  </div>
                </div>
              </button>

              <div className="space-y-4">
                <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-300">Browse By Topic</p>
                    <button className="text-sm text-[#2d7dff]" onClick={() => openSectionHome('guides')}>
                      View all
                    </button>
                  </div>
                  <div className="space-y-3">
                    {topicCards.map(({ label, count, Icon }) => (
                      <button
                        key={label}
                        onClick={() => openSectionHome('articles', label)}
                        className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-sky-300">
                            <Icon size={18} />
                          </div>
                          <div>
                            <div className="text-base font-semibold text-white">{label}</div>
                            <div className="text-sm text-slate-400">{count}</div>
                          </div>
                        </div>
                        <ChevronRight size={18} className="text-slate-500" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-300">Popular This Month</p>
                  <div className="mt-4 space-y-3">
                    {popularArticles.map(article => (
                      <button
                        key={article.id}
                        onClick={() => openArticle(article)}
                        className="grid w-full grid-cols-[84px_minmax(0,1fr)] gap-3 text-left"
                      >
                        <div className="overflow-hidden rounded-2xl border border-white/10">
                          <PortalArtwork variant={article.artwork} compact />
                        </div>
                        <div>
                          <div className="text-base font-semibold text-white">{article.title}</div>
                          <div className="mt-1 text-sm text-slate-400">{article.readTime}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_400px]">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-3xl font-black tracking-tight text-white">Latest Articles</h3>
                  <button className="inline-flex items-center gap-2 text-lg text-[#2d7dff]" onClick={() => openSectionHome('articles')}>
                    View all articles <ArrowRight size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  {latestArticles.map(article => (
                    <button
                      key={article.id}
                      onClick={() => openArticle(article)}
                      className="grid w-full gap-4 border-b border-white/8 pb-4 text-left sm:grid-cols-[210px_minmax(0,1fr)]"
                    >
                      <div className="overflow-hidden rounded-[22px] border border-white/10">
                        <PortalArtwork variant={article.artwork} compact />
                      </div>
                      <div className="py-1">
                        <h4 className="text-2xl font-semibold tracking-tight text-white">{article.title}</h4>
                        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-400">{article.description}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                          <span>{article.publishedLabel}</span>
                          <span>•</span>
                          <span>{article.readTime}</span>
                          <span className="rounded-md bg-[#10243f] px-2 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">
                            {article.category}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white">
                  <Mail size={20} />
                </div>
                <h4 className="mt-5 text-3xl font-black tracking-tight text-white">Never Miss an Update</h4>
                <p className="mt-3 text-lg leading-relaxed text-slate-400">
                  Get the latest articles, guides, and strategy breakdowns straight to your inbox.
                </p>
                <div className="mt-6 flex gap-3">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                    placeholder="Enter your email"
                  />
                  <button
                    className="rounded-xl bg-[#1f6fff] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#3b82f6]"
                    onClick={() => alert('Mailing list is coming soon.')}
                  >
                    Subscribe
                  </button>
                </div>
              </div>
            </section>
            </>
            )}
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-[1380px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[290px_minmax(0,1fr)_240px]">
            <aside className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-sky-300">Player Guide</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Essential guides for commissioner runs, GM careers, simulator choices, and long-save strategy.
              </p>

              <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-[#07111f] px-4 py-3">
                <Search size={16} className="text-slate-500" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search guides..."
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>

              <div className="mt-6">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Recent Articles</p>
                <div className="mt-3 space-y-3">
                  {tutorialArticles.map(article => (
                    <button
                      key={article.id}
                      onClick={() => setSelectedId(article.id)}
                      className={`w-full rounded-[20px] border p-3 text-left transition-colors ${
                        selectedArticle.id === article.id
                          ? 'border-sky-500/30 bg-sky-500/10'
                          : 'border-white/8 bg-white/[0.03] hover:border-white/15'
                      }`}
                    >
                      <div className="grid grid-cols-[74px_minmax(0,1fr)] gap-3">
                        <div className="overflow-hidden rounded-2xl border border-white/10">
                          <PortalArtwork variant={article.artwork} compact />
                        </div>
                        <div>
                          <div className="text-sm font-black uppercase leading-tight text-white">{article.title}</div>
                          <div className="mt-2 text-xs text-slate-400">{article.readTime}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <main className="overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f]">
              <div className="border-b border-white/8">
                <div className="h-[320px]">
                  <PortalArtwork variant={selectedArticle.artwork} />
                </div>
                <div className="px-6 pb-8 pt-6 sm:px-8">
                  <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-[0.35em] text-sky-300">
                    <span>{selectedArticle.category}</span>
                    <span className="text-slate-600">•</span>
                    <span>{selectedArticle.readTime}</span>
                  </div>
                  <h1 className="mt-4 max-w-4xl text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
                    {selectedArticle.title}
                  </h1>
                  <p className="mt-4 max-w-3xl text-xl leading-relaxed text-slate-300">
                    {selectedArticle.description}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                    <span>{selectedArticle.authorName}</span>
                    <span>•</span>
                    <span>{selectedArticle.publishedLabel}</span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-8 sm:px-8">
                <article className="max-w-none text-lg leading-8 text-slate-200 [&_h1]:hidden [&_h2]:mt-10 [&_h2]:text-3xl [&_h2]:font-black [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-black [&_p]:mt-4 [&_li]:mt-2 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:text-white">
                  <Markdown>{selectedArticle.content}</Markdown>
                </article>
              </div>
            </main>

            <aside className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-300">On This Page</p>
                <div className="mt-4 space-y-2">
                  {articleHeadings.map((heading, index) => (
                    <div
                      key={heading}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        index === 0 ? 'bg-[#0f2342] text-sky-300' : 'text-slate-300'
                      }`}
                    >
                      {heading}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1f6fff] text-white">
                  <Mail size={18} />
                </div>
                <h3 className="mt-4 text-2xl font-black tracking-tight text-white">Never Miss a Guide</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Get the latest tutorials and strategy breakdowns straight to your inbox.
                </p>
                <input
                  className="mt-4 w-full rounded-xl border border-white/10 bg-[#07111f] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="Enter your email"
                />
                <button
                  className="mt-3 w-full rounded-xl bg-[#1f6fff] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#3b82f6]"
                  onClick={() => alert('Mailing list is coming soon.')}
                >
                  Subscribe
                </button>
              </div>

              <button
                onClick={() => setView('home')}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-white/[0.06]"
              >
                <ArrowLeft size={16} />
                Back to Articles
              </button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
