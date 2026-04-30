import React from 'react';
import type { LeagueStats } from '../../../../types';
import { ruleValue } from './rulesDefaults';
import { AllStarGameSection } from './all-star/AllStarGameSection';
import { RisingStarsSection } from './all-star/RisingStarsSection';
import { CelebrityGameSection } from './all-star/CelebrityGameSection';
import { AllStarEventsSection } from './all-star/AllStarEventsSection';

interface AllStarTabProps {
    rules: LeagueStats;
    setRule: <K extends keyof LeagueStats>(key: K, value: LeagueStats[K]) => void;
}

/** Build a flat-prop pair `(value, set)` from a single rules key. The leaf
 *  sub-section components (AllStarGameSection etc.) keep their existing flat
 *  prop API; the binding lives here instead of being threaded through ~80 lines
 *  of prop interfaces. */
function bind<K extends keyof LeagueStats>(
    rules: LeagueStats,
    setRule: <Kk extends keyof LeagueStats>(k: Kk, v: LeagueStats[Kk]) => void,
    key: K,
) {
    return {
        value: ruleValue(rules, key),
        set: (v: LeagueStats[K]) => setRule(key, v),
    };
}

export const AllStarTab: React.FC<AllStarTabProps> = ({ rules, setRule }) => {
    const b = <K extends keyof LeagueStats>(key: K) => bind(rules, setRule, key);

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
                        allStarGameEnabled={b('allStarGameEnabled').value as boolean}              setAllStarGameEnabled={b('allStarGameEnabled').set as any}
                        allStarFormat={b('allStarFormat').value as string}                          setAllStarFormat={b('allStarFormat').set as any}
                        allStarTeams={b('allStarTeams').value as number}                            setAllStarTeams={b('allStarTeams').set as any}
                        allStarMirrorLeagueRules={b('allStarMirrorLeagueRules').value as boolean}  setAllStarMirrorLeagueRules={b('allStarMirrorLeagueRules').set as any}
                        allStarGameFormat={b('allStarGameFormat').value as any}                    setAllStarGameFormat={b('allStarGameFormat').set as any}
                        allStarQuarterLength={b('allStarQuarterLength').value as number}            setAllStarQuarterLength={b('allStarQuarterLength').set as any}
                        allStarNumQuarters={b('allStarNumQuarters').value as number}                setAllStarNumQuarters={b('allStarNumQuarters').set as any}
                        allStarOvertimeDuration={b('allStarOvertimeDuration').value as number}      setAllStarOvertimeDuration={b('allStarOvertimeDuration').set as any}
                        allStarOvertimeTargetPoints={b('allStarOvertimeTargetPoints').value as number} setAllStarOvertimeTargetPoints={b('allStarOvertimeTargetPoints').set as any}
                        allStarShootoutRounds={b('allStarShootoutRounds').value as number}          setAllStarShootoutRounds={b('allStarShootoutRounds').set as any}
                        allStarOvertimeType={b('allStarOvertimeType').value as string}              setAllStarOvertimeType={b('allStarOvertimeType').set as any}
                        allStarMaxOvertimesEnabled={b('allStarMaxOvertimesEnabled').value as boolean} setAllStarMaxOvertimesEnabled={b('allStarMaxOvertimesEnabled').set as any}
                        allStarMaxOvertimes={b('allStarMaxOvertimes').value as number}              setAllStarMaxOvertimes={b('allStarMaxOvertimes').set as any}
                        allStarOvertimeTieBreaker={b('allStarOvertimeTieBreaker').value as string}  setAllStarOvertimeTieBreaker={b('allStarOvertimeTieBreaker').set as any}
                    />
                    <RisingStarsSection
                        risingStarsEnabled={b('risingStarsEnabled').value as boolean}              setRisingStarsEnabled={b('risingStarsEnabled').set as any}
                        risingStarsFormat={b('risingStarsFormat').value as string}                  setRisingStarsFormat={b('risingStarsFormat').set as any}
                        risingStarsMirrorLeagueRules={b('risingStarsMirrorLeagueRules').value as boolean} setRisingStarsMirrorLeagueRules={b('risingStarsMirrorLeagueRules').set as any}
                        risingStarsQuarterLength={b('risingStarsQuarterLength').value as number}    setRisingStarsQuarterLength={b('risingStarsQuarterLength').set as any}
                        risingStarsEliminationEndings={b('risingStarsEliminationEndings').value as boolean} setRisingStarsEliminationEndings={b('risingStarsEliminationEndings').set as any}
                    />
                    <CelebrityGameSection
                        celebrityGameEnabled={b('celebrityGameEnabled').value as boolean}          setCelebrityGameEnabled={b('celebrityGameEnabled').set as any}
                        celebrityGameMirrorLeagueRules={b('celebrityGameMirrorLeagueRules').value as boolean} setCelebrityGameMirrorLeagueRules={b('celebrityGameMirrorLeagueRules').set as any}
                    />
                </div>

                <div className="space-y-8">
                    <AllStarEventsSection
                        allStarDunkContest={b('allStarDunkContest').value as boolean}              setAllStarDunkContest={b('allStarDunkContest').set as any}
                        allStarDunkContestPlayers={b('allStarDunkContestPlayers').value as number}  setAllStarDunkContestPlayers={b('allStarDunkContestPlayers').set as any}
                        allStarThreePointContest={b('allStarThreePointContest').value as boolean}  setAllStarThreePointContest={b('allStarThreePointContest').set as any}
                        allStarThreePointContestPlayers={b('allStarThreePointContestPlayers').value as number} setAllStarThreePointContestPlayers={b('allStarThreePointContestPlayers').set as any}
                        allStarShootingStars={b('allStarShootingStars').value as boolean}          setAllStarShootingStars={b('allStarShootingStars').set as any}
                        allStarShootingStarsMode={b('allStarShootingStarsMode').value as any}      setAllStarShootingStarsMode={b('allStarShootingStarsMode').set as any}
                        allStarShootingStarsTeams={b('allStarShootingStarsTeams').value as number}  setAllStarShootingStarsTeams={b('allStarShootingStarsTeams').set as any}
                        allStarShootingStarsPlayersPerTeam={b('allStarShootingStarsPlayersPerTeam').value as number} setAllStarShootingStarsPlayersPerTeam={b('allStarShootingStarsPlayersPerTeam').set as any}
                        allStarShootingStarsTotalPlayers={b('allStarShootingStarsTotalPlayers').value as number} setAllStarShootingStarsTotalPlayers={b('allStarShootingStarsTotalPlayers').set as any}
                        allStarSkillsChallenge={b('allStarSkillsChallenge').value as boolean}      setAllStarSkillsChallenge={b('allStarSkillsChallenge').set as any}
                        allStarSkillsChallengeMode={b('allStarSkillsChallengeMode').value as any}  setAllStarSkillsChallengeMode={b('allStarSkillsChallengeMode').set as any}
                        allStarSkillsChallengeTeams={b('allStarSkillsChallengeTeams').value as number} setAllStarSkillsChallengeTeams={b('allStarSkillsChallengeTeams').set as any}
                        allStarSkillsChallengePlayersPerTeam={b('allStarSkillsChallengePlayersPerTeam').value as number} setAllStarSkillsChallengePlayersPerTeam={b('allStarSkillsChallengePlayersPerTeam').set as any}
                        allStarSkillsChallengeTotalPlayers={b('allStarSkillsChallengeTotalPlayers').value as number} setAllStarSkillsChallengeTotalPlayers={b('allStarSkillsChallengeTotalPlayers').set as any}
                        allStarHorse={b('allStarHorse').value as boolean}                          setAllStarHorse={b('allStarHorse').set as any}
                        allStarHorseParticipants={b('allStarHorseParticipants').value as number}    setAllStarHorseParticipants={b('allStarHorseParticipants').set as any}
                        allStarOneOnOneEnabled={b('allStarOneOnOneEnabled').value as boolean}      setAllStarOneOnOneEnabled={b('allStarOneOnOneEnabled').set as any}
                        allStarOneOnOneParticipants={b('allStarOneOnOneParticipants').value as number} setAllStarOneOnOneParticipants={b('allStarOneOnOneParticipants').set as any}
                    />
                </div>
            </div>
        </div>
    );
};
