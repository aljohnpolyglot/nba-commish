import { NBATeam, NBAPlayer } from '../../../types';
import { LivePlayerStat, LiveTeamStat } from '../types';
import { StarterService } from '../StarterService';
import { calcTeamRatings } from '../teamratinghelper';

export interface PlayByPlayEvent {
  id: string;
  time: string;
  text: string;
  teamId?: number;
  score: { home: number; away: number };
}

export class LiveGameEngine {
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  homePlayers: NBAPlayer[];
  awayPlayers: NBAPlayer[];
  
  homeStats: Record<string, LivePlayerStat> = {};
  awayStats: Record<string, LivePlayerStat> = {};
  
  homeScore = 0;
  awayScore = 0;
  
  quarter = 1;
  clock = 720; // 12 minutes in seconds
  
  events: PlayByPlayEvent[] = [];
  
  homePossession = true;
  
  homeRatings: any;
  awayRatings: any;

  constructor(homeTeam: NBATeam, awayTeam: NBATeam, players: NBAPlayer[]) {
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    
    this.homePlayers = players.filter(p => p.tid === homeTeam.id);
    this.awayPlayers = players.filter(p => p.tid === awayTeam.id);
    
    this.homeRatings = calcTeamRatings(homeTeam.id, players);
    this.awayRatings = calcTeamRatings(awayTeam.id, players);
    
    this.initStats(this.homePlayers, this.homeStats);
    this.initStats(this.awayPlayers, this.awayStats);
  }
  
  private initStats(players: NBAPlayer[], stats: Record<string, LivePlayerStat>) {
    players.forEach(p => {
      stats[p.internalId] = {
        n: p.name,
        fn: p.name,
        id: Number(p.internalId),
        pos: p.pos,
        pts: 0, fgm: 0, fga: 0, tp: 0, tpa: 0, ftm: 0, fta: 0,
        ast: 0, orb: 0, drb: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0, sec: 0
      };
    });
  }
  
  private formatTime(clock: number): string {
    const m = Math.floor(clock / 60);
    const s = clock % 60;
    return `Q${this.quarter} ${m}:${s.toString().padStart(2, '0')}`;
  }
  
  private addEvent(text: string, teamId?: number) {
    this.events.unshift({
      id: Math.random().toString(36).substr(2, 9),
      time: this.formatTime(this.clock),
      text,
      teamId,
      score: { home: this.homeScore, away: this.awayScore }
    });
    if (this.events.length > 50) this.events.pop();
  }
  
  private getActivePlayer(players: NBAPlayer[]): NBAPlayer {
    // Simple: just pick a random player, weighted by overall rating
    const totalRating = players.reduce((sum, p) => sum + p.overallRating, 0);
    let r = Math.random() * totalRating;
    for (const p of players) {
      r -= p.overallRating;
      if (r <= 0) return p;
    }
    return players[0];
  }
  
  public simulatePossession() {
    if (this.clock <= 0) {
      if (this.quarter >= 4 && this.homeScore !== this.awayScore) {
        return true; // Game over
      }
      this.quarter++;
      this.clock = this.quarter > 4 ? 300 : 720; // 5 min OT or 12 min Q
      this.addEvent(`Start of ${this.quarter > 4 ? 'OT' : 'Q' + this.quarter}`);
      return false;
    }
    
    const timeElapsed = Math.floor(Math.random() * 14) + 10; // 10-24 seconds
    this.clock = Math.max(0, this.clock - timeElapsed);
    
    // Add seconds to random 5 players (simplified)
    const addSecs = (players: NBAPlayer[], stats: Record<string, LivePlayerStat>) => {
      for (let i = 0; i < 5 && i < players.length; i++) {
        stats[players[i].internalId].sec += timeElapsed;
      }
    };
    addSecs(this.homePlayers, this.homeStats);
    addSecs(this.awayPlayers, this.awayStats);
    
    const offense = this.homePossession ? this.homePlayers : this.awayPlayers;
    const defense = this.homePossession ? this.awayPlayers : this.homePlayers;
    const offStats = this.homePossession ? this.homeStats : this.awayStats;
    const defStats = this.homePossession ? this.awayStats : this.homeStats;
    const offTeam = this.homePossession ? this.homeTeam : this.awayTeam;
    
    const shooter = this.getActivePlayer(offense);
    const defender = this.getActivePlayer(defense);
    
    const isThree = Math.random() < 0.35;
    const makeProb = isThree ? 0.35 : 0.50;
    
    if (Math.random() < 0.13) {
      // Turnover
      offStats[shooter.internalId].tov++;
      if (Math.random() < 0.5) {
        defStats[defender.internalId].stl++;
        this.addEvent(`${shooter.name} turns it over, stolen by ${defender.name}`, offTeam.id);
      } else {
        this.addEvent(`${shooter.name} turns it over`, offTeam.id);
      }
    } else if (Math.random() < 0.15) {
      // Foul
      defStats[defender.internalId].pf++;
      offStats[shooter.internalId].fta += 2;
      let made = 0;
      if (Math.random() < 0.75) made++;
      if (Math.random() < 0.75) made++;
      offStats[shooter.internalId].ftm += made;
      offStats[shooter.internalId].pts += made;
      if (this.homePossession) this.homeScore += made;
      else this.awayScore += made;
      
      this.addEvent(`${defender.name} fouls ${shooter.name}. Makes ${made}/2 FTs.`, offTeam.id);
    } else {
      // Shot
      offStats[shooter.internalId].fga++;
      if (isThree) offStats[shooter.internalId].tpa++;
      
      if (Math.random() < makeProb) {
        // Make
        offStats[shooter.internalId].fgm++;
        if (isThree) {
          offStats[shooter.internalId].tp++;
          offStats[shooter.internalId].pts += 3;
          if (this.homePossession) this.homeScore += 3;
          else this.awayScore += 3;
        } else {
          offStats[shooter.internalId].pts += 2;
          if (this.homePossession) this.homeScore += 2;
          else this.awayScore += 2;
        }
        
        if (Math.random() < 0.6) {
          const passer = this.getActivePlayer(offense.filter(p => p.internalId !== shooter.internalId));
          if (passer) {
            offStats[passer.internalId].ast++;
            this.addEvent(`${shooter.name} makes ${isThree ? '3-pointer' : 'jumper'} (ast ${passer.name})`, offTeam.id);
          } else {
            this.addEvent(`${shooter.name} makes ${isThree ? '3-pointer' : 'jumper'}`, offTeam.id);
          }
        } else {
          this.addEvent(`${shooter.name} makes ${isThree ? '3-pointer' : 'jumper'}`, offTeam.id);
        }
      } else {
        // Miss
        if (Math.random() < 0.08) {
          defStats[defender.internalId].blk++;
          this.addEvent(`${shooter.name} misses ${isThree ? '3-pointer' : 'jumper'}, blocked by ${defender.name}`, offTeam.id);
        } else {
          this.addEvent(`${shooter.name} misses ${isThree ? '3-pointer' : 'jumper'}`, offTeam.id);
        }
        
        // Rebound
        if (Math.random() < 0.25) {
          const rebounder = this.getActivePlayer(offense);
          offStats[rebounder.internalId].orb++;
          this.addEvent(`${rebounder.name} offensive rebound`, offTeam.id);
          this.homePossession = !this.homePossession; // Keep possession (will be flipped back below)
        } else {
          const rebounder = this.getActivePlayer(defense);
          defStats[rebounder.internalId].drb++;
          this.addEvent(`${rebounder.name} defensive rebound`, offTeam.id === this.homeTeam.id ? this.awayTeam.id : this.homeTeam.id);
        }
      }
    }
    
    this.homePossession = !this.homePossession;
    return false; // Game not over
  }
}
