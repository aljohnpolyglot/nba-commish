import { NBATeam } from '../../types';

export class TeamService {
    private teams: NBATeam[];

    constructor(teams: NBATeam[]) {
        this.teams = teams;
    }

    getAllTeams(): NBATeam[] {
        return this.teams;
    }

    getTeamById(id: number): NBATeam | undefined {
        return this.teams.find(t => t.id === id);
    }

    getTeamsByConference(conference: string): NBATeam[] {
        return this.teams.filter(t => t.conference === conference);
    }

    getEasternConferenceTeams(): NBATeam[] {
        return this.getTeamsByConference('East');
    }

    getWesternConferenceTeams(): NBATeam[] {
        return this.getTeamsByConference('West');
    }

    getStandings(): NBATeam[] {
        return [...this.teams].sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (a.losses !== b.losses) return a.losses - b.losses;
            return a.name.localeCompare(b.name);
        });
    }

    searchTeams(query: string): NBATeam[] {
        const lowerQuery = query.toLowerCase();
        return this.teams.filter(t => 
            t.name.toLowerCase().includes(lowerQuery) ||
            t.abbrev.toLowerCase().includes(lowerQuery)
        );
    }
}
