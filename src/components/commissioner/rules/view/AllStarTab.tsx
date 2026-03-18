import React from 'react';
import { AllStarGameSection } from './all-star/AllStarGameSection';
import { RisingStarsSection } from './all-star/RisingStarsSection';
import { CelebrityGameSection } from './all-star/CelebrityGameSection';
import { AllStarEventsSection } from './all-star/AllStarEventsSection';

interface AllStarTabProps {
    allStarGameEnabled: boolean;
    setAllStarGameEnabled: (val: boolean) => void;
    allStarFormat: string;
    setAllStarFormat: (val: string) => void;
    allStarTeams: number;
    setAllStarTeams: (val: number) => void;
    allStarDunkContest: boolean;
    setAllStarDunkContest: (val: boolean) => void;
    allStarDunkContestPlayers: number;
    setAllStarDunkContestPlayers: (val: number) => void;
    allStarThreePointContest: boolean;
    setAllStarThreePointContest: (val: boolean) => void;
    allStarThreePointContestPlayers: number;
    setAllStarThreePointContestPlayers: (val: number) => void;
    allStarShootingStars: boolean;
    setAllStarShootingStars: (val: boolean) => void;
    allStarShootingStarsMode: 'individual' | 'team';
    setAllStarShootingStarsMode: (val: 'individual' | 'team') => void;
    allStarShootingStarsTeams: number;
    setAllStarShootingStarsTeams: (val: number) => void;
    allStarShootingStarsPlayersPerTeam: number;
    setAllStarShootingStarsPlayersPerTeam: (val: number) => void;
    allStarShootingStarsTotalPlayers: number;
    setAllStarShootingStarsTotalPlayers: (val: number) => void;
    allStarSkillsChallenge: boolean;
    setAllStarSkillsChallenge: (val: boolean) => void;
    allStarSkillsChallengeMode: 'individual' | 'team';
    setAllStarSkillsChallengeMode: (val: 'individual' | 'team') => void;
    allStarSkillsChallengeTeams: number;
    setAllStarSkillsChallengeTeams: (val: number) => void;
    allStarSkillsChallengePlayersPerTeam: number;
    setAllStarSkillsChallengePlayersPerTeam: (val: number) => void;
    allStarSkillsChallengeTotalPlayers: number;
    setAllStarSkillsChallengeTotalPlayers: (val: number) => void;
    allStarHorse: boolean;
    setAllStarHorse: (val: boolean) => void;
    allStarHorseParticipants: number;
    setAllStarHorseParticipants: (val: number) => void;
    allStarOneOnOneEnabled: boolean;
    setAllStarOneOnOneEnabled: (val: boolean) => void;
    allStarOneOnOneParticipants: number;
    setAllStarOneOnOneParticipants: (val: number) => void;
    allStarMirrorLeagueRules: boolean;
    setAllStarMirrorLeagueRules: (val: boolean) => void;
    allStarGameFormat: 'timed' | 'target_score';
    setAllStarGameFormat: (val: 'timed' | 'target_score') => void;
    allStarQuarterLength: number;
    setAllStarQuarterLength: (val: number) => void;
    allStarNumQuarters: number;
    setAllStarNumQuarters: (val: number) => void;
    allStarOvertimeDuration: number;
    setAllStarOvertimeDuration: (val: number) => void;
    allStarOvertimeTargetPoints: number;
    setAllStarOvertimeTargetPoints: (val: number) => void;
    allStarShootoutRounds: number;
    setAllStarShootoutRounds: (val: number) => void;
    allStarOvertimeType: string;
    setAllStarOvertimeType: (val: string) => void;
    allStarMaxOvertimesEnabled: boolean;
    setAllStarMaxOvertimesEnabled: (val: boolean) => void;
    allStarMaxOvertimes: number;
    setAllStarMaxOvertimes: (val: number) => void;
    allStarOvertimeTieBreaker: string;
    setAllStarOvertimeTieBreaker: (val: string) => void;
    // Rising Stars
    risingStarsEnabled: boolean;
    setRisingStarsEnabled: (val: boolean) => void;
    risingStarsFormat: string;
    setRisingStarsFormat: (val: string) => void;
    risingStarsMirrorLeagueRules: boolean;
    setRisingStarsMirrorLeagueRules: (val: boolean) => void;
    // Celebrity Game
    celebrityGameEnabled: boolean;
    setCelebrityGameEnabled: (val: boolean) => void;
    celebrityGameMirrorLeagueRules: boolean;
    setCelebrityGameMirrorLeagueRules: (val: boolean) => void;
}

export const AllStarTab: React.FC<AllStarTabProps> = (props) => {
    return (
        <div className="space-y-12">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">All-Star Weekend</h1>
                <p className="text-xs text-slate-500 font-medium max-w-2xl">
                    Configure the league's mid-season showcase. From the main event to the satirical spectacles, define how the stars align.
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="space-y-8">
                    <AllStarGameSection 
                        allStarGameEnabled={props.allStarGameEnabled}
                        setAllStarGameEnabled={props.setAllStarGameEnabled}
                        allStarFormat={props.allStarFormat}
                        setAllStarFormat={props.setAllStarFormat}
                        allStarTeams={props.allStarTeams}
                        setAllStarTeams={props.setAllStarTeams}
                        allStarMirrorLeagueRules={props.allStarMirrorLeagueRules}
                        setAllStarMirrorLeagueRules={props.setAllStarMirrorLeagueRules}
                        allStarGameFormat={props.allStarGameFormat}
                        setAllStarGameFormat={props.setAllStarGameFormat}
                        allStarQuarterLength={props.allStarQuarterLength}
                        setAllStarQuarterLength={props.setAllStarQuarterLength}
                        allStarNumQuarters={props.allStarNumQuarters}
                        setNumQuarters={props.setAllStarNumQuarters}
                        allStarOvertimeDuration={props.allStarOvertimeDuration}
                        setAllStarOvertimeDuration={props.setAllStarOvertimeDuration}
                        allStarOvertimeTargetPoints={props.allStarOvertimeTargetPoints}
                        setAllStarOvertimeTargetPoints={props.setAllStarOvertimeTargetPoints}
                        allStarShootoutRounds={props.allStarShootoutRounds}
                        setShootoutRounds={props.setAllStarShootoutRounds}
                        allStarOvertimeType={props.allStarOvertimeType}
                        setAllStarOvertimeType={props.setAllStarOvertimeType}
                        allStarMaxOvertimesEnabled={props.allStarMaxOvertimesEnabled}
                        setAllStarMaxOvertimesEnabled={props.setAllStarMaxOvertimesEnabled}
                        allStarMaxOvertimes={props.allStarMaxOvertimes}
                        setMaxOvertimes={props.setAllStarMaxOvertimes}
                        allStarOvertimeTieBreaker={props.allStarOvertimeTieBreaker}
                        setAllStarOvertimeTieBreaker={props.setAllStarOvertimeTieBreaker}
                    />
                    <RisingStarsSection 
                        risingStarsEnabled={props.risingStarsEnabled}
                        setRisingStarsEnabled={props.setRisingStarsEnabled}
                        risingStarsFormat={props.risingStarsFormat}
                        setRisingStarsFormat={props.setRisingStarsFormat}
                        risingStarsMirrorLeagueRules={props.risingStarsMirrorLeagueRules}
                        setRisingStarsMirrorLeagueRules={props.setRisingStarsMirrorLeagueRules}
                    />
                    <CelebrityGameSection 
                        celebrityGameEnabled={props.celebrityGameEnabled}
                        setCelebrityGameEnabled={props.setCelebrityGameEnabled}
                        celebrityGameMirrorLeagueRules={props.celebrityGameMirrorLeagueRules}
                        setCelebrityGameMirrorLeagueRules={props.setCelebrityGameMirrorLeagueRules}
                    />
                </div>

                <div className="space-y-8">
                    <AllStarEventsSection 
                        allStarDunkContest={props.allStarDunkContest}
                        setAllStarDunkContest={props.setAllStarDunkContest}
                        allStarDunkContestPlayers={props.allStarDunkContestPlayers}
                        setAllStarDunkContestPlayers={props.setAllStarDunkContestPlayers}
                        allStarThreePointContest={props.allStarThreePointContest}
                        setAllStarThreePointContest={props.setAllStarThreePointContest}
                        allStarThreePointContestPlayers={props.allStarThreePointContestPlayers}
                        setAllStarThreePointContestPlayers={props.setAllStarThreePointContestPlayers}
                        allStarShootingStars={props.allStarShootingStars}
                        setAllStarShootingStars={props.setAllStarShootingStars}
                        allStarShootingStarsMode={props.allStarShootingStarsMode}
                        setAllStarShootingStarsMode={props.setAllStarShootingStarsMode}
                        allStarShootingStarsTeams={props.allStarShootingStarsTeams}
                        setAllStarShootingStarsTeams={props.setAllStarShootingStarsTeams}
                        allStarShootingStarsPlayersPerTeam={props.allStarShootingStarsPlayersPerTeam}
                        setAllStarShootingStarsPlayersPerTeam={props.setAllStarShootingStarsPlayersPerTeam}
                        allStarShootingStarsTotalPlayers={props.allStarShootingStarsTotalPlayers}
                        setAllStarShootingStarsTotalPlayers={props.setAllStarShootingStarsTotalPlayers}
                        allStarSkillsChallenge={props.allStarSkillsChallenge}
                        setAllStarSkillsChallenge={props.setAllStarSkillsChallenge}
                        allStarSkillsChallengeMode={props.allStarSkillsChallengeMode}
                        setAllStarSkillsChallengeMode={props.setAllStarSkillsChallengeMode}
                        allStarSkillsChallengeTeams={props.allStarSkillsChallengeTeams}
                        setAllStarSkillsChallengeTeams={props.setAllStarSkillsChallengeTeams}
                        allStarSkillsChallengePlayersPerTeam={props.allStarSkillsChallengePlayersPerTeam}
                        setAllStarSkillsChallengePlayersPerTeam={props.setAllStarSkillsChallengePlayersPerTeam}
                        allStarSkillsChallengeTotalPlayers={props.allStarSkillsChallengeTotalPlayers}
                        setAllStarSkillsChallengeTotalPlayers={props.setAllStarSkillsChallengeTotalPlayers}
                        allStarHorse={props.allStarHorse}
                        setAllStarHorse={props.setAllStarHorse}
                        allStarHorseParticipants={props.allStarHorseParticipants}
                        setAllStarHorseParticipants={props.setAllStarHorseParticipants}
                        allStarOneOnOneEnabled={props.allStarOneOnOneEnabled}
                        setAllStarOneOnOneEnabled={props.setAllStarOneOnOneEnabled}
                        allStarOneOnOneParticipants={props.allStarOneOnOneParticipants}
                        setAllStarOneOnOneParticipants={props.setAllStarOneOnOneParticipants}
                    />
                </div>
            </div>
        </div>
    );
};
