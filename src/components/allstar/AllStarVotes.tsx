import React from 'react';
import { Target } from 'lucide-react';
import { useGame } from '../../store/GameContext';
import { getPlayerHeadshot, getTeamLogo, extractTeamId } from '../../utils/helpers';
import { getPlayerImage } from '../central/view/bioCache';

interface AllStarVotesProps {
  allStar: any;
}

export const AllStarVotes: React.FC<AllStarVotesProps> = ({ allStar }) => {
  const { state } = useGame();
  const teams = state.teams;

  if (!allStar?.votes?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-4">
          <Target size={24} className="text-slate-600"/>
        </div>
        <h3 className="text-lg font-bold text-white mb-2">
          Voting is Live
        </h3>
        <p className="text-slate-400 text-sm max-w-xs">
          Fans are currently casting their ballots. 
          Advance the day to see the first wave of results!
        </p>
      </div>
    );
  }

  const maxVotes = Math.max(...allStar.votes.map((v: any) => v.votes));

  const VoteList = ({ players, color, title }: { players: any[], color: string, title: string }) => (
    <div className="space-y-3">
      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-1">
        {title}
      </div>
      <div className="space-y-2">
        {players.map((v, i) => {
          const team = teams.find(t => t.abbrev === v.teamAbbrev);
          const teamId = v.teamNbaId || (team ? extractTeamId(team.logoUrl, v.teamAbbrev) : null) || 1610612737;
          const teamColor = team?.colors?.[0] || '#64748b';

          return (
            <div key={v.playerId} className="flex items-center gap-3 group">
              <span className="text-[10px] text-slate-500 w-4 text-right font-mono shrink-0">
                {i + 1}
              </span>
              
              <div className="relative shrink-0">
                <div 
                  className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border-2"
                  style={{ borderColor: `${teamColor}40` }}
                >
                  <img
                    src={(() => { const pl = state.players?.find((p: any) => p.internalId === v.playerId); return (pl && getPlayerImage(pl)) || getPlayerHeadshot(v.playerId, v.nbaId); })()}
                    className="w-full h-full object-cover"
                    alt={v.playerName}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!img.dataset.triedCdn) {
                        img.dataset.triedCdn = '1';
                        img.src = getPlayerHeadshot(v.playerId, v.nbaId);
                      } else {
                        img.src = `https://picsum.photos/seed/${v.playerId}/100/100`;
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold text-slate-200 truncate">
                      {v.playerName}
                    </span>
                    <img 
                      src={getTeamLogo(teamId)}
                      className="w-3.5 h-3.5 object-contain shrink-0"
                      alt={v.teamAbbrev}
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-[9px] text-slate-500 uppercase font-bold">
                      {v.teamAbbrev}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {v.votes.toLocaleString()}
                  </span>
                </div>
                <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className="h-1 rounded-full transition-all duration-1000"
                    style={{
                      width: `${(v.votes / maxVotes) * 100}%`,
                      background: color,
                      opacity: 1 - (i * 0.05)
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderConference = (conf: 'East' | 'West', logo: string) => {
    const guards = allStar.votes
      .filter((v: any) => v.conference === conf && v.category === 'Guard')
      .sort((a: any, b: any) => b.votes - a.votes)
      .slice(0, 10);
    const frontcourt = allStar.votes
      .filter((v: any) => v.conference === conf && v.category === 'Frontcourt')
      .sort((a: any, b: any) => b.votes - a.votes)
      .slice(0, 10);

    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <img src={logo} className="w-6 h-6 object-contain" alt={conf} />
          <h3 className="text-lg font-black text-white uppercase tracking-tight">
            {conf}ern Conference
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          <VoteList players={frontcourt} color="#f59e0b" title="Frontcourt" />
          <VoteList players={guards} color="#3b82f6" title="Guards" />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-16">
      {renderConference('East', "https://static.wikia.nocookie.net/logopedia/images/8/89/Eastern_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191748")}
      {renderConference('West', "https://static.wikia.nocookie.net/logopedia/images/0/06/Western_Conference_%28NBA%29_1993.svg/revision/latest?cb=20181220191726")}
    </div>
  );
};
