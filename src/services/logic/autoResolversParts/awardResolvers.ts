import type { GameState, HistoricalAward, NewsItem } from '../../../types';
import { AwardService } from '../AwardService';
import { NewsGenerator } from '../../news/NewsGenerator';

type AwardKey = 'COY' | 'SMOY' | 'MIP' | 'DPOY' | 'ROY' | 'All-NBA' | 'MVP';

const PLAYER_AWARD_TYPE_MAP: Record<string, string> = {
  MVP: 'Most Valuable Player',
  DPOY: 'Defensive Player of the Year',
  ROY: 'Rookie of the Year',
  SMOY: 'Sixth Man of the Year',
  MIP: 'Most Improved Player',
};

function announceAward(state: GameState, key: AwardKey): Partial<GameState> {
  const season = state.leagueStats.year;
  const existing = (state.historicalAwards ?? []).filter(a => a.season === season);
  const storedType = key === 'All-NBA' ? 'All-NBA First Team' : key;
  if (existing.some(a => a.type === storedType)) return {};

  try {
    const races = AwardService.calculateAwardRaces(
      state.players, state.teams, season, state.staff, state.leagueStats.minGamesRequirement
    );

    const date = state.date;
    const newAwards: HistoricalAward[] = [];
    const newsItems: NewsItem[] = [];
    let updatedPlayers = state.players;

    const addPlayerAward = (type: string, pid: string) => {
      const normalType = PLAYER_AWARD_TYPE_MAP[type] ?? type;
      updatedPlayers = updatedPlayers.map(p =>
        p.internalId === pid
          ? { ...p, awards: [...(p.awards ?? []), { season, type: normalType }] }
          : p
      );
    };

    if (key === 'COY') {
      const coy = races.coy[0];
      if (!coy) return {};
      newAwards.push({ season, type: 'COY', name: coy.coachName, tid: coy.team.id });
      const item = NewsGenerator.generate('award_coy', date, {
        coachName: coy.coachName, teamName: coy.team.name, year: season,
        wins: coy.wins, losses: coy.losses,
      }, coy.team.logoUrl);
      if (item) newsItems.push(item);
    } else if (key === 'SMOY') {
      const smoy = races.smoy[0];
      if (!smoy) return {};
      newAwards.push({ season, type: 'SMOY', name: smoy.player.name, pid: smoy.player.internalId, tid: smoy.team.id });
      addPlayerAward('SMOY', smoy.player.internalId);
      const gp = smoy.stats.gp || 1;
      const item = NewsGenerator.generate('award_smoy', date, {
        playerName: smoy.player.name, teamName: smoy.team.name, year: season,
        pts: (smoy.stats.pts / gp).toFixed(1),
      }, smoy.player.imgURL);
      if (item) { item.playerPortraitUrl = smoy.player.imgURL; newsItems.push(item); }
    } else if (key === 'MIP') {
      const mip = races.mip[0];
      if (!mip) return {};
      newAwards.push({ season, type: 'MIP', name: mip.player.name, pid: mip.player.internalId, tid: mip.team.id });
      addPlayerAward('MIP', mip.player.internalId);
      const gp = mip.stats.gp || 1;
      const item = NewsGenerator.generate('award_mip', date, {
        playerName: mip.player.name, teamName: mip.team.name, year: season,
        pts: (mip.stats.pts / gp).toFixed(1),
      }, mip.player.imgURL);
      if (item) { item.playerPortraitUrl = mip.player.imgURL; newsItems.push(item); }
    } else if (key === 'DPOY') {
      const dpoy = races.dpoy[0];
      if (!dpoy) return {};
      newAwards.push({ season, type: 'DPOY', name: dpoy.player.name, pid: dpoy.player.internalId, tid: dpoy.team.id });
      addPlayerAward('DPOY', dpoy.player.internalId);
      const item = NewsGenerator.generate('award_dpoy', date, {
        playerName: dpoy.player.name, teamName: dpoy.team.name, year: season,
      }, dpoy.player.imgURL);
      if (item) { item.playerPortraitUrl = dpoy.player.imgURL; newsItems.push(item); }
    } else if (key === 'ROY') {
      const roty = races.roty[0];
      if (!roty) return {};
      newAwards.push({ season, type: 'ROY', name: roty.player.name, pid: roty.player.internalId, tid: roty.team.id });
      addPlayerAward('ROY', roty.player.internalId);
      const gp = roty.stats.gp || 1;
      const item = NewsGenerator.generate('award_roty', date, {
        playerName: roty.player.name, teamName: roty.team.name, year: season,
        pts: (roty.stats.pts / gp).toFixed(1),
        reb: ((roty.stats.trb ?? 0) / gp).toFixed(1),
        ast: (roty.stats.ast / gp).toFixed(1),
      }, roty.player.imgURL);
      if (item) { item.playerPortraitUrl = roty.player.imgURL; newsItems.push(item); }
    } else if (key === 'All-NBA') {
      const { allNBA, allDefense, allRookie } = races.allNBATeams;
      if (!allNBA[0]?.length) return {};
      const allNBANames = ['All-NBA First Team', 'All-NBA Second Team', 'All-NBA Third Team'] as const;
      allNBA.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allNBANames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
          addPlayerAward(allNBANames[i], spot.player.internalId);
        }
      });
      const allDefNames = ['All-Defensive First Team', 'All-Defensive Second Team'] as const;
      allDefense.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allDefNames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
          addPlayerAward(allDefNames[i], spot.player.internalId);
        }
      });
      const allRookieNames = ['All-Rookie First Team', 'All-Rookie Second Team'] as const;
      allRookie.forEach((team, i) => {
        for (const spot of team) {
          newAwards.push({ season, type: allRookieNames[i], name: spot.player.name, pid: spot.player.internalId, tid: spot.team.id });
          addPlayerAward(allRookieNames[i], spot.player.internalId);
        }
      });
      const top = allNBA[0][0];
      const item = NewsGenerator.generate('award_allnba', date, {
        playerName: top.player.name, teamName: top.team.name, year: season,
      }, top.player.imgURL);
      if (item) { item.playerPortraitUrl = top.player.imgURL; newsItems.push(item); }
    } else if (key === 'MVP') {
      const mvp = races.mvp[0];
      if (!mvp) return {};
      newAwards.push({ season, type: 'MVP', name: mvp.player.name, pid: mvp.player.internalId, tid: mvp.team.id });
      addPlayerAward('MVP', mvp.player.internalId);
      const gp = mvp.stats.gp || 1;
      const item = NewsGenerator.generate('award_mvp', date, {
        playerName: mvp.player.name, teamName: mvp.team.name, year: season,
        pts: (mvp.stats.pts / gp).toFixed(1),
        reb: ((mvp.stats.trb ?? 0) / gp).toFixed(1),
        ast: (mvp.stats.ast / gp).toFixed(1),
      }, mvp.player.imgURL);
      if (item) { item.playerPortraitUrl = mvp.player.imgURL; newsItems.push(item); }
    }

    return {
      players: updatedPlayers,
      historicalAwards: [...(state.historicalAwards ?? []), ...newAwards],
      news: newsItems.length > 0
        ? [...newsItems, ...(state.news ?? [])].slice(0, 200)
        : state.news,
    };
  } catch (err) {
    console.warn(`announceAward(${key}) failed:`, err);
    return {};
  }
}

export const autoAnnounceCOY = (s: GameState) => announceAward(s, 'COY');
export const autoAnnounceSMOY = (s: GameState) => announceAward(s, 'SMOY');
export const autoAnnounceMIP = (s: GameState) => announceAward(s, 'MIP');
export const autoAnnounceDPOY = (s: GameState) => announceAward(s, 'DPOY');
export const autoAnnounceROY = (s: GameState) => announceAward(s, 'ROY');
export const autoAnnounceAllNBA = (s: GameState) => announceAward(s, 'All-NBA');
export const autoAnnounceMVP = (s: GameState) => announceAward(s, 'MVP');
export const autoAnnounceAwards = (_state: GameState): Partial<GameState> => ({});
