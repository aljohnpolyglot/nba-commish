import type { GameState, NewsItem } from '../../../types';
import { getLsYear } from '../../../utils/leagueYear';
import { logPlanEvent } from '../../offseason/offseasonPlan';

export const autoInductHOFClass = async (state: GameState): Promise<Partial<GameState>> => {
  logPlanEvent('autoResolvers.autoInductHOFClass', 'fire', `date=${state.date}`);
  if (state.leagueStats?.uiMode === 'pba_isolated') return {};
  const classYear = getLsYear(state) - 1;
  const idPrefix = `hof-class-${classYear}-`;
  const inductedClasses = state.leagueStats?.hofClassesInducted ?? [];
  const alreadyPersisted = inductedClasses.includes(classYear);
  const alreadyInNews = (state.news ?? []).some(n => (n as any).id?.startsWith(idPrefix));
  if (alreadyPersisted || alreadyInNews) return {};

  try {
    const { fetchHOFData } = await import('../../../data/HOFData');
    const all = await fetchHOFData();
    const classInductees = all.filter(p => p.inductionYear === classYear);
    if (classInductees.length === 0) {
      return {
        leagueStats: {
          ...state.leagueStats,
          hofClassesInducted: [...inductedClasses, classYear],
        },
      };
    }

    const normalizeName = (name: string) => (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const inducteeNameSet = new Set(classInductees.map(p => normalizeName(p.name)));
    const updatedPlayers = (state.players ?? []).map(p => {
      if (p.hofInductionYear) return p;
      if (!inducteeNameSet.has(normalizeName(p.name))) return p;
      return { ...p, hof: true, hofInductionYear: classYear };
    });

    const names = classInductees.map(p => p.name).filter(Boolean);
    const date = state.date;
    const classItem = {
      id: `${idPrefix}${Date.now()}`,
      headline: `Class of ${classYear} Enshrined in the Hall of Fame`,
      content: `The Naismith Memorial Basketball Hall of Fame has formally inducted the Class of ${classYear}: ${names.join(', ')}.`,
      date,
      type: 'league' as const,
      isNew: true,
      read: false,
    } as any as NewsItem;

    const perInducteeItems = classInductees.slice(0, 10).map((p, i) => ({
      id: `${idPrefix}p-${i}-${Date.now()}`,
      headline: `${p.name} Inducted Into Hall of Fame`,
      content: `${p.name} has been formally enshrined as part of the Class of ${classYear}.`,
      date,
      type: 'player' as const,
      playerPortraitUrl: p.imgURL,
      isNew: true,
      read: false,
    } as any as NewsItem));

    const news = [classItem, ...perInducteeItems, ...(state.news ?? [])].slice(0, 200);
    return {
      players: updatedPlayers,
      news,
      leagueStats: {
        ...state.leagueStats,
        hofClassesInducted: [...inductedClasses, classYear],
      },
    };
  } catch (err) {
    console.warn('[autoInductHOFClass] failed:', err);
    return {};
  }
};
