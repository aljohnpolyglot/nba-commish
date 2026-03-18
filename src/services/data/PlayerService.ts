import { NBAPlayer, NBATeam } from '../../types';

export class PlayerService {
    private players: NBAPlayer[];

    constructor(players: NBAPlayer[]) {
        this.players = players;
    }

    getAllPlayers(): NBAPlayer[] {
        return this.players;
    }

    getActivePlayers(): NBAPlayer[] {
        return this.players.filter(p => p.status === 'Active');
    }

    getFreeAgents(): NBAPlayer[] {
        return this.players.filter(p => p.status === 'Free Agent');
    }

    getPlayersByPosition(position: string): NBAPlayer[] {
        return this.players.filter(p => p.pos === position);
    }

    getPointGuards(): NBAPlayer[] {
        return this.getPlayersByPosition('PG');
    }

    getShootingGuards(): NBAPlayer[] {
        return this.getPlayersByPosition('SG');
    }

    getSmallForwards(): NBAPlayer[] {
        return this.getPlayersByPosition('SF');
    }

    getPowerForwards(): NBAPlayer[] {
        return this.getPlayersByPosition('PF');
    }

    getCenters(): NBAPlayer[] {
        return this.getPlayersByPosition('C');
    }

    getPlayersByTeam(teamId: number): NBAPlayer[] {
        return this.players.filter(p => p.tid === teamId);
    }

    getPlayerById(id: string): NBAPlayer | undefined {
        return this.players.find(p => p.internalId === id);
    }

    getTopPlayers(limit: number = 10): NBAPlayer[] {
        return [...this.players]
            .filter(p => p.status === 'Active' || p.status === 'Free Agent')
            .sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0))
            .slice(0, limit);
    }

    searchPlayers(query: string): NBAPlayer[] {
        const lowerQuery = query.toLowerCase();
        return this.players.filter(p => 
            p.name.toLowerCase().includes(lowerQuery)
        );
    }
}
